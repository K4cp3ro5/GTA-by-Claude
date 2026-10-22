/* ---------------------------------------------------------------
   19b. NAWIGACJA I MAPA — pełna mapa (M): przesuwanie (LPM), przybliżanie (kółko), prawy klik = znacznik
   celu (fioletowy, jak w GTA V); trasa: autem i pieszo po drogach (graf ulic siatki + dojazdy do szpitala,
   portu i dróg wysepki; autem z poszanowaniem jednokierunkowej obwodnicy), między wyspami przez przystanie
   (odcinek wodny), samolotem i łodzią w linii prostej. Trasa na minimapie i dużej mapie, słup znacznika w świecie.
   --------------------------------------------------------------- */
const NAV = { nodes: [], adj: [], edges: [], built: false };
let waypoint = null, navRoute = [], _navT = 0, mapOpen = false;
function navBuild(){
  if (NAV.built) return; NAV.built = true;
  const add = (x, z, isl) => { NAV.nodes.push({ x: x, z: z, isl: isl }); NAV.adj.push([]); return NAV.nodes.length - 1; };
  /* a → b zawsze dozwolone; b → a autem tylko, gdy !oneway */
  const edge = (a, b, oneway) => {
    const l = Math.hypot(NAV.nodes[a].x - NAV.nodes[b].x, NAV.nodes[a].z - NAV.nodes[b].z);
    NAV.adj[a].push({ to: b, l: l, car: true }); NAV.adj[b].push({ to: a, l: l, car: !oneway });
    NAV.edges.push({ a: a, b: b, oneway: !!oneway, l: l });
  };
  const id = (i, j) => i * (GRID + 1) + j;
  for (let i = 0; i <= GRID; i++) for (let j = 0; j <= GRID; j++) add(L(i), L(j), 'main');
  for (let i = 0; i <= GRID; i++) for (let j = 0; j <= GRID; j++){
    if (i < GRID){                                    // odcinki wschód–zachód (j=0 jednokierunkowo na wschód, j=GRID na zachód)
      if (j === GRID) edge(id(i + 1, j), id(i, j), true);
      else edge(id(i, j), id(i + 1, j), j === 0);
    }
    if (j < GRID){                                    // północ–południe (i=GRID na południe, i=0 na północ)
      if (i === 0) edge(id(i, j + 1), id(i, j), true);
      else edge(id(i, j), id(i, j + 1), i === GRID);
    }
  }
  const H = add(HOSPITAL.access.x, HOSPITAL.front.z, 'main'); edge(id(4, GRID), H);
  const H2 = add(HOSPITAL_SPAWN.x, HOSPITAL.front.z, 'main'); edge(H, H2);
  const P = add(PORTS.main.x, PORTS.main.z, 'main'); edge(id(5, 0), P);
  const AW = add(AIRPORT_W.front.x, AIRPORT_W.access.z, 'main'); edge(id(0, 6), AW);                        // lotnisko miejskie
  const AW2 = add(AIRPORT_W.front.x, AIRPORT_W.term.z0, 'main'); edge(AW, AW2);
  const A0 = add(PORTS.airport.x, PORTS.airport.z, 'airport'), A1 = add(AIRPORT.access.x, AIRPORT.front.z, 'airport'), A2 = add(AIRPORT.front.x1, AIRPORT.front.z, 'airport');
  edge(A0, A1); edge(A1, A2);
  NAV.port = { main: P, airport: A0 };
}
/* najbliższy punkt na odcinku grafu (na tej samej wyspie) */
function navProject(x, z, isl){
  let best = null;
  for (const e of NAV.edges){
    const a = NAV.nodes[e.a], b = NAV.nodes[e.b]; if (a.isl !== isl) continue;
    const vx = b.x - a.x, vz = b.z - a.z, l2 = vx * vx + vz * vz || 1, t = clamp(((x - a.x) * vx + (z - a.z) * vz) / l2, 0, 1);
    const px = a.x + vx * t, pz = a.z + vz * t, d = Math.hypot(x - px, z - pz);
    if (!best || d < best.d) best = { e: e, t: t, x: px, z: pz, d: d };
  }
  return best;
}
/* trasa po drogach z (x0,z0) do (x1,z1) na jednej wyspie; car — z kierunkami jednokierunkowych */
function navRoadRoute(x0, z0, x1, z1, isl, car){
  const s = navProject(x0, z0, isl), e = navProject(x1, z1, isl);
  if (!s || !e) return [[x0, z0], [x1, z1]];
  const head = [[x0, z0], [s.x, s.z]], tail = [[e.x, e.z], [x1, z1]];
  if (s.e === e.e && (!car || !s.e.oneway || e.t >= s.t)) return head.concat(tail);       // ten sam odcinek, dozwolony kierunek
  const N = NAV.nodes.length, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  dist[s.e.b] = (1 - s.t) * s.e.l;                                                         // ze startu do b (kierunek a → b — zawsze)
  if (!car || !s.e.oneway) dist[s.e.a] = Math.min(dist[s.e.a], s.t * s.e.l);              // do a (pod prąd jednokierunkowej — nie autem)
  for (;;){
    let u = -1, m = Infinity;
    for (let i = 0; i < N; i++) if (!done[i] && dist[i] < m){ m = dist[i]; u = i; }
    if (u < 0) break;
    done[u] = 1;
    for (const r of NAV.adj[u]){ if (car && !r.car) continue; const nd = dist[u] + r.l; if (nd < dist[r.to]){ dist[r.to] = nd; prev[r.to] = u; } }
  }
  const ca = dist[e.e.a] + e.t * e.e.l, cb = (!car || !e.e.oneway) ? dist[e.e.b] + (1 - e.t) * e.e.l : Infinity;
  let last = ca <= cb ? e.e.a : e.e.b;
  if (!isFinite(Math.min(ca, cb))) return [[x0, z0], [x1, z1]];
  const chain = []; for (let u = last; u >= 0; u = prev[u]) chain.unshift([NAV.nodes[u].x, NAV.nodes[u].z]);
  return head.concat(chain, tail);
}
function navCompute(){
  navBuild();
  if (!waypoint){ navRoute = []; return; }
  const p = playerWorldPos(), wx = waypoint.x, wz = waypoint.z;
  if (mode === 'plane' || mode === 'boat'){ navRoute = [[p.x, p.z], [wx, wz]]; return; }
  const car = mode === 'car', si = islandAt(p.x, p.z), di = islandAt(wx, wz);
  if (!si){ navRoute = [[p.x, p.z], [wx, wz]]; return; }
  if (di && di.name === si.name){ navRoute = navRoadRoute(p.x, p.z, wx, wz, si.name, car); return; }
  /* inna wyspa (albo cel na wodzie): drogą do przystani, łodzią do przystani celu, dalej drogą */
  const ps = NAV.nodes[NAV.port[si.name]], r1 = navRoadRoute(p.x, p.z, ps.x, ps.z, si.name, car);
  if (!di){ navRoute = r1.concat([[wx, wz]]); return; }
  const pd = NAV.nodes[NAV.port[di.name]];
  navRoute = r1.concat(navRoadRoute(pd.x, pd.z, wx, wz, di.name, car));
}
/* słup znacznika celu w świecie (widoczny z daleka) */
const navBeam = new THREE.Group();
(function(){
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 160, 14, 1, true), new THREE.MeshBasicMaterial({ color: 0xc04ce6, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  beam.position.y = 80; navBeam.add(beam);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.2, 28), new THREE.MeshBasicMaterial({ color: 0xc04ce6, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15; navBeam.add(ring);
  navBeam.visible = false; scene.add(navBeam);
})();
function setWaypoint(x, z){
  waypoint = x === null ? null : { x: x, z: z };
  if (waypoint){ const g = groundAt(x, z, 200); navBeam.position.set(x, g === null ? (isLand(x, z) ? 0 : WATER_Y) : Math.max(g, WATER_Y), z); }
  navBeam.visible = !!waypoint;
  navCompute();
  if (mapOpen) drawBigMap();
}
function navUpdate(dt){
  if (!waypoint) return;
  _navT -= dt;
  if (_navT <= 0){ _navT = 0.4; navCompute(); }
  const p = playerWorldPos();
  if (Math.hypot(p.x - waypoint.x, p.z - waypoint.z) < (mode === 'plane' ? 150 : mode === 'car' || mode === 'boat' ? 35 : 25)){ setWaypoint(null); hudToast('Dotarłeś do celu'); }
}
/* trasa i znacznik na minimapie (znacznik poza kadrem — przy krawędzi) */
function navDrawMinimap(g, toMap, MM){
  if (!waypoint) return;
  if (navRoute.length > 1){
    const line = (w, c) => { g.lineWidth = w; g.strokeStyle = c; g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath(); navRoute.forEach((q, k) => { const m = toMap(q[0], q[1]); k ? g.lineTo(m[0], m[1]) : g.moveTo(m[0], m[1]); }); g.stroke(); };
    line(6, 'rgba(20,10,30,.6)'); line(3.5, '#c04ce6');
  }
  let m = toMap(waypoint.x, waypoint.z);
  const c = MM / 2, dx = m[0] - c, dz = m[1] - c, lim = MM / 2 - 8, k = Math.max(Math.abs(dx), Math.abs(dz)) / lim;
  if (k > 1) m = [c + dx / k, c + dz / k];
  navPin(g, m[0], m[1], 1);
}
function navPin(g, x, y, s){
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = '#c04ce6'; g.strokeStyle = '#fff'; g.lineWidth = 2;
  g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 2, 0, TAU); g.fill();
  g.restore();
}

/* --- pełna mapa (M) --- */
const bigEl = document.getElementById('bigmap'), bigCv = document.getElementById('bigmapCv'), bigG = bigCv.getContext('2d');
const BIG = { cx: 0, cz: 0, s: 1, drag: null };
const MAP_LABELS = [['PORT', () => [PORTS.main.x + 60, PORTS.main.z + 30]], ['LOTNISKO', () => [0, AIRPORT.runway.z - 30]], ['LOTNISKO', () => [AIRPORT_W.apron.x0, AIRPORT_W.runway.z0 - 14]], ['PRZYSTAŃ', () => [PORTS.airport.x, PORTS.airport.z + 26]],
                    ['SZPITAL', () => [HOSPITAL_SPAWN.x, HOSPITAL.main.z1 + 14]], ['WĘZEŁ A1/A2', () => [0, 30]], ['PARK ROZRYWKI', () => [PARK.boulX, 30]]];
function openMap(){
  if (mapOpen) return;
  mapOpen = true;
  const W = window.innerWidth, H = window.innerHeight;
  BIG.s = Math.min(W / MAP_W, H / MAP_H) * 0.92; BIG.cx = MAP_X0 + MAP_W / 2; BIG.cz = MAP_Z0 + MAP_H / 2;   // cały świat w kadrze
  bigEl.classList.add('on');
  for (const k in keys) keys[k] = false;
  if (pointerLocked) document.exitPointerLock();
  navCompute(); drawBigMap();
}
function closeMap(relock){
  if (!mapOpen) return;
  mapOpen = false; bigEl.classList.remove('on');
  if (relock) lockPointer();
  gate.classList.toggle('hidden', pointerLocked);
}
function bigToScreen(x, z){ return [(x - BIG.cx) * BIG.s + bigCv.width / 2, (z - BIG.cz) * BIG.s + bigCv.height / 2]; }
function bigToWorld(sx, sy){ return [(sx - bigCv.width / 2) / BIG.s + BIG.cx, (sy - bigCv.height / 2) / BIG.s + BIG.cz]; }
function drawBigMap(){
  const W = window.innerWidth, H = window.innerHeight;
  if (bigCv.width !== W || bigCv.height !== H){ bigCv.width = W; bigCv.height = H; }
  const g = bigG;
  g.fillStyle = '#16384b'; g.fillRect(0, 0, W, H);
  const o = bigToScreen(MAP_X0, MAP_Z0);
  g.imageSmoothingEnabled = true; g.drawImage(mapStatic, o[0], o[1], MAP_W * BIG.s, MAP_H * BIG.s);
  /* trasa */
  if (waypoint && navRoute.length > 1){
    const line = (w, c) => { g.lineWidth = w; g.strokeStyle = c; g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath(); navRoute.forEach((q, k) => { const m = bigToScreen(q[0], q[1]); k ? g.lineTo(m[0], m[1]) : g.moveTo(m[0], m[1]); }); g.stroke(); };
    line(8, 'rgba(20,10,30,.55)'); line(4.5, '#c04ce6');
  }
  /* podpisy miejsc */
  g.font = '600 12px Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  MAP_LABELS.forEach(([t, f]) => { const q = f(), m = bigToScreen(q[0], q[1]); g.fillStyle = 'rgba(10,12,16,.65)'; const w = g.measureText(t).width + 10; g.fillRect(m[0] - w / 2, m[1] - 9, w, 18); g.fillStyle = '#e9e7e1'; g.fillText(t, m[0], m[1]); });
  /* łodzie, samoloty, twoje auto */
  for (const b of boats){ const m = bigToScreen(b.pos.x, b.pos.z); g.fillStyle = '#7fc4e8'; g.fillRect(m[0] - 2.5, m[1] - 2.5, 5, 5); }
  for (const c of CATS){ if (c.dead) continue; const m = bigToScreen(c.x, c.z); g.fillStyle = c.fedT > clock ? '#ff7aa2' : '#ff9d2e'; g.beginPath(); g.arc(m[0], m[1], 2.6, 0, TAU); g.fill(); }
  for (const a of airPlanes){ const m = bigToScreen(a.pos.x, a.pos.z); g.save(); g.translate(m[0], m[1]); g.rotate(-a.heading + Math.PI); g.fillStyle = '#cfe3ee'; g.fillRect(-1.3, -6, 2.6, 12); g.fillRect(-6, -1.4, 12, 2.8); g.restore(); }
  for (const q of planes){ if (q.wreckT > 0 || q === curPlane) continue; const m = bigToScreen(q.pos.x, q.pos.z); g.fillStyle = '#f2f0ea'; g.beginPath(); g.arc(m[0], m[1], 3, 0, TAU); g.fill(); }
  const own = driving.owner === 'player' && mode !== 'car' ? chassisBody.position : (parkedCars.find(q => q.owner === 'player') || null);
  if (own){ const m = bigToScreen(own.x, own.z); g.fillStyle = '#4aa3ff'; g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.fillRect(m[0] - 4, m[1] - 4, 8, 8); g.strokeRect(m[0] - 4, m[1] - 4, 8, 8); }
  /* gracz (strzałka wg kierunku) */
  const p = playerWorldPos(), pm = bigToScreen(p.x, p.z);
  const hd = mode === 'car' ? carYaw() : mode === 'boat' && curBoat ? curBoat.heading : mode === 'plane' && curPlane ? (_cpF.set(0, 0, 1).applyQuaternion(curPlane.quat), Math.atan2(_cpF.x, _cpF.z)) : player.facing;
  g.save(); g.translate(pm[0], pm[1]); g.rotate(-hd + Math.PI);
  g.fillStyle = '#f2f0ea'; g.strokeStyle = '#111'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, -9); g.lineTo(6.5, 7); g.lineTo(0, 3); g.lineTo(-6.5, 7); g.closePath(); g.fill(); g.stroke();
  g.restore();
  if (waypoint){ const m = bigToScreen(waypoint.x, waypoint.z); navPin(g, m[0], m[1], 1.4); }
  /* podpowiedź */
  g.font = '500 12px Helvetica, Arial, sans-serif'; g.textAlign = 'left';
  const tip = 'PPM — ustaw / usuń cel   ·   kółko — przybliż   ·   LPM + przeciągnij — przesuń   ·   M / Esc — zamknij';
  g.fillStyle = 'rgba(10,12,16,.7)'; g.fillRect(16, H - 40, g.measureText(tip).width + 20, 26); g.fillStyle = '#e9e7e1'; g.fillText(tip, 26, H - 27);
  g.font = '200 26px Helvetica, Arial, sans-serif'; g.fillStyle = '#f2f0ea'; g.fillText('MAPA', 18, 34);
}
bigCv.addEventListener('contextmenu', e => {
  e.preventDefault();
  const w = bigToWorld(e.offsetX, e.offsetY);
  if (waypoint){ const m = bigToScreen(waypoint.x, waypoint.z); if (Math.hypot(m[0] - e.offsetX, m[1] - e.offsetY) < 14){ setWaypoint(null); return; } }
  if (w[0] < MAP_X0 || w[0] > MAP_X0 + MAP_W || w[1] < MAP_Z0 || w[1] > MAP_Z0 + MAP_H) return;
  setWaypoint(w[0], w[1]);
});
bigCv.addEventListener('mousedown', e => { if (e.button === 0) BIG.drag = { x: e.clientX, y: e.clientY, cx: BIG.cx, cz: BIG.cz }; });
window.addEventListener('mouseup', () => { BIG.drag = null; });
window.addEventListener('mousemove', e => {
  if (!mapOpen || !BIG.drag) return;
  BIG.cx = clamp(BIG.drag.cx - (e.clientX - BIG.drag.x) / BIG.s, MAP_X0, MAP_X0 + MAP_W);
  BIG.cz = clamp(BIG.drag.cz - (e.clientY - BIG.drag.y) / BIG.s, MAP_Z0, MAP_Z0 + MAP_H);
  drawBigMap();
});
bigCv.addEventListener('wheel', e => {
  e.preventDefault();
  const before = bigToWorld(e.offsetX, e.offsetY), fit = Math.min(window.innerWidth / MAP_W, window.innerHeight / MAP_H) * 0.92;
  BIG.s = clamp(BIG.s * (e.deltaY > 0 ? 0.85 : 1.18), fit * 0.8, fit * 7);
  const after = bigToWorld(e.offsetX, e.offsetY);
  BIG.cx += before[0] - after[0]; BIG.cz += before[1] - after[1];
  drawBigMap();
}, { passive: false });
window.addEventListener('resize', () => { if (mapOpen) drawBigMap(); });
