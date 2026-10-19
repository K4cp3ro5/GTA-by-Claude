/* ---------------------------------------------------------------
   18. NPC
   --------------------------------------------------------------- */
const _npAxis = new CANNON.Vec3(0, 1, 0);
function updateNpcs(dt){
  for (let i = 0; i < npcs.length; i++){
    const n = npcs[i];

    /* ciało kinematyczne jest źródłem prawdy — model i logika idą za nim */
    n.pos.set(n.body.position.x, n.body.position.z);
    n.mesh.position.set(n.pos.x, 0, n.pos.y);
    n.mesh.rotation.y = n.heading;

    const tgt = n.path[n.wp];
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
    if (tgt.hwyMerge && d < 4){
      /* koniec łącznicy wjazdowej: włączenie do ruchu na autostradzie, gdy jest luka; inaczej czeka */
      if (hwyMergeFree(tgt.z)){ npcToHighway(n); i--; continue; }
      n.speed = 0; n.body.velocity.set(0, 0, 0); n.blocked = true; n.why = 'włączanie';
      continue;
    }
    if (d < 2.2){
      n.wp = (n.wp + 1) % n.path.length;
      continue;
    }
    dx /= d; dz /= d;

    /* detekcja przeszkody przed maską */
    let block = false, why = '';                  // why = przyczyna hamowania (diagnostyka: test/sim.js)
    const checkPoint = (px, pz, radius) => {
      const ox = px - n.pos.x, oz = pz - n.pos.y;
      const ahead = ox * dx + oz * dz;
      if (ahead < 0.5 || ahead > 11) return false;
      const lat = Math.abs(ox * -dz + oz * dx);
      return lat < 2.0 + radius;
    };
    if (checkPoint(chassisBody.position.x, chassisBody.position.z, 1.0)){ block = true; why = 'gracz-auto'; }
    if (!block && mode === 'foot' &&
        checkPoint(player.body.position.x, player.body.position.z, 0.5)){ block = true; why = 'gracz'; }
    if (!block && mainCarPlaceholder &&
        checkPoint(mainCarPlaceholder.body.position.x, mainCarPlaceholder.body.position.z, 1.0)){ block = true; why = 'atrapa'; }   // zaparkowane główne auto
    /* piesi na jezdni (na przejściu albo leżący) — auto staje przed nimi */
    if (!block) for (const p of Pedestrians.list){ if (pedOnRoad(p) && checkPoint(p.pos.x, p.pos.y, 0.7)){ block = true; why = 'pieszy'; break; } }
    /* przejście, po którym ktoś właśnie idzie (także po drugiej połowie jezdni): nie wjeżdżam na pasy */
    if (!block && zebraBusyAhead(n, dx, dz)){ block = true; why = 'zebra'; }
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
    if (!block && redLightAhead(n.pos.x, n.pos.y, dx, dz)){ block = true; why = 'światło'; }
    if (!block && stopSignAhead(n, dx, dz, dt)){ block = true; why = 'STOP'; }
    if (!block && roundaboutYield(n)){ block = true; why = 'rondo'; }
    n.blocked = block; n.why = why;
    /* rondo: ~23 km/h na pasie okrężnym, płynne zwalnianie od ~24 m przed środkiem */
    if (n.rb >= 0 && n.rbDist < 26) cap = Math.min(cap, 6.5 + Math.max(0, n.rbDist - 15) * 0.7);
    if (tgt.vmax !== undefined) cap = Math.min(cap, tgt.vmax);                       // łuki, łącznice, zawrotki
    /* limit strefy (B-33, B-43, obszar zabudowany): bieżący i ~22 m przed autem, żeby hamowało przed znakiem;
       kierowcy trzymają się limitu z dokładnością n.obey (0.9–1.05) */
    const lim0 = speedLimitAt(n.pos.x, n.pos.y), lim1 = speedLimitAt(n.pos.x + dx*22, n.pos.y + dz*22);
    const lim = Math.min(lim0 || Infinity, lim1 || Infinity);
    if (lim < Infinity) cap = Math.min(cap, lim * (n.obey || 1));
    /* skrzyżowanie z drogą z pierwszeństwem przed nami, a my na podporządkowanej (A-7/STOP): dojazd ~30 km/h */
    const pr = roadPriority(n.pos.x + dx*14, n.pos.y + dz*14);
    if (pr && (pr === 'ew') !== (Math.abs(dx) > Math.abs(dz)) && roadPriority(n.pos.x, n.pos.y) === null) cap = Math.min(cap, 8.5);

    const want = block ? 0 : Math.min(n.target, cap);
    n.speed = damp(n.speed, want, (block || want < n.speed - 1) ? 5.5 : 1.7, dt);
    n.heading = angleDamp(n.heading, Math.atan2(dx, dz), n.rbPhase === 'ring' ? 8 : 5.5, dt);

    n.dirX = dx; n.dirZ = dz;
    n.body.velocity.set(dx * n.speed, 0, dz * n.speed);
    n.body.angularVelocity.set(0, 0, 0);
    n.body.quaternion.setFromAxisAngle(_npAxis, n.heading);
  }
}

/* Relacja auta n (kierunek jazdy dx,dz) z autem m: true = stój, liczba = maks. prędkość
   (jazda za m), Infinity = brak wpływu. Kierunek m to jego faktyczny kierunek jazdy (dirX/dirZ),
   nie wygładzony heading — w zakręcie heading spóźnia się za ruchem. */
/* czy nadwozie m (obrócone wg jego kierunku) zajmuje pas 1.6 m przed naszym przodem
   (prostokąty 1.86 x 4.1 m; dla auta stojącego w poprzek liczy się jego długość, nie szerokość) */
function npcTouchAhead(n, m, dx, dz, rx, rz, ahead){
  const lat = Math.abs(rx*-dz + rz*dx);
  const mdx = m.dirX !== undefined ? m.dirX : Math.sin(m.heading), mdz = m.dirZ !== undefined ? m.dirZ : Math.cos(m.heading);
  const c = Math.abs(dx*mdx + dz*mdz), sn = Math.sqrt(Math.max(0, 1 - c*c));
  const extF = 2.05*c + 0.93*sn, extL = 0.93*c + 2.05*sn;        // zasięg m wzdłuż naszego kierunku / w bok
  return lat < 0.93 + extL + 0.15 && ahead - extF < 2.05 + 1.6;
}
function npcConflict(n, m, dx, dz, onlyClose){
  const rx = m.pos.x - n.pos.x, rz = m.pos.y - n.pos.y, dist = Math.hypot(rx, rz);
  if (dist > 16) return Infinity;
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
      const gap = ((am - an) % TAU + TAU) % TAU * RB.ringR - 4.4;  // m przed nami po torze (zderzak–zderzak)
      if (gap < 1.8) return true;
      if (gap < 10) return gap < 5 ? m.speed * 0.6 : m.speed;
      return Infinity;
    }
    if (n.rbPhase === 'ring') return Infinity;
    if (dot > 0.8 && ahead > 0.5 && ahead < 13 && lat < 2.6) return ahead < 5.5 ? true : (ahead < 8 ? m.speed * 0.7 : m.speed);
    return Infinity;
  }
  if (dot > 0.8){                                                  // ten sam kierunek: kolejka
    if (ahead < 0.5 || ahead > 13 || lat > 2.6) return Infinity;
    if (ahead < 5.5) return true;
    return ahead < 8 ? m.speed * 0.7 : m.speed;
  }
  if (dot < -0.8){                                                 // z naprzeciwka: tylko gdy na moim pasie
    return (ahead > 0.5 && ahead < 10 && lat < 2.2) ? true : Infinity;
  }
  /* ruch poprzeczny: punkt przecięcia torów; t = moja droga do niego, s = droga m (ujemna = minął).
     Okna zależne od prędkości (~3 s jazdy, min. 14 m) — szybkie auto widać wcześniej. */
  const cr = dx*mdz - dz*mdx;
  const t = (rx*mdz - rz*mdx) / cr, s = (rx*dz - rz*dx) / cr;
  const vn = Math.max(n.speed, 1), vm = Math.max(m.speed, 0.1);
  if (t < -2.6 || t > Math.max(14, vn*3) || s < -2.6 || s > Math.max(14, vm*3)) return Infinity;   // minięte (z tyłem auta) albo daleko
  const mIn = s < 3.2, nIn = t < 3.2;                              // w strefie konfliktu (lub tuż przed nią)
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
