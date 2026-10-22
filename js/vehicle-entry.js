/* ---------------------------------------------------------------
   14. WSIADANIE / WYSIADANIE
   --------------------------------------------------------------- */
const _v1 = new CANNON.Vec3(), _v2 = new CANNON.Vec3();
/* RaycastVehicle (indexRightAxis 0 / indexUpAxis 1) napędza nadwozie w lokalne -Z,
   więc to jest fizyczny przód auta; przy nosie w -Z prawa strona wypada na +X. */
const CAR_FWD  = new CANNON.Vec3(0, 0, -1);
const CAR_LEFT = new CANNON.Vec3(-1, 0, 0);  // lewa strona auta = -X lokalne

function carDoorPoint(out){
  chassisBody.quaternion.vmult(CAR_LEFT, _v1);
  const o = CAR_TYPES[carType].half[0] + 0.29;
  out.set(chassisBody.position.x + _v1.x * o,
          chassisBody.position.y + _v1.y * o - 0.1,
          chassisBody.position.z + _v1.z * o);
  return out;
}
const _door = new CANNON.Vec3();

function distToDoor(){
  carDoorPoint(_door);
  const p = player.body.position;
  return Math.hypot(p.x - _door.x, p.z - _door.z, (p.y - _door.y) * 0.5);
}

/* drzwi kierowcy auta NPC — jego "przód" to lokalne +Z (patrz buildNpcModel,
   reflektory na z=+2.04), więc lewa strona to heading+PI/2, bez korekty +PI
   jaką wymaga RaycastVehicle gracza */
function npcDoorPoint(n, out){
  const o = (n.halfW || 0.93) + 0.32;
  out.x = n.pos.x + Math.cos(n.heading) * o;
  out.z = n.pos.y - Math.sin(n.heading) * o;
}
const _npcDoor = { x: 0, z: 0 };

/* --- auto gracza, auta skradzione i zaparkowane ---
   Prowadzalny pojazd (chassisBody/vehicle/carModel) jest JEDEN; jego tożsamość to `driving`
   (owner: 'player' = auto gracza, 'stolen' = skradzione; typ i kolor). Gdy gracz przesiada się do
   innego auta, dotychczasowe zostaje w świecie jako atrapa w parkedCars (model + statyczna bryła)
   z tym samym typem, kolorem i właścicielem — można do niego wrócić. Auto gracza jest dokładnie
   jedno i nigdy nie znika samo; skradzione zostają tam, gdzie je porzucono (maks. PARKED_STOLEN_MAX —
   nadmiarowe najstarsze usuwane dopiero > 120 m od gracza i poza kadrem) i nigdy nie stają się
   autem gracza. Menu kołowe V (pieszo): nowe auto gracza wybranego typu przed graczem
   (poprzednie auto gracza znika) albo przywołanie obecnego. */
const MAIN_CAR_COLOR = 0xb3272b, PARKED_STOLEN_MAX = 4;
const driving = { owner: 'player', type: 'sedan', color: MAIN_CAR_COLOR };
let drivingIdentity = 'main';           // zgodność: 'main' = auto gracza, 'jacked' = skradzione
const parkedCars = [];                  // { id, owner, type, color, mesh, body, x, y (podłoże), z, heading, t }
let parkedSeq = 0;
function setDriving(owner, type, color){
  driving.owner = owner; driving.type = type; driving.color = color;
  drivingIdentity = owner === 'player' ? 'main' : 'jacked';
}
/* wysokość dachu modelu typu (bryła atrapy od podłoża do dachu) */
const _carTop = {};
function carTopOf(type){ return _carTop[type] || (_carTop[type] = Math.max(...carParts(type).map(q => q[5] + q[1] / 2))); }
function addParked(owner, type, color, x, yGround, z, heading){
  const T = CAR_TYPES[type], mdl = buildCarModel(color, true, type), top = carTopOf(type);
  mdl.root.position.set(x, yGround + T.restY, z);          // root = środek nadwozia (jak w syncCar)
  mdl.root.rotation.y = heading + Math.PI;
  const b = new CANNON.Body({ mass: 0, material: matCar });
  b.addShape(new CANNON.Box(new CANNON.Vec3(T.half[0] - 0.01, top / 2 - 0.05, T.half[2] - 0.06)), new CANNON.Vec3(0, top / 2, 0));
  b.position.set(x, yGround, z);
  b.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), heading + Math.PI);
  b.collisionFilterGroup = G_CAR;
  b.collisionFilterMask  = -1;
  addBody(b);
  const p = { id: ++parkedSeq, owner: owner, type: type, color: color, mesh: mdl, body: b, x: x, y: yGround, z: z, heading: heading, t: clock };
  parkedCars.push(p);
  return p;
}
function removeParked(p){
  disposeCarModel(p.mesh); delBody(p.body);
  const i = parkedCars.indexOf(p); if (i >= 0) parkedCars.splice(i, 1);
}
function parkedDoorPoint(p, out){
  p.body.quaternion.vmult(CAR_LEFT, _v1);
  const o = CAR_TYPES[p.type].half[0] + 0.29;
  out.x = p.body.position.x + _v1.x * o;
  out.z = p.body.position.z + _v1.z * o;
}
/* bieżące prowadzalne auto zostaje w świecie jako atrapa (przed przesiadką do innego) */
function parkActive(){
  const T = CAR_TYPES[carType], p = chassisBody.position;
  return addParked(driving.owner, carType, driving.color, p.x, p.y - T.restY, p.z, carYaw());
}
/* prowadzalne auto przyjmuje typ, kolor, właściciela i pozycję (yGround = podłoże) */
function takeOver(type, color, owner, x, yGround, z, heading){
  applyCarType(type, color);
  chassisBody.position.set(x, yGround + CAR_TYPES[type].restY + 0.13, z);
  chassisBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), heading + Math.PI);
  chassisBody.velocity.set(0, 0, 0);
  chassisBody.angularVelocity.set(0, 0, 0);
  setDriving(owner, type, color);
}
const _parkDoor = { x: 0, z: 0 };

function nearestVehicle(){
  const p = player.body.position;
  let best = { kind: 'own', dist: distToDoor() };            // 'own' = prowadzalne auto (twoje albo skradzione), stoi gdzieś
  for (const q of parkedCars){
    if (Math.abs(q.y - (p.y - 0.9)) > 2) continue;
    parkedDoorPoint(q, _parkDoor);
    const d = Math.hypot(p.x - _parkDoor.x, p.z - _parkDoor.z);
    if (d < best.dist) best = { kind: 'parked', dist: d, parked: q };
  }
  if (typeof planes !== 'undefined') for (const q of planes){
    if (q.wreckT > 0) continue;
    const d0 = planeDoorPoint(q, { x: 0, y: 0, z: 0 });
    if (Math.abs(d0.y - (p.y - 0.9)) > 2) continue;
    const d = Math.hypot(p.x - d0.x, p.z - d0.z) * 0.8;                       // drzwi samolotu: trochę większy zasięg
    if (d < best.dist) best = { kind: 'plane', dist: d, plane: q };
  }
  if (typeof boats !== 'undefined') for (const b of boats){            // łódź: z pomostu / nabrzeża (gracz nisko, nie na estakadzie)
    if (b === curBoat || p.y > 3) continue;
    const d = Math.max(0, Math.hypot(p.x - b.pos.x, p.z - b.pos.z) - 2.6);          // z dowolnej burty (pomost po lewej albo prawej)
    if (d < best.dist) best = { kind: 'boat', dist: d, boat: b };
  }
  if (typeof RIDES !== 'undefined') for (const r of RIDES){             // wejście na atrakcję w parku rozrywki (peron, gondola, autodrom…)
    if (!r.board || p.y > 4) continue;
    const d = Math.max(0, Math.hypot(p.x - r.board.x, p.z - r.board.z) - 2.5);
    if (d < best.dist) best = { kind: 'ride', dist: d, ride: r };
  }
  for (const n of npcs){
    if (Math.abs((n.y || 0) - (p.y - 0.9)) > 2) continue;           // auto na estakadzie nad / pod graczem
    npcDoorPoint(n, _npcDoor);
    const d = Math.hypot(p.x - _npcDoor.x, p.z - _npcDoor.z);
    if (d < best.dist) best = { kind: 'npc', dist: d, npc: n };
  }
  return best;
}

/* kradzież: auto NPC znika z ruchu na dobre (w jego miejsce pojawia się nowe, gdzie indziej),
   prowadzalne auto przenosi się w jego miejsce i przyjmuje jego typ i kolor jako SKRADZIONE;
   dotychczasowe auto (twoje albo inne skradzione) zostaje zaparkowane tam, gdzie stało */
function jackCar(n){
  parkActive();
  const x = n.pos.x, z = n.pos.y, y = n.y || 0, h = n.heading, color = n.color, type = n.type || 'sedan';
  removeNpcCar(n);
  spawnRandomNpcCar();
  takeOver(type, color, 'stolen', x, y, z, h);
}
/* wejście do zaparkowanego auta (twojego albo skradzionego) */
function enterParked(q){
  const d = { owner: q.owner, type: q.type, color: q.color, x: q.x, y: q.y, z: q.z, heading: q.heading };
  parkActive();
  removeParked(q);
  takeOver(d.type, d.color, d.owner, d.x, d.y, d.z, d.heading);
}
/* zgodność ze starszym kodem / testami: wróć do auta gracza, jeśli stoi zaparkowane */
function returnToMainCar(){ const own = parkedCars.find(q => q.owner === 'player'); if (own) enterParked(own); }

/* nadmiar skradzionych: najstarsze, daleko od gracza i poza kadrem */
const _camDir = new THREE.Vector3();
function pruneParked(){
  const stolen = parkedCars.filter(q => q.owner === 'stolen').sort((a, b) => a.t - b.t);
  if (stolen.length <= PARKED_STOLEN_MAX) return;
  const p = mode === 'car' ? chassisBody.position : player.body.position;
  camera.getWorldDirection(_camDir);
  for (const q of stolen){
    const dx = q.x - camera.position.x, dz = q.z - camera.position.z, dl = Math.hypot(dx, dz) || 1;
    const inView = (dx * _camDir.x + dz * _camDir.z) / dl > 0.55 && dl < 420;
    if (Math.hypot(q.x - p.x, q.z - p.z) > 120 && !inView){ removeParked(q); return; }
  }
}

/* --- menu kołowe pojazdów (V) --- */
const VEHICLE_MENU = [
  { label: 'Zwykły', type: 'sedan' }, { label: 'Pickup', type: 'pickup' }, { label: 'Sportowy', type: 'sport' }, { label: 'Rower', type: 'bike' }
];
let lastCarSpawn = -99;
const _ray = new CANNON.Ray(), _rayRes = new CANNON.RaycastResult();
function rayHit(x0, y0, z0, x1, y1, z1, mask){
  _rayRes.reset();
  _ray.from.set(x0, y0, z0); _ray.to.set(x1, y1, z1);
  _ray.intersectWorld(world, { mode: CANNON.Ray.CLOSEST, result: _rayRes, skipBackfaces: true, collisionFilterGroup: -1, collisionFilterMask: mask || (G_WORLD | G_CAR) });   // grupa −1: ciała kinematyczne (maska ~G_WORLD) też trafiane
  return _rayRes.hasHit ? _rayRes : null;
}
function groundAt(x, z, yTop){
  const h = rayHit(x, yTop, z, x, yTop - 25, z, G_WORLD);                   // tylko świat (nie dach innego auta)
  return (h && h.hitNormalWorld.y > 0.85) ? h.hitPointWorld.y : null;
}
/* czy auto typu T zmieści się w (x, y=podłoże, z) z kursem heading: budynki, auta, piesi, słupki, drzewa
   i każda inna bryła (promienie poziome od środka do obrysu na dwóch wysokościach) */
function carSpotFree(x, y, z, heading, T){
  const hw = T.half[0] + 0.3, hl = T.half[2] + 0.3, f = { x: Math.sin(heading), z: Math.cos(heading) }, r = { x: -f.z, z: f.x };
  const inRect = (px, pz, m) => { const dx = px - x, dz = pz - z; return Math.abs(dx * f.x + dz * f.z) < hl + m && Math.abs(dx * r.x + dz * r.z) < hw + m; };
  if (buildings.some(b => Math.abs(b.x - x) < b.w / 2 + hl && Math.abs(b.z - z) < b.d / 2 + hl)) return false;
  if (npcs.some(n => Math.abs((n.y || 0) - y) < 2.5 && Math.hypot(n.pos.x - x, n.pos.y - z) < n.halfL + hl + 0.6)) return false;
  if (Pedestrians.list.some(q => Math.hypot(q.pos.x - x, q.pos.y - z) < hl + 1)) return false;
  if (parkedCars.some(q => Math.abs(q.y - y) < 2.5 && Math.hypot(q.x - x, q.z - z) < hl + CAR_TYPES[q.type].half[2] + 0.6)) return false;
  if (driving.owner !== 'player' && Math.hypot(chassisBody.position.x - x, chassisBody.position.z - z) < hl + 3) return false;
  if (lampSpots.some(s => inRect(s.x, s.z, 0.3)) || treeSpots.some(s => inRect(s.x, s.z, 0.6)) || signGeomLog.some(s => (s.poles || []).some(p => inRect(p.x, p.z, 0.2)))) return false;
  if (HWY_PIERS.some(p => inRect(p.x, p.z, p.size / 2 + 0.2))) return false;
  for (const yy of [0.45, 1.1]) for (const q of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
    const tx = x + f.x * hl * q[0] + r.x * hw * q[1], tz = z + f.z * hl * q[0] + r.z * hw * q[1];
    if (rayHit(x, y + yy, z, tx, y + yy, tz)) return false;
  }
  return true;
}
/* miejsce 5–9 m przed graczem (w kierunku kamery), na gruncie albo pomoście */
function findCarSpot(type){
  const T = CAR_TYPES[type], p = player.body.position;
  camera.getWorldDirection(_camDir); _camDir.y = 0;
  if (_camDir.lengthSq() < 1e-4) _camDir.set(0, 0, -1);
  _camDir.normalize();
  const heading = Math.atan2(_camDir.x, _camDir.z), right = { x: -_camDir.z, z: _camDir.x };
  for (const d of [6.5, 8, 5.5, 9.5]) for (const lat of [0, 2.5, -2.5]){
    const x = p.x + _camDir.x * d + right.x * lat, z = p.z + _camDir.z * d + right.z * lat;
    const g = groundAt(x, z, p.y + 2.5);
    if (g === null || Math.abs(g - (p.y - 0.9)) > 2.5) continue;
    if (carSpotFree(x, g, z, heading, T)) return { x: x, y: g, z: z, heading: heading };
  }
  return null;
}
function spawnOwnCar(type){
  if (clock - lastCarSpawn < 3){ hudToast('Poczekaj chwilę'); return false; }
  const spot = findCarSpot(type);
  if (!spot){ hudToast('Brak miejsca na auto'); return false; }
  lastCarSpawn = clock;
  if (driving.owner === 'player') takeOver(type, MAIN_CAR_COLOR, 'player', spot.x, spot.y, spot.z, spot.heading);   // twoje auto stoi puste — przenosi się
  else {
    const own = parkedCars.find(q => q.owner === 'player'); if (own) removeParked(own);
    addParked('player', type, MAIN_CAR_COLOR, spot.x, spot.y, spot.z, spot.heading);
  }
  hudToast(type === 'bike' ? 'Twój rower' : 'Twój samochód: ' + CAR_TYPES[type].name);
  return true;
}
function ownCarType(){ if (driving.owner === 'player') return carType; const own = parkedCars.find(q => q.owner === 'player'); return own ? own.type : 'sedan'; }
function vehicleMenuPick(i){
  const it = VEHICLE_MENU[i]; if (!it) return;
  if (it.summon) spawnOwnCar(ownCarType()); else spawnOwnCar(it.type);
}

function toggleVehicle(){
  if (!pointerLocked) return;
  if (mode === 'plane'){ exitPlane(false); return; }
  if (mode === 'boat'){ exitBoat(false); return; }
  if (mode === 'ride'){ if (curRide && curRide.canExit) rideEnd(curRide); else hudToast('Nie wysiadaj w trakcie jazdy — poczekaj do końca przejażdżki'); return; }
  if (mode === 'foot'){
    const nv = nearestVehicle();
    if (nv.dist > 3.5) return;
    if (nv.kind === 'ride'){ rideStart(nv.ride); return; }
    if (nv.kind === 'plane'){ enterPlane(nv.plane); return; }
    if (nv.kind === 'boat'){ enterBoat(nv.boat); return; }
    if (nv.kind === 'npc') jackCar(nv.npc);
    else if (nv.kind === 'parked') enterParked(nv.parked);
    mode = 'car';
    player.mesh.visible = false;
    delBody(player.body);
    camYaw = carYaw() + Math.PI;
    lastMouseMove = -99;
  } else {
    /* wysiadka po stronie kierowcy, z awaryjną stroną pasażera */
    chassisBody.quaternion.vmult(CAR_LEFT, _v1);
    let ox = _v1.x, oz = _v1.z;
    const test = (sx, sz) => {
      const px = chassisBody.position.x + sx * 2.0;
      const pz = chassisBody.position.z + sz * 2.0;
      const res = new CANNON.RaycastResult();
      const ray = new CANNON.Ray(
        new CANNON.Vec3(chassisBody.position.x, chassisBody.position.y + 0.4, chassisBody.position.z),
        new CANNON.Vec3(px, chassisBody.position.y + 0.4, pz));
      ray.intersectWorld(world, { mode: CANNON.Ray.CLOSEST, result: res, skipBackfaces: true,
                                 collisionFilterGroup: G_WORLD, collisionFilterMask: G_WORLD });
      return !res.hasHit;
    };
    if (!test(ox, oz)){ ox = -ox; oz = -oz; }

    mode = 'foot';
    player.mesh.visible = true;
    player.body.position.set(
      chassisBody.position.x + ox * 1.9,
      chassisBody.position.y + 0.65,
      chassisBody.position.z + oz * 1.9);
    player.body.velocity.set(0, 0, 0);
    player.body.angularVelocity.set(0, 0, 0);
    player.body.wakeUp();
    addBody(player.body);

    /* auto staje */
    chassisBody.velocity.scale(0.05, chassisBody.velocity);
    chassisBody.angularVelocity.set(0, 0, 0);
    for (let i = 0; i < 4; i++){
      vehicle.applyEngineForce(0, i);
      vehicle.setBrake(160, i);
      vehicle.setSteeringValue(0, i);
    }
    steer = 0;
    Sound.engine(false, 0, 0);
    Sound.horn(false);
  }
}

function carYaw(){
  chassisBody.quaternion.vmult(CAR_FWD, _v2);
  return Math.atan2(_v2.x, _v2.z);
}

function resetCar(){
  const p = chassisBody.position;
  /* nos siedzi w lokalnym -Z, więc obrót ciała = kurs nosa + PI */
  chassisBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), carYaw() + Math.PI);
  chassisBody.position.set(p.x, Math.max(p.y, 0) + 1.0, p.z);
  chassisBody.velocity.set(0,0,0);
  chassisBody.angularVelocity.set(0,0,0);
}
