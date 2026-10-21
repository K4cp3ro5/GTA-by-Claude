/* ---------------------------------------------------------------
   7. GENEROWANIE MIASTA
   --------------------------------------------------------------- */
const texs = {
  asphalt: texAsphalt(),
  road:    texRoad(),
  cross:   texCross(),
  crossStrip: texCrossTile(),
  walk:    texWalk(),
  curb:    texCurb(),
  roof:    texRoof()
};

const FACADES = [
  { wall:'#8d7f6d', band:'#7a6d5d', frame:'#4a4238', glass:'#2b3742', glow:'#ffd79a', lit:0.40, cols:4, grain:22 },
  { wall:'#6f7681', band:'#5f666f', frame:'#3a3f47', glass:'#22303c', glow:'#ffe6b4', lit:0.34, cols:4, grain:18 },
  { wall:'#a1958a', band:'#8c8177', frame:'#55493f', glass:'#2d3a44', glow:'#ffcf8a', lit:0.46, cols:5, grain:26 },
  { wall:'#4f5a63', band:'#434d55', frame:'#2e363d', glass:'#1b2831', glow:'#cfe6ff', lit:0.30, cols:5, grain:16 },
  { wall:'#7d6455', band:'#6b5648', frame:'#453529', glass:'#2a343d', glow:'#ffc978', lit:0.44, cols:4, grain:28 },
  { wall:'#9aa3a8', band:'#848d92', frame:'#4d5459', glass:'#26333c', glow:'#fff0c9', lit:0.28, cols:6, grain:14 },
  { wall:'#5c5148', band:'#4e453d', frame:'#332c26', glass:'#1f2a32', glow:'#ffb968', lit:0.50, cols:4, grain:30 },
  { wall:'#b3a894', band:'#9c9281', frame:'#5c5346', glass:'#31404b', glow:'#ffe3ae', lit:0.36, cols:5, grain:24 }
];

const facadeMats = FACADES.map(cfg => {
  const t = texFacade(cfg);
  return new THREE.MeshLambertMaterial({
    map: t.map,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: t.emissiveMap,
    emissiveIntensity: 0
  });
});

const roadBuf  = new GeoBuf();
const crossBuf = new GeoBuf();
const crosswalkBuf = new GeoBuf();
const roundaboutPaintBuf = new GeoBuf();
const walkBuf  = new GeoBuf();
const curbBuf  = new GeoBuf();
const roofBuf  = new GeoBuf();
const facadeBufs = FACADES.map(() => new GeoBuf());
const lawnBuf  = new GeoBuf();      // trawa: ogródki domków, kwartały pod estakadą, pas podmiejski

/* domki jednorodzinne (obrzeża): elewacja z oknami (4 kolory), dach dwuspadowy (3 kolory) */
function texHouse(wall){
  const S = 128, c = mkCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = wall; g.fillRect(0, 0, S, S);
  noiseOver(g, S, S, 10);
  g.fillStyle = '#3b4650';
  [[18, 30], [74, 30], [18, 84], [74, 84]].forEach(p => { g.fillRect(p[0], p[1], 36, 26); });
  g.strokeStyle = '#f4f1ea'; g.lineWidth = 3;
  [[18, 30], [74, 30], [18, 84], [74, 84]].forEach(p => { g.strokeRect(p[0], p[1], 36, 26); g.beginPath(); g.moveTo(p[0] + 18, p[1]); g.lineTo(p[0] + 18, p[1] + 26); g.stroke(); });
  return toTex(c);
}
const HOUSE_WALLS = ['#e6dcc8', '#d8c6a4', '#c8d0d4', '#e2c8b2'].map(texHouse);
const HOUSE_ROOFS = [0x9a4a32, 0x4a4d52, 0x6b4a36];
const houseWallBufs = HOUSE_WALLS.map(() => new GeoBuf()), houseRoofBufs = HOUSE_ROOFS.map(() => new GeoBuf());
function addHouse(cx, cz, w, d, h, roof){
  if (hwyRectCovered(cx, cz, w, d, 3.5)) return;
  const y0 = WALK_H, wb = houseWallBufs[randInt(0, 3)], rb = houseRoofBufs[randInt(0, 2)];
  const ridgeX = w >= d, rh = Math.min(w, d) * 0.36, ov = 0.35, top = y0 + h;
  wb.box(cx, y0 + h/2, cz, w, h, d, 3.2, false);
  if (roof === 'flat'){
    /* płaski dach z attyką */
    rb.box(cx, top + 0.2, cz, w + 0.3, 0.4, d + 0.3, 2, true);
  } else if (roof === 'hip'){
    /* czterospadowy: kalenica krótsza o połowę krótszego boku */
    const x0 = cx - w/2 - ov, x1 = cx + w/2 + ov, z0 = cz - d/2 - ov, z1 = cz + d/2 + ov, k = Math.min(w, d) / 2 + ov;
    if (ridgeX){
      const ra = [x0 + k, top + rh, cz], rb2 = [x1 - k, top + rh, cz];
      quadOut(rb, [x0, top, z0], [x1, top, z0], rb2, ra, [0, 1, -1]); quadOut(rb, [x0, top, z1], [x1, top, z1], rb2, ra, [0, 1, 1]);
      triOut(rb, [x0, top, z0], [x0, top, z1], ra, [-1, 1, 0]); triOut(rb, [x1, top, z0], [x1, top, z1], rb2, [1, 1, 0]);
    } else {
      const ra = [cx, top + rh, z0 + k], rb2 = [cx, top + rh, z1 - k];
      quadOut(rb, [x0, top, z0], [x0, top, z1], rb2, ra, [-1, 1, 0]); quadOut(rb, [x1, top, z0], [x1, top, z1], rb2, ra, [1, 1, 0]);
      triOut(rb, [x0, top, z0], [x1, top, z0], ra, [0, 1, -1]); triOut(rb, [x0, top, z1], [x1, top, z1], rb2, [0, 1, 1]);
    }
  } else if (ridgeX){
    const x0 = cx - w/2 - ov, x1 = cx + w/2 + ov, za = cz - d/2 - ov, zb = cz + d/2 + ov;
    quadOut(rb, [x0, top, za], [x1, top, za], [x1, top + rh, cz], [x0, top + rh, cz], [0, 1, -1]);
    quadOut(rb, [x0, top, zb], [x1, top, zb], [x1, top + rh, cz], [x0, top + rh, cz], [0, 1, 1]);
    [-1, 1].forEach(sx => { const x = cx + sx * w/2; triOut(wb, [x, top, cz - d/2], [x, top, cz + d/2], [x, top + rh * (d/2) / (d/2 + ov), cz], [sx, 0, 0]); });
  } else {
    const z0 = cz - d/2 - ov, z1 = cz + d/2 + ov, xa = cx - w/2 - ov, xb = cx + w/2 + ov;
    quadOut(rb, [xa, top, z0], [xa, top, z1], [cx, top + rh, z1], [cx, top + rh, z0], [-1, 1, 0]);
    quadOut(rb, [xb, top, z0], [xb, top, z1], [cx, top + rh, z1], [cx, top + rh, z0], [1, 1, 0]);
    [-1, 1].forEach(sz => { const z = cz + sz * d/2; triOut(wb, [cx - w/2, top, z], [cx + w/2, top, z], [cx, top + rh * (w/2) / (w/2 + ov), z], [0, 0, sz]); });
  }
  staticBox(cx, y0 + h/2, cz, w, h, d);
  buildings.push({ x: cx, z: cz, w: w, d: d });
}

/* --- podłoże poza miastem --- */
(function ground(){
  const t = texs.asphalt.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(200, 200);
  t.anisotropy = MAXA;
  t.needsUpdate = true;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(WALL_X * 2, WALL_X * 2),          // tylko wyspa główna (dookoła morze — islands.js)
    new THREE.MeshLambertMaterial({ map: t, color: 0x9d9d9d })
  );
  m.rotation.x = -Math.PI/2;
  m.position.y = -0.02;
  m.receiveShadow = true;
  scene.add(m);
})();

/* przejście dla pieszych (P-10) na wylocie ze skrzyżowania (i,j) — dir: 'px'/'nx'/'pz'/'nz'
   (w którą stronę świata od środka). Pas leży na jezdni tuż za krawędzią skrzyżowania
   (0.4–2.6 m), na całej szerokości jezdni, i łączy chodniki dwóch kwartałów po obu stronach
   ulicy — z tych przejść korzystają piesi (pedestrians.js). a/b = końce na chodnikach. */
const CW_OFF = ROAD_H + 0.4 + ROAD_W*0.08;            // 8.52: oś pasa od środka skrzyżowania
const crosswalks = [];
function crosswalkStrip(cx, cz, dir, i, j){
  const HW = ROAD_W/2, crossW = ROAD_W - 0.6, band = ROAD_W*0.16, y = 0.021, e = HW + 0.7;
  let qx, qz, sx, sz, rec;
  if (dir === 'pz'){ qx=cx; qz=cz+CW_OFF; sx=crossW; sz=band; rec = { a:{x:cx-e,z:qz}, b:{x:cx+e,z:qz}, blocks:[[i-1,j],[i,j]] }; }
  else if (dir === 'nz'){ qx=cx; qz=cz-CW_OFF; sx=crossW; sz=band; rec = { a:{x:cx-e,z:qz}, b:{x:cx+e,z:qz}, blocks:[[i-1,j-1],[i,j-1]] }; }
  else if (dir === 'px'){ qx=cx+CW_OFF; qz=cz; sx=band; sz=crossW; rec = { a:{x:qx,z:cz-e}, b:{x:qx,z:cz+e}, blocks:[[i,j-1],[i,j]] }; }
  else { qx=cx-CW_OFF; qz=cz; sx=band; sz=crossW; rec = { a:{x:qx,z:cz-e}, b:{x:qx,z:cz+e}, blocks:[[i-1,j-1],[i-1,j]] }; }
  /* road = przekraczana jezdnia: 'ns' (ulica wzdłuż Z, auta jadą N–S) albo 'ew' */
  crosswalks.push(Object.assign(rec, { x: qx, z: qz, i: i, j: j, dir: dir, road: (dir === 'pz' || dir === 'nz') ? 'ns' : 'ew', hw: sx/2, hd: sz/2 }));
  const hx = sx/2, hz = sz/2, k = crossW;            // kafel tekstury = 1 m (jeden pas zebry + przerwa)
  if (dir === 'pz' || dir === 'nz'){
    crosswalkBuf.quad([qx-hx,y,qz+hz],[qx+hx,y,qz+hz],[qx+hx,y,qz-hz],[qx-hx,y,qz-hz],
                       [0,0],[k,0],[k,1],[0,1]);
  } else {
    crosswalkBuf.quad([qx-hx,y,qz+hz],[qx+hx,y,qz+hz],[qx+hx,y,qz-hz],[qx-hx,y,qz-hz],
                       [0,1],[0,0],[k,0],[k,1]);
  }
}

/* skrzyżowania wyznaczone na ronda (patrz niżej, buildRoundabout) —
   nie dostają zwykłych pasów przejścia, bo to inny typ skrzyżowania */
const ROUNDABOUT_PTS = [[4,4],[8,4],[4,8],[8,8]];
function isRoundaboutPt(i, j){ return ROUNDABOUT_PTS.some(p => p[0] === i && p[1] === j); }

/* --- jezdnie i skrzyżowania --- */
for (let i = 0; i <= GRID; i++){
  const line = L(i);
  for (let s = 0; s < GRID; s++){
    const a = L(s) + ROAD_H, b = L(s+1) - ROAD_H, len = b - a, v = len / ROAD_TILE;
    /* ulica wzdłuż X (stała współrzędna Z = line) */
    roadBuf.quad([a,0.01,line+ROAD_H],[b,0.01,line+ROAD_H],[b,0.01,line-ROAD_H],[a,0.01,line-ROAD_H],
                 [0,0],[0,v],[1,v],[1,0]);
    /* ulica wzdłuż Z (stała współrzędna X = line) */
    roadBuf.quad([line-ROAD_H,0.01,b],[line+ROAD_H,0.01,b],[line+ROAD_H,0.01,a],[line-ROAD_H,0.01,a],
                 [0,0],[1,0],[1,v],[0,v]);
  }
}
/* skrzyżowania — przejścia dla pieszych NIE na każdej stronie każdego
   skrzyżowania: każda krawędź (o ile prowadzi do istniejącej ulicy, czyli
   nie wychodzi poza siatkę) dostaje pas z prawdopodobieństwem 55% */
for (let i = 0; i <= GRID; i++){
  for (let j = 0; j <= GRID; j++){
    /* rondo: asfalt skrzyżowania sięga do zewnętrznej krawędzi pasa okrężnego (R=9) i zakrywa oznakowanie ramion */
    if (isRoundaboutPt(i, j)) crossBuf.plane(L(i), 0.024, L(j), 18.4, 18.4, 1.3, 1.3);
    else crossBuf.plane(L(i), 0.02, L(j), ROAD_W, ROAD_W, 1, 1);
    const cx = L(i), cz = L(j);
    if (!isRoundaboutPt(i, j)){
      if (i < GRID && rnd() < 0.55) crosswalkStrip(cx, cz, 'px', i, j);
      if (i > 0    && rnd() < 0.55) crosswalkStrip(cx, cz, 'nx', i, j);
      if (j < GRID && rnd() < 0.55) crosswalkStrip(cx, cz, 'pz', i, j);
      if (j > 0    && rnd() < 0.55) crosswalkStrip(cx, cz, 'nz', i, j);
    }
  }
}

/* --- podesty chodników + budynki + detale --- */
const lampSpots = [];   // {x,z,rot, y?: podłoże (domyślnie chodnik), street?: latarnia przy krawężniku}
const treeSpots = [];   // {x,z,type,scale}
const binSpots  = [];
const hydSpots  = [];
const buildings = [];   // do minimapy
const pedBlockCandidates = [];   // {bi,bj} kwartały z chodnikiem — baza pętli spacerowych pieszych

function addBuilding(cx, cz, w, d, h, pool, yBase, shops){
  if (hwyRectCovered(cx, cz, w, d, 3.5)) return;             // pas zakazu zabudowy wzdłuż autostrad (hwy-plan.js)
  const v = pool ? pool[randInt(0, pool.length - 1)] : randInt(0, FACADES.length - 1);
  const y0 = (yBase === undefined) ? WALK_H : yBase;
  if (shops && h > 9){                                       // parter z witrynami (districts.js), wyżej elewacja z oknami
    shopBand(cx, cz, w, d, y0, 4.5);
    facadeBufs[v].box(cx, y0 + 4.5 + (h - 4.5)/2, cz, w, h - 4.5, d, 8, false);
  } else facadeBufs[v].box(cx, y0 + h/2, cz, w, h, d, 8, false);
  roofBuf.plane(cx, y0 + h, cz, w, d, w/6, d/6);
  /* attyka */
  const par = 0.45;
  roofBuf.quad([cx-w/2,y0+h,cz+d/2],[cx+w/2,y0+h,cz+d/2],[cx+w/2,y0+h+par,cz+d/2],[cx-w/2,y0+h+par,cz+d/2],[0,0],[w/6,0],[w/6,.1],[0,.1]);
  roofBuf.quad([cx+w/2,y0+h,cz-d/2],[cx-w/2,y0+h,cz-d/2],[cx-w/2,y0+h+par,cz-d/2],[cx+w/2,y0+h+par,cz-d/2],[0,0],[w/6,0],[w/6,.1],[0,.1]);
  roofBuf.quad([cx+w/2,y0+h,cz+d/2],[cx+w/2,y0+h,cz-d/2],[cx+w/2,y0+h+par,cz-d/2],[cx+w/2,y0+h+par,cz+d/2],[0,0],[d/6,0],[d/6,.1],[0,.1]);
  roofBuf.quad([cx-w/2,y0+h,cz-d/2],[cx-w/2,y0+h,cz+d/2],[cx-w/2,y0+h+par,cz+d/2],[cx-w/2,y0+h+par,cz-d/2],[0,0],[d/6,0],[d/6,.1],[0,.1]);

  staticBox(cx, y0 + h/2, cz, w, h, d);
  buildings.push({ x:cx, z:cz, w:w, d:d });
}

/* narożniki mapy: zamiast zwykłej zabudowy — plac trójkątny lub rondo,
   żeby granica miasta nie była wyłącznie kwadratowa */
/* --- przystanki autobusowe i parkingi (doc pkt 2) --- */
const busBuf = new GeoBuf();        // wiata (kolor stalowy)
const busSignBuf = new GeoBuf();    // żółta tabliczka przystankowa
const busStopSpots = [];            // środki wiat (latarnie omijają to miejsce)
function buildBusStop(cx, cz, side){
  /* side: 0=E, 1=W, 2=N, 3=S względem środka kwartału; wiata przy krawędzi chodnika */
  const e = LOT/2 - 0.7, y = WALK_H;
  const alongX = side >= 2;
  const px = side === 0 ? cx + e : side === 1 ? cx - e : cx + rand(-5, 5);
  const pz = side === 2 ? cz + e : side === 3 ? cz - e : cz + rand(-5, 5);
  if (hwyCovered(px, pz, 2)) return;
  const L1 = 3.2, T1 = 1.3;
  const w = alongX ? L1 : T1, d = alongX ? T1 : L1;
  busBuf.box(px, y + 2.35, pz, w, 0.14, d, 2, true);                     // dach
  const pxo = alongX ? L1/2 - 0.1 : 0, pzo = alongX ? 0 : L1/2 - 0.1;
  busBuf.box(px - pxo, y + 1.15, pz - pzo, 0.1, 2.3, 0.1, 2, true);
  busBuf.box(px + pxo, y + 1.15, pz + pzo, 0.1, 2.3, 0.1, 2, true);
  busBuf.box(px, y + 0.5, pz, alongX ? L1*0.7 : 0.35, 0.1, alongX ? 0.35 : L1*0.7, 2, true);   // ławka
  busSignBuf.box(px + (alongX ? L1/2 + 0.5 : 0), y + 2.5, pz + (alongX ? 0 : L1/2 + 0.5), 0.5, 0.5, 0.06, 1, true);
  staticBox(px, y + 1.2, pz, w, 2.4, d);
  busStopSpots.push({ x: px, z: pz });
}
function buildParkingBlock(cx, cz){
  const y = WALK_H;
  walkBuf.plane(cx, y, cz, LOT, LOT, LOT/4, LOT/4);
  curbBuf.box(cx, y/2, cz, LOT, y, LOT, 2, false);
  staticBox(cx, y/2, cz, LOT, y, LOT);
  crossBuf.plane(cx, y + 0.02, cz, LOT - 2, LOT - 2, 3, 3);               // asfalt placu
  /* miejsca postojowe: dwa rzędy po 8 stanowisk, malowane linie */
  for (let row = 0; row < 2; row++){
    const zc = cz + (row ? 1 : -1) * 6.2;
    for (let k = 0; k <= 8; k++){
      const lx = cx - 12 + k * 3.0;
      roundaboutPaintBuf.quad([lx-0.06,y+0.03,zc+2.6],[lx+0.06,y+0.03,zc+2.6],[lx+0.06,y+0.03,zc-2.6],[lx-0.06,y+0.03,zc-2.6],[0,0],[1,0],[1,1],[0,1]);
    }
  }
  for (const sx of [-1, 1]) lampSpots.push({ x: cx + sx*11.5, z: cz, rot: sx > 0 ? -Math.PI/2 : Math.PI/2 });
}
const PARKING_BLOCKS = [[2,6],[9,5],[6,2],[5,9]];

/* wszystkie 4 rogi miasta dostają plac zamiast zwykłej zabudowy —
   żeby obrys miasta nie był czystym kwadratem na całym obwodzie */
const SPECIAL_CORNERS = [
  { bi: 0,        bj: 0,        kind: 'tri'   },
  { bi: GRID - 1, bj: GRID - 1, kind: 'round' },
  { bi: 0,        bj: GRID - 1, kind: 'round' },
  { bi: GRID - 1, bj: 0,        kind: 'tri'   },
  /* parki przy krawędziach — wyłomy w zabudowie na wszystkich 4 bokach,
     żeby obrys miasta nie był czystym prostokątem (bi=11,bj~5-6 ominięte,
     tam wchodzi łącznica autostrady) */
  { bi: 3, bj: 0,         kind: 'park' }, { bi: 8, bj: 0,         kind: 'park' },
  { bi: 0, bj: 3,         kind: 'park' }, { bi: 0, bj: 5,         kind: 'park' }, { bi: 0, bj: 8, kind: 'park' },
  { bi: GRID - 1, bj: 3,  kind: 'park' },
  { bi: 3, bj: GRID - 1,  kind: 'park' }, { bi: 8, bj: GRID - 1,  kind: 'park' }
];
function specialCornerAt(bi, bj){ return SPECIAL_CORNERS.find(c => c.bi === bi && c.bj === bj); }

/* dzielnice: centrum (wieżowce), handlowa (wzdłuż głównych arterii),
   przemysłowa (zachód/południowy zachód: niskie, duże hale), mieszkalna (reszta, na obrzeżach domki) */
function districtAt(cx, cz){
  const dist = Math.hypot(cx, cz);
  return dist < 165 ? 'center' : (cx < -115 && cz < 45) ? 'industrial' : (Math.abs(cz) < 56 || Math.abs(cx) < 56) ? 'commercial' : 'residential';
}
function buildParkBlock(cx, cz){ return buildParkBlockFull(cx, cz); }   // districts.js

function buildCornerPlaza(cx, cz, kind){
  walkBuf.plane(cx, WALK_H, cz, LOT, LOT, LOT/4, LOT/4);
  curbBuf.box(cx, WALK_H/2, cz, LOT, WALK_H, LOT, 2, false);
  staticBox(cx, WALK_H/2, cz, LOT, WALK_H, LOT);

  if (kind === 'tri'){
    /* przekątna ściana od rogu (-,-) do (+,+) tego kwartału — dzieli plac na dwa trójkąty */
    const len = LOT * Math.SQRT2, T = 1.0, H = 2.4;
    const rotY = Math.atan2(-1, 1);   // kierunek świata (dx,dz)=(1,1), sprawdzone numerycznie
    curbBuf.boxRot(cx, WALK_H + H/2, cz, len, H, T, rotY, 3, true);
    staticBoxRot(cx, WALK_H + H/2, cz, len, H, T, rotY);
    /* niski obelisk na środku trójkąta bliżej centrum miasta */
    const inX = cx > 0 ? -1 : 1, inZ = cz > 0 ? -1 : 1;
    const mx = cx + inX * LOT * 0.22, mz = cz + inZ * LOT * 0.22;
    facadeBufs[3].box(mx, WALK_H + 3.2, mz, 1.1, 6.4, 1.1, 3, true);
    staticBox(mx, WALK_H + 3.2, mz, 1.1, 6.4, 1.1);
    for (let t = 0; t < 5; t++){
      const a = rand(0, TAU), rr = rand(3, LOT*0.36);
      treeSpots.push({ x: mx + Math.cos(a)*rr, z: mz + Math.sin(a)*rr, type: 0, scale: rand(0.9,1.3), rot: rnd()*TAU });
    }
  } else {
    /* okrągła wyspa na środku placu */
    const R = LOT * 0.34, H = 0.9;
    const seg = 22;
    for (let s = 0; s < seg; s++){
      const a0 = s/seg*TAU, a1 = (s+1)/seg*TAU;
      const x0 = cx + Math.cos(a0)*R, z0 = cz + Math.sin(a0)*R;
      const x1 = cx + Math.cos(a1)*R, z1 = cz + Math.sin(a1)*R;
      curbBuf.quad([x0,WALK_H,z0],[x1,WALK_H,z1],[x1,WALK_H+H,z1],[x0,WALK_H+H,z0], [0,0],[1,0],[1,1],[0,1]);
    }
    curbBuf.disc(cx, WALK_H + H, cz, R, seg);
    staticCylinder(cx, WALK_H + H/2, cz, R, H);
    facadeBufs[5].box(cx, WALK_H + H + 3.6, cz, 1.3, 7.2, 1.3, 3, true);
    staticBox(cx, WALK_H + H + 3.6, cz, 1.3, 7.2, 1.3);
    roundaboutPaintBuf.ring(cx, WALK_H + 0.01, cz, R + 2.0, R + 2.4, seg);
    lampSpots.push({ x:cx+R*0.7, z:cz+R*0.7, rot:0 }, { x:cx-R*0.7, z:cz-R*0.7, rot:0 },
                    { x:cx+R*0.7, z:cz-R*0.7, rot:0 }, { x:cx-R*0.7, z:cz+R*0.7, rot:0 });
  }
}

/* --- teren węzła i kwartały pod estakadami ---
   Węzeł koniczynowy zajmuje kwartały 3..8 × 3..8. Te z nich, które autostrada tylko zahacza
   (wnętrza pętli, trójkąty między pętlą, łącznicą i jezdnią), dostają zieleń: trawę, niskie kopce
   (czasza kuli — ta sama bryła w kolizji, więc da się po nich jechać), krzewy i drzewa, w dwóch
   wnętrzach pętli staw; ogrodzenie z furtką 3.5 m od krawężnika (piesi NPC chodzą chodnikiem obok).
   Kwartały w większości pod pomostem: parking z miejscami P-18, boisko do kosza albo zieleń z alejką
   i ławkami — wszystko omija filary (HWY_PIERS). terrainLog: kontrola statyczna w sim.js. */
const waterBuf = new GeoBuf(), fenceBuf = new GeoBuf(), courtBuf = new GeoBuf(), benchBuf = new GeoBuf(), pathBuf = new GeoBuf();
const terrainLog = [];
const IC_ZONE = (bi, bj) => bi >= 3 && bi <= 8 && bj >= 3 && bj <= 8;
const POND_BLOCKS = ['5,7', '7,5', '4,6'];
function deckClearAt(x, z){ const q = hwyQuery(x, z, 0.3); return q.length ? Math.min(...q.map(h => h.y)) - HP.slab - WALK_H : Infinity; }
function nearPierXZ(x, z, r){ return HWY_PIERS.some(p => Math.hypot(p.x - x, p.z - z) < r + p.size / 2 + 0.4); }
/* niski kopiec trawy: czasza kuli o promieniu podstawy r i wysokości h */
function mound(cx, cz, r, h){
  const Rs = (r*r + h*h) / (2*h), y0 = WALK_H + 0.012, seg = 16, rings = 5;
  const P = (k, s) => { const rr = r * k / rings, a = s / seg * TAU; return [cx + Math.cos(a)*rr, y0 + Math.sqrt(Math.max(0, Rs*Rs - rr*rr)) - (Rs - h), cz + Math.sin(a)*rr]; };
  for (let k = 0; k < rings; k++) for (let s = 0; s < seg; s++){
    if (k === 0) triOut(lawnBuf, P(0, 0), P(1, s), P(1, s + 1), [0, 1, 0]);
    else quadOut(lawnBuf, P(k, s), P(k, s + 1), P(k + 1, s + 1), P(k + 1, s), [0, 1, 0]);
  }
  staticShape(new CANNON.Sphere(Rs), cx, y0 + h - Rs, cz, undefined, true);
  terrainLog.push({ kind: 'mound', x: cx, z: cz, r: r, h: h });
}
/* staw: elipsa wody z kamiennym obrzeżem */
function pond(cx, cz, rx, rz){
  const seg = 24, y = WALK_H + 0.03;
  for (let s = 0; s < seg; s++){
    const a0 = s / seg * TAU, a1 = (s + 1) / seg * TAU;
    triOut(waterBuf, [cx, y, cz], [cx + Math.cos(a0)*rx, y, cz + Math.sin(a0)*rz], [cx + Math.cos(a1)*rx, y, cz + Math.sin(a1)*rz], [0, 1, 0]);
    const o0 = [cx + Math.cos(a0)*(rx + 0.6), y + 0.12, cz + Math.sin(a0)*(rz + 0.6)], o1 = [cx + Math.cos(a1)*(rx + 0.6), y + 0.12, cz + Math.sin(a1)*(rz + 0.6)];
    quadOut(curbBuf, [cx + Math.cos(a0)*rx, y + 0.12, cz + Math.sin(a0)*rz], [cx + Math.cos(a1)*rx, y + 0.12, cz + Math.sin(a1)*rz], o1, o0, [0, 1, 0]);
  }
  terrainLog.push({ kind: 'pond', x: cx, z: cz, r: Math.max(rx, rz) + 0.6, h: 0 });
}
/* ogrodzenie (słupki co 2 m, dwie poprzeczki, 1.1 m) z kolizją; odcinki przy filarach pomijane */
function fenceLine(x0, z0, x1, z1){
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2)), y = WALK_H;
  for (let k = 0; k < n; k++){
    const ax = lerp(x0, x1, k / n), az = lerp(z0, z1, k / n), bx = lerp(x0, x1, (k + 1) / n), bz = lerp(z0, z1, (k + 1) / n);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, l = len / n, rot = Math.atan2(bx - ax, bz - az);
    if (nearPierXZ(mx, mz, 0.8) || deckClearAt(mx, mz) < 2) continue;
    fenceBuf.box(ax, y + 0.55, az, 0.07, 1.1, 0.07, 1, true);
    fenceBuf.boxRot(mx, y + 1.05, mz, 0.05, 0.05, l, rot, 1, true);
    fenceBuf.boxRot(mx, y + 0.55, mz, 0.04, 0.04, l, rot, 1, true);
    staticBoxRot(mx, y + 0.55, mz, 0.1, 1.1, l, rot);
  }
}
function bench(x, z, rot){
  if (nearPierXZ(x, z, 1.2)) return;
  benchBuf.boxRot(x, WALK_H + 0.45, z, 1.7, 0.08, 0.45, rot, 1, true);
  const bx = x - Math.sin(rot + Math.PI/2) * 0.2, bz = z - Math.cos(rot + Math.PI/2) * 0.2;
  benchBuf.boxRot(bx, WALK_H + 0.75, bz, 1.7, 0.4, 0.06, rot, 1, true);
  fenceBuf.boxRot(x, WALK_H + 0.22, z, 1.5, 0.44, 0.3, rot, 1, true);
  staticBoxRot(x, WALK_H + 0.45, z, 1.7, 0.9, 0.5, rot);
}
/* wolne miejsce w kwartale: losowe próby, warunek ok(x, z) */
function freeSpot(cx, cz, lim, ok){
  for (let t = 0; t < 30; t++){ const x = cx + rand(-lim, lim), z = cz + rand(-lim, lim); if (ok(x, z)) return { x: x, z: z }; }
  return null;
}
/* zieleń węzła (kwartał zahaczony przez autostradę, bez budynków) — podest i pętla pieszych już są */
function buildInterchangeGreen(cx, cz, bi, bj){
  lawnBuf.plane(cx, WALK_H + 0.012, cz, LOT - 5, LOT - 5, 4, 4);
  const taken = [];
  const free = (x, z, r) => !taken.some(t => Math.hypot(t.x - x, t.z - z) < t.r + r + 1) && !nearPierXZ(x, z, r + 1);
  if (POND_BLOCKS.includes(bi + ',' + bj)){
    const rx = rand(5, 7), rz = rand(3.8, 5.2), p = freeSpot(cx, cz, 10.5 - rx, (x, z) => free(x, z, rx) && !hwyCovered(x, z, rx + 0.5));
    if (p){ pond(p.x, p.z, rx, rz); taken.push({ x: p.x, z: p.z, r: rx + 0.6 }); }
  }
  const nm = randInt(1, 2);
  for (let m = 0; m < nm; m++){
    const r = rand(4, 6), h = rand(0.6, 1.1);
    const p = freeSpot(cx, cz, 11 - r, (x, z) => free(x, z, r) &&
      [[0,0],[1,0],[-1,0],[0,1],[0,-1],[0.7,0.7],[-0.7,-0.7],[0.7,-0.7],[-0.7,0.7]].every(q => deckClearAt(x + q[0]*r, z + q[1]*r) > h + 3));
    if (p){ mound(p.x, p.z, r, h); taken.push({ x: p.x, z: p.z, r: r }); }
  }
  for (let t = 0; t < 14; t++){
    const big = t < 8, p = freeSpot(cx, cz, 10.5, (x, z) => free(x, z, big ? 1.2 : 0.6));
    if (!p) continue;
    treeSpots.push({ x: p.x, z: p.z, type: big ? randInt(0, 1) : 1, scale: big ? rand(0.85, 1.3) : rand(0.4, 0.6), rot: rnd() * TAU });
  }
  /* ogrodzenie 3.5 m od krawężnika z furtką od losowej strony */
  const e = LOT/2 - 3.5, gate = randInt(0, 3), g = 1.6;
  const sides = [[cx - e, cz - e, cx + e, cz - e], [cx + e, cz - e, cx + e, cz + e], [cx + e, cz + e, cx - e, cz + e], [cx - e, cz + e, cx - e, cz - e]];
  sides.forEach((sd, k) => {
    if (k !== gate) return fenceLine(sd[0], sd[1], sd[2], sd[3]);
    const mx = (sd[0] + sd[2]) / 2, mz = (sd[1] + sd[3]) / 2, ux = Math.sign(sd[2] - sd[0]), uz = Math.sign(sd[3] - sd[1]);
    fenceLine(sd[0], sd[1], mx - ux * g, mz - uz * g); fenceLine(mx + ux * g, mz + uz * g, sd[2], sd[3]);
  });
  terrainLog.push({ kind: 'green', x: cx, z: cz, r: 0, h: 0 });
}
/* kwartał w większości pod pomostem: podest + parking / boisko / zieleń z alejką */
function buildUnderpassBlock(cx, cz){
  walkBuf.plane(cx, WALK_H, cz, LOT, LOT, LOT/4, LOT/4);
  curbBuf.box(cx, WALK_H/2, cz, LOT, WALK_H, LOT, 2, false);
  staticBox(cx, WALK_H/2, cz, LOT, WALK_H, LOT);
  const y = WALK_H, r = rnd();
  const line = (x0, z0, x1, z1, w) => {               // biała linia malowana
    const l = Math.hypot(x1 - x0, z1 - z0) || 1, nx = -(z1 - z0) / l * w / 2, nz = (x1 - x0) / l * w / 2;
    roundaboutPaintBuf.quad([x0 - nx, y + 0.035, z0 - nz], [x0 + nx, y + 0.035, z0 + nz], [x1 + nx, y + 0.035, z1 + nz], [x1 - nx, y + 0.035, z1 - nz], [0,0],[1,0],[1,1],[0,1]);
  };
  if (r < 0.75){
    crossBuf.plane(cx, y + 0.02, cz, LOT - 3, LOT - 3, 3, 3);
    /* boisko: pół kosza 9 × 9 w wolnym narożniku (bez filarów), reszta parkingu */
    let court = null;
    if (r >= 0.5) for (const q of [[1,1],[-1,-1],[1,-1],[-1,1]]){
      const x = cx + q[0] * 6.8, z = cz + q[1] * 6.8;
      if (!HWY_PIERS.some(p => Math.hypot(p.x - x, p.z - z) < 7 + p.size / 2) && deckClearAt(x, z) > 4.5){ court = { x: x, z: z, q: q }; break; }
    }
    if (court){
      courtBuf.plane(court.x, y + 0.028, court.z, 9, 9, 1, 1);
      const x0 = court.x - 4.5, x1 = court.x + 4.5, z0 = court.z - 4.5, z1 = court.z + 4.5;
      line(x0, z0, x1, z0, 0.08); line(x1, z0, x1, z1, 0.08); line(x1, z1, x0, z1, 0.08); line(x0, z1, x0, z0, 0.08);
      /* kosz po stronie dalszej od środka kwartału */
      const hx = court.x + court.q[0] * 3.9, hz = court.z;
      fenceBuf.box(hx + court.q[0] * 0.4, y + 1.55, hz, 0.12, 3.1, 0.12, 1, true);
      fenceBuf.box(hx, y + 3.2, hz, 0.05, 1.05, 1.8, 1, true);
      staticBox(hx + court.q[0] * 0.4, y + 1.55, hz, 0.15, 3.1, 0.15);
      line(hx - court.q[0] * 4.6, z0, hx - court.q[0] * 4.6, z1, 0.08);
      terrainLog.push({ kind: 'court', x: court.x, z: court.z, r: 6.4, h: 3.7 });
    }
    /* miejsca postojowe P-18: 3 rzędy po 10, stanowisko 2.5 × 5 m, pomijane przy filarach i boisku */
    for (const zr of [-9, 0, 9]) for (let k = -5; k < 5; k++){
      const x = cx + (k + 0.5) * 2.5, z = cz + zr;
      if (nearPierXZ(x, z, 2.4) || (court && Math.abs(x - court.x) < 6 && Math.abs(z - court.z) < 7.5)) continue;
      line(x - 1.25, z - 2.5, x - 1.25, z + 2.5, 0.1); line(x + 1.25, z - 2.5, x + 1.25, z + 2.5, 0.1);
      line(x - 1.25, z + (zr < 0 ? -2.5 : 2.5), x + 1.25, z + (zr < 0 ? -2.5 : 2.5), 0.1);
    }
  } else {
    /* zieleń z alejką i ławkami */
    lawnBuf.plane(cx, y + 0.012, cz, LOT - 5, LOT - 5, 4, 4);
    pathBuf.plane(cx, y + 0.024, cz, LOT - 5, 2.4, LOT / 4, 1);
    pathBuf.plane(cx, y + 0.026, cz, 2.4, LOT - 5, 1, LOT / 4);
    for (const o of [-8, 8]){ bench(cx + o, cz + 2.0, 0); bench(cx + 2.0, cz + o, Math.PI / 2); }
    for (let t = 0; t < 6; t++){ const p = freeSpot(cx, cz, 11, (x, z) => Math.abs(x - cx) > 2.5 && Math.abs(z - cz) > 2.5 && !nearPierXZ(x, z, 1.5)); if (p) treeSpots.push({ x: p.x, z: p.z, type: randInt(0, 1), scale: rand(0.8, 1.2), rot: rnd() * TAU }); }
  }
}
/* kwartały specjalne poza siatką narożników: plac z fontanną (centrum), galeria handlowa (dzielnica handlowa),
   dwa dodatkowe parki (mieszkaniówka) — pierwsze wolne od autostrady z listy kandydatów */
const _freeBlock = (bi, bj) => hwyBlockFrac(bi, bj) === 0 && !PARKING_BLOCKS.some(p => p[0] === bi && p[1] === bj) && !specialCornerAt(bi, bj);
const PLAZA_BLOCK = [[2,5],[5,2],[9,6],[6,9],[2,6],[6,2]].find(b => _freeBlock(b[0], b[1]));
const MALL_BLOCK = [[1,6],[10,5],[6,10],[5,1],[1,5],[10,6]].find(b => _freeBlock(b[0], b[1]) && districtAt(blockCenter(b[0]), blockCenter(b[1])) === 'commercial');
[[2,9],[9,2],[1,8],[10,3]].filter(b => _freeBlock(b[0], b[1])).slice(0, 2).forEach(b => SPECIAL_CORNERS.push({ bi: b[0], bj: b[1], kind: 'park' }));
const isBlock = (b, bi, bj) => b && b[0] === bi && b[1] === bj;
for (let bi = 0; bi < GRID; bi++){
  for (let bj = 0; bj < GRID; bj++){
    const cx = blockCenter(bi), cz = blockCenter(bj);
    const hwFrac = hwyBlockFrac(bi, bj);
    if (hwFrac > 0.5 || (hwFrac > 0 && specialCornerAt(bi, bj) && specialCornerAt(bi, bj).kind !== 'park')){ buildUnderpassBlock(cx, cz); continue; }
    const icGreen = hwFrac > 0 && IC_ZONE(bi, bj);               // zieleń węzła zamiast zabudowy

    if (PARKING_BLOCKS.some(p => p[0] === bi && p[1] === bj)){ buildParkingBlock(cx, cz); continue; }
    const special = specialCornerAt(bi, bj);
    if (special){
      if (special.kind === 'park') buildParkBlock(cx, cz);
      else buildCornerPlaza(cx, cz, special.kind);
      continue;
    }

    /* podest chodnika */
    walkBuf.plane(cx, WALK_H, cz, LOT, LOT, LOT/4, LOT/4);
    curbBuf.box(cx, WALK_H/2, cz, LOT, WALK_H, LOT, 2, false);
    staticBox(cx, WALK_H/2, cz, LOT, WALK_H, LOT);
    /* pętla spacerowa pieszych (2 m od krawędzi) tylko tam, gdzie nie biegnie pod estakadą */
    const pi = LOT/2 - 2;
    if (![[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]].some(q => hwyCovered(cx + q[0]*pi, cz + q[1]*pi, 1))) pedBlockCandidates.push({ bi: bi, bj: bj });

    /* dzielnice: centrum (wieżowce), handlowa (wzdłuż głównych arterii),
       przemysłowa (zachód/południowy zachód: niskie, duże hale), mieszkalna (reszta, na obrzeżach domki) */
    const dist = Math.hypot(cx, cz);
    const district = districtAt(cx, cz);
    const POOL = { center:[3,5,1], commercial:[5,1,7,2], industrial:[6,3,0], residential:[0,2,4,7] }[district];
    const area = LOT - 6;             // 24 — pas chodnika 3 m dookoła
    const r = rnd();
    const g = 1.6, s = (area - g) / 2;
    const H = {
      center:      () => rand(60, 130),
      commercial:  () => rand(16, 38),
      industrial:  () => rand(6, 13),
      residential: () => rand(9, 21)
    }[district];
    const pSingle = { center: 0.60, commercial: 0.30, industrial: 0.70, residential: 0.10 }[district];
    const pPair   = { center: 0.40, commercial: 0.40, industrial: 0.25, residential: 0.25 }[district];

    const shops = district === 'center' || district === 'commercial';
    if (icGreen) buildInterchangeGreen(cx, cz, bi, bj);
    else if (isBlock(PLAZA_BLOCK, bi, bj)) buildPlaza(cx, cz);
    else if (isBlock(MALL_BLOCK, bi, bj)) buildMall(cx, cz);
    else if (district === 'industrial') buildIndustrialBlock(cx, cz);
    else if (district === 'residential' && dist > 215){
      /* obrzeża: 4 albo 6 domków na działkach z żywopłotem, podjazdem, czasem garażem */
      lawnBuf.plane(cx, WALK_H + 0.012, cz, LOT - 5, LOT - 5, 4, 4);
      const six = r < 0.45, floors = () => (rnd() < 0.5 ? 3.6 : 6.4);
      if (six){ for (const ox of [-8, 0, 8]) for (const oz of [-6, 6]) addHouseLot(cx + ox, cz + oz, 8, 12, Math.sign(oz), rand(6.2, 6.8), rand(7.5, 8.5), floors()); }
      else { for (const ox of [-6, 6]) for (const oz of [-6, 6]) addHouseLot(cx + ox, cz + oz, 12, 12, Math.sign(oz), rand(7, 7.6), rand(7.5, 8.5), floors()); }
    } else if (district === 'residential'){
      /* pierścień środkowy: bloki 4–10 pięter z balkonami */
      const fl = () => randInt(4, 10);
      if (r < 0.5) addBlok(cx, cz, area - rand(0, 2), rand(11, 13), fl(), POOL);
      else for (const o of [-1, 1]) addBlok(cx + o * (s + g) / 2, cz, s - rand(0, 1), area - rand(0, 2), fl(), POOL);
    } else if (r < pSingle){
      const w = area - rand(0,3), d = area - rand(0,3);
      if (district === 'center') addTower(cx, cz, w, d, H(), POOL); else addBuilding(cx, cz, w, d, H(), POOL, undefined, shops);
    } else if (r < pSingle + pPair){
      const vertical = rnd() < 0.5;
      for (let k = 0; k < 2; k++){
        const off = (k === 0 ? -1 : 1) * (s + g) / 2;
        const w = vertical ? s : area, d = vertical ? area : s;
        if (district === 'center') addTower(cx + (vertical ? off : 0), cz + (vertical ? 0 : off), w - rand(0,1.2), d - rand(0,1.2), H(), POOL);
        else addBuilding(cx + (vertical ? off : 0), cz + (vertical ? 0 : off), w - rand(0,1.2), d - rand(0,1.2), H(), POOL, undefined, shops);
      }
    } else {
      for (let a = 0; a < 2; a++){
        for (let b = 0; b < 2; b++){
          if (rnd() < 0.1) continue;   // podwórko / parking
          const ox = (a ? 1 : -1) * (s + g) / 2;
          const oz = (b ? 1 : -1) * (s + g) / 2;
          addBuilding(cx + ox, cz + oz, s - rand(0,1.4), s - rand(0,1.4), H() * 0.8, POOL, undefined, shops);
        }
      }
    }

    if (!icGreen && !isBlock(PLAZA_BLOCK, bi, bj) && !isBlock(MALL_BLOCK, bi, bj) && (district === 'center' || district === 'commercial') && rnd() < 0.30) buildBusStop(cx, cz, randInt(0, 3));

    /* detale na obrzeżu kwartału */
    const edge = LOT/2 - 1.3;
    /* latarnie 0.6 m od krawężnika, wysięgnik (lokalne +Z, kierunek (sin rot, cos rot)) nad jezdnię;
       pomijane, gdy w tym miejscu stoi wiata przystanku */
    const edgeL = LOT/2 - 0.6;
    const lamp = (x, z, rot) => { if (!busStopSpots.some(b => Math.hypot(b.x - x, b.z - z) < 3)) lampSpots.push({ x: x, z: z, rot: rot, street: true }); };
    lamp(cx + edgeL, cz + rand(-edge*0.55, edge*0.55), Math.PI/2);
    lamp(cx + rand(-edge*0.55, edge*0.55), cz - edgeL, Math.PI);
    if ((bi + bj) % 2 === 0) lamp(cx - edgeL, cz + rand(-edge*0.5, edge*0.5), -Math.PI/2);
    for (let t = 0; t < 3; t++){
      const side = randInt(0,3);
      const p = rand(-edge*0.8, edge*0.8);
      const sp = side === 0 ? { x:cx+edge, z:cz+p } :
                 side === 1 ? { x:cx-edge, z:cz+p } :
                 side === 2 ? { x:cx+p, z:cz+edge } : { x:cx+p, z:cz-edge };
      sp.type  = rnd() < 0.5 ? 0 : 1;
      sp.scale = rand(0.82, 1.32);
      sp.rot   = rnd() * TAU;
      treeSpots.push(sp);
    }
    if (rnd() < 0.75){
      const side = randInt(0,3), p = rand(-edge*0.7, edge*0.7);
      binSpots.push(side === 0 ? { x:cx+edge-0.3, z:cz+p } :
                    side === 1 ? { x:cx-edge+0.3, z:cz+p } :
                    side === 2 ? { x:cx+p, z:cz+edge-0.3 } : { x:cx+p, z:cz-edge+0.3 });
    }
    if (rnd() < 0.55){
      const side = randInt(0,3), p = rand(-edge*0.6, edge*0.6);
      hydSpots.push(side === 0 ? { x:cx+edge-0.5, z:cz+p } :
                    side === 1 ? { x:cx-edge+0.5, z:cz+p } :
                    side === 2 ? { x:cx+p, z:cz+edge-0.5 } : { x:cx+p, z:cz-edge+0.5 });
    }
  }
}

/* detale (latarnie, drzewa, kosze, hydranty) nie pod autostradą i nie przy filarach */
(function clearUnderHighways(){
  const nearPier = (s, r) => HWY_PIERS.some(p => Math.hypot(p.x - s.x, p.z - s.z) < r + p.size/2);
  const keep = (list, margin, r) => { const k = list.filter(s => !hwyCovered(s.x, s.z, margin) && !nearPier(s, r)); list.length = 0; k.forEach(s => list.push(s)); };
  keep(lampSpots, 1.0, 1.2); keep(treeSpots, 2.2, 1.8); keep(binSpots, 0.4, 1.0); keep(hydSpots, 0.4, 1.0);
})();

/* --- pas podmiejski (między obwodnicą a murem): trawa i drzewa (poza drogami) --- */
(function suburbanBelt(){
  const e = CITY_EDGE, W = WALL_X - 0.6, y = -0.008;
  lawnBuf.plane(0, y, (e + W) / 2, 2 * W, W - e, 40, 6);
  lawnBuf.plane(0, y, -(e + W) / 2, 2 * W, W - e, 40, 6);
  lawnBuf.plane((e + W) / 2, y, 0, W - e, 2 * e, 6, 30);
  lawnBuf.plane(-(e + W) / 2, y, 0, W - e, 2 * e, 6, 30);
  for (let t = 0; t < 260; t++){
    const side = randInt(0, 3), along = rand(-W + 4, W - 4), depth = rand(e + 6, W - 4);
    const x = side < 2 ? along : (side === 2 ? depth : -depth), z = side < 2 ? (side === 0 ? depth : -depth) : along;
    if (hwyQuery(x, z, 4).length) continue;
    treeSpots.push({ x: x, z: z, y: 0, type: randInt(0, 1), scale: rand(0.9, 1.5), rot: rnd() * TAU });
  }
})();

buildIslands();
buildGasStation();
buildAirport();
buildAirportWest();
buildHospital();

/* (dawny mur dookoła świata zastąpiony nabrzeżem z balustradą — islands.js) */

/* --- RONDA (skrzyżowania ROUNDABOUT_PTS) ---
   Jednolite parametry wszystkich rond (metry, od środka skrzyżowania):
   wyspa centralna R=3.6 (krawężnik 0.3 m + trawa, z kolizją), opaska R=3.6–4.5 (najazdowa, 8 cm),
   pas okrężny 4.5–9.0 (4.5 m), tor auta po okręgu r=6.75 (nadwozie 5.8–7.7 — zapas do opaski i krawędzi).
   Zewnętrzna krawędź R=9 < 9.9 (narożnik kwartału), więc rondo mieści się w krzyżu jezdni.
   Wlot i wylot: łuk R=8 styczny do pasa wlotu/wylotu (3.5 m od osi) i do toru na rondzie,
   wysepka rozdzielająca na osi ramienia 9.6–19 m (krawężnik 15 cm), linia P-13 na wlocie,
   A-7 nad C-12 przy prawej krawędzi wlotu, C-9 na czole wysepki.
   Auta jeżdżą przeciwnie do wskazówek zegara (z góry): kąt a w parametryzacji (sin a, cos a) rośnie. */
const RB = { island: 3.6, apron: 4.5, ringR: 6.75, outer: 9.0, lane: 3.5, fillet: 8, cornerR: 3.5,
             yieldAt: 10.5, splitFrom: 9.6, splitTo: 19, splitW0: 1.1, splitW1: 0.25 };
/* auto czekające na wjazd stoi środkiem >= commit od środka ronda, czyli przodem (2.05) przed krawędzią
   pasa okrężnego — inaczej jadący po rondzie musieliby je omijać i oba czekałyby na siebie */
RB.commit = RB.outer + 2.3;
(function(){
  const r = RB.ringR, Rf = RB.fillet, ln = RB.lane;
  RB.filletAlong = Math.sqrt((r + Rf)*(r + Rf) - (ln + Rf)*(ln + Rf));     // 9.24: początek łuku wlotu na pasie
  RB.tanAlong = RB.filletAlong * r / (r + Rf);                             // 4.23: punkt styczności z torem na rondzie
  RB.tanLat   = (ln + Rf) * r / (r + Rf);                                  // 5.26
})();
const RB_ARMS = [ {x:0,z:1}, {x:0,z:-1}, {x:1,z:0}, {x:-1,z:0} ];          // u = od środka ronda w stronę ramienia
const grassBuf = new GeoBuf(), apronBuf = new GeoBuf();
function rbArc(buf, cx, cz, r0, r1, a0, a1, y, seg){                       // płaski wycinek pierścienia, normalna w górę
  for (let s = 0; s < seg; s++){
    const t0 = a0 + (a1 - a0) * s/seg, t1 = a0 + (a1 - a0) * (s+1)/seg;
    const P = (rr, t) => [cx + Math.sin(t)*rr, y, cz + Math.cos(t)*rr];
    quadOut(buf, P(r0,t0), P(r0,t1), P(r1,t1), P(r1,t0), [0,1,0]);
  }
}
function rbCylinderSide(buf, cx, cz, R, y0, y1, seg){                      // pobocznica walca, normalne na zewnątrz
  for (let s = 0; s < seg; s++){
    const a0 = s/seg*TAU, a1 = (s+1)/seg*TAU, am = (a0 + a1)/2;
    const x0 = cx + Math.sin(a0)*R, z0 = cz + Math.cos(a0)*R, x1 = cx + Math.sin(a1)*R, z1 = cz + Math.cos(a1)*R;
    quadOut(buf, [x0,y0,z0], [x1,y0,z1], [x1,y1,z1], [x0,y1,z0], [Math.sin(am), 0, Math.cos(am)]);
  }
}
function buildRoundabout(cx, cz){
  const seg = 32;
  /* wyspa centralna z kolizją (krawężnik nie do przejechania) + opaska najazdowa */
  rbCylinderSide(curbBuf, cx, cz, RB.island, 0.02, 0.32, seg);
  grassBuf.disc(cx, 0.32, cz, RB.island, seg);
  staticCylinder(cx, 0.3, cz, RB.island, 0.6);
  rbCylinderSide(curbBuf, cx, cz, RB.apron, 0.02, 0.10, seg);
  rbArc(apronBuf, cx, cz, RB.island, RB.apron, 0, TAU, 0.10, seg);
  staticCylinder(cx, 0.05, cz, RB.apron, 0.1);
  facadeBufs[2].box(cx, 0.32 + 1.6, cz, 0.7, 3.2, 0.7, 2, true);          // pomnik na wyspie
  /* zewnętrzna krawędź pasa okrężnego: ciągła tylko między ramionami (±6° od przekątnej — dalej okrąg
     R=9 wychodzi już na jezdnię ramienia), na wlotach i wylotach przerywana (P-7b, 1 m kreska / 1 m przerwy) */
  const half = Math.asin(ROAD_H / RB.outer) - Math.PI/4, dash = 1 / RB.outer;
  for (let k = 0; k < 4; k++){
    const am = Math.PI/4 + k*Math.PI/2;
    rbArc(roundaboutPaintBuf, cx, cz, RB.outer - 0.15, RB.outer, am - half, am + half, 0.03, 2);
    for (let a = am + half + dash; a + dash < am + Math.PI/2 - half; a += 2*dash) rbArc(roundaboutPaintBuf, cx, cz, RB.outer - 0.15, RB.outer, a, a + dash, 0.03, 1);
  }
  RB_ARMS.forEach(u => {
    const v = { x: u.z, z: -u.x };                                         // strona pasa WLOTU (prawa kierowcy jadącego do ronda)
    const P = (al, lat, y) => [cx + u.x*al + v.x*lat, y, cz + u.z*al + v.z*lat];
    /* P-13 (linia warunkowego zatrzymania złożona z trójkątów) w poprzek wlotu, wierzchołkami do kierowcy */
    for (let lat = RB.splitW0 + 0.45; lat < ROAD_H - 0.3; lat += 0.75){
      quadOut(roundaboutPaintBuf, P(RB.splitFrom + 0.1, lat - 0.25, 0.03), P(RB.splitFrom + 0.1, lat + 0.25, 0.03),
              P(RB.splitFrom + 0.7, lat, 0.03), P(RB.splitFrom + 0.7, lat, 0.03), [0,1,0]);
    }
    /* wysepka rozdzielająca: trapez na osi ramienia, krawężnik 15 cm */
    const a0 = RB.splitFrom, a1 = RB.splitTo, w0 = RB.splitW0, w1 = RB.splitW1, h = 0.15;
    const A = P(a0, -w0, h), B = P(a0, w0, h), C = P(a1, w1, h), D = P(a1, -w1, h);
    quadOut(walkBuf, A, B, C, D, [0,1,0]);
    const side = (p, q, out) => quadOut(curbBuf, [p[0],0.02,p[2]], [q[0],0.02,q[2]], [q[0],h,q[2]], [p[0],h,p[2]], out);
    side(A, B, [-u.x,0,-u.z]); side(C, D, [u.x,0,u.z]); side(B, C, [v.x,0,v.z]); side(D, A, [-v.x,0,-v.z]);
    const mid = (a0 + a1)/2;
    [[a0, mid, w0], [mid, a1, (w0 + w1)/2]].forEach(b => {
      const c0 = P((b[0] + b[1])/2, 0, h/2), lx = Math.abs(u.x) ? (b[1] - b[0]) : 2*b[2], lz = Math.abs(u.z) ? (b[1] - b[0]) : 2*b[2];
      staticBox(c0[0], h/2, c0[2], lx, h, lz);
    });
    /* znaki: A-7 nad C-12 przy prawej krawędzi wlotu (chodnik), C-9 na czole wysepki */
    const s1 = approachSpot(cx, cz, u, RB.yieldAt + 0.8, ROAD_H + 0.9);
    placeSign(s1.x, s1.z, s1.rot, [FACE.C12(), FACE.A7()]);
    const s2 = approachSpot(cx, cz, u, RB.splitTo - 0.5, 0);
    placeSign(s2.x, s2.z, s2.rot, [FACE.C9()], { base: h, bottom: 0.6 });
  });
  mapExtras.push({ t:'disc', x: cx, z: cz, r: RB.apron, c:'#3d5a3a' });
}
ROUNDABOUT_PTS.forEach(p => buildRoundabout(L(p[0]), L(p[1])));

/* Trasa przez rondo dla auta wjeżdżającego z ramienia uIn i zjeżdżającego w ramię uOut
   (wektory jednostkowe od środka). Zwraca punkty od miejsca ustąpienia pierwszeństwa (first)
   do prostego wyjazdu; k: 'in' (dojazd/łuk wlotu), 'ring' (pas okrężny), 'out' (łuk wylotu). */
function roundaboutRoute(ri, uIn, uOut){
  const c = { x: L(ROUNDABOUT_PTS[ri][0]), z: L(ROUNDABOUT_PTS[ri][1]) };
  const vIn = { x: uIn.z, z: -uIn.x }, vOut = { x: uOut.z, z: -uOut.x };
  const at = (u, v, al, lat) => ({ x: c.x + u.x*al + v.x*lat, z: c.z + u.z*al + v.z*lat });
  const pts = [], push = (p, k, extra) => pts.push(Object.assign({ x: p.x, z: p.z, rb: ri, k: k }, extra || {}));
  /* łuk o środku o od punktu p do q (krótszą drogą), punkty co ~2.5 m (bez p, z q) */
  const arc = (o, p, q, R, k) => {
    const a0 = Math.atan2(p.x - o.x, p.z - o.z), a1 = Math.atan2(q.x - o.x, q.z - o.z);
    const da = wrapAngle(a1 - a0), n = Math.max(1, Math.ceil(Math.abs(da) * R / 2.5));
    for (let i = 1; i <= n; i++){ const a = a0 + da*i/n; push({ x: o.x + Math.sin(a)*R, z: o.z + Math.cos(a)*R }, k); }
  };
  push(at(uIn, vIn, RB.yieldAt, RB.lane), 'in', { first: true });
  const right = (uOut.x === vIn.x && uOut.z === vIn.z);                    // wylot w ramię po prawej: skręt łukiem przy narożniku
  if (right){
    const R = RB.cornerR, o = at(uIn, vIn, RB.lane + R, RB.lane + R);
    const s = at(uIn, vIn, RB.lane + R, RB.lane), e = at(uIn, vIn, RB.lane, RB.lane + R);
    push(s, 'in'); arc(o, s, e, R, 'ring');
  } else {
    const LE = at(uIn, vIn, RB.filletAlong, RB.lane), TE = at(uIn, vIn, RB.tanAlong, RB.tanLat), CE = at(uIn, vIn, RB.filletAlong, RB.lane + RB.fillet);
    const TX = at(uOut, vOut, RB.tanAlong, -RB.tanLat), LX = at(uOut, vOut, RB.filletAlong, -RB.lane), CX = at(uOut, vOut, RB.filletAlong, -RB.lane - RB.fillet);
    push(LE, 'in'); arc(CE, LE, TE, RB.fillet, 'in');
    const aE = Math.atan2(TE.x - c.x, TE.z - c.z);
    let aX = Math.atan2(TX.x - c.x, TX.z - c.z);
    while (aX <= aE) aX += TAU;                                            // przeciwnie do wskazówek zegara: kąt rośnie
    const n = Math.ceil((aX - aE) * RB.ringR / 2.5);
    for (let i = 1; i < n; i++){ const a = aE + (aX - aE)*i/n; push({ x: c.x + Math.sin(a)*RB.ringR, z: c.z + Math.cos(a)*RB.ringR }, 'ring'); }
    push(TX, 'ring'); arc(CX, TX, LX, RB.fillet, 'out');
  }
  push(at(uOut, vOut, RB.yieldAt, -RB.lane), 'out');
  return pts;
}
/* punkt, w którym auto z ramienia uIn włącza się do ruchu okrężnego (kąt na torze) */
function roundaboutEntryAngle(uIn){
  const vIn = { x: uIn.z, z: -uIn.x };
  return Math.atan2(uIn.x*RB.tanAlong + vIn.x*RB.tanLat, uIn.z*RB.tanAlong + vIn.z*RB.tanLat);
}

/* NPC dojeżdżające do ronda (faza 'approach', 11.3–18 m od środka) ustępują pojazdom na pasie
   okrężnym, które nadjeżdżają z lewej i dotrą do punktu włączenia, zanim wjeżdżający go minie
   (okno = 6 m + prędkość tamtego × 2.4 s z postoju / 1.4 s w ruchu), albo są tuż przy nim.
   Pojazdy na rondzie nie ustępują wjeżdżającym (A-7 na każdym wlocie). */
function roundaboutYield(n){
  if (n.rbPhase !== 'approach') return false;
  const p = ROUNDABOUT_PTS[n.rb], cx = L(p[0]), cz = L(p[1]);
  const dn = Math.hypot(n.pos.x - cx, n.pos.y - cz);
  if (dn < RB.commit || dn > RB.outer + 9) return false;
  const aE = roundaboutEntryAngle(n.rbArm);
  const ex = cx + Math.sin(aE)*RB.ringR, ez = cz + Math.cos(aE)*RB.ringR;
  const tReach = n.speed < 2 ? 2.4 : 1.4;
  const conflict = (x, z, v) => {
    const d = Math.hypot(x - cx, z - cz);
    if (d < RB.apron || d > RB.outer + 0.4) return false;
    if (Math.hypot(x - ex, z - ez) < 4.5) return true;
    const up = ((aE - Math.atan2(x - cx, z - cz)) % TAU + TAU) % TAU;     // ile toru (rad) przed punktem włączenia
    return up * RB.ringR < 6 + Math.max(v, 4) * tReach;
  };
  for (const m of npcs){ if (m !== n && conflict(m.pos.x, m.pos.y, m.speed)) return true; }
  const cv = chassisBody.velocity;
  if (conflict(chassisBody.position.x, chassisBody.position.z, Math.hypot(cv.x, cv.z))) return true;
  for (const q of parkedCars) if (conflict(q.body.position.x, q.body.position.z, 0)) return true;
  return false;
}

/* --- scalenie statycznej geometrii w kilka siatek --- */
function addMerged(buf, material, cast, receive){
  if (buf.empty()) return null;
  const m = new THREE.Mesh(buf.geometry(), material);
  m.castShadow = !!cast;
  m.receiveShadow = !!receive;
  m.matrixAutoUpdate = false;
  scene.add(m);
  return m;
}
const roadMesh  = addMerged(roadBuf,  new THREE.MeshLambertMaterial({ map: texs.road,  color: 0xbcbcbc }), false, true);
const crossMesh = addMerged(crossBuf, new THREE.MeshLambertMaterial({ map: texs.cross, color: 0xbcbcbc }), false, true);
const crosswalkMesh = addMerged(crosswalkBuf, new THREE.MeshLambertMaterial({ map: texs.crossStrip, color: 0xbcbcbc }), false, true);

const walkMesh  = addMerged(walkBuf,  new THREE.MeshLambertMaterial({ map: texs.walk }), false, true);
const curbMesh  = addMerged(curbBuf,  new THREE.MeshLambertMaterial({ map: texs.curb }), true, true);
const roofMesh  = addMerged(roofBuf,  new THREE.MeshLambertMaterial({ map: texs.roof }), true, true);

const waterMat = new THREE.MeshLambertMaterial({ color: 0x3b6f86 });
const waterMesh = addMerged(waterBuf, waterMat, false, true);
if (waterMesh) waterMesh.onBeforeRender = () => { const t = performance.now() * 0.001; waterMat.color.setRGB(0.22 + 0.02 * Math.sin(t * 0.9), 0.42 + 0.03 * Math.sin(t * 0.7 + 1), 0.52 + 0.02 * Math.sin(t * 1.1)); };
/* jednokolorowe: przystanki, malowanie, trawa, ogrodzenia, ławki, alejki, dachy domków + bryły dzielnic — jedna siatka */
const districtMeshes = finalizeDistricts([[busBuf, 0x4f6b82], [busSignBuf, 0xe8b923], [roundaboutPaintBuf, 0xe4e2d8], [grassBuf, 0x3e6a31], [apronBuf, 0x6b5a54],
  [lawnBuf, 0x4a7339], [fenceBuf, 0x5d6469], [courtBuf, 0xa4543e], [benchBuf, 0x8a5a33], [pathBuf, 0xcdbf9f]].concat(houseRoofBufs.map((b, i) => [b, HOUSE_ROOFS[i]])));
HOUSE_WALLS.forEach((t, i) => addMerged(houseWallBufs[i], new THREE.MeshLambertMaterial({ map: t }), true, true));

const facadeMeshes = facadeBufs.map((b, i) => addMerged(b, facadeMats[i], true, true)).filter(Boolean);

/* obiekty do sprawdzania kolizji kamery */
const camBlockers = facadeMeshes.concat(curbMesh ? [curbMesh] : [], districtMeshes);
