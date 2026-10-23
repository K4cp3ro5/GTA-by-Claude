/* ---------------------------------------------------------------
   11. RUCH DROGOWY (NPC)
   --------------------------------------------------------------- */
const PIRATE_COLOR = 0x7cff2e;                 // piraci drogowi: kwasowa zieleń (nie występuje w zwykłym ruchu)
const NPC_COLORS = [0x2e4d8f, 0xd9d4c8, 0x2f6f4e, 0x8a8f96, 0xe0a52c, 0x6b3a8f];
const npcs = [];
let npcIdSeq = 0;

/* pętla po prostokącie siatki, prawy pas (3.5 m od osi): wschód -> południe -> zachód -> północ,
   na narożnikach skręty w prawo */
function npcLoop(i0, j0, i1, j1){
  const o = 3.5;
  return [
    { x: L(i0) + o, z: L(j0) + o },
    { x: L(i1) - o, z: L(j0) + o },
    { x: L(i1) - o, z: L(j1) - o },
    { x: L(i0) + o, z: L(j1) - o }
  ];
}
/* ten sam prostokąt w drugą stronę (południe -> wschód -> północ -> zachód): skręty w lewo */
function npcLoopRev(i0, j0, i1, j1){
  const o = 3.5;
  return [
    { x: L(i0) - o, z: L(j0) - o },
    { x: L(i0) - o, z: L(j1) + o },
    { x: L(i1) + o, z: L(j1) + o },
    { x: L(i1) + o, z: L(j0) - o }
  ];
}
/* Przejazd przez ronda: odcinki pętli przechodzące przez rondo (prosto lub ze skrętem
   w narożniku na rondzie) zastępowane są trasą roundaboutRoute (wlot -> pas okrężny -> wylot). */
function routeThroughRoundabouts(path){
  const ZONE = 12.5, dense = [];
  for (let i = 0; i < path.length; i++){
    const a = path[i], b = path[(i + 1) % path.length], len = Math.hypot(b.x - a.x, b.z - a.z);
    for (let s = 0; s < len; s += 0.5) dense.push({ x: a.x + (b.x - a.x)*s/len, z: a.z + (b.z - a.z)*s/len, corner: s === 0 ? a : null });
  }
  const zoneOf = p => ROUNDABOUT_PTS.findIndex(q => Math.hypot(p.x - L(q[0]), p.z - L(q[1])) < ZONE);
  let start = dense.findIndex(p => zoneOf(p) < 0);
  const out = [], N = dense.length;
  const axis = (c, p) => { const dx = p.x - c.x, dz = p.z - c.z; return Math.abs(dx) > Math.abs(dz) ? { x: Math.sign(dx), z: 0 } : { x: 0, z: Math.sign(dz) }; };
  for (let k = 0; k < N; k++){
    const p = dense[(start + k) % N], zi = zoneOf(p);
    if (zi < 0){ if (p.corner) out.push({ x: p.corner.x, z: p.corner.z }); continue; }
    /* cały przejazd przez strefę ronda */
    const before = dense[(start + k - 1 + N) % N];
    let e = k; while (e + 1 < N && zoneOf(dense[(start + e + 1) % N]) === zi) e++;
    const after = dense[(start + e + 1) % N];
    const c = { x: L(ROUNDABOUT_PTS[zi][0]), z: L(ROUNDABOUT_PTS[zi][1]) };
    roundaboutRoute(zi, axis(c, before), axis(c, after)).forEach(q => out.push(q));
    k = e;
  }
  return out;
}
const LOOPS = [
  npcLoop(1, 1, 6, 6),
  npcLoop(6, 1, 11, 6),
  npcLoop(1, 6, 6, 11),
  npcLoop(6, 6, 11, 11),
  npcLoop(2, 2, 9, 3),
  npcLoop(3, 9, 10, 10),
  npcLoop(0, 4, 5, 9),
  npcLoop(5, 3, 12, 7),
  npcLoop(2, 7, 7, 12),
  /* ronda (4,4) (8,4) (4,8) (8,8): skręty w prawo, w lewo i jazda na wprost przez każde z nich */
  npcLoop(4, 4, 8, 8),
  npcLoopRev(4, 4, 8, 8),
  npcLoop(2, 4, 10, 8),
  npcLoop(4, 2, 8, 10)
].map(routeThroughRoundabouts);
/* --- trasy przez autostrady (zamknięte cykle): wjazd z przekątnej w narożniku k -> autostrada
   (prosto 's', w lewo pętlą 'l', w prawo łącznicą 'r') -> zjazd w narożniku X -> prosta ulica miasta
   (i=10, j=2, i=2 albo j=10) -> wjazd w następnym narożniku (X+3)%4. Narożniki: 0 SE, 1 SW, 2 NW, 3 NE. --- */
function hwyRoute(startK, moves, lane){
  const pts = []; let k = startK;
  moves.forEach(mv => {
    const T = HWY_TERM[k], X = mv === 's' ? (k + 2) % 4 : mv === 'l' ? (k + 1) % 4 : (k + 3) % 4;
    pts.push(...termPoints(T.entry, { rk: 'enter' }), ...hwyTripPoints(T.entryCw, HWY_TERM[X].exitCw, lane), ...termPoints(HWY_TERM[X].exit));
    const a = pts[pts.length - 1];
    k = (X + 3) % 4;
    const b = HWY_TERM[k].entry.pts[0], n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 44);
    for (let i = 1; i < n; i++) pts.push({ x: lerp(a.x, b.x, i / n), z: lerp(a.z, b.z, i / n), y: 0 });   // ulica miasta (bez vmax — limity strefy)
  });
  if (k !== startK) throw new Error('trasa autostradowa nie jest zamknięta');
  pts.forEach(p => { if (p.hwy && p.y < 0.3) p.vmax = Math.min(p.vmax === undefined ? 99 : p.vmax, 50 / 3.6); });   // rampy w pasie podmiejskim: 50 km/h jak ulica
  smoothVmax(pts, 2.5);
  /* odcinki jezdni głównej prawym pasem (poza węzłem i końcami) — tam wolno wyprzedzać lewym pasem;
     ovtLeft = ile metrów takiego odcinka zostało (powrót na prawy pas zawczasu przed zjazdem) */
  pts.forEach(p => {
    if (!p.hwy) return;
    const ax = hwyAxisOf(p.x, p.z);
    p.ovt = Math.abs(Math.abs(ax.off) - (HP.cwOff + HP.laneR)) < 0.05 && Math.abs(ax.s) > 60 && Math.abs(ax.s) < HP.sSplit - 25 && Math.abs(p.y - hwyY(ax.id, ax.s)) < 0.05;
  });
  let left = 0;
  for (let k = pts.length - 1; k >= 0; k--){ const p = pts[k], q = pts[(k + 1) % pts.length]; left = p.ovt ? left + Math.hypot(q.x - p.x, q.z - p.z) : 0; p.ovtLeft = left; }
  pts.hwyRoute = true;
  return pts;
}
const HWY_LOOPS = [
  [hwyRoute(0, ['s','s','s','s'], 0), 6], [hwyRoute(2, ['s','s','s','s'], 1), 3],
  [hwyRoute(0, ['l'], 0), 1], [hwyRoute(1, ['l'], 0), 1], [hwyRoute(2, ['l'], 0), 1], [hwyRoute(3, ['l'], 0), 1],
  [hwyRoute(0, ['r','r'], 0), 2], [hwyRoute(1, ['r','r'], 0), 2]
];
/* indeks i ułamek odcinka w miejscu f (0..1) długości pętli — na odcinku poza rondem */
function pathSpot(path, f, tries){
  const segs = path.map((a, i) => { const b = path[(i + 1) % path.length]; return Math.hypot(b.x - a.x, b.z - a.z); });
  const total = segs.reduce((s, v) => s + v, 0);
  let d = ((f % 1) + 1) % 1 * total;
  for (let i = 0; i < path.length; i++){
    if (d <= segs[i]){
      const p = path[i], q = path[(i + 1) % path.length];
      const inside = (p.rb !== undefined && q.rb === p.rb && !q.first) || p.hwy || q.hwy;   // rondo albo autostrada (start tylko w mieście)
      if (inside && (tries || 0) < 40) return pathSpot(path, f + 0.03, (tries || 0) + 1);
      return { idx: i, frac: segs[i] ? d / segs[i] : 0 };
    }
    d -= segs[i];
  }
  return { idx: 0, frac: 0 };
}

/* model auta NPC: 3 siatki (karoseria+koła z kolorami wierzchołków, szyby, światła) zamiast 13;
   geometria wspólna dla wszystkich aut danego koloru (cache) */
const _npcGeoCache = {};
const _npcMatBody  = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 60 });
const _npcMatLamp  = new THREE.MeshBasicMaterial({ vertexColors: true });
/* model NPC z tych samych brył co auto gracza (car-types.js: carParts) — dwie siatki: nadwozie z szybami
   (kolory wierzchołków, szyby ciemne nieprzezroczyste) i światła; koła wg typu. Cache na (typ, kolor). */
function npcGeometries(color, type){
  const key = (type || 'sedan') + color;
  if (_npcGeoCache[key]) return _npcGeoCache[key];
  const T = CAR_TYPES[type || 'sedan'], B = (w,h,d) => new THREE.BoxGeometry(w,h,d);
  const tg = new THREE.CylinderGeometry(T.wheelR, T.wheelR, 0.26, 12); tg.rotateZ(Math.PI/2);
  const COL = { paint: T.bike ? 0x4a5058 : color, dark: 0x15171b, chrome: 0xb9bec6, lampF: 0xfff3d0, lampR: 0x5a1512 };
  const body = [], lamps = [];
  carParts(T.id).forEach(q => {
    const part = { geo: B(q[0], q[1], q[2]), color: COL[q[3]] || 0x141d22, x: q[4], y: q[5], z: q[6], rx: q[7] };
    ((q[3] === 'lampF' || q[3] === 'lampR') ? lamps : body).push(part);
  });
  if (T.bike){
    const tb = new THREE.CylinderGeometry(T.wheelR, T.wheelR, 0.06, 14); tb.rotateZ(Math.PI/2);
    [-T.wbF, -T.wbR].forEach(z => body.push({ geo: tb, color: 0x141518, x: 0, y: T.wheelR, z: z }));
    const skin = [0xd9a882, 0xc48f6a, 0xe8c39e, 0x8a6349][Math.abs(color) % 4], pants = 0x2c2f36;
    [[-0.12], [0.12]].forEach(q => body.push({ geo: B(0.13, 0.62, 0.13), color: pants, x: q[0], y: 0.66, z: -0.08, rx: -0.55 }));
    body.push({ geo: B(0.4, 0.56, 0.24), color: color, y: 1.28, z: -0.12, rx: 0.38 });     // tułów (koszulka w kolorze)
    body.push({ geo: B(0.22, 0.24, 0.22), color: skin, y: 1.66, z: 0.04 });               // głowa
    body.push({ geo: B(0.24, 0.1, 0.26), color: 0x22252b, y: 1.8, z: 0.04 });             // kask
    [-0.21, 0.21].forEach(x => body.push({ geo: B(0.09, 0.48, 0.09), color: color, x: x, y: 1.24, z: 0.2, rx: -1.0 }));
  } else
  [[T.track, -T.wbF], [-T.track, -T.wbF], [T.track, -T.wbR], [-T.track, -T.wbR]].forEach(p => body.push({ geo: tg, color: 0x141518, x: p[0], y: T.wheelR, z: p[1] }));
  return (_npcGeoCache[key] = { body: mergeColored(body), lamps: mergeColored(lamps) });
}
function buildNpcModel(color, type){
  const g = new THREE.Group(), G = npcGeometries(color, type);
  const body = new THREE.Mesh(G.body, _npcMatBody); body.castShadow = true; g.add(body);
  g.add(new THREE.Mesh(G.lamps, _npcMatLamp));
  scene.add(g);
  return g;
}

/* frac = położenie na odcinku idx -> idx+1 (0 = w narożniku pętli) */
function spawnNpcCar(path, colorHex, startIdx, frac, type){
  type = type || randomCarType();
  const TN = CAR_TYPES[type].npc;
  const idx = (startIdx !== undefined) ? startIdx : randInt(0, path.length - 1);
  const p0 = path[idx], p1 = path[(idx + 1) % path.length], f = frac || 0;
  const n = {
    id: ++npcIdSeq,
    path: path,
    wp: (idx + 1) % path.length,
    pos: new THREE.Vector2(lerp(p0.x, p1.x, f), lerp(p0.z, p1.z, f)),
    y: lerp(p0.y || 0, p1.y || 0, f),
    heading: Math.atan2(p1.x - p0.x, p1.z - p0.z),
    speed: 0,
    /* prędkość zależna od strefy (centrum wolniej, obrzeża szybciej) i od "charakteru" kierowcy 0.7–1.35x */
    target: clamp(clamp(6.5 + Math.hypot(path[idx].x, path[idx].z) / 26, 6.5, 14) * rand(0.7, 1.35) * TN.speed, 5, 18),
    mesh: buildNpcModel(colorHex, type),
    color: colorHex,
    type: type, halfW: TN.hw, halfL: TN.hl, halfH: TN.hh, accel: TN.accel,   // wymiary nadwozia i przyspieszenie wg typu
    body: null,
    blocked: false,
    obey: 1
  };
  /* profil kierowcy: ostrożny (30%), zwykły (50%), dynamiczny (20%) — trzymanie się limitu, odstęp,
     czas reakcji na zielone, przyspieszenie, prędkość docelowa */
  const PIR = { k: 'pirat', obey: [1.35, 1.6], v: 1.25, a: 2.0, gap: -0.5, react: 0 };   // pirat drogowy: nie trzyma się żadnych zasad
  const pr = rnd();
  let P = pr < 0.08 ? PIR
        : pr < 0.32 ? { k: 'ostrożny', obey: [0.88, 0.96], v: 0.92, a: 0.85, gap: 1.0, react: 0.9 }
        : pr < 0.8 ? { k: 'zwykły', obey: [0.95, 1.02], v: 1.0, a: 1.0, gap: 0, react: 0.45 }
        : { k: 'dynamiczny', obey: [1.0, 1.05], v: 1.06, a: 1.15, gap: -0.3, react: 0.15 };
  if (type !== 'bike' && !path.hwyRoute && !path.some(q => q.rb !== undefined) && n.id % 7 === 3) P = PIR;   // kilku stałych piratów w mieście (pętle bez rond — te same, co rowerzystów)
  if (type === 'bike' && P === PIR) P = { k: 'zwykły', obey: [1, 1], v: 1, a: 1, gap: 0, react: 0.45 };
  n.profile = P.k; n.obey = rand(P.obey[0], P.obey[1]); n.target *= P.v; n.hwyF = P.v; n.accel *= P.a; n.gapX = P.gap; n.react = P.react;
  if (P === PIR){                                                                             // jaskrawy lakier, szybko także w centrum
    n.target = Math.max(n.target, 13); n.color = PIRATE_COLOR;
    scene.remove(n.mesh); n.mesh = buildNpcModel(PIRATE_COLOR, type);
  }
  const b = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: matCar });
  b.addShape(new CANNON.Box(new CANNON.Vec3(TN.hw + 0.02, TN.hh, TN.hl + 0.05)));
  b.position.set(n.pos.x, n.y + TN.hh + 0.1, n.pos.y);
  b.npcRef = n;                              // zderzenie z autem gracza (sound.js) -> npcHitByPlayer
  n.indMeshes = addIndicators(n.mesh, type);
  b.collisionFilterGroup = G_CAR;
  b.collisionFilterMask = ~G_WORLD;          // kinematyczne: bez par ze światem (bryły wysp) — tylko gracz, auta, piesi
  b.allowSleep = false;
  addBody(b);
  n.body = b;
  npcs.push(n);
  return n;
}
/* nowe auto (kradzież, menu debug): w losowym miejscu którejś pętli, ale poza zasięgiem
   wzroku gracza (> 60 m) i nie na innym aucie (> 12 m od każdego NPC) */
function spawnRandomNpcCar(){
  const p = mode === 'car' ? chassisBody.position : player.body.position;
  let path, idx, frac;
  for (let tries = 0; tries < 40; tries++){
    path = LOOPS[randInt(0, LOOPS.length - 1)];
    const sp = pathSpot(path, rnd()); idx = sp.idx; frac = sp.frac;
    const a = path[idx], b = path[(idx + 1) % path.length];
    const x = lerp(a.x, b.x, frac), z = lerp(a.z, b.z, frac);
    if (Math.hypot(x - p.x, z - p.z) < 60) continue;
    if (npcs.some(m => Math.hypot(m.pos.x - x, m.pos.y - z) < 12)) continue;
    break;
  }
  return spawnNpcCar(path, NPC_COLORS[randInt(0, NPC_COLORS.length - 1)], idx, frac);
}
/* rowerzyści NPC: 16–20 km/h na własnej kopii pętli miejskiej przesuniętej 2.3 m w prawo (przy krawędzi jezdni),
   tylko pętle bez rond (logika ronda opiera się na osi toru); narożniki przesunięte po dwusiecznej */
const NPC_BIKE_COUNT = 8;
function offsetLoop(P, off){
  const Q = P.filter((p, i) => { const q = P[(i + 1) % P.length]; return Math.hypot(q.x - p.x, q.z - p.z) > 0.05; }), n = Q.length;
  return Q.map((b, i) => {
    const a = Q[(i - 1 + n) % n], c = Q[(i + 1) % n];
    const l1 = Math.hypot(b.x - a.x, b.z - a.z), l2 = Math.hypot(c.x - b.x, c.z - b.z);
    const r1x = -(b.z - a.z) / l1, r1z = (b.x - a.x) / l1, r2x = -(c.z - b.z) / l2, r2z = (c.x - b.x) / l2;
    let mx = r1x + r2x, mz = r1z + r2z; const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
    const k = off / Math.max(0.4, mx * r1x + mz * r1z);
    return Object.assign({}, b, { x: b.x + mx * k, z: b.z + mz * k });
  });
}
/* menu debug: istniejące auto staje się piratem (profil jak przy spawnie, nowy lakier i kierunkowskazy na nowym modelu) */
function npcMakePirate(n){
  if (n.type === 'bike' || n.profile === 'pirat' || n.cop) return false;
  n.profile = 'pirat'; n.obey = rand(1.35, 1.6); n.target = Math.max(n.target * 1.25, 13); n.hwyF = 1.25;
  n.accel = CAR_TYPES[n.type].npc.accel * 2.0; n.gapX = -0.5; n.react = 0; n.color = PIRATE_COLOR;
  npcHazardOff(n);
  const old = n.mesh; n.mesh = buildNpcModel(PIRATE_COLOR, n.type);
  n.mesh.position.copy(old.position); n.mesh.quaternion.copy(old.quaternion); scene.remove(old);
  n.indMeshes = addIndicators(n.mesh, n.type);
  return true;
}
const _bikeLoops = new Map();
function bikeLoopOf(P){ if (!_bikeLoops.has(P)) _bikeLoops.set(P, offsetLoop(P, 2.3)); return _bikeLoops.get(P); }
function spawnNpcBikes(){
  const noRb = P => !P.hwyRoute && !P.some(p => p.rb !== undefined);
  const city = LOOPS.filter(noRb), pirLoops = npcs.filter(n => n.profile === 'pirat' && noRb(n.path)).map(n => n.path);
  for (let k = 0; k < NPC_BIKE_COUNT; k++){
    spawnNpcBike(bikeLoopOf(k < pirLoops.length && k < 3 ? pirLoops[k] : city[(k * 5 + 2) % city.length]), k);
  }
}
const BIKE_COLORS = [0xc0392b, 0x2a6cb8, 0xe8b923, 0x2f8a4c, 0xd35fa0, 0xeeeeea];
function spawnNpcBike(P, k){
  for (let t = 0; t < 30; t++){
    const sp = pathSpot(P, rnd()), a = P[sp.idx], b = P[(sp.idx + 1) % P.length];
    const x = lerp(a.x, b.x, sp.frac), z = lerp(a.z, b.z, sp.frac);
    if (npcs.some(m => Math.hypot(m.pos.x - x, m.pos.y - z) < 12)) continue;
    const n = spawnNpcCar(P, BIKE_COLORS[k % 6], sp.idx, sp.frac, 'bike');
    n.target = rand(4.4, 5.6); n.obey = 1; n.profile = 'rowerzysta';
    return n;
  }
  return null;
}
function removeNpcCar(n){
  npcHazardOff(n);
  delBody(n.body);
  scene.remove(n.mesh);
  const idx = npcs.indexOf(n);
  if (idx >= 0) npcs.splice(idx, 1);
}

/* dwa auta na każdej pętli miejskiej i 1–3 na trasie autostradowej, w równych odstępach (poza rondami
   i autostradą); pętle dzielą pasy, więc miejsce startu przesuwane, aż będzie ≥ 12 m od każdego auta */
const ALL_LOOPS = LOOPS.map(p => [p, 2]).concat(HWY_LOOPS);
HWY_LOOPS.forEach(l => LOOPS.push(l[0]));
for (let i = 0; i < ALL_LOOPS.length; i++){
  const f0 = rnd(), cnt = ALL_LOOPS[i][1];
  Array.from({ length: cnt }, (_, k) => f0 + k / cnt).forEach((f, k) => {
    let sp = null;
    for (let tries = 0; tries < 30; tries++, f += 0.017){
      const q = pathSpot(ALL_LOOPS[i][0], f);
      const a = ALL_LOOPS[i][0][q.idx], b = ALL_LOOPS[i][0][(q.idx + 1) % ALL_LOOPS[i][0].length];
      const x = lerp(a.x, b.x, q.frac), z = lerp(a.z, b.z, q.frac);
      if (!npcs.some(m => Math.hypot(m.pos.x - x, m.pos.y - z) < 12)){ sp = q; break; }
    }
    if (sp) spawnNpcCar(ALL_LOOPS[i][0], NPC_COLORS[(i + 3*k) % NPC_COLORS.length], sp.idx, sp.frac);   // brak wolnego miejsca: auto nie powstaje
  });
}
spawnNpcBikes();

