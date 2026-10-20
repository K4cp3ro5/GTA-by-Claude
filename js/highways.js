/* ---------------------------------------------------------------
   7b. AUTOSTRADY A1 / A2 — geometria, kolizje, filary, latarnie, znaki.
   Wszystko budowane z planu (hwy-plan.js: HWY_WAYS, HWY_PIERS, HWY_RAMPS, HWY_TERM):
   - jezdnia: nawierzchnia (normalna w górę), płyta 0.8 m z widocznym spodem, boki płyty,
     bariery 1 m (przerwy przy pasach zbierających i wyłączenia/włączenia);
   - niżej niż 4.5 m (końce schodzące na teren) — lity nasyp: boki do ziemi i zamknięte
     czoło od strony płyty, żadnej przezroczystej ściany od dołu ani z boku;
   - pas rozdziału: betonowy blok 4 × 0.9 m z latarniami.
   Kolizje: pochylone bryły (staticBoxQ) — płyta, bariery, nasyp, pas rozdziału, filary.
   --------------------------------------------------------------- */
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
  g.fillRect(edge, 0, 3, H);                 // krawędź zewnętrzna (pobocze) — u = 0 to prawa krawędź jezdni
  g.fillRect(shoulderEnd, 0, 3, H);          // granica pobocza / pasa ruchu
  g.fillRect(W-6, 0, 3, H);                  // krawędź wewnętrzna (pas rozdziału)
  const laneDivX = shoulderEnd + (W-6-shoulderEnd)/2 - 1.5, period = H/4, dash = period*0.55;
  g.fillStyle = 'rgba(232,230,220,.9)';
  for (let k = 0; k < 4; k++) g.fillRect(laneDivX, k*period + (period-dash)/2, 3, dash);
  return toTex(c);
}
/* łącznica / droga jednopasowa: asfalt z liniami krawędziowymi po obu stronach */
function texRampRoad(){
  const W = 128, H = 256, c = mkCanvas(W,H), g = c.getContext('2d');
  g.fillStyle = '#303237'; g.fillRect(0,0,W,H);
  noiseOver(g, W, H, 18);
  g.fillStyle = 'rgba(226,224,214,.85)';
  g.fillRect(7, 0, 4, H); g.fillRect(W - 11, 0, 4, H);
  return toTex(c);
}
const hwyLaneTex = texHighway(), hwyRampTex = texRampRoad();
const hwTopBuf = new GeoBuf(), hwRampBuf = new GeoBuf(), hwConcBuf = new GeoBuf();
const FILL_Y = 4.5;                                    // poniżej: lity nasyp zamiast płyty na filarach

/* czworokąt z UV i normalną w stronę out */
function quadUV(buf, p0, p1, p2, p3, u0, u1, u2, u3, out){
  const e1 = [p1[0]-p0[0], p1[1]-p0[1], p1[2]-p0[2]], e2 = [p3[0]-p0[0], p3[1]-p0[1], p3[2]-p0[2]];
  const nx = e1[1]*e2[2]-e1[2]*e2[1], ny = e1[2]*e2[0]-e1[0]*e2[2], nz = e1[0]*e2[1]-e1[1]*e2[0];
  if (nx*out[0] + ny*out[1] + nz*out[2] < 0) buf.quad(p0, p3, p2, p1, u0, u3, u2, u1);
  else buf.quad(p0, p1, p2, p3, u0, u1, u2, u3);
}
const _hq1 = new CANNON.Quaternion(), _hq2 = new CANNON.Quaternion(), _hAY = new CANNON.Vec3(0,1,0), _hAX = new CANNON.Vec3(1,0,0);
function segQuat(dx, dy, dz){
  const q = new CANNON.Quaternion();
  _hq1.setFromAxisAngle(_hAY, Math.atan2(dx, dz));
  _hq2.setFromAxisAngle(_hAX, -Math.atan2(dy, Math.hypot(dx, dz)));
  _hq1.mult(_hq2, q);
  return q;
}
/* czy na odcinku i drogi w jest bariera po stronie side (+1 prawa, −1 lewa) */
function wayBarrier(w, i, side){
  const a = w.pts[i], b = w.pts[i + 1];
  if (Math.max(a.y, b.y) < 0.6) return false;                         // na terenie bez barier
  if (w.kind === 'med') return false;
  if (w.kind === 'cw') return side > 0 && !cwBarrierGap(w.name, (a.s + b.s) / 2);
  if (w.kind === 'col') return side > 0;
  if (w.kind === 'conn' && side < 0 && (i < w.auxIn - 1 || i >= w.pts.length - w.auxOut)) return false;   // przy jezdni (pas wył./wł.)
  return side > 0 ? w.barR : w.barL;
}
function buildWay(w){
  const P = w.pts, n = P.length, isMed = w.kind === 'med', slab = HP.slab;
  const R = P.map((p, i) => {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
    const hx = b.x - a.x, hz = b.z - a.z, l = Math.hypot(hx, hz) || 1;
    return { x: -hz / l, z: hx / l };
  });
  const E = (i, off) => [P[i].x + R[i].x * off, P[i].z + R[i].z * off];
  const fillAt = i => Math.max(P[i].y, P[Math.min(n - 1, i + 1)].y) < FILL_Y;
  for (let i = 0; i < n - 1; i++){
    const a = P[i], b = P[i + 1];
    const ground = a.y < 0.05 && b.y < 0.05;
    const lift = isMed ? 0.9 : 0;
    const ya = ground ? 0.015 : a.y + lift, yb = ground ? 0.015 : b.y + lift;
    const aL = E(i, -a.hw), aR = E(i, a.hw), bL = E(i + 1, -b.hw), bR = E(i + 1, b.hw);
    const va = a.d / ROAD_TILE, vb = b.d / ROAD_TILE;
    const topBuf = isMed ? hwConcBuf : (w.tex === 'hwy' || (w.tex === 'term' && (a.hw + b.hw) / 2 > 4)) ? hwTopBuf : hwRampBuf;
    quadUV(topBuf, [aR[0], ya, aR[1]], [bR[0], yb, bR[1]], [bL[0], yb, bL[1]], [aL[0], ya, aL[1]],
           [0, va], [0, vb], [1, vb], [1, va], [0, 1, 0]);
    if (ground) continue;
    const fill = fillAt(i);
    const ba = fill ? 0 : a.y - slab, bb = fill ? 0 : b.y - slab;
    if (!fill) quadUV(hwConcBuf, [aR[0], ba, aR[1]], [bR[0], bb, bR[1]], [bL[0], bb, bL[1]], [aL[0], ba, aL[1]], [0,0],[0,1],[1,1],[1,0], [0, -1, 0]);
    /* boki płyty / nasypu (pas rozdziału: tylko nad jezdniami) */
    const sides = isMed ? [[1, a.y, b.y], [-1, a.y, b.y]] : [[1, ba, bb], [-1, ba, bb]];
    sides.forEach(sd => {
      const s = sd[0];
      if (!isMed && s < 0 && (w.kind === 'cw' || w.kind === 'col')) return;          // wnętrze przekroju (pas rozdziału / jezdnia obok)
      const pa = s > 0 ? aR : aL, pb = s > 0 ? bR : bL;
      quadUV(hwConcBuf, [pa[0], sd[1], pa[1]], [pb[0], sd[2], pb[1]], [pb[0], yb, pb[1]], [pa[0], ya, pa[1]], [0,0],[1,0],[1,1],[0,1],
             [R[i].x * s, 0, R[i].z * s]);
    });
    /* bariery: ściana 0.4 × 1.0 m na krawędzi */
    [1, -1].forEach(s => {
      if (!wayBarrier(w, i, s)) return;
      const o0a = E(i, s * a.hw), o0b = E(i + 1, s * b.hw), o1a = E(i, s * (a.hw + 0.4)), o1b = E(i + 1, s * (b.hw + 0.4));
      const out = [R[i].x * s, 0, R[i].z * s], inn = [-R[i].x * s, 0, -R[i].z * s];
      quadUV(hwConcBuf, [o0a[0], ya, o0a[1]], [o0b[0], yb, o0b[1]], [o0b[0], yb + 1, o0b[1]], [o0a[0], ya + 1, o0a[1]], [0,0],[1,0],[1,1],[0,1], inn);
      quadUV(hwConcBuf, [o1a[0], ya - 0.3, o1a[1]], [o1b[0], yb - 0.3, o1b[1]], [o1b[0], yb + 1, o1b[1]], [o1a[0], ya + 1, o1a[1]], [0,0],[1,0],[1,1],[0,1], out);
      quadUV(hwConcBuf, [o0a[0], ya + 1, o0a[1]], [o0b[0], yb + 1, o0b[1]], [o1b[0], yb + 1, o1b[1]], [o1a[0], ya + 1, o1a[1]], [0,0],[1,0],[1,1],[0,1], [0, 1, 0]);
    });
    /* czoło nasypu: przejście płyta <-> nasyp zamknięte przekrojem od ziemi do spodu płyty */
    if (i > 0 && fill !== fillAt(i - 1)){
      const k = i, yy = P[k].y - slab, cL = E(k, -P[k].hw), cR = E(k, P[k].hw);
      const tx = P[Math.min(n - 1, k + 1)].x - P[Math.max(0, k - 1)].x, tz = P[Math.min(n - 1, k + 1)].z - P[Math.max(0, k - 1)].z;
      const sgn = fill ? -1 : 1;                                             // w stronę płyty
      quadUV(hwConcBuf, [cL[0], 0, cL[1]], [cR[0], 0, cR[1]], [cR[0], yy, cR[1]], [cL[0], yy, cL[1]], [0,0],[1,0],[1,1],[0,1], [tx * sgn, 0, tz * sgn]);
    }
  }
  /* zakończenie pasa rozdziału (koniec przekroju autostrady) */
  if (isMed) [0, n - 1].forEach(i => {
    const cL = E(i, -P[i].hw), cR = E(i, P[i].hw), j = i === 0 ? 1 : n - 2, out = [P[i].x - P[j].x, 0, P[i].z - P[j].z];
    quadUV(hwConcBuf, [cL[0], P[i].y - slab, cL[1]], [cR[0], P[i].y - slab, cR[1]], [cR[0], P[i].y + 0.9, cR[1]], [cL[0], P[i].y + 0.9, cL[1]], [0,0],[1,0],[1,1],[0,1], out);
  });
  /* kolizje: cięciwy co ≥ 5.5 m */
  let i = 0;
  while (i < n - 1){
    let j = i + 1;
    while (j < n - 1 && P[j].d - P[i].d < 5.5) j++;
    const a = P[i], b = P[j], dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = Math.hypot(dx, dz);
    if (Math.max(a.y, b.y) >= 0.05 && len > 0.01){
      const q = segQuat(dx, dy, dz), mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, my = (a.y + b.y) / 2, hw = (a.hw + b.hw) / 2;
      const rx = -dz / len, rz = dx / len;
      if (isMed) staticBoxQ(mx, my + 0.05, mz, 2 * hw, 1.7, len + 0.2, q);
      else {
        staticBoxQ(mx, my - 0.25, mz, 2 * hw, 0.5, len + 0.3, q);                    // płyta (górna powierzchnia = jezdnia)
        const lo = Math.min(a.y, b.y);
        if (Math.max(a.y, b.y) < FILL_Y && lo > 0.6) staticBoxQ(mx, (lo - 0.5) / 2, mz, 2 * hw, lo - 0.5, len, segQuat(dx, 0, dz));   // nasyp pod spodem
        [1, -1].forEach(s => {
          if (!wayBarrier(w, Math.min(i, n - 2), s) && !wayBarrier(w, Math.max(i, j - 1), s)) return;
          staticBoxQ(mx + rx * s * (hw + 0.2), my + 0.5, mz + rz * s * (hw + 0.2), 0.4, 1.0, len + 0.2, q);
        });
      }
    }
    i = j;
  }
}
HWY_WAYS.forEach(buildWay);

/* filary (kolumna + oczep pod płytą), z kolizją */
HWY_PIERS.forEach(p => {
  if (p.top < 0.5) return;
  hwConcBuf.box(p.x, p.top / 2, p.z, p.size, p.top, p.size, 2, false);
  hwConcBuf.box(p.x, p.top - 0.3, p.z, p.size + 0.8, 0.6, p.size + 0.8, 2, false);
  staticBox(p.x, p.top / 2, p.z, p.size, p.top, p.size);
});

/* latarnie na pasie rozdziału A1 i A2 (dwie głowice nad obiema jezdniami) co 48 m;
   A1 bez latarni pod A2 w środku węzła */
['A1', 'A2'].forEach(id => {
  const A = HWY_AX[id];
  for (let s = -HP.sSplit + 30; s <= HP.sSplit - 30; s += 48){
    if (id === 'A1' && Math.abs(s) < 18) continue;
    const p = hwyPt(id, s, 0);
    [1, -1].forEach(sg => lampSpots.push({ x: p.x, z: p.z, rot: Math.atan2(A.n.x * sg, A.n.z * sg), y: p.y + 0.9, gy: p.y + 0.01 }));
  }
});
/* latarnie wzdłuż dróg pasa podmiejskiego (po prawej stronie, wysięgnik nad drogę) */
HWY_TERM.forEach(t => [t.exit, t.entry].forEach(w => {
  for (let d = 20; d < w.len - 10; d += 34){
    const q = wayAt(w, d);
    if (q.y > 0.05 || q.a.part !== 'belt') continue;
    const o = q.a.hw + 1.2;
    lampSpots.push({ x: q.x - q.hz * o, z: q.z + q.hx * o, rot: Math.atan2(q.hz, -q.hx), y: 0 });
  }
}));

/* --- znaki autostrad --- */
const HWY_CORNER_NAMES = ['PŁD.-WSCH.', 'PŁD.-ZACH.', 'PŁN.-ZACH.', 'PŁN.-WSCH.'];
/* znak przy prawej krawędzi drogi w odległości d (na wiadukcie: na poboczu przy barierze, na terenie: obok jezdni) */
function hwySignAt(w, d, faces, opt, side){
  const q = wayAt(w, d), up = q.y > 0.05, hw = lerp(q.a.hw, q.b.hw, q.t), sd = side || 1;
  const o = sd * (up ? hw - 0.35 : hw + 1.4);
  const rot = sd > 0 ? Math.atan2(-q.hx, -q.hz) : Math.atan2(q.hx, q.hz);
  placeSign(q.x - q.hz * o, q.z + q.hx * o, rot, faces, Object.assign({ base: up ? q.y : 0 }, opt || {}));
}
function hwyBoard(w, d, lines, num){
  hwySignAt(w, d, [signFace('autostrada', texHwySign(lines, num), shapeRect(3.4, 2.1))], { bottom: 2.2, poleR: 0.08, poleX: [-1.2, 1.2] });
}
const exitCornerOf = cw => HWY_TERM.find(t => t.exitCw === cw).k;
HWY_TERM.forEach(t => {
  const ex = t.exit, en = t.entry, arcLen = (Math.PI * 3 / 4) * HP.termR;
  /* wjazd z miasta: D-43 (koniec obszaru zabudowanego), D-9 (autostrada), B-33 100 po wjeździe na jezdnię główną */
  hwySignAt(en, 10, [FACE.D43()]);
  hwySignAt(en, en.len - arcLen - 18, [FACE.D9()]);
  hwySignAt(CW[t.entryCw], 40, [FACE.B33(100)]);
  /* zjazd do miasta: D-10 (koniec autostrady) na dole łuku, B-33 50, B-33 40 przed łukiem R=25, D-42 przed miastem */
  hwySignAt(ex, arcLen + 3, [FACE.D10()]);
  hwySignAt(ex, arcLen + 16, [FACE.B33(50)]);
  hwySignAt(ex, ex.len - 120, [FACE.B33(40)]);
  hwySignAt(ex, ex.len - 14, [FACE.D42()]);
  /* zakaz wjazdu w drogę zjazdową od strony miasta */
  hwySignAt(ex, ex.len - 4, [FACE.B2()], null, -1);
  /* tablica „AUTOSTRADA A1/A2” zaraz po wjeździe i tablica przed końcem autostrady */
  const id = t.entryCw.slice(0, 2);
  hwyBoard(CW[t.entryCw], 120, ['AUTOSTRADA'], id);
  hwyBoard(CW[t.exitCw], CW[t.exitCw].len - 160, ['KONIEC', HWY_CORNER_NAMES[t.k]], id);
});
/* przed węzłem: kierunki zjazdu łącznicą (w prawo) i pętlą (w lewo), B-33 60 / 50 na łącznicach */
Object.keys(CW).forEach(cwName => {
  const cw = CW[cwName];
  const conn = HWY_RAMPS.find(r => r.kind === 'conn' && r.from === cwName), loop = HWY_RAMPS.find(r => r.kind === 'loop' && r.from === cwName);
  const dConn = cwD(cw, cw.sg * -HP.connS) - HP.auxLen, dCol = cwD(cw, -cw.sg * HP.colS);
  hwyBoard(cw, dConn - 110, [HWY_CORNER_NAMES[exitCornerOf(conn.to)]], conn.to.slice(0, 2));
  hwyBoard(cw, dCol - 60, [HWY_CORNER_NAMES[exitCornerOf(loop.to)]], loop.to.slice(0, 2));
  hwySignAt(conn.way, HP.auxLen + 8, [FACE.B33(60)]);
  hwySignAt(loop.way, 6, [FACE.B33(50)]);
});

/* minimapa: wszystkie drogi autostrad (jaśniej = wiadukt) */
HWY_WAYS.forEach(w => {
  const pts = w.pts.filter((p, i) => i % 3 === 0 || i === w.pts.length - 1).map(p => [p.x, p.z]);
  const hw = w.pts.reduce((s, p) => s + p.hw, 0) / w.pts.length;
  mapExtras.push({ t: 'line', pts: pts, w: 2 * hw, c: w.pts.some(p => p.y > 1) ? '#4a5060' : '#2b2e35' });
});

/* --- scalenie; nawierzchnie i beton zasłaniają kamerę (nie przechodzi przez płytę) --- */
const hwTopMesh  = addMerged(hwTopBuf,  new THREE.MeshLambertMaterial({ map: hwyLaneTex, color: 0xbcbcbc }), false, true);
const hwRampMesh = addMerged(hwRampBuf, new THREE.MeshLambertMaterial({ map: hwyRampTex, color: 0xbcbcbc }), false, true);
const hwConcMesh = addMerged(hwConcBuf, new THREE.MeshLambertMaterial({ color: 0x9a978f }), true, true);
[hwTopMesh, hwRampMesh, hwConcMesh].forEach(m => { if (m) camBlockers.push(m); });
