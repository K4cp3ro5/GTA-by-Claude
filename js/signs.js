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
  const poles = poleX.map(px => { const p = xf(px, 0, 0); signPole(p[0], p[2], base, topCenter, r); return { x: p[0], z: p[2], base: base }; });
  signGeomLog.push({ x: x, z: z, poleTop: topCenter, faceBottom: base + bottom, faceTop: cur - SIGN_GAP, poleFront: r, backZ: zf - 0.01, poles: poles, kind: faces[0].kind });
  return { top: cur - SIGN_GAP, xf: xf };
}

/* tarcza powiększona k razy (znaki „duże” na autostradzie) */
function scaleFace(f, k){
  const sh = { pts: f.shape.pts.map(p => [p[0] * k, p[1] * k]), tw: f.shape.tw * k, th: f.shape.th * k };
  return signFace(f.kind, f.tex, sh);
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

/* --- znaki organizacji ruchu (road-rules.js) --- */
function texB2(){                                           // zakaz wjazdu: czerwone koło, biały poziomy pas
  const S = 128, c = mkCanvas(S,S), g = c.getContext('2d');
  g.fillStyle = '#f2f0ea'; g.beginPath(); g.arc(S/2,S/2,S/2-1,0,TAU); g.fill();
  g.fillStyle = '#c5161d'; g.beginPath(); g.arc(S/2,S/2,S/2-4,0,TAU); g.fill();
  g.fillStyle = '#f2f0ea'; g.fillRect(S*0.17, S*0.41, S*0.66, S*0.18);
  return toTex(c);
}
function blueDisc(g, S){
  g.fillStyle = '#1659b0'; g.beginPath(); g.arc(S/2,S/2,S/2-1,0,TAU); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); g.arc(S/2,S/2,S/2-6,0,TAU); g.stroke();
}
function arrowHead(g, x, y, ang, s){                        // grot strzałki w punkcie (x,y) skierowany pod kątem ang (canvas)
  g.save(); g.translate(x, y); g.rotate(ang);
  g.beginPath(); g.moveTo(s, 0); g.lineTo(-s*0.6, -s*0.9); g.lineTo(-s*0.6, s*0.9); g.closePath(); g.fill();
  g.restore();
}
/* C-2 (w prawo za znakiem), C-4 (w lewo za znakiem), C-5 (prosto): biała strzałka na niebieskim kole */
function texCArrow(kind){
  const S = 128, c = mkCanvas(S,S), g = c.getContext('2d');
  blueDisc(g, S);
  g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineWidth = 13; g.lineCap = 'butt';
  if (kind === 'C-6'){                                      // prosto lub w prawo
    g.beginPath(); g.moveTo(S*0.42, S*0.84); g.lineTo(S*0.42, S*0.36); g.stroke();
    arrowHead(g, S*0.42, S*0.2, -Math.PI/2, 20);
    g.beginPath(); g.moveTo(S*0.42, S*0.6); g.quadraticCurveTo(S*0.42, S*0.5, S*0.56, S*0.5); g.lineTo(S*0.66, S*0.5); g.stroke();
    arrowHead(g, S*0.8, S*0.5, 0, 18);
  } else if (kind === 'C-5'){
    g.beginPath(); g.moveTo(S/2, S*0.82); g.lineTo(S/2, S*0.36); g.stroke();
    arrowHead(g, S/2, S*0.2, -Math.PI/2, 22);
  } else {
    const sgn = kind === 'C-2' ? 1 : -1;                    // C-2: zakręt w prawo, C-4: w lewo
    g.beginPath(); g.moveTo(S/2 - sgn*14, S*0.84); g.lineTo(S/2 - sgn*14, S*0.48);
    g.quadraticCurveTo(S/2 - sgn*14, S*0.36, S/2 + sgn*2, S*0.36); g.lineTo(S/2 + sgn*14, S*0.36); g.stroke();
    arrowHead(g, S/2 + sgn*30, S*0.36, sgn > 0 ? 0 : Math.PI, 20);
  }
  return toTex(c);
}
function texD1(){                                           // droga z pierwszeństwem: żółty romb z białym obrzeżem (romb = kształt tarczy)
  const S = 128, c = mkCanvas(S,S), g = c.getContext('2d');
  const dia = (r, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(S/2, S/2 - r); g.lineTo(S/2 + r, S/2); g.lineTo(S/2, S/2 + r); g.lineTo(S/2 - r, S/2); g.closePath(); g.fill(); };
  dia(S/2, '#2a2a2a'); dia(S/2 - 3, '#f2f0ea'); dia(S/2 - 16, '#2a2a2a'); dia(S/2 - 19, '#f5c400');
  return toTex(c);
}
function blueSquare(g, W, H){
  g.fillStyle = '#f2f0ea'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#1659b0'; g.fillRect(4, 4, W - 8, H - 8);
}
function texD3(){                                           // droga jednokierunkowa: biała strzałka w górę
  const S = 128, c = mkCanvas(S,S), g = c.getContext('2d');
  blueSquare(g, S, S);
  g.fillStyle = '#fff'; g.fillRect(S/2 - 8, S*0.4, 16, S*0.48);
  arrowHead(g, S/2, S*0.26, -Math.PI/2, 26);
  return toTex(c);
}
function texD6(){                                           // przejście dla pieszych: biały trójkąt, pieszy na pasach
  const S = 128, c = mkCanvas(S,S), g = c.getContext('2d');
  blueSquare(g, S, S);
  g.fillStyle = '#f2f0ea'; g.beginPath(); g.moveTo(S/2, S*0.12); g.lineTo(S*0.9, S*0.86); g.lineTo(S*0.1, S*0.86); g.closePath(); g.fill();
  g.fillStyle = '#111';
  for (let k = 0; k < 4; k++) g.fillRect(S*0.25 + k*S*0.14, S*0.76, S*0.08, S*0.06);         // pasy zebry
  g.beginPath(); g.arc(S*0.53, S*0.36, 6, 0, TAU); g.fill();                                // głowa
  g.lineWidth = 6; g.strokeStyle = '#111'; g.lineCap = 'round';
  g.beginPath(); g.moveTo(S*0.52, S*0.43); g.lineTo(S*0.49, S*0.58);                       // tułów
  g.moveTo(S*0.49, S*0.58); g.lineTo(S*0.42, S*0.72); g.moveTo(S*0.49, S*0.58); g.lineTo(S*0.58, S*0.71);   // nogi
  g.moveTo(S*0.51, S*0.47); g.lineTo(S*0.42, S*0.54); g.moveTo(S*0.51, S*0.47); g.lineTo(S*0.6, S*0.52);   // ręce
  g.stroke();
  return toTex(c);
}
/* D-42 obszar zabudowany (sylwetka miasta), D-43 koniec obszaru (przekreślona) */
function texD42(end){
  const W = 192, H = 128, c = mkCanvas(W,H), g = c.getContext('2d');
  g.fillStyle = '#2a2a2a'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#f2f0ea'; g.fillRect(4, 4, W - 8, H - 8);
  g.fillStyle = '#111';
  [[20,70,22],[44,52,18],[64,80,14],[80,40,22],[104,62,20],[126,48,16],[144,74,24]].forEach(b => g.fillRect(b[0], b[1], b[2], 104 - b[1]));
  g.beginPath(); g.moveTo(80, 40); g.lineTo(91, 22); g.lineTo(102, 40); g.closePath(); g.fill();        // wieża kościoła
  g.fillRect(20, 102, W - 40, 6);
  if (end){ g.strokeStyle = '#c5161d'; g.lineWidth = 12; g.beginPath(); g.moveTo(14, H - 14); g.lineTo(W - 14, 14); g.stroke(); }
  return toTex(c);
}
/* B-43 strefa ograniczonej prędkości (n km/h), B-44 koniec strefy (szary, przekreślony czarnymi pasami) */
function texB43(n, end){
  const W = 128, H = 160, c = mkCanvas(W,H), g = c.getContext('2d');
  g.fillStyle = '#2a2a2a'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#f2f0ea'; g.fillRect(4, 4, W - 8, H - 8);
  g.fillStyle = '#111'; g.font = '700 22px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('STREFA', W/2, 26);
  g.strokeStyle = end ? '#777' : '#c5161d'; g.lineWidth = 9; g.beginPath(); g.arc(W/2, 94, 40, 0, TAU); g.stroke();
  g.fillStyle = end ? '#777' : '#111'; g.font = '700 38px Arial, sans-serif'; g.fillText(String(n), W/2, 96);
  if (end){ g.strokeStyle = '#111'; g.lineWidth = 3; for (let k = -3; k <= 3; k++){ g.beginPath(); g.moveTo(W/2 - 60 + k*10, H - 10); g.lineTo(W/2 + 60 + k*10, 10); g.stroke(); } }
  return toTex(c);
}
/* D-9 autostrada / D-10 koniec autostrady: niebieski kwadrat, piktogram wiaduktu nad dwiema jezdniami */
function texD9(end){
  const S = 128, c = mkCanvas(S,S), g = c.getContext('2d');
  blueSquare(g, S, S);
  g.fillStyle = '#fff';
  g.fillRect(S*0.14, S*0.30, S*0.72, S*0.09);                                   // wiadukt
  g.fillRect(S*0.20, S*0.39, S*0.07, S*0.10); g.fillRect(S*0.73, S*0.39, S*0.07, S*0.10);
  g.beginPath(); g.moveTo(S*0.40, S*0.42); g.lineTo(S*0.46, S*0.42); g.lineTo(S*0.36, S*0.88); g.lineTo(S*0.22, S*0.88); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(S*0.54, S*0.42); g.lineTo(S*0.60, S*0.42); g.lineTo(S*0.78, S*0.88); g.lineTo(S*0.64, S*0.88); g.closePath(); g.fill();
  if (end){ g.strokeStyle = '#c5161d'; g.lineWidth = 12; g.beginPath(); g.moveTo(S*0.12, S*0.88); g.lineTo(S*0.88, S*0.12); g.stroke(); }
  return toTex(c);
}
function shapeDiamond(r){ return { pts: [[0,-r],[r,0],[0,r],[-r,0]], tw: 2*r, th: 2*r }; }
const SIGN_TEX2 = { B2: texB2(), C2: texCArrow('C-2'), C4: texCArrow('C-4'), C5: texCArrow('C-5'), C6: texCArrow('C-6'), D1: texD1(), D3: texD3(), D6: texD6(),
                    D42: texD42(false), D43: texD42(true), D9: texD9(false), D10: texD9(true), B43: texB43(30, false), B44: texB43(30, true) };
Object.assign(FACE, {
  B2:  () => signFace('B-2', SIGN_TEX2.B2, shapeCircle(0.35)),
  C2:  () => signFace('C-2', SIGN_TEX2.C2, shapeCircle(0.35)),
  C4:  () => signFace('C-4', SIGN_TEX2.C4, shapeCircle(0.35)),
  C5:  () => signFace('C-5', SIGN_TEX2.C5, shapeCircle(0.35)),
  C6:  () => signFace('C-6', SIGN_TEX2.C6, shapeCircle(0.35)),
  D1:  () => signFace('D-1', SIGN_TEX2.D1, shapeDiamond(0.42)),
  D3:  () => signFace('D-3', SIGN_TEX2.D3, shapeRect(0.6, 0.6)),
  D6:  () => signFace('D-6', SIGN_TEX2.D6, shapeRect(0.6, 0.6)),
  D42: () => signFace('D-42', SIGN_TEX2.D42, shapeRect(1.2, 0.8)),
  D9:  () => signFace('D-9', SIGN_TEX2.D9, shapeRect(0.7, 0.7)),
  D10: () => signFace('D-10', SIGN_TEX2.D10, shapeRect(0.7, 0.7)),
  D43: () => signFace('D-43', SIGN_TEX2.D43, shapeRect(1.2, 0.8)),
  B43: () => signFace('B-43', SIGN_TEX2.B43, shapeRect(0.64, 0.8)),
  B44: () => signFace('B-44', SIGN_TEX2.B44, shapeRect(0.64, 0.8))
});

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
