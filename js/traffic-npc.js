/* ---------------------------------------------------------------
   11. RUCH DROGOWY (NPC)
   --------------------------------------------------------------- */
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
  pts.hwyRoute = true;
  return pts;
}
const HWY_LOOPS = [
  [hwyRoute(0, ['s','s','s','s'], 0), 3], [hwyRoute(2, ['s','s','s','s'], 1), 3],
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
const _npcMatGlass = new THREE.MeshPhongMaterial({ color: 0x141d22, shininess: 100, transparent: true, opacity: 0.8 });
const _npcMatLamp  = new THREE.MeshBasicMaterial({ vertexColors: true });
/* model NPC z tych samych brył co auto gracza (car-types.js: carParts) — trzy siatki: lakier+detale
   (kolory wierzchołków), szyby, światła; koła wg typu. Cache na (typ, kolor). */
function npcGeometries(color, type){
  const key = (type || 'sedan') + color;
  if (_npcGeoCache[key]) return _npcGeoCache[key];
  const T = CAR_TYPES[type || 'sedan'], B = (w,h,d) => new THREE.BoxGeometry(w,h,d);
  const tg = new THREE.CylinderGeometry(T.wheelR, T.wheelR, 0.26, 12); tg.rotateZ(Math.PI/2);
  const COL = { paint: color, dark: 0x15171b, chrome: 0xb9bec6, lampF: 0xfff3d0, lampR: 0x5a1512 };
  const body = [], lamps = [], glass = [];
  carParts(T.id).forEach(q => {
    const part = { geo: B(q[0], q[1], q[2]), color: COL[q[3]] || 0x141d22, x: q[4], y: q[5], z: q[6], rx: q[7] };
    (q[3] === 'glass' ? glass : (q[3] === 'lampF' || q[3] === 'lampR') ? lamps : body).push(part);
  });
  [[T.track, -T.wbF], [-T.track, -T.wbF], [T.track, -T.wbR], [-T.track, -T.wbR]].forEach(p => body.push({ geo: tg, color: 0x141518, x: p[0], y: T.wheelR, z: p[1] }));
  return (_npcGeoCache[key] = { body: mergeColored(body), lamps: mergeColored(lamps), glass: mergeColored(glass) });
}
function buildNpcModel(color, type){
  const g = new THREE.Group(), G = npcGeometries(color, type);
  const body = new THREE.Mesh(G.body, _npcMatBody); body.castShadow = true; g.add(body);
  g.add(new THREE.Mesh(G.glass, _npcMatGlass));
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
    obey: rand(0.9, 1.05)              // jak dokładnie trzyma się limitów prędkości
  };
  const b = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: matCar });
  b.addShape(new CANNON.Box(new CANNON.Vec3(TN.hw + 0.02, TN.hh, TN.hl + 0.05)));
  b.position.set(n.pos.x, n.y + TN.hh + 0.1, n.pos.y);
  b.collisionFilterGroup = G_CAR;
  b.collisionFilterMask = -1;
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
function removeNpcCar(n){
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

