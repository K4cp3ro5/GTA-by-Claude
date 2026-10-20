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
  out.set(chassisBody.position.x + _v1.x * 1.25,
          chassisBody.position.y + _v1.y * 1.25 - 0.1,
          chassisBody.position.z + _v1.z * 1.25);
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
  out.x = n.pos.x + Math.cos(n.heading) * 1.25;
  out.z = n.pos.y - Math.sin(n.heading) * 1.25;
}
const _npcDoor = { x: 0, z: 0 };

/* --- główne auto: trwały obiekt, nigdy nie znika ---
   Jedyny fizyczny, prowadzalny pojazd (chassisBody/vehicle/carModel) w danej
   chwili reprezentuje ALBO główne auto, ALBO skradziony pojazd. Gdy gracz
   kradnie coś innego niż główne auto, ono dostaje lekki "placeholder"
   (statyczny model + kolizja) stojący dokładnie tam, gdzie je zaparkowano —
   dzięki temu można po nie wrócić. Skradzione auto, gdy zostaje porzucone
   na rzecz kolejnej kradzieży, nie zostawia żadnego śladu. */
const MAIN_CAR_COLOR = 0xb3272b;
let drivingIdentity = 'main';           // 'main' | 'jacked'
let mainCarPos = new THREE.Vector3(CAR_SPAWN.x, CAR_SPAWN.y, CAR_SPAWN.z);
let mainCarHeading = Math.PI;
let mainCarPlaceholder = null;          // { mesh, body } albo null gdy główne auto jest właśnie prowadzone

function showMainCarPlaceholder(){
  if (mainCarPlaceholder) return;
  const mdl = buildCarModel(MAIN_CAR_COLOR, true);
  mdl.root.position.set(mainCarPos.x, mainCarPos.y, mainCarPos.z);   // root = środek masy (jak w syncCar); wcześniej -COM_H wkopywało atrapę w ziemię
  mdl.root.rotation.y = mainCarHeading + Math.PI;
  const b = new CANNON.Body({ mass: 0, material: matCar });
  b.addShape(new CANNON.Box(new CANNON.Vec3(0.95, 0.62, 2.1)), new CANNON.Vec3(0, COM_H, 0));
  b.position.set(mainCarPos.x, 0, mainCarPos.z);
  b.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), mainCarHeading + Math.PI);
  b.collisionFilterGroup = G_CAR;
  b.collisionFilterMask  = -1;
  addBody(b);
  mainCarPlaceholder = { mesh: mdl.root, body: b };
}
function hideMainCarPlaceholder(){
  if (!mainCarPlaceholder) return;
  scene.remove(mainCarPlaceholder.mesh);
  delBody(mainCarPlaceholder.body);
  mainCarPlaceholder = null;
}
function mainPlaceholderDoorPoint(out){
  mainCarPlaceholder.body.quaternion.vmult(CAR_LEFT, _v1);
  out.x = mainCarPlaceholder.body.position.x + _v1.x * 1.25;
  out.z = mainCarPlaceholder.body.position.z + _v1.z * 1.25;
}
const _mainDoor = { x: 0, z: 0 };

function nearestVehicle(){
  const p = player.body.position;
  let best = { kind: 'own', dist: distToDoor() };
  if (drivingIdentity === 'jacked' && mainCarPlaceholder){
    mainPlaceholderDoorPoint(_mainDoor);
    const d = Math.hypot(p.x - _mainDoor.x, p.z - _mainDoor.z);
    if (d < best.dist) best = { kind: 'main', dist: d };
  }
  for (const n of npcs){
    if (Math.abs((n.y || 0) - (p.y - 0.9)) > 2) continue;           // auto na estakadzie nad / pod graczem
    npcDoorPoint(n, _npcDoor);
    const d = Math.hypot(p.x - _npcDoor.x, p.z - _npcDoor.z);
    if (d < best.dist) best = { kind: 'npc', dist: d, npc: n };
  }
  return best;
}

/* kradzież: auto NPC znika z ruchu na dobre (w jego miejsce pojawia się nowe,
   gdzie indziej), a jedyny prowadzalny pojazd przenosi się w jego miejsce
   i przyjmuje jego kolor. Jeśli gracz jechał dotąd głównym autem, zostaje
   ono jako placeholder tam, gdzie stało; jeśli jechał już skradzionym —
   tamto po prostu znika bez śladu. */
function jackCar(n){
  if (drivingIdentity === 'main'){
    mainCarPos.set(chassisBody.position.x, chassisBody.position.y, chassisBody.position.z);
    mainCarHeading = carYaw();
    showMainCarPlaceholder();
  }

  const targetX = n.pos.x, targetZ = n.pos.y, targetHeading = n.heading, color = n.color;
  removeNpcCar(n);
  spawnRandomNpcCar();

  chassisBody.position.set(targetX, (n.y || 0) + COM_H + 0.06, targetZ);
  chassisBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), targetHeading + Math.PI);
  chassisBody.velocity.set(0, 0, 0);
  chassisBody.angularVelocity.set(0, 0, 0);
  carModel.paintMat.color.setHex(color);
  drivingIdentity = 'jacked';
}

function returnToMainCar(){
  chassisBody.position.copy(mainCarPos);
  chassisBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), mainCarHeading + Math.PI);
  chassisBody.velocity.set(0, 0, 0);
  chassisBody.angularVelocity.set(0, 0, 0);
  carModel.paintMat.color.setHex(MAIN_CAR_COLOR);
  hideMainCarPlaceholder();
  drivingIdentity = 'main';
}

function toggleVehicle(){
  if (!pointerLocked) return;
  if (mode === 'foot'){
    const nv = nearestVehicle();
    if (nv.dist > 3.5) return;
    if (nv.kind === 'npc') jackCar(nv.npc);
    else if (nv.kind === 'main') returnToMainCar();
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
