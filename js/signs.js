/* ---------------------------------------------------------------
   6b. ZNAKI DROGOWE — wspólna konstrukcja słupka i tarcz
   Każdy znak to słupek (z kolizją) i jedna lub kilka tarcz ułożonych
   jedna nad drugą. Tarcze wiszą PRZED słupkiem (przesunięte o promień
   słupka w lokalnym +Z), a słupek kończy się w połowie najwyższej
   tarczy, więc od przodu nigdy nie przebija przez lico znaku; od tyłu
   widać szary rewers i słupek. Geometria wszystkich znaków jest
   scalana wg tekstury (finalizeSigns() w main-loop.js) — kilkanaście
   siatek zamiast kilkuset.
   Przód znaku = lokalne +Z, obrót rotY jak rotation.y w Three.js.
   --------------------------------------------------------------- */
const SIGN_BOTTOM = 2.0;      // dolna krawędź najniższej tarczy nad podłożem (chodnik, pobocze)
const SIGN_POLE_R = 0.04;     // słupek ø 80 mm
const SIGN_GAP    = 0.05;     // odstęp między tarczami na jednym słupku

/* --- tekstury tarcz (canvas 2D) --- */
function texC12(){
  const S = 160, c = mkCanvas(S,S), g = c.getContext('2d');
  g.fillStyle = '#1659b0'; g.beginPath(); g.arc(S/2,S/2,S/2-1,0,TAU); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.arc(S/2,S/2,S/2-8,0,TAU); g.stroke();
  g.strokeStyle = '#fff'; g.lineWidth = 9;
  for (let k = 0; k < 3; k++){
    const a0 = k*TAU/3, a1 = a0 + TAU/3*0.72;
    g.beginPath(); g.arc(S/2, S/2, 34, a0, a1); g.stroke();
    const ex = S/2+Math.cos(a1)*34, ey = S/2+Math.sin(a1)*34;
    g.beginPath(); g.moveTo(ex,ey); g.lineTo(ex-8, ey-5); g.lineTo(ex-3, ey+8); g.closePath(); g.fillStyle='#fff'; g.fill();
  }
  return toTex(c);
}
/* C-9 "nakaz jazdy z prawej strony znaku": strzałka skośna w dół w prawo */
function texC9(){
  const S = 128, c = mkCanvas(S,S), g = c.getContext('2d');
  g.fillStyle = '#1659b0'; g.beginPath(); g.arc(S/2,S/2,S/2-1,0,TAU); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); g.arc(S/2,S/2,S/2-6,0,TAU); g.stroke();
  g.save(); g.translate(S/2, S/2); g.rotate(-Math.PI/4);          // strzałka w dół obrócona o -45° (canvas: y w dół) => w dół w prawo
  g.fillStyle = '#fff';
  g.fillRect(-7, -34, 14, 46);
  g.beginPath(); g.moveTo(-22, 8); g.lineTo(22, 8); g.lineTo(0, 34); g.closePath(); g.fill();
  g.restore();
  return toTex(c);
}
/* trójkąt odwrócony (A-7): wierzchołki (0,0),(S,0),(S/2,S) = UV (0,1),(1,1),(0.5,0) — patrz shapeTriDown */
function texA7(){
  const S = 128, c = mkCanvas(S,S), g = c.getContext('2d');
  g.fillStyle = '#c5161d'; g.beginPath(); g.moveTo(0,0); g.lineTo(S,0); g.lineTo(S/2,S); g.closePath(); g.fill();
  g.fillStyle = '#f2f0ea'; g.beginPath(); g.moveTo(S*0.17,S*0.09); g.lineTo(S*0.83,S*0.09); g.lineTo(S/2,S*0.78); g.closePath(); g.fill();
  return toTex(c);
}
/* trójkąt ostrzegawczy (A-…): wierzchołki (S/2,0),(S,S),(0,S) */
function texWarn(draw){
  const S = 128, c = mkCanvas(S,S), g = c.getContext('2d');
  g.fillStyle = '#c5161d'; g.beginPath(); g.moveTo(S/2,0); g.lineTo(S,S); g.lineTo(0,S); g.closePath(); g.fill();
  g.fillStyle = '#f5c400'; g.beginPath(); g.moveTo(S/2,S*0.22); g.lineTo(S*0.83,S*0.91); g.lineTo(S*0.17,S*0.91); g.closePath(); g.fill();
  if (draw) draw(g, S);
  return toTex(c);
}
function texStop(){
  const S = 128, c = mkCanvas(S,S), g = c.getContext('2d');
  g.fillStyle = '#f2f0ea'; g.beginPath();
  for (let k = 0; k < 8; k++){ const a = TAU*(k+0.5)/8; g.lineTo(S/2+Math.cos(a)*S*0.5, S/2+Math.sin(a)*S*0.5); }
  g.closePath(); g.fill();
  g.fillStyle = '#c5161d'; g.beginPath();
  for (let k = 0; k < 8; k++){ const a = TAU*(k+0.5)/8; g.lineTo(S/2+Math.cos(a)*S*0.45, S/2+Math.sin(a)*S*0.45); }
  g.closePath(); g.fill();
  g.fillStyle = '#fff'; g.font = '700 36px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('STOP', S/2, S/2+2);
  return toTex(c);
}
function texSpeed(n){
  const S = 128, c = mkCanvas(S,S), g = c.getContext('2d');
  g.fillStyle = '#f2f0ea'; g.beginPath(); g.arc(S/2,S/2,S/2-1,0,TAU); g.fill();
  g.strokeStyle = '#c5161d'; g.lineWidth = 13; g.beginPath(); g.arc(S/2,S/2,S/2-8,0,TAU); g.stroke();
  g.fillStyle = '#111'; g.font = '700 ' + (n >= 100 ? 44 : 54) + 'px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(n), S/2, S/2+3);
  return toTex(c);
}
/* tablica autostradowa: niebieskie tło (w Polsce drogowskazy na autostradach są niebieskie), czerwona tabliczka z numerem */
function texHwySign(lines, num){
  const W = 256, H = 160, c = mkCanvas(W,H), g = c.getContext('2d');
  g.fillStyle = '#1a4fa0'; g.fillRect(0,0,W,H);
  g.strokeStyle = '#f2f0ea'; g.lineWidth = 6;
  g.strokeRect(7,7,W-14,H-14);
  g.fillStyle = '#f2f0ea';
  g.font = '700 32px Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const n = lines.length + (num ? 1 : 0);
  lines.forEach((t, i) => g.fillText(t, W/2, H/2 + (i - (n-1)/2) * 42));
  if (num){
    const y = H/2 + (n-1)/2 * 42;
    g.fillStyle = '#c5161d'; g.fillRect(W/2 - 40, y - 17, 80, 34);
    g.strokeStyle = '#f2f0ea'; g.lineWidth = 3; g.strokeRect(W/2 - 40, y - 17, 80, 34);
    g.fillStyle = '#f2f0ea'; g.font = '700 26px Arial, sans-serif'; g.fillText(num, W/2, y + 1);
  }
  return toTex(c);
}

/* --- kształty tarcz: wielokąty w lokalnej płaszczyźnie (x,y), środek w (0,0),
   wierzchołki przeciwnie do wskazówek patrząc od przodu (+Z) => normalna lica = +Z;
   tw/th = rozmiar obszaru tekstury w metrach (UV = 0.5 + x/tw, 0.5 + y/th) --- */
function shapeCircle(r, seg){
  const pts = []; seg = seg || 24;
  for (let k = 0; k < seg; k++){ const a = k/seg*TAU; pts.push([Math.cos(a)*r, Math.sin(a)*r]); }
  return { pts: pts, tw: 2*r, th: 2*r };
}
function shapeOct(r){                         // ośmiokąt z płaskim górnym bokiem, wierzchołki na promieniu r
  const pts = [];
  for (let k = 0; k < 8; k++){ const a = TAU*(k+0.5)/8; pts.push([Math.cos(a)*r, Math.sin(a)*r]); }
  return { pts: pts, tw: 2*r, th: 2*r };
}
function shapeTriDown(w, h){ return { pts: [[0,-h/2],[w/2,h/2],[-w/2,h/2]], tw: w, th: h }; }
function shapeTriUp(w, h){   return { pts: [[-w/2,-h/2],[w/2,-h/2],[0,h/2]], tw: w, th: h }; }
function shapeRect(w, h){    return { pts: [[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]], tw: w, th: h }; }
function signFace(kind, tex, shape){
  let y0 = 1e9, y1 = -1e9;
  shape.pts.forEach(p => { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
  return { kind: kind, tex: tex, shape: shape, y0: y0, y1: y1 };
}

/* --- bufory scalane na końcu (finalizeSigns) --- */
const signFaceBufs = new Map();               // tex.uuid -> { buf, tex }
const signBackBuf  = new GeoBuf();            // rewersy tarcz (szara blacha)
const signPoleBuf  = new GeoBuf();            // słupki (ocynk)
const signDarkBuf  = new GeoBuf();            // obudowy sygnalizatorów
const signGeomLog  = [];                      // wymiary konstrukcji (test/sim.js sprawdza słupek vs tarcze)
function faceBuf(tex){
  let e = signFaceBufs.get(tex.uuid);
  if (!e){ e = { buf: new GeoBuf(), tex: tex }; signFaceBufs.set(tex.uuid, e); }
  return e.buf;
}
/* lokalne (lx,ly,lz) znaku -> świat; ta sama konwencja co rotation.y w Three.js i boxRot */
function signXf(x, z, rotY){
  const cs = Math.cos(rotY), sn = Math.sin(rotY);
  return (lx, ly, lz) => [x + lx*cs + lz*sn, ly, z - lx*sn + lz*cs];
}
/* słupek walcowy od y0 do y1 (z kolizją — bryła o tej samej wysokości) */
function signPole(wx, wz, y0, y1, r){
  const seg = 8, h = y1 - y0;
  for (let k = 0; k < seg; k++){
    const a0 = k/seg*TAU, a1 = (k+1)/seg*TAU;
    const p0 = [wx + Math.cos(a0)*r, wz + Math.sin(a0)*r], p1 = [wx + Math.cos(a1)*r, wz + Math.sin(a1)*r];
    /* kolejność (p1 dół, p0 dół, p0 góra, p1 góra) daje normalną na zewnątrz (sprawdzone numerycznie) */
    signPoleBuf.quad([p1[0],y0,p1[1]],[p0[0],y0,p0[1]],[p0[0],y1,p0[1]],[p1[0],y1,p1[1]], [0,0],[1,0],[1,1],[0,1]);
    signPoleBuf.tri([wx,y1,wz],[p1[0],y1,p1[1]],[p0[0],y1,p0[1]], [0,0],[1,0],[1,1]);
  }
  staticBox(wx, (y0 + y1)/2, wz, Math.max(0.12, r*2), h, Math.max(0.12, r*2));
}
/* tarcza: lico z teksturą (+Z) i rewers (−Z) przesunięty 1 cm do tyłu */
function signPanel(xf, face, cy, zf){
  const sh = face.shape, n = sh.pts.length, fb = faceBuf(face.tex);
  const uv = p => [0.5 + p[0]/sh.tw, 0.5 + p[1]/sh.th];
  const P = (p, zz) => xf(p[0], cy + p[1], zz);
  const c = [0, 0];
  for (let k = 1; k < n - 1; k++){
    const a = sh.pts[0], b = sh.pts[k], d = sh.pts[k+1];
    fb.tri(P(a, zf), P(b, zf), P(d, zf), uv(a), uv(b), uv(d));
    signBackBuf.tri(P(a, zf - 0.01), P(d, zf - 0.01), P(b, zf - 0.01), [0,0],[1,0],[1,1]);
  }
  /* cienka krawędź blachy (widoczna z boku) */
  for (let k = 0; k < n; k++){
    const a = sh.pts[k], b = sh.pts[(k+1) % n];
    const ex = b[0]-a[0], ey = b[1]-a[1];
    const out = [ey, -ex];                                   // na zewnątrz wielokąta (CCW)
    const A0 = P(a, zf), B0 = P(b, zf), A1 = P(a, zf - 0.01), B1 = P(b, zf - 0.01);
    const o = xf(out[0], out[1], 0), o0 = xf(0, 0, 0);
    quadOut(signBackBuf, A0, B0, B1, A1, [o[0]-o0[0], o[1], o[2]-o0[2]]);
  }
}
/* Znak: tarcze `faces` od dołu do góry na wspólnym słupku (lub kilku — poleX = przesunięcia w lokalnym X).
   base = poziom podłoża (WALK_H na chodniku, 0 na poboczu), bottom = dolna krawędź najniższej tarczy nad podłożem. */
function placeSign(x, z, rotY, faces, opt){
  opt = opt || {};
  const base = opt.base === undefined ? WALK_H : opt.base;
  const bottom = opt.bottom === undefined ? SIGN_BOTTOM : opt.bottom;
  const r = opt.poleR || SIGN_POLE_R, poleX = opt.poleX || [0];
  const xf = signXf(x, z, rotY), zf = r + 0.015;
  let cur = base + bottom, topCenter = cur;
  faces.forEach(f => {
    const cy = cur - f.y0;
    signPanel(xf, f, cy, zf);
    topCenter = cy;
    cur = cy + f.y1 + SIGN_GAP;
    signLog.push({ kind: f.kind, x: x, z: z, rot: rotY });
  });
  /* słupek kończy się w połowie najwyższej tarczy — od przodu zawsze schowany za licem */
  poleX.forEach(px => { const p = xf(px, 0, 0); signPole(p[0], p[2], base, topCenter, r); });
  signGeomLog.push({ x: x, z: z, poleTop: topCenter, faceBottom: base + bottom, faceTop: cur - SIGN_GAP, poleFront: r, backZ: zf - 0.01 });
  return { top: cur - SIGN_GAP, xf: xf };
}

/* --- gotowe tarcze --- */
const SIGN_TEX = {
  C12: texC12(), A7: texA7(), STOP: texStop(), C9: texC9()
};
const _speedTex = {};
function speedTex(n){ return _speedTex[n] || (_speedTex[n] = texSpeed(n)); }
const FACE = {
  C12:  () => signFace('C-12', SIGN_TEX.C12, shapeCircle(0.35)),
  A7:   () => signFace('A-7', SIGN_TEX.A7, shapeTriDown(0.8, 0.7)),
  STOP: () => signFace('STOP', SIGN_TEX.STOP, shapeOct(0.38)),
  C9:   () => signFace('C-9', SIGN_TEX.C9, shapeCircle(0.3)),
  B33:  n  => signFace('B-33', speedTex(n), shapeCircle(0.35))
};

/* --- scalenie (wywoływane raz, po postawieniu wszystkich znaków) --- */
const matSignBack = new THREE.MeshLambertMaterial({ color: 0x8e9196 });
const matSignPole = new THREE.MeshLambertMaterial({ color: 0x7d8288 });
const matSignDark = new THREE.MeshLambertMaterial({ color: 0x1b1d20 });
function finalizeSigns(){
  signFaceBufs.forEach(e => addMerged(e.buf, new THREE.MeshLambertMaterial({ map: e.tex }), false, true));
  addMerged(signBackBuf, matSignBack, true, true);
  addMerged(signPoleBuf, matSignPole, true, true);
  addMerged(signDarkBuf, matSignDark, true, true);
}
