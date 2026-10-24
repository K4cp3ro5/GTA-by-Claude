/* ---------------------------------------------------------------
   18. NPC
   --------------------------------------------------------------- */
const _npAxis = new CANNON.Vec3(0, 1, 0);
/* AI aut dalej niż NPC_LOD_DIST od gracza liczone co drugą klatkę (z dt skumulowanym) — ciało
   kinematyczne jedzie w tym czasie dalej z ostatnią prędkością */
let NPC_LOD_DIST = 220, _npcFrame = 0;
/* siatka sąsiedztwa (komórki 24 m, budowana co klatkę z n.pos i p.pos): npcConflict, npcPathSweep i piesi przed maską sprawdzają
   tylko auta i pieszych z komórek w zasięgu (wcześniej każdy z każdym — przy 160 autach i 150 pieszych ~9 ms na klatkę).
   Kandydaci w kolejności list (indeksy rosnąco), a promień ma zapas na ruch i przyspieszenie w tej klatce (LOD: pozycja sprzed
   do 0.2 s), więc wynik jest identyczny jak przy pełnym przeglądzie. */
const NGRID = { C: 24, car: new Map(), ped: new Map(), ver: -1, vmax: 0, pirV: 0, near: [], peds: [] };
function _ngFill(map, list){
  for (const L of map.values()) L.length = 0;
  const C = NGRID.C;
  for (let i = 0; i < list.length; i++){
    const p = list[i].pos, key = Math.floor(p.x / C) * 65536 + Math.floor(p.y / C);
    let L = map.get(key); if (!L) map.set(key, L = []); L.push(i);
  }
}
const _ngCmp = (a, b) => a - b;
function _ngQuery(map, x, z, r, out){
  out.length = 0;
  const C = NGRID.C, x0 = Math.floor((x - r) / C), x1 = Math.floor((x + r) / C), z0 = Math.floor((z - r) / C), z1 = Math.floor((z + r) / C);
  for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++){ const L = map.get(cx * 65536 + cz); if (L) for (let k = 0; k < L.length; k++) out.push(L[k]); }
  if (out.length > 1) out.sort(_ngCmp);
  return out;
}
function npcGridBuild(){
  _ngFill(NGRID.car, npcs); NGRID.ver = npcsVer;
  let vmax = 0, pirV = 0;
  for (const n of npcs){ if (n.speed > vmax) vmax = n.speed; if (n.profile === 'pirat' && n.speed > pirV) pirV = n.speed; }
  NGRID.vmax = vmax; NGRID.pirV = pirV;
}
/* auta, które npcConflict / npcPathSweep mogą uwzględnić (odległość progu z npcConflict + 20 m zapasu) */
function npcNearCars(n){
  if (NGRID.ver !== npcsVer) npcGridBuild();
  const r = n.profile === 'pirat' ? Math.max(16, n.speed * 2, NGRID.vmax * 2.5) : Math.max(16, NGRID.pirV * 2.5);
  return _ngQuery(NGRID.car, n.pos.x, n.pos.y, r + 20, NGRID.near);
}
function updateNpcs(dt){
  _npcFrame++;
  npcGridBuild(); _ngFill(NGRID.ped, Pedestrians.list);
  const pp = mode === 'car' ? chassisBody.position : player.body.position;
  const honk = mode === 'car' && (driving.livery ? driving.siren : down('horn'));   // sygnał skradzionego pojazdu służb działa jak klakson
  for (let i = 0; i < npcs.length; i++){
    const n = npcs[i];
    if (n.cop && n.cop.role !== 'patrol'){ policeCarStep(n, dt); continue; }      // radiowóz w pościgu / szukaniu (police.js)
    n.lodAcc = (n.lodAcc || 0) + dt;
    /* LOD tylko na swobodnym odcinku: nie przy skrzyżowaniu, na rondzie, przy objeździe / zmianie pasa ani gdy auto przed czymś hamuje */
    const free = !n.lat && !(n.rb >= 0) && !n.why && !(_nearAxis(n.pos.x) < ROAD_H + 14 && _nearAxis(n.pos.y) < ROAD_H + 14);
    if (free && (_npcFrame + n.id) % 2 && Math.hypot(n.pos.x - pp.x, n.pos.y - pp.z) > NPC_LOD_DIST) continue;
    const ndt = Math.min(n.lodAcc, 0.12); n.lodAcc = 0;
    updateNpc(n, i, ndt, honk);
  }
}
function updateNpc(n, i, dt, honk){
  {

    /* ciało kinematyczne jest źródłem prawdy — model i logika idą za nim */
    n.pos.set(n.body.position.x, n.body.position.z);

    const tgt = n.path[n.wp], prv = n.path[(n.wp - 1 + n.path.length) % n.path.length];
    /* wysokość jezdni pod autem (estakady, łącznice): między poprzednim a bieżącym punktem trasy */
    {
      const sx = tgt.x - prv.x, sz = tgt.z - prv.z, sl2 = sx*sx + sz*sz || 1;
      const t = clamp(((n.pos.x - prv.x)*sx + (n.pos.y - prv.z)*sz) / sl2, 0, 1);
      n.y = lerp(prv.y || 0, tgt.y || 0, t);
      n.slope = ((tgt.y || 0) - (prv.y || 0)) / Math.sqrt(sl2);
    }
    n.body.position.y = n.y + n.halfH + 0.1;
    n.mesh.position.set(n.pos.x, n.y, n.pos.y);
    n.mesh.rotation.order = 'YXZ';
    n.mesh.rotation.set(-Math.atan(n.slope), n.heading, n.hitT > 0 && n.type === 'bike' ? n.mesh.rotation.z : 0);   // nos w górę pod górę; rowerzysta leży po kolizji
    const low = n.y < 1;                                                     // auto na poziomie ulic (nie na estakadzie)
    /* rondo: 'approach' = cel to punkt trasy ronda, auto jeszcze przed pasem okrężnym; 'ring' = wlot, rondo, wylot */
    if (tgt.rb !== undefined){
      const rp = ROUNDABOUT_PTS[tgt.rb], rcx = L(rp[0]), rcz = L(rp[1]);
      n.rb = tgt.rb; n.rbDist = Math.hypot(n.pos.x - rcx, n.pos.y - rcz);
      n.rbPhase = (tgt.k === 'in' && n.rbDist > RB.commit) ? 'approach' : 'ring';
      if (n.rbPhase === 'approach'){
        const ax = n.pos.x - rcx, az = n.pos.y - rcz;
        n.rbArm = Math.abs(ax) > Math.abs(az) ? { x: Math.sign(ax), z: 0 } : { x: 0, z: Math.sign(az) };
      }
    } else { n.rb = -1; n.rbPhase = null; }
    let dx = tgt.x - n.pos.x, dz = tgt.z - n.pos.y;
    let d = Math.hypot(dx, dz);
    /* przesunięcie boczne toru (objazd przeszkody, zmiana pasa na autostradzie): n.lat m w lewo, dochodzi do n.latT */
    if (n.lat || n.latT){
      n.lat = approach(n.lat || 0, n.latT || 0, (n.latRate || 1.0) * dt);
      if (Math.abs(n.lat) < 0.01 && !n.latT) n.lat = 0;
    }
    if (n.lat){
      const sx = tgt.x - prv.x, sz = tgt.z - prv.z, sl = Math.hypot(sx, sz) || 1;
      const along = ((n.pos.x - prv.x) * sx + (n.pos.y - prv.z) * sz) / sl;
      if (along > sl - 1.0 - Math.abs(n.lat)){ n.wp = (n.wp + 1) % n.path.length; return; }   // po wewnętrznej narożnika rzut nie dochodzi do końca odcinka
      { const nx = n.path[(n.wp + 1) % n.path.length], ux2 = nx.x - tgt.x, uz2 = nx.z - tgt.z, l2 = Math.hypot(ux2, uz2) || 1;
        if (along > sl - 8 && ((n.pos.x - tgt.x) * ux2 + (n.pos.y - tgt.z) * uz2) / l2 > 0.5){ n.wp = (n.wp + 1) % n.path.length; return; } }   // już na następnym odcinku (zakręt po zewnętrznej)
      const latAct = ((n.pos.x - prv.x) * sz - (n.pos.y - prv.z) * sx) / sl;          // faktyczne przesunięcie w lewo od toru
      /* objazd: punkt celowania tuż przed tyłem przeszkody (ostry skręt z bliska), pełzanie, dopóki auto się nie odsunie */
      /* pirat w mieście: cel najwyżej 10 m przed autem — dalszy punkt (przy 50 m/s ~60 m) leżał za narożnikiem i auto ścinało kwartał przez budynki */
      const La = n.byp ? clamp(n.byp.rear - n.byp.s - 0.3, 1.2, 8) : Math.min(Math.max(8, n.speed * 1.2), n.profile === 'pirat' && !tgt.hwy ? 10 : Infinity);
      n.bypCreep = !!n.byp && latAct < (n.latT || 0) - 0.4;
      const aim = npcAim(n, prv, tgt, along, La);
      dx = aim.x - n.pos.x; dz = aim.z - n.pos.y; d = Math.hypot(dx, dz) || 1;
    } else if (d < 2.2){
      n.wp = (n.wp + 1) % n.path.length;
      return;
    }
    dx /= d; dz /= d;

    /* detekcja przeszkody przed maską */
    let block = false, why = '';                  // why = przyczyna hamowania (diagnostyka: test/sim.js)
    const look = Math.max(11, n.speed * 1.2);
    const checkPoint = (px, pz, radius, py) => {
      if (py !== undefined && Math.abs(py - n.y) > 2.5) return false;       // inny poziom (pod / nad estakadą)
      const ox = px - n.pos.x, oz = pz - n.pos.y;
      const ahead = ox * dx + oz * dz;
      if (ahead < 0.5 || ahead > look) return false;
      const lat = Math.abs(ox * -dz + oz * dx);
      return lat < 2.0 + radius;
    };
    /* auto gracza i zaparkowane auta: prawdziwy obrys (prostokąt wg typu) w korytarzu przed maską;
       stojące = przeszkoda do objechania (obst) */
    let obst = null;
    {
      const T = CAR_TYPES[carType], cv = chassisBody.velocity;
      if (Math.abs(chassisBody.position.y - T.restY - n.y) < 2.5){
        const o = rectInCorridor(n, dx, dz, chassisBody.position.x, chassisBody.position.z, carYaw(), T.half[0], T.half[2], look + 2);
        if (o){ block = true; why = 'gracz-auto'; if (Math.hypot(cv.x, cv.z) < 0.5) obst = o; }
      }
    }
    if (!block && mode === 'foot' &&
        checkPoint(player.body.position.x, player.body.position.z, 0.5, player.body.position.y - 0.9)){ block = true; why = 'gracz'; }
    if (!block) for (const q of parkedCars){
      if (Math.abs(q.y - n.y) > 2.5) continue;
      const T = CAR_TYPES[q.type], o = rectInCorridor(n, dx, dz, q.x, q.z, q.heading, T.half[0], T.half[2], 4 + n.speed * 1.2);   // staje 4 m przed (miejsce na objazd)
      if (o){ block = true; why = 'atrapa'; obst = o; break; }
    }
    /* piesi na jezdni (na przejściu albo leżący) — auto staje przed nimi */
    const pir = n.profile === 'pirat', PL = Pedestrians.list;
    const nearP = low ? _ngQuery(NGRID.ped, n.pos.x, n.pos.y, look + 4, NGRID.peds) : NGRID.peds;     // piesi w zasięgu sprawdzenia przed maską
    if (!block && low && !pir) for (let q = 0; q < nearP.length; q++){ const p = PL[nearP[q]]; if (pedOnRoad(p) && checkPoint(p.pos.x, p.pos.y, 0.7)){ block = true; why = 'pieszy'; break; } }
    /* pirat nie hamuje przed pieszymi — potrąca tych, którzy są na jezdni przed maską */
    if (pir && low && n.speed > 3) for (let q = 0; q < nearP.length; q++){ const p = PL[nearP[q]];
      if (p.state === 'down' || !pedOnRoad(p)) continue;
      const ox = p.pos.x - n.pos.x, oz = p.pos.y - n.pos.y, a = ox * dx + oz * dz;
      if (a > 0 && a < (n.halfL || 2.05) + 0.6 && Math.abs(ox * dz - oz * dx) < (n.halfW || 0.93) + 0.4){ Pedestrians.hit(p, n.speed + 2); n.pedHits = (n.pedHits || 0) + 1; }
    }
    /* przejście, po którym ktoś właśnie idzie (także po drugiej połowie jezdni): nie wjeżdżam na pasy */
    if (!block && low && !pir && zebraBusyAhead(n, dx, dz)){ block = true; why = 'zebra'; }
    /* auta NPC (npcConflict): jazda za autem w tym samym kierunku (cap), a przy ruchu poprzecznym
       punkt kolizji torów — auto, które już jest w strefie konfliktu, ma pierwszeństwo; gdy oba
       dopiero dojeżdżają, ustępuje to, które ma drugie po PRAWEJ (reguła prawej ręki). Bezpiecznik
       na zakleszczenie: po 9 s stania przed autem, które też stoi, przez 2.5 s pomijana jest sama
       reguła pierwszeństwa (auta w strefie konfliktu i przed maską dalej zatrzymują). */
    let blockedByNpc = false, cap = Infinity;     // cap = prędkość auta jadącego przed nami w tym samym kierunku
    if (!block){
      const ignoring = n.ignoreNpcT > 0, near = npcNearCars(n);
      for (let q = 0; q < near.length; q++){
        const k = near[q];
        if (k === i) continue;
        const r = npcConflict(n, npcs[k], dx, dz, ignoring);
        if (r === true){ block = true; blockedByNpc = npcs[k].speed < 0.3; why = 'npc:' + npcs[k].id; break; }
        if (r < cap) cap = r;
      }
    }
    /* tor przez najbliższe ~8 m (także za zakrętem): stojące auto w miejscu, gdzie znajdzie się moje nadwozie — stop
       (logika przecięć celowo pomija auta stojące; bez tego auto skręcało prosto w auto czekające w skrzyżowaniu) */
    if (!block){ const m = npcPathSweep(n, dx, dz); if (m){ block = true; why = 'tor:' + m.id; } }
    if (n.ignoreNpcT > 0) n.ignoreNpcT -= dt;
    n.waitT = (blockedByNpc && n.speed < 0.3) ? (n.waitT || 0) + dt : 0;
    if (n.waitT > 9){ n.ignoreNpcT = 2.5; n.waitT = 0; }
    if (!block && low && !pir && redLightAhead(n.pos.x, n.pos.y, dx, dz)){ block = true; why = 'światło'; }   // pirat: na czerwonym też jedzie
    /* ruszanie na zielonym z opóźnieniem zależnym od kierowcy (ostrożny dłużej, dynamiczny od razu) */
    if (n.wasLight && why !== 'światło') n.reactT = n.react || 0;
    n.wasLight = why === 'światło';
    if (n.reactT > 0){ n.reactT -= dt; if (!block){ block = true; why = 'reakcja'; } }
    /* stłuczka z autem gracza: postój 3–5 s ze światłami awaryjnymi */
    if (n.hitT > 0){
      n.hitT -= dt; block = true; why = 'kolizja';
      if (n.type === 'bike'){ n.mesh.rotation.z = Math.min(1.35, (n.mesh.rotation.z || 0) + dt * 5); if (n.hitT <= 0) n.mesh.rotation.z = 0; }
      if (n.haz) n.haz.color.setHex(Math.floor(n.hitT * 2.6) % 2 ? 0xffa21a : 0x3a2a0a);
      if (n.hitT <= 0) npcHazardOff(n);
    }
    if (!block && low && !pir && stopSignAhead(n, dx, dz, dt)){ block = true; why = 'STOP'; }
    if (!block && low && roundaboutYield(n)){ block = true; why = 'rondo'; }            // rondo: wjazd z ustąpieniem także dla pirata (inaczej zakleszczenia na pasie okrężnym)
    /* klakson gracza za autem stojącym > 2 s nie z powodu przepisów: rusza (pomija samą regułę pierwszeństwa) */
    n.stillT = n.speed < 0.3 ? (n.stillT || 0) + dt : 0;
    if (honk && n.stillT > 2 && !['światło', 'STOP', 'pieszy', 'zebra', 'rondo', 'kolizja', 'gracz-auto', 'gracz'].includes(why)){
      const f = chassisBody.velocity, fw = _fwdWorld, rx = n.pos.x - chassisBody.position.x, rz = n.pos.y - chassisBody.position.z;
      const a = rx * fw.x + rz * fw.z, l = Math.abs(rx * fw.z - rz * fw.x);
      if (a > 0 && a < 25 && l < 3.5){ n.ignoreNpcT = Math.max(n.ignoreNpcT || 0, 2); n.honked = (n.honked || 0) + 1; }
    }
    /* objazd przeszkody stojącej na pasie: po 3 s czekania, poza skrzyżowaniem, rondem, przejściem i estakadą */
    if (obst && n.speed < 0.3 && !n.byp){ n.obstT = (n.obstT || 0) + dt; n.obstMax = Math.max(n.obstMax || 0, n.obstT); if (n.obstT > 3) npcTryBypass(n, obst, dx, dz, tgt); }
    else if (!obst) n.obstT = 0;
    if (n.byp){
      n.byp.s += n.speed * dt;
      if (n.byp.s > n.byp.end) n.latT = 0;
      if (!n.latT && !n.lat){ n.byp = null; n.bypCreep = false; }
    }
    if (n.profile === 'pirat') npcPirate(n, dx, dz, tgt, dt);
    /* autostrada: wyprzedzanie lewym pasem i powrót na prawy (odcinki p.ovt jezdni głównej) */
    if (tgt.hwy && !n.byp){
      if (tgt.ovt) npcHwyLanes(n, dx, dz, tgt);
      else if (n.latT){ n.latT = 0; n.ovtSlow = false; }
    }
    n.blocked = block; n.why = why;
    if (n.indMeshes) npcIndicators(n, tgt, prv);
    /* rondo: ~23 km/h na pasie okrężnym, płynne zwalnianie od ~24 m przed środkiem */
    if (n.rb >= 0 && n.rbDist < 26) cap = Math.min(cap, 6.5 + Math.max(0, n.rbDist - 15) * 0.7);
    /* autostrady, łącznice, łuki: limit z punktu trasy (vmax, wygładzony tak, by zdążyć zwolnić),
       kierowcy trzymają się go z dokładnością n.obey */
    if (tgt.vmax !== undefined){
      /* na autostradzie: tempo wg kierowcy (maks. +8%), na lewym pasie odcinka wyprzedzania limit 100 km/h */
      const pir = n.profile === 'pirat';
      const f = pir ? (tgt.vmax >= HP.vmax * 0.8 ? 9 : 1.35) : tgt.hwy ? Math.min(tgt.vmax >= HP.vmax * 0.8 ? 1.05 : 1, (n.obey || 1) * (n.hwyF || 1)) : 1;   // łuki i rampy: bez naddatku (pirat: jezdnia główna bez limitu, łuki +35%)
      cap = Math.min(cap, ((n.latT > 1 || n.lat > 1) && tgt.ovt ? Math.max(tgt.vmax, HP.vmax) : tgt.vmax) * f);
    }
    if (!tgt.hwy && !pir){
      /* limit strefy (B-33, B-43, obszar zabudowany): bieżący i ~22 m przed autem, żeby hamowało przed znakiem */
      const lim0 = speedLimitAt(n.pos.x, n.pos.y), lim1 = speedLimitAt(n.pos.x + dx*22, n.pos.y + dz*22);
      const lim = Math.min(lim0 || Infinity, lim1 || Infinity);
      if (lim < Infinity) cap = Math.min(cap, lim * (n.obey || 1));
      /* skrzyżowanie z drogą z pierwszeństwem przed nami, a my na podporządkowanej (A-7/STOP): dojazd ~30 km/h */
      const pr = roadPriority(n.pos.x + dx*14, n.pos.y + dz*14);
      if (pr && (pr === 'ew') !== (Math.abs(dx) > Math.abs(dz)) && roadPriority(n.pos.x, n.pos.y) === null) cap = Math.min(cap, 8.5);
    }

    if (n.ovtSlow) cap = Math.min(cap, n.speed * 0.85);
    /* strefa włączania (z pasa zbierającego / włączania na prawy pas): auto na pasie obok albo dojeżdżające z tyłu — czekam */
    if (tgt.merge && !block){ const r = npcMergeGap(n, dx, dz); if (r === true){ block = true; why = 'włączanie'; n.blocked = true; n.why = why; } else if (r < cap) cap = r; }
    if (n.bypCreep) cap = Math.min(cap, 2.5);                     // lewy pas przed końcem odcinka: przepuść prawy
    /* strzały w pobliżu: kierowcy przyspieszają do limitu */
    if (n.panicT > 0) n.panicT -= dt;
    /* pirat: zawsze ile fabryka (i tuning) dała — hamuje tylko przed zakrętem trasy i przed przeszkodą */
    if (pir && !tgt.hwy) cap = Math.min(cap, npcCornerCap(n));
    const want = block ? 0 : Math.min(pir ? CAR_TYPES[n.type].npc.pirV : tgt.hwy ? 99 : (n.panicT > 0 ? Math.max(n.target, 13.9) : n.target), cap);
    if (pir && !block && want > n.speed){                                        // przyspieszenie ograniczone mocą (maleje z prędkością)
      const T = CAR_TYPES[n.type].npc;
      n.speed = Math.min(want, n.speed + T.pirA * (1 - 0.6 * n.speed / T.pirV) * dt);
    } else n.speed = damp(n.speed, want, (block || want < n.speed - 1) ? 5.5 : n.accel, dt);
    n.heading = angleDamp(n.heading, Math.atan2(dx, dz), n.rbPhase === 'ring' ? 8 : 5.5, dt);

    n.dirX = dx; n.dirZ = dz;
    n.body.velocity.set(dx * n.speed, 0, dz * n.speed);
    n.body.angularVelocity.set(0, 0, 0);
    n.body.quaternion.setFromAxisAngle(_npAxis, n.heading);
  }
}

/* pirat: prędkość, z której zdąży wyhamować (10 m/s²) do prędkości pokonania najbliższego narożnika trasy
   (90° ≈ 45 km/h z poślizgiem, łagodniejsze szybciej); szuka do 220 m przed autem */
function npcCornerCap(n){
  let px = n.pos.x, pz = n.pos.y, d = 0, wp = n.wp;
  let ux = n.dirX || Math.sin(n.heading), uz = n.dirZ || Math.cos(n.heading);
  for (let k = 0; k < 24 && d < 220; k++){
    const q = n.path[wp], lx = q.x - px, lz = q.z - pz, l = Math.hypot(lx, lz);
    if (l > 0.3){
      const vx = lx / l, vz = lz / l, c = clamp(ux * vx + uz * vz, -1, 1);
      if (c < 0.94){ const ang = Math.acos(c), vc = 12.5 + 45 * Math.pow(Math.max(0, 1 - ang / (Math.PI / 2)), 2); return Math.sqrt(vc * vc + 2 * 10 * Math.max(0, d - 2)); }
      ux = vx; uz = vz; d += l;
    }
    px = q.x; pz = q.z; wp = (wp + 1) % n.path.length;
  }
  return Infinity;
}
/* czy po mojej trasie (próbki co 1.5 m do 8 m) moje nadwozie zahaczy o auto stojące (v < 1 m/s) obok */
function npcPathSweep(n, dx, dz){
  let cand = null;
  const near = npcNearCars(n);
  for (let q = 0; q < near.length; q++){
    const m = npcs[near[q]];
    if (m === n || m.speed > 1 || Math.abs((m.y || 0) - n.y) > 2.5) continue;
    if (n.profile === 'pirat' && m.type === 'bike') continue;                    // pirat jedzie po rowerzyście (npcConflict go przewraca)
    if (Math.hypot(m.pos.x - n.pos.x, m.pos.y - n.pos.y) > 12) continue;
    if (m.why === 'tor:' + n.id) continue;                                   // ono czeka na mnie — jadę
    if ((m.pos.x - n.pos.x) * dx + (m.pos.y - n.pos.y) * dz < 0.5) continue;  // za mną albo obok — nie na moim torze
    (cand || (cand = [])).push(m);
  }
  if (!cand) return null;
  let x0 = n.pos.x, z0 = n.pos.y, t = 0, wp = n.wp;
  for (let seg = 0; seg < 4 && t < 8; seg++){
    const q = n.path[wp], lx = q.x - x0, lz = q.z - z0, len = Math.hypot(lx, lz) || 1, ux = lx / len, uz = lz / len;
    for (let u = 1.5; u <= len && t + u <= 8; u += 1.5){
      const px = x0 + ux * u, pz = z0 + uz * u, h = Math.atan2(ux, uz);
      for (const m of cand) if (__rectsOverlap(px, pz, h, (n.halfW || 0.93), (n.halfL || 2.05), m.pos.x, m.pos.y, m.heading, (m.halfW || 0.93), (m.halfL || 2.05))) return m;
    }
    /* narożnik trasy: nadwozie w punkcie zakrętu z kursem przed i po skręcie */
    if (t + len <= 8){ const r = n.path[(wp + 1) % n.path.length], hN = Math.atan2(r.x - q.x, r.z - q.z);
      for (const h of [Math.atan2(ux, uz), hN]) for (const m of cand) if (__rectsOverlap(q.x, q.z, h, (n.halfW || 0.93), (n.halfL || 2.05), m.pos.x, m.pos.y, m.heading, (m.halfW || 0.93), (m.halfL || 2.05))) return m; }
    t += len; x0 = q.x; z0 = q.z; wp = (wp + 1) % n.path.length;
  }
  return null;
}
/* SAT dwóch prostokątów (środek, kurs, półszerokość, półdługość) */
function __rectsOverlap(ax, az, ah, aw, al, bx, bz, bh, bw, bl){
  const axes = [ah, ah + Math.PI / 2, bh, bh + Math.PI / 2], dx = bx - ax, dz = bz - az;
  for (const h of axes){
    const ux = Math.sin(h), uz = Math.cos(h);
    const ext = (oh, w, l) => Math.abs(Math.sin(oh) * ux + Math.cos(oh) * uz) * l + Math.abs(Math.cos(oh) * ux - Math.sin(oh) * uz) * w;
    if (Math.abs(dx * ux + dz * uz) > ext(ah, aw, al) + ext(bh, bw, bl)) return false;
  }
  return true;
}
/* luka na pasie, na który się włączam (po lewej, 1.2–6 m): true = stój, liczba = maks. prędkość, Infinity = wolne */
function npcMergeGap(n, dx, dz){
  let r = Infinity;
  for (const m of npcs){
    if (m === n || Math.abs((m.y || 0) - n.y) > 2.5 || (m.dirX || 0) * dx + (m.dirZ || 0) * dz < 0.8) continue;
    const rx = m.pos.x - n.pos.x, rz = m.pos.y - n.pos.y, a = rx * dx + rz * dz, l = rx * dz - rz * dx, len = (m.halfL || 2.05) + (n.halfL || 2.05);
    if (l < 1.2 || l > 6) continue;
    if (a > -(len + Math.max(5, m.speed * 1.4)) && a < len + 1.5){ if (a > -(len + 1) && m.speed > 0.5) return true; r = Math.min(r, Math.max(2, m.speed * 0.6)); }
  }
  return r;
}
/* kierunkowskaz NPC: skręt na najbliższym narożniku trasy (≤ 28 m), zmiana pasa / objazd (n.latT), bez ronda */
function npcIndicators(n, tgt, prv){
  let ind = null;
  if (n.profile !== 'pirat' && !(n.hitT > 0)){
    if (n.latT > 0.5 && n.lat < n.latT - 0.3) ind = 'L';
    else if (n.lat > 0.3 && !n.latT) ind = 'R';
    else if (tgt.rb === undefined && Math.hypot(tgt.x - n.pos.x, tgt.z - n.pos.y) < 28){
      const nx = n.path[(n.wp + 1) % n.path.length], ux = tgt.x - prv.x, uz = tgt.z - prv.z, vx = nx.x - tgt.x, vz = nx.z - tgt.z;
      const lu = Math.hypot(ux, uz) || 1, lv = Math.hypot(vx, vz) || 1, cr = (ux * vz - uz * vx) / (lu * lv), dt2 = (ux * vx + uz * vz) / (lu * lv);
      if (Math.abs(cr) > 0.45 && dt2 < 0.9 && !nx.rb && lv > 6) ind = cr < 0 ? 'L' : 'R';
    }
  }
  n.ind = ind;
  n.indMeshes[0].visible = ind === 'L' && indBlinkOn;
  n.indMeshes[1].visible = ind === 'R' && indBlinkOn;
}
/* punkt celowania: La m wzdłuż trasy od rzutu auta (przez kolejne punkty), przesunięty w lewo o n.lat */
function npcAim(n, prv, tgt, along, La){
  let a = prv, b = tgt, wp = n.wp, s = along + La;
  for (let k = 0; k < 4; k++){
    const sx = b.x - a.x, sz = b.z - a.z, sl = Math.hypot(sx, sz) || 1;
    if (s <= sl || k === 3){ const t = Math.min(s, sl) / sl, ux = sx / sl, uz = sz / sl; return { x: a.x + sx * t + uz * n.lat, z: a.z + sz * t - ux * n.lat }; }
    s -= sl; a = b; wp = (wp + 1) % n.path.length; b = n.path[wp];
  }
}
/* prostokąt (środek, kurs h, półszerokość hw, półdługość hl) w korytarzu przed autem n (kierunek dx,dz):
   null albo zasięgi: a = wzdłuż (przód +), l = w bok (lewo +) */
function rectInCorridor(n, dx, dz, cx, cz, h, hw, hl, look){
  const f0 = Math.sin(h), f1 = Math.cos(h), r0 = f1, r1 = -f0;
  let aMin = 1e9, aMax = -1e9, lMin = 1e9, lMax = -1e9;
  for (let k = 0; k < 4; k++){
    const s0 = k < 2 ? 1 : -1, s1 = k % 2 ? 1 : -1;
    const x = cx + f0 * hl * s0 + r0 * hw * s1 - n.pos.x, z = cz + f1 * hl * s0 + r1 * hw * s1 - n.pos.y;
    const a = x * dx + z * dz, l = x * dz - z * dx;
    aMin = Math.min(aMin, a); aMax = Math.max(aMax, a); lMin = Math.min(lMin, l); lMax = Math.max(lMax, l);
  }
  const w = (n.halfW || 0.93) + 0.35, front = n.halfL || 2.05;
  return (aMax > 0.5 && aMin < front + look && lMax > -w && lMin < w) ? { aMin: aMin, aMax: aMax, lMin: lMin, lMax: lMax } : null;
}
const _nearAxis = v => { let m = 1e9; for (let i = 0; i <= GRID; i++) m = Math.min(m, Math.abs(v - L(i))); return m; };
/* objazd lewą stroną: przesunięcie = lewa krawędź przeszkody + pół auta + 0.45 m (maks. 4.2 m — reszta
   przeciwnego pasa wolna), cały odcinek objazdu poza skrzyżowaniami i bez aut z naprzeciwka */
function npcTryBypass(n, o, dx, dz, tgt){
  if (n.y > 1 || n.rb >= 0 || tgt.hwy || n.lat || n.type === 'bike') return;
  /* o.lMax liczone od auta, a n.latT od osi toru — auto stojące obok toru (np. pirat po slalomie) dolicza swoje przesunięcie */
  const prv = n.path[(n.wp - 1 + n.path.length) % n.path.length], sx = tgt.x - prv.x, sz = tgt.z - prv.z, sl = Math.hypot(sx, sz) || 1;
  const latAct = ((n.pos.x - prv.x) * sz - (n.pos.y - prv.z) * sx) / sl;
  const need = o.lMax + latAct + (n.halfW || 0.93) + 0.45;
  if (need > 4.2 || need < 0.3) return;
  const end = o.aMax + (n.halfL || 2.05) + 1.5;
  if (Math.hypot(tgt.x - n.pos.x, tgt.z - n.pos.y) < end + 4) return;            // przed zakrętem trasy — nie
  for (let s = -2; s < end + 2; s += 1.5){
    const x = n.pos.x + dx * s, z = n.pos.y + dz * s;
    if (_nearAxis(x) < ROAD_H + 2.6 && _nearAxis(z) < ROAD_H + 2.6) return;      // skrzyżowanie z przejściami (do 9.6 m od środka)
  }
  for (const m of npcs){
    if (m === n || Math.abs((m.y || 0) - n.y) > 2.5) continue;
    const rx = m.pos.x - n.pos.x, rz = m.pos.y - n.pos.y, a = rx * dx + rz * dz, l = rx * dz - rz * dx;
    if (a < -6 || a > end + 20) continue;
    if (l > -1 && l < need + (n.halfW || 0.93) + (m.halfW || 0.93) + 0.3) return;   // ktoś na torze objazdu
  }
  n.byp = { s: 0, end: end, rear: o.aMin - (n.halfL || 2.05) }; n.latT = need; n.latRate = 1.6; n.obstT = 0;
  n.bypassCount = (n.bypassCount || 0) + 1;
}
/* autostrada: lider w prawym pasie wolniejszy o > 10 km/h -> lewy pas (luka ≥ 2 s z tyłu, ≥ 1.5 s z przodu),
   powrót na prawy, gdy wolny (z zapasem za wyprzedzonym), najpóźniej 250 m przed końcem odcinka */
function npcHwyLanes(n, dx, dz, tgt){
  const v = n.speed, want = (tgt.vmax || HP.vmax) * Math.min(1.05, (n.obey || 1) * (n.hwyF || 1)), room = tgt.ovtLeft || 0, inLeft = n.latT > 1;
  let leader = null, leftBlocked = false, rightBlocked = false, leftBlockedTight = false, rightBlockedTight = false;
  for (const m of npcs){
    if (m === n || Math.abs((m.y || 0) - n.y) > 2.5) continue;
    if ((m.dirX || 0) * dx + (m.dirZ || 0) * dz < 0.8) continue;
    const rx = m.pos.x - n.pos.x, rz = m.pos.y - n.pos.y, a = rx * dx + rz * dz;
    if (a < -70 || a > 90) continue;
    const l = rx * dz - rz * dx + (n.lat || 0), len = (m.halfL || 2.05) + (n.halfL || 2.05);
    if (Math.abs(l) < 1.75){
      if (a > 0 && (!leader || a < leader.a)) leader = { m: m, a: a };
      if (a > -(len + 7) && a < Math.max(len + 10, v * 1.5)) rightBlocked = true;
    } else if (Math.abs(l - 3.5) < 1.75){
      if (a < 0 ? -a < Math.max(len + 6, m.speed * 2) : a < Math.max(len + 6, v * 1.5)) leftBlocked = true;
      if (a < 0 ? -a < Math.max(len + 3, m.speed * 1.0) : a < Math.max(len + 3, v * 0.7)) leftBlockedTight = true;   // pirat: ciasne luki
    }
    if (Math.abs(l) < 1.75 && n.profile === 'pirat' && a > -(len + 3) && a < len + 4) rightBlockedTight = true;
  }
  if (!inLeft){
    const pir = n.profile === 'pirat';
    if (leader && leader.a < 70 && leader.m.speed < want - (pir ? 1.0 : 2.8) && v > 8 && room > (pir ? 180 : 160) && !(pir ? leftBlockedTight : leftBlocked)){
      n.latT = 3.5; n.latRate = 1.0; n.ovtCount = (n.ovtCount || 0) + 1; n.ovtM = leader.m;
    }
    n.ovtSlow = false;
  } else {
    const rb = n.profile === 'pirat' ? rightBlockedTight : rightBlocked;      // pirat zjeżdża tuż przed wyprzedzonego
    /* powrót dopiero po minięciu wyprzedzanego (inaczej: zjazd, znów za nim, znów wyprzedzanie) */
    const om = n.ovtM, passed = !om || npcs.indexOf(om) < 0 || ((om.pos.x - n.pos.x) * dx + (om.pos.y - n.pos.y) * dz) < -((om.halfL || 2.05) + (n.halfL || 2.05) + (n.profile === 'pirat' ? 2 : 6));
    if (!rb && (room < 100 || (passed && !(leader && leader.a < (n.profile === 'pirat' ? 12 : 30) && leader.m.speed < v + 0.5)))){ n.latT = 0; n.ovtSlow = false; n.ovtM = null; }
    else n.ovtSlow = room < 130;
  }
}
/* pirat drogowy w mieście: wyprzedza wolniejsze auto po przeciwnym pasie (prosty odcinek bez skrzyżowania,
   nikogo z naprzeciwka w 40 m) i bardzo rzadko (PIRATE_RAM_CHANCE na mijanego rowerzystę) zjeżdża w rowerzystę
   — rowerzysta się przewraca, pirat jedzie dalej */
let PIRATE_RAM_CHANCE = 0.15;
function npcPirate(n, dx, dz, tgt, dt){
  if (n.y > 1 || n.rb >= 0 || tgt.hwy || n.byp){ if (!n.byp && !n.povt && !n.ram && Math.abs(n.latT || 0) < 1.7) n.latT = 0; return; }   // rondo, autostrada: bez slalomu
  /* trwające taranowanie: zbliżenie w bok do rowerzysty, kontakt -> przewrócenie */
  if (n.ram){
    const m = n.ram.m; n.ram.t -= dt;
    if (npcs.indexOf(m) < 0 || n.ram.t <= 0){ n.ram = null; n.latT = 0; return; }
    const rx = m.pos.x - n.pos.x, rz = m.pos.y - n.pos.y;
    n.latT = (rx * dz - rz * dx) + (n.lat || 0) + 0.6; n.latRate = 2.5;
    if (__rectsOverlap(n.pos.x, n.pos.y, n.heading, n.halfW, n.halfL + 0.2, m.pos.x, m.pos.y, m.heading, m.halfW, m.halfL)){
      m.hitT = rand(6, 8); m.rammedBy = n.id; n.rams = (n.rams || 0) + 1; n.ram = null; n.latT = 0;
    }
    return;
  }
  /* trwające wyprzedzanie po przeciwnym pasie: koniec po minięciu, a auto z naprzeciwka blisko — powrót na swój pas */
  if (n.povt){
    const m = n.povt.m, a = (m.pos.x - n.pos.x) * dx + (m.pos.y - n.pos.y) * dz;
    n.povt.t += dt;
    let oncoming = false;
    for (const o of npcs){
      if (o === n || Math.abs((o.y || 0) - n.y) > 2.5 || (o.dirX || 0) * dx + (o.dirZ || 0) * dz > -0.5) continue;
      const ox = o.pos.x - n.pos.x, oz = o.pos.y - n.pos.y, oa = ox * dx + oz * dz, ol = ox * dz - oz * dx;
      if (oa > 0 && oa < 14 + (n.speed + o.speed) * 1.2 && ol > 1.2 && ol < 6.5){ oncoming = true; break; }
    }
    if (npcs.indexOf(m) < 0 || a < -((n.halfL || 2.05) + (m.halfL || 2.05) + 3) || n.povt.t > 8 || oncoming){ n.latT = 0; n.latRate = 2.4; n.povt = null; n.weaveT = 1.5; }
    return;
  }
  /* slalom: kołysanie w obrębie swojego pasa (−0.6 … +1.6 m od toru), poza skrzyżowaniami */
  const nearX = _nearAxis(n.pos.x) < ROAD_H + 3 && _nearAxis(n.pos.y) < ROAD_H + 3;
  n.weaveT = Math.max(0, (n.weaveT || 0) - dt);
  n.weave = (n.weave || n.id * 1.7) + dt * (1.6 + (n.id % 3) * 0.35);
  const turnNear = Math.hypot(tgt.x - n.pos.x, tgt.z - n.pos.y) < 25 + n.speed * 0.6;      // przed narożnikiem trasy: bez slalomu (wraca na tor)
  if (!nearX && !turnNear && !n.weaveT && n.speed > 6) { n.latT = 0.5 + 1.1 * Math.sin(n.weave); n.latRate = 1.8; }
  else if (Math.abs(n.latT || 0) < 1.7) n.latT = 0;
  for (const m of npcs){
    if (m === n || Math.abs((m.y || 0) - n.y) > 2.5) continue;
    if ((m.dirX || 0) * dx + (m.dirZ || 0) * dz < 0.8) continue;
    const rx = m.pos.x - n.pos.x, rz = m.pos.y - n.pos.y, a = rx * dx + rz * dz, l = rx * dz - rz * dx;
    /* rowerzysta tuż przed nami z prawej: raz na mijanie losowanie potrącenia */
    if (m.type === 'bike' && !(m.hitT > 0) && a > 1 && a < 7 && l < -0.8 && l > -3.2){
      n.ramSeen = n.ramSeen || new Set();
      if (!n.ramSeen.has(m.id)){ n.ramSeen.add(m.id); if (rnd() < PIRATE_RAM_CHANCE){ n.ram = { m: m, t: 2.5 }; return; } }
      continue;
    }
    /* wolniejsze auto przed nami na tym samym pasie */
    if (m.type === 'bike' || a < 3 || a > Math.max(16, n.speed * 1.6) || Math.abs(l) > 2 || m.speed < 0.5 || m.speed > n.speed - 1.5) continue;
    const span = a + 20 + n.speed * 0.8;
    if (Math.hypot(tgt.x - n.pos.x, tgt.z - n.pos.y) < span + 6) return;
    /* skrzyżowania po drodze: pirat przejeżdża przez nie przeciwnym pasem tylko, gdy są puste (bez sygnalizacji, nie rondo) */
    for (let s = -2; s < span; s += 2){
      const x = n.pos.x + dx * s, z = n.pos.y + dz * s;
      if (!(_nearAxis(x) < ROAD_H + 2.6 && _nearAxis(z) < ROAD_H + 2.6)) continue;
      const ji = Math.round((x + HALF) / BLOCK), jj = Math.round((z + HALF) / BLOCK), jx = L(ji), jz = L(jj);
      if (isRoundaboutPt(ji, jj)) return;                                        // światła, piesi, zebry — bez znaczenia
      if (npcs.some(o => o !== n && o !== m && o.speed > 0.5 && Math.hypot(o.pos.x - jx, o.pos.y - jz) < 20)) return;   // ruch w skrzyżowaniu: tam nawet pirat nie zmieści się po lewej
    }
    for (const o of npcs){                                                      // nikt z naprzeciwka / na przeciwnym pasie w 40 m
      if (o === n || o === m || Math.abs((o.y || 0) - n.y) > 2.5) continue;
      const ox = o.pos.x - n.pos.x, oz = o.pos.y - n.pos.y, oa = ox * dx + oz * dz, ol = ox * dz - oz * dx;
      if (oa > -8 && oa < span + 30 + o.speed * 3 && ol > 1.5 && ol < 10) return;
    }
    n.latT = 3.5; n.latRate = 2.4; n.povt = { m: m, t: 0 }; n.pirateOvt = (n.pirateOvt || 0) + 1;
    return;
  }
}
/* stłuczka z autem gracza (sound.js: zderzenie > 20 km/h) — postój ze światłami awaryjnymi */
const _hazGeo = new THREE.BoxGeometry(0.2, 0.1, 0.07);
function npcHitByPlayer(n, v){
  n.hitT = rand(3, 5); n.hits = (n.hits || 0) + 1;
  if (n.type === 'bike'){ n.hitT = rand(5, 7); return; }                     // rowerzysta przewraca się
  if (n.haz) return;
  n.haz = new THREE.MeshBasicMaterial({ color: 0xffa21a });
  const hw = (n.halfW || 0.93) - 0.12, hl = (n.halfL || 2.05) + 0.02;
  n.hazMeshes = [[hw, hl], [-hw, hl], [hw, -hl], [-hw, -hl]].map(p => { const m = new THREE.Mesh(_hazGeo, n.haz); m.position.set(p[0], 0.75, p[1]); n.mesh.add(m); return m; });
}
function npcHazardOff(n){
  if (!n.haz) return;
  n.hazMeshes.forEach(m => n.mesh.remove(m)); n.haz.dispose(); n.haz = null; n.hazMeshes = null;
}
/* strzały: kierowcy w promieniu 50 m przyspieszają do limitu na ~6 s */
function npcPanicAt(x, z){ for (const n of npcs) if (Math.hypot(n.pos.x - x, n.pos.y - z) < 50) n.panicT = 6; }

/* Relacja auta n (kierunek jazdy dx,dz) z autem m: true = stój, liczba = maks. prędkość
   (jazda za m), Infinity = brak wpływu. Kierunek m to jego faktyczny kierunek jazdy (dirX/dirZ),
   nie wygładzony heading — w zakręcie heading spóźnia się za ruchem. */
/* czy nadwozie m (obrócone wg jego kierunku) zajmuje pas 1.6 m przed naszym przodem
   (prostokąty wg typu auta; dla auta stojącego w poprzek liczy się jego długość, nie szerokość) */
function npcTouchAhead(n, m, dx, dz, rx, rz, ahead){
  const lat = Math.abs(rx*-dz + rz*dx);
  const mdx = m.dirX !== undefined ? m.dirX : Math.sin(m.heading), mdz = m.dirZ !== undefined ? m.dirZ : Math.cos(m.heading);
  const c = Math.abs(dx*mdx + dz*mdz), sn = Math.sqrt(Math.max(0, 1 - c*c));
  const mL = m.halfL || 2.05, mW = m.halfW || 0.93;
  const extF = mL*c + mW*sn, extL = mW*c + mL*sn;                 // zasięg m wzdłuż naszego kierunku / w bok
  return lat < (n.halfW || 0.93) + extL + 0.15 && ahead - extF < (n.halfL || 2.05) + 1.6;
}
function npcConflict(n, m, dx, dz, onlyClose){
  if (n.ram && n.ram.m === m) return Infinity;                               // pirat wjeżdża w rowerzystę (rzadkie zdarzenie)
  if (m.type === 'bike' && m.hitT > 0 && m.rammedBy === n.id) return Infinity; // ucieka od przewróconego
  if (Math.abs((n.y || 0) - (m.y || 0)) > 2.5) return Infinity;             // inny poziom (estakada nad ulicą)
  /* pirat, który najechał na rowerzystę, przewraca go i jedzie dalej (bez tego stałyby na sobie) */
  if (n.profile === 'pirat' && m.type === 'bike' && !(m.hitT > 0) && __rectsOverlap(n.pos.x, n.pos.y, n.heading, n.halfW, n.halfL, m.pos.x, m.pos.y, m.heading, m.halfW, m.halfL)){
    m.hitT = rand(6, 8); m.rammedBy = n.id; n.rams = (n.rams || 0) + 1; return Infinity;
  }
  const rx = m.pos.x - n.pos.x, rz = m.pos.y - n.pos.y, dist = Math.hypot(rx, rz);
  if (dist > ((n.profile === 'pirat' || m.profile === 'pirat') ? Math.max(16, n.speed * 2, m.speed * 2.5) : 16)) return Infinity;   // pirat ~50 m/s: widziany z daleka
  const gapL = (n.halfL || 2.05) + (m.halfL || 2.05);              // suma półdługości (4.1 dla dwóch sedanów)
  const ahead = rx*dx + rz*dz, lat = Math.abs(rx*-dz + rz*dx);
  if (ahead > 0 && npcTouchAhead(n, m, dx, dz, rx, rz, ahead)){  // nadwozie m tuż przed naszym przodem — stop...
    const mdx0 = m.dirX !== undefined ? m.dirX : Math.sin(m.heading), mdz0 = m.dirZ !== undefined ? m.dirZ : Math.cos(m.heading);
    const mutual = (-rx*mdx0 - rz*mdz0) > 0;                       // ...chyba że m też widzi nas przed sobą: wtedy
    if (!mutual) return true;
    const cr0 = dx*mdz0 - dz*mdx0;
    if (Math.abs(cr0) > 0.6){                                      // poprzecznie: jedzie to, które jest bliżej punktu przecięcia torów
      const t0 = (rx*mdz0 - rz*mdx0) / cr0, s0 = (rx*dz - rz*dx) / cr0;   // (drugie ma nos przy jego boku — czeka)
      if (Math.abs(t0 - s0) > 0.15) return t0 > s0;
    }
    return !(n.id < m.id);                                         // ustępuje tylko jedno (wyższe id), inaczej stałyby w nieskończoność
  }
  const mdx = m.dirX !== undefined ? m.dirX : Math.sin(m.heading), mdz = m.dirZ !== undefined ? m.dirZ : Math.cos(m.heading);
  const dot = dx*mdx + dz*mdz;
  /* to samo rondo: na pasie okrężnym kolejka liczona po torze; jadący po rondzie nie ustępują
     wjeżdżającym (to oni czekają — roundaboutYield), a dojeżdżający różnymi wlotami nie wpływają
     na siebie (tory przecinają się dopiero na rondzie) */
  if (n.rb >= 0 && m.rb === n.rb){
    if (n.rbPhase === 'ring' && m.rbPhase === 'ring'){
      const p = ROUNDABOUT_PTS[n.rb], cx = L(p[0]), cz = L(p[1]);
      const an = Math.atan2(n.pos.x - cx, n.pos.y - cz), am = Math.atan2(m.pos.x - cx, m.pos.y - cz);
      const gap = ((am - an) % TAU + TAU) % TAU * RB.ringR - gapL - 0.3;  // m przed nami po torze (zderzak–zderzak)
      if (gap < 1.8) return true;
      if (gap < 10) return gap < 5 ? m.speed * 0.6 : m.speed;
      return Infinity;
    }
    if (n.rbPhase === 'ring') return Infinity;
    if (dot > 0.8 && ahead > 0.5 && ahead < 13 && lat < 2.6) return ahead < gapL + 1.4 ? true : (ahead < gapL + 3.9 ? m.speed * 0.7 : m.speed);
    return Infinity;
  }
  if (dot > 0.8){                                                  // ten sam kierunek: kolejka
    /* obok siebie przy włączaniu / zmianie pasa: jedno (wyższe id) zwalnia i wjeżdża za drugie */
    if (lat < 3.0 && ahead > -1.5 && ahead < 0.5){
      if (Math.abs(ahead) > 0.15 ? ahead < 0 : n.id < m.id) return Infinity;   // jedzie to, które jest z przodu (zgodnie z regułą styku przodu), przy remisie niższe id
      return lat < (n.halfW || 0.93) + (m.halfW || 0.93) + 0.45 ? true : m.speed * 0.75;   // obrysy już prawie się stykają: ustąp całkiem
    }
    const look = Math.max(13, n.speed * 1.8);                      // przy 100 km/h ~50 m
    const latLim = (n.type === 'bike' || m.type === 'bike') ? (n.halfW || 0.93) + (m.halfW || 0.93) + 0.45 : 2.6;   // rower: wymijanie z odstępem ~1 m
    if (ahead < 0.5 || ahead > look || lat > latLim) return Infinity;
    if ((-rx*mdx - rz*mdz) > 0.5 && n.id < m.id) return Infinity;      // wzajemna „kolejka” (w zakręcie każde widzi drugie przed sobą): czeka tylko wyższe id
    const gx = n.gapX || 0;                                          // profil kierowcy: ostrożny +1 m, dynamiczny −0.3 m
    if (ahead < gapL + 1.4 + gx) return true;
    return ahead < Math.max(gapL + 3.9 + gx, n.speed * (0.9 + gx * 0.1)) ? m.speed * 0.7 : m.speed;
  }
  if (dot < -0.8){                                                 // z naprzeciwka: tylko gdy na moim pasie
    return (ahead > 0.5 && ahead < 10 && lat < 2.2) ? true : Infinity;
  }
  /* ruch poprzeczny: punkt przecięcia torów; t = moja droga do niego, s = droga m (ujemna = minął).
     Okna zależne od prędkości (~3 s jazdy, min. 14 m) — szybkie auto widać wcześniej. */
  if (ahead < -((n.halfL || 2.05) + 0.5)) return Infinity;            // całe za moim tyłem — nie jest moim konfliktem poprzecznym
  const cr = dx*mdz - dz*mdx;
  const t = (rx*mdz - rz*mdx) / cr, s = (rx*dz - rz*dx) / cr;
  const vn = Math.max(n.speed, 1), vm = Math.max(m.speed, 0.1);
  /* strefa konfliktu wg wymiarów obu pojazdów: moja półdługość + półszerokość drugiego (+0.3 m) — dla dwóch
     sedanów ~3.3 m jak dawniej; mały rower nie „mija” toru pickupa za wcześnie */
  const nL = n.halfL || 2.05, mL = m.halfL || 2.05, nW = n.halfW || 0.93, mW = m.halfW || 0.93;
  if (t < -(nL + mW + 0.3) || t > Math.max(14, vn*3) || s < -(mL + nW + 0.3) || s > Math.max(14, vm*3)) return Infinity;   // minięte (z tyłem auta) albo daleko
  const zN = nL + mW + 0.3, zM = mL + nW + 0.3;
  const mIn = s < zM, nIn = t < zN;                                // w strefie konfliktu (lub tuż przed nią)
  /* wolne auto, które wtoczyło się w strefę, czekając, nie przejmuje pierwszeństwa przed szybkim, które już nie wyhamuje
     (droga hamowania NPC ≈ v / 5.5 — damp w updateNpc); obie strony liczą to samo */
  const nStop = t - zN > n.speed / 5.5 + 0.3, mStop = s - zM > m.speed / 5.5 + 0.3;
  if (nIn && !mIn && n.speed < 3 && !mStop) return true;           // wpełzłem — czekam, ono przejedzie
  if (mIn && !nIn && m.speed < 3 && !nStop) return Infinity;       // ono wpełzło, ja nie wyhamuję — jadę
  if (nIn && !mIn) return Infinity;                                // jestem już w środku — jadę dalej
  if (mIn && !nIn) return true;                                    // ono jest w środku — czekam
  if (mIn && nIn) return t > s ? true : Infinity;                  // oba w środku: dalsze od punktu ustępuje
  if (m.speed < 0.5) return Infinity;                              // m stoi przed skrzyżowaniem (światło, STOP, ustępuje) — nie czekam na nie
  if (onlyClose) return Infinity;                                  // bezpiecznik na zakleszczenie: bez reguły pierwszeństwa
  /* oba dojeżdżają: kto pierwszy wg czasu dojazdu (ETA); przy podobnych czasach — reguła prawej ręki,
     a na skrzyżowaniu z drogą z pierwszeństwem (aleja j=6) — pierwszeństwo jadących aleją.
     Obie strony liczą to samo, więc decyzje są zgodne (jedno jedzie, drugie czeka). */
  const etaN = t / vn, etaM = s / vm, rightness = rx*-dz + rz*dx;  // rightness > 0: m po mojej prawej
  /* pirat nie ustępuje z przepisów — czeka tylko na auto, które ewidentnie będzie pierwsze; pozostali jeżdżą przy nim defensywnie */
  if (n.profile === 'pirat') return etaM + 0.6 < etaN ? true : Infinity;
  if (m.profile === 'pirat') return etaN + 0.6 < etaM ? Infinity : true;
  const pr = roadPriority(n.pos.x + dx*t, n.pos.y + dz*t);
  if (pr){
    const nMain = (pr === 'ew') === (Math.abs(dx) > Math.abs(dz)), mMain = (pr === 'ew') === (Math.abs(mdx) > Math.abs(mdz));
    if (nMain && !mMain) return (etaM + 1.5 < etaN && s < 8) ? true : Infinity;   // główna: jadę, chyba że tamto już prawie jest w środku
    if (!nMain && mMain) return (etaN + 3 < etaM) ? Infinity : true;             // podporządkowana: tylko przy dużej luce
  }
  if (etaN + 1.5 < etaM) return Infinity;                          // zdążę wyraźnie przed nim
  if (etaM + 1.5 < etaN) return true;                              // ono będzie wyraźnie pierwsze
  return rightness > 0 ? true : Infinity;
}

/* true, jeśli tor auta w ciągu najbliższych 12 m wchodzi na przejście, po którym idzie pieszy.
   Auto, które już stoi na pasach (przód za krawędzią), może z nich zjechać — wtedy pilnuje go
   zwykła kontrola pieszego przed maską. */
function zebraBusyAhead(n, dx, dz){
  let busy = null;
  for (const p of Pedestrians.list){
    if (p.state !== 'cross' || !p.cw) continue;
    const c = p.cw;
    if (Math.abs(n.pos.x - c.x) > 30 || Math.abs(n.pos.y - c.z) > 30) continue;
    (busy || (busy = [])).push(c);
  }
  if (!busy) return false;
  /* próbki wzdłuż TRASY (także za najbliższym zakrętem) do 22 m przed autem — auto skręcające
     widzi przejście na wylocie, zanim wjedzie na skrzyżowanie, i czeka przed nim, a nie w środku */
  let x0 = n.pos.x, z0 = n.pos.y, t = 0, wp = n.wp;
  for (let seg = 0; seg < 6 && t <= 22; seg++){
    const q = n.path[wp], lx = q.x - x0, lz = q.z - z0, len = Math.hypot(lx, lz);
    for (let u = 0; u < len && t + u <= 22; u += 0.75){
      const x = x0 + lx*u/len, z = z0 + lz*u/len;
      for (const c of busy) if (Math.abs(x - c.x) < c.hw + 0.4 && Math.abs(z - c.z) < c.hd + 0.4) return t + u >= (n.halfL || 2.05) - 0.25;   // ≈ przód pojazdu (rower krótszy)
    }
    t += len; x0 = q.x; z0 = q.z; wp = (wp + 1) % n.path.length;
  }
  return false;
}
