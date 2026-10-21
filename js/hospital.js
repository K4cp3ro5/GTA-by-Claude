/* ---------------------------------------------------------------
   7a3. SZPITAL — południowy pas podmiejski (między obwodnicą j=12 a murem), x ∈ −152…−2: dojazd z ulicy
   i=4, droga przed wejściem, plac z daszkiem nad wejściem, budynek główny z pasami okien i czerwonym
   krzyżem, niższe skrzydło, lądowisko na dachu, zatoka karetek, parking. Gracz odradza się po śmierci na
   placu przed wejściem (HOSPITAL_SPAWN). Wywoływane z city-generation.js (buildHospital).
   --------------------------------------------------------------- */
const HOSPITAL = {
  access: { x: L(4), z0: CITY_EDGE, z1: 316, hw: 4 },   // dojazd z ulicy i=4 (skrzyżowanie z obwodnicą przy x = −88)
  front:  { x0: L(4) - 4, x1: -2, z: 312, hw: 4 },       // droga przed wejściem (do zatoki karetek)
  plaza:  { x0: -80, x1: -18, z0: 316, z1: 324 },
  main:   { x0: -80, x1: -18, z0: 324, z1: 352, h: 19 },
  wing:   { x0: -80, x1: -54, z0: 352, z1: 370, h: 11 },
  bay:    { x0: -16, x1: -2, z0: 316, z1: 342 },
  park:   { x0: -152, x1: -96, z0: 288, z1: 328 }
};
/* miejsce odrodzenia: plac przed wejściem, twarzą do miasta (na północ) */
const HOSPITAL_SPAWN = { x: -49, z: 319.5, facing: Math.PI };

function buildHospital(){
  const H = HOSPITAL, y = 0.03;
  for (let i = treeSpots.length - 1; i >= 0; i--){ const t = treeSpots[i]; if (t.z > CITY_EDGE && t.z < 382 && t.x > -162 && t.x < 8) treeSpots.splice(i, 1); }
  const parapet = (x0, x1, z0, z1, h, t, ph) => {                                                         // attyka: obwódka wokół dachu
    CB(0xd5d8d6).box((x0 + x1) / 2, h + ph / 2, z0 + t / 2, x1 - x0, ph, t, 1, true); CB(0xd5d8d6).box((x0 + x1) / 2, h + ph / 2, z1 - t / 2, x1 - x0, ph, t, 1, true);
    CB(0xd5d8d6).box(x0 + t / 2, h + ph / 2, (z0 + z1) / 2, t, ph, z1 - z0, 1, true); CB(0xd5d8d6).box(x1 - t / 2, h + ph / 2, (z0 + z1) / 2, t, ph, z1 - z0, 1, true);
  };
  const paint = (x0, z0, x1, z1, w, col, yy) => {
    const l = Math.hypot(x1 - x0, z1 - z0) || 1, nx = -(z1 - z0) / l * w / 2, nz = (x1 - x0) / l * w / 2, py = yy || y + 0.016;
    CB(col || 0xeeeeea).quad([x0 - nx, py, z0 - nz], [x0 + nx, py, z0 + nz], [x1 + nx, py, z1 + nz], [x1 - nx, py, z1 - nz], [0,0],[1,0],[1,1],[0,1]);
  };
  const flat = (buf, x0, x1, z0, z1, yy) => { buf.plane((x0 + x1) / 2, yy, (z0 + z1) / 2, x1 - x0, z1 - z0, (x1 - x0) / 6, (z1 - z0) / 6); };
  const ac = H.access, fr = H.front, pl = H.plaza, mn = H.main, wg = H.wing, by = H.bay, pk = H.park;

  /* --- drogi: dojazd, droga przed wejściem, zatoka karetek, wjazd na parking; linie jak na ulicach --- */
  flat(crossBuf, ac.x - ac.hw, ac.x + ac.hw, ac.z0, ac.z1, y);
  flat(crossBuf, fr.x0, fr.x1, fr.z - fr.hw, fr.z + fr.hw, y + 0.001);
  flat(crossBuf, by.x0, by.x1, by.z0, by.z1, y + 0.0012);
  const pe = (pk.z0 + pk.z1) / 2;
  flat(crossBuf, pk.x1, ac.x - ac.hw, pe - 3.5, pe + 3.5, y + 0.0014);
  for (let z = ac.z0 + 2; z < fr.z - fr.hw - 2; z += 6) paint(ac.x, z, ac.x, z + 3, 0.16);                       // oś dojazdu
  for (let x = ac.x + ac.hw + 4; x < fr.x1 - 6; x += 6) paint(x, fr.z, x + 3, fr.z, 0.15);                        // oś drogi przed wejściem
  { const e = 0.3, ln = (x0, z0, x1, z1) => paint(x0, z0, x1, z1, 0.15);
    const W = ac.x - ac.hw + e, E = ac.x + ac.hw - e, N = fr.z - fr.hw + e, S = fr.z + fr.hw - e;
    ln(W, ac.z0 + 0.5, W, pe - 3.5); ln(W, pe + 3.5, W, S);                                                  // dojazd: krawędzie
    ln(E, ac.z0 + 0.5, E, N);
    ln(E, N, fr.x1 - e, N); ln(W, S, by.x0, S);                                                              // droga przed wejściem
    for (let x = W; x < ac.x - 0.4; x += 1.2) paint(x, ac.z0 + 1, x + 0.6, ac.z0 + 1, 0.3);                 // linia ustąpienia przy obwodnicy
    for (let x = pl.x0 + 30; x < pl.x0 + 42; x += 1.0) paint(x, fr.z + 0.6, x, S - 0.2, 0.5);                 // przejście do wejścia
    paint(by.x0 + 0.4, by.z0 + 2, by.x0 + 0.4, by.z1 - 1, 0.15); paint(by.x1 - 0.4, by.z0 + 2, by.x1 - 0.4, by.z1 - 1, 0.15);
    for (const zz of [by.z0 + 8, by.z0 + 20]) paint(by.x0 + 1, zz, by.x1 - 1, zz, 0.12, 0xe0b020);           // stanowiska karetek
    paint((by.x0 + by.x1) / 2, by.z0 + 2, (by.x0 + by.x1) / 2, by.z1 - 1, 0.12, 0xe0b020);
  }

  /* --- plac przed wejściem (płyty) i trawniki przy budynku --- */
  CB(0xbdb9b0).box((pl.x0 + pl.x1) / 2, 0.06, (pl.z0 + pl.z1) / 2, pl.x1 - pl.x0, 0.08, pl.z1 - pl.z0, 2, true);
  for (let x = pl.x0 + 2; x < pl.x1; x += 4) CB(0xa9a59c).box(x, 0.105, (pl.z0 + pl.z1) / 2, 0.06, 0.01, pl.z1 - pl.z0 - 0.4, 1, true);

  /* --- budynek główny: białe ściany, pasy okien co kondygnację, cokół, attyka --- */
  const cx = (mn.x0 + mn.x1) / 2, cz = (mn.z0 + mn.z1) / 2, w = mn.x1 - mn.x0, d = mn.z1 - mn.z0;
  CB(0xe9ebe8).box(cx, mn.h / 2, cz, w, mn.h, d, 2, true);
  CB(0x8f969c).box(cx, 0.5, cz, w + 0.2, 1.0, d + 0.2, 2, true);                                              // cokół
  parapet(mn.x0 - 0.2, mn.x1 + 0.2, mn.z0 - 0.2, mn.z1 + 0.2, mn.h, 0.5, 0.9);
  const bands = (x0, x1, z0, z1, h, skip) => {
    for (let fy = 4.4; fy < h - 1.5; fy += 3.6){
      const by0 = fy + 0.6;
      CB(0x2f5674).box((x0 + x1) / 2, by0, z0 - 0.05, x1 - x0 - 1.2, 1.5, 0.12, 1, true);                   // północ (do miasta)
      CB(0x2f5674).box((x0 + x1) / 2, by0, z1 + 0.05, x1 - x0 - 1.2, 1.5, 0.12, 1, true);                   // południe
      CB(0x2f5674).box(x0 - 0.05, by0, (z0 + z1) / 2, 0.12, 1.5, z1 - z0 - 1.2, 1, true);                   // zachód
      if (!skip) CB(0x2f5674).box(x1 + 0.05, by0, (z0 + z1) / 2, 0.12, 1.5, z1 - z0 - 1.2, 1, true);       // wschód
      for (let px = x0 + 4; px < x1 - 2; px += 4){ CB(0xe9ebe8).box(px, by0, z0 - 0.1, 0.35, 1.52, 0.1, 1, true); CB(0xe9ebe8).box(px, by0, z1 + 0.1, 0.35, 1.52, 0.1, 1, true); }
    }
  };
  bands(mn.x0, mn.x1, mn.z0, mn.z1, mn.h, false);
  staticBox(cx, mn.h / 2, cz, w, mn.h, d);
  buildings.push({ x: cx, z: cz, w: w, d: d });
  /* parter: przeszklone wejście, daszek na słupach, napis SZPITAL i czerwony krzyż na elewacji */
  CB(0x24323d).box(cx, 1.9, mn.z0 - 0.08, 12, 3.4, 0.16, 1, true);                                         // drzwi przesuwne
  CB(0xd8d4cc).box(cx, 4.3, mn.z0 - 3.2, 18, 0.35, 6.4, 2, true);                                          // daszek
  CB(0xc0392b).box(cx, 4.55, mn.z0 - 6.35, 18, 0.25, 0.12, 1, true);
  for (const sx of [-1, 1]){ CB(0xb9bec6).box(cx + sx * 8.4, 2.1, mn.z0 - 6, 0.3, 4.2, 0.3, 1, true); staticBox(cx + sx * 8.4, 2.1, mn.z0 - 6, 0.3, 4.2, 0.3); }
  wordSignQuad('SZPITAL', '#c0392b', '#ffffff', [cx + 11, mn.h - 4.6, mn.z0 - 0.2], [cx - 11, mn.h - 4.6, mn.z0 - 0.2], [cx - 11, mn.h - 1.6, mn.z0 - 0.2], [cx + 11, mn.h - 1.6, mn.z0 - 0.2]);
  const cross = (x, yc, z, s, nz) => {                                                                       // biała tarcza z czerwonym krzyżem
    CB(0xffffff).box(x, yc, z, nz ? s : 0.1, s, nz ? 0.1 : s, 1, true);
    CB(0xd62f2f).box(x, yc, z + (nz ? -0.06 * nz : 0), nz ? s * 0.7 : 0.12, s * 0.22, nz ? 0.1 : s * 0.7, 1, true);
    CB(0xd62f2f).box(x, yc, z + (nz ? -0.06 * nz : 0), nz ? s * 0.22 : 0.12, s * 0.7, nz ? 0.1 : s * 0.22, 1, true);
  };
  cross(mn.x0 + 6, mn.h - 3.1, mn.z0 - 0.25, 4, 1);
  cross(mn.x1 - 6, mn.h - 3.1, mn.z0 - 0.25, 4, 1);

  /* --- lądowisko na dachu: ciemny kwadrat, białe obramowanie i „H” --- */
  const hx = mn.x1 - 12, hz = cz, ry = mn.h + 0.05;
  CB(0x3b3f45).box(hx, ry, hz, 16, 0.1, 16, 2, true);
  CB(0xc9cbc8).box(cx, mn.h + 0.01, cz, w - 1, 0.02, d - 1, 1, true);                                       // papa dachu
  for (const [ox, oz, sw, sd] of [[0, 7.6, 15.6, 0.4], [0, -7.6, 15.6, 0.4], [7.6, 0, 0.4, 15.6], [-7.6, 0, 0.4, 15.6], [-2.2, 0, 0.8, 6.5], [2.2, 0, 0.8, 6.5], [0, 0, 3.6, 0.8]])
    CB(0xf2f0ea).box(hx + ox, ry + 0.06, hz + oz, sw, 0.02, sd, 1, true);
  CB(0xd8d4cc).box(mn.x0 + 8, mn.h + 1.6, cz + 4, 6, 3.2, 5, 2, true);                                       // maszynownia

  /* --- skrzydło (niższe) --- */
  const wx = (wg.x0 + wg.x1) / 2, wz = (wg.z0 + wg.z1) / 2, ww = wg.x1 - wg.x0, wd = wg.z1 - wg.z0;
  CB(0xe3e5e2).box(wx, wg.h / 2, wz, ww, wg.h, wd, 2, true);
  parapet(wg.x0 - 0.15, wg.x1 + 0.15, wg.z0, wg.z1 + 0.15, wg.h, 0.4, 0.7);
  CB(0x8f969c).box(wx, 0.5, wz, ww + 0.2, 1.0, wd + 0.2, 2, true);
  bands(wg.x0, wg.x1, wg.z0 + 0.6, wg.z1, wg.h, false);
  staticBox(wx, wg.h / 2, wz, ww, wg.h, wd);
  buildings.push({ x: wx, z: wz, w: ww, d: wd });

  /* --- zatoka karetek: dwie karetki (bryła z kogutem) z kolizją --- */
  for (const ax of [by.x0 + 3.6, by.x1 - 3.6]){
    const az = by.z0 + 14;
    CB(0xf4f4f0).box(ax, 1.45, az + 0.5, 2.1, 2.3, 4.2, 2, true);                                           // przedział medyczny
    CB(0xf4f4f0).box(ax, 1.05, az - 2.4, 2.0, 1.5, 1.8, 2, true);                                           // kabina
    CB(0x1b2a38).box(ax, 1.5, az - 3.3, 1.8, 0.6, 0.06, 1, true);                                           // szyba
    CB(0xd62f2f).box(ax, 1.25, az + 0.5, 2.14, 0.3, 4.24, 1, true);                                         // pas
    CB(0x2a6cd8).box(ax, 2.7, az - 1.0, 1.6, 0.2, 0.3, 1, true);                                            // kogut
    for (const [wxo, wzo] of [[0.9, -2.3], [-0.9, -2.3], [0.9, 1.6], [-0.9, 1.6]]) CB(0x141518).boxRot(ax + wxo, 0.4, az + wzo, 0.28, 0.8, 0.8, 0, 1, true);
    staticBox(ax, 1.4, az, 2.1, 2.8, 6.2);
  }

  /* --- parking: dwa rzędy stanowisk z autami, wjazd od dojazdu --- */
  flat(crossBuf, pk.x0, pk.x1, pk.z0, pk.z1, y);
  const rows = [[pk.z0 + 2.5, 1], [pk.z1 - 2.5, -1]], cars = [];
  for (let x = pk.x0 + 1; x <= pk.x1 - 1.5; x += 2.6){
    rows.forEach(r => paint(x, r[0] - 2.5, x, r[0] + 2.5, 0.1));
    if (x + 1.3 < pk.x1 - 1) rows.forEach(r => { if (rnd() < 0.45) cars.push({ x: x + 1.3, z: r[0], heading: r[1] > 0 ? Math.PI : 0 }); });
  }
  cars.forEach(p => {
    const type = randomCarType(), col = NPC_COLORS_AIR[randInt(0, NPC_COLORS_AIR.length - 1)], T = CAR_TYPES[type], cs = Math.cos(p.heading), sn = Math.sin(p.heading);
    const COL = { paint: col, dark: 0x15171b, glass: 0x141d22, chrome: 0xb9bec6, lampF: 0xfff3d0, lampR: 0x5a1512 };
    carParts(type).forEach(q => { const lx = q[4], lz = q[6]; CB(COL[q[3]]).boxRot(p.x + lx * cs + lz * sn, q[5], p.z - lx * sn + lz * cs, q[0], q[1], q[2], p.heading, 2, true); });
    [[T.track, -T.wbF], [-T.track, -T.wbF], [T.track, -T.wbR], [-T.track, -T.wbR]].forEach(wv => CB(0x141518).boxRot(p.x + wv[0] * cs + wv[1] * sn, T.wheelR, p.z - wv[0] * sn + wv[1] * cs, 0.28, T.wheelR * 2, T.wheelR * 2, p.heading, 1, true));
    staticBoxRot(p.x, carTopOf2(type) / 2, p.z, T.half[0] * 2, carTopOf2(type), T.half[2] * 2, p.heading);
  });

  /* --- latarnie, znaki (wyjazd na jednokierunkową obwodnicę: ustąp + nakaz w lewo), drogowskaz na obwodnicy --- */
  for (let x = fr.x0 + 14; x < fr.x1 - 4; x += 16) lampSpots.push({ x: x, z: fr.z - fr.hw - 0.8, rot: 0, y: 0 });
  for (let x = pk.x0 + 10; x < pk.x1; x += 22) lampSpots.push({ x: x, z: pk.z1 + 0.9, rot: Math.PI, y: 0 });
  placeSign(ac.x + ac.hw + 1.0, CITY_EDGE + 7, 0, [FACE.A7(), FACE.C4()], { base: 0 });
  placeSign(ac.x + 26, 256, Math.PI / 2, [signFace('drogowskaz', texHwySign(['SZPITAL'], '+'), shapeRect(1.8, 1.1))], { base: WALK_H, bottom: 2.1, poleR: 0.05 });

  /* --- zieleń: szpaler drzew wzdłuż dojazdu i za budynkiem --- */
  for (let z = ac.z0 + 10; z < fr.z - fr.hw - 4; z += 9) treeSpots.push({ x: ac.x + ac.hw + 3.5, z: z, y: 0, type: 0, scale: 1.1, rot: z });
  for (let x = mn.x0 + 4; x < mn.x1 + 20; x += 10) if (x > wg.x1 + 4 || x < wg.x0) treeSpots.push({ x: x, z: 376, y: 0, type: 1, scale: 1.2, rot: x });
  for (let x = wg.x1 + 6; x < mn.x1; x += 10) treeSpots.push({ x: x, z: 360, y: 0, type: 0, scale: 1.0, rot: x });
  /* --- minimapa: drogi, parking, czerwony krzyż na budynku --- */
  mapExtras.push({ t: 'rect', x0: ac.x - ac.hw, x1: ac.x + ac.hw, z0: ac.z0, z1: ac.z1, c: '#2b2e35' });
  mapExtras.push({ t: 'rect', x0: fr.x0, x1: fr.x1, z0: fr.z - fr.hw, z1: fr.z + fr.hw, c: '#2b2e35' });
  mapExtras.push({ t: 'rect', x0: pk.x0, x1: pk.x1, z0: pk.z0, z1: pk.z1, c: '#33363d' });
  mapExtras.push({ t: 'rect', x0: by.x0, x1: by.x1, z0: by.z0, z1: by.z1, c: '#2b2e35' });
  mapExtras.push({ t: 'rect', x0: cx - 9, x1: cx + 9, z0: cz - 2.5, z1: cz + 2.5, c: '#d62f2f' });
  mapExtras.push({ t: 'rect', x0: cx - 2.5, x1: cx + 2.5, z0: cz - 9, z1: cz + 9, c: '#d62f2f' });
  terrainLog.push({ kind: 'hospital', x: cx, z: cz, r: 0, h: 0 });
}
