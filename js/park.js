/* ---------------------------------------------------------------
   7a5. PARK ROZRYWKI — wschodni pas podmiejski wyspy głównej (PARK: x 280…392, |z| ≤ 160), wejście z alei j=6
   (plac i brama przy z = 0). Promenada wschód–zachód i bulwar północ–południe, budki, ławki, latarnie, drzewa.
   Atrakcje: duża kolejka górska „SMOK” (północ), mała „ŻABKA”, karuzela z konikami, diabelski młyn, wieża swobodnego
   spadania, karuzela łańcuchowa, autodrom. Kolejki: tor z próbek co 1 m (superelipsa z falowaniem, stacja na
   prostej, wyciąg łańcuchowy, górki o malejącej wysokości, odcinek hamowania), przechył w zakrętach, podpory
   z kolizją; pociąg jeździ cały czas (postój na stacji 8 s). Na stacji F = przejażdżka (tryb 'ride', kamera
   z pierwszego wagonu, mysz rozgląda się), po powrocie na stację gracz wysiada na peron.
   Budowa: buildPark() z city-generation.js; ruch: updatePark(dt) z main-loop.js.
   --------------------------------------------------------------- */
const PARK = { x0: 280, x1: 392, z0: -160, z1: 160, gateX: 296, promZ: 0, boulX: 336 };
const COASTERS = [];
const PARK_RIDES = { carousel: null, wheel: null, swing: null, tower: null, cars: [] };
const parkVisitors = [];
const _pkMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const _pkMatD = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
function pkMesh(parts, dbl){ const m = new THREE.Mesh(mergeColored(parts), dbl ? _pkMatD : _pkMat); m.castShadow = true; m.receiveShadow = true; return m; }
const pkB = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const pkC = (r0, r1, h, s) => new THREE.CylinderGeometry(r0, r1, h, s || 14);

/* --- tor kolejki: próbki co 1 m z ramą (styczna, bok, góra) --- */
function coasterBuild(cfg){
  /* 1) krzywa pozioma: superelipsa (płaskie boki — stacja na prostej po stronie południowej) z falowaniem poza stacją */
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
  /* 2) profil wysokości: stacja, wyciąg (z łagodnym początkiem i wierzchołkiem), górki o malejącej wysokości, hamowanie */
  const c = Object.assign({ P: P, L: L }, cfg);
  c.sStop = cfg.station;                                                    // przód pociągu na postoju
  c.sLift0 = cfg.station + 6; c.sTop = c.sLift0 + (cfg.H - cfg.yS) / cfg.liftSlope + 8; c.sBrake = L - cfg.brake;
  const yAt = s => {
    if (s <= c.sLift0) return cfg.yS;
    if (s <= c.sTop){ const t = (s - c.sLift0) / (c.sTop - c.sLift0); return cfg.yS + (cfg.H - cfg.yS) * (t < 0.12 ? t * t / 0.24 / 0.94 : t > 0.88 ? 1 - (1 - t) * (1 - t) / 0.24 / 0.94 : (t - 0.06) / 0.94); }
    if (s <= c.sBrake){ const t = (s - c.sTop) / (c.sBrake - c.sTop), env = 1 - cfg.decay * t; return cfg.yLow + (cfg.H - cfg.yLow) * env * (0.5 + 0.5 * Math.cos(TAU * cfg.hills * t)); }
    const t = (s - c.sBrake) / cfg.brake; return lerp(cfg.yLow, cfg.yS, smooth01(t));
  };
  P.forEach((p, s) => { p.y = yAt(s); });
  /* 3) rama: styczna 3D, bok poziomy, przechył z krzywizny i prędkości projektowej */
  const g = 9.81;
  P.forEach((p, i) => {
    const a = P[(i - 1 + L) % L], b = P[(i + 1) % L];
    let tx = b.x - a.x, ty = b.y - a.y, tz = b.z - a.z; const tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl;
    p.t = [tx, ty, tz];
    const h0 = Math.atan2(a.x - P[(i - 3 + L) % L].x, a.z - P[(i - 3 + L) % L].z), h1 = Math.atan2(P[(i + 3) % L].x - b.x, P[(i + 3) % L].z - b.z);
    const kap = wrapAngle(h1 - h0) / 4, v2 = Math.max(9, 2 * g * (cfg.H - p.y));
    p.bankT = i < c.sTop && i > c.sLift0 - 3 ? 0 : clamp(Math.atan(v2 * kap / g), -0.75, 0.75);
  });
  for (let pass = 0; pass < 3; pass++) P.forEach((p, i) => { p.bank = (P[(i - 2 + L) % L].bankT + P[(i - 1 + L) % L].bankT + p.bankT + P[(i + 1) % L].bankT + P[(i + 2) % L].bankT) / 5; }), P.forEach(p => { p.bankT = p.bank; });
  P.forEach(p => {
    const [tx, ty, tz] = p.t;
    let sx = tz, sz = -tx; const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;   // bok poziomy (w LEWO od kierunku jazdy)
    /* góra ⟂ do stycznej i boku (zawsze w górę), potem obrót wokół stycznej o przechył — w zakręcie w lewo (kap > 0)
       góra przechyla się w lewo (do środka łuku) */
    let gx = -sz * ty, gy = sz * tx - sx * tz, gz = sx * ty;
    if (gy < 0){ gx = -gx; gy = -gy; gz = -gz; }
    const cb = Math.cos(p.bank), sb = Math.sin(p.bank);
    p.side = [sx * cb - gx * sb, -gy * sb, sz * cb - gz * sb];
    p.up = [gx * cb + sx * sb, gy * cb, gz * cb + sz * sb];
  });
  COASTERS.push(c);
  return c;
}
function coasterSample(c, s, out){
  const L = c.L; s = ((s % L) + L) % L;
  const i = Math.floor(s), f = s - i, a = c.P[i], b = c.P[(i + 1) % L];
  out.x = lerp(a.x, b.x, f); out.y = lerp(a.y, b.y, f); out.z = lerp(a.z, b.z, f);
  out.t = a.t; out.side = a.side; out.up = a.up;
  return out;
}
/* geometria toru: dwie szyny, kręgosłup, podkłady, łańcuch na wyciągu, podpory z kolizją */
function coasterGeometry(c){
  const P = c.P, L = c.L, rail = CB(c.railCol), spine = CB(c.spineCol), sup = CB(c.supCol);
  const off = (p, a, b) => [p.x + p.side[0] * a + p.up[0] * b, p.y + p.side[1] * a + p.up[1] * b, p.z + p.side[2] * a + p.up[2] * b];
  /* rura o przekroju prostokątnym wzdłuż toru: środek (a, b) w układzie bok/góra, połowa wymiarów (w, h) */
  const tube = (buf, a, b, w, h, s0, s1) => {
    for (let i = s0; i < s1; i++){
      const p = P[i % L], q = P[(i + 1) % L];
      const C = [[-w, -h], [w, -h], [w, h], [-w, h]];
      for (let k = 0; k < 4; k++){
        const c0 = C[k], c1 = C[(k + 1) % 4];
        const A = off(p, a + c0[0], b + c0[1]), B = off(p, a + c1[0], b + c1[1]), Cq = off(q, a + c1[0], b + c1[1]), D = off(q, a + c0[0], b + c0[1]);
        const mx = (c0[0] + c1[0]) / 2, my = (c0[1] + c1[1]) / 2;
        quadOut(buf, A, B, Cq, D, [p.side[0] * mx + p.up[0] * my, p.side[1] * mx + p.up[1] * my, p.side[2] * mx + p.up[2] * my]);
      }
    }
  };
  tube(rail, -0.55, 0, 0.07, 0.07, 0, L); tube(rail, 0.55, 0, 0.07, 0.07, 0, L);
  tube(spine, 0, -0.42, 0.2, 0.2, 0, L);
  for (let i = 0; i < L; i += 2){ const p = P[i]; const A = off(p, -0.55, -0.05), B = off(p, 0.55, -0.05);   // podkłady
    spine.boxRot((A[0] + B[0]) / 2, (A[1] + B[1]) / 2 - 0.12, (A[2] + B[2]) / 2, 1.2, 0.18, 0.22, Math.atan2(p.t[0], p.t[2]), 1, true); }
  for (let i = c.sLift0; i < c.sTop - 4; i += 1){ const p = P[i], A = off(p, 0, 0.02); CB(0x3a3c40).boxRot(A[0], A[1], A[2], 0.25, 0.08, 0.6, Math.atan2(p.t[0], p.t[2]), 1, true); }   // łańcuch wyciągu
  /* podpory co ~7 m (poza stacją): słup od ziemi do spodu kręgosłupa, stopa, kolizja */
  for (let i = 4; i < L; i += 7){
    if (i < c.station + 3 && i > c.station - c.cars * 2.4 - 6) continue;
    const p = P[i], top = p.y - 0.62;
    if (top < 1.2) continue;
    const r = top > 20 ? 0.45 : 0.3;
    sup.box(p.x, top / 2, p.z, r * 2, top, r * 2, 2, false);
    CB(0x8a8c8f).box(p.x, 0.15, p.z, r * 4, 0.3, r * 4, 1, true);
    staticBox(p.x, top / 2, p.z, r * 2, top, r * 2);
    if (top > 14) sup.boxRot(p.x, top * 0.5, p.z, 0.2, 0.2, 2.6, Math.atan2(p.side[0], p.side[2]), 1, true);   // poprzeczka wysokiej podpory
  }
}
/* pociąg: wagoniki (model z przodem w +Z), pasażerowie NPC, pierwszy wagonik z nosem */
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
    c.cars3.push({ g: g, riders: [] });
  }
  c.s = c.sStop; c.v = 0; c.state = 'wait'; c.t = 4 + COASTERS.indexOf(c) * 3; c.lap = false; c.rider = false;
}
const _cs = {};
function coasterPlace(c){
  c.cars3[0].g.visible = !c.rider;                                         // jadący gracz siedzi w pierwszym wagonie (kamera z jego oczu)
  for (let k = 0; k < c.cars3.length; k++){
    const car = c.cars3[k], q = coasterSample(c, c.s - k * 2.4, _cs);
    car.g.position.set(q.x + q.up[0] * 0.08, q.y + q.up[1] * 0.08, q.z + q.up[2] * 0.08);
    /* model: +Z = styczna, +Y = góra toru, +X = góra × styczna (lewa strona) */
    const t = q.t, u = q.up, x = [u[1] * t[2] - u[2] * t[1], u[2] * t[0] - u[0] * t[2], u[0] * t[1] - u[1] * t[0]];
    _pkM.makeBasis(_pkV1.set(x[0], x[1], x[2]), _pkV2.set(u[0], u[1], u[2]), _pkV3.set(t[0], t[1], t[2]));
    car.g.quaternion.setFromRotationMatrix(_pkM);
  }
}
const _pkM = new THREE.Matrix4(), _pkV1 = new THREE.Vector3(), _pkV2 = new THREE.Vector3(), _pkV3 = new THREE.Vector3();
/* ruch pociągu: postój → wyjazd ze stacji (3 m/s) → wyciąg (5 m/s) → grawitacja z tarciem → hamowanie → postój */
function coasterStep(c, dt){
  if (c.state === 'wait'){
    c.v = 0; c.t -= dt;
    if (c.t <= 0){ c.state = 'go'; c.lap = false; }
    return;
  }
  const L = c.L, sm = ((c.s % L) + L) % L, g = 9.81;
  if (!c.lap && sm > c.sTop) c.lap = true;
  if (!c.lap){
    c.v = approach(c.v, sm < c.sLift0 ? 3 : c.liftV, 2 * dt);
  } else if (sm >= c.sTop && sm < c.sBrake){
    const y = coasterSample(c, sm, _cs).y;
    c.v = Math.max(4, Math.sqrt(Math.max(0, c.liftV * c.liftV + 2 * g * (c.H - y) - 2 * c.mu * g * (sm - c.sTop))));
  } else if (sm >= c.sBrake){
    c.v = approach(c.v, 3, 5 * dt);
  } else {                                                                  // po okrążeniu: dojazd do punktu postoju
    const rest = c.sStop - sm;
    c.v = Math.min(c.v, Math.max(0.6, Math.sqrt(Math.max(0, 2 * 1.2 * rest))));
    if (rest <= 0.05){ c.s += rest; c.v = 0; c.state = 'wait'; c.t = 8; if (c.rider) rideEnd(c); return; }
  }
  c.s += c.v * dt;
  if (c.s > L * 1000) c.s -= L * 1000;
}

/* --- przejażdżka gracza --- */
let curRide = null;
function coasterBoardPoint(c){ const q = coasterSample(c, c.sStop - 4, {}); return { x: q.x + q.side[0] * 2.6, z: q.z + q.side[2] * 2.6 }; }
function rideStart(c){
  if (c.state !== 'wait'){ hudToast('Kolejka jest w trasie — poczekaj na peronie'); return; }
  c.t = Math.max(c.t, 3); c.rider = true; curRide = c;
  mode = 'ride'; player.mesh.visible = false; delBody(player.body);
  planeCamYaw = 0;
  hudToast(c.name + ': trzymaj się! (mysz — rozglądanie się)', 3);
}
function rideEnd(c, force){
  c.rider = false; curRide = null;
  const b = coasterBoardPoint(c);
  mode = 'foot'; player.mesh.visible = true;
  player.body.position.set(b.x, 1.5, b.z); player.body.velocity.set(0, 0, 0); player.body.wakeUp(); addBody(player.body);
  player.fallSpeed = 0;
  Sound.engine(false, 0, 0);
  if (!force) hudToast('Koniec przejażdżki', 2);
}
function rideCamera(dt){
  const c = curRide, q = coasterSample(c, c.s + 0.4, _cs), ah = coasterSample(c, c.s + 14, {});
  const u = q.up;
  camera.position.set(q.x + u[0] * 1.5, q.y + u[1] * 1.5, q.z + u[2] * 1.5);
  if (clock - lastMouseMove > 1.5) planeCamYaw = angleDamp(planeCamYaw, 0, 1.5, dt);
  const yaw = planeCamYaw, dx = ah.x - camera.position.x, dz = ah.z - camera.position.z;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  camera.up.set(u[0], u[1], u[2]);
  camera.lookAt(camera.position.x + dx * cy + dz * sy, ah.y + 0.8, camera.position.z - dx * sy + dz * cy);
  camera.up.set(0, 1, 0);
  const f = 78 + fovAdd; if (Math.abs(camera.fov - f) > 0.01){ camera.fov = f; camera.updateProjectionMatrix(); }
  sun.target.position.set(q.x, 0, q.z); sun.position.set(q.x + lightDir.x * 95, lightDir.y * 95 + 2, q.z + lightDir.z * 95);
  camYaw = Math.atan2(-q.t[0], -q.t[2]);
}
function ridePos(){ const q = coasterSample(curRide, curRide.s, _cs); return { x: q.x, y: q.y, z: q.z }; }

/* ---------------------------------------------------------------
   BUDOWA
   --------------------------------------------------------------- */
function buildPark(){
  const A = PARK, y = 0.02, PAV = 0x857a66, PAV2 = 0x766b58;
  for (let i = treeSpots.length - 1; i >= 0; i--){ const t = treeSpots[i]; if (t.x > CITY_EDGE - 1 && t.z > A.z0 - 6 && t.z < A.z1 + 6) treeSpots.splice(i, 1); }
  const pave = (x0, x1, z0, z1, col) => { CB(col || PAV).plane((x0 + x1) / 2, y, (z0 + z1) / 2, x1 - x0, z1 - z0, 1, 1); mapExtras.push({ t: 'rect', x0: x0, x1: x1, z0: z0, z1: z1, c: '#8f8670' }); };
  /* plac wejściowy z alei j=6, promenada, bulwar, dojścia do atrakcji */
  pave(CITY_EDGE, A.gateX + 2, -14, 14, PAV2);
  pave(A.gateX, 388, -5, 5);
  pave(A.boulX - 3, A.boulX + 3, 5, 152);
  pave(A.boulX - 3, A.boulX + 3, -36, -5);
  pave(292, 380, 64, 70); pave(292, 380, 98, 104);
  for (let x = A.gateX + 4; x < 386; x += 6) CB(0x5f5647).plane(x, y + 0.004, 0, 0.12, 9.6, 1, 1);   // fugi promenady
  /* brama: dwie wieże z daszkami, łuk z napisem, kasy */
  const gx = A.gateX;
  for (const sz of [-1, 1]){
    CB(0xe9e2d0).box(gx, 4.5, sz * 9, 3, 9, 3, 2, true); CB(0xc0392b).box(gx, 9.6, sz * 9, 3.6, 1.2, 3.6, 1, true);
    CB(0x2f5f9a).box(gx, 10.9, sz * 9, 2.4, 1.4, 2.4, 1, true);
    staticBox(gx, 4.5, sz * 9, 3, 9, 3);
    CB(0xf2f0ea).box(gx - 6, 1.5, sz * 11, 3, 3, 2.4, 1, true); CB(0xc0392b).box(gx - 6, 3.15, sz * 11, 3.4, 0.3, 2.8, 1, true); staticBox(gx - 6, 1.5, sz * 11, 3, 3, 2.4);   // kasy
  }
  CB(0xc0392b).box(gx, 8.2, 0, 1.4, 1.6, 15, 1, true);
  wordSignQuad('PARK ROZRYWKI', '#c0392b', '#fff3d0', [gx - 0.72, 7.5, -6.8], [gx - 0.72, 7.5, 6.8], [gx - 0.72, 8.9, 6.8], [gx - 0.72, 8.9, -6.8]);   // od strony miasta
  wordSignQuad('PARK ROZRYWKI', '#c0392b', '#fff3d0', [gx + 0.72, 7.5, 6.8], [gx + 0.72, 7.5, -6.8], [gx + 0.72, 8.9, -6.8], [gx + 0.72, 8.9, 6.8]);   // od strony parku
  /* ogrodzenie dookoła (z bramą i wyjściem na bulwar nad morzem) */
  fenceLine(A.x0 + 0.5, A.z0, A.x0 + 0.5, -14); fenceLine(A.x0 + 0.5, 14, A.x0 + 0.5, A.z1);
  fenceLine(A.x0 + 0.5, A.z0, A.x1, A.z0); fenceLine(A.x0 + 0.5, A.z1, A.x1, A.z1);
  /* latarnie, ławki, drzewa wzdłuż alejek */
  for (let x = gx + 8; x < 386; x += 16) for (const sz of [-1, 1]) lampSpots.push({ x: x, z: sz * 6, rot: sz > 0 ? Math.PI : 0, y: 0 });
  for (let z = 14; z < 150; z += 16) lampSpots.push({ x: A.boulX + 4, z: z, rot: -Math.PI / 2, y: 0 });
  for (let x = gx + 12; x < 380; x += 16) for (const sz of [-1, 1]) bench(x, sz * 7.2, sz > 0 ? Math.PI : 0);
  const tree = (x, z) => treeSpots.push({ x: x, z: z, y: 0, type: randInt(0, 1), scale: rand(0.8, 1.3), rot: rnd() * TAU });
  for (let x = 340; x < 390; x += 9) tree(x, A.z1 - 4);
  for (let z = -30; z < 150; z += 12){ if (Math.abs(z) > 18) tree(A.x0 + 4, z); }
  /* budki z jedzeniem i pamiątkami (kolorowe dachy w paski) */
  const STALL = [0xc0392b, 0x2f8a4c, 0x2a6cd8, 0xe0a52c, 0x8e44ad];
  const stalls = [[304, 10], [318, 10], [352, 10], [366, 10], [304, -10], [318, -10], [352, -10], [366, -10]];
  stalls.forEach(([x, z], k) => {
    const sz = Math.sign(z), col = STALL[k % STALL.length];
    CB(0xf2f0ea).box(x, 1.3, z + sz * 1.2, 5, 2.6, 3.2, 1, false); CB(col).box(x, 1.0, z - sz * 0.45, 5.2, 0.2, 0.2, 1, true);
    for (let i = 0; i < 5; i++) CB(i % 2 ? 0xf2f0ea : col).boxRot(x - 2 + i, 2.9, z + sz * 0.6, 1, 0.12, 4.6, 0, 1, true);
    CB(0x7a5a3a).box(x, 1.05, z - sz * 0.2, 4.6, 0.12, 0.8, 1, true);
    staticBox(x, 1.3, z + sz * 1.2, 5, 2.6, 3.2);
    buildings.push({ x: x, z: z + sz * 1.2, w: 5, d: 3.2 });
  });
  /* klomby */
  for (const [x, z] of [[326, 20], [346, 20], [326, -20], [346, -20]]){ CB(0x7a5a3a).box(x, 0.2, z, 6, 0.4, 6, 1, true); CB(0xd35fa0).box(x, 0.45, z, 5, 0.12, 5, 1, true); staticBox(x, 0.2, z, 6, 0.4, 6); }

  /* ===== atrakcje statyczne + ruchome części ===== */
  buildCarousel(305, 30);
  buildFerrisWheel(372, 40);
  buildSwingRide(305, 86);
  buildDropTower(374, 82);
  buildBumperCars(370, 138);
  /* ===== kolejki ===== */
  const big = coasterBuild({ name: 'Kolejka SMOK', cx: 338, cz: -97, rx: 46, rz: 50, p: 0.32, wob: 0.12, wk: 3, wph: 0.7, stTh: Math.PI / 2, th0: Math.PI / 2 - 0.32,
    station: 30, H: 42, yS: 0.75, yLow: 1.4, liftSlope: 0.72, hills: 3.5, decay: 0.58, brake: 34, liftV: 5, mu: 0.012, cars: 5,
    railCol: 0xc0392b, spineCol: 0x9a2a20, supCol: 0x2f5f9a, carCol: 0xe0a52c });
  const small = coasterBuild({ name: 'Kolejka ŻABKA', cx: 308, cz: 133, rx: 20, rz: 19, p: 0.4, wob: 0.1, wk: 2, wph: 0.2, stTh: -Math.PI / 2, th0: -Math.PI / 2 - 0.42,
    station: 16, H: 12, yS: 0.75, yLow: 1.2, liftSlope: 0.5, hills: 2.5, decay: 0.45, brake: 18, liftV: 3.5, mu: 0.015, cars: 3,
    railCol: 0x2f8a4c, spineCol: 0x1f6a36, supCol: 0xe0b020, carCol: 0x2a6cd8 });
  COASTERS.forEach(c => {
    coasterGeometry(c); coasterTrain(c);
    /* stacja: peron (wierzch na wysokości chodnika) po zewnętrznej stronie, wiata, napis */
    const a = coasterSample(c, c.sStop - c.cars * 2.4 - 1, {}), b = coasterSample(c, c.sStop + 1, {});
    const mx = (a.x + b.x) / 2 + a.side[0] * 2.4, mz = (a.z + b.z) / 2 + a.side[2] * 2.4, len = Math.hypot(b.x - a.x, b.z - a.z) + 2, rot = Math.atan2(b.x - a.x, b.z - a.z);
    CB(0xb9b6ad).boxRot(mx, WALK_H / 2, mz, 3.2, WALK_H, len, rot, 2, true); staticBoxRot(mx, WALK_H / 2, mz, 3.2, WALK_H, len, rot);
    const cx2 = (a.x + b.x) / 2 + a.side[0] * 0.6, cz2 = (a.z + b.z) / 2 + a.side[2] * 0.6;
    CB(c.railCol).boxRot(cx2, 4.3, cz2, 6.6, 0.3, len + 1, rot, 1, true);
    for (const f of [-0.45, 0.45]) for (const sd of [-1, 1]){ const px = cx2 + Math.sin(rot) * f * len + a.side[0] * sd * 3.0, pz = cz2 + Math.cos(rot) * f * len + a.side[2] * sd * 3.0; CB(0xe9e2d0).box(px, 2.15, pz, 0.3, 4.3, 0.3, 1, false); staticBox(px, 2.15, pz, 0.3, 4.3, 0.3); }
    const nx = a.side[0], nz = a.side[2], ex = cx2 + nx * 3.32, ez = cz2 + nz * 3.32, tx = Math.sin(rot), tz = Math.cos(rot), hw = Math.min(6, len / 2 - 1);
    const sgn = (tx * nz - tz * nx) > 0 ? 1 : -1;                         // napis czytelny z zewnątrz
    wordSignQuad(c.name.replace('Kolejka ', ''), '#14161b', '#ffcf5a', [ex - tx * hw * sgn, 4.5, ez - tz * hw * sgn], [ex + tx * hw * sgn, 4.5, ez + tz * hw * sgn], [ex + tx * hw * sgn, 5.9, ez + tz * hw * sgn], [ex - tx * hw * sgn, 5.9, ez - tz * hw * sgn]);
    /* dojście z alejki do peronu */
    const bp = coasterBoardPoint(c);
    mapExtras.push({ t: 'line', pts: c.P.filter((p, i) => i % 4 === 0).map(p => [p.x, p.z]).concat([[c.P[0].x, c.P[0].z]]), w: 1.6, c: '#c0392b' });
    c.board = bp;
  });
  { const b = COASTERS[0].board; pave(Math.min(b.x, A.boulX) - 3, Math.max(b.x, A.boulX) + 3, -40, -34); pave(b.x - 3, b.x + 3, -44, -40); }
  { const b = COASTERS[1].board; pave(b.x - 3, b.x + 3, 103.5, b.z + 1.5); }
  /* minimapa */
  mapExtras.push({ t: 'disc', x: 305, z: 30, r: 8.5, c: '#d35fa0' }); mapExtras.push({ t: 'disc', x: 305, z: 86, r: 10, c: '#2a6cd8' });
  mapExtras.push({ t: 'rect', x0: 369, x1: 375, z0: 18, z1: 62, c: '#e9e2d0' }); mapExtras.push({ t: 'disc', x: 374, z: 82, r: 3, c: '#e0b020' });
  mapExtras.push({ t: 'rect', x0: 352, x1: 388, z0: 124, z1: 152, c: '#6b3a8f' });
}

/* karuzela z konikami: platforma (kolizja), środkowy słup, daszek w paski; ruchome: platforma z konikami */
function buildCarousel(cx, cz){
  CB(0x7a5a3a).box(cx, 0.2, cz, 17, 0.4, 17, 1, true); staticCylinder(cx, 0.4, cz, 8.2, 0.8);
  const g = new THREE.Group(); g.position.set(cx, 0, cz); scene.add(g);
  const parts = [{ geo: pkC(8, 8, 0.35, 28), color: 0xe9e2d0, y: 0.55 }, { geo: pkC(0.6, 0.6, 5.2, 12), color: 0xe0b020, y: 3.2 },
    { geo: pkC(8.6, 8.6, 0.6, 28), color: 0xc0392b, y: 5.3 }, { geo: pkC(0.3, 8.8, 2.2, 14), color: 0xc0392b, y: 6.7, colorFn: (x, y, z) => (Math.floor((Math.atan2(z, x) + Math.PI) / TAU * 14) % 2 ? 0xc0392b : 0xf2f0ea) }, { geo: pkC(0.3, 0.3, 1.2, 8), color: 0xe0b020, y: 8.3 }];
  for (let k = 0; k < 14; k++){ const a = k / 14 * TAU; parts.push({ geo: pkB(3.9, 0.7, 0.08), color: k % 2 ? 0xc0392b : 0xf2f0ea, x: Math.cos(a) * 8.62, y: 4.7, z: Math.sin(a) * 8.62, ry: -a + Math.PI / 2 }); }   // lambrekin pod krawędzią daszku
  g.add(pkMesh(parts, true));
  const horses = [];
  for (let k = 0; k < 12; k++){
    const a = k / 12 * TAU, r = k % 2 ? 6.2 : 4.4, h = new THREE.Group();
    h.add(pkMesh([{ geo: pkB(0.45, 0.6, 1.4), color: [0xf2f0ea, 0x8a5a3a, 0x1b1c1f, 0xe0a52c][k % 4], y: 1.3 }, { geo: pkB(0.35, 0.75, 0.35), color: [0xf2f0ea, 0x8a5a3a, 0x1b1c1f, 0xe0a52c][k % 4], y: 1.75, z: 0.65, rx: 0.4 },
      { geo: pkB(0.12, 0.6, 0.12), color: 0x6b4a2a, x: 0.12, y: 0.8, z: 0.45 }, { geo: pkB(0.12, 0.6, 0.12), color: 0x6b4a2a, x: -0.12, y: 0.8, z: -0.45 },
      { geo: pkC(0.05, 0.05, 4.6, 6), color: 0xe0b020, y: 2.8 }, { geo: pkB(0.5, 0.12, 0.6), color: 0xc0392b, y: 1.65 }]));
    h.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); h.rotation.y = -a; h.userData.ph = k * 1.3;
    g.add(h); horses.push(h);
  }
  PARK_RIDES.carousel = { g: g, horses: horses };
}
/* diabelski młyn: podstawa (kolizja), dwie nogi A, koło (szprychy, obręcze) obracające się, gondole zawsze pionowo */
function buildFerrisWheel(cx, cz){
  const R = 21, hy = R + 3;
  for (const sx of [-1.6, 1.6]) for (const sz of [-1, 1]) staticBox(cx + sx, 1.5, cz + sz * 9, 1.2, 3, 1.2);   // stopy nóg
  /* nogi pochylone: rysowane jako obrócone bryły w osobnej siatce */
  const legs = []; for (const sx of [-1.6, 1.6]) for (const sz of [-1, 1]) legs.push({ geo: pkB(0.6, Math.hypot(9, hy), 0.6), color: 0xe9e2d0, x: sx, y: hy / 2, z: sz * 4.5, rx: -sz * Math.atan2(9, hy) });
  legs.push({ geo: pkB(4.2, 1.2, 1.2), color: 0x8a8c8f, y: hy }, { geo: pkB(6, 3, 6), color: 0x2f5f9a, y: 1.5, z: -14 });
  const base = pkMesh(legs); base.position.set(cx, 0, cz); scene.add(base);
  CB(0x8a8c8f).box(cx, 0.2, cz, 7, 0.4, 22, 1, true);
  staticBox(cx, 1.5, cz - 14, 6, 3, 6);
  const wheel = new THREE.Group(); wheel.position.set(cx, hy, cz); scene.add(wheel);
  const parts = [];
  for (const sx of [-1.3, 1.3]){
    for (let k = 0; k < 48; k++){ const a = k / 48 * TAU, a2 = (k + 1) / 48 * TAU, mz = (Math.cos(a) + Math.cos(a2)) / 2 * R, my = (Math.sin(a) + Math.sin(a2)) / 2 * R;
      parts.push({ geo: pkB(0.25, 0.3, TAU * R / 48 + 0.1), color: 0xf2f0ea, x: sx, y: my, z: mz, rx: Math.PI / 2 - (a + a2) / 2 }); }
    for (let k = 0; k < 16; k++){ const a = k / 16 * TAU; parts.push({ geo: pkB(0.15, R, 0.15), color: 0xc8ccd2, x: sx, y: Math.sin(a) * R / 2, z: Math.cos(a) * R / 2, rx: -(a - Math.PI / 2) }); }
  }
  parts.push({ geo: pkC(1, 1, 3.2, 16), color: 0xc0392b, rz: Math.PI / 2 });
  wheel.add(pkMesh(parts));
  const gond = [], GC = [0xc0392b, 0x2a6cd8, 0xe0a52c, 0x2f8a4c];
  for (let k = 0; k < 16; k++){
    const gp = new THREE.Group();
    gp.add(pkMesh([{ geo: pkB(1.8, 1.6, 1.8), color: GC[k % 4], y: -1.5 }, { geo: pkB(1.9, 0.15, 1.9), color: 0xf2f0ea, y: -0.65 }, { geo: pkB(0.12, 0.8, 0.12), color: 0x8a8c8f, y: -0.3 }, { geo: pkB(1.7, 0.7, 1.7), color: 0x1b2a38, y: -1.25 }]));
    gp.userData.a = k / 16 * TAU; scene.add(gp); gond.push(gp);
  }
  PARK_RIDES.wheel = { wheel: wheel, gond: gond, cx: cx, cz: cz, hy: hy, R: R };
}
/* karuzela łańcuchowa: słup, obrotowy daszek, krzesełka na łańcuchach odchylające się na zewnątrz */
function buildSwingRide(cx, cz){
  CB(0x8a8c8f).box(cx, 0.15, cz, 4, 0.3, 4, 1, true);
  CB(0x2a6cd8).box(cx, 6, cz, 1.2, 12, 1.2, 1, false); staticBox(cx, 6, cz, 1.2, 12, 1.2);
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
  PARK_RIDES.swing = { top: top, chairs: chairs, w: 0, ang: 0 };
}
/* wieża swobodnego spadania: maszt 52 m, pierścień z siedzeniami jadący w górę i spadający */
function buildDropTower(cx, cz){
  const H = 52;
  CB(0x8a8c8f).box(cx, 0.2, cz, 8, 0.4, 8, 1, true);
  CB(0xe9e2d0).box(cx, H / 2, cz, 2.2, H, 2.2, 3, true); staticBox(cx, H / 2, cz, 2.2, H, 2.2);
  CB(0xc0392b).box(cx, H + 1, cz, 3, 2, 3, 1, true); CB(0xfff3b0).box(cx, H + 2.3, cz, 0.6, 0.6, 0.6, 1, true);
  for (let y = 6; y < H; y += 6) CB(0xc0392b).box(cx, y, cz, 2.5, 0.3, 2.5, 1, true);
  const ring = new THREE.Group(); ring.position.set(cx, 2, cz); scene.add(ring);
  const parts = [{ geo: pkB(4.2, 1.0, 4.2), color: 0x2a6cd8 }];
  for (let k = 0; k < 8; k++){ const a = k / 8 * TAU; parts.push({ geo: pkB(0.8, 1.4, 0.7), color: 0xe0a52c, x: Math.cos(a) * 2.5, y: -0.6, z: Math.sin(a) * 2.5, ry: -a }); }
  ring.add(pkMesh(parts));
  PARK_RIDES.tower = { ring: ring, H: H, t: 0 };
}
/* autodrom: hala z dachem na słupach, tor, kolorowe samochodziki jeżdżące w kółko */
function buildBumperCars(cx, cz){
  const w = 32, d = 24;
  CB(0x5a5c62).plane(cx, 0.03, cz, w, d, 1, 1);
  CB(0x7a5a3a).box(cx, 0.25, cz - d / 2, w, 0.5, 0.3, 1, true); CB(0x7a5a3a).box(cx, 0.25, cz + d / 2, w, 0.5, 0.3, 1, true);
  CB(0x7a5a3a).box(cx + w / 2, 0.25, cz, 0.3, 0.5, d, 1, true);
  staticBox(cx, 0.25, cz - d / 2, w, 0.5, 0.3); staticBox(cx, 0.25, cz + d / 2, w, 0.5, 0.3); staticBox(cx + w / 2, 0.25, cz, 0.3, 0.5, d);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]){ CB(0xe0a52c).box(cx + sx * (w / 2 - 0.4), 3, cz + sz * (d / 2 - 0.4), 0.5, 6, 0.5, 1, false); staticBox(cx + sx * (w / 2 - 0.4), 3, cz + sz * (d / 2 - 0.4), 0.5, 6, 0.5); }
  CB(0x6b3a8f).box(cx, 6.3, cz, w + 1, 0.6, d + 1, 2, true);
  wordSignQuad('AUTODROM', '#6b3a8f', '#ffcf5a', [cx - w / 2 - 0.55, 6.0, cz + 8], [cx - w / 2 - 0.55, 6.0, cz - 8], [cx - w / 2 - 0.55, 6.6, cz - 8], [cx - w / 2 - 0.55, 6.6, cz + 8]);
  const CC = [0xc0392b, 0x2a6cd8, 0xe0a52c, 0x2f8a4c, 0xd35fa0, 0xf2f0ea];
  for (let k = 0; k < 9; k++){
    const g = pkMesh([{ geo: pkB(1.3, 0.45, 1.9), color: CC[k % 6], y: 0.4 }, { geo: pkB(1.5, 0.22, 2.1), color: 0x1b1c1f, y: 0.2 }, { geo: pkB(0.05, 2.6, 0.05), color: 0x8a8c8f, y: 1.9, z: -0.7 }, { geo: pkB(0.9, 0.5, 0.15), color: 0x26282c, y: 0.8, z: -0.5 }]);
    scene.add(g);
    PARK_RIDES.cars.push({ g: g, cx: cx, cz: cz, r: 4 + (k % 3) * 3.4, a: k * 0.7, w: rand(0.5, 0.9) * (k % 2 ? 1 : -1) });
  }
}

/* ---------------------------------------------------------------
   RUCH (co klatkę): atrakcje, kolejki, zwiedzający
   --------------------------------------------------------------- */
function updatePark(dt){
  const t = clock;
  const pp = playerWorldPos(), near = Math.hypot(pp.x - 336, pp.z) < 420;   // daleko: tylko kolejki (gracz może jechać)
  for (const c of COASTERS){ coasterStep(c, dt); if (near || c.rider) coasterPlace(c); }
  if (curRide){
    const v = curRide.v;
    Sound.engine(true, 0.08 + clamp(v / 30, 0, 1) * 0.5, 0.2, { pitch: 0.45, bright: 0.5 });
  }
  if (!near) return;
  const C = PARK_RIDES;
  if (C.carousel){ C.carousel.g.rotation.y = t * 0.45; C.carousel.horses.forEach(h => { h.position.y = Math.sin(t * 2.2 + h.userData.ph) * 0.35; }); }
  if (C.wheel){
    const W = C.wheel, a0 = t * 0.07;
    W.wheel.rotation.x = -a0;
    W.gond.forEach(g => { const a = g.userData.a + a0; g.position.set(W.cx, W.hy + Math.sin(a) * W.R, W.cz + Math.cos(a) * W.R); });
  }
  if (C.swing){
    const S = C.swing, cyc = (t % 40) / 40, w = cyc < 0.1 ? cyc / 0.1 : cyc < 0.7 ? 1 : cyc < 0.85 ? 1 - (cyc - 0.7) / 0.15 : 0;
    S.w = damp(S.w, w * 1.25, 1.5, dt); S.ang += S.w * dt;
    S.top.rotation.y = S.ang; S.top.rotation.z = Math.sin(t * 0.4) * 0.05 * S.w;
    const out = Math.atan(S.w * S.w * 7 / 9.81);
    S.chairs.forEach(ch => { ch.rotation.z = out; });                       // krzesełka odchylają się na zewnątrz (lokalne +X przegubu = promień)
  }
  if (C.tower){
    const T = C.tower, cyc = (t % 30) / 30;                                   // wjazd 12 s, zawis 3 s, spadek 1.6 s, hamowanie, postój
    const top = T.H - 4;
    let yy = 2;
    if (cyc < 0.4) yy = 2 + (top - 2) * smooth01(cyc / 0.4);
    else if (cyc < 0.5) yy = top;
    else if (cyc < 0.555){ const k = (cyc - 0.5) / 0.055; yy = top - (top - 10) * k * k; }
    else if (cyc < 0.62){ const k = (cyc - 0.555) / 0.065; yy = 10 - 8 * smooth01(k); }
    T.ring.position.y = yy;
  }
  C.cars.forEach(c => { c.a += c.w * dt; const r = c.r + Math.sin(t * 0.7 + c.a) * 1.6; c.g.position.set(c.cx + Math.cos(c.a) * r * 1.2, 0, c.cz + Math.sin(c.a) * r * 0.8); c.g.rotation.y = -c.a + (c.w > 0 ? 0 : Math.PI); });
  updateParkVisitors(dt);
}

/* zwiedzający: proste postacie chodzące po alejkach od punktu do punktu (bez fizyki) */
const PARK_WP = [[290, 0], [310, 2], [336, 0], [360, -2], [384, 0], [336, 20], [336, 55], [336, 90], [336, 120], [336, 148], [300, 55], [360, 55], [300, 103], [360, 103],
                 [336, -20], [336, -36], [310, -2], [350, 3]];
function updateParkVisitors(dt){
  if (!parkVisitors.length){
    const PAL = [0xc0392b, 0x2a6cd8, 0xe0a52c, 0x2f8a4c, 0xd35fa0, 0xf2f0ea, 0x6b3a8f, 0x1b1c1f];
    for (let k = 0; k < 28; k++){
      const h = buildHumanoid({ skin: [0xd9a882, 0x8d5a3b, 0xe8c4a0, 0xc68a62][k % 4], shirt: PAL[k % 8], pants: PAL[(k * 3 + 1) % 8], hair: [0x2a1f19, 0x9a6a3a, 0x15110e][k % 3] });
      h.group.scale.setScalar(k % 5 === 0 ? 0.7 : rand(0.92, 1.05));
      scene.add(h.group);
      const w = PARK_WP[k % PARK_WP.length];
      parkVisitors.push({ h: h, x: w[0] + rand(-2, 2), z: w[1] + rand(-2, 2), tx: w[0], tz: w[1], sp: rand(0.9, 1.4), ph: rnd() * TAU, wait: rand(0, 4) });
    }
  }
  for (const v of parkVisitors){
    const dx = v.tx - v.x, dz = v.tz - v.z, d = Math.hypot(dx, dz);
    if (d < 0.6){
      v.wait -= dt;
      if (v.wait <= 0){ const w = PARK_WP[randInt(0, PARK_WP.length - 1)]; v.tx = w[0] + rand(-2.5, 2.5); v.tz = w[1] + rand(-2.5, 2.5); v.wait = rand(1, 6); }
      v.h.legL.rotation.x = v.h.legR.rotation.x = damp(v.h.legL.rotation.x, 0, 6, dt);
    } else {
      const s = Math.min(d, v.sp * dt);
      v.x += dx / d * s; v.z += dz / d * s;
      v.h.group.rotation.y = angleDamp(v.h.group.rotation.y, Math.atan2(dx, dz), 6, dt);
      v.ph += dt * 6 * v.sp;
      v.h.legL.rotation.x = Math.sin(v.ph) * 0.5; v.h.legR.rotation.x = -Math.sin(v.ph) * 0.5;
      v.h.armL.rotation.x = -Math.sin(v.ph) * 0.4; v.h.armR.rotation.x = Math.sin(v.ph) * 0.4;
    }
    v.h.group.position.set(v.x, 0.02, v.z);
  }
}
