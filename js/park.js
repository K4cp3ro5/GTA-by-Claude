/* ---------------------------------------------------------------
   7a5. PARK ROZRYWKI — wschodni pas podmiejski wyspy głównej (PARK: x 280…392, |z| ≤ 160), wejście z alei j=6
   (plac i brama przy z = 0). Alejki z krawężnikami i fugami, plac z fontanną, budki z szyldami, ławki, kosze,
   klomby, żywopłoty, drogowskazy, barierki kolejek do atrakcji, zwiedzający.
   Atrakcje (wszystkie z przejażdżką — RIDES, F przy wejściu, tryb 'ride'):
   - kolejki górskie SMOK i ŻABKA: tor z próbek co 1 m (superelipsa, stacja na prostej, wyciąg, górki,
     hamowanie), rama toru z przechyłem interpolowana między próbkami, kamera z pierwszego wagonu wygładzana;
   - diabelski młyn (gondola przy peronie), wieża swobodnego spadania, karuzela łańcuchowa, karuzela z konikami
     (cykl: jazda → postój, wsiadanie tylko na postoju; wysiadka po cyklu);
   - autodrom: samochodzik sterowany W/S/A/D, odbicia od band i innych aut, F = wysiadka w dowolnej chwili.
   Budowa: buildPark() z city-generation.js; ruch: updatePark(dt) z main-loop.js.
   --------------------------------------------------------------- */
const PARK = { x0: 280, x1: 392, z0: -160, z1: 160, gateX: 296, boulX: 336, plaza: { x: 336, z: 0, r: 13 } };
const COASTERS = [], RIDES = [];
const PARK_RIDES = { carousel: null, wheel: null, swing: null, tower: null, bumper: null, fountain: null };
const parkVisitors = [];
const PKS = [];                                                  // statyczne detale parku (jedna scalona siatka)
const _pkMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const _pkMatD = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
function pkMesh(parts, dbl){ const m = new THREE.Mesh(mergeColored(parts), dbl ? _pkMatD : _pkMat); m.castShadow = true; m.receiveShadow = true; return m; }
const pkB = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const pkC = (r0, r1, h, s) => new THREE.CylinderGeometry(r0, r1, h, s || 14);
const pkS = (geo, color, x, y, z, rx, ry, rz) => PKS.push({ geo: geo, color: color, x: x, y: y, z: z, rx: rx || 0, ry: ry || 0, rz: rz || 0 });
let rideLookPitch = 0;                                           // mysz w pionie podczas przejażdżki (controls.js)

/* ===============================================================
   KOLEJKI GÓRSKIE
   =============================================================== */
function coasterBuild(cfg){
  /* 1) krzywa pozioma: superelipsa (płaskie boki — stacja na prostej) z falowaniem poza stacją */
  const raw = [], N = 4000;
  for (let k = 0; k <= N; k++){
    const th = cfg.th0 + k / N * TAU, cs = Math.cos(th), sn = Math.sin(th);
    const away = smooth01((Math.abs(wrapAngle(th - cfg.stTh)) - 0.45) / 0.5);
    const w = 1 + cfg.wob * Math.sin(cfg.wk * th + cfg.wph) * away;
    raw.push([cfg.cx + cfg.rx * w * Math.sign(cs) * Math.pow(Math.abs(cs), cfg.p), cfg.cz + cfg.rz * w * Math.sign(sn) * Math.pow(Math.abs(sn), cfg.p)]);
  }
  const acc = [0]; for (let k = 1; k <= N; k++) acc.push(acc[k - 1] + Math.hypot(raw[k][0] - raw[k - 1][0], raw[k][1] - raw[k - 1][1]));
  const L = Math.floor(acc[N]), P = [];
  for (let s = 0, k = 0; s < L; s++){
    const t = s / L * acc[N];
    while (k < N - 1 && acc[k + 1] < t) k++;
    const f = (t - acc[k]) / ((acc[k + 1] - acc[k]) || 1);
    P.push({ x: lerp(raw[k][0], raw[k + 1][0], f), z: lerp(raw[k][1], raw[k + 1][1], f), y: 0 });
  }
  /* 2) profil wysokości: stacja, wyciąg (łagodny początek i wierzchołek), górki o malejącej wysokości, hamowanie */
  const c = Object.assign({ P: P, L: L }, cfg);
  c.sStop = cfg.station; c.sLift0 = cfg.station + 6; c.sTop = c.sLift0 + (cfg.H - cfg.yS) / cfg.liftSlope + 8; c.sBrake = L - cfg.brake;
  const yAt = s => {
    if (s <= c.sLift0) return cfg.yS;
    if (s <= c.sTop){ const t = (s - c.sLift0) / (c.sTop - c.sLift0); return cfg.yS + (cfg.H - cfg.yS) * (t < 0.12 ? t * t / 0.24 / 0.94 : t > 0.88 ? 1 - (1 - t) * (1 - t) / 0.24 / 0.94 : (t - 0.06) / 0.94); }
    if (s <= c.sBrake){ const t = (s - c.sTop) / (c.sBrake - c.sTop), env = 1 - cfg.decay * t; return cfg.yLow + (cfg.H - cfg.yLow) * env * (0.5 + 0.5 * Math.cos(TAU * cfg.hills * t)); }
    const t = (s - c.sBrake) / cfg.brake; return lerp(cfg.yLow, cfg.yS, smooth01(t));
  };
  P.forEach((p, s) => { p.y = yAt(s); });
  /* 3) przechył z krzywizny (okno ±6 m) i prędkości projektowej, mocno wygładzony (bez szarpnięć w zakrętach) */
  const g = 9.81;
  P.forEach((p, i) => {
    const a = P[(i - 6 + L) % L], b = P[(i + 6) % L], a2 = P[(i - 7 + L) % L], b2 = P[(i + 7) % L];
    const kap = wrapAngle(Math.atan2(b2.x - b.x, b2.z - b.z) - Math.atan2(a.x - a2.x, a.z - a2.z)) / 13, v2 = Math.max(9, 2 * g * (cfg.H - p.y));
    p.bankT = i < c.sTop + 2 && i > c.sLift0 - 4 ? 0 : clamp(Math.atan(v2 * kap / g), -0.7, 0.7);
  });
  for (let pass = 0; pass < 6; pass++){ const B = P.map(p => p.bankT); P.forEach((p, i) => { let s = 0; for (let k = -4; k <= 4; k++) s += B[(i + k + L) % L]; p.bankT = s / 9; }); }
  /* 4) rama: styczna 3D (różnica centralna ±2 m), bok poziomy w LEWO od kierunku jazdy, góra ⟂; przechył w zakręcie
     w lewo (kap > 0) — góra do środka łuku */
  P.forEach((p, i) => {
    const a = P[(i - 2 + L) % L], b = P[(i + 2) % L];
    let tx = b.x - a.x, ty = b.y - a.y, tz = b.z - a.z; const tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl;
    p.t = [tx, ty, tz]; p.bank = p.bankT;
    let sx = tz, sz = -tx; const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
    let gx = -sz * ty, gy = sz * tx - sx * tz, gz = sx * ty;
    if (gy < 0){ gx = -gx; gy = -gy; gz = -gz; }
    const cb = Math.cos(p.bank), sb = Math.sin(p.bank);
    p.side = [sx * cb - gx * sb, -gy * sb, sz * cb - gz * sb];
    p.up = [gx * cb + sx * sb, gy * cb, gz * cb + sz * sb];
  });
  COASTERS.push(c);
  return c;
}
/* punkt toru w s (z interpolacją ramy między próbkami — płynny ruch wagonów i kamery) */
function coasterSample(c, s, out){
  const L = c.L; s = ((s % L) + L) % L;
  const i = Math.floor(s), f = s - i, a = c.P[i], b = c.P[(i + 1) % L];
  out.x = lerp(a.x, b.x, f); out.y = lerp(a.y, b.y, f); out.z = lerp(a.z, b.z, f);
  const nrm = (u, v) => { const x = lerp(u[0], v[0], f), y = lerp(u[1], v[1], f), z = lerp(u[2], v[2], f), l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
  out.t = nrm(a.t, b.t); out.side = nrm(a.side, b.side); out.up = nrm(a.up, b.up);
  return out;
}
/* geometria toru: dwie szyny, kręgosłup, podkłady, łańcuch na wyciągu, podpory z kolizją */
function coasterGeometry(c){
  const P = c.P, L = c.L, rail = CB(c.railCol), spine = CB(c.spineCol), sup = CB(c.supCol);
  const off = (p, a, b) => [p.x + p.side[0] * a + p.up[0] * b, p.y + p.side[1] * a + p.up[1] * b, p.z + p.side[2] * a + p.up[2] * b];
  const tube = (buf, a, b, w, h) => {
    for (let i = 0; i < L; i++){
      const p = P[i], q = P[(i + 1) % L], C = [[-w, -h], [w, -h], [w, h], [-w, h]];
      for (let k = 0; k < 4; k++){
        const c0 = C[k], c1 = C[(k + 1) % 4], mx = (c0[0] + c1[0]) / 2, my = (c0[1] + c1[1]) / 2;
        quadOut(buf, off(p, a + c0[0], b + c0[1]), off(p, a + c1[0], b + c1[1]), off(q, a + c1[0], b + c1[1]), off(q, a + c0[0], b + c0[1]),
                [p.side[0] * mx + p.up[0] * my, p.side[1] * mx + p.up[1] * my, p.side[2] * mx + p.up[2] * my]);
      }
    }
  };
  tube(rail, -0.55, 0, 0.07, 0.07); tube(rail, 0.55, 0, 0.07, 0.07);
  tube(spine, 0, -0.42, 0.2, 0.2);
  for (let i = 0; i < L; i += 2){ const p = P[i], A = off(p, -0.55, -0.05), B = off(p, 0.55, -0.05);
    spine.boxRot((A[0] + B[0]) / 2, (A[1] + B[1]) / 2 - 0.12, (A[2] + B[2]) / 2, 1.2, 0.18, 0.22, Math.atan2(p.t[0], p.t[2]), 1, true); }
  for (let i = c.sLift0; i < c.sTop - 4; i++){ const p = P[i], A = off(p, 0, 0.02); CB(0x3a3c40).boxRot(A[0], A[1], A[2], 0.25, 0.08, 0.6, Math.atan2(p.t[0], p.t[2]), 1, true); }
  for (let i = 4; i < L; i += 7){
    if (i < c.station + 3 && i > c.station - c.cars * 2.4 - 6) continue;
    const p = P[i], top = p.y - 0.62;
    if (top < 1.2) continue;
    const r = top > 20 ? 0.45 : 0.3;
    sup.box(p.x, top / 2, p.z, r * 2, top, r * 2, 2, false);
    CB(0x8a8c8f).box(p.x, 0.15, p.z, r * 4, 0.3, r * 4, 1, true);
    staticBox(p.x, top / 2, p.z, r * 2, top, r * 2);
    if (top > 14) sup.boxRot(p.x, top * 0.5, p.z, 0.2, 0.2, 2.6, Math.atan2(p.side[0], p.side[2]), 1, true);
  }
}
/* pociąg: wagoniki (model z przodem w +Z), pierwszy wagonik z nosem i lampą, pasażerowie NPC */
function coasterTrain(c){
  c.cars3 = [];
  for (let k = 0; k < c.cars; k++){
    const g = new THREE.Group();
    const parts = [
      { geo: pkB(1.5, 0.5, 2.0), color: c.carCol, y: 0.42 }, { geo: pkB(1.56, 0.12, 2.06), color: 0xf2f0ea, y: 0.7 },
      { geo: pkB(1.3, 0.55, 0.12), color: 0x26282c, y: 0.95, z: -0.55 }, { geo: pkB(1.3, 0.55, 0.12), color: 0x26282c, y: 0.95, z: 0.35 },
      { geo: pkB(1.2, 0.08, 0.08), color: 0xe0b020, y: 1.05, z: -0.2 }, { geo: pkB(1.2, 0.08, 0.08), color: 0xe0b020, y: 1.05, z: 0.7 },
      { geo: pkB(1.4, 0.25, 1.6), color: 0x1b1c1f, y: 0.1 }
    ];
    if (k === 0) parts.push({ geo: pkB(1.5, 0.45, 0.6), color: c.carCol, y: 0.55, z: 1.25, rx: -0.5 }, { geo: pkB(0.5, 0.2, 0.05), color: 0xfff3b0, y: 0.6, z: 1.52 });
    g.add(pkMesh(parts));
    scene.add(g);
    c.cars3.push({ g: g, pax: k % 2 === 1 });                              // pasażerowie w co drugim wagoniku (tworzeni w coasterPlace — player.js wczytuje się później)
  }
  c.s = c.sStop; c.v = 0; c.state = 'wait'; c.t = 4 + COASTERS.indexOf(c) * 3; c.lap = false; c.rider = false;
}
const _cs = {}, _cs2 = {};
const _pkM = new THREE.Matrix4(), _pkV1 = new THREE.Vector3(), _pkV2 = new THREE.Vector3(), _pkV3 = new THREE.Vector3(), _pkQ = new THREE.Quaternion();
function coasterPlace(c){
  c.cars3[0].g.visible = !c.rider;                                         // jadący gracz siedzi w pierwszym wagonie (kamera z jego oczu)
  for (let k = 0; k < c.cars3.length; k++){
    const car = c.cars3[k], q = coasterSample(c, c.s - k * 2.4, _cs);
    if (car.pax){ car.pax = false; const h = buildHumanoid({ skin: 0xd9a882, shirt: [0xc0392b, 0x2a6cd8, 0x2f8a4c][k % 3], pants: 0x2c2f36, hair: 0x2a1f19 });
      h.group.scale.setScalar(0.85); h.group.position.set(0.32, -0.15, -0.15); h.legL.rotation.x = h.legR.rotation.x = -1.4; h.armL.rotation.x = h.armR.rotation.x = -2.6; car.g.add(h.group); }
    car.g.position.set(q.x + q.up[0] * 0.08, q.y + q.up[1] * 0.08, q.z + q.up[2] * 0.08);
    const t = q.t, u = q.up, x = [u[1] * t[2] - u[2] * t[1], u[2] * t[0] - u[0] * t[2], u[0] * t[1] - u[1] * t[0]];   // +X = góra × styczna
    _pkM.makeBasis(_pkV1.set(x[0], x[1], x[2]), _pkV2.set(u[0], u[1], u[2]), _pkV3.set(t[0], t[1], t[2]));
    car.g.quaternion.setFromRotationMatrix(_pkM);
  }
}
/* ruch pociągu: postój → wyjazd ze stacji (3 m/s) → wyciąg → grawitacja z tarciem → hamowanie → postój */
function coasterStep(c, dt){
  if (c.state === 'wait'){
    c.v = 0; c.t -= dt;
    if (c.t <= 0){ c.state = 'go'; c.lap = false; }
    return;
  }
  const L = c.L, sm = ((c.s % L) + L) % L, g = 9.81;
  if (!c.lap && sm > c.sTop) c.lap = true;
  if (!c.lap) c.v = approach(c.v, sm < c.sLift0 ? 3 : c.liftV, 2 * dt);
  else if (sm >= c.sTop && sm < c.sBrake){
    const y = coasterSample(c, sm, _cs).y;
    c.v = Math.max(4, Math.sqrt(Math.max(0, c.liftV * c.liftV + 2 * g * (c.H - y) - 2 * c.mu * g * (sm - c.sTop))));
  } else if (sm >= c.sBrake) c.v = approach(c.v, 3, 5 * dt);
  else {                                                                    // po okrążeniu: dojazd do punktu postoju
    const rest = c.sStop - sm;
    c.v = Math.min(c.v, Math.max(0.6, Math.sqrt(Math.max(0, 2 * 1.2 * rest))));
    if (rest <= 0.05){ c.s += rest; c.v = 0; c.state = 'wait'; c.t = 9; if (c.rider) rideEnd(c.ride); return; }
  }
  c.s += c.v * dt;
  if (c.s > L * 1000) c.s -= L * 1000;
}
/* kamera z pierwszego wagonu: pozycja i kierunek z interpolowanej ramy, obrót wygładzany (slerp) — bez szarpnięć */
function coasterCam(c, dt){
  const q = coasterSample(c, c.s + 0.4, _cs), ah = coasterSample(c, c.s + 12, _cs2), u = q.up;
  camera.position.set(q.x + u[0] * 1.5, q.y + u[1] * 1.5, q.z + u[2] * 1.5);
  if (clock - lastMouseMove > 1.5){ planeCamYaw = angleDamp(planeCamYaw, 0, 1.5, dt); rideLookPitch = damp(rideLookPitch, 0, 1.5, dt); }
  const dx = ah.x - camera.position.x, dy = ah.y + 0.6 - camera.position.y, dz = ah.z - camera.position.z;
  const cy = Math.cos(planeCamYaw), sy = Math.sin(planeCamYaw), rx = dx * cy + dz * sy, rz = -dx * sy + dz * cy;
  _pkV1.set(camera.position.x + rx, camera.position.y + dy + rideLookPitch * 10, camera.position.z + rz);
  _pkM.lookAt(camera.position, _pkV1, _pkV2.set(u[0], u[1], u[2]));
  _pkQ.setFromRotationMatrix(_pkM);
  camera.quaternion.slerp(_pkQ, 1 - Math.exp(-9 * dt));
}

/* ===============================================================
   PRZEJAŻDŻKI — wspólny mechanizm (RIDES: { name, board, exit, ready(), wait, start(), tick?(), cam(dt), pos(), speed(), canExit?, end?() })
   =============================================================== */
let curRide = null;
function rideStart(R){
  if (!R.ready()){ hudToast(R.wait); return; }
  curRide = R; R.riding = true; R.start();
  mode = 'ride'; player.mesh.visible = false; delBody(player.body);
  planeCamYaw = 0; rideLookPitch = 0;
  hudToast(R.name + ': ' + (R.help || 'trzymaj się! (mysz — rozglądanie się)'), 3.5);
}
function rideEnd(R, force){
  if (!R || !R.riding) return;
  R.riding = false; if (R.end) R.end();
  curRide = null;
  const b = R.exit || R.board;
  mode = 'foot'; player.mesh.visible = true;
  player.body.position.set(b.x, 1.3, b.z); player.body.velocity.set(0, 0, 0); player.body.wakeUp(); addBody(player.body);
  if (b.facing !== undefined){ player.facing = b.facing; camYaw = b.facing + Math.PI; }
  player.fallSpeed = 0; camera.up.set(0, 1, 0);
  Sound.engine(false, 0, 0);
  if (!force) hudToast('Koniec przejażdżki — ' + R.name, 2);
}
function rideCamera(dt){
  curRide.cam(dt);
  const f = 76 + fovAdd; if (Math.abs(camera.fov - f) > 0.01){ camera.fov = f; camera.updateProjectionMatrix(); }
  const p = curRide.pos();
  sun.target.position.set(p.x, 0, p.z); sun.position.set(p.x + lightDir.x * 95, lightDir.y * 95 + 2, p.z + lightDir.z * 95);
  camera.getWorldDirection(_pkV3); camYaw = Math.atan2(-_pkV3.x, -_pkV3.z);
}
function ridePos(){ return curRide.pos(); }
function rideSpeed(){ return curRide && curRide.speed ? curRide.speed() : 0; }
/* kamera „z siedzenia”: oko w punkcie, patrzy w kierunku (fx, fz) + mysz (odchylenie i pochylenie) */
function seatCam(eye, fx, fz, dt, pitch0){
  if (clock - lastMouseMove > 2){ planeCamYaw = angleDamp(planeCamYaw, 0, 1.2, dt); rideLookPitch = damp(rideLookPitch, 0, 1.2, dt); }
  const h = Math.atan2(fx, fz) + planeCamYaw, pt = clamp((pitch0 || 0) + rideLookPitch, -1.3, 1.1);
  camera.position.copy(eye);
  _pkV1.set(eye.x + Math.sin(h) * Math.cos(pt), eye.y + Math.sin(pt), eye.z + Math.cos(h) * Math.cos(pt));
  camera.up.set(0, 1, 0); camera.lookAt(_pkV1);
}

/* ===============================================================
   BUDOWA — detale
   =============================================================== */
const PK_PAV = 0x8d8270, PK_PAV2 = 0x7d7262, PK_CURB = 0x5c564c, PK_JOINT = 0x6e6556;
/* alejka (prostokąt osiowy): nawierzchnia z fugami co 2 m, krawężniki po obu dłuższych bokach */
function pkPath(x0, x1, z0, z1, col, noCurb){
  const y = 0.02, alongX = x1 - x0 > z1 - z0;
  CB(col || PK_PAV).plane((x0 + x1) / 2, y, (z0 + z1) / 2, x1 - x0, z1 - z0, 1, 1);
  if (alongX){ for (let x = x0 + 2; x < x1 - 0.5; x += 2) CB(PK_JOINT).plane(x, y + 0.003, (z0 + z1) / 2, 0.06, z1 - z0 - 0.4, 1, 1);
    CB(PK_JOINT).plane((x0 + x1) / 2, y + 0.003, (z0 + z1) / 2, x1 - x0 - 0.4, 0.06, 1, 1); }
  else { for (let z = z0 + 2; z < z1 - 0.5; z += 2) CB(PK_JOINT).plane((x0 + x1) / 2, y + 0.003, z, x1 - x0 - 0.4, 0.06, 1, 1);
    CB(PK_JOINT).plane((x0 + x1) / 2, y + 0.003, (z0 + z1) / 2, 0.06, z1 - z0 - 0.4, 1, 1); }
  if (!noCurb){
    if (alongX) for (const z of [z0 + 0.15, z1 - 0.15]) CB(PK_CURB).box((x0 + x1) / 2, 0.04, z, x1 - x0, 0.08, 0.3, 1, true);
    else for (const x of [x0 + 0.15, x1 - 0.15]) CB(PK_CURB).box(x, 0.04, (z0 + z1) / 2, 0.3, 0.08, z1 - z0, 1, true);
  }
  mapExtras.push({ t: 'rect', x0: x0, x1: x1, z0: z0, z1: z1, c: '#8f8670' });
}
/* ławka parkowa na ziemi: żeliwne boki, siedzisko i oparcie z listew */
function pkBench(x, z, rot){
  const s = Math.sin(rot), c = Math.cos(rot), L = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  for (const lx of [-0.75, 0.75]){ const p = L(lx, 0); pkS(pkB(0.08, 0.45, 0.5), 0x2a2c30, p[0], 0.225, p[1], 0, rot); const q = L(lx, -0.24); pkS(pkB(0.08, 0.5, 0.06), 0x2a2c30, q[0], 0.7, q[1], 0, rot); }
  for (const lz of [-0.15, 0, 0.15]){ const p = L(0, lz); pkS(pkB(1.8, 0.05, 0.12), 0x9b6b3d, p[0], 0.47, p[1], 0, rot); }
  for (const yy of [0.62, 0.78]){ const p = L(0, -0.26); pkS(pkB(1.8, 0.1, 0.04), 0x9b6b3d, p[0], yy, p[1], 0, rot); }
  staticBoxRot(x, 0.45, z, 1.8, 0.9, 0.55, rot);
}
function pkBin(x, z){ pkS(pkC(0.3, 0.26, 0.85, 10), 0x2f6b3a, x, 0.43, z); pkS(pkC(0.33, 0.33, 0.06, 10), 0x1f2a22, x, 0.88, z); staticBox(x, 0.45, z, 0.6, 0.9, 0.6); }
/* budka (front w stronę face): ściany, lada, dach, markiza w paski na słupkach, szyld z napisem, towar na ladzie */
function pkStall(x, z, face, name, col){
  const fx = Math.sin(face), fz = Math.cos(face), rx = Math.cos(face), rz = -Math.sin(face), P = (a, b) => [x + rx * a + fx * b, z + rz * a + fz * b];
  const w = 4.4, d = 3, h = 2.5;
  let p = P(0, -d / 2 + 0.15); pkS(pkB(w, h, 0.3), 0xf2f0ea, p[0], h / 2, p[1], 0, face);
  for (const s of [-1, 1]){ p = P(s * (w / 2 - 0.12), -0.2); pkS(pkB(0.24, h, d - 0.4), 0xf2f0ea, p[0], h / 2, p[1], 0, face); }
  p = P(0, d / 2 - 0.35); pkS(pkB(w - 0.3, 1.05, 0.5), col, p[0], 0.525, p[1], 0, face);
  pkS(pkB(w - 0.1, 0.08, 0.7), 0x7a5a3a, p[0], 1.09, p[1], 0, face);
  p = P(0, -0.1); pkS(pkB(w, 0.15, d + 0.2), 0x5c5f66, p[0], h + 0.07, p[1], 0, face);
  for (const s of [-1, 1]){ p = P(s * (w / 2 - 0.1), d / 2 + 0.95); pkS(pkB(0.08, 2.35, 0.08), 0xd8d4cc, p[0], 1.17, p[1], 0, face); }
  for (let i = 0; i < 6; i++){ p = P(-w / 2 + 0.37 + i * (w - 0.1) / 6, d / 2 + 0.5); pkS(pkB((w - 0.1) / 6, 0.06, 1.4), i % 2 ? 0xf2f0ea : col, p[0], 2.38, p[1], -0.22, face); }
  for (let i = 0; i < 4; i++){ p = P(-1.4 + i * 0.95, d / 2 - 0.3); pkS(pkB(0.4, 0.35, 0.3), [0xe0a52c, 0xd35fa0, 0x8fd16b, 0xc0392b][i], p[0], 1.3, p[1], 0, face); }
  p = P(0, d / 2 - 0.05); pkS(pkB(w - 0.4, 0.75, 0.1), 0x26282c, p[0], h + 0.55, p[1], 0, face);
  const sw = (w - 0.7) / 2, a = P(-sw, d / 2 + 0.02), b = P(sw, d / 2 + 0.02);
  wordSignQuad(name, '#26282c', '#ffd56a', [a[0], h + 0.23, a[1]], [b[0], h + 0.23, b[1]], [b[0], h + 0.87, b[1]], [a[0], h + 0.87, a[1]]);
  staticBoxRot(x, h / 2, z, w, h, d, face);
  buildings.push({ x: x, z: z, w: d + 1, d: d + 1 });
}
/* tablica z nazwą atrakcji na dwóch słupkach (czytelna od strony kierunku face) */
function pkSign(x, z, face, text, bg, fg, w){
  w = w || 5; const fx = Math.sin(face), fz = Math.cos(face), rx = Math.cos(face), rz = -Math.sin(face);
  for (const s of [-1, 1]) pkS(pkB(0.12, 3, 0.12), 0x2a2c30, x + rx * s * (w / 2 - 0.2), 1.5, z + rz * s * (w / 2 - 0.2), 0, face);
  pkS(pkB(w + 0.2, 1.1, 0.12), 0x2a2c30, x, 2.75, z, 0, face);
  const a = [x - rx * w / 2 + fx * 0.07, 2.25, z - rz * w / 2 + fz * 0.07], b = [x + rx * w / 2 + fx * 0.07, 2.25, z + rz * w / 2 + fz * 0.07];
  wordSignQuad(text, bg, fg, a, b, [b[0], 3.25, b[2]], [a[0], 3.25, a[2]]);
}
/* barierki kolejki do atrakcji: słupki i dwie poręcze wzdłuż odcinka (x0,z0)→(x1,z1) */
function pkRail(x0, z0, x1, z1){
  const l = Math.hypot(x1 - x0, z1 - z0), rot = Math.atan2(x1 - x0, z1 - z0);
  for (let t = 0; t <= l + 0.01; t += 2) pkS(pkB(0.08, 1.0, 0.08), 0x9aa0a8, lerp(x0, x1, t / l), 0.5, lerp(z0, z1, t / l), 0, rot);
  for (const yy of [0.55, 0.95]) pkS(pkB(0.05, 0.05, l), 0xc8ccd2, (x0 + x1) / 2, yy, (z0 + z1) / 2, 0, rot);
  staticBoxRot((x0 + x1) / 2, 0.5, (z0 + z1) / 2, 0.1, 1.0, l, rot);
}
/* drogowskaz: słup z kolorowymi tabliczkami (napis po obu stronach) */
function pkSignpost(x, z, arrows){
  pkS(pkC(0.08, 0.08, 3.4, 8), 0x2a2c30, x, 1.7, z);
  arrows.forEach(([txt, dir, col], i) => {
    const y = 3.0 - i * 0.55, fx = Math.sin(dir), fz = Math.cos(dir), rx = Math.cos(dir), rz = -Math.sin(dir), hex = '#' + col.toString(16).padStart(6, '0');
    pkS(pkB(0.06, 0.42, 1.6), col, x + fx * 0.85, y, z + fz * 0.85, 0, dir);
    for (const sd of [1, -1]){
      const ox = rx * 0.035 * sd, oz = rz * 0.035 * sd, n = [x + fx * 0.1 + ox, y - 0.17, z + fz * 0.1 + oz], f = [x + fx * 1.6 + ox, y - 0.17, z + fz * 1.6 + oz];
      const A = sd > 0 ? f : n, B = sd > 0 ? n : f;                         // tekst czytelny z obu stron tabliczki
      wordSignQuad(txt, hex, '#ffffff', A, B, [B[0], y + 0.17, B[2]], [A[0], y + 0.17, A[2]]);
    }
  });
  staticBox(x, 1.7, z, 0.2, 3.4, 0.2);
}
function pkFlowers(x0, x1, z0, z1){
  pkS(pkB(x1 - x0, 0.3, z1 - z0), 0x6b5038, (x0 + x1) / 2, 0.15, (z0 + z1) / 2);
  const C = [0xd35fa0, 0xe0a52c, 0xc0392b, 0xf2f0ea, 0x8e44ad];
  for (let x = x0 + 0.4; x < x1 - 0.2; x += 0.55) for (let z = z0 + 0.4; z < z1 - 0.2; z += 0.55) pkS(pkB(0.22, 0.22, 0.22), C[Math.floor(Math.abs(Math.sin(x * 12.9 + z * 78.2)) * 5)], x, 0.42, z);
  staticBox((x0 + x1) / 2, 0.15, (z0 + z1) / 2, x1 - x0, 0.3, z1 - z0);
}
function pkHedge(x0, x1, z0, z1){ pkS(pkB(x1 - x0, 0.9, z1 - z0), 0x3f7a3a, (x0 + x1) / 2, 0.45, (z0 + z1) / 2); staticBox((x0 + x1) / 2, 0.45, (z0 + z1) / 2, x1 - x0, 0.9, z1 - z0); }

/* ===============================================================
   BUDOWA — park
   =============================================================== */
function buildPark(){
  const A = PARK, gx = A.gateX, PL = A.plaza;
  for (let i = treeSpots.length - 1; i >= 0; i--){ const t = treeSpots[i]; if (t.x > CITY_EDGE - 1 && t.z > A.z0 - 6 && t.z < A.z1 + 6) treeSpots.splice(i, 1); }
  /* trawa parku nad trawą pasa podmiejskiego (ta leży 1 cm nad podłożem wyspy i z daleka migocze — prześwitywało szare podłoże) */
  lawnBuf.plane((CITY_EDGE + A.x1 + 4) / 2, 0.004, 0, A.x1 + 4 - CITY_EDGE, A.z1 - A.z0 + 4, (A.x1 + 4 - CITY_EDGE) / 10, (A.z1 - A.z0 + 4) / 10);
  /* --- plac wejściowy, promenada, plac z fontanną, bulwar, alejki poprzeczne --- */
  pkPath(CITY_EDGE, gx + 3, -14, 14, PK_PAV2, true);
  pkPath(gx + 3, PL.x - PL.r + 1, -5, 5); pkPath(PL.x + PL.r - 1, 388, -5, 5);
  CB(PK_PAV2).disc(PL.x, 0.022, PL.z, PL.r, 40); CB(PK_CURB).ring(PL.x, 0.03, PL.z, PL.r - 0.35, PL.r, 40);
  for (let r = 7; r < PL.r - 0.6; r += 2) CB(PK_JOINT).ring(PL.x, 0.026, PL.z, r, r + 0.06, 40);
  mapExtras.push({ t: 'disc', x: PL.x, z: PL.z, r: PL.r, c: '#8f8670' });
  pkPath(A.boulX - 3, A.boulX + 3, PL.z + PL.r - 1, 152); pkPath(A.boulX - 3, A.boulX + 3, -44, PL.z - PL.r + 1);
  pkPath(292, A.boulX - 3, 64, 70); pkPath(A.boulX + 3, 380, 64, 70);
  pkPath(292, A.boulX - 3, 98, 104); pkPath(A.boulX + 3, 380, 98, 104);
  /* fontanna: niecka (kolizja), woda, dwie misy, strumień */
  pkS(pkC(5.2, 5.4, 0.7, 32), 0xb9b6ad, PL.x, 0.35, PL.z); pkS(pkC(4.7, 4.7, 0.05, 32), 0x3f8fae, PL.x, 0.62, PL.z);
  pkS(pkC(0.5, 0.7, 2.6, 12), 0xb9b6ad, PL.x, 1.6, PL.z); pkS(pkC(2.2, 1.2, 0.35, 20), 0xb9b6ad, PL.x, 1.8, PL.z); pkS(pkC(1.1, 0.6, 0.3, 16), 0xb9b6ad, PL.x, 2.9, PL.z);
  staticCylinder(PL.x, 0.35, PL.z, 5.4, 0.7);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 2.3, 3.2, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
  water.position.set(PL.x, 2.0, PL.z); scene.add(water); PARK_RIDES.fountain = water;
  for (let k = 0; k < 6; k++){ const a = k / 6 * TAU + 0.52; pkBench(PL.x + Math.cos(a) * 9.6, PL.z + Math.sin(a) * 9.6, Math.atan2(-Math.cos(a), -Math.sin(a))); }   // przodem do fontanny
  /* --- brama: okrągłe wieże z dachami i flagami, łuk, tablice z napisem PRZED łukiem i wieżami (od miasta i od parku),
     żarówki, kołowrotki, kasy z okienkami, flagi przy placu wejściowym --- */
  for (const sz of [-1, 1]){
    const tz = sz * 8.6;
    pkS(pkC(1.9, 2.1, 9, 16), 0xe9e2d0, gx, 4.5, tz); pkS(pkC(2.2, 2.2, 0.5, 16), 0xc0392b, gx, 9.2, tz);
    pkS(pkC(0.05, 2.5, 3.2, 16), 0xc0392b, gx, 11.05, tz); pkS(pkC(0.05, 0.05, 2.6, 6), 0x2a2c30, gx, 13.9, tz); pkS(pkB(0.05, 0.8, 1.3), sz > 0 ? 0xe0a52c : 0x2a6cd8, gx, 14.7, tz + 0.65);
    for (let k = 0; k < 4; k++){ const a = k * Math.PI / 2 + 0.785; pkS(pkB(0.1, 1.2, 0.7), 0x2b3a4a, gx + Math.cos(a) * 1.97, 6, tz + Math.sin(a) * 1.97, 0, -a); }
    staticCylinder(gx, 4.5, tz, 2.1, 9);
    const kx = gx - 6.5, kz = sz * 9.6;                                     // kasa (okienko od strony miasta)
    pkS(pkB(3.2, 2.8, 3), 0xf2f0ea, kx, 1.4, kz); pkS(pkB(3.6, 0.3, 3.4), 0xc0392b, kx, 2.95, kz); pkS(pkB(0.05, 0.9, 1.6), 0x1b2a38, kx - 1.61, 1.6, kz);
    pkS(pkB(0.6, 0.1, 1.8), 0x7a5a3a, kx - 1.85, 1.05, kz);
    wordSignQuad('KASA', '#c0392b', '#ffffff', [kx - 1.64, 2.25, kz - 0.9], [kx - 1.64, 2.25, kz + 0.9], [kx - 1.64, 2.75, kz + 0.9], [kx - 1.64, 2.75, kz - 0.9]);
    staticBox(kx, 1.4, kz, 3.2, 2.8, 3);
  }
  pkS(pkB(1.2, 1.2, 15.6), 0xc0392b, gx, 8.1, 0);
  for (const sd of [-1, 1]){
    const bx = gx + sd * 2.3;
    pkS(pkB(0.25, 2.2, 12.6), 0x2a2c30, bx, 8.2, 0);
    for (const zz of [-5.5, 5.5]) pkS(pkB(2.3, 0.2, 0.2), 0x2a2c30, gx + sd * 1.15, 8.2, zz);       // wsporniki tablicy
    for (let k = 0; k <= 20; k++) for (const yy of [7.2, 9.2]) pkS(pkB(0.12, 0.12, 0.12), 0xfff3b0, bx + sd * 0.14, yy, -6 + k * 0.6);
    const f = bx + sd * 0.135, z0 = sd < 0 ? -5.8 : 5.8;
    wordSignQuad('PARK ROZRYWKI', '#c0392b', '#fff3d0', [f, 7.4, z0], [f, 7.4, -z0], [f, 9.0, -z0], [f, 9.0, z0]);
  }
  for (const tz of [-4.5, -1.5, 1.5, 4.5]){ pkS(pkB(0.5, 1.0, 0.5), 0x9aa0a8, gx + 0.5, 0.5, tz); pkS(pkB(0.06, 0.06, 1.1), 0xc8ccd2, gx + 0.5, 0.85, tz + 0.75); staticBox(gx + 0.5, 0.5, tz, 0.5, 1.0, 0.5); }
  for (const tz of [-12.8, 12.8]) for (let x = CITY_EDGE + 4; x < gx - 9; x += 7){ pkS(pkC(0.06, 0.06, 6, 6), 0xd8d4cc, x, 3, tz); pkS(pkB(0.04, 1.4, 0.9), [0xc0392b, 0xe0a52c, 0x2a6cd8][((x / 7) | 0) % 3], x, 5.2, tz + 0.48); staticBox(x, 3, tz, 0.15, 6, 0.15); }
  pkFlowers(CITY_EDGE + 3, CITY_EDGE + 9, -11, -6); pkFlowers(CITY_EDGE + 3, CITY_EDGE + 9, 6, 11);
  /* --- ogrodzenie parku (przerwa na bramę) --- */
  fenceLine(A.x0 + 0.5, A.z0, A.x0 + 0.5, -14); fenceLine(A.x0 + 0.5, 14, A.x0 + 0.5, A.z1);
  fenceLine(A.x0 + 0.5, A.z0, A.x1, A.z0); fenceLine(A.x0 + 0.5, A.z1, A.x1, A.z1);
  /* --- budki przy promenadzie (szyldem do alejki) --- */
  const ST = [['LODY', 0xd35fa0], ['WATA', 0x8e44ad], ['HOT DOG', 0xc0392b], ['NAPOJE', 0x2a6cd8], ['POPCORN', 0xe0a52c], ['PAMIĄTKI', 0x2f8a4c], ['FRYTKI', 0xe67e22], ['BALONY', 0x16a085]];
  [[304, -9.6, 0], [314, -9.6, 0], [356, -9.6, 0], [366, -9.6, 0], [318, 9.6, Math.PI], [356, 9.6, Math.PI], [366, 9.6, Math.PI], [376, 9.6, Math.PI]]
    .forEach(([x, z, f], k) => pkStall(x, z, f, ST[k][0], ST[k][1]));
  for (const [x, z] of [[328, -16], [344, -16], [376, -18]]){                // stoliki z parasolami
    pkS(pkC(0.6, 0.6, 0.06, 12), 0xf2f0ea, x, 0.75, z); pkS(pkC(0.06, 0.06, 0.75, 6), 0x2a2c30, x, 0.37, z); pkS(pkC(0.05, 0.05, 2.4, 6), 0xd8d4cc, x, 1.2, z); pkS(pkC(0.05, 1.5, 0.5, 12), 0xc0392b, x, 2.4, z);
    for (let k = 0; k < 4; k++){ const a = k * Math.PI / 2; pkS(pkB(0.4, 0.45, 0.4), 0x2a6cd8, x + Math.cos(a) * 1.0, 0.22, z + Math.sin(a) * 1.0); }
    staticCylinder(x, 0.4, z, 0.7, 0.8);
  }
  /* --- ławki, kosze, latarnie, klomby, żywopłoty, drzewa --- */
  for (const x of [309, 325, 347, 383]) pkBench(x, 6.9, Math.PI);
  for (const x of [325, 347, 383]) pkBench(x, -6.9, 0);
  for (const x of [300, 330, 350, 380]) for (const sz of [-1, 1]) pkBin(x, sz * 6.2);
  for (let x = gx + 8; x < 386; x += 16) for (const sz of [-1, 1]) if (Math.abs(x - PL.x) > PL.r + 1) lampSpots.push({ x: x, z: sz * 5.9, rot: sz > 0 ? Math.PI : 0, y: 0 });
  for (let z = 20; z < 150; z += 16) lampSpots.push({ x: A.boulX + 3.9, z: z, rot: -Math.PI / 2, y: 0 });
  for (let z = -40; z < -16; z += 12) lampSpots.push({ x: A.boulX + 3.9, z: z, rot: -Math.PI / 2, y: 0 });
  for (const [x, z] of [[PL.x - 9.2, PL.z - 9.2], [PL.x + 9.2, PL.z - 9.2], [PL.x - 9.2, PL.z + 9.2], [PL.x + 9.2, PL.z + 9.2]]) lampSpots.push({ x: x, z: z, rot: Math.atan2(PL.x - x, PL.z - z), y: 0 });
  pkFlowers(320, 326, 16, 22); pkFlowers(346, 352, 16, 22); pkFlowers(320, 326, -22, -16); pkFlowers(346, 352, -22, -16);
  pkHedge(A.boulX + 3.5, A.boulX + 4.4, 72, 96); pkHedge(A.boulX - 4.4, A.boulX - 3.5, 72, 96);
  pkHedge(A.boulX + 3.5, A.boulX + 4.4, 106, 132); pkHedge(A.boulX - 4.4, A.boulX - 3.5, 112, 150);
  const tree = (x, z) => treeSpots.push({ x: x, z: z, y: 0, type: randInt(0, 1), scale: rand(0.8, 1.3), rot: rnd() * TAU });
  for (let x = 340; x < 390; x += 9) tree(x, A.z1 - 4);
  for (let z = 22; z < 106; z += 12) if (z < 60 || z > 74) tree(A.x0 + 4, z);
  for (const [x, z] of [[290, -24], [290, 20], [384, -26], [386, 20], [348, 120], [346, 90], [326, 92], [384, 112], [296, 48], [386, 78]]) tree(x, z);
  /* --- drogowskazy na skrzyżowaniach --- */
  pkSignpost(PL.x - PL.r - 1.5, -6.2, [['SMOK', Math.PI, 0xc0392b], ['MŁYN', Math.PI / 2 + 0.35, 0x2a6cd8], ['WYJŚCIE', -Math.PI / 2, 0x2f8a4c]]);
  pkSignpost(A.boulX - 3.8, 62.5, [['ŻABKA', 0, 0x2f8a4c], ['WIEŻA', Math.PI / 2, 0xe0a52c], ['AUTODROM', 0.25, 0x6b3a8f]]);

  /* ===== atrakcje ===== */
  buildCarousel(305, 30);
  buildFerrisWheel(372, 40);
  buildSwingRide(305, 86);
  buildDropTower(374, 84);
  buildBumperCars(370, 138);
  /* ===== kolejki ===== */
  coasterBuild({ name: 'Kolejka SMOK', cx: 338, cz: -97, rx: 46, rz: 50, p: 0.32, wob: 0.12, wk: 3, wph: 0.7, stTh: Math.PI / 2, th0: Math.PI / 2 - 0.32,
    station: 30, H: 42, yS: 0.75, yLow: 1.4, liftSlope: 0.72, hills: 3.5, decay: 0.58, brake: 34, liftV: 5, mu: 0.012, cars: 5,
    railCol: 0xc0392b, spineCol: 0x9a2a20, supCol: 0x2f5f9a, carCol: 0xe0a52c, sign: 'SMOK' });
  coasterBuild({ name: 'Kolejka ŻABKA', cx: 308, cz: 133, rx: 20, rz: 19, p: 0.4, wob: 0.1, wk: 2, wph: 0.2, stTh: -Math.PI / 2, th0: -Math.PI / 2 - 0.42,
    station: 16, H: 12, yS: 0.75, yLow: 1.2, liftSlope: 0.5, hills: 2.5, decay: 0.45, brake: 18, liftV: 3.5, mu: 0.015, cars: 3,
    railCol: 0x2f8a4c, spineCol: 0x1f6a36, supCol: 0xe0b020, carCol: 0x2a6cd8, sign: 'ŻABKA' });
  COASTERS.forEach(c => {
    coasterGeometry(c); coasterTrain(c);
    /* stacja: peron (wierzch na wysokości chodnika) po zewnętrznej stronie, żółta linia, wiata, szyld na krawędzi wiaty */
    const a = coasterSample(c, c.sStop - c.cars * 2.4 - 1, {}), b = coasterSample(c, c.sStop + 1, {});
    const len = Math.hypot(b.x - a.x, b.z - a.z) + 2, rot = Math.atan2(b.x - a.x, b.z - a.z), sx = a.side[0], sz = a.side[2];
    const mx = (a.x + b.x) / 2 + sx * 2.4, mz = (a.z + b.z) / 2 + sz * 2.4;
    CB(0xb9b6ad).boxRot(mx, WALK_H / 2, mz, 3.2, WALK_H, len, rot, 2, true); staticBoxRot(mx, WALK_H / 2, mz, 3.2, WALK_H, len, rot);
    CB(0xe0b020).boxRot(mx - sx * 1.45, WALK_H + 0.006, mz - sz * 1.45, 0.25, 0.01, len, rot, 1, true);
    const cx2 = (a.x + b.x) / 2 + sx * 0.6, cz2 = (a.z + b.z) / 2 + sz * 0.6, tx = Math.sin(rot), tz = Math.cos(rot);
    CB(c.railCol).boxRot(cx2, 4.3, cz2, 6.6, 0.3, len + 1, rot, 1, true);
    for (const f of [-0.45, 0.45]) for (const sd of [-1, 1]){ const px = cx2 + tx * f * len + sx * sd * 3.0, pz = cz2 + tz * f * len + sz * sd * 3.0; CB(0xe9e2d0).box(px, 2.15, pz, 0.3, 4.3, 0.3, 1, false); staticBox(px, 2.15, pz, 0.3, 4.3, 0.3); }
    const ex = cx2 + sx * 3.4, ez = cz2 + sz * 3.4, sg = (tx * sz - tz * sx) > 0 ? 1 : -1;
    pkS(pkB(0.12, 1.2, 6.4), 0x14161b, ex - sx * 0.08, 5.05, ez - sz * 0.08, 0, rot);
    wordSignQuad(c.sign, '#14161b', '#ffcf5a', [ex - tx * 3 * sg, 4.55, ez - tz * 3 * sg], [ex + tx * 3 * sg, 4.55, ez + tz * 3 * sg], [ex + tx * 3 * sg, 5.55, ez + tz * 3 * sg], [ex - tx * 3 * sg, 5.55, ez - tz * 3 * sg]);
    const bp = coasterBoardPoint(c);
    c.board = bp;
    mapExtras.push({ t: 'line', pts: c.P.filter((p, i) => i % 4 === 0).map(p => [p.x, p.z]).concat([[c.P[0].x, c.P[0].z]]), w: 1.6, c: c.sign === 'SMOK' ? '#c0392b' : '#2f8a4c' });
    c.ride = { name: c.name, board: bp, exit: { x: bp.x + sx * 2.5, z: bp.z + sz * 2.5 }, wait: 'Kolejka w trasie — poczekaj na peronie',
      ready: () => c.state === 'wait' && c.t > 1, start: () => { c.t = Math.max(c.t, 3); c.rider = true; }, end: () => { c.rider = false; },
      cam: dt => coasterCam(c, dt), pos: () => { const q = coasterSample(c, c.s, _cs); return { x: q.x, y: q.y, z: q.z }; }, speed: () => c.v };
    RIDES.push(c.ride);
  });
  /* dojścia do peronów z barierkami i tablicami */
  { const b = COASTERS[0].board; pkPath(Math.min(b.x, A.boulX) - 3, Math.max(b.x, A.boulX) + 3, -44, -38); pkRail(b.x - 2.8, -37.5, b.x - 2.8, -25); pkRail(b.x + 2.8, -37.5, b.x + 2.8, -25); pkSign(b.x, -23.5, 0, 'SMOK · 42 m · 103 km/h', '#14161b', '#ffcf5a', 6.4); }
  { const b = COASTERS[1].board; pkPath(b.x - 3, b.x + 3, 104, b.z + 1.5); pkSign(b.x + 6.8, 106, Math.PI, 'ŻABKA', '#2f8a4c', '#ffffff', 4); }
  /* minimapa */
  mapExtras.push({ t: 'disc', x: 305, z: 30, r: 8.5, c: '#d35fa0' }); mapExtras.push({ t: 'disc', x: 305, z: 86, r: 10, c: '#2a6cd8' });
  mapExtras.push({ t: 'rect', x0: 369, x1: 375, z0: 18, z1: 62, c: '#e9e2d0' }); mapExtras.push({ t: 'disc', x: 374, z: 84, r: 3, c: '#e0b020' });
  mapExtras.push({ t: 'rect', x0: 354, x1: 386, z0: 126, z1: 150, c: '#6b3a8f' });
  const m = pkMesh(PKS); scene.add(m); PKS.length = 0;
}
function coasterBoardPoint(c){ const q = coasterSample(c, c.sStop - 4, {}); return { x: q.x + q.side[0] * 2.6, z: q.z + q.side[2] * 2.6 }; }

/* ===============================================================
   ATRAKCJE
   =============================================================== */
/* cykl atrakcji: jazda (0…run) i postój (run…1); wsiadanie tylko na postoju; wysiadka po zakończeniu następnej jazdy */
function cycleRide(o, name, period, run, board, exit, extra){
  const R = Object.assign({ name: name, board: board, exit: exit, wait: name + ' — poczekaj, aż się zatrzyma', stage: 0,
    ready: () => { const c = (clock % period) / period; return c > run + 0.02 && c < 0.97; },
    start(){ this.stage = 0; },
    tick(){ const c = (clock % period) / period; if (this.stage === 0 && c < run) this.stage = 1; if (this.stage === 1 && c >= run + 0.005) rideEnd(this); } }, extra);
  RIDES.push(R); o.ride = R; return R;
}
/* karuzela z konikami: jazda ~26 s, postój ~10 s */
function buildCarousel(cx, cz){
  pkS(pkC(8.6, 8.8, 0.3, 32), 0x7a5a3a, cx, 0.15, cz); staticCylinder(cx, 0.4, cz, 8.2, 0.8);
  pkPath(cx - 3, cx + 3, 5, cz - 9.5);
  pkSign(cx + 5.5, cz - 12, Math.PI, 'KARUZELA', '#c0392b', '#ffffff', 4);
  const g = new THREE.Group(); g.position.set(cx, 0, cz); scene.add(g);
  const parts = [{ geo: pkC(8, 8, 0.35, 28), color: 0xe9e2d0, y: 0.55 }, { geo: pkC(0.6, 0.6, 5.2, 12), color: 0xe0b020, y: 3.2 },
    { geo: pkC(8.6, 8.6, 0.6, 28), color: 0xc0392b, y: 5.3 }, { geo: pkC(0.3, 8.8, 2.2, 14), color: 0xc0392b, y: 6.7, colorFn: (x, y, z) => (Math.floor((Math.atan2(z, x) + Math.PI) / TAU * 14) % 2 ? 0xc0392b : 0xf2f0ea) },
    { geo: pkC(0.3, 0.3, 1.2, 8), color: 0xe0b020, y: 8.3 }, { geo: pkC(1.6, 1.6, 4.4, 12), color: 0x3a6fa0, y: 3.0 }];
  for (let k = 0; k < 14; k++){ const a = k / 14 * TAU; parts.push({ geo: pkB(3.9, 0.7, 0.08), color: k % 2 ? 0xc0392b : 0xf2f0ea, x: Math.cos(a) * 8.62, y: 4.7, z: Math.sin(a) * 8.62, ry: -a + Math.PI / 2 }); }
  for (let k = 0; k < 28; k++){ const a = k / 28 * TAU; parts.push({ geo: pkB(0.12, 0.12, 0.12), color: 0xfff3b0, x: Math.cos(a) * 8.65, y: 5.05, z: Math.sin(a) * 8.65 }); }
  g.add(pkMesh(parts, true));
  const horses = [];
  for (let k = 0; k < 12; k++){
    const a = k / 12 * TAU, r = k % 2 ? 6.2 : 4.4, h = new THREE.Group(), col = [0xf2f0ea, 0x8a5a3a, 0x1b1c1f, 0xe0a52c][k % 4];
    h.add(pkMesh([{ geo: pkB(0.45, 0.6, 1.4), color: col, y: 1.3 }, { geo: pkB(0.35, 0.75, 0.35), color: col, y: 1.75, z: 0.65, rx: 0.4 },
      { geo: pkB(0.12, 0.6, 0.12), color: 0x6b4a2a, x: 0.12, y: 0.8, z: 0.45 }, { geo: pkB(0.12, 0.6, 0.12), color: 0x6b4a2a, x: -0.12, y: 0.8, z: -0.45 },
      { geo: pkC(0.05, 0.05, 4.6, 6), color: 0xe0b020, y: 2.8 }, { geo: pkB(0.5, 0.12, 0.6), color: 0xc0392b, y: 1.65 }]));
    h.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); h.rotation.y = -a; h.userData.ph = k * 1.3;
    g.add(h); horses.push(h);
  }
  const C = PARK_RIDES.carousel = { g: g, horses: horses, w: 0, period: 36, run: 0.72 };
  cycleRide(C, 'Karuzela', C.period, C.run, { x: cx, z: cz - 10 }, { x: cx + 2, z: cz - 10.5, facing: Math.PI }, {
    cam(dt){ const h = horses[1]; h.updateWorldMatrix(true, false); _pkV2.setFromMatrixPosition(h.matrixWorld); _pkV2.y += 2.35;
      const a = C.g.rotation.y, hx = h.position.x, hz = h.position.z, wx = hx * Math.cos(a) + hz * Math.sin(a), wz = -hx * Math.sin(a) + hz * Math.cos(a);
      seatCam(_pkV2, wz, -wx, dt, -0.12); },
    pos(){ const h = horses[1]; h.updateWorldMatrix(true, false); _pkV2.setFromMatrixPosition(h.matrixWorld); return { x: _pkV2.x, y: _pkV2.y, z: _pkV2.z }; },
    speed: () => C.w * 6.2 });
}
/* diabelski młyn: nogi A, oś, koło (obręcze, szprychy, żarówki), gondole zawsze pionowo; peron przy dole koła */
function buildFerrisWheel(cx, cz){
  const R = 21, hy = R + 3;
  for (const sx of [-1.6, 1.6]) for (const sz of [-1, 1]) staticBox(cx + sx, 1.5, cz + sz * 9, 1.2, 3, 1.2);
  const legs = []; for (const sx of [-1.6, 1.6]) for (const sz of [-1, 1]) legs.push({ geo: pkB(0.6, Math.hypot(9, hy), 0.6), color: 0xe9e2d0, x: sx, y: hy / 2, z: sz * 4.5, rx: -sz * Math.atan2(9, hy) });
  legs.push({ geo: pkB(4.2, 1.2, 1.2), color: 0x8a8c8f, y: hy }, { geo: pkB(5, 2.8, 4), color: 0x2f5f9a, x: 3, y: 1.4, z: -12 });
  const base = pkMesh(legs); base.position.set(cx, 0, cz); scene.add(base);
  staticBox(cx + 3, 1.4, cz - 12, 5, 2.8, 4);
  pkS(pkB(7, 0.4, 22), 0x8a8c8f, cx, 0.2, cz);
  pkS(pkB(3, 0.5, 5), 0xb9b6ad, cx - 4.4, 0.25, cz); staticBox(cx - 4.4, 0.25, cz, 3, 0.5, 5);
  pkPath(PARK.boulX + 3, cx - 5.9, cz - 3, cz + 3); pkRail(PARK.boulX + 6, cz - 3.2, cx - 6, cz - 3.2); pkRail(PARK.boulX + 6, cz + 3.2, cx - 6, cz + 3.2);
  pkSign(PARK.boulX + 6, cz - 6.2, -Math.PI / 2, 'DIABELSKI MŁYN', '#2a6cd8', '#ffffff', 6);
  const wheel = new THREE.Group(); wheel.position.set(cx, hy, cz); scene.add(wheel);
  const parts = [];
  for (const sx of [-1.3, 1.3]){
    for (let k = 0; k < 48; k++){ const a = k / 48 * TAU, a2 = (k + 1) / 48 * TAU, mz = (Math.cos(a) + Math.cos(a2)) / 2 * R, my = (Math.sin(a) + Math.sin(a2)) / 2 * R;
      parts.push({ geo: pkB(0.25, 0.3, TAU * R / 48 + 0.1), color: 0xf2f0ea, x: sx, y: my, z: mz, rx: Math.PI / 2 - (a + a2) / 2 });
      if (k % 2 === 0) parts.push({ geo: pkB(0.14, 0.14, 0.14), color: 0xfff3b0, x: sx * 1.12, y: Math.sin(a) * (R + 0.2), z: Math.cos(a) * (R + 0.2) }); }
    for (let k = 0; k < 16; k++){ const a = k / 16 * TAU; parts.push({ geo: pkB(0.15, R, 0.15), color: 0xc8ccd2, x: sx, y: Math.sin(a) * R / 2, z: Math.cos(a) * R / 2, rx: -(a - Math.PI / 2) }); }
  }
  for (let k = 0; k < 16; k++){ const a = k / 16 * TAU; parts.push({ geo: pkB(2.8, 0.15, 0.15), color: 0xc8ccd2, y: Math.sin(a) * R, z: Math.cos(a) * R }); }
  parts.push({ geo: pkC(1, 1, 3.2, 16), color: 0xc0392b, rz: Math.PI / 2 });
  wheel.add(pkMesh(parts));
  const gond = [], GC = [0xc0392b, 0x2a6cd8, 0xe0a52c, 0x2f8a4c];
  for (let k = 0; k < 16; k++){
    const gp = new THREE.Group(), cc = GC[k % 4];
    gp.add(pkMesh([{ geo: pkB(1.8, 0.9, 1.8), color: cc, y: -1.85 }, { geo: pkB(1.9, 0.15, 1.9), color: 0xf2f0ea, y: -0.65 }, { geo: pkB(0.12, 0.8, 0.12), color: 0x8a8c8f, y: -0.3 },
      { geo: pkB(0.1, 0.9, 0.1), color: cc, x: 0.85, y: -1.0, z: 0.85 }, { geo: pkB(0.1, 0.9, 0.1), color: cc, x: -0.85, y: -1.0, z: 0.85 }, { geo: pkB(0.1, 0.9, 0.1), color: cc, x: 0.85, y: -1.0, z: -0.85 }, { geo: pkB(0.1, 0.9, 0.1), color: cc, x: -0.85, y: -1.0, z: -0.85 }]));
    gp.userData.a = k / 16 * TAU; scene.add(gp); gond.push(gp);
  }
  const W = PARK_RIDES.wheel = { wheel: wheel, gond: gond, cx: cx, cz: cz, hy: hy, R: R, w: 0.1, a0: 0, k: -1, start: 0 };
  /* przejażdżka: gondola przy peronie (u dołu koła), jeden pełny obrót */
  const gAng = k => gond[k].userData.a + W.a0;
  const nearBottom = () => { let best = -1, bd = 1e9; gond.forEach((g, k) => { const d = Math.abs(wrapAngle(gAng(k) + Math.PI / 2)); if (d < bd){ bd = d; best = k; } }); return bd < 0.1 ? best : -1; };
  const R2 = { name: 'Diabelski młyn', board: { x: cx - 4.5, z: cz }, exit: { x: cx - 6.8, z: cz, facing: -Math.PI / 2 }, wait: 'Diabelski młyn — poczekaj na gondolę przy peronie',
    ready: () => nearBottom() >= 0, start(){ W.k = nearBottom(); W.start = W.a0; },
    tick(){ if (W.a0 - W.start > TAU - 0.05) rideEnd(this); },
    cam(dt){ const g = gond[W.k]; _pkV2.set(g.position.x - 0.3, g.position.y - 1.0, g.position.z); seatCam(_pkV2, -1, 0, dt, -0.1); },
    pos(){ const g = gond[W.k]; return { x: g.position.x, y: g.position.y - 1.5, z: g.position.z }; }, speed: () => W.w * R };
  RIDES.push(R2); W.ride = R2;
}
/* karuzela łańcuchowa: jazda ~24 s (rozpędzanie i hamowanie), postój ~10 s */
function buildSwingRide(cx, cz){
  pkS(pkC(11.5, 11.5, 0.12, 36), 0x8d8270, cx, 0.06, cz); pkS(pkC(2.2, 2.2, 0.4, 16), 0x8a8c8f, cx, 0.2, cz);
  pkS(pkC(0.6, 0.7, 12, 12), 0x2a6cd8, cx, 6, cz); staticCylinder(cx, 6, cz, 0.7, 12);
  pkPath(cx - 3, cx + 3, 70, cz - 11.5);
  pkSign(cx + 7, cz - 13.5, Math.PI, 'KARUZELA ŁAŃCUCHOWA', '#2a6cd8', '#ffffff', 7);
  const top = new THREE.Group(); top.position.set(cx, 11.5, cz); scene.add(top);
  top.add(pkMesh([{ geo: pkC(0.4, 6.5, 1.6, 24), color: 0xe0a52c, y: 0.6 }, { geo: pkC(6.5, 6.5, 0.4, 24), color: 0x2a6cd8, y: -0.3 }]));
  const chairs = [];
  for (let k = 0; k < 16; k++){
    const a = k / 16 * TAU, piv = new THREE.Group();
    piv.position.set(Math.cos(a) * 6, -0.4, Math.sin(a) * 6); piv.rotation.y = -a;
    const arm = new THREE.Group(); piv.add(arm);
    arm.add(pkMesh([{ geo: pkB(0.04, 6, 0.04), color: 0x8a8c8f, y: -3, z: 0.25 }, { geo: pkB(0.04, 6, 0.04), color: 0x8a8c8f, y: -3, z: -0.25 }, { geo: pkB(0.6, 0.1, 0.7), color: [0xc0392b, 0xe0a52c][k % 2], y: -6 }, { geo: pkB(0.08, 0.5, 0.7), color: [0xc0392b, 0xe0a52c][k % 2], x: -0.28, y: -5.75 }]));
    top.add(piv); chairs.push(arm);
  }
  const S = PARK_RIDES.swing = { top: top, chairs: chairs, w: 0, ang: 0, period: 34, run: 0.7 };
  cycleRide(S, 'Karuzela łańcuchowa', S.period, S.run, { x: cx, z: cz - 11 }, { x: cx + 2, z: cz - 12.5, facing: Math.PI }, {
    cam(dt){ const ch = chairs[0]; ch.updateWorldMatrix(true, false); _pkV2.set(0.1, -5.1, 0).applyMatrix4(ch.matrixWorld);
      const r = S.top.rotation.y, p0 = ch.parent.position, wx = p0.x * Math.cos(r) + p0.z * Math.sin(r), wz = -p0.x * Math.sin(r) + p0.z * Math.cos(r);
      seatCam(_pkV2, wz, -wx, dt, -0.15); },
    pos(){ const ch = chairs[0]; ch.updateWorldMatrix(true, false); _pkV2.set(0, -6, 0).applyMatrix4(ch.matrixWorld); return { x: _pkV2.x, y: _pkV2.y, z: _pkV2.z }; },
    speed: () => S.w * 9 });
}
/* wieża swobodnego spadania: wjazd 12 s, zawis, spadek, hamowanie, postój (cykl 30 s) */
function buildDropTower(cx, cz){
  const H = 52;
  pkS(pkB(8, 0.4, 8), 0x8a8c8f, cx, 0.2, cz);
  CB(0xe9e2d0).box(cx, H / 2, cz, 2.2, H, 2.2, 3, true); staticBox(cx, H / 2, cz, 2.2, H, 2.2);
  CB(0xc0392b).box(cx, H + 1, cz, 3, 2, 3, 1, true); CB(0xfff3b0).box(cx, H + 2.3, cz, 0.6, 0.6, 0.6, 1, true);
  for (let y = 6; y < H; y += 6) CB(0xc0392b).box(cx, y, cz, 2.5, 0.3, 2.5, 1, true);
  pkPath(cx - 3, cx + 3, 70, cz - 4);
  pkSign(cx - 6.5, cz - 8, Math.PI, 'WIEŻA 52 m', '#e0a52c', '#14161b', 4.5);
  const ring = new THREE.Group(); ring.position.set(cx, 2, cz); scene.add(ring);
  const parts = [{ geo: pkB(4.2, 1.0, 4.2), color: 0x2a6cd8 }];
  for (let k = 0; k < 8; k++){ const a = k / 8 * TAU; parts.push({ geo: pkB(0.8, 1.4, 0.7), color: 0xe0a52c, x: Math.cos(a) * 2.5, y: -0.6, z: Math.sin(a) * 2.5, ry: -a }); }
  ring.add(pkMesh(parts));
  const T = PARK_RIDES.tower = { ring: ring, H: H, period: 30, run: 0.62, v: 0 };
  cycleRide(T, 'Wieża swobodnego spadania', T.period, T.run, { x: cx, z: cz - 4.5 }, { x: cx + 2, z: cz - 6, facing: Math.PI }, {
    cam(dt){ _pkV2.set(cx, ring.position.y + 0.7, cz - 2.8); seatCam(_pkV2, 0, -1, dt, -0.35); },
    pos: () => ({ x: cx, y: ring.position.y, z: cz - 2.5 }), speed: () => Math.abs(T.v) });
}
/* autodrom: hala z dachem, bandy (wejście od zachodu), samochodziki; gracz prowadzi jeden z nich */
function buildBumperCars(cx, cz){
  const w = 32, d = 24;
  CB(0x5a5c62).plane(cx, 0.03, cz, w, d, 1, 1);
  CB(0x7a5a3a).box(cx, 0.25, cz - d / 2, w, 0.5, 0.3, 1, true); CB(0x7a5a3a).box(cx, 0.25, cz + d / 2, w, 0.5, 0.3, 1, true);
  CB(0x7a5a3a).box(cx + w / 2, 0.25, cz, 0.3, 0.5, d, 1, true);
  for (const sz of [-1, 1]) CB(0x7a5a3a).box(cx - w / 2, 0.25, cz + sz * (d / 4 + 1.5), 0.3, 0.5, d / 2 - 3, 1, true);
  staticBox(cx, 0.25, cz - d / 2, w, 0.5, 0.3); staticBox(cx, 0.25, cz + d / 2, w, 0.5, 0.3); staticBox(cx + w / 2, 0.25, cz, 0.3, 0.5, d);
  for (const sz of [-1, 1]) staticBox(cx - w / 2, 0.25, cz + sz * (d / 4 + 1.5), 0.3, 0.5, d / 2 - 3);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]){ CB(0xe0a52c).box(cx + sx * (w / 2 - 0.4), 3, cz + sz * (d / 2 - 0.4), 0.5, 6, 0.5, 1, false); staticBox(cx + sx * (w / 2 - 0.4), 3, cz + sz * (d / 2 - 0.4), 0.5, 6, 0.5); }
  CB(0x6b3a8f).box(cx, 6.3, cz, w + 1, 0.6, d + 1, 2, true);
  for (let x = cx - w / 2 + 2; x < cx + w / 2; x += 3) CB(0x8a8c8f).box(x, 5.95, cz, 0.08, 0.08, d - 1, 1, true);
  pkS(pkB(0.15, 1.4, 12), 0x14161b, cx - w / 2 - 0.6, 7.3, cz);
  wordSignQuad('AUTODROM', '#14161b', '#ffcf5a', [cx - w / 2 - 0.7, 6.7, cz + 5.8], [cx - w / 2 - 0.7, 6.7, cz - 5.8], [cx - w / 2 - 0.7, 7.9, cz - 5.8], [cx - w / 2 - 0.7, 7.9, cz + 5.8]);
  pkPath(PARK.boulX + 3, cx - w / 2, cz - 3, cz + 3);
  const CC = [0xc0392b, 0x2a6cd8, 0xe0a52c, 0x2f8a4c, 0xd35fa0, 0xf2f0ea];
  const B = PARK_RIDES.bumper = { cx: cx, cz: cz, hw: w / 2 - 1.3, hd: d / 2 - 1.3, cars: [], mine: -1 };
  for (let k = 0; k < 9; k++){
    const g = pkMesh([{ geo: pkB(1.3, 0.45, 1.9), color: CC[k % 6], y: 0.4 }, { geo: pkB(1.6, 0.24, 2.2), color: 0x1b1c1f, y: 0.2 }, { geo: pkB(0.05, 5.0, 0.05), color: 0x8a8c8f, y: 3.1, z: -0.7 },
      { geo: pkB(0.9, 0.5, 0.15), color: 0x26282c, y: 0.8, z: -0.5 }, { geo: pkC(0.18, 0.18, 0.05, 10), color: 0x1b1c1f, y: 0.95, z: 0.25, rx: -1.0 }]);
    scene.add(g);
    B.cars.push({ g: g, x: cx + rand(-10, 10), z: cz + rand(-8, 8), h: rnd() * TAU, v: 0, vx: 0, vz: 0, turn: rand(-0.6, 0.6), tt: 0 });
  }
  const R = { name: 'Autodrom', board: { x: cx - w / 2 - 1.5, z: cz }, exit: { x: cx - w / 2 - 2.5, z: cz, facing: -Math.PI / 2 }, canExit: true,
    help: 'W / S — gaz / wstecz, A / D — skręt, F — wysiadka', wait: '', ready: () => true,
    start(){ B.mine = 0; const c = B.cars[0]; c.x = cx - w / 2 + 3; c.z = cz; c.h = Math.PI / 2; c.v = 0; camCur.set(c.x - 6, 3.6, c.z); },
    end(){ B.mine = -1; },
    cam(dt){ const c = B.cars[0];
      if (clock - lastMouseMove > 1.2) planeCamYaw = angleDamp(planeCamYaw, 0, 2, dt);
      const hh = c.h + planeCamYaw; _pkV1.set(c.x - Math.sin(hh) * 6.5, 3.6, c.z - Math.cos(hh) * 6.5);
      camCur.x = damp(camCur.x, _pkV1.x, 6, dt); camCur.y = damp(camCur.y, _pkV1.y, 6, dt); camCur.z = damp(camCur.z, _pkV1.z, 6, dt);
      camera.position.copy(camCur); camera.up.set(0, 1, 0); camera.lookAt(c.x + Math.sin(c.h) * 3, 0.8, c.z + Math.cos(c.h) * 3); },
    pos: () => ({ x: B.cars[0].x, y: 0.6, z: B.cars[0].z }), speed: () => Math.abs(B.cars[0].v) };
  RIDES.push(R); B.ride = R;
}
/* ruch samochodzików: AI (krążenie z losowymi zmianami skrętu) albo sterowanie gracza; odbicia od band i od siebie */
function updateBumperCars(dt){
  const B = PARK_RIDES.bumper; if (!B) return;
  for (let i = 0; i < B.cars.length; i++){
    const c = B.cars[i], mine = i === B.mine;
    if (mine){
      const thr = (down('forward') || keys['ArrowUp'] ? 1 : 0) - (down('back') || keys['ArrowDown'] ? 1 : 0);
      const st = (down('left') || keys['ArrowLeft'] ? 1 : 0) - (down('right') || keys['ArrowRight'] ? 1 : 0);
      c.v = approach(c.v, thr * (thr > 0 ? 5.5 : 2.5), (thr ? 4 : 3) * dt);
      c.h += st * 2.0 * dt * clamp(Math.abs(c.v) / 2 + 0.4, 0, 1) * (c.v < -0.1 ? -1 : 1);
    } else {
      c.tt -= dt; if (c.tt <= 0){ c.turn = rand(-0.9, 0.9); c.tt = rand(1, 3); }
      c.v = approach(c.v, 3.6, 2 * dt); c.h += c.turn * dt;
    }
    c.vx = damp(c.vx, 0, 3, dt); c.vz = damp(c.vz, 0, 3, dt);                                       // odrzut po zderzeniu wygasa
    c.x += (Math.sin(c.h) * c.v + c.vx) * dt; c.z += (Math.cos(c.h) * c.v + c.vz) * dt;
    if (Math.abs(c.x - B.cx) > B.hw){ const s = Math.sign(c.x - B.cx); c.x = B.cx + s * B.hw; c.vx = -s * Math.abs(c.v) * 0.8; if (mine){ c.v *= 0.3; Sound.thud(4); } else c.h = Math.atan2(-Math.sin(c.h), Math.cos(c.h)); }
    if (Math.abs(c.z - B.cz) > B.hd){ const s = Math.sign(c.z - B.cz); c.z = B.cz + s * B.hd; c.vz = -s * Math.abs(c.v) * 0.8; if (mine){ c.v *= 0.3; Sound.thud(4); } else c.h = Math.atan2(Math.sin(c.h), -Math.cos(c.h)); }
  }
  for (let i = 0; i < B.cars.length; i++) for (let j = i + 1; j < B.cars.length; j++){                // zderzenia (okręgi r = 1.15)
    const a = B.cars[i], b = B.cars[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (d > 2.3 || d < 0.01) continue;
    const nx = dx / d, nz = dz / d, push = (2.3 - d) / 2;
    a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
    const va = (Math.sin(a.h) * a.v + a.vx) * nx + (Math.cos(a.h) * a.v + a.vz) * nz, vb = (Math.sin(b.h) * b.v + b.vx) * nx + (Math.cos(b.h) * b.v + b.vz) * nz, rel = va - vb;
    if (rel > 0){ a.vx -= nx * rel * 0.9; a.vz -= nz * rel * 0.9; b.vx += nx * rel * 0.9; b.vz += nz * rel * 0.9; a.v *= 0.6; b.v *= 0.6; if (i === B.mine || j === B.mine) Sound.thud(3 + rel * 2); }
  }
  B.cars.forEach(c => { c.g.position.set(c.x, 0, c.z); c.g.rotation.y = c.h; });
}

/* ===============================================================
   RUCH (co klatkę)
   =============================================================== */
function updatePark(dt){
  const t = clock;
  const pp = playerWorldPos(), near = Math.hypot(pp.x - 336, pp.z) < 420;   // daleko: tylko kolejki (gracz może jechać)
  for (const c of COASTERS){ coasterStep(c, dt); if (near || c.rider) coasterPlace(c); }
  if (curRide){ const v = rideSpeed(), bump = PARK_RIDES.bumper && curRide === PARK_RIDES.bumper.ride; Sound.engine(true, 0.08 + clamp(v / 30, 0, 1) * 0.5, bump ? 0.4 : 0.2, { pitch: bump ? 1.6 : 0.45, bright: 0.5 }); }
  if (!near && !curRide) return;
  const C = PARK_RIDES;
  if (C.fountain){ C.fountain.scale.set(1 + Math.sin(t * 3) * 0.04, 1 + Math.sin(t * 2.3) * 0.06, 1 + Math.sin(t * 3) * 0.04); C.fountain.rotation.y = t * 0.5; }
  if (C.carousel){
    const K = C.carousel, cyc = (t % K.period) / K.period;
    const wT = cyc < 0.06 ? cyc / 0.06 : cyc < K.run - 0.08 ? 1 : cyc < K.run ? (K.run - cyc) / 0.08 : 0;
    K.w = wT * 0.55; K.g.rotation.y += K.w * dt;
    K.horses.forEach(h => { h.position.y = wT > 0.01 ? Math.sin(t * 2.2 + h.userData.ph) * 0.35 * wT : damp(h.position.y, 0, 2, dt); });
  }
  if (C.wheel){
    const W = C.wheel; W.a0 += W.w * dt;
    W.wheel.rotation.x = -W.a0;
    W.gond.forEach(g => { const a = g.userData.a + W.a0; g.position.set(W.cx, W.hy + Math.sin(a) * W.R, W.cz + Math.cos(a) * W.R); });
  }
  if (C.swing){
    const S = C.swing, cyc = (t % S.period) / S.period;
    const w = cyc < 0.1 ? cyc / 0.1 : cyc < S.run - 0.12 ? 1 : cyc < S.run ? (S.run - cyc) / 0.12 : 0;
    S.w = damp(S.w, w * 1.25, 2, dt); S.ang += S.w * dt;
    S.top.rotation.y = S.ang; S.top.rotation.z = Math.sin(t * 0.4) * 0.05 * S.w;
    const out = Math.atan(S.w * S.w * 7 / 9.81);
    S.chairs.forEach(ch => { ch.rotation.z = out; });                       // krzesełka odchylają się na zewnątrz (lokalne +X przegubu = promień)
  }
  if (C.tower){
    const T = C.tower, cyc = (t % T.period) / T.period, top = T.H - 4;
    let yy = 2;
    if (cyc < 0.4) yy = 2 + (top - 2) * smooth01(cyc / 0.4);
    else if (cyc < 0.5) yy = top;
    else if (cyc < 0.592){ const k = (cyc - 0.5) / 0.092; yy = top - (top - 10) * k * k; }       // swobodny spadek ~2.8 s (≈ 98 km/h)
    else if (cyc < 0.62){ const k = (cyc - 0.592) / 0.028; yy = 10 - 8 * (1 - (1 - k) * (1 - k)); }   // hamowanie magnetyczne
    T.v = dt > 0 ? (yy - T.ring.position.y) / dt : 0;
    T.ring.position.y = yy;
  }
  updateBumperCars(dt);
  if (curRide && curRide.tick) curRide.tick();
  updateParkVisitors(dt);
}

/* zwiedzający: proste postacie chodzące po alejkach od punktu do punktu (bez fizyki); omijają fontannę */
const PARK_WP = [[290, 0], [302, 2], [316, -1], [356, 2], [372, -2], [384, 0], [PARK.plaza.x - 9, 6], [PARK.plaza.x + 9, -6], [PARK.plaza.x, 10], [PARK.plaza.x, -10],
                 [336, 30], [336, 55], [336, 90], [336, 120], [336, 148], [300, 67], [320, 67], [360, 67], [374, 67], [300, 101], [360, 101], [376, 101],
                 [336, -26], [342, -40], [305, 14], [354, 40], [350, 138]];
function updateParkVisitors(dt){
  if (!parkVisitors.length){
    const PAL = [0xc0392b, 0x2a6cd8, 0xe0a52c, 0x2f8a4c, 0xd35fa0, 0xf2f0ea, 0x6b3a8f, 0x1b1c1f];
    for (let k = 0; k < 40; k++){
      const h = buildHumanoid({ skin: [0xd9a882, 0x8d5a3b, 0xe8c4a0, 0xc68a62][k % 4], shirt: PAL[k % 8], pants: PAL[(k * 3 + 1) % 8], hair: [0x2a1f19, 0x9a6a3a, 0x15110e][k % 3] });
      h.group.scale.setScalar(k % 5 === 0 ? 0.7 : rand(0.92, 1.05));
      if (k % 6 === 2){ const bl = pkMesh([{ geo: pkC(0.01, 0.01, 1.6, 4), color: 0xf2f0ea, y: 2.0 }, { geo: new THREE.SphereGeometry(0.3, 8, 6), color: PAL[(k + 2) % 5], y: 2.9 }]); bl.position.set(-0.36, 0, 0); h.group.add(bl); }   // balonik
      scene.add(h.group);
      const w = PARK_WP[k % PARK_WP.length];
      parkVisitors.push({ h: h, x: w[0] + rand(-1.5, 1.5), z: w[1] + rand(-1.5, 1.5), tx: w[0], tz: w[1], sp: rand(0.9, 1.4), ph: rnd() * TAU, wait: rand(0, 4) });
    }
  }
  const PL = PARK.plaza;
  for (const v of parkVisitors){
    let dx = v.tx - v.x, dz = v.tz - v.z; const d = Math.hypot(dx, dz);
    if (d < 0.6){
      v.wait -= dt;
      if (v.wait <= 0){ const w = PARK_WP[randInt(0, PARK_WP.length - 1)]; v.tx = w[0] + rand(-1.8, 1.8); v.tz = w[1] + rand(-1.8, 1.8); v.wait = rand(1, 6); }
      v.h.legL.rotation.x = v.h.legR.rotation.x = damp(v.h.legL.rotation.x, 0, 6, dt);
    } else {
      const fx = v.x - PL.x, fz = v.z - PL.z, fd = Math.hypot(fx, fz);          // fontanna na drodze: obejście po stycznej
      if (fd < 7.5 && fd > 0.01){ const tx = -fz / fd, tz = fx / fd, sg = (tx * dx + tz * dz) > 0 ? 1 : -1; dx = tx * sg + fx / fd * 0.6; dz = tz * sg + fz / fd * 0.6; }
      const l = Math.hypot(dx, dz) || 1, s = Math.min(d, v.sp * dt);
      v.x += dx / l * s; v.z += dz / l * s;
      v.h.group.rotation.y = angleDamp(v.h.group.rotation.y, Math.atan2(dx, dz), 6, dt);
      v.ph += dt * 6 * v.sp;
      v.h.legL.rotation.x = Math.sin(v.ph) * 0.5; v.h.legR.rotation.x = -Math.sin(v.ph) * 0.5;
      v.h.armL.rotation.x = -Math.sin(v.ph) * 0.4; v.h.armR.rotation.x = Math.sin(v.ph) * 0.4;
    }
    v.h.group.position.set(v.x, 0.02, v.z);
  }
}
