/* ---------------------------------------------------------------
   7. GENEROWANIE MIASTA
   --------------------------------------------------------------- */
const texs = {
  asphalt: texAsphalt(),
  road:    texRoad(),
  cross:   texCross(),
  crossStrip: texCrossStrip(),
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

/* --- podłoże poza miastem --- */
(function ground(){
  const t = texs.asphalt.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(240, 240);
  t.anisotropy = MAXA;
  t.needsUpdate = true;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(960, 960),
    new THREE.MeshLambertMaterial({ map: t, color: 0x9d9d9d })
  );
  m.rotation.x = -Math.PI/2;
  m.position.y = -0.02;
  m.receiveShadow = true;
  scene.add(m);
})();

/* pojedynczy pas przejścia dla pieszych na jednej krawędzi skrzyżowania —
   dir: 'px'/'nx'/'pz'/'nz' (strona świata względem środka skrzyżowania) */
function crosswalkStrip(cx, cz, dir){
  const HW = ROAD_W/2, crossW = ROAD_W*0.62, band = ROAD_W*0.16, y = 0.021;
  let qx, qz, sx, sz;
  if (dir === 'pz'){ qx=cx; qz=cz+HW-band/2; sx=crossW; sz=band; }
  else if (dir === 'nz'){ qx=cx; qz=cz-HW+band/2; sx=crossW; sz=band; }
  else if (dir === 'px'){ qx=cx+HW-band/2; qz=cz; sx=band; sz=crossW; }
  else { qx=cx-HW+band/2; qz=cz; sx=band; sz=crossW; }
  const hx = sx/2, hz = sz/2;
  if (dir === 'pz' || dir === 'nz'){
    crosswalkBuf.quad([qx-hx,y,qz+hz],[qx+hx,y,qz+hz],[qx+hx,y,qz-hz],[qx-hx,y,qz-hz],
                       [0,0],[1,0],[1,1],[0,1]);
  } else {
    crosswalkBuf.quad([qx-hx,y,qz+hz],[qx+hx,y,qz+hz],[qx+hx,y,qz-hz],[qx-hx,y,qz-hz],
                       [0,1],[0,0],[1,0],[1,1]);
  }
}

/* skrzyżowania wyznaczone na ronda (patrz niżej, buildRoundaboutIsland) —
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
    crossBuf.plane(L(i), 0.02, L(j), ROAD_W, ROAD_W, 1, 1);
    const cx = L(i), cz = L(j);
    if (!isRoundaboutPt(i, j)){
      if (i < GRID && rnd() < 0.55) crosswalkStrip(cx, cz, 'px');
      if (i > 0    && rnd() < 0.55) crosswalkStrip(cx, cz, 'nx');
      if (j < GRID && rnd() < 0.55) crosswalkStrip(cx, cz, 'pz');
      if (j > 0    && rnd() < 0.55) crosswalkStrip(cx, cz, 'nz');
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

function addBuilding(cx, cz, w, d, h, pool, yBase){
  const v = pool ? pool[randInt(0, pool.length - 1)] : randInt(0, FACADES.length - 1);
  const y0 = (yBase === undefined) ? WALK_H : yBase;
  facadeBufs[v].box(cx, y0 + h/2, cz, w, h, d, 8, false);
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

function buildParkBlock(cx, cz){
  walkBuf.plane(cx, WALK_H, cz, LOT, LOT, LOT/4, LOT/4);
  curbBuf.box(cx, WALK_H/2, cz, LOT, WALK_H, LOT, 2, false);
  staticBox(cx, WALK_H/2, cz, LOT, WALK_H, LOT);
  for (let t = 0; t < 10; t++){
    const a = rand(0, TAU), rr = rand(2, LOT*0.4);
    treeSpots.push({ x: cx+Math.cos(a)*rr, z: cz+Math.sin(a)*rr, type: randInt(0,1), scale: rand(0.8,1.4), rot: rnd()*TAU });
  }
}

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

for (let bi = 0; bi < GRID; bi++){
  for (let bj = 0; bj < GRID; bj++){
    const cx = blockCenter(bi), cz = blockCenter(bj);

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
    pedBlockCandidates.push({ bi: bi, bj: bj });

    /* dzielnice: centrum (wieżowce), handlowa (wzdłuż głównych arterii),
       przemysłowa (zachód/południowy zachód: niskie, duże hale), mieszkalna (reszta) */
    const dist = Math.hypot(cx, cz);
    const district = dist < 105 ? 'center'
                   : (cx < -115 && cz < 45) ? 'industrial'
                   : (Math.abs(cz) < 56 || Math.abs(cx) < 56) ? 'commercial'
                   : 'residential';
    const POOL = { center:[3,5,1], commercial:[5,1,7,2], industrial:[6,3,0], residential:[0,2,4,7] }[district];
    const area = LOT - 6;             // 24 — pas chodnika 3 m dookoła
    const r = rnd();
    const g = 1.6, s = (area - g) / 2;
    const H = {
      center:      () => rand(34, 92),
      commercial:  () => rand(16, 38),
      industrial:  () => rand(6, 13),
      residential: () => rand(9, 21)
    }[district];
    const pSingle = { center: 0.62, commercial: 0.30, industrial: 0.70, residential: 0.10 }[district];
    const pPair   = { center: 0.22, commercial: 0.40, industrial: 0.25, residential: 0.25 }[district];

    if (r < pSingle){
      const w = area - rand(0,3), d = area - rand(0,3);
      addBuilding(cx, cz, w, d, H(), POOL);
    } else if (r < pSingle + pPair){
      const vertical = rnd() < 0.5;
      for (let k = 0; k < 2; k++){
        const off = (k === 0 ? -1 : 1) * (s + g) / 2;
        const w = vertical ? s : area, d = vertical ? area : s;
        addBuilding(cx + (vertical ? off : 0), cz + (vertical ? 0 : off),
                    w - rand(0,1.2), d - rand(0,1.2), H(), POOL);
      }
    } else {
      for (let a = 0; a < 2; a++){
        for (let b = 0; b < 2; b++){
          if (rnd() < 0.1) continue;   // podwórko / parking
          const ox = (a ? 1 : -1) * (s + g) / 2;
          const oz = (b ? 1 : -1) * (s + g) / 2;
          addBuilding(cx + ox, cz + oz, s - rand(0,1.4), s - rand(0,1.4), H() * 0.8, POOL);
        }
      }
    }

    if ((district === 'center' || district === 'commercial') && rnd() < 0.30) buildBusStop(cx, cz, randInt(0, 3));

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

/* --- bariera betonowa: JEDEN obwód dookoła całego świata ---
   od zachodniej krawędzi miasta (-WALL_X) do WORLD_X1 (za placem/halami za autostradą),
   N/S na z=±WALL_X. Autostrada kończy się w tunelach przy północnej i południowej ścianie
   (highway.js). Wewnątrz nie ma już ściany między miastem a autostradą. */
(function barrier(){
  const H = 3.2, T = 1.2, cxm = (WORLD_X1 - WALL_X) / 2, Lx = WORLD_X1 + WALL_X + T, Lz = WALL_X * 2 + T;
  const b = new GeoBuf();
  [[cxm, WALL_X, Lx, T], [cxm, -WALL_X, Lx, T], [-WALL_X, 0, T, Lz], [WORLD_X1, 0, T, Lz]].forEach(w => {
    b.box(w[0], H/2, w[1], w[2], H, w[3], 3, true);
    staticBox(w[0], H/2, w[1], w[2], H, w[3]);
  });
  const mesh = new THREE.Mesh(b.geometry(), new THREE.MeshLambertMaterial({ map: texs.curb, color: 0xb9b6ad }));
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
})();

/* --- ronda na wybranych skrzyżowaniach wewnątrz siatki ---
   promień wyspy policzony pod kątem przejeżdżających aut NPC: pas mija
   środek z przesunięciem o=3.5 (patrz npcLoop), auto ma połowę szerokości
   0.95, więc najbliższy punkt nadwozia to 2.55 od środka — R=2.2 zostawia
   bezpieczny zapas (sprawdzone numerycznie, R=2.6 już lekko kolidowało).
   Malowana linia ustąpienia pierwszeństwa (promień 5.0–5.4, bez kolizji,
   więc nieograniczona tym progiem) to główny element, który faktycznie
   czyni je rondami "na oko", a nie zwykłym skrzyżowaniem z przeszkodą */
function buildRoundaboutIsland(cx, cz){
  const R = 2.2, H = 0.6, seg = 20;
  for (let s = 0; s < seg; s++){
    const a0 = s/seg*TAU, a1 = (s+1)/seg*TAU;
    const x0 = cx + Math.cos(a0)*R, z0 = cz + Math.sin(a0)*R;
    const x1 = cx + Math.cos(a1)*R, z1 = cz + Math.sin(a1)*R;
    curbBuf.quad([x0,0.02,z0],[x1,0.02,z1],[x1,0.02+H,z1],[x0,0.02+H,z0], [0,0],[1,0],[1,1],[0,1]);
  }
  curbBuf.disc(cx, 0.02 + H, cz, R, seg);
  staticCylinder(cx, 0.02 + H/2, cz, R, H);
  facadeBufs[2].box(cx, 0.02 + H + 1.9, cz, 0.7, 3.8, 0.7, 2, true);
  /* linia ustąpienia pierwszeństwa — cienki malowany pierścień w pół drogi
     między wyspą a krawędzią skrzyżowania */
  roundaboutPaintBuf.ring(cx, 0.022, cz, 5.0, 5.4, seg);
}
ROUNDABOUT_PTS.forEach(p => buildRoundaboutIsland(L(p[0]), L(p[1])));

/* --- ruch okrężny na rondach: auta faktycznie krążą dookoła wyspy
   (przeciwnie do wskazówek zegara — jak przy ruchu prawostronnym),
   nie tylko mijają skrzyżowanie po prostej. initRoundaboutTraffic()
   wywoływane z traffic-npc.js (tam żyje buildNpcModel). --- */
const roundaboutCars = [];
function initRoundaboutTraffic(){
  ROUNDABOUT_PTS.forEach((p, i) => {
    const cx = L(p[0]), cz = L(p[1]);
    const mesh = buildNpcModel(NPC_COLORS[(i + 4) % NPC_COLORS.length]);
    scene.add(mesh);
    const body = new CANNON.Body({ mass:0, type: CANNON.Body.KINEMATIC, material: matCar });
    body.addShape(new CANNON.Box(new CANNON.Vec3(0.95,0.62,2.1)));
    body.collisionFilterGroup = G_CAR;
    body.collisionFilterMask  = -1;
    body.allowSleep = false;
    addBody(body);
    roundaboutCars.push({ cx:cx, cz:cz, a: rand(0,TAU), r: 3.8, speed: 0.4 + rand(-0.05,0.05), mesh:mesh, body:body });
  });
}
const _rbAxisY = new CANNON.Vec3(0,1,0);
function updateRoundaboutTraffic(dt){
  for (const c of roundaboutCars){
    c.a += c.speed * dt;          // pozycja (sin a, cos a): rosnące a = przeciwnie do wskazówek zegara patrząc z góry
    const x = c.cx + Math.sin(c.a)*c.r, z = c.cz + Math.cos(c.a)*c.r;
    const heading = c.a + Math.PI/2;    // styczna do okręgu w kierunku jazdy: (cos a, -sin a)
    c.body.position.set(x, 0.72, z);
    c.body.quaternion.setFromAxisAngle(_rbAxisY, heading);
    c.mesh.position.set(x, 0, z);
    c.mesh.rotation.y = heading;
  }
}

/* NPC jadące do ronda ustępują pierwszeństwa autom już na nim krążącym:
   blokada, gdy krążące auto jest blisko drogi dojazdu przed wjazdem.
   Krążące auta jadą stale, więc nie ma zakleszczenia — luka zawsze się trafi. */
function roundaboutYield(px, pz, dx, dz){
  for (const c of roundaboutCars){
    const ox = c.cx - px, oz = c.cz - pz;
    const ahead = ox*dx + oz*dz;
    if (ahead < 6 || ahead > 13) continue;        // tylko PRZED wjazdem; auto już na rondzie nie ustępuje
    const lat = Math.abs(ox*-dz + oz*dx);
    if (lat > 6) continue;
    /* punkt włączenia: najbliższy punkt okręgu względem auta oczekującego */
    const vx = px - c.cx, vz = pz - c.cz, vl = Math.hypot(vx, vz) || 1;
    const ex = c.cx + vx/vl*c.r, ez = c.cz + vz/vl*c.r;
    const wx = c.cx + Math.sin(c.a)*c.r, wz = c.cz + Math.cos(c.a)*c.r;
    if (Math.hypot(wx - ex, wz - ez) < 6.5) return true;
  }
  return false;
}

/* --- A-7 "ustąp pierwszeństwa" nad C-12 "ruch okrężny" na wspólnym słupku na każdym z 4
   wlotów każdego ronda (znaki pierwszeństwa umieszcza się najwyżej) --- */
ROUNDABOUT_PTS.forEach(p => {
  const cx = L(p[0]), cz = L(p[1]);
  /* d = od ronda w stronę nadjeżdżających aut; znak stoi przy PRAWEJ krawędzi jezdni
     (lateral ROAD_H+0.9 = na chodniku), przodem do kierowcy */
  [ {x:0,z:1}, {x:0,z:-1}, {x:1,z:0}, {x:-1,z:0} ].forEach(d => {
    const a = approachSpot(cx, cz, d, ROAD_H + 2.2, ROAD_H + 0.9);
    placeSign(a.x, a.z, a.rot, [FACE.C12(), FACE.A7()]);
  });
});

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
const busMesh = addMerged(busBuf, new THREE.MeshLambertMaterial({ color: 0x4f6b82 }), true, true);
const busSignMesh = addMerged(busSignBuf, new THREE.MeshLambertMaterial({ color: 0xe8b923 }), false, true);
const roundaboutPaintMesh = addMerged(roundaboutPaintBuf, new THREE.MeshLambertMaterial({ color: 0xe4e2d8 }), false, true);
const walkMesh  = addMerged(walkBuf,  new THREE.MeshLambertMaterial({ map: texs.walk }), false, true);
const curbMesh  = addMerged(curbBuf,  new THREE.MeshLambertMaterial({ map: texs.curb }), true, true);
const roofMesh  = addMerged(roofBuf,  new THREE.MeshLambertMaterial({ map: texs.roof }), true, true);
const facadeMeshes = facadeBufs.map((b, i) => addMerged(b, facadeMats[i], true, true)).filter(Boolean);

/* obiekty do sprawdzania kolizji kamery */
const camBlockers = facadeMeshes.concat(curbMesh ? [curbMesh] : []);
