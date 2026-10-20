/* ---------------------------------------------------------------
   7e. ORGANIZACJA RUCHU — strefy prędkości, droga z pierwszeństwem,
   jednokierunkowa obwodnica przy murze i ich oznakowanie. Wszystko
   tu działa na NPC (update-npc.js, highway.js), znaki tylko to pokazują.
   - miasto = obszar zabudowany: 50 km/h (D-42 / D-43 na łącznicach),
     "Stare Miasto" (ulice wewnątrz kwadratu i,j = 4..8, między rondami): strefa 30 (B-43 / B-44),
     droga serwisowa w strefie wschodniej: 40 km/h (B-33),
     autostrada: 140 km/h, przy węźle i tunelach 100 km/h (B-33 100 / 140);
   - aleja j=6 (z=0) to droga z pierwszeństwem (D-1 za skrzyżowaniami), ulice poprzeczne
     mają A-7 (albo STOP), NPC z podporządkowanej ustępują i dojeżdżają wolniej;
   - ulice przy murze (j=0, i=12, j=12, i=0) to jednokierunkowa obwodnica zgodnie z ruchem
     wskazówek zegara: D-3 za skrzyżowaniami, B-2 od strony "pod prąd", C-2 (tylko w prawo)
     na wylotach ulic poprzecznych, C-6 tam, gdzie można też jechać prosto (łącznice, ulica pod estakadą).
   --------------------------------------------------------------- */
const KMH = 1 / 3.6;
const ZONE30 = { i0: 4, i1: 8, j0: 4, j1: 8 };
function inZone30(x, z){
  return x > L(ZONE30.i0) + ROAD_H && x < L(ZONE30.i1) - ROAD_H && z > L(ZONE30.j0) + ROAD_H && z < L(ZONE30.j1) - ROAD_H;
}
/* limit prędkości [m/s] w punkcie (ruch po ulicach); na autostradach i łącznicach obowiązuje vmax
   z punktów trasy (hwy-plan.js), drogi pasa podmiejskiego: 50 km/h */
function speedLimitAt(x, z){
  if (Math.abs(x) <= CITY_EDGE + 1 && Math.abs(z) <= CITY_EDGE + 1) return inZone30(x, z) ? 30*KMH : 50*KMH;
  return 50*KMH;
}

/* --- droga z pierwszeństwem: aleja j=6 od i=1 do i=12 (i=0 to zwykłe skrzyżowanie T przy murze) --- */
const PRIO_J = 6;
const PRIO = new Map();
for (let i = 1; i <= GRID; i++) PRIO.set(i + ',' + PRIO_J, 'ew');
/* oś drogi z pierwszeństwem na skrzyżowaniu najbliższym punktu (x,z) albo null */
function roadPriority(x, z){
  const i = Math.round((x + HALF) / BLOCK), j = Math.round((z + HALF) / BLOCK);
  if (Math.abs(x - L(i)) > ROAD_H + 2 || Math.abs(z - L(j)) > ROAD_H + 2) return null;
  return PRIO.get(i + ',' + j) || null;
}

/* --- jednokierunkowa obwodnica (zgodnie z ruchem wskazówek zegara z góry) --- */
const ONE_WAY = [
  { line: 'z', at: 0,    dir: {x: 1, z: 0} },     // j=0: na wschód
  { line: 'x', at: GRID, dir: {x: 0, z: 1} },     // i=12: na południe
  { line: 'z', at: GRID, dir: {x:-1, z: 0} },     // j=12: na zachód
  { line: 'x', at: 0,    dir: {x: 0, z:-1} }      // i=0: na północ
];
/* czy ruch w kierunku (dx,dz) w punkcie (x,z) jest pod prąd na ulicy jednokierunkowej (sim.js) */
function oneWayWrong(x, z, dx, dz){
  for (const w of ONE_WAY){
    const c = L(w.at), onIt = w.line === 'z' ? Math.abs(z - c) < ROAD_H : Math.abs(x - c) < ROAD_H;
    const inCross = w.line === 'z' ? Math.abs(x - L(Math.round((x + HALF) / BLOCK))) < ROAD_H : Math.abs(z - L(Math.round((z + HALF) / BLOCK))) < ROAD_H;
    if (onIt && !inCross && dx*w.dir.x + dz*w.dir.z < -0.7) return true;
  }
  return false;
}

/* --- rozstawianie znaków bez kolizji z innymi znakami, latarniami, drzewami, koszami --- */
function signSpotFree(x, z){
  if (Math.abs(x) > CITY_EDGE - 0.3 || Math.abs(z) > CITY_EDGE - 0.3) return false;    // poza chodnikami miasta
  const near = (list, r) => list.some(s => Math.hypot(s.x - x, s.z - z) < r);
  return !near(signGeomLog, 1.1) && !near(lampSpots, 0.9) && !near(treeSpots, 1.0) && !near(binSpots, 0.9) && !near(hydSpots, 0.8);
}
/* znak przy ramieniu u skrzyżowania (cx,cz): along od środka wzdłuż u, lat = odsunięcie w prawo od kierunku
   travel (kierowca, do którego znak jest zwrócony, jedzie w kierunku travel) */
function placeRuleSign(cx, cz, u, along, travel, faces, opt){
  opt = opt || {};
  const right = { x: -travel.z, z: travel.x }, rot = Math.atan2(-travel.x, -travel.z), side = opt.left ? -1 : 1;
  for (const da of [0, 1.5, -1.5, 3, -3, 4.5]){
    for (const lat0 of [ROAD_H + 0.9, ROAD_H + 1.6]){
      const lat = side * lat0;
      const x = cx + u.x*(along + da) + right.x*lat, z = cz + u.z*(along + da) + right.z*lat;
      if (signSpotFree(x, z)){ placeSign(x, z, rot, faces, opt.sign); return true; }
    }
  }
  return false;
}
const neg = u => ({ x: -u.x, z: -u.z });
/* czy jazda w kierunku travel po ramieniu u skrzyżowania (i,j) jest dozwolona (jednokierunkowe) */
function legalTravel(i, j, u, travel){
  for (const w of ONE_WAY){
    const onStreet = w.line === 'z' ? (j === w.at && u.z === 0) : (i === w.at && u.x === 0);
    if (onStreet && travel.x*w.dir.x + travel.z*w.dir.z < 0) return false;
  }
  return true;
}

/* D-6 przy każdym przejściu dla pieszych, dla obu kierunków jazdy (tuż za pasami od strony skrzyżowania) */
crosswalks.forEach(c => {
  const u = { px:{x:1,z:0}, nx:{x:-1,z:0}, pz:{x:0,z:1}, nz:{x:0,z:-1} }[c.dir];
  const cx = L(c.i), cz = L(c.j), far = CW_OFF + ROAD_W*0.08 + 0.6;
  if (Math.abs(cx + u.x*far) > CITY_EDGE - 1 || Math.abs(cz + u.z*far) > CITY_EDGE - 1) return;
  if (legalTravel(c.i, c.j, u, neg(u))) placeRuleSign(cx, cz, u, far, neg(u), [FACE.D6()]);   // dla jadących do skrzyżowania (przed pasami)
  if (legalTravel(c.i, c.j, u, u)) placeRuleSign(cx, cz, u, far, u, [FACE.D6()]);             // dla wyjeżdżających (zaraz za pasami)
});

/* aleja z pierwszeństwem: A-7 na wlotach ulic poprzecznych (STOP tam, gdzie jest), D-1 za skrzyżowaniami */
PRIO.forEach((axis, key) => {
  const [i, j] = key.split(',').map(Number), cx = L(i), cz = L(j);
  const hasStop = stopSigns.some(s => Math.abs(s.x - cx) < 1 && Math.abs(s.z - cz) < 1);
  [{x:0,z:-1},{x:0,z:1}].forEach(u => {
    if (j + u.z < 0 || j + u.z > GRID) return;
    if (!hasStop && legalTravel(i, j, u, neg(u))) placeRuleSign(cx, cz, u, STOP_AT, neg(u), [FACE.A7()]);
  });
  [{x:1,z:0},{x:-1,z:0}].forEach(u => {
    if (i + u.x < 1 || i + u.x > GRID) return;
    placeRuleSign(cx, cz, u, ROAD_H + 5, u, [FACE.D1()]);
  });
});

/* strefa 30: B-43 na wjazdach z ulic granicznych w ulice wewnętrzne, B-44 na wyjazdach */
for (let k = 1; k < ZONE30.i1 - ZONE30.i0; k++){
  [[ZONE30.i0 + k, ZONE30.j0, {x:0,z:1}], [ZONE30.i0 + k, ZONE30.j1, {x:0,z:-1}],
   [ZONE30.i0, ZONE30.j0 + k, {x:1,z:0}], [ZONE30.i1, ZONE30.j0 + k, {x:-1,z:0}]].forEach(e => {
    const cx = L(e[0]), cz = L(e[1]), u = e[2];
    placeRuleSign(cx, cz, u, ROAD_H + 6.5, u, [FACE.B43()]);         // wjazd do strefy
    placeRuleSign(cx, cz, u, ROAD_H + 7.5, neg(u), [FACE.B44()]);    // wyjazd ze strefy
  });
}

/* obwodnica jednokierunkowa: D-3 za każdym skrzyżowaniem, B-2 od strony wjazdu pod prąd,
   C-2 / C-6 na wylotach ulic poprzecznych (dozwolony tylko skręt w prawo / prosto lub w prawo) */
ONE_WAY.forEach(w => {
  for (let k = 0; k <= GRID; k++){
    const i = w.line === 'z' ? k : w.at, j = w.line === 'z' ? w.at : k, cx = L(i), cz = L(j);
    const fwd = w.dir, back = neg(w.dir);
    const ni = i + fwd.x, nj = j + fwd.z, pi = i - fwd.x, pj = j - fwd.z;
    if (ni >= 0 && ni <= GRID && nj >= 0 && nj <= GRID) placeRuleSign(cx, cz, fwd, ROAD_H + 4.5, fwd, [FACE.D3()]);
    if (pi >= 0 && pi <= GRID && pj >= 0 && pj <= GRID) placeRuleSign(cx, cz, back, ROAD_H + 2.5, back, [FACE.B2()], { left: true });   // po stronie miasta
    /* wylot ulicy poprzecznej (ramię skierowane do środka miasta) */
    const inward = w.line === 'z' ? { x: 0, z: w.at === 0 ? 1 : -1 } : { x: w.at === 0 ? 1 : -1, z: 0 };
    if (k === 0 || k === GRID) continue;                                       // narożniki: jedyna droga to skręt w prawo
    /* wyloty, z których prosto jedzie się na wjazd na autostradę (hwy-plan.js: końce w pasie podmiejskim) */
    const straightOn = (w.line === 'x' && w.at === GRID && j === 10) || (w.line === 'z' && w.at === GRID && i === 2) ||
                       (w.line === 'x' && w.at === 0 && j === 2) || (w.line === 'z' && w.at === 0 && i === 10);
    placeRuleSign(cx, cz, inward, STOP_AT, neg(inward), [straightOn ? FACE.C6() : FACE.C2()]);
  }
});

