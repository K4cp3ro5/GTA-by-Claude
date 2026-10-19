/* ---------------------------------------------------------------
   11. RUCH DROGOWY (NPC)
   --------------------------------------------------------------- */
const NPC_COLORS = [0x2e4d8f, 0xd9d4c8, 0x2f6f4e, 0x8a8f96, 0xe0a52c, 0x6b3a8f];
const npcs = [];

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
/* indeks i ułamek odcinka w miejscu f (0..1) długości pętli — na odcinku poza rondem */
function pathSpot(path, f, tries){
  const segs = path.map((a, i) => { const b = path[(i + 1) % path.length]; return Math.hypot(b.x - a.x, b.z - a.z); });
  const total = segs.reduce((s, v) => s + v, 0);
  let d = ((f % 1) + 1) % 1 * total;
  for (let i = 0; i < path.length; i++){
    if (d <= segs[i]){
      const p = path[i], q = path[(i + 1) % path.length];
      if (p.rb !== undefined && q.rb === p.rb && !q.first && (tries || 0) < 40) return pathSpot(path, f + 0.03, (tries || 0) + 1);   // odcinek wewnątrz trasy ronda
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
function npcGeometries(color){
  if (_npcGeoCache[color]) return _npcGeoCache[color];
  const B = (w,h,d) => new THREE.BoxGeometry(w,h,d);
  const tg = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 12); tg.rotateZ(Math.PI/2);
  const body = [
    { geo: B(1.86, 0.52, 4.10), color: color, y: 0.62 },
    { geo: B(1.48, 0.10, 1.70), color: color, y: 1.36, z: -0.22 },
    { geo: B(1.88, 0.20, 0.28), color: 0x15171b, y: 0.50, z: 2.02 },
    { geo: B(1.88, 0.20, 0.28), color: 0x15171b, y: 0.50, z: -2.02 }
  ];
  [[0.84,1.34],[-0.84,1.34],[0.84,-1.34],[-0.84,-1.34]].forEach(p => body.push({ geo: tg, color: 0x141518, x: p[0], y: 0.34, z: p[1] }));
  const lamps = [
    { geo: B(0.40, 0.12, 0.08), color: 0x5a1512, x:  0.62, y: 0.80, z: -2.06 },
    { geo: B(0.40, 0.12, 0.08), color: 0x5a1512, x: -0.62, y: 0.80, z: -2.06 },
    { geo: B(0.40, 0.12, 0.08), color: 0xfff3d0, x:  0.62, y: 0.78, z:  2.04 },
    { geo: B(0.40, 0.12, 0.08), color: 0xfff3d0, x: -0.62, y: 0.78, z:  2.04 }
  ];
  const glass = new THREE.BoxGeometry(1.60, 0.52, 2.10); glass.translate(0, 1.10, -0.10);
  return (_npcGeoCache[color] = { body: mergeColored(body), lamps: mergeColored(lamps), glass: glass });
}
function buildNpcModel(color){
  const g = new THREE.Group(), G = npcGeometries(color);
  const body = new THREE.Mesh(G.body, _npcMatBody); body.castShadow = true; g.add(body);
  g.add(new THREE.Mesh(G.glass, _npcMatGlass));
  g.add(new THREE.Mesh(G.lamps, _npcMatLamp));
  scene.add(g);
  return g;
}

/* frac = położenie na odcinku idx -> idx+1 (0 = w narożniku pętli) */
function spawnNpcCar(path, colorHex, startIdx, frac){
  const idx = (startIdx !== undefined) ? startIdx : randInt(0, path.length - 1);
  const p0 = path[idx], p1 = path[(idx + 1) % path.length], f = frac || 0;
  const n = {
    path: path,
    wp: (idx + 1) % path.length,
    pos: new THREE.Vector2(lerp(p0.x, p1.x, f), lerp(p0.z, p1.z, f)),
    heading: Math.atan2(p1.x - p0.x, p1.z - p0.z),
    speed: 0,
    /* prędkość zależna od strefy (centrum wolniej, obrzeża szybciej) i od "charakteru" kierowcy 0.7–1.35x */
    target: clamp(clamp(6.5 + Math.hypot(path[idx].x, path[idx].z) / 26, 6.5, 14) * rand(0.7, 1.35), 5, 18),
    mesh: buildNpcModel(colorHex),
    color: colorHex,
    body: null,
    blocked: false
  };
  const b = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: matCar });
  b.addShape(new CANNON.Box(new CANNON.Vec3(0.95, 0.62, 2.1)));
  b.position.set(n.pos.x, 0.72, n.pos.y);
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

/* dwa auta na każdej pętli, w przeciwległych miejscach (poza rondami) — gęstszy ruch */
for (let i = 0; i < LOOPS.length; i++){
  const f0 = rnd();
  [f0, f0 + 0.5].forEach((f, k) => { const sp = pathSpot(LOOPS[i], f); spawnNpcCar(LOOPS[i], NPC_COLORS[(i + 3*k) % NPC_COLORS.length], sp.idx, sp.frac); });
}

/* ruch na autostradzie: dedykowany system, patrz highway.js (buduje się
   po tym pliku — potrzebuje buildNpcModel i G_CAR stąd) */
initHighwayTraffic();
