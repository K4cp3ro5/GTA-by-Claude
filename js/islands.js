/* ---------------------------------------------------------------
   7a0. WYSPY I MORZE — wyspa główna (miasto + pas podmiejski, |x|,|z| ≤ WALL_X) i wysepka lotniska na
   północy; morze dookoła (płaszczyzna WATER_Y z falującą teksturą), nabrzeża z balustradą (przerwy
   w portach), dno SEA_FLOOR (fizyczne podłoże świata — wyspy mają własne bryły z wierzchem na y = 0),
   pomosty (PIERS — ląd dla pieszych, przeszkoda dla łodzi), port na wyspie głównej (kontenery,
   dźwigi, statek, magazyn, przystań) i przystań na wysepce. Miejsca łodzi: BOAT_SPOTS (boats.js).
   isLand(x, z) — czy punkt jest na lądzie (wyspa albo pomost).
   --------------------------------------------------------------- */
const WATER_Y = -0.9, SEA_FLOOR = -14;
const ISLANDS = [
  { name: 'main',    x0: -WALL_X, x1: WALL_X, z0: -WALL_X, z1: WALL_X },
  { name: 'airport', x0: -190,    x1: 190,    z0: -862,    z1: -648 },          // z drugim pasem (NPC) na północy
  { name: 'airportW', x0: -454,   x1: -WALL_X + 0.5, z0: -186, z1: 186 }    // nasyp lotniska miejskiego (drugi pas) przy zachodnim brzegu
];
/* odcinki nabrzeża bez balustrady (porty) albo całkiem bez nabrzeża (wall: styk wyspy z nasypem): wyspa, bok (N/S/E/W), zakres wzdłuż boku */
const HARBOR_GAPS = [
  { island: 'main', side: 'N', a0: -150, a1: 150 },
  { island: 'airport', side: 'S', a0: -110, a1: 30 },
  { island: 'main', side: 'W', a0: -186, a1: 186, wall: true },
  { island: 'airportW', side: 'E', a0: -186, a1: 186, wall: true }
];
const PIERS = [];            // { x0, x1, z0, z1 } — pomosty nad wodą
const BOAT_OBSTACLES = [];   // { x0, x1, z0, z1 } — przeszkody w wodzie dla łodzi (kadłub statku)
const BOAT_SPOTS = [];       // { x, z, heading } — łodzie przy pomostach
const PORTS = {              // punkty przystani (nawigacja: przeprawa łodzią)
  main:    { x: L(5), z: -386 },
  airport: { x: L(5), z: -655 }
};
/* wpadnięcie do wody: pieszy (też ze spadochronu) — po chwili na najbliższy brzeg; auto — tonie, kierowca
   na brzegu, auto na wolnym miejscu przy nim (main-loop, po kroku fizyki) */
let _wetT = 0;
function updateWaterHazards(dt){
  if (player.dead){ _wetT = 0; return; }
  const onFoot = mode === 'foot', b = onFoot ? player.body : chassisBody, p = b.position;
  if ((onFoot || mode === 'car') && p.y < WATER_Y - (onFoot ? 0.2 : 0.4) && !isLand(p.x, p.z)){
    if (_wetT === 0) hudToast(onFoot ? 'Wpadłeś do wody!' : 'Auto wpadło do wody!', 2);
    _wetT += dt;
    b.velocity.x *= 0.9; b.velocity.z *= 0.9; b.velocity.y = Math.max(b.velocity.y, onFoot ? -0.6 : -1.5);
    if (_wetT < (onFoot ? 1.4 : 1.8)) return;
    _wetT = 0;
    const s = safeSpot(p.x, p.z, 2, 90) || { x: HOSPITAL_SPAWN.x, y: 0, z: HOSPITAL_SPAWN.z };
    if (!onFoot){
      const c = safeSpot(s.x, s.z, 5, 40) || s, T = CAR_TYPES[carType];
      takeOver(carType, driving.color, driving.owner, c.x, c.y, c.z, 0);
      mode = 'foot'; player.mesh.visible = true; addBody(player.body); Sound.engine(false, 0, 0);
    }
    player.body.position.set(s.x, s.y + 1.2, s.z); player.body.velocity.set(0, 0, 0); player.body.wakeUp();
    player.fallSpeed = 0; endParachute();
    hudToast(onFoot ? 'Wyciągnięto cię na brzeg' : 'Wyciągnięto cię na brzeg — auto obok', 2.5);
  } else _wetT = 0;
}
function inRect(r, x, z, m){ m = m || 0; return x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m; }
function islandAt(x, z){ return ISLANDS.find(r => inRect(r, x, z)) || null; }
function isLand(x, z){ return !!islandAt(x, z) || PIERS.some(r => inRect(r, x, z)); }

/* fizyka: dno morza (płaszczyzna świata) i bryły wysp z wierzchem na y = 0 */
groundBody.position.y = SEA_FLOOR;
ISLANDS.forEach(r => {
  const b = new CANNON.Body({ mass: 0, material: matGround });
  const hy = (0 - SEA_FLOOR) / 2;
  b.addShape(new CANNON.Box(new CANNON.Vec3((r.x1 - r.x0) / 2, hy, (r.z1 - r.z0) / 2)));
  b.position.set((r.x0 + r.x1) / 2, -hy, (r.z0 + r.z1) / 2);
  b.collisionFilterGroup = G_WORLD; b.collisionFilterMask = -1;
  addBody(b);
});

/* --- woda: duża płaszczyzna z teksturą fal (przesuwana w updateWater) --- */
const seaTex = (function(){
  const S = 256, c = mkCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#2b6a86'; g.fillRect(0, 0, S, S);
  for (let k = 0; k < 900; k++){
    const x = Math.random() * S, y = Math.random() * S, w = 6 + Math.random() * 22;
    g.strokeStyle = Math.random() < 0.5 ? 'rgba(160,210,230,0.18)' : 'rgba(20,60,85,0.25)';
    g.lineWidth = 1 + Math.random() * 1.5; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y - 2, x + w, y); g.stroke();
  }
  const t = toTex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(420, 420);
  return t;
})();
const seaMat = new THREE.MeshPhongMaterial({ color: 0x3f8fae, map: seaTex, specular: 0x9ccbe0, shininess: 70 });
const seaMesh = new THREE.Mesh(new THREE.PlaneGeometry(7000, 7000), seaMat);
seaMesh.rotation.x = -Math.PI / 2; seaMesh.position.y = WATER_Y; seaMesh.receiveShadow = true;
scene.add(seaMesh);
function updateSea(dt){ seaTex.offset.x = (seaTex.offset.x + dt * 0.004) % 1; seaTex.offset.y = (seaTex.offset.y + dt * 0.0025) % 1; }

/* --- budowa (wywoływana z city-generation.js, gdy bufory są gotowe) --- */
function buildIslands(){
  const quay = new GeoBuf(), H = 1.1, T = 0.6;
  ISLANDS.forEach(r => {
    if (r.name !== 'main') lawnBuf.plane((r.x0 + r.x1) / 2, -0.008, (r.z0 + r.z1) / 2, r.x1 - r.x0, r.z1 - r.z0, (r.x1 - r.x0) / 10, (r.z1 - r.z0) / 10);
    /* ściana nabrzeża od wody do terenu (widoczna nad wodą) i balustrada (z kolizją 1.6 m) — z przerwami w portach;
       na styku wyspy z nasypem (wall) bez ściany i balustrady */
    const fy = (WATER_Y - 2.5) / 2, fh = -(WATER_Y - 2.5);
    const sides = { N: [r.x0, r.x1, r.z0, 'x', 1], S: [r.x0, r.x1, r.z1, 'x', -1], W: [r.z0, r.z1, r.x0, 'z', 1], E: [r.z0, r.z1, r.x1, 'z', -1] };
    const segsOf = (sd, a0, a1, wallOnly) => {
      const gaps = HARBOR_GAPS.filter(g => g.island === r.name && g.side === sd && (!wallOnly || g.wall)).sort((p, q) => p.a0 - q.a0);
      let a = a0; const segs = [];
      gaps.forEach(g => { if (g.a0 > a) segs.push([a, Math.min(a1, g.a0)]); a = Math.max(a, g.a1); });
      if (a < a1) segs.push([a, a1]);
      return segs;
    };
    Object.keys(sides).forEach(sd => {
      const [a0, a1, e, ax, inw] = sides[sd];
      const put = (s0, s1, off, th, cy, hh, tile, coll) => {
        const m = (s0 + s1) / 2, l = s1 - s0, at = e + inw * off, bx = ax === 'x' ? m : at, bz = ax === 'x' ? at : m, bw = ax === 'x' ? l : th, bd = ax === 'x' ? th : l;
        quay.box(bx, cy, bz, bw, hh, bd, tile, true);
        if (coll) staticBox(bx, 0.8, bz, bw, 1.6, bd);
      };
      segsOf(sd, a0, a1, true).forEach(([s0, s1]) => put(s0, s1, 0.5, 1.0, fy, fh, 4, false));
      segsOf(sd, a0, a1, false).forEach(([s0, s1]) => put(s0, s1, T / 2, T, H / 2, H, 3, true));
    });
  });
  const mesh = new THREE.Mesh(quay.geometry(), new THREE.MeshLambertMaterial({ map: texs.curb, color: 0xb9b6ad }));
  mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh);
  buildMainPort();
  buildAirportHarbor();
}

/* pomost: deska na palach, z kolizją (wierzch y = 0), ląd dla pieszych */
function pier(x0, x1, z0, z1){
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
  CB(0x8a6a48).box(cx, -0.15, cz, w, 0.3, d, 2, true);
  for (let x = x0 + 0.3; x <= x1 - 0.2; x += Math.max(0.4, w - 0.6)) for (let z = Math.min(z0, z1) + 0.3; z <= Math.max(z0, z1); z += 4)
    CB(0x4a3a2c).box(x, (WATER_Y - 1.2) / 2 - 0.15, z, 0.3, -(WATER_Y - 1.2), 0.3, 1, true);
  for (let z = Math.min(z0, z1) + 2; z < Math.max(z0, z1); z += 6) CB(0x2a2c30).box(x1 - 0.25, 0.25, z, 0.3, 0.5, 0.3, 1, true);   // pachołki
  staticBox(cx, -0.15, cz, w, 0.3, d);
  PIERS.push({ x0: x0, x1: x1, z0: Math.min(z0, z1), z1: Math.max(z0, z1) });
  mapExtras.push({ t: 'rect', x0: x0, x1: x1, z0: Math.min(z0, z1), z1: Math.max(z0, z1), c: '#6b5a44' });
}
function quayPaint(x0, z0, x1, z1, w, col){
  const l = Math.hypot(x1 - x0, z1 - z0) || 1, nx = -(z1 - z0) / l * w / 2, nz = (x1 - x0) / l * w / 2, y = 0.05;
  CB(col || 0xeeeeea).quad([x0 - nx, y, z0 - nz], [x0 + nx, y, z0 + nz], [x1 + nx, y, z1 + nz], [x1 - nx, y, z1 - nz], [0,0],[1,0],[1,1],[0,1]);
}

/* --- port na wyspie głównej (północny pas podmiejski): nabrzeże, kontenery, dźwigi, statek, magazyn, przystań --- */
function buildMainPort(){
  const E = WALL_X, ac = { x: L(5), z0: -CITY_EDGE, z1: -378, hw: 4 };
  for (let i = treeSpots.length - 1; i >= 0; i--){ const t = treeSpots[i]; if (t.z < -CITY_EDGE + 2 && Math.abs(t.x) < 172) treeSpots.splice(i, 1); }
  const y = 0.03;
  /* dojazd z ulicy i=5 (znak A-7 + C-2 przy wyjeździe na jednokierunkową obwodnicę) */
  crossBuf.plane(ac.x, y, (ac.z0 + ac.z1) / 2, ac.hw * 2, ac.z0 - ac.z1, 1, (ac.z0 - ac.z1) / 6);
  for (let z = ac.z0 - 3; z > ac.z1 + 3; z -= 6) quayPaint(ac.x, z, ac.x, z - 3, 0.16);
  for (const sx of [-1, 1]) quayPaint(ac.x + sx * (ac.hw - 0.3), ac.z0 - 0.5, ac.x + sx * (ac.hw - 0.3), ac.z1 + 0.5, 0.15);
  for (let x = ac.x - ac.hw + 0.3; x < ac.x - 0.4; x += 1.2) quayPaint(x, ac.z0 - 1, x + 0.6, ac.z0 - 1, 0.3);
  placeSign(ac.x - ac.hw - 1.0, -CITY_EDGE - 7, Math.PI, [FACE.A7(), FACE.C2()], { base: 0 });
  placeSign(ac.x - 26, -256, -Math.PI / 2, [signFace('drogowskaz', texHwySign(['PORT · LOTNISKO'], '⚓'), shapeRect(1.8, 1.1))], { base: WALK_H, bottom: 2.1, poleR: 0.05 });
  /* plac nabrzeża (beton) z żółtą linią krawędzi i pachołkami */
  CB(0x86837c).plane(0, 0.02, -E + 9.5, 300, 19, 1, 1);
  quayPaint(-150, -E + 1.2, 150, -E + 1.2, 0.25, 0xe0b020);
  for (let x = -146; x <= 146; x += 10) CB(0x2a2c30).box(x, 0.3, -E + 0.7, 0.4, 0.6, 0.4, 1, true);
  /* plac kontenerowy: stosy kontenerów (1–3 wysokie), suwnica bramowa */
  CB(0x55585e).plane(-105, 0.025, -336, 90, 72, 1, 1);
  const CC = [0xb3272b, 0x2e4d8f, 0x2f6f4e, 0xe0a52c, 0x8a8f96, 0x6b3a8f, 0xd35f1a];
  for (let z = -366; z <= -306; z += 12) for (let x = -144; x <= -70; x += 7.5){
    if (Math.abs(x + 105) < 4) continue;                                             // przejazd pod suwnicą
    const n = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++){ CB(CC[randInt(0, CC.length - 1)]).box(x, 1.3 + k * 2.6, z, 6.1, 2.55, 2.44, 2, true); CB(0x2a2c30).box(x, 2.58 + k * 2.6, z, 6.1, 0.05, 2.46, 1, true); }
    staticBox(x, n * 1.3, z, 6.1, n * 2.6, 2.44);
  }
  for (const zz of [-372, -300]) for (const xx of [-150, -60]){ CB(0xe0b020).box(xx, 9, zz, 1.2, 18, 1.2, 1, true); staticBox(xx, 9, zz, 1.2, 18, 1.2); }
  for (const zz of [-372, -300]) CB(0xe0b020).box(-105, 18.5, zz, 92, 1.4, 1.4, 2, true);
  CB(0xe0b020).box(-105, 19.6, -336, 92, 1.0, 1.2, 2, true); CB(0x3b4046).box(-96, 17.4, -336, 3, 2.2, 3, 1, true);
  /* dźwigi nabrzeżowe (dwie bramy na nabrzeżu z wysięgnikiem nad wodą) */
  for (const xc of [-125, -70]){
    for (const sx of [-1, 1]) for (const zz of [-E + 3, -E + 15]){ CB(0x2f5674).box(xc + sx * 7, 14, zz, 1.4, 28, 1.4, 1, true); staticBox(xc + sx * 7, 14, zz, 1.4, 28, 1.4); }
    for (const sx of [-1, 1]) CB(0x2f5674).box(xc + sx * 7, 29, -E - 14, 1.6, 1.6, 64, 2, true);           // wysięgnik nad wodą i zaplecze
    CB(0x2f5674).box(xc, 29, -E + 3, 16, 1.6, 1.6, 1, true); CB(0x2f5674).box(xc, 29, -E + 15, 16, 1.6, 1.6, 1, true);
    CB(0xd8d4cc).box(xc, 31, -E + 9, 6, 3, 5, 1, true);
  }
  /* statek kontenerowy przy nabrzeżu (kadłub, nadbudówka, kontenery) — przeszkoda dla łodzi */
  const sx0 = -150, sx1 = -46, sz0 = -E - 21, sz1 = -E - 5, scz = (sz0 + sz1) / 2;
  CB(0x1f3550).box((sx0 + sx1) / 2, 2.6, scz, sx1 - sx0, 7, sz1 - sz0, 3, true);
  CB(0x8a2a22).box((sx0 + sx1) / 2, -0.6, scz, sx1 - sx0 + 0.1, 0.8, sz1 - sz0 + 0.1, 2, true);
  /* (dziób w kształcie klina: landmarks.js) */
  CB(0xe9eaec).box(sx0 + 9, 10, scz, 12, 9, sz1 - sz0 - 2, 2, true); CB(0x2a2c30).box(sx0 + 9, 13.2, scz, 12.2, 0.8, sz1 - sz0 - 1.8, 1, true);
  CB(0xd35f1a).box(sx0 + 6, 17, scz, 2.4, 6, 2.4, 1, true);                                              // komin
  for (let x = sx0 + 20; x < sx1 - 6; x += 7) for (let k = 0; k < 2; k++) for (const dz of [-4.5, -1.5, 1.5, 4.5]) CB(CC[randInt(0, CC.length - 1)]).box(x, 7.4 + k * 2.6, scz + dz, 6.1, 2.55, 2.44, 1, true);
  staticBox((sx0 + sx1) / 2 + 2, 3, scz, sx1 - sx0 + 8, 9, sz1 - sz0);
  BOAT_OBSTACLES.push({ x0: sx0 - 1, x1: sx1 + 8, z0: sz0 - 1, z1: sz1 + 1 });
  mapExtras.push({ t: 'rect', x0: sx0, x1: sx1 + 8, z0: sz0, z1: sz1, c: '#2a3d55' });
  /* magazyn i biuro portu z napisem */
  corrBuf.box(40, 5, -356, 60, 10, 32, 6, false); CB(0x6d7174).box(40, 10.2, -356, 61, 0.4, 33, 2, true);
  CB(0x3f4449).plane(40, 4, -340 + 0.02, 40, 8, 1, 1);
  staticBox(40, 5, -356, 60, 10, 32); buildings.push({ x: 40, z: -356, w: 60, d: 32 });
  CB(0xe3e5e2).box(-21, 3.5, -366, 18, 7, 12, 2, true); CB(0x2f5674).box(-21, 4.4, -360 + 0.06, 15, 1.4, 0.12, 1, true);
  staticBox(-21, 3.5, -366, 18, 7, 12); buildings.push({ x: -21, z: -366, w: 18, d: 12 });
  wordSignQuad('PORT', '#1f3550', '#ffffff', [-27, 7.6, -359.9], [-15, 7.6, -359.9], [-15, 9.6, -359.9], [-27, 9.6, -359.9]);
  /* przystań: dwa pomosty z łodziami */
  pier(94, 98, -E - 40, -E + 0.2); pier(128, 132, -E - 40, -E + 0.2);
  BOAT_SPOTS.push({ x: 90.5, z: -E - 22, heading: Math.PI }, { x: 101.5, z: -E - 30, heading: Math.PI }, { x: 124.5, z: -E - 24, heading: Math.PI });
  /* latarnie */
  for (let x = -140; x <= 140; x += 28) lampSpots.push({ x: x, z: -E + 18.5, rot: Math.PI, y: 0 });
  for (let z = -290; z > -372; z -= 24) lampSpots.push({ x: ac.x + ac.hw + 0.9, z: z, rot: -Math.PI / 2, y: 0 });
  mapExtras.push({ t: 'rect', x0: ac.x - ac.hw, x1: ac.x + ac.hw, z0: ac.z1, z1: ac.z0, c: '#2b2e35' });
  mapExtras.push({ t: 'rect', x0: -150, x1: 150, z0: -E, z1: -E + 19, c: '#4a4c50' });
  mapExtras.push({ t: 'rect', x0: -150, x1: -60, z0: -372, z1: -300, c: '#3a3c40' });
  terrainLog.push({ kind: 'port', x: 0, z: -E + 10, r: 0, h: 0 });
}

/* --- przystań na wysepce lotniska (południowy brzeg, naprzeciw portu) --- */
function buildAirportHarbor(){
  const r = ISLANDS[1], z1 = r.z1;
  CB(0x9b7a55).plane(-40, 0.02, z1 - 7, 140, 14, 1, 1);                                             // drewniany deptak
  for (let x = -109.5; x < 30; x += 1.2) CB(0x7d6045).quad([x, 0.028, z1 - 14], [x, 0.028, z1], [x + 0.08, 0.028, z1], [x + 0.08, 0.028, z1 - 14], [0,0],[1,0],[1,1],[0,1]);
  quayPaint(-110, z1 - 1.2, 30, z1 - 1.2, 0.25, 0xe0b020);
  for (let x = -106; x <= 26; x += 10) CB(0x2a2c30).box(x, 0.3, z1 - 0.7, 0.4, 0.6, 0.4, 1, true);
  pier(-92, -88, z1 - 0.2, z1 + 32); pier(-12, -8, z1 - 0.2, z1 + 32);
  BOAT_SPOTS.push({ x: -95.5, z: z1 + 18, heading: 0 }, { x: -4.5, z: z1 + 22, heading: 0 });
  /* budynek przystani */
  CB(0xb98b5e).box(60, 3, z1 - 18, 16, 6, 10, 2, true);                                             // kasa biletowa (drewno; dach: landmarks.js)
  staticBox(60, 3, z1 - 18, 16, 6, 10); buildings.push({ x: 60, z: z1 - 18, w: 16, d: 10 });
  wordSignQuad('PRZYSTAŃ', '#1f3550', '#ffffff', [53, 4.2, z1 - 12.9], [67, 4.2, z1 - 12.9], [67, 5.6, z1 - 12.9], [53, 5.6, z1 - 12.9]);
  for (let x = -100; x <= 20; x += 30) lampSpots.push({ x: x, z: z1 - 13.5, rot: 0, y: 0 });             // wysięgnik nad deptakiem
  mapExtras.push({ t: 'rect', x0: -110, x1: 30, z0: z1 - 14, z1: z1, c: '#4a4c50' });
}
