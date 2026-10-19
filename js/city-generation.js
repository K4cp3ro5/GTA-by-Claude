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
    /* rondo: asfalt skrzyżowania sięga do zewnętrznej krawędzi pasa okrężnego (R=9) i zakrywa oznakowanie ramion */
    if (isRoundaboutPt(i, j)) crossBuf.plane(L(i), 0.024, L(j), 18.4, 18.4, 1.3, 1.3);
    else crossBuf.plane(L(i), 0.02, L(j), ROAD_W, ROAD_W, 1, 1);
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

/* NPC dojeżdżające do ronda (faza 'approach', 9.6–15.5 m od środka) ustępują pojazdom na pasie
   okrężnym, które nadjeżdżają z lewej i dotrą do punktu włączenia, zanim wjeżdżający go minie
   (okno = 6 m + prędkość tamtego × 2.4 s z postoju / 1.4 s w ruchu), albo są tuż przy nim.
   Pojazdy na rondzie nie ustępują wjeżdżającym (A-7 na każdym wlocie). */
function roundaboutYield(n){
  if (n.rbPhase !== 'approach') return false;
  const p = ROUNDABOUT_PTS[n.rb], cx = L(p[0]), cz = L(p[1]);
  const dn = Math.hypot(n.pos.x - cx, n.pos.y - cz);
  if (dn < RB.outer + 0.6 || dn > RB.outer + 6.5) return false;
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
  if (mainCarPlaceholder && conflict(mainCarPlaceholder.body.position.x, mainCarPlaceholder.body.position.z, 0)) return true;
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
const busMesh = addMerged(busBuf, new THREE.MeshLambertMaterial({ color: 0x4f6b82 }), true, true);
const busSignMesh = addMerged(busSignBuf, new THREE.MeshLambertMaterial({ color: 0xe8b923 }), false, true);
const roundaboutPaintMesh = addMerged(roundaboutPaintBuf, new THREE.MeshLambertMaterial({ color: 0xe4e2d8 }), false, true);
const walkMesh  = addMerged(walkBuf,  new THREE.MeshLambertMaterial({ map: texs.walk }), false, true);
const curbMesh  = addMerged(curbBuf,  new THREE.MeshLambertMaterial({ map: texs.curb }), true, true);
const roofMesh  = addMerged(roofBuf,  new THREE.MeshLambertMaterial({ map: texs.roof }), true, true);
const grassMesh = addMerged(grassBuf, new THREE.MeshLambertMaterial({ color: 0x3e6a31 }), false, true);
const apronMesh = addMerged(apronBuf, new THREE.MeshLambertMaterial({ color: 0x6b5a54 }), false, true);
const facadeMeshes = facadeBufs.map((b, i) => addMerged(b, facadeMats[i], true, true)).filter(Boolean);

/* obiekty do sprawdzania kolizji kamery */
const camBlockers = facadeMeshes.concat(curbMesh ? [curbMesh] : []);
