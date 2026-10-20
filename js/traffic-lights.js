/* ---------------------------------------------------------------
   7c. SYGNALIZACJA ŚWIETLNA
   Kilka wybranych skrzyżowań (nie wszystkie) dostaje działającą
   sygnalizację 2-fazową: NS zielone / EW czerwone, potem odwrotnie,
   z krótką przerwą "wszystkie czerwone" między fazami. NPC naprawdę
   się zatrzymują (patrz update-npc.js) — nie tylko wizualne światła.
   --------------------------------------------------------------- */
const TL_PTS = [[3,3],[9,3],[6,9]];   // (i,j) siatki, poza rondami i narożnikami
/* fazy jednego kierunku (s): czerwone+żółte -> zielone -> żółte -> czerwone (drugi kierunek ma to samo przesunięte o pół cyklu) */
const TL_RY = 1.0, TL_GREEN = 8, TL_YELLOW = 2.5, TL_ALLRED = 1.2;
const TL_HALF = TL_RY + TL_GREEN + TL_YELLOW + TL_ALLRED, TL_FULL = TL_HALF * 2;
const trafficLights = [];
const _tlLampGeo = new THREE.SphereGeometry(0.1, 10, 8);
const TL_ON  = { R: 0xff2a22, Y: 0xffb21e, G: 0x2ad94a };
const TL_OFF = { R: 0x3a0f0c, Y: 0x3a2a0a, G: 0x0f3a16 };
function tlGroupMats(){ return { R: new THREE.MeshBasicMaterial({ color: TL_OFF.R }), Y: new THREE.MeshBasicMaterial({ color: TL_OFF.Y }), G: new THREE.MeshBasicMaterial({ color: TL_OFF.G }) }; }

/* sygnalizator S-1 przy PRAWEJ krawędzi wlotu, przodem do nadjeżdżających (approachSpot);
   słupek kończy się w połowie komory, komora wisi przed słupkiem — od przodu go nie widać */
function buildSignalHead(spot, mats){
  const base = WALK_H, r = 0.06, hw = 0.34, hh = 1.0, hd = 0.26, cy = base + 2.2 + hh/2;
  const xf = signXf(spot.x, spot.z, spot.rot), zc = r + hd/2;
  signLog.push({ kind: 'sygnalizator', x: spot.x, z: spot.z, rot: spot.rot });
  signPole(spot.x, spot.z, base, cy, r);
  const c = xf(0, cy, zc);
  signDarkBuf.boxRot(c[0], cy, c[2], hw, hh, hd, spot.rot, 1, true);
  /* daszki nad komorami */
  [0.33, 0, -0.33].forEach(dy => {
    const v = xf(0, cy + dy + 0.12, zc + hd/2 + 0.06);
    signDarkBuf.boxRot(v[0], v[1], v[2], 0.26, 0.02, 0.12, spot.rot, 1, true);
  });
  [['R', 0.33], ['Y', 0], ['G', -0.33]].forEach(l => {
    const m = new THREE.Mesh(_tlLampGeo, mats[l[0]]);
    const p = xf(0, cy + l[1], zc + hd/2 - 0.03);
    m.position.set(p[0], p[1], p[2]);
    m.matrixAutoUpdate = false; m.updateMatrix();
    scene.add(m);
  });
}

/* linia zatrzymania (STOP_AT od środka skrzyżowania) leży przed przejściem dla pieszych (CW_OFF ± 1.1),
   sygnalizator i STOP stoją przy niej — piesi przechodzą obok, nie przez słupek */
const STOP_AT = ROAD_H + 3.7;
const STOP_ZONE = [2, STOP_AT + 2.8];        // środek auta w tym przedziale "przed" skrzyżowaniem => hamuje
TL_PTS.forEach(p => {
  const cx = L(p[0]), cz = L(p[1]), o = ROAD_H + 1.0;
  const tl = { x: cx, z: cz, radius: STOP_ZONE[1] + 2, t: rand(0, TL_FULL), ns: 'R', ew: 'R', nsMats: tlGroupMats(), ewMats: tlGroupMats() };
  [{x:0,z:1},{x:0,z:-1},{x:1,z:0},{x:-1,z:0}].forEach(d => buildSignalHead(approachSpot(cx, cz, d, STOP_AT, o), d.x === 0 ? tl.nsMats : tl.ewMats));
  trafficLights.push(tl);
});

/* stan jednego kierunku w chwili t cyklu: 'RY' | 'G' | 'Y' | 'R' */
function tlState(t){
  if (t < TL_RY) return 'RY';
  if (t < TL_RY + TL_GREEN) return 'G';
  if (t < TL_RY + TL_GREEN + TL_YELLOW) return 'Y';
  return 'R';
}
function setLamps(m, st){
  m.R.color.setHex(st === 'R' || st === 'RY' ? TL_ON.R : TL_OFF.R);
  m.Y.color.setHex(st === 'Y' || st === 'RY' ? TL_ON.Y : TL_OFF.Y);
  m.G.color.setHex(st === 'G' ? TL_ON.G : TL_OFF.G);
}
function updateTrafficLights(dt){
  for (const tl of trafficLights){
    tl.t = (tl.t + dt) % TL_FULL;
    const ns = tlState(tl.t), ew = tlState((tl.t + TL_HALF) % TL_FULL);
    if (ns !== tl.ns){ tl.ns = ns; setLamps(tl.nsMats, ns); }
    if (ew !== tl.ew){ tl.ew = ew; setLamps(tl.ewMats, ew); }
  }
}

/* true, jeśli npc jadący kierunkiem (dx,dz) z pozycji (px,pz) powinien się teraz zatrzymać
   przed sygnalizatorem: czerwone / czerwone+żółte zawsze, żółte tylko jeśli da się
   jeszcze zatrzymać przed linią (auto już za linią zatrzymania jedzie dalej) */
function redLightAhead(px, pz, dx, dz){
  for (const tl of trafficLights){
    const ox = tl.x - px, oz = tl.z - pz;
    const dist = Math.hypot(ox, oz);
    if (dist > tl.radius) continue;
    const ahead = ox*dx + oz*dz;
    if (ahead < STOP_ZONE[0] || ahead > STOP_ZONE[1]) continue;
    const lat = Math.abs(ox*-dz + oz*dx);
    if (lat > 5.2) continue;          // pas jazdy = 3.5 m od osi (±1.75); próg dokładnie 3.5 odrzucał auta po minimalnym dryfie numerycznym
    const st = Math.abs(dz) >= Math.abs(dx) ? tl.ns : tl.ew;
    if (st === 'G') continue;
    if (st === 'Y' && ahead < STOP_AT + 0.5) continue;
    return true;
  }
  return false;
}

/* ---------------------------------------------------------------
   7d. ZNAK B-20 "STOP" (działający) + B-33 ograniczenie prędkości
   STOP naprawdę zatrzymuje NPC: hamują na dojeździe, stoją ~1.4 s
   przy linii i dopiero wtedy ruszają (stopPass chroni przed
   zakleszczeniem — bez tego auto czekałoby w nieskończoność).
   B-33 jest na razie tylko oznakowaniem (prędkości NPC wynikają ze
   stref w traffic-npc.js), nie egzekwowanym limitem.
   --------------------------------------------------------------- */
/* wybrane programowo (test: skrzyżowania, przez które realnie przejeżdżają prostopadłe trasy NPC,
   poza rondami, światłami, narożnikami tras i węzłem autostrady) */
const STOP_PTS = [[5,6,'ns'],[6,3],[6,7],[1,4],[7,10]];   // 'ns' = STOP tylko na wlotach N–S (aleja j=6 ma pierwszeństwo)
const stopSigns = [];

STOP_PTS.forEach(p => {
  const cx = L(p[0]), cz = L(p[1]);
  stopSigns.push({ x: cx, z: cz, radius: STOP_ZONE[1] + 2, axis: p[2] || null });
  [{x:0,z:1},{x:0,z:-1},{x:1,z:0},{x:-1,z:0}].filter(d => p[2] !== 'ns' || d.x === 0).forEach(d => {
    const a = approachSpot(cx, cz, d, STOP_AT, ROAD_H + 0.9);       // prawa krawędź dojazdu przy linii zatrzymania, przodem do kierowcy
    placeSign(a.x, a.z, a.rot, [FACE.STOP()]);
  });
});

function stopSignAhead(n, dx, dz, dt){
  let inZone = false;
  for (const s of stopSigns){
    if (s.axis === 'ns' && Math.abs(dz) < Math.abs(dx)) continue;          // jadący aleją: bez STOP
    const ox = s.x - n.pos.x, oz = s.z - n.pos.y;
    if (Math.hypot(ox, oz) > s.radius) continue;
    const ahead = ox*dx + oz*dz;
    if (ahead < 1.5 || ahead > STOP_ZONE[1]) continue;
    const lat = Math.abs(ox*-dz + oz*dx);
    if (lat > 5.2) continue;          // pas jazdy = 3.5 m od osi (±1.75); próg dokładnie 3.5 odrzucał auta po minimalnym dryfie numerycznym
    inZone = true;
    if (n.stopPass) return false;
    if (n.speed < 0.6){          // postój gdziekolwiek w strefie dojazdu liczy się do odczekania
      n.stopHold = (n.stopHold || 0) + dt;
      if (n.stopHold > 1.4){ n.stopPass = true; n.stopHold = 0; return false; }
    }
    return true;
  }
  if (!inZone){ n.stopPass = false; n.stopHold = 0; }
  return false;
}
