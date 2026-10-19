/* ---------------------------------------------------------------
   7b. AUTOSTRADA + WĘZEŁ + ESTAKADA + TUNELE
   Dwujezdniowa autostrada N–S na wschód od miasta, WEWNĄTRZ jednego muru
   dookoła świata (city-generation.js). Ruch PRAWOSTRONNY: jezdnia A (zachodnia,
   od strony miasta) jedzie na +Z (południe), jezdnia B (wschodnia) na -Z (północ).
   Autostrada kończy się w tunelach przy północnej i południowej ścianie —
   auta NPC zawijają się wewnątrz tunelu. Węzeł (zjazd + wjazd) łączy ją ze
   skrzyżowaniem miasta (GRID, GRID/2); estakada przenosi ją nad ulicą HWY2_Z.
   --------------------------------------------------------------- */
const HWY_LANE_W     = 3.5;
const HWY_LANES      = 2;
const HWY_SHOULDER_W = 2.5;
const HWY_DIR_W      = HWY_LANES * HWY_LANE_W + HWY_SHOULDER_W;   // 9.5
const HWY_MEDIAN_W   = 4;
const HWY_Z0 = -(WALL_X - 0.6), HWY_Z1 = WALL_X - 0.6;   // kończy się przy murze N/S
const HWY_TUN_L = 16;                                   // długość tunelu przy murze
const HWY_WRAP  = WALL_X - 4;                           // |z| > tego: auto NPC zawija się (jest wtedy w tunelu)
const HWY_LOOP  = HWY_WRAP * 2;

/* krawędzie kierunku A (zachodni, od strony miasta) i B (wschodni) */
const HWY_A_OUT = HWY_X - HWY_MEDIAN_W/2 - HWY_DIR_W;   // pobocze A (bliżej miasta)
const HWY_A_IN  = HWY_X - HWY_MEDIAN_W/2;               // wewnętrzna krawędź A (przy pasie rozdziału)
const HWY_B_IN  = HWY_X + HWY_MEDIAN_W/2;
const HWY_B_OUT = HWY_X + HWY_MEDIAN_W/2 + HWY_DIR_W;   // pobocze B (dalej od miasta)

/* --- tekstura nawierzchni: jeden kierunek (pobocze|pas|pas|krawędź media.) --- */
function texHighway(){
  const W = 160, H = 384, c = mkCanvas(W,H), g = c.getContext('2d');
  g.fillStyle = '#2f3136'; g.fillRect(0,0,W,H);
  for (let i = 0; i < 170; i++){
    g.fillStyle = 'rgba(' + randInt(22,64) + ',' + randInt(22,64) + ',' + randInt(24,68) + ',0.45)';
    g.beginPath(); g.ellipse(rnd()*W, rnd()*H, rand(1,4), rand(1,3), 0, 0, TAU); g.fill();
  }
  noiseOver(g, W, H, 20);

  const edge = 8, shoulderEnd = 38;
  g.fillStyle = 'rgba(226,224,214,.85)';
  g.fillRect(edge, 0, 3, H);                 // krawędź zewnętrzna (pobocze)
  g.fillRect(shoulderEnd, 0, 3, H);          // granica pobocza / pasa ruchu
  g.fillRect(W-6, 0, 3, H);                  // krawędź wewnętrzna (pas rozdziału)

  /* przerywana linia między dwoma pasami ruchu */
  const laneDivX = shoulderEnd + (W-6-shoulderEnd)/2 - 1.5;
  const period = H/4, dash = period*0.55;
  g.fillStyle = 'rgba(232,230,220,.9)';
  for (let k = 0; k < 4; k++) g.fillRect(laneDivX, k*period + (period-dash)/2, 3, dash);

  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 70; i++){
    g.fillStyle = 'rgba(0,0,0,' + rand(0.1,0.42) + ')';
    g.beginPath(); g.ellipse(rnd()*W, rnd()*H, rand(1,4), rand(1,3), 0, 0, TAU); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  return toTex(c);
}
const hwyLaneTex = texHighway();

const hwyBuf = new GeoBuf();          // jezdnie (tekstura hwyLaneTex)
const hwyRampBuf = new GeoBuf();      // łącznice (tekstura miejska texs.road)
const hwyPaintBuf = new GeoBuf();     // elementy malowane bez kolizji

/* ---------------------------------------------------------------
   Estakada: odcinek autostrady wznosi się na wysokość HWY_BR.h (rampy po
   HWY_BR.ramp m, pochylenie ~6.4%), a pod nim przechodzi droga z miasta
   (HWY2_Z) na dziedziniec za autostradą. Pochylenia mają prawdziwą
   kolizję (obrócone bryły; geometria sprawdzona numerycznie na cannon.js).
   --------------------------------------------------------------- */
const HWY_BR = { zc: HWY2_Z, half: 13, ramp: 78, h: 5.0 };
function hwyH(z){
  const d = Math.abs(z - HWY_BR.zc);
  if (d <= HWY_BR.half) return HWY_BR.h;
  if (d >= HWY_BR.half + HWY_BR.ramp) return 0;
  return HWY_BR.h * (1 - (d - HWY_BR.half) / HWY_BR.ramp);
}
function hwySlope(z){   // dh/dz
  const d = z - HWY_BR.zc, ad = Math.abs(d);
  if (ad <= HWY_BR.half || ad >= HWY_BR.half + HWY_BR.ramp) return 0;
  return (d < 0 ? 1 : -1) * HWY_BR.h / HWY_BR.ramp;
}
const HWY_ZS = [HWY_Z0, HWY_BR.zc - HWY_BR.half - HWY_BR.ramp, HWY_BR.zc - HWY_BR.half,
                HWY_BR.zc + HWY_BR.half, HWY_BR.zc + HWY_BR.half + HWY_BR.ramp, HWY_Z1];

/* pochylona bryła kolizji wzdłuż Z: linia (zA,yA)-(zB,yB), t = grubość,
   up=+1 bryła nad linią, -1 pod linią */
function tiltBox(xc, w, t, zA, yA, zB, yB, up){
  const dz = zB - zA, dy = yB - yA, Ls = Math.hypot(dz, dy), phi = -Math.atan2(dy, dz);
  const b = new CANNON.Body({ mass: 0, material: matGround });
  b.addShape(new CANNON.Box(new CANNON.Vec3(w/2, t/2, Ls/2)));
  b.position.set(xc, (yA+yB)/2 + up*Math.cos(phi)*t/2, (zA+zB)/2 + up*Math.sin(phi)*t/2);
  b.quaternion.setFromAxisAngle(new CANNON.Vec3(1,0,0), phi);
  b.collisionFilterGroup = G_WORLD;
  b.collisionFilterMask  = -1;
  addBody(b);
}
/* pochyły "mur" (bariera/ażur) z widoczną geometrią i kolizją; bottom=true dodaje spód */
function slopeWall(buf, xc, w, zA, yA, zB, yB, hgt, collide, bottom){
  const x0 = xc - w/2, x1 = xc + w/2, sg = Math.sign(zB - zA) || 1;
  const bA0=[x0,yA,zA], bA1=[x1,yA,zA], bB0=[x0,yB,zB], bB1=[x1,yB,zB];
  const tA0=[x0,yA+hgt,zA], tA1=[x1,yA+hgt,zA], tB0=[x0,yB+hgt,zB], tB1=[x1,yB+hgt,zB];
  quadOut(buf, tA0, tA1, tB1, tB0, [0,1,0]);
  quadOut(buf, bA0, bB0, tB0, tA0, [-1,0,0]);
  quadOut(buf, bA1, bB1, tB1, tA1, [1,0,0]);
  quadOut(buf, bA0, bA1, tA1, tA0, [0,0,-sg]);
  quadOut(buf, bB0, bB1, tB1, tB0, [0,0,sg]);
  if (bottom) quadOut(buf, bA0, bA1, bB1, bB0, [0,-1,0]);
  if (collide) tiltBox(xc, w, hgt, zA, yA, zB, yB, 1);
}
/* trójkątny/trapezowy bok nasypu rampy (tylko widoczny): od ziemi do linii jezdni */
function embankSide(buf, xe, zA, yA, zB, yB, outX){
  const o = [outX, 0, 0];
  if (yA < 0.01 && yB < 0.01) return;
  if (yA < 0.01)      quadOut(buf, [xe,0,zA], [xe,0,zB], [xe,yB,zB], [xe,yB,zB], o);
  else if (yB < 0.01) quadOut(buf, [xe,0,zA], [xe,0,zB], [xe,yA,zA], [xe,yA,zA], o);
  else                quadOut(buf, [xe,0,zA], [xe,0,zB], [xe,yB,zB], [xe,yA,zA], o);
}

/* --- jezdnie, pas rozdziału i bariery na całej długości, odcinkami wg profilu wysokości ---
   (kierunek B to lustrzane odbicie A; UV po v biegnie wzdłuż trasy, ciągłe między odcinkami) */
(function buildHighwaySegments(){
  const vOf = z => (HWY_Z1 - z) / ROAD_TILE;
  for (let i = 0; i < HWY_ZS.length - 1; i++){
    const z0 = HWY_ZS[i], z1 = HWY_ZS[i+1], y0 = hwyH(z0), y1 = hwyH(z1);
    const raised = (y0 > 0.01 || y1 > 0.01);
    /* kolejność wierzchołków z1 -> z0: normalna (x * -z) wskazuje W GÓRĘ (z0->z1 dawało normalną w dół
       i jezdnia estakady była niewidoczna z góry — sprawdzone numerycznie) */
    hwyBuf.quad([HWY_A_OUT,y1+0.01,z1],[HWY_A_IN,y1+0.01,z1],[HWY_A_IN,y0+0.01,z0],[HWY_A_OUT,y0+0.01,z0],
                [0,vOf(z1)],[1,vOf(z1)],[1,vOf(z0)],[0,vOf(z0)]);
    hwyBuf.quad([HWY_B_IN,y1+0.01,z1],[HWY_B_OUT,y1+0.01,z1],[HWY_B_OUT,y0+0.01,z0],[HWY_B_IN,y0+0.01,z0],
                [1,vOf(z1)],[0,vOf(z1)],[0,vOf(z0)],[1,vOf(z0)]);
    /* pas rozdziału: pełny, szeroki blok z kolizją (kierunki fizycznie rozdzielone) */
    slopeWall(hwyPaintBuf, HWY_X, HWY_MEDIAN_W - 0.2, z0, y0, z1, y1, 0.9, true, false);
    if (raised){
      /* płyty jezdni z kolizją (pod linią nawierzchni) */
      /* rampa = lity nasyp (płyta sięga do ziemi, nie da się wjechać pod nią z boku); pomost = cienka płyta 0.7 m (pod nim biegnie ulica) */
      const th = (y0 !== y1) ? Math.max(y0, y1) + 0.3 : 0.7;
      tiltBox((HWY_A_OUT + HWY_A_IN)/2, HWY_A_IN - HWY_A_OUT, th, z0, y0, z1, y1, -1);
      tiltBox((HWY_B_OUT + HWY_B_IN)/2, HWY_B_OUT - HWY_B_IN, th, z0, y0, z1, y1, -1);
      /* ażurowe bariery krawędziowe na rampach i obiekcie */
      slopeWall(hwyPaintBuf, HWY_A_OUT - 0.25, 0.5, z0, y0, z1, y1, 1.0, true, false);
      slopeWall(hwyPaintBuf, HWY_B_OUT + 0.25, 0.5, z0, y0, z1, y1, 1.0, true, false);
      if (y0 !== y1){            // rampa: boki nasypu (spód jest zasłonięty od góry, widać tylko boki)
        embankSide(hwyPaintBuf, HWY_A_OUT - 0.5, z0, y0, z1, y1, -1);
        embankSide(hwyPaintBuf, HWY_B_OUT + 0.5, z0, y0, z1, y1, 1);
      } else {                   // pomost: płyta z widocznym spodem i bokami
        slopeWall(hwyPaintBuf, HWY_X, HWY_B_OUT - HWY_A_OUT, z0, y0 - 0.7, z1, y1 - 0.7, 0.7, false, true);
      }
    }
  }
  /* filary pod pomostem: poza jezdnią drogi pod estakadą (|dz| > ROAD_H + 1) */
  const zp = [HWY_BR.zc - 10.5, HWY_BR.zc + 10.5];
  [HWY_A_OUT + 1.2, HWY_X, HWY_B_OUT - 1.2].forEach(px => zp.forEach(pz => {
    hwyPaintBuf.box(px, (HWY_BR.h - 0.7)/2, pz, 1.4, HWY_BR.h - 0.7, 1.4, 3, false);
    staticBox(px, (HWY_BR.h - 0.7)/2, pz, 1.4, HWY_BR.h - 0.7, 1.4);
  }));
})();

/* --- tunele przy północnym i południowym murze: dach + ściany boczne + spód stropu --- */
(function buildTunnelPortals(){
  const xl = HWY_A_OUT - 1.0, xr = HWY_B_OUT + 1.0, w = xr - xl, cx = (xl + xr) / 2;
  [[HWY_Z0, 1], [HWY_Z1, -1]].forEach(t => {
    const zc2 = t[0] + t[1] * HWY_TUN_L / 2, za = zc2 - HWY_TUN_L/2, zb = zc2 + HWY_TUN_L/2;
    hwyPaintBuf.box(cx, 5.9, zc2, w, 1.0, HWY_TUN_L, 3, true);
    staticBox(cx, 5.9, zc2, w, 1.0, HWY_TUN_L);
    quadOut(hwyPaintBuf, [xl,5.4,za], [xr,5.4,za], [xr,5.4,zb], [xl,5.4,zb], [0,-1,0]);        // strop widoczny od środka
    [xl + 0.5, xr - 0.5].forEach(sx => {
      hwyPaintBuf.box(sx, 3.2, zc2, 1.0, 6.4, HWY_TUN_L, 3, false);
      staticBox(sx, 3.2, zc2, 1.0, 6.4, HWY_TUN_L);
    });
  });
})();

/* wnętrze tuneli: ciemna "głębia" przy murze (zamiast muru z niebem nad nim) i świecące
   oprawy pod stropem nad każdym pasem — tunel wygląda na ciągnący się dalej, także nocą */
const tunnelLightBuf = new GeoBuf(), tunnelVoidBuf = new GeoBuf();
(function buildTunnelInterior(){
  const xl = HWY_A_OUT - 0.5, xr = HWY_B_OUT + 0.5;
  [[HWY_Z0, 1], [HWY_Z1, -1]].forEach(t => {
    const zw = t[0] + t[1] * 0.05;                                     // tuż przed licem muru
    quadOut(tunnelVoidBuf, [xl,0,zw], [xr,0,zw], [xr,5.4,zw], [xl,5.4,zw], [0,0,t[1]]);
    [hwyLaneX('A',0), hwyLaneX('A',1), hwyLaneX('B',0), hwyLaneX('B',1)].forEach(lx => {
      for (let k = 1; k < HWY_TUN_L; k += 3){
        const z = t[0] + t[1] * k;
        quadOut(tunnelLightBuf, [lx-0.15,5.38,z-0.6], [lx+0.15,5.38,z-0.6], [lx+0.15,5.38,z+0.6], [lx-0.15,5.38,z+0.6], [0,-1,0]);
      }
    });
  });
})();

/* latarnie wzdłuż zewnętrznych krawędzi obu jezdni (tylko na odcinkach na poziomie terenu,
   poza łącznicami, estakadą i tunelami); wysięgnik nad pobocze */
for (let z = -216; z <= 216; z += 48){
  if (Math.abs(z - HWY_BR.zc) < HWY_BR.half + HWY_BR.ramp + 8) continue;
  if (Math.abs(z - HWY_IC_Z) > 80) lampSpots.push({ x: HWY_A_OUT - 0.5, z: z, rot:  Math.PI/2, y: 0 });
  lampSpots.push({ x: HWY_B_OUT + 0.5, z: z, rot: -Math.PI/2, y: 0 });
}

/* --- łącznica: krzywa Beziera między autostradą a istniejącym skrzyżowaniem
   miejskim (WALL_X-ROAD_H-ish, HWY_IC_Z) — zwęża się do zera na końcu
   zjazdowym (gore), stała szerokość na reszcie długości --- */
function buildRamp(p0, p1, p2, width, seg, taperStart, taperEnd){
  const pts = [];
  for (let i = 0; i <= seg; i++){
    const t = i/seg;
    const x = (1-t)*(1-t)*p0.x + 2*(1-t)*t*p1.x + t*t*p2.x;
    const z = (1-t)*(1-t)*p0.z + 2*(1-t)*t*p1.z + t*t*p2.z;
    pts.push({x, z, t});
  }
  for (let i = 0; i < seg; i++){
    const a = pts[i], b = pts[i+1];
    const dx = b.x - a.x, dz = b.z - a.z, segLen = Math.hypot(dx, dz) || 1;
    const nx = -dz/segLen, nz = dx/segLen;          // normalna (prostopadła do kierunku)
    let wA = width, wB = width;
    if (taperStart) wA = width * clamp(a.t / taperStart, 0.08, 1);
    if (taperEnd)   wB = width * clamp((1-b.t) / (1-taperEnd), 0.08, 1);
    const a0 = [a.x+nx*wA/2, 0.012, a.z+nz*wA/2], a1 = [a.x-nx*wA/2, 0.012, a.z-nz*wA/2];
    const b0 = [b.x+nx*wB/2, 0.012, b.z+nz*wB/2], b1 = [b.x-nx*wB/2, 0.012, b.z-nz*wB/2];
    const v = segLen / ROAD_TILE;
    hwyRampBuf.quad(a0, b0, b1, a1, [1,0],[1,v],[0,v],[0,0]);   // kolejność daje normalną W GÓRĘ (a1,b1,b0,a0 dawało w dół)
  }
}

const HWY_RAMP_W = 6.2;
/* zjazd: z prawego skraju jezdni A (jedzie na +Z) skręca w PRAWO (na zachód) do skrzyżowania miasta;
   wjazd: ze skrzyżowania na wschód, potem w prawo na południe, wtapiając się w jezdnię A */
const HWY_OFF_RAMP = { p0:{ x: HWY_A_OUT - 0.4, z: HWY_IC_Z - 62 }, p1:{ x: HWY_A_OUT - 0.4, z: HWY_IC_Z }, p2:{ x: WALL_X - ROAD_H - 2, z: HWY_IC_Z } };
const HWY_ON_RAMP  = { p0:HWY_OFF_RAMP.p2, p1:{ x: HWY_A_OUT - 0.4, z: HWY_IC_Z }, p2:{ x: HWY_A_OUT - 0.4, z: HWY_IC_Z + 62 } };
function bezPt(R, t){
  const u = 1 - t;
  return { x: u*u*R.p0.x + 2*u*t*R.p1.x + t*t*R.p2.x, z: u*u*R.p0.z + 2*u*t*R.p1.z + t*t*R.p2.z };
}
function bezTan(R, t){
  const dx = 2*(1-t)*(R.p1.x - R.p0.x) + 2*t*(R.p2.x - R.p1.x), dz = 2*(1-t)*(R.p1.z - R.p0.z) + 2*t*(R.p2.z - R.p1.z);
  const l = Math.hypot(dx, dz) || 1;
  return { x: dx/l, z: dz/l };
}
/* znak przy PRAWEJ krawędzi łącznicy w punkcie t, przodem do nadjeżdżającego auta */
function rampSignSpot(R, t, off){
  const p = bezPt(R, t), d = bezTan(R, t);            // d = kierunek jazdy; prawa strona = (-d.z, d.x)
  return { x: p.x - d.z*off, z: p.z + d.x*off, rot: Math.atan2(-d.x, -d.z) };
}
buildRamp(HWY_OFF_RAMP.p0, HWY_OFF_RAMP.p1, HWY_OFF_RAMP.p2, HWY_RAMP_W, 16, 0.12, null);
buildRamp(HWY_ON_RAMP.p0,  HWY_ON_RAMP.p1,  HWY_ON_RAMP.p2,  HWY_RAMP_W, 16, null, 0.88);
[HWY_OFF_RAMP, HWY_ON_RAMP].forEach(R => {
  const pts = []; for (let k = 0; k <= 12; k++){ const q = bezPt(R, k/12); pts.push([q.x, q.z]); }
  mapExtras.push({ t:'line', pts:pts, w:HWY_RAMP_W, c:'#2b2e35' });
});

/* --- ruch na autostradzie (prawostronny): jezdnia A jedzie na +Z, B na -Z.
   Każde auto ma własną prędkość docelową (79–150 km/h), trzyma odstęp od poprzednika
   w swoim pasie, a wolniejszego poprzednika wyprzedza lewym pasem (pas 1 = lewy/szybki,
   pas 0 = prawy/wolny) — po wyprzedzeniu wraca na prawy. Na końcach (w tunelach) auta
   zawijają się na drugą stronę, nadal jadąc w tym samym kierunku. --- */
const hwyTraffic = [];
const _hwyAxisY = new CANNON.Vec3(0,1,0);
function hwyLaneX(side, lane){
  return side === 'A' ? HWY_A_OUT + HWY_SHOULDER_W + HWY_LANE_W * (lane + 0.5)
                      : HWY_B_OUT - HWY_SHOULDER_W - HWY_LANE_W * (lane + 0.5);
}
function spawnHighwayCar(side, lane, z, colorHex, vDes){
  const mesh = buildNpcModel(colorHex);
  scene.add(mesh);
  const body = new CANNON.Body({ mass:0, type: CANNON.Body.KINEMATIC, material: matCar });
  body.addShape(new CANNON.Box(new CANNON.Vec3(0.95,0.62,2.1)));
  body.collisionFilterGroup = G_CAR;
  body.collisionFilterMask  = -1;
  body.allowSleep = false;
  addBody(body);
  hwyTraffic.push({ side: side, dir: side === 'A' ? 1 : -1, lane: lane, tlane: lane, x: hwyLaneX(side, lane), z: z,
                    v: Math.min(vDes, hwyLimit(side, z)), vDes: vDes, vx: 0, mesh: mesh, body: body, cool: rand(0, 8), obey: rand(0.93, 1.07) });
}
function initHighwayTraffic(){
  const PER_SIDE = 6, slot = HWY_LOOP / PER_SIDE;
  ['A','B'].forEach(side => {
    for (let k = 0; k < PER_SIDE; k++){
      const vDes = rand(22, 42);                       // 79–151 km/h
      const lane = vDes > 31 ? 1 : 0;
      const z = -HWY_WRAP + (k + 0.5 + rand(-0.25, 0.25)) * slot;
      spawnHighwayCar(side, lane, z, NPC_COLORS[randInt(0, NPC_COLORS.length - 1)], vDes);
    }
  });
}
/* odległość (w kierunku jazdy c) do auta o, po okręgu długości HWY_LOOP; zawsze w [0, HWY_LOOP) */
function hwyGap(c, o){
  const g = (o.z - c.z) * c.dir;
  return ((g % HWY_LOOP) + HWY_LOOP) % HWY_LOOP;
}
function hwyLead(c, lane){
  const best = { gap: 999, v: c.vDes };
  for (const o of hwyTraffic){
    if (o === c || o.side !== c.side || (o.lane !== lane && o.tlane !== lane)) continue;
    const g = hwyGap(c, o) - 4.4;                    // odstęp zderzak–zderzak
    if (g < best.gap){ best.gap = g; best.v = o.v; }
  }
  return best;
}
function hwyLaneFree(c, lane){
  for (const o of hwyTraffic){
    if (o === c || o.side !== c.side || (o.lane !== lane && o.tlane !== lane)) continue;
    const ga = hwyGap(c, o), gb = HWY_LOOP - ga;     // przed nami / za nami
    if (ga < 12 + Math.max(0, c.v - o.v) * 1.6) return false;
    if (gb < 12 + Math.max(0, o.v - c.v) * 1.6) return false;
  }
  return true;
}
/* czy na prawym pasie jezdni A jest luka do włączenia się w punkcie z (55 m za, 18 m przed) */
function hwyMergeFree(z){
  for (const o of hwyTraffic){
    if (o.side !== 'A' || (o.lane !== 0 && o.tlane !== 0)) continue;
    const g = o.z - z;
    if (g > -55 && g < 18) return false;
  }
  return true;
}
/* auto miejskie (NPC) wjeżdża na autostradę: przechodzi do hwyTraffic z tym samym modelem i ciałem */
const HWY_OFF_Z = HWY_OFF_RAMP.p0.z;                    // początek łącznicy zjazdowej na jezdni A
function npcToHighway(n){
  const idx = npcs.indexOf(n); if (idx >= 0) npcs.splice(idx, 1);
  hwyTraffic.push({ side: 'A', dir: 1, lane: 0, tlane: 0, x: n.pos.x, z: n.pos.y, v: Math.max(n.speed, 12), vDes: rand(24, 33), vx: 0,
                    mesh: n.mesh, body: n.body, cool: 6, city: { path: n.path, color: n.color, id: n.id, target: n.target }, armed: false, obey: n.obey || 1 });
  hwyStats.merges++;
}
const hwyStats = { merges: 0, exits: 0 };
function updateHighwayTraffic(dt){
  for (let ci = hwyTraffic.length - 1; ci >= 0; ci--){
    const c = hwyTraffic[ci];
    /* auto z miasta: po przejechaniu tunelu (armed) zjeżdża łącznicą — wcześniej zostaje na prawym pasie */
    if (c.city && c.armed){
      const toOff = HWY_OFF_Z - c.z;
      if (toOff > 0 && toOff < 240){
        c.vDes = Math.min(c.vDes, toOff < 120 ? 20 : 26);
        if (c.lane === 1 && c.tlane === 1 && hwyLaneFree(c, 0)) c.tlane = 0;
        if (c.tlane === 0) c.cool = 99;                    // bez wyprzedzania przed zjazdem
        if (toOff < 10 && c.lane === 0 && Math.abs(c.x - hwyLaneX('A', 0)) < 0.6){
          hwyTraffic.splice(ci, 1); npcFromHighway(c); hwyStats.exits++; continue;
        }
      }
    }
    c.cool -= dt;
    const a = hwyLead(c, c.lane), b = (c.tlane !== c.lane) ? hwyLead(c, c.tlane) : a, lead = a.gap < b.gap ? a : b;
    /* prędkość: limit strefy (B-33 140/100, z wyprzedzeniem 70 m) i odstęp do poprzednika (płynnie, bez skoków) */
    let zAhead = c.z + c.dir*90;                                  // z wyprzedzeniem także "przez" tunel (zawinięcie)
    if (zAhead > HWY_WRAP) zAhead -= HWY_LOOP; else if (zAhead < -HWY_WRAP) zAhead += HWY_LOOP;
    const vCap = Math.min(c.vDes, Math.min(hwyLimit(c.side, c.z), hwyLimit(c.side, zAhead)) * c.obey);
    const safe = 7 + c.v * 0.9;
    const vWant = Math.max(0, Math.min(vCap, lead.v + (lead.gap - safe) * 0.4));
    c.v += clamp(vWant - c.v, -7 * dt, 2.5 * dt);
    /* zmiana pasa: wyprzedzanie lewym, powrót na prawy */
    if (c.cool <= 0 && c.tlane === c.lane){
      if (c.lane === 0 && lead.gap < 30 && lead.v < vCap - 2.5 && hwyLaneFree(c, 1)){ c.tlane = 1; c.cool = 10; }
      else if (c.lane === 1 && hwyLaneFree(c, 0)){
        const r = hwyLead(c, 0);
        if (r.gap > 45 || r.v >= vCap - 1){ c.tlane = 0; c.cool = 8; }
      }
    }
    const tx = hwyLaneX(c.side, c.tlane), dx = clamp(tx - c.x, -1.6 * dt, 1.6 * dt);
    c.x += dx; c.vx = dx / dt;
    c.lane = Math.abs(c.x - hwyLaneX(c.side, 1)) < Math.abs(c.x - hwyLaneX(c.side, 0)) ? 1 : 0;
    if (Math.abs(c.x - tx) < 0.05) c.lane = c.tlane;

    c.z += c.dir * c.v * dt;
    if (c.dir > 0 && c.z > HWY_WRAP){ c.z -= HWY_LOOP; if (c.city) c.armed = true; }
    if (c.dir < 0 && c.z < -HWY_WRAP) c.z += HWY_LOOP;

    const heading = (c.dir > 0 ? 0 : Math.PI) + c.dir * Math.atan2(c.vx, Math.max(c.v, 5));
    const hy = hwyH(c.z);
    c.body.position.set(c.x, 0.72 + hy, c.z);
    c.body.quaternion.setFromAxisAngle(_hwyAxisY, heading);
    c.mesh.position.set(c.x, hy, c.z);
    c.mesh.rotation.order = 'YXZ';
    c.mesh.rotation.set(-Math.atan(c.dir * hwySlope(c.z)), heading, 0);   // nos w górę pod górę
  }
}

/* --- tablice autostradowe: "AUTOSTRADA A18" na początku obu jezdni i zapowiedź zjazdu przed węzłem --- */
/* tablica 3.4 x 2.1 m na dwóch słupkach schowanych za licem, dolna krawędź 2.2 m nad poboczem */
function hwySign(x, z, rotY, tex){
  placeSign(x, z, rotY, [signFace('autostrada', tex, shapeRect(3.4, 2.1))], { base: 0, bottom: 2.2, poleR: 0.08, poleX: [-1.2, 1.2] });
}
hwySign(HWY_A_OUT - 2.2, HWY_Z0 + 30, Math.PI, texHwySign(['AUTOSTRADA'], 'A18'));   // jezdnia A jedzie na +Z, nadjeżdża od północy
hwySign(HWY_B_OUT + 2.2, HWY_Z1 - 30, 0, texHwySign(['AUTOSTRADA'], 'A18'));        // jezdnia B jedzie na -Z, nadjeżdża od południa
hwySign(HWY_A_OUT - 2.2, HWY_IC_Z - 97, Math.PI, texHwySign(['ZJAZD', '300 m']));    // przed początkiem łącznicy zjazdowej (z=IC-62)

/* ---------------------------------------------------------------
   Droga z miasta pod estakadą: ulica HWY2_Z wychodzi przez drugą przerwę
   w barierze, przechodzi pod pomostem autostrady (prześwit 4.8 m) i
   kończy się dziedzińcem z zawrotką i halami — nie donikąd.
   (Bufory własne: bufory miasta zostały już scalone w city-generation.js.)
   --------------------------------------------------------------- */
const YARD_X = HWY_B_OUT + 82;
const yardBuf = new GeoBuf(), yardPaintBuf = new GeoBuf(), shedBuf = new GeoBuf(), shedRoofBuf = new GeoBuf();
(function buildUnderpassRoadAndYard(){
  const line = HWY2_Z;
  const a = L(GRID) + ROAD_H, b = YARD_X - 11, len = b - a, v = len / ROAD_TILE;
  hwyRampBuf.quad([a,0.012,line+ROAD_H],[b,0.012,line+ROAD_H],[b,0.012,line-ROAD_H],[a,0.012,line-ROAD_H],
                  [0,0],[0,v],[1,v],[1,0]);
  /* zawrotka: asfaltowa tarcza, linia, wyspa środkowa (prawdziwa kolizja) */
  yardBuf.disc(YARD_X, 0.02, line, 13, 32);
  yardPaintBuf.ring(YARD_X, 0.024, line, 8.6, 8.9, 32);
  const R = 3.4, H = 0.6, seg = 20;
  for (let k = 0; k < seg; k++){
    const a0 = k/seg*TAU, a1 = (k+1)/seg*TAU;
    quadOut(hwyPaintBuf, [YARD_X+Math.cos(a0)*R,0.02,line+Math.sin(a0)*R], [YARD_X+Math.cos(a1)*R,0.02,line+Math.sin(a1)*R],
            [YARD_X+Math.cos(a1)*R,0.02+H,line+Math.sin(a1)*R], [YARD_X+Math.cos(a0)*R,0.02+H,line+Math.sin(a0)*R],
            [Math.cos((a0+a1)/2), 0, Math.sin((a0+a1)/2)]);
  }
  hwyPaintBuf.disc(YARD_X, 0.02 + H, line, R, seg);
  staticCylinder(YARD_X, 0.02 + H/2, line, R, H);
  /* hale przy drodze i za zawrotką (poza pasem drogi: |dz| >= ROAD_H + 6) */
  [[YARD_X - 30, line + 26, 34, 22, 9], [YARD_X - 30, line - 26, 34, 22, 11], [YARD_X + 26, line, 18, 36, 8]].forEach(h => {
    shedBuf.box(h[0], h[4]/2, h[1], h[2], h[4], h[3], 6, false);
    shedRoofBuf.plane(h[0], h[4], h[1], h[2], h[3], 4, 4);
    staticBox(h[0], h[4]/2, h[1], h[2], h[4], h[3]);
  });
})();

/* ---------------------------------------------------------------
   Strefa wschodnia (za autostradą, do muru): droga serwisowa równoległa do
   autostrady, dwie kolumny hal magazynowych i szpaler drzew; drzewa także
   na pasie zieleni między miastem a autostradą. Nic tu nie prowadzi donikąd:
   droga serwisowa łączy się z ulicą pod estakadą (HWY2_Z).
   --------------------------------------------------------------- */
const treeTrunkBuf = new GeoBuf(), treeCrownBuf = new GeoBuf();
const EAST_ROAD_X = HWY_B_OUT + 24;                    // oś drogi serwisowej (8 m, pasy ±2 m)
const EAST_TURN_Z = WALL_X - 14, EAST_TURN_R = 4.2;    // zawrotki (tarcza R=7.5) na obu końcach, tor auta r=4.2
(function buildEastZone(){
  const xs = EAST_ROAD_X, rw = 8, zA = -(WALL_X - 6), zB = WALL_X - 6;
  [EAST_TURN_Z, -EAST_TURN_Z].forEach(z => { yardBuf.disc(xs, 0.02, z, 7.5, 24); mapExtras.push({ t:'disc', x: xs, z: z, r: 7.5, c:'#2b2e35' }); });
  [[zA, HWY2_Z - ROAD_H], [HWY2_Z + ROAD_H, zB]].forEach(pc => {
    const v0 = pc[0] / ROAD_TILE, v1 = pc[1] / ROAD_TILE;
    hwyRampBuf.quad([xs-rw/2,0.013,pc[1]],[xs+rw/2,0.013,pc[1]],[xs+rw/2,0.013,pc[0]],[xs-rw/2,0.013,pc[0]], [0,v1],[1,v1],[1,v0],[0,v0]);
  });
  mapExtras.push({ t:'rect', x0: xs - rw/2, x1: xs + rw/2, z0: zA, z1: zB, c:'#2b2e35' });

  /* hale: dwie kolumny co 40 m, z pominięciem okolicy placu przy ulicy pod estakadą */
  const cols = [{ x: xs + 24, w: 26, d: 22 }, { x: xs + 62, w: 30, d: 24 }];
  cols.forEach(col => {
    for (let z = -240; z <= 240; z += 40){
      if (Math.abs(z - HWY2_Z) < 56) continue;
      const h = rand(7, 12);
      shedBuf.box(col.x, h/2, z, col.w, h, col.d, 6, false);
      shedRoofBuf.plane(col.x, h, z, col.w, col.d, 4, 4);
      staticBox(col.x, h/2, z, col.w, h, col.d);
      mapExtras.push({ t:'rect', x0: col.x - col.w/2, x1: col.x + col.w/2, z0: z - col.d/2, z1: z + col.d/2, c:'#464b55' });
    }
  });

  /* drzewa: pas między miastem a autostradą, pas za autostradą i szpaler przy drodze serwisowej */
  function tree(x, z){
    const th = rand(2.2, 2.8), cw = rand(2.4, 3.2);
    treeTrunkBuf.box(x, th/2, z, 0.5, th, 0.5, 2, false);
    treeCrownBuf.box(x, th + cw*0.45, z, cw, cw*0.9, cw, 3, true);
    treeCrownBuf.box(x, th + cw*0.9 + 0.5, z, cw*0.62, cw*0.7, cw*0.62, 3, true);
    staticBox(x, th/2, z, 0.5, th, 0.5);
  }
  [WALL_X + 12, HWY_B_OUT + 10, xs + rw/2 + 4].forEach((tx, ci) => {
    for (let z = -258; z <= 258; z += 18){
      if (Math.abs(z - HWY2_Z) < 16) continue;
      if (ci === 0 && Math.abs(z - HWY_IC_Z) < 28) continue;       // łącznice przechodzą tędy
      if (ci === 2 && Math.abs(z) > EAST_TURN_Z - 9) continue;     // zawrotki na końcach drogi serwisowej
      tree(tx + rand(-1.5, 1.5), z + rand(-2, 2));
    }
  });
})();

/* --- mapa: jezdnie autostrady, ulica pod estakadą i plac --- */
mapExtras.push({ t:'rect', x0: HWY_A_OUT, x1: HWY_A_IN, z0: HWY_Z0, z1: HWY_Z1, c:'#2b2e35' });
mapExtras.push({ t:'rect', x0: HWY_B_IN,  x1: HWY_B_OUT, z0: HWY_Z0, z1: HWY_Z1, c:'#2b2e35' });
mapExtras.push({ t:'line', pts:[[L(GRID) + ROAD_H, HWY2_Z], [YARD_X - 11, HWY2_Z]], w: ROAD_W, c:'#2b2e35' });
mapExtras.push({ t:'disc', x: YARD_X, z: HWY2_Z, r: 13, c:'#2b2e35' });
mapExtras.push({ t:'rect', x0: YARD_X - 47, x1: YARD_X - 13, z0: HWY2_Z + 15, z1: HWY2_Z + 37, c:'#464b55' });
mapExtras.push({ t:'rect', x0: YARD_X - 47, x1: YARD_X - 13, z0: HWY2_Z - 37, z1: HWY2_Z - 15, c:'#464b55' });
mapExtras.push({ t:'rect', x0: YARD_X + 17, x1: YARD_X + 35, z0: HWY2_Z - 18, z1: HWY2_Z + 18, c:'#464b55' });

/* --- scalenie w siatki --- */
const hwyMesh     = addMerged(hwyBuf,     new THREE.MeshLambertMaterial({ map: hwyLaneTex, color: 0xbcbcbc }), false, true);
const hwyRampMesh  = addMerged(hwyRampBuf, new THREE.MeshLambertMaterial({ map: texs.road,  color: 0xbcbcbc }), false, true);
const hwyPaintMesh = addMerged(hwyPaintBuf, new THREE.MeshLambertMaterial({ color: 0x8d8b86 }), true, true);
const yardMesh      = addMerged(yardBuf,      new THREE.MeshLambertMaterial({ map: texs.cross, color: 0xbcbcbc }), false, true);
const yardPaintMesh = addMerged(yardPaintBuf, new THREE.MeshLambertMaterial({ color: 0xe4e2d8 }), false, true);
const shedMesh      = addMerged(shedBuf,      new THREE.MeshLambertMaterial({ color: 0x7d8791 }), true, true);
const shedRoofMesh  = addMerged(shedRoofBuf,  new THREE.MeshLambertMaterial({ color: 0x4b525a }), true, true);
const treeTrunkMesh = addMerged(treeTrunkBuf, new THREE.MeshLambertMaterial({ color: 0x584434 }), true, true);
const treeCrownMesh = addMerged(treeCrownBuf, new THREE.MeshLambertMaterial({ color: 0x4a7a3a }), true, true);
addMerged(tunnelLightBuf, new THREE.MeshBasicMaterial({ color: 0xffdca8 }), false, false);
addMerged(tunnelVoidBuf,  new THREE.MeshBasicMaterial({ color: 0x050607 }), false, false);
