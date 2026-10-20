/* ---------------------------------------------------------------
   18. NPC
   --------------------------------------------------------------- */
const _npAxis = new CANNON.Vec3(0, 1, 0);
/* AI aut dalej niż NPC_LOD_DIST od gracza liczone co drugą klatkę (z dt skumulowanym) — ciało
   kinematyczne jedzie w tym czasie dalej z ostatnią prędkością */
let NPC_LOD_DIST = 220, _npcFrame = 0;
function updateNpcs(dt){
  _npcFrame++;
  const pp = mode === 'car' ? chassisBody.position : player.body.position;
  const honk = mode === 'car' && down('horn');
  for (let i = 0; i < npcs.length; i++){
    const n = npcs[i];
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
    n.mesh.rotation.set(-Math.atan(n.slope), n.heading, 0);                 // nos w górę pod górę
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
      if (along > sl - 1.0){ n.wp = (n.wp + 1) % n.path.length; return; }
      const latAct = ((n.pos.x - prv.x) * sz - (n.pos.y - prv.z) * sx) / sl;          // faktyczne przesunięcie w lewo od toru
      /* objazd: punkt celowania tuż przed tyłem przeszkody (ostry skręt z bliska), pełzanie, dopóki auto się nie odsunie */
      const La = n.byp ? clamp(n.byp.rear - n.byp.s - 0.3, 1.2, 8) : Math.max(8, n.speed * 1.2);
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
    if (!block && low) for (const p of Pedestrians.list){ if (pedOnRoad(p) && checkPoint(p.pos.x, p.pos.y, 0.7)){ block = true; why = 'pieszy'; break; } }
    /* przejście, po którym ktoś właśnie idzie (także po drugiej połowie jezdni): nie wjeżdżam na pasy */
    if (!block && low && zebraBusyAhead(n, dx, dz)){ block = true; why = 'zebra'; }
    /* auta NPC (npcConflict): jazda za autem w tym samym kierunku (cap), a przy ruchu poprzecznym
       punkt kolizji torów — auto, które już jest w strefie konfliktu, ma pierwszeństwo; gdy oba
       dopiero dojeżdżają, ustępuje to, które ma drugie po PRAWEJ (reguła prawej ręki). Bezpiecznik
       na zakleszczenie: po 9 s stania przed autem, które też stoi, przez 2.5 s pomijana jest sama
       reguła pierwszeństwa (auta w strefie konfliktu i przed maską dalej zatrzymują). */
    let blockedByNpc = false, cap = Infinity;     // cap = prędkość auta jadącego przed nami w tym samym kierunku
    if (!block){
      const ignoring = n.ignoreNpcT > 0;
      for (let k = 0; k < npcs.length; k++){
        if (k === i) continue;
        const r = npcConflict(n, npcs[k], dx, dz, ignoring);
        if (r === true){ block = true; blockedByNpc = npcs[k].speed < 0.3; why = 'npc:' + npcs[k].id; break; }
        if (r < cap) cap = r;
      }
    }
    if (n.ignoreNpcT > 0) n.ignoreNpcT -= dt;
    n.waitT = (blockedByNpc && n.speed < 0.3) ? (n.waitT || 0) + dt : 0;
    if (n.waitT > 9){ n.ignoreNpcT = 2.5; n.waitT = 0; }
    if (!block && low && redLightAhead(n.pos.x, n.pos.y, dx, dz)){ block = true; why = 'światło'; }
    /* ruszanie na zielonym z opóźnieniem zależnym od kierowcy (ostrożny dłużej, dynamiczny od razu) */
    if (n.wasLight && why !== 'światło') n.reactT = n.react || 0;
    n.wasLight = why === 'światło';
    if (n.reactT > 0){ n.reactT -= dt; if (!block){ block = true; why = 'reakcja'; } }
    /* stłuczka z autem gracza: postój 3–5 s ze światłami awaryjnymi */
    if (n.hitT > 0){
      n.hitT -= dt; block = true; why = 'kolizja';
      if (n.haz) n.haz.color.setHex(Math.floor(n.hitT * 2.6) % 2 ? 0xffa21a : 0x3a2a0a);
      if (n.hitT <= 0) npcHazardOff(n);
    }
    if (!block && low && stopSignAhead(n, dx, dz, dt)){ block = true; why = 'STOP'; }
    if (!block && low && roundaboutYield(n)){ block = true; why = 'rondo'; }
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
    /* autostrada: wyprzedzanie lewym pasem i powrót na prawy (odcinki p.ovt jezdni głównej) */
    if (tgt.hwy && !n.byp){
      if (tgt.ovt) npcHwyLanes(n, dx, dz, tgt);
      else if (n.latT){ n.latT = 0; n.ovtSlow = false; }
    }
    n.blocked = block; n.why = why;
    /* rondo: ~23 km/h na pasie okrężnym, płynne zwalnianie od ~24 m przed środkiem */
    if (n.rb >= 0 && n.rbDist < 26) cap = Math.min(cap, 6.5 + Math.max(0, n.rbDist - 15) * 0.7);
    /* autostrady, łącznice, łuki: limit z punktu trasy (vmax, wygładzony tak, by zdążyć zwolnić),
       kierowcy trzymają się go z dokładnością n.obey */
    if (tgt.vmax !== undefined){
      /* na autostradzie: tempo wg kierowcy (maks. +8%), na lewym pasie odcinka wyprzedzania limit 100 km/h */
      const f = tgt.hwy ? Math.min(tgt.vmax >= HP.vmax * 0.8 ? 1.05 : 1, (n.obey || 1) * (n.hwyF || 1)) : 1;   // łuki i rampy: bez naddatku
      cap = Math.min(cap, ((n.latT > 1 || n.lat > 1) && tgt.ovt ? Math.max(tgt.vmax, HP.vmax) : tgt.vmax) * f);
    }
    if (!tgt.hwy){
      /* limit strefy (B-33, B-43, obszar zabudowany): bieżący i ~22 m przed autem, żeby hamowało przed znakiem */
      const lim0 = speedLimitAt(n.pos.x, n.pos.y), lim1 = speedLimitAt(n.pos.x + dx*22, n.pos.y + dz*22);
      const lim = Math.min(lim0 || Infinity, lim1 || Infinity);
      if (lim < Infinity) cap = Math.min(cap, lim * (n.obey || 1));
      /* skrzyżowanie z drogą z pierwszeństwem przed nami, a my na podporządkowanej (A-7/STOP): dojazd ~30 km/h */
      const pr = roadPriority(n.pos.x + dx*14, n.pos.y + dz*14);
      if (pr && (pr === 'ew') !== (Math.abs(dx) > Math.abs(dz)) && roadPriority(n.pos.x, n.pos.y) === null) cap = Math.min(cap, 8.5);
    }

    if (n.ovtSlow) cap = Math.min(cap, n.speed * 0.85);
    if (n.bypCreep) cap = Math.min(cap, 2.5);                     // lewy pas przed końcem odcinka: przepuść prawy
    /* strzały w pobliżu: kierowcy przyspieszają do limitu */
    if (n.panicT > 0) n.panicT -= dt;
    const want = block ? 0 : Math.min(tgt.hwy ? 99 : (n.panicT > 0 ? Math.max(n.target, 13.9) : n.target), cap);
    n.speed = damp(n.speed, want, (block || want < n.speed - 1) ? 5.5 : n.accel, dt);
    n.heading = angleDamp(n.heading, Math.atan2(dx, dz), n.rbPhase === 'ring' ? 8 : 5.5, dt);

    n.dirX = dx; n.dirZ = dz;
    n.body.velocity.set(dx * n.speed, 0, dz * n.speed);
    n.body.angularVelocity.set(0, 0, 0);
    n.body.quaternion.setFromAxisAngle(_npAxis, n.heading);
  }
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
  if (n.y > 1 || n.rb >= 0 || tgt.hwy || n.lat) return;
  const need = o.lMax + (n.halfW || 0.93) + 0.45;
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
  let leader = null, leftBlocked = false, rightBlocked = false;
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
    }
  }
  if (!inLeft){
    if (leader && leader.a < 70 && leader.m.speed < want - 2.8 && v > 8 && room > 160 && !leftBlocked){
      n.latT = 3.5; n.latRate = 1.0; n.ovtCount = (n.ovtCount || 0) + 1;
    }
    n.ovtSlow = false;
  } else {
    if (!rightBlocked && (room < 100 || !(leader && leader.a < 30 && leader.m.speed < v + 0.5))){ n.latT = 0; n.ovtSlow = false; }
    else n.ovtSlow = room < 130;
  }
}
/* stłuczka z autem gracza (sound.js: zderzenie > 20 km/h) — postój ze światłami awaryjnymi */
const _hazGeo = new THREE.BoxGeometry(0.2, 0.1, 0.07);
function npcHitByPlayer(n, v){
  n.hitT = rand(3, 5); n.hits = (n.hits || 0) + 1;
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
  if (Math.abs((n.y || 0) - (m.y || 0)) > 2.5) return Infinity;             // inny poziom (estakada nad ulicą)
  const rx = m.pos.x - n.pos.x, rz = m.pos.y - n.pos.y, dist = Math.hypot(rx, rz);
  if (dist > 16) return Infinity;
  const gapL = (n.halfL || 2.05) + (m.halfL || 2.05);              // suma półdługości (4.1 dla dwóch sedanów)
  const ahead = rx*dx + rz*dz, lat = Math.abs(rx*-dz + rz*dx);
  if (ahead > 0 && npcTouchAhead(n, m, dx, dz, rx, rz, ahead)){  // nadwozie m tuż przed naszym przodem — stop...
    const mdx0 = m.dirX !== undefined ? m.dirX : Math.sin(m.heading), mdz0 = m.dirZ !== undefined ? m.dirZ : Math.cos(m.heading);
    const mutual = (-rx*mdx0 - rz*mdz0) > 0;                       // ...chyba że m też widzi nas przed sobą: wtedy
    return !(mutual && n.id < m.id);                               // ustępuje tylko jedno (wyższe id), inaczej stałyby w nieskończoność
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
    if (lat < 3.0 && ahead > -1.5 && ahead < 0.5) return n.id > m.id ? m.speed * 0.75 : Infinity;
    const look = Math.max(13, n.speed * 1.8);                      // przy 100 km/h ~50 m
    if (ahead < 0.5 || ahead > look || lat > 2.6) return Infinity;
    const gx = n.gapX || 0;                                          // profil kierowcy: ostrożny +1 m, dynamiczny −0.3 m
    if (ahead < gapL + 1.4 + gx) return true;
    return ahead < Math.max(gapL + 3.9 + gx, n.speed * (0.9 + gx * 0.1)) ? m.speed * 0.7 : m.speed;
  }
  if (dot < -0.8){                                                 // z naprzeciwka: tylko gdy na moim pasie
    return (ahead > 0.5 && ahead < 10 && lat < 2.2) ? true : Infinity;
  }
  /* ruch poprzeczny: punkt przecięcia torów; t = moja droga do niego, s = droga m (ujemna = minął).
     Okna zależne od prędkości (~3 s jazdy, min. 14 m) — szybkie auto widać wcześniej. */
  const cr = dx*mdz - dz*mdx;
  const t = (rx*mdz - rz*mdx) / cr, s = (rx*dz - rz*dx) / cr;
  const vn = Math.max(n.speed, 1), vm = Math.max(m.speed, 0.1);
  const nL = n.halfL || 2.05, mL = m.halfL || 2.05;               // półdługości (sedan 2.05: progi 2.6 / 3.2 jak dawniej)
  if (t < -(nL + 0.55) || t > Math.max(14, vn*3) || s < -(mL + 0.55) || s > Math.max(14, vm*3)) return Infinity;   // minięte (z tyłem auta) albo daleko
  const mIn = s < mL + 1.15, nIn = t < nL + 1.15;                  // w strefie konfliktu (lub tuż przed nią)
  if (nIn && !mIn) return Infinity;                                // jestem już w środku — jadę dalej
  if (mIn && !nIn) return true;                                    // ono jest w środku — czekam
  if (mIn && nIn) return t > s ? true : Infinity;                  // oba w środku: dalsze od punktu ustępuje
  if (m.speed < 0.5) return Infinity;                              // m stoi przed skrzyżowaniem (światło, STOP, ustępuje) — nie czekam na nie
  if (onlyClose) return Infinity;                                  // bezpiecznik na zakleszczenie: bez reguły pierwszeństwa
  /* oba dojeżdżają: kto pierwszy wg czasu dojazdu (ETA); przy podobnych czasach — reguła prawej ręki,
     a na skrzyżowaniu z drogą z pierwszeństwem (aleja j=6) — pierwszeństwo jadących aleją.
     Obie strony liczą to samo, więc decyzje są zgodne (jedno jedzie, drugie czeka). */
  const etaN = t / vn, etaM = s / vm, rightness = rx*-dz + rz*dx;  // rightness > 0: m po mojej prawej
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
      for (const c of busy) if (Math.abs(x - c.x) < c.hw + 0.4 && Math.abs(z - c.z) < c.hd + 0.4) return t + u >= 1.8;   // 1.8 ≈ przód auta
    }
    t += len; x0 = q.x; z0 = q.z; wp = (wp + 1) % n.path.length;
  }
  return false;
}
