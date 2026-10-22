/* ---------------------------------------------------------------
   7a. DZIELNICE — wieżowce, bloki, domki z ogródkami, parki, plac z fontanną,
   galeria handlowa, stacja paliw, zakłady przemysłowe.
   Tylko definicje (wywoływane z city-generation.js przy budowie kwartałów).
   Bryły jednokolorowe trafiają do CB(kolor) i są scalane w JEDNĄ siatkę z kolorami
   wierzchołków (finalizeDistricts) — mniej wywołań rysowania niż osobny materiał na kolor.
   Wszystko omija pas autostrady (hwyRectCovered) i ma kolizje tam, gdzie da się uderzyć.
   --------------------------------------------------------------- */
const COLOR_BUFS = new Map();
function CB(hex){ let b = COLOR_BUFS.get(hex); if (!b){ b = new GeoBuf(); COLOR_BUFS.set(hex, b); } return b; }

/* --- tekstury --- */
function texStorefront(){
  const W = 256, H = 128, c = mkCanvas(W, H), g = c.getContext('2d'), e = mkCanvas(W, H), ge = e.getContext('2d');
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  g.fillStyle = '#4b4f55'; g.fillRect(0, 0, W, H);
  const signs = ['#b8322a', '#2a6cb8', '#2f8a4c', '#c79a2a', '#7a3a9a'];
  for (let k = 0; k < 2; k++){
    const x = k * W / 2;
    g.fillStyle = signs[randInt(0, signs.length - 1)]; g.fillRect(x + 6, 6, W / 2 - 12, 22);           // szyld
    g.fillStyle = 'rgba(255,255,255,.75)'; for (let t = 0; t < 5; t++) g.fillRect(x + 16 + t * 20, 13, 12, 8);
    g.fillStyle = '#2b3a46'; g.fillRect(x + 8, 36, W / 2 - 16, H - 40);                              // witryna
    g.fillStyle = 'rgba(255,255,255,.14)'; g.beginPath(); g.moveTo(x + 8, H - 4); g.lineTo(x + 60, 36); g.lineTo(x + 80, 36); g.lineTo(x + 8, H - 30); g.fill();
    g.fillStyle = '#25282c'; g.fillRect(x + W / 4 - 2, 36, 4, H - 40);
    ge.fillStyle = '#ffd9a0'; ge.fillRect(x + 8, 36, W / 2 - 16, H - 40);
    ge.fillStyle = '#000'; ge.fillRect(x + W / 4 - 2, 36, 4, H - 40);
  }
  return { map: toTex(c), emissiveMap: toTex(e) };
}
function texGlassWall(){
  const S = 128, c = mkCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#3d5566'; g.fillRect(0, 0, S, S);
  g.fillStyle = 'rgba(255,255,255,.10)'; for (let k = 0; k < 6; k++){ g.beginPath(); g.moveTo(k * 24, S); g.lineTo(k * 24 + 40, 0); g.lineTo(k * 24 + 52, 0); g.lineTo(k * 24 + 12, S); g.fill(); }
  g.fillStyle = '#c9ced2'; for (let k = 0; k <= 4; k++){ g.fillRect(k * S / 4 - 2, 0, 4, S); g.fillRect(0, k * S / 4 - 2, S, 4); }
  return toTex(c);
}
/* napis: płótno o proporcjach tablicy (aspect = szerokość / wysokość quada — bez rozciągania liter), czcionka
   zmniejszana, aż tekst zmieści się z marginesem (wcześniej dłuższe słowa wychodziły poza płótno 512 px i były ucięte) */
function texWordSign(word, bg, fg, aspect){
  const H = 96, W = Math.round(clamp(H * (aspect || 5.33), 160, 2048)), c = mkCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  let fs = 70; g.font = 'bold ' + fs + 'px Arial, sans-serif';
  while (fs > 18 && g.measureText(word).width > W * 0.9){ fs -= 2; g.font = 'bold ' + fs + 'px Arial, sans-serif'; }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(word, W / 2, H / 2 + 3);
  return toTex(c);
}
function texCorrugated(){
  const S = 128, c = mkCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#8f9497'; g.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 8){ g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x, 0, 3, S); g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(x + 4, 0, 2, S); }
  noiseOver(g, S, S, 12);
  g.fillStyle = '#5b6064'; g.fillRect(0, S - 10, S, 10);
  return toTex(c);
}
const shopTex = texStorefront();
const shopMat = new THREE.MeshLambertMaterial({ map: shopTex.map, emissive: new THREE.Color(0xffffff), emissiveMap: shopTex.emissiveMap, emissiveIntensity: 0 });
const shopBuf = new GeoBuf(), glassWallBuf = new GeoBuf(), corrBuf = new GeoBuf();
const wordSigns = [];      // { buf, tex }
function wordSignQuad(word, bg, fg, p0, p1, p2, p3){
  const b = new GeoBuf(); b.quad(p0, p1, p2, p3, [0, 0], [1, 0], [1, 1], [0, 1]);
  const w = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]), h = Math.hypot(p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]) || 1;
  wordSigns.push({ buf: b, tex: texWordSign(word, bg, fg, w / h) });
}

/* --- parter z witrynami (pas 4.5 m) --- */
function shopBand(cx, cz, w, d, y0, h){ shopBuf.box(cx, y0 + h / 2, cz, w, h, d, h, false); }

/* --- wieżowiec: podium z witrynami, 1–3 uskoki, kondygnacja techniczna, antena albo lądowisko --- */
function addTower(cx, cz, w, d, h, pool){
  if (hwyRectCovered(cx, cz, w, d, 3.5)) return;
  const v = pool[randInt(0, pool.length - 1)], y0 = WALK_H, podH = 4.5;
  shopBand(cx, cz, w, d, y0, podH);
  roofBuf.plane(cx, y0 + podH, cz, w, d, w / 6, d / 6);
  staticBox(cx, y0 + podH / 2, cz, w, podH, d);
  let y = y0 + podH, tw = w - 2.4, td = d - 2.4, left = h - podH;
  const tiers = h > 95 ? 3 : h > 70 ? 2 : 1;
  for (let t = 0; t < tiers; t++){
    const th = t === tiers - 1 ? left : left * rand(0.5, 0.62);
    facadeBufs[v].box(cx, y + th / 2, cz, tw, th, td, 8, false);
    roofBuf.plane(cx, y + th, cz, tw, td, tw / 6, td / 6);
    staticBox(cx, y + th / 2, cz, tw, th, td);
    y += th; left -= th;
    if (t < tiers - 1){ tw = Math.max(8, tw * rand(0.68, 0.8)); td = Math.max(8, td * rand(0.68, 0.8)); }
  }
  const mw = tw * 0.62, md = td * 0.62;
  CB(0x3b4046).box(cx, y + 1.6, cz, mw, 3.2, md, 4, true);                 // kondygnacja techniczna
  const top = y + 3.2;
  if (rnd() < 0.4 && Math.min(mw, md) > 7){
    const r = Math.min(mw, md) * 0.42;
    CB(0x2a2d31).disc(cx, top + 0.03, cz, r, 20);
    CB(0xe7e3d6).ring(cx, top + 0.05, cz, r - 0.5, r - 0.2, 20);
    CB(0xe7e3d6).plane(cx - r * 0.3, top + 0.06, cz, r * 0.14, r * 0.9, 1, 1);
    CB(0xe7e3d6).plane(cx + r * 0.3, top + 0.06, cz, r * 0.14, r * 0.9, 1, 1);
    CB(0xe7e3d6).plane(cx, top + 0.065, cz, r * 0.6, r * 0.14, 1, 1);
  } else {
    CB(0x8a8f96).box(cx, top + 5, cz, 0.35, 10, 0.35, 1, true);
    CB(0xc23a2a).box(cx, top + 10.2, cz, 0.6, 0.4, 0.6, 1, true);
  }
  buildings.push({ x: cx, z: cz, w: w, d: d });
}

/* --- blok mieszkalny z balkonami na dłuższych ścianach --- */
function addBlok(cx, cz, w, d, floors, pool){
  if (hwyRectCovered(cx, cz, w, d, 3.5)) return;
  const h = floors * 3.0;
  addBuilding(cx, cz, w, d, h, pool);
  const alongX = w >= d, L = alongX ? w : d, n = Math.floor((L - 2) / 3.4);
  for (const side of [-1, 1]) for (let c = 0; c < n; c++){
    if (c % 3 === 1) continue;                                                // klatka schodowa bez balkonów
    const t = -L / 2 + 1 + (c + 0.5) * (L - 2) / n;
    for (let f = 1; f < floors; f++){
      const y = WALK_H + f * 3.0;
      if (alongX){
        const z = cz + side * (d / 2 + 0.5);
        CB(0xb9b4aa).box(cx + t, y, z, 2.4, 0.14, 1.0, 2, true);
        CB(0x6f767c).box(cx + t, y + 0.55, cz + side * (d / 2 + 0.98), 2.4, 0.95, 0.05, 1, false);
      } else {
        const x = cx + side * (w / 2 + 0.5);
        CB(0xb9b4aa).box(x, y, cz + t, 1.0, 0.14, 2.4, 2, true);
        CB(0x6f767c).box(cx + side * (w / 2 + 0.98), y + 0.55, cz + t, 0.05, 0.95, 2.4, 1, false);
      }
    }
  }
}

/* --- działka z domkiem: żywopłot dookoła (z przerwą na podjazd od ulicy), podjazd, garaż, drzewo ---
   (px,pz) środek działki pw × pd, sz = strona ulicy w osi z (±1) */
function addHouseLot(px, pz, pw, pd, sz, houseW, houseD, h){
  if (hwyRectCovered(px, pz, pw, pd, 3)) return;
  const garage = pw - houseW > 4.2;
  const hx = garage ? px - pw / 2 + 0.6 + houseW / 2 : px, hz = pz - sz * 0.8;     // z garażem: dom przy lewej granicy
  addHouse(hx, hz, houseW, houseD, h, ['gable', 'gable', 'hip', 'flat'][randInt(0, 3)]);
  const ex = pw / 2 - 0.35, ez = pd / 2 - 0.35, y = WALK_H;
  const drX = garage ? hx + houseW / 2 + 0.3 + 1.6 : px + (houseW / 2 - 1.6) * (rnd() < 0.5 ? 1 : -1);
  /* podjazd od domu (garażu) do ulicy */
  const dz0 = hz + sz * (houseD / 2), dz1 = pz + sz * pd / 2;
  CB(0x9c988f).plane(drX, y + 0.02, (dz0 + dz1) / 2, 2.8, Math.abs(dz1 - dz0), 1, 1);
  if (garage){
    const gz = hz + sz * (houseD / 2 - 3);
    CB(0xd3cfc6).box(drX, y + 1.3, gz, 3.2, 2.6, 5.6, 2, false);
    CB(0x4a4d52).box(drX, y + 2.65, gz, 3.5, 0.15, 5.9, 2, true);
    CB(0x8d9196).plane(drX, y + 1.15, gz + sz * 2.81, 2.6, 2.1, 1, 1);
    staticBox(drX, y + 1.3, gz, 3.2, 2.6, 5.6);
    buildings.push({ x: drX, z: gz, w: 3.2, d: 5.6 });
  }
  /* żywopłot 0.9 m — po stronie ulicy przerwa 3.4 m na podjazd */
  const hedge = (x0, z0, x1, z1) => {
    const l = Math.hypot(x1 - x0, z1 - z0); if (l < 0.4) return;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, alongXh = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    CB(0x3d6a30).box(mx, y + 0.45, mz, alongXh ? l : 0.6, 0.9, alongXh ? 0.6 : l, 1, true);
    staticBox(mx, y + 0.45, mz, alongXh ? l : 0.6, 0.9, alongXh ? 0.6 : l);
  };
  const zs = pz + sz * ez, zb = pz - sz * ez;
  hedge(px - ex, zs, drX - 1.7, zs); hedge(drX + 1.7, zs, px + ex, zs);
  hedge(px - ex, zb, px + ex, zb);
  hedge(px - ex, zb, px - ex, zs); hedge(px + ex, zb, px + ex, zs);
  /* drzewko w przednim ogródku, po stronie przeciwnej do podjazdu */
  if (rnd() < 0.7) treeSpots.push({ x: drX > px ? px - pw / 2 + 1.4 : px + pw / 2 - 1.4, z: pz + sz * (pd / 2 - 1.3), type: randInt(0, 1), scale: rand(0.55, 0.8), rot: rnd() * TAU });
}

/* --- park: alejki (krzyż + pierścień), w środku fontanna / staw / plac zabaw, ławki, klomby, żywopłot, latarnie --- */
function buildParkBlockFull(cx, cz){
  walkBuf.plane(cx, WALK_H, cz, LOT, LOT, LOT / 4, LOT / 4);
  curbBuf.box(cx, WALK_H / 2, cz, LOT, WALK_H, LOT, 2, false);
  staticBox(cx, WALK_H / 2, cz, LOT, WALK_H, LOT);
  const y = WALK_H;
  lawnBuf.plane(cx, y + 0.012, cz, LOT - 5, LOT - 5, 4, 4);
  pathBuf.plane(cx, y + 0.024, cz, LOT - 5, 2.4, LOT / 4, 1);
  pathBuf.plane(cx, y + 0.026, cz, 2.4, LOT - 5, 1, LOT / 4);
  pathBuf.ring(cx, y + 0.028, cz, 6.6, 8.6, 28);
  const kind = ['fountain', 'pond', 'play'][randInt(0, 2)];
  if (kind === 'pond') pond(cx, cz, 4.2, 3.4);
  else if (kind === 'fountain') fountain(cx, cz, 3.2);
  else {
    CB(0xd8c28c).disc(cx, y + 0.03, cz, 4.6, 20);
    CB(0xc0392b).boxRot(cx - 1.2, y + 1.0, cz, 0.8, 0.12, 3.4, 0.0, 1, true);            // zjeżdżalnia (uproszczona)
    CB(0x5d6469).box(cx - 1.2, y + 1.0, cz - 1.7, 0.9, 2.0, 0.9, 1, true);
    CB(0x2a6cb8).box(cx + 2.0, y + 1.25, cz, 0.12, 2.5, 3.0, 1, true);                   // huśtawki: rama
    CB(0x2a6cb8).box(cx + 2.0, y + 2.5, cz, 0.12, 0.12, 3.2, 1, true);
    CB(0x8a5a33).box(cx + 2.0, y + 0.6, cz - 0.7, 0.5, 0.06, 0.4, 1, true); CB(0x8a5a33).box(cx + 2.0, y + 0.6, cz + 0.7, 0.5, 0.06, 0.4, 1, true);
    staticBox(cx - 1.2, y + 1.0, cz - 1.7, 0.9, 2.0, 0.9); staticBox(cx + 2.0, y + 1.25, cz, 0.15, 2.5, 3.0);
  }
  /* ławki przy pierścieniu, klomby w ćwiartkach */
  for (const q of [[1, 0], [-1, 0], [0, 1], [0, -1]]) bench(cx + q[0] * 9.6 + q[1] * 2.4, cz + q[1] * 9.6 + q[0] * 2.4, q[0] ? Math.PI / 2 : 0);
  const flowers = [0xc0392b, 0xe8b923, 0xd35fa0, 0xf0f0e8];
  for (const q of [[1, 1], [-1, 1], [1, -1], [-1, -1]]){
    const fx = cx + q[0] * 5.0, fz = cz + q[1] * 5.0;
    CB(0x6b4a36).box(fx, y + 0.12, fz, 2.4, 0.24, 2.4, 1, true);
    CB(flowers[randInt(0, flowers.length - 1)]).box(fx, y + 0.3, fz, 2.0, 0.14, 2.0, 1, true);
  }
  /* żywopłot 2.6 m od krawężnika z wejściami na alejki */
  const e = LOT / 2 - 2.6, g = 1.8, y0 = y + 0.45;
  const seg = (x0, z0, x1, z1) => { const l = Math.hypot(x1 - x0, z1 - z0), ax = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    CB(0x3d6a30).box((x0 + x1) / 2, y0, (z0 + z1) / 2, ax ? l : 0.6, 0.9, ax ? 0.6 : l, 1, true); staticBox((x0 + x1) / 2, y0, (z0 + z1) / 2, ax ? l : 0.6, 0.9, ax ? 0.6 : l); };
  seg(cx - e, cz - e, cx - g, cz - e); seg(cx + g, cz - e, cx + e, cz - e);
  seg(cx - e, cz + e, cx - g, cz + e); seg(cx + g, cz + e, cx + e, cz + e);
  seg(cx - e, cz - e + 0.3, cx - e, cz - g); seg(cx - e, cz + g, cx - e, cz + e - 0.3);
  seg(cx + e, cz - e + 0.3, cx + e, cz - g); seg(cx + e, cz + g, cx + e, cz + e - 0.3);
  /* drzewa w ćwiartkach poza alejkami i klombami */
  for (let t = 0; t < 12; t++){
    const p = freeSpot(cx, cz, 10.8, (x, z) => { const r = Math.hypot(x - cx, z - cz); return Math.abs(x - cx) > 2.2 && Math.abs(z - cz) > 2.2 && Math.abs(r - 7.6) > 1.8 && r > 5.5 &&
      !(Math.abs(Math.abs(x - cx) - 5) < 1.8 && Math.abs(Math.abs(z - cz) - 5) < 1.8); });
    if (p) treeSpots.push({ x: p.x, z: p.z, type: randInt(0, 1), scale: rand(0.85, 1.35), rot: rnd() * TAU });
  }
  /* latarnie parkowe przy pierścieniu (wysięgnik nad alejkę) */
  for (const q of [[0.7, 0.7], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7]]) lampSpots.push({ x: cx + q[0] * 9.4, z: cz + q[1] * 9.4, rot: Math.atan2(-q[0], -q[1]) });
}

/* --- fontanna: niecka z obrzeżem, kolumna i czasza --- */
function fountain(cx, cz, R){
  const y = WALK_H, seg = 24;
  for (let s = 0; s < seg; s++){
    const a0 = s / seg * TAU, a1 = (s + 1) / seg * TAU;
    const p = (a, r, yy) => [cx + Math.cos(a) * r, yy, cz + Math.sin(a) * r];
    quadOut(curbBuf, p(a0, R, y), p(a1, R, y), p(a1, R, y + 0.55), p(a0, R, y + 0.55), [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)]);
  }
  curbBuf.ring(cx, y + 0.55, cz, R - 0.35, R, seg);
  waterBuf.disc(cx, y + 0.42, cz, R - 0.35, seg);
  CB(0xb7b0a3).box(cx, y + 1.2, cz, 0.7, 2.4, 0.7, 1, true);
  CB(0xb7b0a3).disc(cx, y + 2.4, cz, R * 0.42, 16);
  waterBuf.disc(cx, y + 2.42, cz, R * 0.36, 16);
  staticCylinder(cx, y + 0.3, cz, R, 0.6);
  staticBox(cx, y + 1.2, cz, 0.7, 2.4, 0.7);
}

/* --- plac miejski w centrum: fontanna, ławki dookoła, drzewa w donicach, latarnie --- */
function buildPlaza(cx, cz){
  const y = WALK_H;
  CB(0xb9b2a4).plane(cx, y + 0.012, cz, LOT - 4, LOT - 4, 1, 1);
  CB(0xa39c8e).ring(cx, y + 0.02, cz, 7.5, 8.5, 32);
  fountain(cx, cz, 5);
  for (let k = 0; k < 6; k++){ const a = k / 6 * TAU + 0.26; bench(cx + Math.cos(a) * 9.8, cz + Math.sin(a) * 9.8, Math.atan2(Math.cos(a), Math.sin(a)) + Math.PI / 2); }
  for (const q of [[1, 1], [-1, 1], [1, -1], [-1, -1]]){
    const tx = cx + q[0] * 10.5, tz = cz + q[1] * 10.5;
    CB(0x8f887c).box(tx, y + 0.35, tz, 2.0, 0.7, 2.0, 1, true); staticBox(tx, y + 0.35, tz, 2.0, 0.7, 2.0);
    treeSpots.push({ x: tx, z: tz, y: y + 0.45, type: 0, scale: rand(0.9, 1.15), rot: rnd() * TAU });
    lampSpots.push({ x: cx + q[0] * 6.5, z: cz + q[1] * 11.2, rot: Math.atan2(0, -q[1]) });
  }
  terrainLog.push({ kind: 'plaza', x: cx, z: cz, r: 0, h: 0 });
}

/* --- galeria handlowa: niska szeroka bryła ze szklaną elewacją i szyldem, parking od południa --- */
function buildMall(cx, cz){
  const y = WALK_H, w = 24, d = 14, h = 11, bz = cz - 4.5;
  glassWallBuf.box(cx, y + h / 2, bz, w, h, d, 4, false);
  roofBuf.plane(cx, y + h, bz, w, d, w / 6, d / 6);
  CB(0x4a4f55).box(cx, y + h + 0.3, bz, w + 0.4, 0.6, d + 0.4, 2, false);
  for (let k = 0; k < 3; k++) CB(0x9aa0a6).box(cx - 7 + k * 7, y + h + 0.9, bz - 2, 3, 1.4, 2.4, 1, true);   // wentylatory na dachu
  const fz = bz + d / 2 + 0.06;
  wordSignQuad('GALERIA', '#c0392b', '#ffffff', [cx - 7, y + h - 3.2, fz], [cx + 7, y + h - 3.2, fz], [cx + 7, y + h - 0.6, fz], [cx - 7, y + h - 0.6, fz]);
  CB(0xd8d4cc).box(cx, y + 3.6, fz + 1.2, 7, 0.3, 2.6, 1, true);                       // daszek nad wejściem
  staticBox(cx, y + h / 2, bz, w, h, d);
  buildings.push({ x: cx, z: bz, w: w, d: d });
  /* parking: 9 stanowisk P-18 */
  crossBuf.plane(cx, y + 0.02, cz + 8.0, 24, 9, 3, 1);
  for (let k = 0; k <= 9; k++){ const lx = cx - 11.25 + k * 2.5; roundaboutPaintBuf.quad([lx - 0.06, y + 0.035, cz + 11.6], [lx + 0.06, y + 0.035, cz + 11.6], [lx + 0.06, y + 0.035, cz + 6.6], [lx - 0.06, y + 0.035, cz + 6.6], [0, 0], [1, 0], [1, 1], [0, 1]); }
  lampSpots.push({ x: cx - 11.5, z: cz + 8, rot: Math.PI / 2 }, { x: cx + 11.5, z: cz + 8, rot: -Math.PI / 2 });
  terrainLog.push({ kind: 'mall', x: cx, z: cz, r: 0, h: 0 });
}

/* --- zakład przemysłowy: hala z dachem szedowym, komin, kontenery na placu, ogrodzenie z bramą --- */
function buildIndustrialBlock(cx, cz){
  const y = WALK_H;
  crossBuf.plane(cx, y + 0.02, cz, LOT - 4, LOT - 4, 3, 3);
  const hw = 22, hd = 12.5, hx = cx, hz = cz + (rnd() < 0.5 ? -1 : 1) * 4.6, H = rand(7.5, 9.5);
  if (!hwyRectCovered(hx, hz, hw, hd, 3.5)){
    corrBuf.box(hx, y + H / 2, hz, hw, H, hd, 6, false);
    const n = 5, tw = hw / n, rh = 2.0, top = y + H;
    for (let k = 0; k < n; k++){
      const x0 = hx - hw / 2 + k * tw, x1 = x0 + tw, za = hz - hd / 2, zb = hz + hd / 2;
      quadOut(CB(0x6d7174), [x0, top, za], [x0, top, zb], [x1, top + rh, zb], [x1, top + rh, za], [-rh, tw, 0]);     // połać
      quadOut(CB(0x8fb3c9), [x1, top, za], [x1, top, zb], [x1, top + rh, zb], [x1, top + rh, za], [1, 0, 0]);        // szklany pas
      triOut(CB(0x8f9497), [x0, top, za], [x1, top, za], [x1, top + rh, za], [0, 0, -1]);
      triOut(CB(0x8f9497), [x0, top, zb], [x1, top, zb], [x1, top + rh, zb], [0, 0, 1]);
    }
    staticBox(hx, y + H / 2, hz, hw, H, hd);
    buildings.push({ x: hx, z: hz, w: hw, d: hd });
    if (rnd() < 0.4){                                                         // komin z cegły
      const kx = hx + hw / 2 - 2, kz = hz + (hz > cz ? 1 : -1) * (hd / 2 + 1.6), R = 1.0, Hk = rand(20, 28), seg = 12;
      if (!hwyRectCovered(kx, kz, 2.2, 2.2, 2)){
        for (let s = 0; s < seg; s++){ const a0 = s / seg * TAU, a1 = (s + 1) / seg * TAU;
          quadOut(CB(0x8e4b3a), [kx + Math.cos(a0) * R, y, kz + Math.sin(a0) * R], [kx + Math.cos(a1) * R, y, kz + Math.sin(a1) * R], [kx + Math.cos(a1) * R * 0.8, y + Hk, kz + Math.sin(a1) * R * 0.8], [kx + Math.cos(a0) * R * 0.8, y + Hk, kz + Math.sin(a0) * R * 0.8], [Math.cos(a0), 0, Math.sin(a0)]); }
        CB(0x2b2b2b).disc(kx, y + Hk, kz, R * 0.8, seg);
        staticCylinder(kx, y + Hk / 2, kz, R, Hk);
      }
    }
  }
  /* kontenery 6.1 × 2.6 × 2.4 na placu (część piętrowo) */
  const cols = [0x2a6cb8, 0xb8322a, 0x2f8a4c, 0xd07a2a, 0x7d8489], side = hz > cz ? -1 : 1;
  for (let k = 0; k < 5; k++){
    if (rnd() < 0.25) continue;
    const x = cx - 9 + k * 4.5 - 1.5 + rand(-0.3, 0.3), z = cz + side * rand(5.5, 8.5), rot = rnd() < 0.5 ? 0 : 0.08;
    if (hwyRectCovered(x, z, 3, 7, 2)) continue;
    CB(cols[randInt(0, cols.length - 1)]).boxRot(x, y + 1.3, z, 2.4, 2.6, 6.1, rot, 2, true);
    staticBoxRot(x, y + 1.3, z, 2.4, 2.6, 6.1, rot);
    if (rnd() < 0.3){ CB(cols[randInt(0, cols.length - 1)]).boxRot(x, y + 3.9, z, 2.4, 2.6, 6.1, rot, 2, true); staticBoxRot(x, y + 3.9, z, 2.4, 2.6, 6.1, rot); }
  }
  /* ogrodzenie 3 m od krawężnika, brama 6 m od strony placu */
  const e = LOT / 2 - 3, gate = side, g = 3;
  if (gate < 0){ fenceLine(cx - e, cz - e, cx - g, cz - e); fenceLine(cx + g, cz - e, cx + e, cz - e); fenceLine(cx - e, cz + e, cx + e, cz + e); }
  else { fenceLine(cx - e, cz + e, cx - g, cz + e); fenceLine(cx + g, cz + e, cx + e, cz + e); fenceLine(cx - e, cz - e, cx + e, cz - e); }
  fenceLine(cx - e, cz - e, cx - e, cz + e); fenceLine(cx + e, cz - e, cx + e, cz + e);
}

/* --- stacja paliw w pasie podmiejskim przy drodze zjazdowej narożnika SE (ulica i=10) --- */
function buildGasStation(){
  const rx = L(10) + 3.5 + 3.5, x0 = rx + 0.5, x1 = x0 + 24, z0 = 296, z1 = 330, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  if (hwyRectCovered(cx + 2, cz, x1 - x0 - 4, z1 - z0, 0)) return;          // plac przylega do jezdni (wjazd)
  for (let i = treeSpots.length - 1; i >= 0; i--){ const t = treeSpots[i]; if (t.x > x0 - 3 && t.x < x1 + 3 && t.z > z0 - 3 && t.z < z1 + 3) treeSpots.splice(i, 1); }
  const y = 0.02;
  crossBuf.plane(cx, y, cz, x1 - x0, z1 - z0, 4, 4);
  /* wiata nad dystrybutorami */
  const wx = x0 + 9, wz = cz - 2;
  CB(0xe8e6e0).box(wx, 5.4, wz, 14, 0.6, 10, 2, true);
  CB(0xc0392b).box(wx, 5.05, wz, 14.2, 0.3, 10.2, 2, false);
  for (const q of [[-1, -1], [1, -1], [-1, 1], [1, 1]]){ CB(0xcfd2d4).box(wx + q[0] * 5.5, 2.55, wz + q[1] * 3.6, 0.4, 5.1, 0.4, 1, false); staticBox(wx + q[0] * 5.5, 2.55, wz + q[1] * 3.6, 0.4, 5.1, 0.4); }
  for (const o of [-2.4, 2.4]){
    CB(0x9aa0a6).box(wx + o, 0.14, wz, 1.1, 0.25, 5, 1, true);
    for (const p of [-1.2, 1.2]){ CB(0xc0392b).box(wx + o, 1.05, wz + p, 0.7, 1.6, 0.6, 1, true); CB(0x2b2b2b).box(wx + o, 1.35, wz + p, 0.72, 0.4, 0.4, 1, false); staticBox(wx + o, 1.05, wz + p, 0.7, 1.6, 0.6); }
  }
  /* sklep */
  const sx = x1 - 6, sz = z1 - 6;
  CB(0xdedad2).box(sx, 1.8, sz, 9, 3.6, 7, 2, false);
  CB(0x4a4d52).box(sx, 3.7, sz, 9.4, 0.25, 7.4, 2, true);
  CB(0x5d7f95).plane(sx, 1.4, sz - 3.51, 6, 2.2, 1, 1);
  quadOut(CB(0x5d7f95), [sx - 3, 0.3, sz - 3.52], [sx + 3, 0.3, sz - 3.52], [sx + 3, 2.6, sz - 3.52], [sx - 3, 2.6, sz - 3.52], [0, 0, -1]);
  staticBox(sx, 1.8, sz, 9, 3.6, 7);
  buildings.push({ x: sx, z: sz, w: 9, d: 7 });
  wordSignQuad('STACJA', '#c0392b', '#ffffff', [wx + 5, 5.0, wz - 5.12], [wx - 5, 5.0, wz - 5.12], [wx - 5, 5.7, wz - 5.12], [wx + 5, 5.7, wz - 5.12]);
  /* pylon z nazwą przy drodze */
  /* pylon: słup schowany w skrzynce tablicy, napis na obu ścianach (każdy jednostronny, przodem na zewnątrz) */
  const px = x0 + 1.5, pz = z0 + 2, t = 0.2;
  CB(0x5d6469).box(px, 2.1, pz, 0.24, 4.2, 0.24, 1, false); staticBox(px, 3.1, pz, 0.3, 6.2, 2.9);
  CB(0x1a3f80).box(px, 5.2, pz, 2 * t, 2.1, 2.9, 1, true);
  wordSignQuad('PALIWA', '#1a4fa0', '#ffffff', [px + t + 0.01, 4.25, pz + 1.35], [px + t + 0.01, 4.25, pz - 1.35], [px + t + 0.01, 6.15, pz - 1.35], [px + t + 0.01, 6.15, pz + 1.35]);
  wordSignQuad('PALIWA', '#1a4fa0', '#ffffff', [px - t - 0.01, 4.25, pz - 1.35], [px - t - 0.01, 4.25, pz + 1.35], [px - t - 0.01, 6.15, pz + 1.35], [px - t - 0.01, 6.15, pz - 1.35]);
  lampSpots.push({ x: x1 - 1, z: z0 + 1, rot: -Math.PI / 2, y: 0 }, { x: x1 - 1, z: cz, rot: -Math.PI / 2, y: 0 });
  terrainLog.push({ kind: 'station', x: cx, z: cz, r: 0, h: 0 });
}

/* --- scalenie (wołane na końcu city-generation.js) --- */
function finalizeDistricts(extraColored){
  const pairs = extraColored.concat(Array.from(COLOR_BUFS.entries()).map(e => [e[1], e[0]]));
  const g = mergeColoredGeometry(pairs);
  if (g){ const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })); m.castShadow = m.receiveShadow = true; m.matrixAutoUpdate = false; scene.add(m); }
  const out = [];
  [[shopBuf, shopMat], [glassWallBuf, new THREE.MeshLambertMaterial({ map: texGlassWall() })], [corrBuf, new THREE.MeshLambertMaterial({ map: texCorrugated() })]].forEach(p => { const m = addMerged(p[0], p[1], true, true); if (m) out.push(m); });
  facadeMats.push(shopMat);                                                  // witryny świecą nocą jak okna (daynight.js)
  wordSigns.forEach(s => { const m = addMerged(s.buf, new THREE.MeshLambertMaterial({ map: s.tex }), false, false); });   // jednostronne (bez migotania)
  return out;
}
