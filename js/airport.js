/* ---------------------------------------------------------------
   7a2. LOTNISKO — północny pas podmiejski (między obwodnicą j=0 a murem), x ∈ ±150 m:
   z dala od dróg zjazdowych autostrad (najbliższa przy |x| ≈ 176 m). Od miasta: dojazd z ulicy i=5
   (skrzyżowanie z obwodnicą przy x = −44), parking, droga przed terminalem; strona lotnicza za
   ogrodzeniem: płyta postojowa z samolotami i rękawami, droga kołowania, pas startowy 09/27,
   wieża, hangar, rękaw wiatrowy. Wywoływane z city-generation.js (buildAirport).
   --------------------------------------------------------------- */
const AIRPORT = {
  runway: { x0: -150, x1: 150, z: -378, hw: 12 },          // pas startowy 300 × 24 m
  taxi:   { x0: -140, x1: 140, z: -356, hw: 5 },           // droga kołowania
  apron:  { x0: -70, x1: 85, z0: -351, z1: -320 },         // płyta postojowa
  term:   { x0: -30, x1: 40, z0: -320, z1: -304 },         // terminal
  access: { x: L(5), z0: -CITY_EDGE, z1: -302, hw: 4 },    // dojazd z ulicy i=5
  front:  { x0: L(5), x1: 40, z: -298, hw: 4 },            // droga przed terminalem (dalej objazd wysepki do dojazdu)
  park:   { x0: -150, x1: -52, z0: -291, z1: -274 },       // parking
  fenceZ: -303
};
const AIRPORT_PARKED = [];   // miejsca aut zaparkowanych na parkingu (vehicle-entry.js stawia tam auta „ambient”)
const AIRPORT_PLANES = [];
const NPC_COLORS_AIR = [0x2e4d8f, 0xd9d4c8, 0x2f6f4e, 0x8a8f96, 0xe0a52c, 0x6b3a8f, 0x1b1d22, 0xb3272b];
const carTopOf2 = type => Math.max(...carParts(type).map(q => q[5] + q[1] / 2));   // { x, z, heading, kind } — przyszłe latanie

/* samolot na lotnisku: tylko miejsce i typ — model, kolizję i latanie buduje planes.js */
function buildPlane(x, z, heading, s, livery, prop){ AIRPORT_PLANES.push({ x: x, z: z, heading: heading, kind: prop ? 'prop' : 'jet', livery: livery }); }

function buildAirport(){
  const A = AIRPORT, y = 0.03;
  /* drzewa pasa podmiejskiego z obszaru lotniska */
  for (let i = treeSpots.length - 1; i >= 0; i--){ const t = treeSpots[i]; if (t.z < -CITY_EDGE && Math.abs(t.x) < 162) treeSpots.splice(i, 1); }
  const paint = (x0, z0, x1, z1, w, col, yy) => {            // pas malowany (linia) na nawierzchni
    const l = Math.hypot(x1 - x0, z1 - z0) || 1, nx = -(z1 - z0) / l * w / 2, nz = (x1 - x0) / l * w / 2;
    CB(col || 0xeeeeea).quad([x0 - nx, yy || y + 0.012, z0 - nz], [x0 + nx, yy || y + 0.012, z0 + nz], [x1 + nx, yy || y + 0.012, z1 + nz], [x1 - nx, yy || y + 0.012, z1 - nz], [0,0],[1,0],[1,1],[0,1]);
  };
  const flat = (buf, x0, x1, z0, z1, yy) => { buf.plane((x0 + x1) / 2, yy, (z0 + z1) / 2, x1 - x0, z1 - z0, (x1 - x0) / 6, (z1 - z0) / 6); };
  const YEL = 0xe0b020;

  /* --- pas startowy 09/27: krawędzie, oś przerywana, progi, oznaczenia, światła krawędziowe --- */
  const rw = A.runway;
  flat(crossBuf, rw.x0, rw.x1, rw.z - rw.hw, rw.z + rw.hw, y);
  paint(rw.x0 + 2, rw.z - rw.hw + 0.6, rw.x1 - 2, rw.z - rw.hw + 0.6, 0.45);
  paint(rw.x0 + 2, rw.z + rw.hw - 0.6, rw.x1 - 2, rw.z + rw.hw - 0.6, 0.45);
  for (let x = rw.x0 + 34; x < rw.x1 - 34; x += 30) paint(x, rw.z, x + 18, rw.z, 0.6);
  for (const e of [-1, 1]){
    const xe = e < 0 ? rw.x0 + 4 : rw.x1 - 4;
    for (let k = 0; k < 8; k++){ const zz = rw.z - rw.hw + 2 + k * (2 * rw.hw - 4) / 7; paint(xe, zz, xe - e * 18, zz, 1.2); }   // progi „zebra”
    for (const zz of [rw.z - 4.5, rw.z + 4.5]) paint(xe - e * 60, zz, xe - e * 82, zz, 2.0);              // strefa przyziemienia
    /* numer pasa (leżący napis, czytany od strony podejścia) */
    const xn = xe - e * 26, num = e < 0 ? '09' : '27';
    const p = e < 0 ? [[xn - 5, y + 0.02, rw.z + 3.5], [xn - 5, y + 0.02, rw.z - 3.5], [xn + 5, y + 0.02, rw.z - 3.5], [xn + 5, y + 0.02, rw.z + 3.5]]
                    : [[xn + 5, y + 0.02, rw.z - 3.5], [xn + 5, y + 0.02, rw.z + 3.5], [xn - 5, y + 0.02, rw.z + 3.5], [xn - 5, y + 0.02, rw.z - 3.5]];
    wordSignQuad(num, '#3d3f43', '#eeeeea', p[0], p[1], p[2], p[3]);
  }
  for (let x = rw.x0 + 2; x <= rw.x1 - 2; x += 25) for (const sd of [-1, 1]){ CB(0xf4f1e6).box(x, 0.25, rw.z + sd * (rw.hw + 1.2), 0.3, 0.5, 0.3, 1, true); }

  /* --- droga kołowania z łącznikami do pasa (żółta oś) --- */
  const tx = A.taxi;
  flat(crossBuf, tx.x0, tx.x1, tx.z - tx.hw, tx.z + tx.hw, y + 0.002);
  paint(tx.x0 + 4, tx.z, tx.x1 - 4, tx.z, 0.25, YEL);
  for (const xc of [tx.x0 + 8, tx.x1 - 8, 0]){
    flat(crossBuf, xc - tx.hw, xc + tx.hw, rw.z + rw.hw, tx.z - tx.hw, y + 0.001);
    paint(xc, rw.z + rw.hw - 2, xc, tx.z, 0.25, YEL);
    paint(xc - tx.hw, rw.z + rw.hw + 6, xc + tx.hw, rw.z + rw.hw + 6, 0.35, YEL);             // linia oczekiwania
  }

  /* --- płyta postojowa: beton, linie prowadzenia na stanowiska --- */
  const ap = A.apron;
  CB(0x8a8780).plane((ap.x0 + ap.x1) / 2, y + 0.004, (ap.z0 + ap.z1) / 2, ap.x1 - ap.x0, ap.z1 - ap.z0, 1, 1);
  const gates = [-12, 22];
  gates.forEach(gx => paint(gx, ap.z0 + 1, gx, ap.z1 - 3, 0.25, YEL, y + 0.016));
  paint(ap.x0 + 2, ap.z0 + 6, ap.x1 - 2, ap.z0 + 6, 0.25, YEL, y + 0.016);

  /* --- samoloty: dwa odrzutowce przy rękawach, jeden na drodze kołowania, awionetka przy hangarze --- */
  buildPlane(gates[0], ap.z1 - 17, Math.PI, 1, 0x1a4fa0);     // przy rękawie, nosem w stronę drogi kołowania (da się wykołować)
  buildPlane(gates[1], ap.z1 - 17, Math.PI, 1, 0xc0392b);
  buildPlane(-105, tx.z, Math.PI / 2, 1, 0x2f8a4c);
  buildPlane(98, ap.z0 + 9, -Math.PI / 2, 1, 0xe0a52c, true);

  /* --- terminal: szklana bryła, dach, napis od strony miasta, rękawy, daszek nad wejściem --- */
  const tm = A.term, tcx = (tm.x0 + tm.x1) / 2, tcz = (tm.z0 + tm.z1) / 2, tw = tm.x1 - tm.x0, td = tm.z1 - tm.z0, th = 11;
  glassWallBuf.box(tcx, th / 2, tcz, tw, th, td, 4, false);
  roofBuf.plane(tcx, th, tcz, tw, td, tw / 6, td / 6);
  CB(0x4a4f55).box(tcx, th + 0.3, tcz, tw + 0.6, 0.6, td + 0.6, 2, false);
  staticBox(tcx, th / 2, tcz, tw, th, td);
  buildings.push({ x: tcx, z: tcz, w: tw, d: td });
  wordSignQuad('LOTNISKO', '#1a4fa0', '#ffffff', [tcx - 12, th - 3.4, tm.z1 + 0.06], [tcx + 12, th - 3.4, tm.z1 + 0.06], [tcx + 12, th - 0.8, tm.z1 + 0.06], [tcx - 12, th - 0.8, tm.z1 + 0.06]);
  CB(0xd8d4cc).box(tcx, 4.2, tm.z1 + 1.0, 26, 0.3, 2.0, 1, true);                // daszek nad wejściem (wspornikowy)
  gates.forEach(gx => { CB(0xc9cdd1).box(gx + 3.2, 4.0, tm.z0 - 6, 2.6, 2.8, 12, 2, true); CB(0x6f767c).box(gx + 3.2, 1.3, tm.z0 - 10.5, 0.6, 2.6, 0.6, 1, false);
    staticBox(gx + 3.2, 4.0, tm.z0 - 6, 2.6, 2.8, 12); staticBox(gx + 3.2, 1.3, tm.z0 - 10.5, 0.6, 2.6, 0.6); });

  /* --- wieża kontroli lotów --- */
  const wx = 60, wz = -312;
  CB(0xd3cfc6).box(wx, 11, wz, 4, 22, 4, 2, false);
  glassWallBuf.box(wx, 24, wz, 7.5, 4, 7.5, 2, false);
  CB(0x3b4046).box(wx, 26.3, wz, 8.5, 0.6, 8.5, 2, true);
  CB(0x8a8f96).box(wx, 28.5, wz, 0.2, 4, 0.2, 1, true);
  staticBox(wx, 11, wz, 4, 22, 4);
  buildings.push({ x: wx, z: wz, w: 4, d: 4 });

  /* --- hangar (blacha, dach dwuspadowy, wrota od strony płyty) --- */
  const hx = 118, hz = -334, hw2 = 34, hd = 26, hh = 12;
  corrBuf.box(hx, hh / 2, hz, hw2, hh, hd, 6, false);
  quadOut(CB(0x6d7174), [hx - hw2 / 2 - 0.3, hh, hz - hd / 2 - 0.3], [hx + hw2 / 2 + 0.3, hh, hz - hd / 2 - 0.3], [hx + hw2 / 2 + 0.3, hh + 3, hz], [hx - hw2 / 2 - 0.3, hh + 3, hz], [0, 1, -1]);
  quadOut(CB(0x6d7174), [hx - hw2 / 2 - 0.3, hh, hz + hd / 2 + 0.3], [hx + hw2 / 2 + 0.3, hh, hz + hd / 2 + 0.3], [hx + hw2 / 2 + 0.3, hh + 3, hz], [hx - hw2 / 2 - 0.3, hh + 3, hz], [0, 1, 1]);
  for (const sx of [-1, 1]) triOut(CB(0x8f9497), [hx + sx * hw2 / 2, hh, hz - hd / 2], [hx + sx * hw2 / 2, hh, hz + hd / 2], [hx + sx * hw2 / 2, hh + 3, hz], [sx, 0, 0]);
  CB(0x3f4449).plane(hx, hh * 0.45, hz - hd / 2 - 0.02, hw2 * 0.8, hh * 0.85, 1, 1);
  quadOut(CB(0x3f4449), [hx - hw2 * 0.4, 0.05, hz - hd / 2 - 0.03], [hx + hw2 * 0.4, 0.05, hz - hd / 2 - 0.03], [hx + hw2 * 0.4, hh * 0.85, hz - hd / 2 - 0.03], [hx - hw2 * 0.4, hh * 0.85, hz - hd / 2 - 0.03], [0, 0, -1]);
  staticBox(hx, hh / 2, hz, hw2, hh, hd);
  buildings.push({ x: hx, z: hz, w: hw2, d: hd });

  /* --- rękaw wiatrowy przy pasie --- */
  CB(0xcfd2d4).box(-128, 3, rw.z + rw.hw + 9, 0.15, 6, 0.15, 1, true);
  CB(0xe8701c).boxRot(-127, 5.6, rw.z + rw.hw + 9, 2.2, 0.6, 0.6, 0.3, 1, true);

  /* --- strona miejska: dojazd z ulicy i=5, droga przed terminalem, parking --- */
  const ac = A.access, fr = A.front, pk = A.park;
  flat(crossBuf, ac.x - ac.hw, ac.x + ac.hw, ac.z1, ac.z0, y);
  paint(ac.x, ac.z0 - 3, ac.x, fr.z + fr.hw + 1, 0.15);                         // oś (przerywana)
  for (let z = ac.z0 - 2; z > fr.z + fr.hw + 2; z -= 6) paint(ac.x, z, ac.x, z - 3, 0.16, 0xeeeeea, y + 0.016);
  flat(crossBuf, fr.x0 - ac.hw, fr.x1, fr.z - fr.hw, fr.z + fr.hw, y + 0.001);
  /* objazd wysepki: wschodnia odnoga w dół i powrót wzdłuż obwodnicy do dojazdu (jednokierunkowo) */
  const lz = -279;
  flat(crossBuf, fr.x1 - 2 * fr.hw, fr.x1, fr.z - fr.hw, lz + fr.hw, y + 0.0012);
  flat(crossBuf, ac.x + ac.hw, fr.x1, lz - fr.hw, lz + fr.hw, y + 0.0014);
  const ix0 = ac.x + ac.hw, ix1 = fr.x1 - 2 * fr.hw, iz0 = fr.z + fr.hw, iz1 = lz - fr.hw;
  CB(0x5f8a46).box((ix0 + ix1) / 2, 0.12, (iz0 + iz1) / 2, ix1 - ix0, 0.24, iz1 - iz0, 2, true);   // wysepka z trawą (krawężnik)
  staticBox((ix0 + ix1) / 2, 0.12, (iz0 + iz1) / 2, ix1 - ix0, 0.24, iz1 - iz0);
  for (const mx of [-20, -8, 4]){ CB(0xcfd2d4).box(mx, 4, (iz0 + iz1) / 2, 0.14, 8, 0.14, 1, true); CB([0xc0392b, 0x1a4fa0, 0xeeeeea][(mx + 20) / 12]).box(mx + 0.8, 7.2, (iz0 + iz1) / 2, 1.5, 1.0, 0.04, 1, true); staticBox(mx, 4, (iz0 + iz1) / 2, 0.2, 8, 0.2); }
  for (let x = fr.x0 + 6; x < fr.x1 - 10; x += 6) paint(x, fr.z, x + 3, fr.z, 0.15, 0xeeeeea, y + 0.016);
  flat(crossBuf, pk.x1, ac.x - ac.hw, (pk.z0 + pk.z1) / 2 - 3.5, (pk.z0 + pk.z1) / 2 + 3.5, y + 0.001);     // wjazd na parking
  /* parking: 2 rzędy stanowisk P-18 z alejką, wjazd od dojazdu */
  flat(crossBuf, pk.x0, pk.x1, pk.z0, pk.z1, y);
  const rows = [[pk.z1 - 2.5, 1], [pk.z0 + 2.5, -1]];
  for (let x = pk.x0 + 1; x <= pk.x1 - 1.5; x += 2.6){
    rows.forEach(r => { paint(x, r[0] - 2.5, x, r[0] + 2.5, 0.1); });
    if (x + 1.3 < pk.x1 - 1) rows.forEach(r => { if (rnd() < 0.42) AIRPORT_PARKED.push({ x: x + 1.3, z: r[0], heading: r[1] > 0 ? 0 : Math.PI }); });
  }
  /* auta zaparkowane (dekoracja: bryły typów aut w jednej siatce + kolizja) */
  AIRPORT_PARKED.forEach(p => {
    const type = randomCarType(), col = NPC_COLORS_AIR[randInt(0, NPC_COLORS_AIR.length - 1)], T = CAR_TYPES[type], cs = Math.cos(p.heading), sn = Math.sin(p.heading);
    const COL = { paint: col, dark: 0x15171b, glass: 0x141d22, chrome: 0xb9bec6, lampF: 0xfff3d0, lampR: 0x5a1512 };
    carParts(type).forEach(q => { const lx = q[4], lz = q[6]; CB(COL[q[3]]).boxRot(p.x + lx * cs + lz * sn, q[5], p.z - lx * sn + lz * cs, q[0], q[1], q[2], p.heading, 2, true); });
    [[T.track, -T.wbF], [-T.track, -T.wbF], [T.track, -T.wbR], [-T.track, -T.wbR]].forEach(w => CB(0x141518).boxRot(p.x + w[0] * cs + w[1] * sn, T.wheelR, p.z - w[0] * sn + w[1] * cs, 0.28, T.wheelR * 2, T.wheelR * 2, p.heading, 1, true));
    staticBoxRot(p.x, carTopOf2(type) / 2, p.z, T.half[0] * 2, carTopOf2(type), T.half[2] * 2, p.heading);
  });
  for (let x = pk.x0 + 10; x < pk.x1; x += 22) lampSpots.push({ x: x, z: pk.z0 - 0.9, rot: 0, y: 0 });
  for (let x = fr.x0 + 8; x < fr.x1 - 2; x += 16) lampSpots.push({ x: x, z: fr.z - fr.hw - 0.8, rot: 0, y: 0 });
  for (const x of [ix0 + 6, (ix0 + ix1) / 2 + 10, ix1 - 6]) lampSpots.push({ x: x, z: iz0 + 1.5, rot: Math.PI, y: 0.24 });

  /* --- ogrodzenie strony lotniczej z bramą techniczną przy hangarze --- */
  const fz = A.fenceZ;
  fenceLine(-155, fz, tm.x0 - 0.5, fz); fenceLine(tm.x1 + 0.5, fz, 92, fz); fenceLine(100, fz, 155, fz);
  fenceLine(-155, fz, -155, -396); fenceLine(155, fz, 155, -396);
  CB(0xd8402c).box(96, 1.0, fz, 7.6, 0.12, 0.12, 1, true);                       // szlaban (podniesiony — wjazd możliwy)
  CB(0xd8402c).boxRot(92.3, 2.6, fz, 0.12, 3.4, 0.12, 0, 1, true);

  /* --- znaki: na dojeździe przed obwodnicą (jednokierunkowa na wschód) A-7 + C-2, drogowskaz na obwodnicy --- */
  placeSign(ac.x - ac.hw - 1.0, -CITY_EDGE - 7, Math.PI, [FACE.A7(), FACE.C2()], { base: 0 });
  placeSign(ac.x - 26, -256, -Math.PI / 2, [signFace('drogowskaz', texHwySign(['LOTNISKO'], '✈'), shapeRect(1.8, 1.1))], { base: WALK_H, bottom: 2.1, poleR: 0.05 });

  /* --- minimapa --- */
  mapExtras.push({ t: 'rect', x0: rw.x0, x1: rw.x1, z0: rw.z - rw.hw, z1: rw.z + rw.hw, c: '#3b3f47' });
  mapExtras.push({ t: 'rect', x0: tx.x0, x1: tx.x1, z0: tx.z - tx.hw, z1: tx.z + tx.hw, c: '#33363d' });
  mapExtras.push({ t: 'rect', x0: ap.x0, x1: ap.x1, z0: ap.z0, z1: ap.z1, c: '#4a4c50' });
  mapExtras.push({ t: 'rect', x0: pk.x0, x1: pk.x1, z0: pk.z0, z1: pk.z1, c: '#33363d' });
  mapExtras.push({ t: 'rect', x0: ac.x - ac.hw, x1: ac.x + ac.hw, z0: ac.z1, z1: ac.z0, c: '#2b2e35' });
  mapExtras.push({ t: 'rect', x0: fr.x0 - ac.hw, x1: fr.x1, z0: fr.z - fr.hw, z1: fr.z + fr.hw, c: '#2b2e35' });
  mapExtras.push({ t: 'rect', x0: ac.x + ac.hw, x1: fr.x1, z0: lz - fr.hw, z1: lz + fr.hw, c: '#2b2e35' });
  mapExtras.push({ t: 'rect', x0: fr.x1 - 2 * fr.hw, x1: fr.x1, z0: fr.z - fr.hw, z1: lz + fr.hw, c: '#2b2e35' });
  terrainLog.push({ kind: 'airport', x: 0, z: rw.z, r: 0, h: 0 });
}
