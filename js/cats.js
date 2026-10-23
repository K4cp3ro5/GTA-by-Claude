/* ---------------------------------------------------------------
   14e. KOTY — trzy rodzaje:
   - 'walk': chodniki dookoła kwartałów (narożniki ±13.5 m od środka), przysiad, przebieganie przez ulicę na sąsiedni
     kwartał (tylko gdy żadne auto NPC nie nadjeżdża; auto blisko w trakcie — sprint);
   - 'roam': wędrówka po trawie pasa podmiejskiego (losowe cele poza budynkami, autostradami i parkiem);
   - 'park': spacer po alejkach parku rozrywki (graf zwiedzających z park.js).
   Odmiany umaszczenia (CAT_COATS: rudy pręgowany, czarny, szary pręgowany, biały, tuxedo, syjamski, szylkretowy,
   niebieski rosyjski) losowane. Spawn z dala od gracza (> 40 m); na minimapie i mapie — kropki.
   Nakarmiony rybą (inventory.js) zostaje PRZYJACIELEM (najwyżej CAT_FRIEND_MAX = 6; siódmy tylko zje): je (serduszka), potem zawsze chodzi za graczem — każdy na swoim
   miejscu w szyku za plecami (także za rowerem, biegiem); w pojeździe jedzie z nim — na dachu auta, na skrzydłach samolotu,
   na kanapie łodzi, na czaszy spadochronu (syncRidingCats); po wysiadce zeskakuje obok.
   Skrzywdzenie kota przez gracza (auto, kula, cios, wybuch): gracz wybucha i ginie bez względu na nieśmiertelność,
   „JAK MOGŁEŚ?!”, odrodzenie w szpitalu. Kot jadący z graczem jest bezpieczny.
   --------------------------------------------------------------- */
const CATS = [], CAT_FRIEND_MAX = 6;
let CAT_COUNT = 34;
const catFriendCount = () => CATS.filter(c => c.friend && !c.dead).length;
/* odmiany: kolory części (ciało, brzuch/pyszczek, głowa, uszy, ogon, łapy) i desenie (pręgi, łaty) */
const CAT_COATS = [
  { name: 'rudy pręgowany', body: 0xd9822b, belly: 0xf2e6d0, head: 0xd9822b, ears: 0xd9822b, tail: 0xd9822b, paws: 0xf2e6d0, stripe: 0xa85a18 },
  { name: 'czarny',         body: 0x18181a, belly: 0x232326, head: 0x18181a, ears: 0x18181a, tail: 0x18181a, paws: 0x18181a, eyes: 0xe8d040 },
  { name: 'szary pręgowany', body: 0x8a8c8f, belly: 0xd8d4cc, head: 0x8a8c8f, ears: 0x8a8c8f, tail: 0x8a8c8f, paws: 0xd8d4cc, stripe: 0x4a4c50 },
  { name: 'biały',          body: 0xf2f0ea, belly: 0xffffff, head: 0xf2f0ea, ears: 0xf2c0c0, tail: 0xf2f0ea, paws: 0xf2f0ea, eyes: 0x5aa0e8 },
  { name: 'tuxedo',         body: 0x1b1b1d, belly: 0xf4f2ec, head: 0x1b1b1d, ears: 0x1b1b1d, tail: 0x1b1b1d, paws: 0xf4f2ec, muzzle: 0xf4f2ec },
  { name: 'syjamski',       body: 0xeadcc4, belly: 0xf4ecdc, head: 0x4a3426, ears: 0x3a2618, tail: 0x3a2618, paws: 0x4a3426, eyes: 0x5aa0e8 },
  { name: 'szylkretowy',    body: 0xf2ece0, belly: 0xffffff, head: 0x1b1b1d, ears: 0xd9822b, tail: 0xd9822b, paws: 0xf2ece0, patch: [0xd9822b, 0x1b1b1d] },
  { name: 'niebieski rosyjski', body: 0x6f7c8c, belly: 0x7f8c9c, head: 0x6f7c8c, ears: 0x6f7c8c, tail: 0x6f7c8c, paws: 0x6f7c8c, eyes: 0x6fd06b }
];
const _catMat = new THREE.MeshLambertMaterial({ vertexColors: true });
function buildCat(coat){
  const B = (w, h, d, sz) => new THREE.BoxGeometry(w, h, d, 1, 1, sz || 1), C = coat;
  const ear = new THREE.ConeGeometry(0.045, 0.09, 4), eye = C.eyes || 0x8fd16b;
  /* ciało z 8 odcinków wzdłuż: pręgi (co drugi odcinek grzbietu) albo łaty (szylkret) */
  const bodyFn = C.stripe ? (x, y, z) => (y > 0.26 && Math.floor((z + 0.23) / 0.0575) % 2 ? C.stripe : null)
               : C.patch ? (x, y, z) => { const k = Math.floor((z + 0.23) / 0.0575) + (x > 0 ? 3 : 0); return k % 5 === 1 ? C.patch[0] : k % 5 === 3 ? C.patch[1] : null; } : null;
  const g = new THREE.Group();
  const body = new THREE.Mesh(mergeColored([
    { geo: B(0.2, 0.18, 0.46, 8), color: C.body, y: 0.25, colorFn: bodyFn }, { geo: B(0.16, 0.06, 0.3), color: C.belly, y: 0.17 },
    { geo: B(0.19, 0.17, 0.17), color: C.head, y: 0.37, z: 0.28 }, { geo: B(0.1, 0.07, 0.05), color: C.muzzle || C.belly, y: 0.33, z: 0.37 },
    { geo: B(0.03, 0.025, 0.02), color: 0xd88a8a, y: 0.355, z: 0.396 },
    { geo: ear, color: C.ears, x: 0.06, y: 0.48, z: 0.27 }, { geo: ear, color: C.ears, x: -0.06, y: 0.48, z: 0.27 },
    { geo: B(0.035, 0.03, 0.01), color: eye, x: 0.05, y: 0.39, z: 0.367 }, { geo: B(0.035, 0.03, 0.01), color: eye, x: -0.05, y: 0.39, z: 0.367 },
    { geo: B(0.05, 0.17, 0.05), color: C.paws, x: 0.07, y: 0.085, z: 0.16 }, { geo: B(0.05, 0.17, 0.05), color: C.paws, x: -0.07, y: 0.085, z: 0.16 },
    { geo: B(0.05, 0.17, 0.05), color: C.paws, x: 0.07, y: 0.085, z: -0.16 }, { geo: B(0.05, 0.17, 0.05), color: C.paws, x: -0.07, y: 0.085, z: -0.16 }
  ]), _catMat);
  body.castShadow = true; g.add(body);
  const tail = new THREE.Group(); tail.position.set(0, 0.3, -0.22);
  tail.add(new THREE.Mesh(mergeColored([{ geo: B(0.04, 0.04, 0.3, 4), color: C.tail, z: -0.15, colorFn: C.stripe ? (x, y, z) => (Math.floor(-z / 0.075) % 2 ? C.stripe : null) : null }]), _catMat));
  g.add(tail);
  g.userData.catRef = null;
  scene.add(g);
  return { g: g, body: body, tail: tail };
}
const catCorner = (bi, bj, k) => { const cx = blockCenter(bi), cz = blockCenter(bj), s = [[1, 1], [-1, 1], [-1, -1], [1, -1]][k]; return { x: cx + s[0] * 13.5, z: cz + s[1] * 13.5, sx: s[0], sz: s[1] }; };
/* wolny punkt na trawie pasa podmiejskiego (poza budynkami, autostradami, lotniskami, parkiem) */
function catRoamSpot(){
  for (let t = 0; t < 40; t++){
    const side = randInt(0, 3), along = rand(-385, 385), depth = rand(CITY_EDGE + 8, WALL_X - 6);
    const x = side < 2 ? along : (side === 2 ? depth : -depth), z = side < 2 ? (side === 0 ? depth : -depth) : along;
    if (hwyQuery(x, z, 4).length || inRect({ x0: PARK.x0 - 4, x1: PARK.x1 + 4, z0: PARK.z0 - 4, z1: PARK.z1 + 4 }, x, z)) continue;
    if (x < -CITY_EDGE && Math.abs(z) < 190) continue;                                   // lotnisko miejskie
    if (z < -CITY_EDGE && Math.abs(x) < 175) continue;                                   // port
    if (buildings.some(b => Math.abs(x - b.x) < b.w / 2 + 3 && Math.abs(z - b.z) < b.d / 2 + 3)) continue;
    return { x: x, z: z };
  }
  return null;
}
function catPlace(c, kind){
  const pp = typeof playerWorldPos === 'function' ? playerWorldPos() : player.body.position;   // boats.js wczytuje się później
  c.kind = kind; c.state = 'sit'; c.t = rand(1, 5); c.dead = false; c.eatT = 0; c.friend = false; c.riding = false;
  for (let t = 0; t < 30; t++){
    if (kind === 'walk'){
      const b = pedBlockCandidates[randInt(0, pedBlockCandidates.length - 1)], k = randInt(0, 3), p = catCorner(b.bi, b.bj, k);
      if (t < 25 && Math.hypot(p.x - pp.x, p.z - pp.z) < 40) continue;
      c.bi = b.bi; c.bj = b.bj; c.k = k; c.x = c.tx = p.x; c.z = c.tz = p.z; break;
    } else if (kind === 'roam'){
      const p = catRoamSpot(); if (!p || (t < 25 && Math.hypot(p.x - pp.x, p.z - pp.z) < 40)) continue;
      c.x = c.tx = p.x; c.z = c.tz = p.z; break;
    } else {
      if (typeof PARK_GRAPH === 'undefined' || !PARK_GRAPH){ if (typeof parkGraph === 'function') PARK_GRAPH = parkGraph(); }
      const ids = Object.keys(PARK_GRAPH), a = PARK_GRAPH[ids[randInt(0, ids.length - 1)]];
      c.from = a; c.to = PARK_GRAPH[a.nb[0]]; c.x = c.tx = a.x; c.z = c.tz = a.z; break;
    }
  }
  c.m.g.visible = true;
}
function spawnCat(i){
  const coat = CAT_COATS[Math.floor(Math.random() * CAT_COATS.length)], m = buildCat(coat);
  const c = { m: m, i: i, coat: coat, dir: rnd() < 0.5 ? 1 : -1, x: 0, z: 0, tx: 0, tz: 0, sp: rand(0.8, 1.3), ph: rnd() * TAU, h: rnd() * TAU, dead: false };
  m.g.userData.catRef = c;
  catPlace(c, i % 6 === 4 ? 'roam' : i % 9 === 7 ? 'park' : 'walk');
  CATS.push(c);
  return c;
}
function setCatCount(n){
  CAT_COUNT = n;
  while (CATS.length > n){ const c = CATS.pop(); scene.remove(c.m.g); }
  while (CATS.length < n) spawnCat(CATS.length);
}
setCatCount(CAT_COUNT);
function catNextTarget(c){
  if (c.kind === 'roam'){                                                                // nowy cel na trawie w promieniu ~25 m
    if (rnd() < 0.35){ c.state = 'sit'; c.t = rand(3, 9); return; }
    for (let t = 0; t < 12; t++){
      const a = rnd() * TAU, r = rand(6, 25), x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (Math.abs(x) < CITY_EDGE + 6 && Math.abs(z) < CITY_EDGE + 6) continue;
      if (Math.abs(x) > WALL_X - 5 || Math.abs(z) > WALL_X - 5 || hwyQuery(x, z, 3).length) continue;
      if (buildings.some(b => Math.abs(x - b.x) < b.w / 2 + 2 && Math.abs(z - b.z) < b.d / 2 + 2)) continue;
      c.tx = x; c.tz = z; c.state = 'walk'; return;
    }
    c.state = 'sit'; c.t = 2; return;
  }
  if (c.kind === 'park'){
    const prev = c.from; c.from = c.to; const opts = c.from.nb.filter(id => PARK_GRAPH[id] !== prev);
    c.to = PARK_GRAPH[opts.length ? opts[randInt(0, opts.length - 1)] : c.from.nb[0]]; c.tx = c.to.x; c.tz = c.to.z;
    if (rnd() < 0.3){ c.state = 'sit'; c.t = rand(2, 6); } else c.state = 'walk';
    return;
  }
  /* chodnik: na narożniku przysiad, dalej po obwodzie kwartału albo przebiegnięcie przez ulicę */
  const r = rnd(), here = catCorner(c.bi, c.bj, c.k);
  if (r < 0.25){ c.state = 'sit'; c.t = rand(2, 7); return; }
  if (r < 0.45){
    const alongX = rnd() < 0.5, nbi = c.bi + (alongX ? here.sx : 0), nbj = c.bj + (alongX ? 0 : here.sz);
    if (pedBlockSet.has(nbi + ',' + nbj)){
      const tx = alongX ? here.x + here.sx * 17 : here.x, tz = alongX ? here.z : here.z + here.sz * 17;
      const busy = npcs.some(n => Math.abs(n.y || 0) < 1 && Math.hypot(n.pos.x - (here.x + tx) / 2, n.pos.y - (here.z + tz) / 2) < 28);
      if (!busy){
        const nk = [[1, 1], [-1, 1], [-1, -1], [1, -1]].findIndex(s => s[0] === (alongX ? -here.sx : here.sx) && s[1] === (alongX ? here.sz : -here.sz));
        c.bi = nbi; c.bj = nbj; c.k = nk; const q = catCorner(nbi, nbj, nk); c.tx = q.x; c.tz = q.z; c.state = 'cross'; return;
      }
    }
  }
  c.k = (c.k + c.dir + 4) % 4; const q = catCorner(c.bi, c.bj, c.k); c.tx = q.x; c.tz = q.z; c.state = 'walk';
}
/* wysokość podłoża pod kotem: chodnik albo jezdnia/trawa; kot-przyjaciel — podłoże pod nim (raycast co kilka klatek) */
function catGroundY(c){
  if (c.friend && c.gy !== undefined) return c.gy;
  return catBaseY(c);
}
function catBaseY(c){
  if (c.kind !== 'walk' || c.bi === undefined) return 0.02;
  return Math.abs(c.x - blockCenter(c.bi)) > 15.2 || Math.abs(c.z - blockCenter(c.bj)) > 15.2 ? 0.02 : WALK_H;
}
/* podłoże pod kotem-przyjacielem: promień w dół od wysokości odniesienia (ostatnie podłoże albo stopy gracza); chodnik, nasyp, pomost */
function catProbeY(c, y0){
  const h = rayHit(c.x, y0 + 1.6, c.z, c.x, y0 - 4, c.z, G_WORLD);
  return h && h.hitNormalWorld.y > 0.5 ? h.hitPointWorld.y + 0.01 : catBaseY(c);
}
/* koty-przyjaciele w pojeździe gracza: miejsca w układzie modelu pojazdu (auto — dach, samolot — skrzydła na zmianę lewe/prawe,
   łódź — kanapa na rufie); wysokość z promienia w dół na model (pamiętana dla modelu i miejsca), więc kot siedzi na powierzchni.
   Rower nie ma miejsca — koty biegną za nim. */
const _catYawPi = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const _rideRay = new THREE.Raycaster(), _rideY = new Map(), _rideO = new THREE.Vector3(), _rideD = new THREE.Vector3(), _rideQ = new THREE.Quaternion();
function catRideFrame(){
  if (mode === 'car' && !activeCarGone && !CAR_TYPES[carType].bike){
    const T = CAR_TYPES[carType];
    /* dach = najwyżej położona bryła lakieru; model jest obrócony o π (nos siatki +Z → fizyczny przód −Z) */
    const roof = carParts(carType).filter(q => q[3] === 'paint').reduce((a, q) => q[5] + q[1] / 2 > a[5] + a[1] / 2 ? q : a);
    const cols = roof[0] > 1.3 ? 3 : 2, dx = Math.min(0.36, (roof[0] - 0.3) / 2);
    return { obj: carModel.root, yaw: true, fy: carTopOf(carType) - T.restY,
      slot: (k, n) => { const r = Math.floor(k / cols), rows = Math.ceil(n / cols), c = k % cols;
        return { x: cols === 3 ? (c - 1) * dx : (c ? -dx : dx) * 0.7, z: -roof[6] + (r - (rows - 1) / 2) * 0.52 }; } };
  }
  if (mode === 'foot' && typeof parachute !== 'undefined' && parachute.on && parachute.mesh){
    /* czasza: komory na łuku R = 6.5 m (rozpiętość 7.6 m) — koty w poprzek czaszy od środka na zmianę w prawo i w lewo,
       przechyleni wg łuku; w swobodnym spadku (czasza jeszcze zamknięta) niewidoczne */
    return { obj: parachute.mesh.userData.canopy, yaw: false, fy: 0.21, hidden: parachute.t < 0.7 || (parachute.open || 0) < 0.6,
      slot: k => { const r = k % 7, x = r ? (r % 2 ? 1 : -1) * Math.ceil(r / 2) * 1.05 : 0; return { x: x, z: Math.floor(k / 7) * -0.9 + 0.2, rz: -Math.asin(x / 6.5) }; } };
  }
  if (mode === 'plane' && curPlane){
    const jet = curPlane.T === PLANE_TYPES.jet;
    return { obj: curPlane.group, yaw: false, fy: curPlane.T.half[1],
      slot: k => { const s = k % 2 ? -1 : 1, r = Math.floor(k / 2);
        if (jet){ const x = Math.min(10.5, 3.6 + r * 1.6); return { x: s * x, z: -4.5 * x / 12.5 }; }       // środek cięciwy skośnego skrzydła
        return { x: s * Math.min(5, 1.9 + r * 1.05), z: 0.95 }; } };                                        // górnopłat awionetki
  }
  if (mode === 'heli' && curHeli){                                                  // helikopter: podłoga kabiny (za fotelami)
    return { obj: curHeli.group, yaw: false, fy: -0.88, noRay: true, slot: k => ({ x: (k % 2 ? -1 : 1) * 0.45, z: -0.55 - Math.floor(k / 2) * 0.5 }) };
  }
  if (mode === 'boat' && curBoat){
    return { obj: curBoat.group, yaw: false, fy: 0.9,
      slot: k => ({ x: 0.35 - (k % 3 - 1) * 0.32, z: -1.4 + Math.floor(k / 3) * 0.5 }) };
  }
  return null;
}
function catSurfaceY(F, x, z){
  if (F.noRay) return F.fy;
  const key = F.obj.uuid + ':' + x.toFixed(2) + ':' + z.toFixed(2);
  let y = _rideY.get(key);
  if (y !== undefined) return y;
  F.obj.updateWorldMatrix(true, true);
  _rideO.set(x, 8, z).applyMatrix4(F.obj.matrixWorld); _rideD.set(0, -1, 0).transformDirection(F.obj.matrixWorld);
  _rideRay.set(_rideO, _rideD); _rideRay.far = 20;
  const h = _rideRay.intersectObject(F.obj, true).find(q => q.object.isMesh && q.object.visible);
  y = h ? F.obj.worldToLocal(h.point.clone()).y : F.fy;
  if (_rideY.size > 400) _rideY.clear();
  _rideY.set(key, y);
  return y;
}
/* po syncCar (main-loop): model auta ma już pozycję tej klatki — kot nie zostaje w tyle */
const _riders = [], _rideRz = new THREE.Quaternion(), _zAxis = new THREE.Vector3(0, 0, 1);
function syncRidingCats(){
  if (!_riders.length) return;
  const F = catRideFrame(); if (!F) return;
  F.obj.updateWorldMatrix(true, false); F.obj.getWorldQuaternion(_rideQ); if (F.yaw) _rideQ.multiply(_catYawPi);
  _riders.forEach((c, k) => {
    c.m.g.visible = !F.hidden; if (F.hidden) return;
    const s = F.slot(k, _riders.length);
    c.m.g.position.set(s.x, catSurfaceY(F, s.x, s.z) + 0.005, s.z).applyMatrix4(F.obj.matrixWorld);
    c.m.g.quaternion.copy(_rideQ); if (s.rz) c.m.g.quaternion.multiply(_rideRz.setFromAxisAngle(_zAxis, s.rz));
    c.x = c.m.g.position.x; c.z = c.m.g.position.z;
  });
}
const _catQ = new CANNON.Quaternion(), _catV = new CANNON.Vec3(), _followers = [];
let _followH = null;
function updateCats(dt){
  const pp = playerWorldPos();
  const inCar = mode === 'car' && !activeCarGone, cv = chassisBody.velocity, carSp = Math.hypot(cv.x, cv.z);
  if (inCar) chassisBody.quaternion.conjugate(_catQ);
  /* za kim idą przyjaciele: pieszy gracz albo rower (punkt i kurs); kurs wygładzony, żeby szyk nie skakał przy obrocie */
  const bike = inCar && CAR_TYPES[carType].bike, anchor = !player.dead && (mode === 'foot' || bike) ? (bike ? chassisBody.position : player.body.position) : null;
  if (anchor){
    let h = player.facing;
    if (bike){ _catV.set(0, 0, -1); chassisBody.quaternion.vmult(_catV, _catV); h = Math.atan2(_catV.x, _catV.z); }
    if (carSp > 1 || !bike) _followH = _followH === null ? h : angleDamp(_followH, h, bike ? 4 : 2.5, dt);
  } else _followH = null;
  const rideF = player.dead ? null : catRideFrame();
  _riders.length = 0; _followers.length = 0;
  for (const c of CATS){
    if (c.dead){ c.t -= dt; if (c.t <= 0) catPlace(c, c.kind); continue; }
    /* przyjaciel w pojeździe gracza: jedzie z nim (pozycja w syncRidingCats) */
    if (c.friend && rideF){
      _riders.push(c); c.riding = true; c.eatT = 0; c.m.g.visible = true;
      c.m.body.rotation.x = -0.25; c.m.body.position.y = -0.05;                                      // siedzi
      c.m.tail.rotation.set(1.1, Math.sin(clock * 3 + c.ph) * 0.5, 0);
      continue;
    }
    if (c.riding){                                                                        // wysiadka: zeskakuje obok gracza
      c.riding = false; c.m.g.quaternion.set(0, 0, 0, 1);
      const pb = player.body.position, a = _followers.length * 1.3; c.x = pb.x + Math.cos(a) * 1.2; c.z = pb.z + Math.sin(a) * 1.2; c.gy = undefined;
    }
    const far = Math.hypot(c.x - pp.x, c.z - pp.z) > 260;
    const follow = c.friend && anchor && _followH !== null;
    if (c.eatT > 0){ c.eatT -= dt; c.state = 'sit'; }
    else if (follow){                                                                     // przyjaciel: zawsze idzie za graczem — każdy na swoim miejscu w szyku
      const k = _followers.length; _followers.push(c);
      const r = Math.floor(k / 3), back = (bike ? 2.8 : 1.5) + r * 1.05, side = (k % 3 - 1) * 0.95 + (r % 2 ? 0.45 : 0);
      const sh = Math.sin(_followH), ch = Math.cos(_followH);
      const tx = anchor.x - sh * back + ch * side, tz = anchor.z - ch * back - sh * side;
      let dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
      if (d > 45){ c.x = tx - dx / d * 2; c.z = tz - dz / d * 2; dx = tx - c.x; dz = tz - c.z; d = 2; }     // daleko (odrodzenie, teleport) — dobiega od razu
      if (d > 0.3){
        const run = clamp(d * 2.4, 1, bike ? 18 : 7) * (0.9 + c.sp * 0.1), s = Math.min(d, run * dt);
        c.x += dx / d * s; c.z += dz / d * s; c.h = angleDamp(c.h, Math.atan2(dx, dz), 9, dt); c.state = 'walk'; c.ph += dt * Math.min(run, 9) * 2.4;
      } else { c.state = 'sit'; c.h = angleDamp(c.h, _followH, 3, dt); }
      for (let j = 0; j < k; j++){                                                        // nie wchodzą na siebie
        const o = _followers[j], ox = c.x - o.x, oz = c.z - o.z, od = Math.hypot(ox, oz);
        if (od < 0.55 && od > 1e-4){ const p = (0.55 - od) / 2; c.x += ox / od * p; c.z += oz / od * p; o.x -= ox / od * p; o.z -= oz / od * p; }
      }
      if (c.state === 'sit' && rnd() < dt * 0.2) catHearts(c, 1);
    } else if (c.state === 'sit'){ c.t -= dt; if (c.t <= 0) catNextTarget(c); }
    else {
      const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz);
      let sp = c.state === 'cross' ? 2.4 : c.sp;
      if (c.state === 'cross' && npcs.some(n => Math.hypot(n.pos.x - c.x, n.pos.y - c.z) < 9)) sp = 6.5;            // auto blisko — sprint
      if (d < 0.15){ c.x = c.tx; c.z = c.tz; catNextTarget(c); }
      else { const s = Math.min(d, sp * dt); c.x += dx / d * s; c.z += dz / d * s; c.h = angleDamp(c.h, Math.atan2(dx, dz), 8, dt); }
      c.ph += dt * sp * 7;
    }
    /* auto gracza najechało na kota */
    if (inCar && carSp > 1.2 && !c.friend){                                              // przyjaciel biegnący za rowerem — nie
      const T = CAR_TYPES[carType], p = chassisBody.position;
      _catV.set(c.x - p.x, catGroundY(c) + 0.2 - (p.y - T.restY), c.z - p.z); _catQ.vmult(_catV, _catV);
      if (Math.abs(_catV.x) < T.half[0] + 0.25 && Math.abs(_catV.z) < T.half[2] + 0.25 && Math.abs(_catV.y) < 1.2){ catHarmed(c, 'auto'); continue; }
    }
    if (c.friend){                                                                        // podłoże: w ruchu co klatkę, siedząc co 0.3 s
      c.gyT = (c.gyT || 0) - dt;
      if (c.gy === undefined || c.gyT <= 0 || c.state !== 'sit'){
        c.gyT = 0.3; c.gy = catProbeY(c, c.gy !== undefined ? c.gy : anchor ? anchor.y - (bike ? 0.5 : 0.85) : catBaseY(c));
      }
    }
    if (far){ c.m.g.visible = false; continue; }
    c.m.g.visible = true;
    const moving = c.state !== 'sit';
    c.m.g.position.set(c.x, catGroundY(c) + (moving ? Math.abs(Math.sin(c.ph)) * 0.025 : 0), c.z);
    c.m.g.rotation.set(0, c.h, 0);
    c.m.body.rotation.x = c.eatT > 0 ? 0.25 : moving ? 0 : -0.25; c.m.body.position.y = moving ? 0 : -0.05;          // siedzący: przód w górę; je: głowa w dół
    c.m.tail.rotation.set(moving ? 0.5 : 1.1, Math.sin(clock * (moving ? 6 : c.friend ? 9 : 2.2) + c.ph) * 0.5, 0);
  }
  updateHearts(dt);
}
/* kot skrzywdzony przez gracza: gracz wybucha i ginie (nieśmiertelność nie chroni) */
function catHarmed(c, how){
  if (c.dead || c.riding) return;
  c.dead = true; c.t = 25; c.m.g.visible = false; c.friend = false;
  if (player.dead) return;
  if (!catDeathMode){                                                                 // domyślnie: policja (3 gwiazdki od zera)
    hudToast('Skrzywdziłeś kota — świadkowie wezwali policję!', 3.5);
    policeCrime('kot', c.x, c.z, WANTED_T[3]);
    return;
  }
  hudToast('Jak mogłeś?! To był kot…', 4);
  if (mode === 'car' && !activeCarGone){ destroyActiveCar('kot', 'JAK MOGŁEŚ?!'); return; }
  const p = playerWorldPos();
  killPlayer('JAK MOGŁEŚ?!');
  explodeAt(p.x, (p.y || 1) - 0.4, p.z, 1, { noCats: true, cause: 'kot' });
}
/* kot najbliżej punktu (karmienie) */
function catNear(x, z, r){ let best = null, bd = r; for (const c of CATS){ if (c.dead || c.riding) continue; const d = Math.hypot(c.x - x, c.z - z); if (d < bd){ bd = d; best = c; } } return best; }
/* karmienie: kot je (serduszka) i zostaje przyjacielem — chyba że gracz ma już CAT_FRIEND_MAX przyjaciół (wtedy tylko je); wynik:
   'new' | 'again' | 'full' */
function catFeed(c){
  const was = c.friend, full = !was && catFriendCount() >= CAT_FRIEND_MAX;
  c.eatT = 3.2; c.state = 'sit'; if (!full) c.friend = true; else { c.t = 4.5; }
  c.h = Math.atan2(player.body.position.x - c.x, player.body.position.z - c.z);
  catHearts(c, full ? 3 : 9);
  return was ? 'again' : full ? 'full' : 'new';
}
/* menu deweloperskie: najbliższy wolny kot przybiega i od razu zostaje przyjacielem / wszyscy przyjaciele wracają na swoje miejsca */
function catAddFriend(){
  if (catFriendCount() >= CAT_FRIEND_MAX) return false;
  const p = playerWorldPos(), c = CATS.filter(q => !q.dead && !q.friend).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
  if (!c) return false;
  const a = rnd() * TAU; c.x = p.x + Math.cos(a) * 1.6; c.z = p.z + Math.sin(a) * 1.6; c.gy = undefined;
  c.friend = true; c.eatT = 0; c.state = 'sit'; c.m.g.visible = true; catHearts(c, 6);
  return true;
}
function catReleaseFriends(){ for (const c of CATS) if (c.friend && !c.dead){ c.m.g.quaternion.set(0, 0, 0, 1); catPlace(c, c.kind); } }
/* serduszka: płaskie kształty serca obracane do kamery, unoszą się i znikają */
const _heartGeo = (() => { const s = new THREE.Shape(); s.moveTo(0, -0.12); s.bezierCurveTo(-0.02, -0.06, -0.16, -0.02, -0.16, 0.06); s.bezierCurveTo(-0.16, 0.14, -0.06, 0.17, 0, 0.09);
  s.bezierCurveTo(0.06, 0.17, 0.16, 0.14, 0.16, 0.06); s.bezierCurveTo(0.16, -0.02, 0.02, -0.06, 0, -0.12); return new THREE.ShapeGeometry(s); })();
const hearts = [];
function catHearts(c, n){
  const base = c.m.g.position;
  for (let k = 0; k < n; k++){
    const m = new THREE.Mesh(_heartGeo, new THREE.MeshBasicMaterial({ color: k % 3 ? 0xff4d6d : 0xff8fa3, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(base.x + rand(-0.3, 0.3), base.y + 0.55, base.z + rand(-0.3, 0.3)); m.scale.setScalar(rand(0.8, 1.3)); scene.add(m);
    hearts.push({ m: m, t: -k * 0.18, vx: rand(-0.2, 0.2), vz: rand(-0.2, 0.2) });
  }
}
function updateHearts(dt){
  for (let i = hearts.length - 1; i >= 0; i--){
    const h = hearts[i]; h.t += dt;
    if (h.t < 0){ h.m.visible = false; continue; }
    h.m.visible = true;
    if (h.t > 1.8){ scene.remove(h.m); h.m.material.dispose(); hearts.splice(i, 1); continue; }
    h.m.position.x += h.vx * dt; h.m.position.z += h.vz * dt; h.m.position.y += dt * 0.9;
    h.m.quaternion.copy(camera.quaternion); h.m.material.opacity = 1 - h.t / 1.8;
  }
}
