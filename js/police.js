/* ---------------------------------------------------------------
   14g. POLICJA I POSZUKIWANIE (gwiazdki jak w GTA V)
   - Niewidoczny licznik „agro” (WANTED.agro) rośnie za przestępstwa (policeCrime): zabójstwa i potrącenia pieszych,
     wybuchy i zniszczone pojazdy (RPG), atak na policję, zabicie policjanta, zniszczony radiowóz / helikopter, strzały
     przy policji, kradzież radiowozu, skrzywdzony kot (tryb bez śmierci gracza: +próg 3 gwiazdek). Progi WANTED_T dają
     0–5 gwiazdek i szóstą, dużą.
   - Jednostki: radiowozy (mały — sedan, duży — pickup) jako auta NPC z polem `cop` (patrol: zwykła jazda po pętli;
     pościg / szukanie / odjazd: policeCarStep — trasa po grafie ulic NAV, na końcu wprost, omijanie aut, próby PIT),
     policjanci pieszo (COPS — wysiadają, gdy gracz pieszo albo stoi; przy 1–2 gwiazdkach tylko zatrzymują, od 3 strzelają,
     zawsze poza autem), helikoptery tylko w pościgu (od 4 gwiazdek: 1, 5: 2, 6: 3 — najwyżej 3; strzelec od 5, zrzut policjantów na linach przy 6).
   - Poziomy: radiowozy jeżdżą po grafie z poziomami (ulice + rampy i jezdnie autostrad, PGRAPH), policjant zatrzymuje i ściga pieszo
     tylko gracza na swoim poziomie (gracz na wiadukcie nad nim — wraca do radiowozu, który dojedzie rampą).
   - Wzrok: stożki (radiowóz z załogą, policjant, helikopter — krąg pod sobą) + promień widoczności (ściany, dachy, pomosty
     zasłaniają); w kontenerze gracza nie widać, chyba że policjant go sprawdzi (albo widział, jak wchodził).
   - Fazy: pościg (widzą) → szukanie (nie widzą > 3 s: wszyscy jadą w ostatnie znane miejsce, policjanci wysiadają i
     przeczesują okolicę) → po czasie bez wykrycia gwiazdki znikają, jednostki wracają do patrolu.
   - Zatrzymanie: policjant tuż przy graczu stojącym / idącym (albo przy drzwiach stojącego auta) — ekran ZATRZYMANY,
     wyjście przed komisariatem; śmierć — szpital (jak zawsze).
   --------------------------------------------------------------- */
const WANTED_T = [0, 8, 24, 48, 85, 135, 200];
const WANTED = { agro: 0, stars: 0, seen: false, phase: 'none', unseenT: 0, searchT: 0, searchMax: 0, last: { x: 0, y: 0, z: 0, gy: 0 }, reportT: 0, flashT: 0, bust: 0 };
let policeOn = true, catDeathMode = false;
const POLICE_PATROL_N = 5, POLICE_CAR_MAX = 10, WANT_CARS = [0, 2, 3, 4, 5, 6, 7];
const CRIME_PTS = { 'zabójstwo': 10, 'potrącenie': 3, 'atak na policję': 14, 'zabicie policjanta': 25, 'radiowóz': 35, 'helikopter': 60, 'wybuch': 6, 'auto': 8, 'kradzież radiowozu': 15, 'kradzież helikoptera': 30 };
const COPS = [];
const POLICE = { heli: [], dispatchT: 0, patrolT: 0, visT: 0, sirenD: 1e9, heliT: 0 };
const _pv = { x: 0, y: 0, z: 0 };

function wantedStarsOf(a){ let s = 0; for (let k = 1; k < WANTED_T.length; k++) if (a >= WANTED_T[k]) s = k; return s; }
/* gdzie jest gracz (pieszo, w pojeździe, w kontenerze) i jak szybko się porusza */
function policeTarget(){
  const o = _pv;
  /* gy — poziom (podłoże pod graczem): ulica ≈ 0, wiadukt ≈ 7–14 m; policja porównuje go ze swoim poziomem */
  if (player.hiding){ o.x = player.hiding.x; o.y = player.hiding.y + 0.7; o.z = player.hiding.z; o.gy = player.hiding.y; o.vx = 0; o.vz = 0; o.car = false; return o; }
  if (mode === 'car' && !activeCarGone){ const p = chassisBody.position, v = chassisBody.velocity; o.x = p.x; o.y = p.y + 0.3; o.z = p.z; o.gy = p.y - CAR_TYPES[carType].restY; o.vx = v.x; o.vz = v.z; o.car = true; return o; }
  if (mode === 'heli' && curHeli){ o.x = curHeli.pos.x; o.y = curHeli.pos.y; o.z = curHeli.pos.z; o.gy = curHeli.pos.y - HELI_T.skid; o.vx = curHeli.vel.x; o.vz = curHeli.vel.z; o.car = false; return o; }
  if (mode === 'plane' || mode === 'boat' || mode === 'ride'){ const p = playerWorldPos(); o.x = p.x; o.y = (p.y || 0) + 1; o.z = p.z; o.gy = mode === 'boat' ? WATER_Y : (p.y || 0); o.vx = 0; o.vz = 0; o.car = false; return o; }
  const p = player.body.position, v = player.body.velocity; o.x = p.x; o.y = p.y + 0.4; o.z = p.z; o.gy = p.y - 0.9; o.vx = v.x; o.vz = v.z; o.car = false; return o;
}

/* --- przestępstwa --- */
function policeCrime(kind, x, z, pts){
  if (!policeOn || player.dead) return;
  let p = pts !== undefined ? pts : (CRIME_PTS[kind] || 5);
  if (kind === 'strzały'){ if (!policeNear(x, z, 70) || WANTED.agro >= WANTED_T[1]) return; p = WANTED_T[1] - WANTED.agro; }
  WANTED.agro = Math.min(WANTED.agro + p, WANTED_T[6] + 80);
  const s = wantedStarsOf(WANTED.agro);
  if (s > WANTED.stars){ WANTED.stars = s; WANTED.flashT = 1.6; if (s === 6) hudToast('SZEŚĆ GWIAZDEK — helikopter policji rusza w pościg!', 3.5); }
  if (WANTED.stars > 0){
    const t = policeTarget();
    WANTED.reportT = 2.5; WANTED.last.x = t.x; WANTED.last.y = t.y; WANTED.last.z = t.z; WANTED.last.gy = t.gy;   // zgłoszenie: policja wie, gdzie jesteś
    if (WANTED.phase === 'none') WANTED.phase = 'chase';
    POLICE.dispatchT = 0;
  }
}
function policeNear(x, z, r){
  for (const n of npcs) if (n.cop && n.cop.crew > 0 && Math.hypot(n.pos.x - x, n.pos.y - z) < r) return true;
  for (const c of COPS) if (c.state !== 'down' && Math.hypot(c.pos.x - x, c.pos.y - z) < r) return true;
  return false;
}
function wantedClear(msg){
  const had = WANTED.stars > 0;
  WANTED.agro = 0; WANTED.stars = 0; WANTED.phase = 'none'; WANTED.seen = false; WANTED.bust = 0; WANTED.reportT = 0;
  for (const b of HIDE_BINS) b.suspect = false;
  for (const n of npcs){ const C = n.cop; if (!C || C.role === 'patrol' || C.role === 'empty') continue; if (COPS.some(c => c.car === n && c.state !== 'down')) C.role = 'wait'; else if (C.crew > 0) policeCarLeave(n); else C.role = 'empty'; }
  for (const c of COPS) if (c.state !== 'down') c.state = 'return';
  for (const h of POLICE.heli) if (h.ai) h.ai.role = 'leave';
  if (had && msg) hudToast(msg, 3);
}

/* --- radiowozy --- */
const POLICE_KINDS = { small: { type: 'sedan', crew: 2, color: 0xf2f2ef, stripe: 0x1d3fa0 }, big: { type: 'pickup', crew: 3, color: 0x1f2a44, stripe: 0xf2f2ef } };
const _copTex = heliTextTex('POLICJA');
function policeDecorate(n){
  const K = POLICE_KINDS[n.cop.kind], T = CAR_TYPES[n.type];
  const roof = carParts(n.type).filter(q => q[3] === 'paint').reduce((a, q) => q[5] + q[1] / 2 > a[5] + a[1] / 2 ? q : a), top = roof[5] + roof[1] / 2;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.14, 0.38), new THREE.MeshLambertMaterial({ color: 0x22262e })); bar.position.set(0, top + 0.07, roof[6]); n.mesh.add(bar);
  const red = new THREE.MeshBasicMaterial({ color: 0x4a0a0a }), blue = new THREE.MeshBasicMaterial({ color: 0x0a144a });
  const lr = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), red), lb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), blue);
  lr.position.set(0.33, top + 0.19, roof[6]); lb.position.set(-0.33, top + 0.19, roof[6]); n.mesh.add(lr); n.mesh.add(lb);
  const sy = n.type === 'pickup' ? 1.0 : 0.66;
  for (const s of [-1, 1]){
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, T.half[2] * 1.7), new THREE.MeshLambertMaterial({ color: K.stripe })); st.position.set(s * (T.half[0] + 0.02), sy, 0); n.mesh.add(st);
    const tx = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.32), new THREE.MeshLambertMaterial({ map: _copTex })); tx.position.set(s * (T.half[0] + 0.04), sy + 0.3, 0.1); tx.rotation.y = s * Math.PI / 2; n.mesh.add(tx);
  }
  n.cop.red = red; n.cop.blue = blue;
}
/* auto NPC staje się radiowozem (model w barwach policji, bez profilu pirata) */
function policify(n, kind, role){
  const K = POLICE_KINDS[kind];
  n.cop = { kind: kind, role: role || 'patrol', crew: K.crew, route: null, ri: 0, routeT: 0, goal: null, pitT: 0, pitCool: 0, stuckT: 0, gyT: 0, lat: 0, leaveTo: null, deployed: false };
  n.profile = 'policja'; n.obey = 1; n.color = K.color; n.hwyF = 1; n.gapX = 0; n.react = 0.2;
  const old = n.mesh; n.mesh = buildNpcModel(K.color, n.type); n.mesh.position.copy(old.position); n.mesh.quaternion.copy(old.quaternion); scene.remove(old);
  n.indMeshes = addIndicators(n.mesh, n.type);
  policeDecorate(n);
  return n;
}
function spawnPolicePatrol(){
  const pp = playerWorldPos(), city = LOOPS.filter(P => !P.hwyRoute && !P.some(q => q.rb !== undefined));
  for (let t = 0; t < 30; t++){
    const P = city[randInt(0, city.length - 1)], sp = pathSpot(P, rnd()), a = P[sp.idx], b = P[(sp.idx + 1) % P.length];
    const x = lerp(a.x, b.x, sp.frac), z = lerp(a.z, b.z, sp.frac);
    if (Math.hypot(x - pp.x, z - pp.z) < 110 || npcs.some(m => Math.hypot(m.pos.x - x, m.pos.y - z) < 14)) continue;
    const kind = rnd() < 0.65 ? 'small' : 'big', n = spawnNpcCar(P, POLICE_KINDS[kind].color, sp.idx, sp.frac, POLICE_KINDS[kind].type);
    n.target = Math.min(n.target, 12);
    return policify(n, kind, 'patrol');
  }
  return null;
}
/* nowy radiowóz w pościgu: na ulicy 130–240 m od gracza, poza kadrem */
function spawnPoliceChaser(){
  navBuild();
  const t = policeTarget(), cam = camera.position; camera.getWorldDirection(_copDir);
  const edges = NAV.edges.filter(e => NAV.nodes[e.a].isl === 'main' && NAV.nodes[e.b].isl === 'main');
  for (let k = 0; k < 40; k++){
    const e = edges[randInt(0, edges.length - 1)], a = NAV.nodes[e.a], b = NAV.nodes[e.b], f = rnd(), x = lerp(a.x, b.x, f), z = lerp(a.z, b.z, f), d = Math.hypot(x - t.x, z - t.z);
    if (d < 130 || d > 240) continue;
    const vx = x - cam.x, vz = z - cam.z, vl = Math.hypot(vx, vz) || 1;
    if ((vx * _copDir.x + vz * _copDir.z) / vl > 0.35 && vl < 260) continue;                   // w kadrze
    if (npcs.some(m => Math.hypot(m.pos.x - x, m.pos.y - z) < 14) || hwyCovered(x, z, 0.5) && groundAt(x, z, 2) === null) continue;
    const city = LOOPS.find(P => !P.hwyRoute) || LOOPS[0];
    const kind = rnd() < 0.55 ? 'small' : 'big', n = spawnNpcCar(city, POLICE_KINDS[kind].color, 0, 0, POLICE_KINDS[kind].type);
    n.body.position.set(x, n.halfH + 0.1, z); n.pos.set(x, z); n.y = 0; n.heading = Math.atan2(t.x - x, t.z - z);
    policify(n, kind, 'chase');
    if (n.body._hasPrev === true) noLerp(n.body);
    return n;
  }
  return null;
}
const _copDir = new THREE.Vector3();
function policeCarLeave(n){
  const C = n.cop; if (!C) return;
  C.role = 'leave'; C.route = null;
  const t = policeTarget(); navBuild();
  const far = NAV.nodes.filter(q => q.isl === 'main' && Math.hypot(q.x - t.x, q.z - t.z) > 260);
  const q = far.length ? far[randInt(0, far.length - 1)] : { x: n.pos.x, z: n.pos.y };
  C.leaveTo = { x: q.x, z: q.z };
}
/* czy auto przejedzie wprost z (x0,z0) do (x1,z1): budynki, filary, drzewa, latarnie, woda, wyraźne zmiany wysokości */
function policeDriveClear(x0, z0, x1, z1){
  const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz); if (L < 0.5) return true;
  const ux = dx / L, uz = dz / L, segHit = (px, pz, r) => { const t = clamp((px - x0) * ux + (pz - z0) * uz, 0, L); return Math.hypot(x0 + ux * t - px, z0 + uz * t - pz) < r; };
  for (const b of buildings){
    if (Math.max(x0, x1) < b.x - b.w / 2 - 1.6 || Math.min(x0, x1) > b.x + b.w / 2 + 1.6 || Math.max(z0, z1) < b.z - b.d / 2 - 1.6 || Math.min(z0, z1) > b.z + b.d / 2 + 1.6) continue;
    for (let s = 0; s <= L; s += 1.5){ const px = x0 + ux * s, pz = z0 + uz * s; if (Math.abs(px - b.x) < b.w / 2 + 1.4 && Math.abs(pz - b.z) < b.d / 2 + 1.4) return false; }
  }
  for (const p of HWY_PIERS) if (segHit(p.x, p.z, p.size / 2 + 1.4)) return false;
  for (const s of treeSpots) if (Math.abs(s.x - x0) < L + 2 && Math.abs(s.z - z0) < L + 2 && segHit(s.x, s.z, 1.5)) return false;
  for (const s of lampSpots) if (Math.abs(s.x - x0) < L + 2 && Math.abs(s.z - z0) < L + 2 && segHit(s.x, s.z, 1.2)) return false;
  for (const b of HIDE_BINS) if (segHit(b.x, b.z, 1.8)) return false;
  for (let s = 0; s <= L; s += 6){ const px = x0 + ux * s, pz = z0 + uz * s; if (!isLand(px, pz)) return false; const g = heightAt(px, pz); if (g > 0.7) return false; }
  return true;
}
/* --- graf tras policji z POZIOMAMI: ulice wyspy głównej (graf NAV, y = 0, w obie strony — policja nie patrzy na jednokierunkowe)
   + jezdnie, rampy i łącznice autostrad (punkty tras NPC z HWY_LOOPS, z wysokością, kierunkowe). Połączenia: punkty tras
   autostradowych na poziomie ulicy (y < 0.4) rzutowane na najbliższą krawędź NAV (≤ 6 m). Rzut startu i celu tylko na
   krawędzie na tym samym poziomie (|Δy| < 2.5) — radiowóz pod wiaduktem nie „dojeżdża” do gracza nad sobą, tylko rampą.
   Graf służy też nawigacji gracza (navigation.js): `ow` — kierunek pod prąd jednokierunkowej ulicy (autem nie),
   `radj` — krawędzie kierunkowe wstecz (pieszo po wiadukcie można iść w obie strony). --- */
const PGRAPH = { nodes: [], adj: [], radj: [], edges: [], built: false };
function pgBuild(){
  if (PGRAPH.built) return; PGRAPH.built = true; navBuild();
  const N = PGRAPH.nodes, A = PGRAPH.adj, RA = PGRAPH.radj, E = PGRAPH.edges, keys = new Map();
  const node = (x, y, z) => { const k = Math.round(x * 2) + ',' + Math.round(z * 2) + ',' + Math.round(y); let i = keys.get(k); if (i === undefined){ i = N.length; N.push({ x: x, y: y, z: z }); A.push([]); RA.push([]); keys.set(k, i); } return i; };
  const link = (a, b, both, ow) => {
    if (a === b) return; const p = N[a], q = N[b], l = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
    A[a].push({ to: b, l: l }); if (both) A[b].push({ to: a, l: l, ow: !!ow }); else RA[b].push({ to: a, l: l });
    E.push({ a: a, b: b, both: both, ow: !!ow, l: l });
  };
  const navIdx = NAV.nodes.map(q => q.isl === 'main' ? node(q.x, 0, q.z) : -1);
  for (const e of NAV.edges) if (navIdx[e.a] >= 0 && navIdx[e.b] >= 0) link(navIdx[e.a], navIdx[e.b], true, e.oneway);
  const low = [];
  for (const L of HWY_LOOPS){
    const P = L[0]; let prev = -1, first = -1;
    for (const p of P){ const i = node(p.x, p.y || 0, p.z); if ((p.y || 0) < 0.4) low.push(i); if (prev >= 0) link(prev, i, false); else first = i; prev = i; }
    if (first >= 0) link(prev, first, false);
  }
  for (const i of low){
    const p = N[i], pr = navProject(p.x, p.z, 'main');
    if (!pr || pr.d > 6 || navIdx[pr.e.a] < 0 || navIdx[pr.e.b] < 0) continue;
    const j = node(pr.x, 0, pr.z); link(j, navIdx[pr.e.a], true); link(j, navIdx[pr.e.b], true); link(i, j, true);
  }
}
/* najbliższy punkt grafu na tym samym poziomie co (x, y, z) */
function pgProject(x, y, z){
  const N = PGRAPH.nodes; let best = null;
  for (const e of PGRAPH.edges){
    const a = N[e.a], b = N[e.b], vx = b.x - a.x, vz = b.z - a.z, l2 = vx * vx + vz * vz || 1, u = clamp(((x - a.x) * vx + (z - a.z) * vz) / l2, 0, 1);
    const yE = lerp(a.y, b.y, u); if (Math.abs(yE - y) > 2.5) continue;
    const px = a.x + vx * u, pz = a.z + vz * u, d = Math.hypot(x - px, z - pz) + Math.abs(yE - y) * 0.5;
    if (!best || d < best.d) best = { e: e, u: u, x: px, y: yE, z: pz, d: d };
  }
  return best;
}
/* Dijkstra (kopiec binarny) od rzutu startu do rzutu celu; punkty trasy [x, z, y].
   how: brak — policja (ulice w obie strony), 'car' — z jednokierunkowymi ulicami, 'foot' — wszystko w obie strony */
function pgRoute(sx, sy, sz, tx, ty, tz, how){
  pgBuild();
  const s = pgProject(sx, sy, sz), t = pgProject(tx, ty, tz);
  if (!s || !t || s.d > 40 || t.d > 60) return null;
  const N = PGRAPH.nodes, A = PGRAPH.adj, RA = PGRAPH.radj, n = N.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1);
  const car = how === 'car', foot = how === 'foot', back = e => foot || (e.both && !(car && e.ow));   // czy wolno jechać b → a
  const head = [[sx, sz, sy], [s.x, s.z, s.y]], tail = [[t.x, t.z, t.y], [tx, tz, ty]];
  if (s.e === t.e && (t.u >= s.u || back(s.e))) return head.concat(tail);
  const heap = [], push = (d, i) => { heap.push([d, i]); let k = heap.length - 1; while (k){ const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length){ heap[0] = last; let k = 0; for (;;){ const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  dist[s.e.b] = (1 - s.u) * s.e.l; push(dist[s.e.b], s.e.b);
  if (back(s.e)){ dist[s.e.a] = Math.min(dist[s.e.a], s.u * s.e.l); push(dist[s.e.a], s.e.a); }
  const relax = (d, u, r) => { const nd = d + r.l; if (nd < dist[r.to]){ dist[r.to] = nd; prev[r.to] = u; push(nd, r.to); } };
  while (heap.length){
    const [d, u] = pop(); if (d > dist[u]) continue;
    for (const r of A[u]) if (!(car && r.ow)) relax(d, u, r);
    if (foot) for (const r of RA[u]) relax(d, u, r);
  }
  const ca = dist[t.e.a] + t.u * t.e.l, cb = back(t.e) ? dist[t.e.b] + (1 - t.u) * t.e.l : Infinity;
  if (!isFinite(Math.min(ca, cb))) return null;
  const chain = []; for (let u = ca <= cb ? t.e.a : t.e.b; u >= 0; u = prev[u]) chain.unshift([N[u].x, N[u].z, N[u].y]);
  return head.concat(chain, tail);
}
/* trasa radiowozu: oba punkty na ulicy, blisko i wolna droga — wprost; inaczej graf z poziomami (rampy na wiadukty);
   awaryjnie — sam graf ulic. Cel poza wyspą główną — najbliższy punkt ulicy (brzeg). */
function policeRoute(x0, y0, z0, x1, y1, z1){
  const isl = islandAt(x1, z1);
  if (!isl || isl.name !== 'main'){ navBuild(); const pr = navProject(x1, z1, 'main'); if (pr){ x1 = pr.x; z1 = pr.z; y1 = 0; } }
  if (y0 < 0.8 && y1 < 0.8 && Math.hypot(x1 - x0, z1 - z0) < 75 && policeDriveClear(x0, z0, x1, z1)) return [[x0, z0, 0], [x1, z1, 0]];
  const r = pgRoute(x0, y0, z0, x1, y1, z1);
  if (r) return r;
  navBuild();
  return navRoadRoute(x0, z0, x1, z1, 'main', false).map(p => [p[0], p[1], 0]);
}
function policeCarStep(n, dt){
  const C = n.cop, T = CAR_TYPES[n.type];
  n.pos.set(n.body.position.x, n.body.position.z);
  if (C.role === 'empty' || C.role === 'wait'){                                     // stoi (porzucony albo czeka na załogę)
    n.speed = damp(n.speed, 0, 4, dt); n.body.velocity.set(Math.sin(n.heading) * n.speed, 0, Math.cos(n.heading) * n.speed); n.body.angularVelocity.set(0, 0, 0);
    n.mesh.position.set(n.pos.x, n.y, n.pos.y); n.dirX = Math.sin(n.heading); n.dirZ = Math.cos(n.heading); n.blocked = true; n.why = 'policja';
    if (C.role === 'wait' && !COPS.some(c => c.car === n && c.state !== 'down')){ if (C.crew > 0) policeCarLeave(n); else C.role = 'empty'; }
    return;
  }
  const t = policeTarget(), seen = WANTED.seen;
  /* cel: pościg — gracz (z wyprzedzeniem), szukanie — ostatnie znane miejsce, odjazd — daleki węzeł */
  let gx, gz, gy;
  if (C.role === 'leave'){ gx = C.leaveTo.x; gz = C.leaveTo.z; gy = 0; }
  else if (C.role === 'chase' && seen){ gx = t.x + (t.vx || 0) * 0.6; gz = t.z + (t.vz || 0) * 0.6; gy = t.gy || 0; }
  else { gx = WANTED.last.x; gz = WANTED.last.z; gy = WANTED.last.gy || 0; }
  const lvl = Math.abs((t.gy || 0) - n.y) < 2.5;                                  // gracz na tym samym poziomie (nie na wiadukcie nad / pod)
  const dP = Math.hypot(t.x - n.pos.x, t.z - n.pos.y), dG = Math.hypot(gx - n.pos.x, gz - n.pos.y) + (Math.abs(gy - n.y) > 2.5 ? 1e3 : 0);
  C.routeT -= dt;
  if (!C.route || C.routeT <= 0 || Math.hypot(gx - C.goal.x, gz - C.goal.z) > 14 || Math.abs(gy - C.goal.y) > 2.5){ C.route = policeRoute(n.pos.x, n.y, n.pos.y, gx, gy, gz); C.ri = 1; C.routeT = 1.0; C.goal = { x: gx, z: gz, y: gy }; }
  const R = C.route;
  while (C.ri < R.length - 1 && Math.hypot(R[C.ri][0] - n.pos.x, R[C.ri][1] - n.pos.y) < 7) C.ri++;
  let ax = R[Math.min(C.ri, R.length - 1)][0], az = R[Math.min(C.ri, R.length - 1)][1];
  /* prędkość: pościg szybko, szukanie i odjazd wolniej; przed zakrętem trasy hamowanie do prędkości łuku */
  let vTop = C.role === 'chase' ? (C.kind === 'small' ? 40 : 36) : C.role === 'leave' ? 14 : 17, stop = false;   // pościg do ~145 km/h
  const p1 = R[Math.min(C.ri + 1, R.length - 1)], dA = Math.hypot(ax - n.pos.x, az - n.pos.y);
  if (C.ri < R.length - 1){
    const h1 = Math.atan2(ax - n.pos.x, az - n.pos.y), h2 = Math.atan2(p1[0] - ax, p1[1] - az), turn = Math.abs(wrapAngle(h2 - h1));
    const vc = lerp(26, 8, clamp(turn / 1.6, 0, 1));
    if (n.speed > vc && (n.speed * n.speed - vc * vc) / 18 > dA - 3) vTop = Math.min(vTop, vc);
  }
  /* przy graczu: pieszo / stojące auto — zatrzymanie kilka metrów przed i wysiadka załogi; jadące auto — PIT */
  if ((C.role === 'chase' || C.role === 'search') && (C.role === 'search' ? dG < 22 : (seen && lvl && dP < 10 + n.speed * 0.7 && (!t.car || Math.hypot(t.vx, t.vz) < 2.5)))){ stop = true; }
  if (C.role === 'stopped') stop = true;
  let pit = false;
  if (C.role === 'chase' && seen && lvl && t.car && Math.hypot(t.vx, t.vz) > 7 && Math.hypot(t.vx, t.vz) < 38 && dP < 32 && C.pitCool <= 0){   // PIT do ~135 km/h
    const hP = carYaw(), fx = Math.sin(hP), fz = Math.cos(hP), rx = -Math.cos(hP), rz = Math.sin(hP);
    const ox = n.pos.x - t.x, oz = n.pos.y - t.z, lat = ox * rx + oz * rz, lon = ox * fx + oz * fz, side = lat >= 0 ? 1 : -1, PT = CAR_TYPES[carType];
    ax = t.x - fx * (PT.half[2] + 0.4) + rx * side * 2.5 + t.vx * 0.3; az = t.z - fz * (PT.half[2] + 0.4) + rz * side * 2.5 + t.vz * 0.3;
    const vp = Math.hypot(t.vx, t.vz);
    vTop = clamp(vp + clamp(-(lon + PT.half[2]) * 0.9, -5, 8), 0, 48);
    pit = true;
    /* przód radiowozu przy tylnym kole gracza, równolegle — skręt w bok auta gracza: obrót i wytrącenie z toru */
    if (Math.abs(lon + PT.half[2] * 0.6) < 1.8 && Math.abs(lat) > 1.6 && Math.abs(lat) < 3.2 && Math.abs(wrapAngle(n.heading - hP)) < 0.4){
      C.pitT = 0.4; C.pitCool = 5; C.pitSide = side;
      chassisBody.angularVelocity.y += -side * 1.1;                                   // obrót bez przewracania (tylko wokół pionu)
      chassisBody.velocity.x += -rx * side * 1.3; chassisBody.velocity.z += -rz * side * 1.3;
      Sound.thud(9);
    }
  }
  if (C.pitCool > 0) C.pitCool -= dt;
  /* auta przed maską: objazd w bok albo zwolnienie */
  let dx = ax - n.pos.x, dz = az - n.pos.y, dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
  let latT = 0;
  for (const m of npcs){
    if (m === n || Math.abs((m.y || 0) - n.y) > 2.5) continue;
    const ox = m.pos.x - n.pos.x, oz = m.pos.y - n.pos.y, a = ox * dx + oz * dz;
    if (a < 1 || a > 10 + n.speed * 0.9) continue;
    const l = ox * dz - oz * dx;
    if (Math.abs(l) < 2.6){ latT = l > 0 ? -1 : 1; if (a < 7) vTop = Math.min(vTop, m.speed < 0.5 && a < 6.5 ? 0 : Math.max(m.speed, 4)); }   // przed stojącym autem (też radiowozem) staje
  }
  if (t.car && !pit && lvl){                                                       // wolne / stojące auto gracza przed maską: staje obok (nie wjeżdża na nie)
    const ox = t.x - n.pos.x, oz = t.z - n.pos.y, a = ox * dx + oz * dz;
    if (a > 0 && a < 12 && Math.abs(ox * dz - oz * dx) < 3.2 && Math.hypot(t.vx, t.vz) < 6) vTop = Math.min(vTop, Math.max(0, (a - 6) * 1.5));
  }
  if (!t.car && mode === 'foot' && !player.hiding && lvl){                       // pieszy gracz przed maską: hamuje (nie rozjeżdża)
    const ox = t.x - n.pos.x, oz = t.z - n.pos.y, a = ox * dx + oz * dz;
    if (a > 0 && a < 10 && Math.abs(ox * dz - oz * dx) < 2.4) vTop = Math.min(vTop, Math.max(0, (a - 4) * 1.5));
  }
  /* nie wjeżdża w obrys auta gracza (ciało kinematyczne w aucie przy dużej prędkości wyrzucało je pod ziemię): z tyłu — prędkość auta gracza, z boku — odbicie w bok */
  if (t.car && lvl){
    const hP = carYaw(), fx = Math.sin(hP), fz = Math.cos(hP), rx = -Math.cos(hP), rz = Math.sin(hP), PT = CAR_TYPES[carType];
    const ox = n.pos.x - t.x, oz = n.pos.y - t.z, lon = ox * fx + oz * fz, lat = ox * rx + oz * rz, Ls = PT.half[2] + (n.halfL || 2.05) + 0.8, Ws = PT.half[0] + (n.halfW || 0.93) + 0.35;
    if (Math.abs(lon) < Ls && Math.abs(lat) < Ws){
      if (lon < 0 && Math.abs(lat) < Ws - 0.5) vTop = Math.min(vTop, Math.max(0, Math.hypot(t.vx, t.vz) - 2.5));
      const s2 = lat >= 0 ? 1 : -1, k2 = (Ws - Math.abs(lat)) / Ws; dx += rx * s2 * k2 * 1.2; dz += rz * s2 * k2 * 1.2; const l2 = Math.hypot(dx, dz) || 1; dx /= l2; dz /= l2;
    }
  }
  C.lat = approach(C.lat, latT, 1.8 * dt);
  if (C.lat){ const c = Math.cos(C.lat * 0.4), s = Math.sin(C.lat * 0.4); const ndx = dx * c + dz * s, ndz = -dx * s + dz * c; dx = ndx; dz = ndz; }
  const want = stop ? 0 : vTop;
  n.speed = want > n.speed ? Math.min(want, n.speed + 9 * dt) : Math.max(want, n.speed - 11 * dt);   // przyspieszenie / hamowanie radiowozu
  const rate = 1.4 + 2.6 * clamp(1 - n.speed / 30, 0, 1);
  n.heading += clamp(wrapAngle(Math.atan2(dx, dz) - n.heading), -rate * dt, rate * dt);
  let vx = Math.sin(n.heading) * n.speed, vz = Math.cos(n.heading) * n.speed;
  if (C.pitT > 0) C.pitT -= dt;
  /* wysokość: podłoże pod autem (chodnik, parking) co 0.25 s */
  /* wysokość: odcinek trasy na rampie / wiadukcie — z trasy (jak auta NPC); na ulicy — podłoże pod autem (chodnik, parking) co 0.25 s */
  const ra = R[Math.max(0, Math.min(C.ri, R.length - 1) - 1)], rb = R[Math.min(C.ri, R.length - 1)], ya = ra[2] || 0, yb = rb[2] || 0;
  if (Math.max(ya, yb) > 0.4){
    const sx = rb[0] - ra[0], sz = rb[1] - ra[1], sl2 = sx * sx + sz * sz || 1, u = clamp(((n.pos.x - ra[0]) * sx + (n.pos.y - ra[1]) * sz) / sl2, 0, 1);
    n.y = lerp(ya, yb, u); n.slope = (yb - ya) / Math.sqrt(sl2); C.gyT = 0;
  } else {
    n.slope = 0; C.gyT -= dt;
    if (C.gyT <= 0){ C.gyT = 0.25; const g = rayHit(n.pos.x, n.y + 1.5, n.pos.y, n.pos.x, n.y - 2, n.pos.y, G_WORLD); n.yT = g && g.hitNormalWorld.y > 0.7 ? g.hitPointWorld.y : 0; }
    n.y = damp(n.y, Math.min(n.yT || 0, 1.0), 8, dt);
  }
  n.body.position.y = n.y + n.halfH + 0.1;
  n.dirX = Math.sin(n.heading); n.dirZ = Math.cos(n.heading);
  n.body.velocity.set(vx, 0, vz); n.body.angularVelocity.set(0, 0, 0);
  n.body.quaternion.setFromAxisAngle(_npAxis, n.heading);
  n.mesh.position.set(n.pos.x, n.y, n.pos.y); n.mesh.rotation.order = 'YXZ'; n.mesh.rotation.set(-Math.atan(n.slope || 0), n.heading, 0);
  n.blocked = n.speed < 0.3; n.why = 'policja';
  /* zatrzymany przy graczu: załoga wysiada */
  if (stop && n.speed < 0.6 && C.crew > 0 && (C.role === 'chase' || C.role === 'search' || C.role === 'stopped')){ C.role = 'stopped'; policeDeploy(n); }
  /* odjazd: daleko od gracza i poza kadrem — znika (patrol uzupełnia się sam) */
  if (C.role === 'leave'){
    const pp = playerWorldPos(), d = Math.hypot(n.pos.x - pp.x, n.pos.y - pp.z);
    camera.getWorldDirection(_copDir); const vx2 = n.pos.x - camera.position.x, vz2 = n.pos.y - camera.position.z, vl = Math.hypot(vx2, vz2) || 1;
    if ((d > 170 && (vx2 * _copDir.x + vz2 * _copDir.z) / vl < 0.3) || d > 320 || dG < 10) removeNpcCar(n);
  }
}
/* staranowanie radiowozu (sound.js) */
function policeRammed(n, v){ if (v > 7) policeCrime('atak na policję', n.pos.x, n.pos.y); }

/* --- policjanci pieszo --- */
const COP_PALS = [{ skin: 0xd9a882, shirt: 0x1d2a44, pants: 0x1b1f28, hair: 0x2a1f19 }, { skin: 0xc48f6a, shirt: 0x1d2a44, pants: 0x1b1f28, hair: 0x111111 }, { skin: 0xe8c39e, shirt: 0x1d2a44, pants: 0x1b1f28, hair: 0x5b4632 }];
const _copCap = mergeColored([{ geo: new THREE.BoxGeometry(0.31, 0.1, 0.3), color: 0x141a2a, y: 1.88 }, { geo: new THREE.BoxGeometry(0.3, 0.03, 0.12), color: 0x0b0e16, y: 1.84, z: 0.19 }, { geo: new THREE.BoxGeometry(0.08, 0.06, 0.02), color: 0xd8b23a, y: 1.89, z: 0.16 },
  { geo: new THREE.BoxGeometry(0.55, 0.42, 0.33), color: 0x22262e, y: 1.17 }, { geo: new THREE.BoxGeometry(0.16, 0.08, 0.02), color: 0xd8d4cc, x: -0.12, y: 1.28, z: 0.17 }]);
const _copGun = new THREE.BoxGeometry(0.06, 0.12, 0.22);
function spawnCop(x, z, y, heading, car, state){
  const pal = COP_PALS[randInt(0, COP_PALS.length - 1)], h = buildHumanoid(pal);
  h.group.add(new THREE.Mesh(_copCap, _humMat));
  const gun = new THREE.Mesh(_copGun, new THREE.MeshLambertMaterial({ color: 0x1b1d21 })); gun.position.set(0, -0.66, 0.1); h.armR.add(gun);
  scene.add(h.group);
  const b = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
  b.addShape(new CANNON.Sphere(0.36), new CANNON.Vec3(0, -0.45, 0)); b.addShape(new CANNON.Sphere(0.36), new CANNON.Vec3(0, 0.45, 0));
  b.collisionFilterGroup = G_PED; b.collisionFilterMask = ~G_WORLD; b.allowSleep = false;
  const c = { group: h.group, armL: h.armL, armR: h.armR, legL: h.legL, legR: h.legR, body: b, pos: new THREE.Vector2(x, z), y: y, heading: heading, car: car, state: state || 'chase',
    hp: 100, shootT: rand(0.8, 1.6), t: 0, phase: rand(0, TAU), path: null, pathT: 0, dest: null, waitT: 0, gyT: 0, bin: null, sees: false, aim: 0, rope: null, ropeY: 0 };
  b.copRef = c; b.isPed = true; b.position.set(x, y + 0.85, z); addBody(b);
  h.group.userData.copRef = c;
  COPS.push(c);
  return c;
}
function removeCop(c){ delBody(c.body); scene.remove(c.group); if (c.rope){ scene.remove(c.rope); c.rope = null; } const i = COPS.indexOf(c); if (i >= 0) COPS.splice(i, 1); }
function policeDeploy(n){
  const C = n.cop; if (C.crew <= 0) return;
  const t = policeTarget(), lx = Math.cos(n.heading), lz = -Math.sin(n.heading);
  for (let k = 0; k < C.crew; k++){
    const s = k % 2 ? -1 : 1, back = k > 1 ? -1.6 : 0.3;
    const x = n.pos.x + lx * s * ((n.halfW || 0.93) + 0.7) + Math.sin(n.heading) * back, z = n.pos.y + lz * s * ((n.halfW || 0.93) + 0.7) + Math.cos(n.heading) * back;
    spawnCop(x, z, n.y, Math.atan2(t.x - x, t.z - z), n, WANTED.phase === 'search' ? 'search' : 'chase');
  }
  C.crew = 0; C.deployed = true;
}
/* trafienie policjanta (kula, cios, auto, wybuch): przestępstwo; hp 0 — leży, znika po 20 s */
function copHit(c, dmg, how){
  if (!c || c.state === 'down') return;
  c.hp -= dmg;
  if (c.hp <= 0){
    c.state = 'down'; c.t = 20; c.group.rotation.x = (rnd() < 0.5 ? 1 : -1) * Math.PI / 2; c.body.position.set(c.pos.x, -50, c.pos.y);
    if (c.rope){ scene.remove(c.rope); c.rope = null; }
    Sound.hurt();
    if (how !== 'npc') policeCrime('zabicie policjanta', c.pos.x, c.pos.y);
  } else if (how !== 'npc') policeCrime('atak na policję', c.pos.x, c.pos.y);
}
/* czy pieszy przejdzie wprost: budynki (wnętrze hali z wrotami — tylko przez wrota), woda */
function copWalkClear(x0, z0, x1, z1){
  const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz); if (L < 0.3) return true;
  for (const b of buildings){
    if (Math.max(x0, x1) < b.x - b.w / 2 - 0.6 || Math.min(x0, x1) > b.x + b.w / 2 + 0.6 || Math.max(z0, z1) < b.z - b.d / 2 - 0.6 || Math.min(z0, z1) > b.z + b.d / 2 + 0.6) continue;
    const zn = b.hollow ? HIDE_ZONES.find(q => Math.abs((q.x0 + q.x1) / 2 - b.x) < 1 && Math.abs((q.z0 + q.z1) / 2 - b.z) < 1) : null;
    if (zn && inRect(zn, x0, z0) && inRect(zn, x1, z1)) continue;                    // w środku hali
    for (let s = 0; s <= L; s += 0.8){ const px = x0 + dx / L * s, pz = z0 + dz / L * s; if (Math.abs(px - b.x) < b.w / 2 + 0.5 && Math.abs(pz - b.z) < b.d / 2 + 0.5){ if (zn && inRect(zn, px, pz) && Math.hypot(px - zn.door.x, pz - zn.door.z) < zn.door.w / 2 + 0.2) continue; return false; } }
  }
  for (let s = 0; s <= L; s += 4) if (!isLand(x0 + dx / L * s, z0 + dz / L * s)) return false;
  return true;
}
const zoneAt = (x, z) => HIDE_ZONES.find(q => inRect(q, x, z)) || null;
/* krok policjanta w stronę (tx,tz): wprost, gdy wolne; do hali — przez wrota; inaczej po ulicach (graf NAV, pieszo) */
function copMoveTo(c, tx, tz, spd, dt){
  const zt = zoneAt(tx, tz), zc = zoneAt(c.pos.x, c.pos.y);
  if (zt !== zc){                                                                    // przez wrota: punkt przed wrotami, potem w środku
    const zz = zc || zt, d = zz.door, inside = !!zc;
    const ox = d.x + d.nx * 2.5, oz = d.z + d.nz * 2.5, ix = d.x - d.nx * 2.5, iz = d.z - d.nz * 2.5;
    if (inside){ if (Math.hypot(c.pos.x - ix, c.pos.y - iz) > 1) { tx = ix; tz = iz; } else { tx = ox; tz = oz; } }
    else { if (Math.hypot(c.pos.x - ox, c.pos.y - oz) > 1.2 && !(Math.hypot(c.pos.x - d.x, c.pos.y - d.z) < 2.6)) { tx = ox; tz = oz; } else { tx = ix; tz = iz; } }
  }
  let ax = tx, az = tz;
  c.pathT -= dt;
  if (!copWalkClear(c.pos.x, c.pos.y, tx, tz)){
    if (!c.path || c.pathT <= 0 || Math.hypot(c.dest.x - tx, c.dest.z - tz) > 6){ navBuild(); c.path = navRoadRoute(c.pos.x, c.pos.y, tx, tz, 'main', false); c.pi = 1; c.pathT = 1.5; c.dest = { x: tx, z: tz }; }
    while (c.pi < c.path.length - 1 && Math.hypot(c.path[c.pi][0] - c.pos.x, c.path[c.pi][1] - c.pos.y) < 1.5) c.pi++;
    ax = c.path[c.pi][0]; az = c.path[c.pi][1];
  } else c.path = null;
  const dx = ax - c.pos.x, dz = az - c.pos.y, d = Math.hypot(dx, dz);
  if (d < 0.2) return false;
  const st = Math.min(d, spd * dt);
  c.pos.x += dx / d * st; c.pos.y += dz / d * st;
  c.heading = angleDamp(c.heading, Math.atan2(dx, dz), 9, dt);
  return true;
}
/* strzał (policjant / helikopter) do gracza: trafienie z prawdopodobieństwem wg odległości i prędkości; smugacz z lufy */
const _copFrom = new THREE.Vector3(), _copTo = new THREE.Vector3();
/* strzał do gracza: trafienie z prawdopodobieństwem acc·(1 − d/range) minus poprawka na ruch (dalej niż range — tylko pudła) */
function policeShoot(fx, fy, fz, acc, range){
  const t = policeTarget(), d = Math.hypot(t.x - fx, t.y - fy, t.z - fz), sp = Math.hypot(t.vx || 0, t.vz || 0);
  const hit = Math.random() < clamp(acc * (1 - d / (range || 32)) - sp * 0.02, 0, 0.5) && !player.hiding;
  _copFrom.set(fx, fy, fz); _copTo.set(t.x + (hit ? 0 : rand(-2.5, 2.5)), t.y + (hit ? 0 : rand(-1, 1.5)), t.z + (hit ? 0 : rand(-2.5, 2.5)));
  const len = _copFrom.distanceTo(_copTo);
  const tr = new THREE.Mesh(_tracerGeo, _tracerMat); tr.position.copy(_copFrom).lerp(_copTo, 0.5); tr.scale.set(1, 1, len); tr.lookAt(_copTo); shotFxAdd(tr, 0.05);
  const fl = new THREE.Mesh(_flashGeo, _flashMat); fl.position.copy(_copFrom); fl.scale.setScalar(0.07); shotFxAdd(fl, 0.05);
  const cam = camera.position, dc = Math.hypot(cam.x - fx, cam.z - fz);
  if (dc < 140) Sound.shoot(false);
  if (Pedestrians.scare) Pedestrians.scare(fx, fz, 30);
  if (!hit) return;
  if (mode === 'car' && !activeCarGone){ vehicleBulletHit(chassisBody, 8); damagePlayer(rand(2, 3.5), 'policja'); }
  else if (mode === 'heli' && curHeli){ heliDamage(curHeli, 2.5); damagePlayer(rand(1.5, 2.5), 'policja'); }
  else damagePlayer(rand(5, 8), 'policja');
}
/* zatrzymanie: ekran ZATRZYMANY, wyjście przed komisariatem (update-player.js: respawnPlayer) */
function policeBust(){
  if (player.dead) return;
  player.dead = true; player.busted = true; player.health = Math.max(player.health, 1);
  player.deathMsg = 'ZATRZYMANY'; player.deathCause = 'zatrzymanie'; player.respawnAt = performance.now() + RESPAWN_MS;
  if (player.hiding) hideExit(true);
  setTimeout(respawnPlayer, RESPAWN_MS);
  Sound.hurt();
  wantedClear(null);
}
const COP_SHOOT_RANGE = 22, COP_SHOOTERS = 4;                                       // policjant strzela z najwyżej 22 m; naraz strzela najwyżej 4 (najbliżsi)
function updateCop(c, dt){
  c.t += dt;
  if (c.state === 'down'){ c.t -= 2 * dt; if (c.t <= 0) removeCop(c); return; }
  const t = policeTarget(), dP = Math.hypot(t.x - c.pos.x, t.z - c.pos.y);
  let moving = false, spd = 0, aimP = false;
  if (c.state === 'rope'){                                                          // zjazd na linie z helikoptera
    c.y = Math.max(c.ropeY, c.y - dt * 4.2);
    if (c.rope){ const top = c.ropeTop; c.rope.position.set(c.pos.x, (top + c.y + 1.6) / 2, c.pos.y); c.rope.scale.y = Math.max(0.1, top - c.y - 1.6); }
    if (c.y <= c.ropeY + 0.01){ c.state = WANTED.phase === 'search' ? 'search' : 'chase'; if (c.rope){ scene.remove(c.rope); c.rope = null; } }
  } else if (c.state === 'return' || WANTED.stars === 0){
    c.state = 'return';
    const car = c.car && npcs.indexOf(c.car) >= 0 ? c.car : null;
    if (car){
      moving = copMoveTo(c, car.pos.x, car.pos.y, 3.6, dt); spd = 3.6;
      if (Math.hypot(car.pos.x - c.pos.x, car.pos.y - c.pos.y) < 2.6){ car.cop.crew++; removeCop(c); if (!COPS.some(q => q.car === car && q.state !== 'down') && WANTED.stars === 0) policeCarLeave(car); return; }
    } else {                                                                        // bez auta: odchodzi i znika poza kadrem
      const pp = playerWorldPos(); if (Math.hypot(pp.x - c.pos.x, pp.z - c.pos.y) > 60){ removeCop(c); return; }
      moving = copMoveTo(c, c.pos.x + (c.pos.x - pp.x), c.pos.y + (c.pos.y - pp.z), 3.2, dt); spd = 3.2;
    }
  } else if (WANTED.phase === 'search' && !c.sees){
    /* szukanie: punkty w promieniu ~30 m od ostatniego znanego miejsca, przystanki; kontenery w pobliżu — zaglądanie */
    if (!c.dest || c.waitT > 0){
      if (c.waitT > 0){ c.waitT -= dt; c.heading += dt * 1.2 * (c.phase > Math.PI ? 1 : -1);
        if (c.bin && c.waitT <= 0){ if (player.hiding === c.bin && (c.bin.suspect || rnd() < 0.55)){ hideFound(); WANTED.seen = true; WANTED.reportT = 1.5; } c.bin = null; } }
      else {
        const L0 = WANTED.last, bins = HIDE_BINS.filter(b => Math.hypot(b.x - L0.x, b.z - L0.z) < 26 && !COPS.some(q => q.bin === b));
        const sus = bins.find(b => b.suspect);
        if (sus || (bins.length && rnd() < 0.4)){ const b = sus || bins[randInt(0, bins.length - 1)]; c.bin = b; c.dest = { x: b.x + Math.sin(b.rot) * 1.6, z: b.z + Math.cos(b.rot) * 1.6 }; }
        else for (let k = 0; k < 10; k++){ const a = rnd() * TAU, r = rand(4, 30), x = L0.x + Math.cos(a) * r, z = L0.z + Math.sin(a) * r; if (isLand(x, z) && !buildings.some(b => Math.abs(x - b.x) < b.w / 2 + 1 && Math.abs(z - b.z) < b.d / 2 + 1) || zoneAt(x, z)){ c.dest = { x: x, z: z }; break; } }
      }
    }
    if (c.dest && c.waitT <= 0){
      moving = copMoveTo(c, c.dest.x, c.dest.z, 2.6, dt); spd = 2.6;
      if (!moving || Math.hypot(c.dest.x - c.pos.x, c.dest.z - c.pos.y) < 0.6){ c.dest = null; c.waitT = c.bin ? 1.4 : rand(1.2, 2.4); c.phase = rand(0, TAU); }
    }
  } else {
    /* pościg. Gracz na innym poziomie (wiadukt nad / pod policjantem): nie zatrzyma go — po 3 s wraca do radiowozu, który
       dojedzie rampą; widząc go z bliska przy 3+ gwiazdkach — strzela. Na tym samym poziomie każdy policjant ma swoje miejsce
       (c.slot): zatrzymujący — dwaj najbliżsi tuż przy graczu, reszta w pierścieniu 3–5 m; strzelający — w pierścieniu 12–18 m. */
    c.state = 'chase';
    const sameLvl = Math.abs((t.gy || 0) - c.y) < 1.8;
    c.offT = sameLvl ? 0 : (c.offT || 0) + dt;
    if (c.offT > 3 && c.car && npcs.indexOf(c.car) >= 0){ c.state = 'board'; return; }
    const k = c.slot || 0, shooter = WANTED.stars >= 3 && c.sees && dP < COP_SHOOT_RANGE && k < COP_SHOOTERS, face = () => { c.heading = angleDamp(c.heading, Math.atan2(t.x - c.pos.x, t.z - c.pos.y), 10, dt); };
    const rr = shooter ? 12 + (k % 3) * 3 : (k < 2 ? 1.1 : 3 + (k - 2) * 0.7);
    const tx = c.sees ? t.x : WANTED.last.x, tz = c.sees ? t.z : WANTED.last.z, dT = Math.hypot(tx - c.pos.x, tz - c.pos.y);
    if (!sameLvl){ if (shooter) aimP = true; face(); }
    else if (dT > rr + 0.3){
      const bx = c.pos.x - tx, bz = c.pos.y - tz, bl = Math.hypot(bx, bz) || 1;
      spd = dT > 6 ? 6.2 : 4.5; moving = copMoveTo(c, tx + bx / bl * rr, tz + bz / bl * rr, spd, dt);
      if (shooter) aimP = true;
    } else { face(); if (shooter) aimP = true; }
    if (aimP){ c.shootT -= dt; if (c.shootT <= 0 && !player.dead){ c.shootT = rand(1.2, 2.0); _copFrom.set(0, -0.66, 0.2); c.armR.updateWorldMatrix(true, false); _copFrom.applyMatrix4(c.armR.matrixWorld); policeShoot(_copFrom.x, _copFrom.y, _copFrom.z, 0.16 + WANTED.stars * 0.02, COP_SHOOT_RANGE + 6); } }
    /* zatrzymanie: na tym samym poziomie, tuż przy graczu, który stoi albo idzie (pieszo), albo przy drzwiach stojącego auta */
    const pv = Math.hypot(t.vx || 0, t.vz || 0);
    if (sameLvl && !player.dead && !player.hiding && ((mode === 'foot' && dP < 1.6 && pv < 3) || (mode === 'car' && t.car && pv < 1 && dP < (CAR_TYPES[carType].half[0] + 1.6)))){ WANTED.bust += dt; if (WANTED.bust > (mode === 'car' ? 1.4 : 1.1)) policeBust(); }
  }
  /* wysokość podłoża, ciało, model, animacja */
  c.gyT -= dt;
  if (c.state !== 'rope' && c.gyT <= 0){ c.gyT = 0.3; const g = rayHit(c.pos.x, c.y + 1.6, c.pos.y, c.pos.x, c.y - 3, c.pos.y, G_WORLD); if (g && g.hitNormalWorld.y > 0.6) c.yT = g.hitPointWorld.y; }
  if (c.state !== 'rope' && c.yT !== undefined) c.y = damp(c.y, c.yT, 10, dt);
  copPose(c, dt, moving, spd, aimP);
}
function copPose(c, dt, moving, spd, aimP){
  c.body.position.set(c.pos.x, c.y + 0.85, c.pos.y);
  c.group.position.set(c.pos.x, c.y, c.pos.y); c.group.rotation.y = c.heading;
  if (moving){ c.phase += dt * (3 + spd * 1.1); const s = Math.sin(c.phase), q = Math.sin(c.phase + Math.PI); c.legL.rotation.x = s * 0.6; c.legR.rotation.x = q * 0.6; c.armL.rotation.x = q * 0.5; }
  else { c.legL.rotation.x = damp(c.legL.rotation.x, 0, 8, dt); c.legR.rotation.x = damp(c.legR.rotation.x, 0, 8, dt); c.armL.rotation.x = damp(c.armL.rotation.x, 0, 8, dt); }
  c.aim = damp(c.aim, aimP ? 1 : 0, 10, dt);
  c.armR.rotation.x = c.aim > 0.05 ? -1.45 * c.aim : (moving ? Math.sin(c.phase) * 0.5 : 0);
  if (c.aim > 0.5) c.armL.rotation.x = -1.3 * c.aim;
}
/* policjanci nie stoją w jednym miejscu: rozpychanie (≥ 1.1 m, strzelający ≥ 2 m), tylko na tym samym poziomie */
function copSeparate(){
  const L = COPS.filter(c => c.state !== 'down' && c.state !== 'rope');
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++){
    const a = L[i], b = L[j]; if (Math.abs(a.y - b.y) > 1.5) continue;
    let dx = b.pos.x - a.pos.x, dz = b.pos.y - a.pos.y, d = Math.hypot(dx, dz);
    const m = a.aim > 0.5 && b.aim > 0.5 ? 2.0 : 1.1;
    if (d >= m) continue;
    if (d < 1e-3){ const r = rnd() * TAU; dx = Math.cos(r); dz = Math.sin(r); d = 1; }
    const p = (m - d) / 2; dx /= d; dz /= d;
    a.pos.x -= dx * p; a.pos.y -= dz * p; b.pos.x += dx * p; b.pos.y += dz * p;
  }
}

/* --- helikoptery policji: tylko w pościgu — od 4 gwiazdek jeden, od 5 dwa, przy 6 trzy (najwyżej 3). Nadlatują spoza kadru,
   zestrzelony zastępuje następny po 3 s. Krążą nad graczem na różnych wysokościach i kątach, nie wlatują w siebie;
   strzelec od 5 gwiazdek, zrzut policjantów na linach przy 6. Po zgubieniu policji odlatują i znikają. --- */
const POLICE_HELI_MAX = 3;
function policeHeliWant(){ return WANTED.phase === 'none' ? 0 : Math.min(POLICE_HELI_MAX, Math.max(0, WANTED.stars - 3)); }
function policeHeliLaunch(){
  const t = policeTarget(), cam = camera.position; camera.getWorldDirection(_copDir);
  let x = t.x, z = t.z;
  for (let k = 0; k < 16; k++){
    const a = rnd() * TAU, r = rand(200, 260); x = t.x + Math.cos(a) * r; z = t.z + Math.sin(a) * r;
    const vx = x - cam.x, vz = z - cam.z, vl = Math.hypot(vx, vz) || 1;
    if ((vx * _copDir.x + vz * _copDir.z) / vl < 0.3) break;                         // poza kadrem
  }
  const alt = Math.max(heightAt(x, z) + 30, (t.y || 0) + 60, 80);
  const h = makeHeli('police', x, alt - HELI_T.skid, z, Math.atan2(t.x - x, t.z - z));
  h.policeOwned = true; h.onGround = false; h.rpm = 1;
  h.ai = { role: 'pursuit', flash: true, beam: true, cool: 12, shootT: 3, drop: null, takeoff: 0, ang: rnd() * TAU };
  POLICE.heli.push(h);
  return h;
}
function policeHeliRemove(h){
  const i = POLICE.heli.indexOf(h); if (i >= 0) POLICE.heli.splice(i, 1);
  const j = helis.indexOf(h); if (j >= 0) helis.splice(j, 1);
  if (h.bodyIn){ delBody(h.body); h.bodyIn = false; }
  scene.remove(h.group);
}
function policeHeliStolen(h){ policeCrime('kradzież helikoptera', h.pos.x, h.pos.z); h.policeOwned = false; const i = POLICE.heli.indexOf(h); if (i >= 0) POLICE.heli.splice(i, 1); }
function policeHeliDown(h){ const i = POLICE.heli.indexOf(h); if (i >= 0) POLICE.heli.splice(i, 1); POLICE.heliT = 3; policeCrime('helikopter', h.pos.x, h.pos.z); }
function updatePoliceHeli(h, dt, slot, count){
  const A = h.ai; if (!A || h.gone) return;
  const t = policeTarget();
  if (A.role === 'leave'){                                                          // odlot: w górę i od gracza, poza kadrem znika
    A.flash = false; A.beam = false;
    const dx = h.pos.x - t.x, dz = h.pos.z - t.z, dl = Math.hypot(dx, dz) || 1;
    heliAiStep(h, dt, { x: h.pos.x + dx / dl * 120, y: Math.max(h.pos.y, 90), z: h.pos.z + dz / dl * 120 }, { vMax: 36 });
    if (dl > 320) policeHeliRemove(h);
    return;
  }
  A.flash = true; A.beam = true;
  if (A.cool > 0) A.cool -= dt;
  const tgt = WANTED.seen ? t : WANTED.last;
  A.role = A.drop ? 'drop' : 'pursuit';
  /* zrzut policjantów (6 gwiazdek, jeden helikopter naraz): gracz pieszo albo stoi; wolne miejsce z czystym niebem i prześwitem na wirnik */
  if (!A.drop && WANTED.stars >= 6 && A.cool <= 0 && WANTED.seen && !POLICE.heli.some(q => q !== h && q.ai && q.ai.drop) && (mode === 'foot' || (t.car && Math.hypot(t.vx, t.vz) < 2)) && COPS.filter(c => c.heli === h && c.state !== 'down').length < 4){
    let s = null;
    for (let r = 6; r <= 40 && !s; r += 5) for (let k = 0; k < 10 && !s; k++){
      const a = k / 10 * TAU + r, q = safeSpot(t.x + Math.cos(a) * r, t.z + Math.sin(a) * r, 0, 1);
      if (q && !rayHit(q.x, q.y + 2, q.z, q.x, q.y + 70, q.z, G_WORLD) && [[5.8, 0], [-5.8, 0], [0, 5.8], [0, -5.8], [4.2, 4.2], [-4.2, -4.2], [4.2, -4.2], [-4.2, 4.2]].every(o => !rayHit(q.x + o[0], q.y + 40, q.z + o[1], q.x + o[0], q.y + 2.2, q.z + o[1], G_WORLD))) s = q;
    }
    if (s) A.drop = { x: s.x, y: s.y, z: s.z, t: 0, done: false }; else A.cool = 4;
  }
  if (A.drop){
    const D = A.drop;
    heliAiStep(h, dt, heliAvoid(h, { x: D.x, y: D.y + 7.5, z: D.z }), { vMax: 16, low: true, face: t });
    const near = Math.hypot(D.x - h.pos.x, D.z - h.pos.z) < 1.8 && Math.abs(h.pos.y - (D.y + 7.5)) < 1.2;
    if (near && !D.done){
      D.done = true;
      for (const s of [-1, 1]){
        const rx = -Math.cos(h.yaw), rz = Math.sin(h.yaw), x = h.pos.x + rx * s * 1.3, z = h.pos.z + rz * s * 1.3;
        const c = spawnCop(x, z, h.pos.y - 1.6, h.yaw, null, 'rope'); c.heli = h; c.ropeY = D.y; c.ropeTop = h.pos.y - 0.6;
        c.rope = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1, 0.04), new THREE.MeshBasicMaterial({ color: 0x2a2a2a })); scene.add(c.rope);
      }
    }
    if (D.done){ D.t += dt; if (D.t > 3.5){ A.drop = null; A.cool = 35; } }
    else if ((D.tt = (D.tt || 0) + dt) > 40){ A.drop = null; A.cool = 10; }
    return;
  }
  /* krążenie nad graczem / ostatnim znanym miejscem: każdy na swoim kącie (co 2π / liczba) i wysokości (+9 m na kolejny) */
  A.ang = (A.ang || 0) + dt * 0.25;
  const a = A.ang + slot * TAU / Math.max(1, count);
  heliAiStep(h, dt, heliAvoid(h, { x: tgt.x + Math.cos(a) * 34, y: (tgt.y || 0) + 26 + slot * 9, z: tgt.z + Math.sin(a) * 34 }), { vMax: 34, face: tgt });
  A.shootT -= dt;
  if (WANTED.stars >= 5 && WANTED.seen && A.shootT <= 0 && Math.hypot(t.x - h.pos.x, t.y - h.pos.y, t.z - h.pos.z) < 60 && !player.dead){
    A.shootT = rand(1.6, 2.4);
    if (!rayHit(h.pos.x, h.pos.y - 1.6, h.pos.z, t.x, t.y, t.z, G_WORLD)) policeShoot(h.pos.x, h.pos.y - 1.2, h.pos.z, 0.26, 70);
  }
}
/* helikoptery nie wlatują w siebie: punkt docelowy odpychany od innych helikopterów bliżej niż 26 m (w poziomie i w pionie) */
function heliAvoid(h, p){
  for (const q of helis){
    if (q === h || q.gone) continue;
    const dx = h.pos.x - q.pos.x, dy = h.pos.y - q.pos.y, dz = h.pos.z - q.pos.z, d = Math.hypot(dx, dy * 1.5, dz);
    if (d < 26){ const k = (26 - d) * 1.4 / (d || 1); p.x += dx * k; p.z += dz * k; p.y += (dy >= 0 ? 1 : -1) * (26 - d) * 0.6; }
  }
  return p;
}

/* --- wzrok: stożki radiowozów (z załogą) i policjantów, krąg pod helikopterem; promień widoczności --- */
function policeLos(ex, ey, ez, t){
  const h = rayHit(ex, ey, ez, t.x, t.y, t.z, G_WORLD);
  return !h || h.distance > Math.hypot(t.x - ex, t.y - ey, t.z - ez) - 0.9;
}
function unitSees(ex, ey, ez, heading, fov, range, t){
  const dx = t.x - ex, dz = t.z - ez, d = Math.hypot(dx, dz);
  if (d > range) return false;
  if (d > 3.5 && Math.abs(wrapAngle(Math.atan2(dx, dz) - heading)) > fov / 2) return false;
  return policeLos(ex, ey, ez, t);
}
function policeVision(){
  const t = policeTarget();
  let seen = false;
  if (player.hiding) return false;                                                   // w kontenerze: tylko sprawdzenie z bliska (updateCop)
  for (const n of npcs){
    const C = n.cop; if (!C || C.crew <= 0 || C.role === 'leave' || C.role === 'empty'){ if (C) C.sees = false; continue; }
    C.sees = unitSees(n.pos.x, n.y + 1.4, n.pos.y, n.heading, 2.2, 70, t); if (C.sees) seen = true;
  }
  for (const c of COPS){
    c.sees = c.state !== 'down' && c.state !== 'rope' && c.state !== 'return' && unitSees(c.pos.x, c.y + 1.65, c.pos.y, c.heading, 2.1, WANTED.phase === 'search' ? 40 : 50, t);
    if (c.sees) seen = true;
  }
  for (const h of POLICE.heli){
    if (h.gone || !h.ai || h.ai.takeoff > 0){ if (h.ai) h.ai.sees = false; continue; }
    const r = 22 + Math.max(0, h.pos.y - t.y) * 0.55, d = Math.hypot(t.x - h.pos.x, t.z - h.pos.z);
    h.ai.sees = d < r && policeLos(h.pos.x, h.pos.y - 1.7, h.pos.z, t); if (h.ai.sees) seen = true;
  }
  return seen;
}

/* --- klatka --- */
function updatePolice(dt){
  if (!policeOn){ if (WANTED.stars) wantedClear(null); return; }
  if (player.dead && WANTED.stars > 0 && !player.busted) wantedClear(null);       // śmierć kasuje poszukiwanie
  /* patrol: uzupełnianie radiowozów (bez pościgu), helikopter */
  POLICE.patrolT -= dt;
  if (POLICE.patrolT <= 0){
    POLICE.patrolT = 4;
    const patrol = npcs.filter(n => n.cop && n.cop.role === 'patrol').length, all = npcs.filter(n => n.cop).length;
    for (let k = 0; k < Math.min(3, POLICE_PATROL_N - patrol, POLICE_CAR_MAX - all); k++) spawnPolicePatrol();   // na starcie od razu kilka
    for (const n of npcs.slice()){ const C = n.cop; if (C && C.role === 'empty' && WANTED.stars === 0){ const pp = playerWorldPos(); if (Math.hypot(n.pos.x - pp.x, n.pos.y - pp.z) > 150) removeNpcCar(n); } }
  }
  POLICE.heliT -= dt;
  const hw = policeHeliWant(), act = POLICE.heli.filter(h => h.ai && h.ai.role !== 'leave');
  if (act.length < hw && POLICE.heliT <= 0){ policeHeliLaunch(); POLICE.heliT = 3; }
  for (let k = hw; k < act.length; k++) act[k].ai.role = 'leave';                    // za dużo (gwiazdki spadły / zgubiony) — odlatuje
  /* wzrok co 0.2 s; zgłoszenie (przestępstwo) liczy się jak widzenie */
  POLICE.visT -= dt;
  if (POLICE.visT <= 0){ POLICE.visT = 0.2; WANTED.vis = WANTED.stars > 0 ? policeVision() : false; }
  if (WANTED.reportT > 0) WANTED.reportT -= dt;
  WANTED.seen = WANTED.stars > 0 && (WANTED.vis || WANTED.reportT > 0);
  if (WANTED.flashT > 0) WANTED.flashT -= dt;
  if (WANTED.stars > 0){
    const t = policeTarget();
    if (WANTED.seen){ WANTED.last.x = t.x; WANTED.last.y = t.y; WANTED.last.z = t.z; WANTED.last.gy = t.gy; WANTED.unseenT = 0; if (WANTED.phase !== 'chase'){ WANTED.phase = 'chase'; for (const n of npcs) if (n.cop && n.cop.role === 'search') n.cop.role = 'chase'; } }
    else {
      WANTED.unseenT += dt;
      if (WANTED.phase === 'chase' && WANTED.unseenT > 3){ WANTED.phase = 'search'; WANTED.searchT = 0; WANTED.searchMax = 14 + WANTED.stars * 4; for (const n of npcs) if (n.cop && (n.cop.role === 'chase' || n.cop.role === 'stopped') && n.cop.crew > 0) n.cop.role = 'search'; }
      if (WANTED.phase === 'search'){ WANTED.searchT += dt; if (WANTED.searchT > WANTED.searchMax) wantedClear('Zgubiłeś policję'); }
    }
    if (!WANTED.seen || WANTED.stars === 0) WANTED.bust = Math.max(0, WANTED.bust - dt * 2);
    /* wysyłanie jednostek: najbliższe patrole do pościgu, nowe radiowozy poza kadrem */
    POLICE.dispatchT -= dt;
    if (POLICE.dispatchT <= 0 && WANTED.stars > 0){
      POLICE.dispatchT = 1.2;
      const active = npcs.filter(n => n.cop && (n.cop.role === 'chase' || n.cop.role === 'stopped' || n.cop.role === 'search')).length;
      let need = WANT_CARS[WANTED.stars] - active;
      const patrols = npcs.filter(n => n.cop && n.cop.role === 'patrol').sort((a, b) => Math.hypot(a.pos.x - t.x, a.pos.y - t.z) - Math.hypot(b.pos.x - t.x, b.pos.y - t.z));
      for (const n of patrols){ if (need <= 0) break; if (Math.hypot(n.pos.x - t.x, n.pos.y - t.z) > 500) break; n.cop.role = WANTED.phase === 'search' ? 'search' : 'chase'; n.cop.route = null; need--; }
      if (need > 0 && npcs.filter(n => n.cop).length < POLICE_CAR_MAX) spawnPoliceChaser();
    }
    /* radiowóz bez załogi i bez policjantów przy nim — porzucony */
    for (const n of npcs){ const C = n.cop; if (C && C.role === 'stopped' && C.crew === 0 && !COPS.some(c => c.car === n && c.state !== 'down')) C.role = 'empty'; }
    /* gracz odjeżdża: policjanci wracają do radiowozu, który znowu rusza w pościg */
    if (t.car && Math.hypot(t.vx, t.vz) > 6) for (const c of COPS) if (c.car && c.state === 'chase' && npcs.indexOf(c.car) >= 0 && Math.hypot(c.pos.x - t.x, c.pos.y - t.z) > 16) c.state = 'board';
  }
  POLICE.slotT = (POLICE.slotT || 0) - dt;
  if (POLICE.slotT <= 0){ POLICE.slotT = 0.5; const t = policeTarget(); COPS.filter(c => c.state === 'chase').sort((a, b) => Math.hypot(a.pos.x - t.x, a.pos.y - t.z) - Math.hypot(b.pos.x - t.x, b.pos.y - t.z)).forEach((c, k) => { c.slot = k; }); }
  for (const c of COPS.slice()){
    if (c.state === 'board'){                                                       // powrót do auta w trakcie pościgu
      const car = c.car; if (!car || npcs.indexOf(car) < 0){ c.state = 'chase'; continue; }
      if (copMoveTo(c, car.pos.x, car.pos.y, 6, dt)){ c.phase += dt * 9; c.legL.rotation.x = Math.sin(c.phase) * 0.6; c.legR.rotation.x = -Math.sin(c.phase) * 0.6; }
      c.body.position.set(c.pos.x, c.y + 0.85, c.pos.y); c.group.position.set(c.pos.x, c.y, c.pos.y); c.group.rotation.y = c.heading;
      if (Math.hypot(car.pos.x - c.pos.x, car.pos.y - c.pos.y) < 2.6){ car.cop.crew++; removeCop(c); if (car.cop.role === 'stopped' || car.cop.role === 'empty'){ car.cop.role = 'chase'; car.cop.route = null; } }
      continue;
    }
    updateCop(c, dt);
  }
  { const act2 = POLICE.heli.filter(h => h.ai && h.ai.role !== 'leave'); for (const h of POLICE.heli.slice()) updatePoliceHeli(h, dt, Math.max(0, act2.indexOf(h)), act2.length); }
  copSeparate();
  /* koguty i syrena */
  const blink = Math.floor(clock * 6) % 2, pp = playerWorldPos();
  let sd = 1e9;
  for (const n of npcs){
    const C = n.cop; if (!C) continue;
    const on = WANTED.stars > 0 && (C.role === 'chase' || C.role === 'search' || C.role === 'stopped');
    C.red.color.setHex(on && blink ? 0xff2020 : 0x4a0a0a); C.blue.color.setHex(on && !blink ? 0x2050ff : 0x0a144a);
    if (on && C.role !== 'stopped') sd = Math.min(sd, Math.hypot(n.pos.x - pp.x, n.pos.y - pp.z));
  }
  Sound.siren(sd < 1e8 ? clamp(1 - sd / 220, 0, 1) : 0);
  policeHud(dt);
}

/* --- HUD: gwiazdki (jaskrawe — widzą cię, szare i mrugające — szukają), napis, pasek zatrzymania, winieta pościgu --- */
const _wEl = document.getElementById('wanted'), _wStars = _wEl ? Array.from(_wEl.querySelectorAll('.st')) : [], _wTxt = document.getElementById('wantedTxt'), _wBust = document.getElementById('wantedBust'), _vig = document.getElementById('chaseVig');
function policeHud(dt){
  if (!_wEl) return;
  const s = WANTED.stars, on = s > 0;
  _wEl.classList.toggle('on', on);
  _wEl.classList.toggle('seen', on && WANTED.seen);
  _wEl.classList.toggle('lost', on && !WANTED.seen);
  _wEl.classList.toggle('pulse', WANTED.flashT > 0);
  _wStars.forEach((e, k) => e.classList.toggle('lit', k < s));
  const txt = !on ? '' : WANTED.seen ? 'WIDZĄ CIĘ' : player.hiding ? 'UKRYTY — SZUKAJĄ CIĘ' : 'SZUKAJĄ CIĘ · ' + Math.max(0, Math.ceil(WANTED.searchMax - WANTED.searchT)) + ' s';
  if (_wTxt.textContent !== txt) _wTxt.textContent = txt;
  _wBust.style.width = clamp(WANTED.bust / 1.2 * 100, 0, 100) + '%'; _wBust.parentNode.classList.toggle('on', WANTED.bust > 0.05);
  _vig.classList.toggle('on', on && WANTED.seen && !player.dead);
  _vig.classList.toggle('blue', Math.floor(clock * 2.5) % 2 === 0);
}

/* --- znaczniki na mapach: stożki widzenia, migające czerwono-niebiesko w pościgu, helikopter z wirnikiem --- */
function policeDrawMap(g, toMap, zs, big, lvlY){
  const chase = WANTED.stars > 0, blink = Math.floor(clock * 4) % 2;
  const dimAt = y => lvlY !== null && lvlY !== undefined && Math.abs(y - lvlY) > 2.5;      // inny poziom (wiadukt nad / pod) — przygaszony
  const cone = (x, z, h, fov, range, sees) => {
    const p = toMap(x, z), r = range * zs, a = -h + Math.PI;                        // ten sam wzór obrotu co strzałka gracza (-kurs + PI)
    g.save(); g.translate(p[0], p[1]); g.rotate(a);
    g.fillStyle = sees ? 'rgba(255,70,60,.28)' : chase ? 'rgba(120,160,255,.18)' : 'rgba(120,160,255,.10)';
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r, -Math.PI / 2 - fov / 2, -Math.PI / 2 + fov / 2); g.closePath(); g.fill(); g.restore();
  };
  const blip = (x, z, sz) => { const p = toMap(x, z); g.fillStyle = chase ? (blink ? '#ff3030' : '#3a6cff') : '#3a6cff'; g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1; g.beginPath(); g.arc(p[0], p[1], sz, 0, TAU); g.fill(); g.stroke(); };
  for (const n of npcs){ const C = n.cop; if (!C) continue; if (C.crew > 0 && C.role !== 'leave' && C.role !== 'empty') cone(n.pos.x, n.pos.y, n.heading, 2.2, 70, C.sees); }
  for (const c of COPS){ if (c.state === 'down' || c.state === 'rope') continue; cone(c.pos.x, c.pos.y, c.heading, 2.1, WANTED.phase === 'search' ? 40 : 50, c.sees); }
  for (const h of POLICE.heli){ if (h.gone || !h.ai) continue; const p = toMap(h.pos.x, h.pos.z), r = (22 + Math.max(0, h.pos.y) * 0.55) * zs; g.fillStyle = h.ai.sees ? 'rgba(255,70,60,.22)' : 'rgba(120,160,255,.12)'; g.beginPath(); g.arc(p[0], p[1], r, 0, TAU); g.fill(); }
  for (const n of npcs) if (n.cop){ g.globalAlpha = dimAt(n.y || 0) ? 0.35 : 1; blip(n.pos.x, n.pos.y, big ? 4.5 : 3.6); }
  for (const c of COPS) if (c.state !== 'down'){ g.globalAlpha = dimAt(c.y) ? 0.35 : 1; blip(c.pos.x, c.pos.y, big ? 2.6 : 2.1); }
  g.globalAlpha = 1;
  for (const h of POLICE.heli){
    if (h.gone) continue; const p = toMap(h.pos.x, h.pos.z);
    g.save(); g.translate(p[0], p[1]); g.rotate(-h.yaw + Math.PI);
    g.strokeStyle = chase ? (blink ? '#ff3030' : '#3a6cff') : '#3a6cff'; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, big ? 9 : 7, 0, TAU); g.stroke();
    g.fillStyle = g.strokeStyle; g.fillRect(-1.6, -5, 3.2, 10); g.fillRect(-0.8, 3, 1.6, 5);
    g.restore();
  }
}
