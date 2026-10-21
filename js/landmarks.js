/* ---------------------------------------------------------------
   7a4. DETALE LOTNISK I PORTÓW — każde miejsce z własnym charakterem (jedna scalona siatka z kolorami wierzchołków):
   lotnisko na wysepce (międzynarodowe): łukowy dach terminalu z żebrami elewacji, okrągła wieża ze szklaną kabiną,
   radar, światła podejścia, cysterna i wózki bagażowe, maszty oświetleniowe; lotnisko miejskie (regionalne):
   ceglany terminal z dachem dwuspadowym, kwadratowa wieża z ośmiokątną kabiną, dwa hangary łukowe, zbiorniki
   paliwa, rękaw wiatrowy; port towarowy: falochron z latarnią (biało-czerwoną), zbiorniki paliw, holownik, klinowy
   dziób statku; przystań pasażerska na wysepce: dach kasy, ławki, prom, jachty z masztami, latarnie wejścia
   (zielona i czerwona). Wywoływane z city-generation.js po zbudowaniu lotnisk, portu i szpitala.
   --------------------------------------------------------------- */
const LM = [];                                   // { geo, color, x, y, z, rx?, ry?, rz? }
const lmAdd = (geo, color, x, y, z, ry, rx, rz) => LM.push({ geo: geo, color: color, x: x, y: y, z: z, ry: ry || 0, rx: rx || 0, rz: rz || 0 });
const lmBox = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const lmCyl = (rt, rb, h, seg) => new THREE.CylinderGeometry(rt, rb, h, seg || 14);
/* pół walca nad ziemią: oś wzdłuż X (alongZ = true — wzdłuż Z), promień r, długość len, spłaszczenie sy */
function lmHalfCyl(r, len, sy, alongZ, open){
  const g = new THREE.CylinderGeometry(r, r, len, 20, 1, !!open, 0, Math.PI);
  g.rotateZ(Math.PI / 2); g.scale(1, sy || 1, 1); if (alongZ) g.rotateY(Math.PI / 2);
  return g;
}
/* graniastosłup trójkątny (dach dwuspadowy): szerokość w, wysokość h, długość len wzdłuż Z (ridgeAlongX — wzdłuż X) */
function lmGable(w, h, len, ridgeAlongX){
  const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(0, h); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false }); g.translate(0, 0, -len / 2);
  if (ridgeAlongX) g.rotateY(Math.PI / 2);
  return g;
}
/* klin (dziób): podstawa szerokości w przy x = 0, czubek w x = L, wysokość h (od y = 0) */
function lmWedge(L, w, h){
  const sh = new THREE.Shape(); sh.moveTo(0, -w / 2); sh.lineTo(L, 0); sh.lineTo(0, w / 2); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false }); g.rotateX(-Math.PI / 2);
  return g;
}
function lmLamp(x, z, h){ lmAdd(lmBox(0.25, h, 0.25), 0x6f767c, x, h / 2, z); lmAdd(lmBox(1.6, 0.35, 0.9), 0x3b4046, x, h, z); lmAdd(lmBox(1.4, 0.08, 0.7), 0xfff3d0, x, h - 0.2, z); }

function buildLandmarks(){
  /* ===== lotnisko na wysepce (międzynarodowe) ===== */
  {
    const A = AIRPORT, tm = A.term, tcx = (tm.x0 + tm.x1) / 2, tcz = (tm.z0 + tm.z1) / 2, tw = tm.x1 - tm.x0, td = tm.z1 - tm.z0, th = 11;
    lmAdd(lmHalfCyl(td / 2 + 2.5, tw + 5, 0.36, false, true), 0xdfe3e7, tcx, th + 0.6, tcz);                     // łukowy dach z okapami
    for (let x = tm.x0 + 1.5; x < tm.x1; x += 3.5){ lmAdd(lmBox(0.35, th, 0.7), 0xf2f3f4, x, th / 2, tm.z1 + 0.3); lmAdd(lmBox(0.35, th, 0.7), 0xf2f3f4, x, th / 2, tm.z0 - 0.3); }
    for (const x of [tm.x0 + 6, tcx - 12, tcx + 12, tm.x1 - 6]) lmAdd(lmCyl(0.35, 0.35, 4.2, 10), 0xdfe3e7, x, 2.1, tm.z1 + 1.8);   // słupy daszku
    /* wieża: okrągły trzon, galeria, szklana kabina, dach, maszt z radarem */
    const wx = 60, wz = -712;
    lmAdd(lmCyl(2.2, 2.9, 24, 18), 0xf0efeb, wx, 12, wz); lmAdd(lmCyl(4.9, 4.9, 0.5, 20), 0xdfe3e7, wx, 24.1, wz);
    lmAdd(lmCyl(4.7, 3.9, 4.2, 20), 0x22394a, wx, 26.5, wz); lmAdd(lmCyl(5.0, 5.0, 0.5, 20), 0xdfe3e7, wx, 28.8, wz);
    lmAdd(lmCyl(1.2, 4.6, 1.2, 20), 0x5b6168, wx, 29.6, wz); lmAdd(lmBox(0.3, 5, 0.3), 0x8a8f96, wx, 32.6, wz); lmAdd(lmBox(3.2, 0.9, 0.25), 0xe9eaec, wx, 34.9, wz, 0.6);
    for (let k = 0; k < 6; k++) lmAdd(lmBox(0.15, 4.2, 0.15), 0xdfe3e7, wx + Math.sin(k / 6 * TAU) * 4.4, 26.5, wz + Math.cos(k / 6 * TAU) * 4.4);
    staticCylinder(wx, 12, wz, 2.9, 24); buildings.push({ x: wx, z: wz, w: 6, d: 6 });
    /* radar na kratownicy */
    lmAdd(lmBox(1.4, 14, 1.4), 0xb9bec6, 165, 7, -722); lmAdd(lmBox(7, 2.4, 0.4), 0xf2f3f4, 165, 15, -722, 0.4); lmAdd(lmCyl(1.6, 1.6, 1, 12), 0x6f767c, 165, 14, -722);
    staticBox(165, 7, -722, 1.4, 14, 1.4);
    /* światła podejścia za oboma progami (rząd lamp + poprzeczka) */
    const rw = A.runway;
    for (const e of [-1, 1]) for (let d = 3; d <= 20; d += 3.4){
      const x = (e < 0 ? rw.x0 : rw.x1) + e * d;
      lmAdd(lmBox(0.25, 1.2, 0.25), 0x6f767c, x, 0.6, rw.z); lmAdd(lmBox(0.5, 0.25, 0.5), 0xfff7d6, x, 1.3, rw.z);
      if (Math.abs(d - 9.8) < 0.1) lmAdd(lmBox(0.3, 0.3, 14), 0xfff7d6, x, 1.3, rw.z);
    }
    /* płyta: cysterna, ciągnik z wózkami bagażowymi, maszty oświetleniowe */
    lmAdd(lmBox(2.4, 2.2, 2.2), 0xe9eaec, -2, 1.3, -729); lmAdd(lmCyl(1.15, 1.15, 5.5, 14), 0xd8d4cc, 2.2, 1.7, -729, 0, 0, Math.PI / 2); lmAdd(lmBox(8.5, 0.6, 2.2), 0x262a30, 1.2, 0.45, -729);
    staticBox(1.2, 1.4, -729, 8.5, 2.8, 2.3);
    lmAdd(lmBox(1.8, 1.4, 1.4), 0xe0b020, -48, 0.9, -726);
    for (let k = 0; k < 3; k++){ lmAdd(lmBox(2.4, 0.5, 1.4), 0x5b6168, -44.5 + k * 3, 0.6, -726); lmAdd(lmBox(2.2, 0.9, 1.2), [0x2e4d8f, 0xb3272b, 0x2f6f4e][k], -44.5 + k * 3, 1.3, -726); }
    staticBox(-41, 0.9, -726, 12, 1.8, 1.6);
    for (const [x, z] of [[-62, -748], [40, -748], [80, -722]]){ lmLamp(x, z, 18); staticBox(x, 9, z, 0.4, 18, 0.4); }
  }
  /* ===== lotnisko miejskie (regionalne) ===== */
  {
    const A = AIRPORT_W, tm = A.term, tcx = (tm.x0 + tm.x1) / 2, tcz = (tm.z0 + tm.z1) / 2, tw = tm.x1 - tm.x0, td = tm.z1 - tm.z0, th = 9;
    lmAdd(lmBox(tw, th, td), 0x9a4b35, tcx, th / 2, tcz);                                                     // cegła
    lmAdd(lmBox(tw + 0.2, 0.5, td + 0.2), 0xd9cfc2, tcx, 4.4, tcz);                                            // gzyms między kondygnacjami
    for (const fy of [2.3, 6.6]) for (let z = tm.z0 + 3; z < tm.z1 - 2; z += 4){                                // okna obu kondygnacji (obie dłuższe ściany)
      lmAdd(lmBox(0.12, 1.6, 2.2), 0x1f2d38, tm.x1 + 0.04, fy, z); lmAdd(lmBox(0.12, 1.6, 2.2), 0x1f2d38, tm.x0 - 0.04, fy, z);
    }
    lmAdd(lmBox(0.14, 3.2, 6), 0x24323d, tm.x1 + 0.06, 1.7, tcz + 8);                                         // wejście
    lmAdd(lmGable(tw + 1.6, 4, td + 1.6), 0x3d4248, tcx, th, tcz);                                             // dach dwuspadowy (kalenica wzdłuż z)
    lmAdd(lmBox(3, 0.25, 7), 0x7a5a3a, tm.x1 + 1.5, 3.6, tcz + 8);                                             // drewniany daszek
    /* wieża: ceglany kwadratowy trzon, ośmiokątna kabina z daszkiem */
    const wx = -305, wz = 30;
    lmAdd(lmBox(4.4, 17, 4.4), 0x8e4430, wx, 8.5, wz); lmAdd(lmBox(5.4, 0.5, 5.4), 0xd9cfc2, wx, 17.2, wz);
    lmAdd(lmCyl(3.6, 3.2, 3.4, 8), 0x22394a, wx, 19.2, wz); lmAdd(lmCyl(1.0, 4.2, 1.6, 8), 0x3d4248, wx, 21.7, wz);
    lmAdd(lmBox(0.2, 3, 0.2), 0x8a8f96, wx, 24, wz); lmAdd(lmBox(0.5, 0.5, 0.5), 0xd8402c, wx, 25.6, wz);
    /* dwa hangary łukowe (wrota od strony płyty — na północ) */
    for (const hz of [92, 126]){
      const hx = -333, r = 13, len = 30;
      lmAdd(lmHalfCyl(r, len, 0.8, true, true), 0x7d8a72, hx, 0, hz);
      for (const e of [-1, 1]){ const cap = new THREE.CircleGeometry(r, 20, 0, Math.PI); cap.scale(1, 0.8, 1); if (e < 0) cap.rotateY(Math.PI); lmAdd(cap, 0x6f7a66, hx, 0, hz + e * len / 2); }
      lmAdd(lmBox(14, 7.5, 0.2), 0x3a3f44, hx, 3.75, hz - len / 2 - 0.12);
    }
    /* zbiorniki paliwa (biało-czerwone), rękaw wiatrowy przy północnym końcu pasa */
    for (const z of [76, 84]){ lmAdd(lmCyl(2.4, 2.4, 4.2, 16), 0xf2f0ea, -300, 2.1, z); lmAdd(lmCyl(2.45, 2.45, 0.6, 16), 0xc0392b, -300, 3.4, z); staticCylinder(-300, 2.1, z, 2.4, 4.2); }
    const rw = A.runway;
    lmAdd(lmBox(0.15, 6, 0.15), 0xcfd2d4, rw.x + rw.hw + 8, 3, rw.z0 + 12); lmAdd(lmCyl(0.35, 0.6, 2.4, 10), 0xe8701c, rw.x + rw.hw + 9.1, 5.6, rw.z0 + 12, 0, 0, Math.PI / 2);
  }
  /* ===== port towarowy (wyspa główna) ===== */
  {
    const E = WALL_X;
    /* klinowy dziób statku i holownik przy rufie */
    const sx1 = -46, sz0 = -E - 21, sz1 = -E - 5, scz = (sz0 + sz1) / 2;
    lmAdd(lmWedge(12, sz1 - sz0, 7), 0x1f3550, sx1, -0.9, scz);
    lmAdd(lmBox(10, 2.2, 3.6), 0xb3272b, -24, -0.2, -E - 12); lmAdd(lmWedge(3, 3.6, 2.2), 0xb3272b, -19, -1.3, -E - 12);
    lmAdd(lmBox(4, 2.4, 3), 0xf2f0ea, -25, 2.1, -E - 12); lmAdd(lmBox(0.8, 2, 0.8), 0x262a30, -27, 3.6, -E - 12);
    BOAT_OBSTACLES.push({ x0: -30, x1: -15, z0: -E - 14.5, z1: -E - 9.5 });
    /* falochron z latarnią (biało-czerwone pasy) za przystanią */
    const bx0 = 160, bx1 = 166, bz0 = -E - 58;
    lmAdd(lmBox(bx1 - bx0, 1.2, -bz0 - E + 0.2), 0x8d8f92, (bx0 + bx1) / 2, -0.6, (bz0 - E) / 2);
    for (let z = bz0 + 2; z < -E - 1; z += 3.5) for (const s of [-1, 1]) lmAdd(lmBox(1.6, 1.0, 1.8), 0x6f7174, (bx0 + bx1) / 2 + s * 3.4, -0.5, z, z * 0.7);
    staticBox((bx0 + bx1) / 2, -0.6, (bz0 - E) / 2, bx1 - bx0, 1.2, -bz0 - E + 0.2);
    PIERS.push({ x0: bx0, x1: bx1, z0: bz0, z1: -E });
    const lx = (bx0 + bx1) / 2, lz = bz0 + 3;
    for (let k = 0; k < 6; k++) lmAdd(lmCyl(1.5 - (k + 1) * 0.07, 1.5 - k * 0.07, 2, 16), k % 2 ? 0xc0392b : 0xf2f0ea, lx, 1 + k * 2, lz);
    lmAdd(lmCyl(1.3, 1.3, 0.3, 16), 0x2a2c30, lx, 12.2, lz); lmAdd(lmCyl(0.9, 0.9, 1.6, 12), 0xfff3b0, lx, 13.1, lz); lmAdd(lmCyl(0.2, 1.2, 1.2, 12), 0xc0392b, lx, 14.5, lz);
    staticCylinder(lx, 6, lz, 1.5, 12);
    mapExtras.push({ t: 'rect', x0: bx0, x1: bx1, z0: bz0, z1: -E, c: '#5a5c60' });
    /* zbiorniki paliw (białe, z ciemnym dachem) */
    for (const [x, z] of [[118, -352], [140, -352], [129, -326]]){
      lmAdd(lmCyl(8, 8, 11, 24), 0xeceae4, x, 5.5, z); lmAdd(lmCyl(1.5, 8.1, 1.4, 24), 0x5b6168, x, 11.7, z); lmAdd(lmBox(0.4, 11, 1), 0x8a8f96, x + 8, 5.5, z);
      staticCylinder(x, 5.5, z, 8, 11); buildings.push({ x: x, z: z, w: 16, d: 16 });
    }
  }
  /* ===== przystań pasażerska na wysepce ===== */
  {
    const z1 = ISLANDS[1].z1;
    lmAdd(lmGable(17.4, 3.2, 11.4, true), 0xb3272b, 60, 6, z1 - 18);                                            // czerwony dach kasy
    for (const x of [-100, -70, -40, -10, 20]){ lmAdd(lmBox(2.2, 0.12, 0.6), 0x7a5a3a, x, 0.5, z1 - 11); lmAdd(lmBox(2.2, 0.5, 0.1), 0x7a5a3a, x, 0.8, z1 - 11.3); lmAdd(lmBox(0.1, 0.45, 0.5), 0x2a2c30, x - 1, 0.25, z1 - 11); lmAdd(lmBox(0.1, 0.45, 0.5), 0x2a2c30, x + 1, 0.25, z1 - 11); }
    /* latarnie wejścia: zielona (na prawej burcie wpływającego) i czerwona na końcach pomostów */
    for (const [x, c] of [[-90, 0x2f8a4c], [-10, 0xc0392b]]){
      const z = z1 + 31;
      lmAdd(lmCyl(0.55, 0.7, 5, 12), c, x, 2.5, z); lmAdd(lmCyl(0.45, 0.45, 0.9, 10), 0xfff3b0, x, 5.4, z); lmAdd(lmCyl(0.1, 0.6, 0.6, 10), c, x, 6.1, z);
      staticCylinder(x, 2.5, z, 0.7, 5);
    }
    /* prom pasażerski przy nabrzeżu (między pomostami) */
    const fx0 = -72, fx1 = -40, fz = z1 + 5;
    lmAdd(lmBox(fx1 - fx0, 2.4, 7), 0xf2f3f4, (fx0 + fx1) / 2, -0.1, fz); lmAdd(lmBox(fx1 - fx0 + 0.1, 0.6, 7.1), 0x1a4fa0, (fx0 + fx1) / 2, -0.9, fz);
    lmAdd(lmWedge(6, 7, 2.4), 0xf2f3f4, fx1, -1.3, fz);
    lmAdd(lmBox(20, 2.4, 6), 0xf2f3f4, (fx0 + fx1) / 2 - 2, 2.3, fz); lmAdd(lmBox(20.1, 0.9, 6.1), 0x22394a, (fx0 + fx1) / 2 - 2, 2.5, fz);
    lmAdd(lmBox(10, 2, 5), 0xf2f3f4, (fx0 + fx1) / 2 - 4, 4.5, fz); lmAdd(lmBox(10.1, 0.7, 5.1), 0x22394a, (fx0 + fx1) / 2 - 4, 4.6, fz);
    lmAdd(lmCyl(0.8, 1, 2.4, 12), 0x1a4fa0, (fx0 + fx1) / 2 - 8, 6.5, fz);
    staticBox((fx0 + fx1) / 2 + 2, 1.5, fz, fx1 - fx0 + 6, 5, 7);
    BOAT_OBSTACLES.push({ x0: fx0 - 1, x1: fx1 + 7, z0: fz - 4.5, z1: fz + 4.5 });
    mapExtras.push({ t: 'rect', x0: fx0, x1: fx1 + 6, z0: fz - 3.5, z1: fz + 3.5, c: '#d9dde2' });
    /* jachty z masztami przy drugim pomoście */
    for (const z of [z1 + 12, z1 + 24]){
      const x = -15.6;
      lmAdd(lmBox(2, 1.0, 6), 0xf2f3f4, x, -0.4, z); lmAdd(lmWedge(2.2, 2, 1.0), 0xf2f3f4, x, -0.9, z + 3, -Math.PI / 2);
      lmAdd(lmBox(1.2, 0.7, 2), 0xe9e4d8, x, 0.45, z - 0.8); lmAdd(lmBox(0.14, 9, 0.14), 0xd8d4cc, x, 4.9, z + 0.5); lmAdd(lmBox(0.08, 0.08, 3.4), 0xd8d4cc, x, 1.3, z - 1.2);
      BOAT_OBSTACLES.push({ x0: x - 1.4, x1: x + 1.4, z0: z - 3.5, z1: z + 5.6 });
    }
  }
  const m = new THREE.Mesh(mergeColored(LM), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  m.castShadow = m.receiveShadow = true; scene.add(m);
  LM.length = 0;
}
