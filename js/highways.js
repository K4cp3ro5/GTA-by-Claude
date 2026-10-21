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
function texHighway(aux){
  const W = 160, H = 384, c = mkCanvas(W,H), g = c.getContext('2d');
  g.fillStyle = '#2f3136'; g.fillRect(0,0,W,H);
  for (let i = 0; i < 170; i++){
    g.fillStyle = 'rgba(' + randInt(22,64) + ',' + randInt(22,64) + ',' + randInt(24,68) + ',0.45)';
    g.beginPath(); g.ellipse(rnd()*W, rnd()*H, rand(1,4), rand(1,3), 0, 0, TAU); g.fill();
  }
  noiseOver(g, W, H, 20);
  const edge = 8, shoulderEnd = 38;
  g.fillStyle = 'rgba(226,224,214,.85)';
  if (!aux){
    g.fillRect(edge, 0, 3, H);               // krawędź zewnętrzna (pobocze) — u = 0 to prawa krawędź jezdni
    g.fillRect(shoulderEnd, 0, 3, H);        // granica pobocza / pasa ruchu
  } else {
    /* obok pas zbierający / wyłączenia: zamiast krawędzi — szeroka linia przerywana (P-6), pobocze staje się pasem */
    for (let k = 0; k < 8; k++) g.fillRect(shoulderEnd - 1, k * H / 8, 5, H / 16);
  }
  g.fillRect(W-6, 0, 3, H);                  // krawędź wewnętrzna (pas rozdziału)
  const laneDivX = shoulderEnd + (W-6-shoulderEnd)/2 - 1.5, period = H/4, dash = period*0.55;
  g.fillStyle = 'rgba(232,230,220,.9)';
  for (let k = 0; k < 4; k++) g.fillRect(laneDivX, k*period + (period-dash)/2, 3, dash);
  return toTex(c);
}
/* łącznica / droga jednopasowa: asfalt z liniami krawędziowymi po obu stronach */
function texRampRoad(aux){
  const W = 128, H = 256, c = mkCanvas(W,H), g = c.getContext('2d');
  g.fillStyle = '#303237'; g.fillRect(0,0,W,H);
  noiseOver(g, W, H, 18);
  g.fillStyle = 'rgba(226,224,214,.85)';
  g.fillRect(7, 0, 4, H);                    // prawa (zewnętrzna) krawędź
  if (!aux) g.fillRect(W - 11, 0, 4, H);     // lewa — brak, gdy pas przylega do jezdni (tam linia przerywana jezdni)
  return toTex(c);
}
/* nos: asfalt z ukośnym kreskowaniem (P-21) */
function texGore(){
  const W = 128, c = mkCanvas(W, W), g = c.getContext('2d');
  g.fillStyle = '#303237'; g.fillRect(0, 0, W, W);
  noiseOver(g, W, W, 18);
  g.strokeStyle = 'rgba(232,230,220,.9)'; g.lineWidth = 14;
  for (let k = -2; k <= 2; k++){ g.beginPath(); g.moveTo(k * W / 2 - W, W); g.lineTo(k * W / 2 + W, -W); g.stroke(); }
  return toTex(c);
}
const hwyLaneTex = texHighway(false), hwyLaneAuxTex = texHighway(true), hwyRampTex = texRampRoad(false), hwyRampAuxTex = texRampRoad(true), hwyGoreTex = texGore();
const hwTopBuf = new GeoBuf(), hwTopAuxBuf = new GeoBuf(), hwRampBuf = new GeoBuf(), hwRampAuxBuf = new GeoBuf(), hwGoreBuf = new GeoBuf(), hwConcBuf = new GeoBuf(), hwCushionBuf = new GeoBuf();
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
  if (side < 0 && w.noBarL){ const dm = (a.d + b.d) / 2; if (w.noBarL.some(r => dm > r[0] - 0.25 && dm < r[1] + 0.25)) return false; }   // nos
  return side > 0 ? w.barR : w.barL;
}
/* odcinek i drogi przylega lewą krawędzią do jezdni (pas zbierający, wyłączenia, włączenia) */
function wayAuxSeg(w, i){
  if (w.kind === 'col') return true;
  return w.kind === 'conn' && (i < w.auxIn - 1 || i >= w.pts.length - w.auxOut);
}
/* styki dróg (pętla z kolektorem, jezdnia z odcinkiem końcowym — pod kątem 1–2°): wspólny kierunek na styku,
   żeby krawędzie końców obu płyt się pokrywały (inaczej między nimi zostawał klin, przez który od spodu widać niebo) */
const HWY_JOIN = new Map();
(function(){
  const ends = [];
  HWY_WAYS.forEach(w => { const P = w.pts, n = P.length; if (n < 2) return;
    ends.push({ w: w, end: false, p: P[0], ox: P[0].x - P[1].x, oz: P[0].z - P[1].z });
    ends.push({ w: w, end: true, p: P[n - 1], ox: P[n - 1].x - P[n - 2].x, oz: P[n - 1].z - P[n - 2].z }); });
  ends.forEach(e => {
    const o = ends.find(q => q.w !== e.w && Math.hypot(q.p.x - e.p.x, q.p.z - e.p.z) < 0.05 && Math.abs((q.p.y || 0) - (e.p.y || 0)) < 0.05 && Math.abs(q.p.hw - e.p.hw) < 0.05);
    if (!o) return;
    const la = Math.hypot(e.ox, e.oz) || 1, lb = Math.hypot(o.ox, o.oz) || 1;
    let dx = e.ox / la - o.ox / lb, dz = e.oz / la - o.oz / lb; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;   // na zewnątrz e
    if (!HWY_JOIN.has(e.w)) HWY_JOIN.set(e.w, {});
    HWY_JOIN.get(e.w)[e.end ? 'end' : 'start'] = e.end ? { x: dx, z: dz } : { x: -dx, z: -dz };   // kierunek jazdy drogi e
  });
})();
function buildWay(w){
  const P = w.pts, n = P.length, isMed = w.kind === 'med', slab = HP.slab, J = HWY_JOIN.get(w) || {};
  const R = P.map((p, i) => {
    const f = i === 0 ? J.start : i === n - 1 ? J.end : null;
    if (f) return { x: -f.z, z: f.x };
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
    const wide = w.tex === 'hwy' || (w.tex === 'term' && (a.hw + b.hw) / 2 > 4);
    const topBuf = isMed ? hwConcBuf : wide ? (w.kind === 'cw' && cwAuxAdj(w.name, (a.s + b.s) / 2) ? hwTopAuxBuf : hwTopBuf) : (wayAuxSeg(w, i) ? hwRampAuxBuf : hwRampBuf);
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
      if (!isMed && s > 0 && w.kind === 'cw' && cwSideOpen(w.name, a.s, b.s)) return;   // styk z pasem obok / nosem (odcinek cały w przerwie — przy nosie ściana zostaje)
      if (!isMed && s < 0 && (wayAuxSeg(w, i) || (w.noBarL && w.noBarL.some(r => (a.d + b.d) / 2 > r[0] && (a.d + b.d) / 2 < r[1])))) return;
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
      /* spód bariery (zewnętrzna ścianka schodzi 0.3 m pod jezdnię) — bez niego od dołu widać przez barierę niebo */
      quadUV(hwConcBuf, [o0a[0], ya - 0.3, o0a[1]], [o0b[0], yb - 0.3, o0b[1]], [o1b[0], yb - 0.3, o1b[1]], [o1a[0], ya - 0.3, o1a[1]], [0,0],[1,0],[1,1],[0,1], [0, -1, 0]);
      quadUV(hwConcBuf, [o0a[0], ya - 0.3, o0a[1]], [o0b[0], yb - 0.3, o0b[1]], [o0b[0], yb, o0b[1]], [o0a[0], ya, o0a[1]], [0,0],[1,0],[1,1],[0,1], inn);
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

/* nosy: nawierzchnia z kreskowaniem między krawędzią jezdni a lewą krawędzią pętli / łącznicy, spód płyty,
   zamknięcie czoła przy amortyzatorze, kolizja; amortyzator (żółty blok) w miejscu, gdzie zaczynają się bariery */
HWY_GORES.forEach(g => {
  const P = g.pts; let u = 0;
  for (let i = 0; i < P.length - 1; i++){
    const a = P[i], b = P[i + 1], l = Math.hypot(b.ex - a.ex, b.ez - a.ez), u1 = u + l / 3;
    const ga = Math.hypot(a.lx - a.ex, a.lz - a.ez) / 3, gb = Math.hypot(b.lx - b.ex, b.lz - b.ez) / 3;
    quadUV(hwGoreBuf, [a.ex, a.y, a.ez], [b.ex, b.y, b.ez], [b.lx, b.y, b.lz], [a.lx, a.y, a.lz], [u, 0], [u1, 0], [u1, gb], [u, ga], [0, 1, 0]);
    if (a.y > FILL_Y) quadUV(hwConcBuf, [a.ex, a.y - HP.slab, a.ez], [b.ex, b.y - HP.slab, b.ez], [b.lx, b.y - HP.slab, b.lz], [a.lx, a.y - HP.slab, a.lz], [0,0],[1,0],[1,1],[0,1], [0, -1, 0]);
    const mx = (a.ex + b.ex + a.lx + b.lx) / 4, mz = (a.ez + b.ez + a.lz + b.lz) / 4, my = (a.y + b.y) / 2, wd = (ga + gb) * 1.5;
    if (wd > 0.05) staticBoxQ(mx, my - 0.25, mz, wd, 0.5, l + 0.1, segQuat(b.ex - a.ex, b.y - a.y, b.ez - a.ez));
    u = u1;
  }
  /* czoło nosa (szczelina 1 m między barierami) i amortyzator */
  const e = P[0].d < P[P.length - 1].d ? P[P.length - 1] : P[0], f = e === P[0] ? P[1] : P[P.length - 2];
  const out = [e.ex - f.ex, 0, e.ez - f.ez];
  quadUV(hwConcBuf, [e.ex, e.y - HP.slab, e.ez], [e.lx, e.y - HP.slab, e.lz], [e.lx, e.y, e.lz], [e.ex, e.y, e.ez], [0,0],[1,0],[1,1],[0,1], out);
  const cx = (e.ex + e.lx) / 2, cz = (e.ez + e.lz) / 2, ol = Math.hypot(out[0], out[2]) || 1;
  const bx = cx - out[0] / ol * 0.7, bz = cz - out[2] / ol * 0.7;
  hwCushionBuf.box(bx, e.y + 0.45, bz, 1.0, 0.9, 1.0, 1, false);
  staticBox(bx, e.y + 0.45, bz, 1.0, 0.9, 1.0);
});

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
/* latarnie na zewnętrznej barierze pętli i łącznic (po zewnętrznej stronie łuku = lewa) co ~40 m */
HWY_RAMPS.forEach(r => {
  const w = r.way;
  for (let d = 20; d < w.len - 15; d += 40){
    const q = wayAt(w, d), i = w.pts.indexOf(q.a);
    if (i < 0 || !wayBarrier(w, Math.min(i, w.pts.length - 2), -1)) continue;
    const hw = lerp(q.a.hw, q.b.hw, q.t) + 0.2;
    lampSpots.push({ x: q.x + q.hz * hw, z: q.z - q.hx * hw, rot: Math.atan2(-q.hz, q.hx), y: q.y + 1.0, gy: q.y + 0.01 });
  }
});
/* ekrany akustyczne (panele 2.5 m na barierze) tam, gdzie jezdnia biegnie obok dzielnicy mieszkalnej */
const hwNoiseBuf = new GeoBuf(), hwPaintBuf = new GeoBuf();   // hwPaintBuf: malowane linie na końcach dróg zjazdowych
['A1+', 'A1-', 'A2+', 'A2-'].forEach(nm => {
  const w = CW[nm];
  for (let i = 0; i < w.pts.length - 1; i++){
    if (!wayBarrier(w, i, 1)) continue;
    const a = w.pts[i], b = w.pts[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z) || 1, rx = -(b.z - a.z) / l, rz = (b.x - a.x) / l;
    const ox = (a.x + b.x) / 2 + rx * 24, oz = (a.z + b.z) / 2 + rz * 24;
    if (Math.abs(ox) > CITY_EDGE - 15 || Math.abs(oz) > CITY_EDGE - 15) continue;
    const bi = Math.floor((ox + HALF) / BLOCK), bj = Math.floor((oz + HALF) / BLOCK);
    if (districtAt(blockCenter(bi), blockCenter(bj)) !== 'residential') continue;
    const o = a.hw + 0.2, A = [a.x + rx * o, a.y + 1.0, a.z + rz * o], B = [b.x + rx * o, b.y + 1.0, b.z + rz * o];
    const A2 = [A[0], A[1] + 2.5, A[2]], B2 = [B[0], B[1] + 2.5, B[2]];
    quadOut(hwNoiseBuf, A, B, B2, A2, [rx, 0, rz]); quadOut(hwNoiseBuf, A, B, B2, A2, [-rx, 0, -rz]);
    hwConcBuf.box(A[0], A[1] + 1.25, A[2], 0.14, 2.5, 0.14, 1, true);
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
/* miejsce na drodze w ≈ d (szukane do ±60 m), gdzie po stronie sd stoi bariera (segment i oba sąsiednie) */
function barrierSpot(w, d, sd){
  for (let k = 0; k <= 60; k++){
    const dd = d + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 2;
    if (dd < 2 || dd > w.len - 2) continue;
    const q = wayAt(w, dd), i = w.pts.indexOf(q.a);
    if (i >= 0 && [i - 1, i, i + 1].every(j => j < 0 || j > w.pts.length - 2 || wayBarrier(w, j, sd))) return dd;
  }
  return null;
}
/* znak przy krawędzi drogi w odległości d:
   - na pomoście / wysokim nasypie (y ≥ 0.6): na koronie bariery (słupek nad barierą, podstawa = góra bariery),
     przy jezdni głównej po lewej — na pasie rozdziału; nigdy nad szczeliną ani poza płytą;
   - na niskim nasypie (0.05 < y < 0.6, bez barier): na poboczu przy krawędzi;
   - na terenie: 1.4 m od krawędzi jezdni.
   side −1 przy drodze jednojezdniowej = znak dla jadących pod prąd (zwrócony w drugą stronę).
   Na autostradzie (pomost) tarcze „duże” (×1.3). */
function hwySignAt(w, d, faces, opt, side){
  const sd = side || 1;
  let q = wayAt(w, d);
  if (q.y >= 0.6){
    const med = w.kind === 'cw' && sd < 0;
    if (!med){ const dd = barrierSpot(w, d, sd); if (dd === null) return; q = wayAt(w, dd); }
    const hw = lerp(q.a.hw, q.b.hw, q.t), o = med ? -(hw + 1.0) : sd * (hw + 0.2);
    const rot = (sd > 0 || med) ? Math.atan2(-q.hx, -q.hz) : Math.atan2(q.hx, q.hz);
    const big = faces.map(f => f.kind === 'autostrada' ? f : scaleFace(f, 1.3));
    placeSign(q.x - q.hz * o, q.z + q.hx * o, rot, big, Object.assign({ base: q.y + (med ? 0.9 : 1.0), bottom: 1.3 }, opt || {}));
    return;
  }
  const up = q.y > 0.05, hw = lerp(q.a.hw, q.b.hw, q.t);
  const o = sd * (up ? hw - 0.35 : hw + 1.4);
  const rot = sd > 0 ? Math.atan2(-q.hx, -q.hz) : Math.atan2(q.hx, q.hz);
  placeSign(q.x - q.hz * o, q.z + q.hx * o, rot, faces, Object.assign({ base: up ? q.y : 0 }, opt || {}));
}
/* tablica kierunkowa na bramownicy nad jezdnią główną: słup na barierze zewnętrznej i słup na pasie rozdziału,
   rygiel nad pasami, tablica nad środkiem pasów z prześwitem 5.6 m */
function hwyBoard(w, d, lines, num){
  const dd = barrierSpot(w, d, 1); if (dd === null) return;
  const q = wayAt(w, dd), hw = lerp(q.a.hw, q.b.hw, q.t), rot = Math.atan2(-q.hx, -q.hz);
  const at = o => [q.x - q.hz * o, q.z + q.hx * o];
  const R = at(hw + 0.2), Lp = at(-(hw + 1.0)), B = at((HP.laneR + HP.laneL) / 2);
  const face = signFace('autostrada', texHwySign(lines, num), shapeRect(3.4, 2.1));
  const yTop = q.y + 5.6 + 2.1 + 0.25, cy = q.y + 5.6 + 1.05;
  signPole(R[0], R[1], q.y + 1.0, yTop + 0.2, 0.16);
  signPole(Lp[0], Lp[1], q.y + 0.9, yTop + 0.2, 0.16);
  const mx = (R[0] + Lp[0]) / 2, mz = (R[1] + Lp[1]) / 2, span = Math.hypot(R[0] - Lp[0], R[1] - Lp[1]);
  signPoleBuf.boxRot(mx, yTop, mz, span + 0.3, 0.35, 0.3, rot, 1, true);
  signPanel(signXf(B[0], B[1], rot), face, cy, 0.18);
  signLog.push({ kind: 'autostrada', x: B[0], z: B[1], rot: rot });
  signGeomLog.push({ x: B[0], z: B[1], poleTop: cy, faceBottom: cy - 1.05, faceTop: cy + 1.05, poleFront: 0, backZ: 0.17, kind: 'bramownica',
                     poles: [{ x: R[0], z: R[1], base: q.y + 1.0 }, { x: Lp[0], z: Lp[1], base: q.y + 0.9 }] });
}
const exitCornerOf = cw => HWY_TERM.find(t => t.exitCw === cw).k;
HWY_TERM.forEach(t => {
  const ex = t.exit, en = t.entry, arcLen = (Math.PI * 3 / 4) * HP.termR;
  /* wjazd z miasta: D-43 (koniec obszaru zabudowanego), D-9 (autostrada), B-33 100 po wjeździe na jezdnię główną */
  hwySignAt(en, 10, [FACE.D43()]);
  hwySignAt(en, 24, [FACE.B9()]);                                          // zakaz wjazdu rowerów (rower gracza zawraca na rampie)
  hwySignAt(en, en.len - arcLen - 18, [FACE.D9()]);
  hwySignAt(CW[t.entryCw], 40, [FACE.B33(100)]);
  hwySignAt(CW[t.entryCw], 40, [FACE.B33(100)], null, -1);                 // B-33 po obu stronach jezdni
  /* zjazd do miasta: D-10 (koniec autostrady) na dole łuku, B-33 50, B-33 40 przed łukiem R=25, D-42 przed miastem */
  hwySignAt(ex, arcLen + 3, [FACE.D10()]);
  hwySignAt(ex, arcLen + 16, [FACE.B33(50)]);
  hwySignAt(ex, ex.len - 120, [FACE.B33(40)]);
  hwySignAt(ex, ex.len - 14, [FACE.D42()]);
  hwySignAt(ex, ex.len - 5, [FACE.A7()]);                                    // ustąp pierwszeństwa przy wyjeździe na obwodnicę
  /* koniec zjazdu przy obwodnicy: linia ustąpienia pierwszeństwa (P-13, kreski 0.6 m) przez cały pas */
  {
    const q = wayAt(ex, ex.len - 1.2), rx = -q.hz, rz = q.hx, hw = 3.5 - 0.3;
    for (let o = -hw; o < hw - 0.3; o += 1.2){
      const x0 = q.x + rx * o, z0 = q.z + rz * o, x1 = x0 + rx * 0.6, z1 = z0 + rz * 0.6, nx = -(z1 - z0) / 0.6 * 0.15, nz = (x1 - x0) / 0.6 * 0.15, yy = 0.03;
      hwPaintBuf.quad([x0 - nx, yy, z0 - nz], [x0 + nx, yy, z0 + nz], [x1 + nx, yy, z1 + nz], [x1 - nx, yy, z1 - nz], [0,0],[1,0],[1,1],[0,1]);
    }
  }
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
  hwySignAt(loop.way, 12, [FACE.B33(50)]);
});
/* drogowskaz w rozwidleniu: na nosie (przed amortyzatorem) — kierunek pętli / łącznicy */
HWY_GORES.forEach(g => {
  const r = HWY_RAMPS.find(x => x.way.idx === g.wi); if (!r || r.from !== g.cw) return;          // tylko rozdzielenia
  const e = g.pts[g.pts.length - 1], f = g.pts[Math.max(0, g.pts.length - 4)];
  const x = (e.ex + e.lx) / 2 * 0.0 + (f.ex + f.lx) / 2, z = (f.ez + f.lz) / 2;
  const hx = e.ex - f.ex, hz = e.ez - f.ez, l = Math.hypot(hx, hz) || 1;
  const face = signFace('drogowskaz', texHwySign([HWY_CORNER_NAMES[exitCornerOf(r.to)]], r.to.slice(0, 2)), shapeRect(1.6, 1.0));
  placeSign(x, z, Math.atan2(-hx / l, -hz / l), [face], { base: f.y, bottom: 1.0, poleR: 0.05 });
});

/* minimapa: wszystkie drogi autostrad (jaśniej = wiadukt) */
HWY_WAYS.forEach(w => {
  const pts = w.pts.filter((p, i) => i % 3 === 0 || i === w.pts.length - 1).map(p => [p.x, p.z]);
  const hw = w.pts.reduce((s, p) => s + p.hw, 0) / w.pts.length;
  mapExtras.push({ t: 'line', pts: pts, w: 2 * hw, c: w.pts.some(p => p.y > 1) ? '#4a5060' : '#2b2e35' });
});

/* --- scalenie; nawierzchnie i beton zasłaniają kamerę (nie przechodzi przez płytę) --- */
const hwTopMesh  = addMerged(hwTopBuf,  new THREE.MeshLambertMaterial({ map: hwyLaneTex, color: 0xbcbcbc }), false, true);
const hwTopAuxMesh = addMerged(hwTopAuxBuf, new THREE.MeshLambertMaterial({ map: hwyLaneAuxTex, color: 0xbcbcbc }), false, true);
const hwRampMesh = addMerged(hwRampBuf, new THREE.MeshLambertMaterial({ map: hwyRampTex, color: 0xbcbcbc }), false, true);
const hwRampAuxMesh = addMerged(hwRampAuxBuf, new THREE.MeshLambertMaterial({ map: hwyRampAuxTex, color: 0xbcbcbc }), false, true);
const hwGoreMesh = addMerged(hwGoreBuf, new THREE.MeshLambertMaterial({ map: hwyGoreTex, color: 0xbcbcbc }), false, true);
const hwConcMesh = addMerged(hwConcBuf, new THREE.MeshLambertMaterial({ color: 0x9a978f }), true, true);
addMerged(hwPaintBuf, new THREE.MeshLambertMaterial({ color: 0xeeeeea }), false, true);
addMerged(hwCushionBuf, new THREE.MeshLambertMaterial({ color: 0xe8b81c }), true, true);
addMerged(hwNoiseBuf, new THREE.MeshLambertMaterial({ color: 0x9cc6d8, transparent: true, opacity: 0.38, depthWrite: false }), false, false);
[hwTopMesh, hwTopAuxMesh, hwRampMesh, hwRampAuxMesh, hwGoreMesh, hwConcMesh].forEach(m => { if (m) camBlockers.push(m); });
