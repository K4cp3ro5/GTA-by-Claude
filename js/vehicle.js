/* ---------------------------------------------------------------
   10. POJAZD GRACZA
   --------------------------------------------------------------- */
/* model auta gracza: części scalone wg materiału (7 siatek zamiast 23). staticWheels = koła
   przyczepione do modelu (atrapa zaparkowanego auta); bez tego koła są osobnymi obiektami
   ustawianymi z fizyki w syncCar */
function buildCarModel(paintHex, staticWheels, type){
  const T = CAR_TYPES[type || 'sedan'];
  const root  = new THREE.Group();
  const body  = new THREE.Group();
  body.position.y = -COM_H - T.dy;   // model liczony od podłoża, ciało od środka masy (wyżej zawieszone typy: o dy)
  body.rotation.y = Math.PI;         // nos siatki (+Z) na fizyczny przód nadwozia (-Z)
  root.add(body);

  const paint  = new THREE.MeshPhongMaterial({ color: paintHex, shininess: 78, specular: 0x555555 });
  const dark   = new THREE.MeshPhongMaterial({ color: 0x15171b, shininess: 40 });
  const glass  = new THREE.MeshPhongMaterial({ color: 0x0d1418, shininess: 120, specular: 0x8899aa,
                                               transparent:true, opacity:0.78 });
  const chrome = new THREE.MeshPhongMaterial({ color: 0xb9bec6, shininess: 130, specular: 0xffffff });
  const lampF  = new THREE.MeshBasicMaterial({ color: 0xfff3d0 });
  const lampR  = new THREE.MeshBasicMaterial({ color: 0x5a1512 });

  const parts = new Map([[paint, []], [dark, []], [glass, []], [chrome, []], [lampF, []], [lampR, []]]);
  const MAT = { paint: paint, dark: dark, glass: glass, chrome: chrome, lampF: lampF, lampR: lampR };
  /* bryły nadwozia wg typu (car-types.js) */
  carParts(T.id).forEach(q => parts.get(MAT[q[3]]).push({ geo: new THREE.BoxGeometry(q[0], q[1], q[2]), color: 0xffffff, x: q[4], y: q[5], z: q[6], rx: q[7] }));
  parts.forEach((list, mat) => {
    const m = new THREE.Mesh(mergeColored(list), mat);
    m.castShadow = true; m.receiveShadow = true;
    body.add(m);
  });

  /* reflektory — prawdziwe SpotLighty (tylko auto prowadzone; atrapa ich nie potrzebuje) */
  const spots = [];
  if (!staticWheels){
    const lamp = carParts(T.id).find(q => q[3] === 'lampF');
    for (let i = 0; i < 2; i++){
      const sx = i ? -0.62 : 0.62;
      const sp = new THREE.SpotLight(0xfff0cf, 0, 52, 0.46, 0.55, 1.3);
      sp.position.set(sx, lamp[5], lamp[6] + 0.05);
      sp.castShadow = false;
      const tg = new THREE.Object3D();
      tg.position.set(sx * 1.6, -0.35, 26);
      body.add(sp); body.add(tg);
      sp.target = tg;
      spots.push(sp);
    }
  }

  /* koła: opona + felga ze szprychami (2 siatki na koło) */
  const wheels = [];
  const WG = carWheelGeoFor(T.wheelR, T.wheelW);
  for (let i = 0; i < 4; i++){
    const wg = new THREE.Group();
    const tire = new THREE.Mesh(WG.tire, carWheelMat.tire); tire.castShadow = true; wg.add(tire);
    wg.add(new THREE.Mesh(WG.rim, carWheelMat.rim));
    if (staticWheels){
      const p = [[ T.track, T.wbF], [-T.track, T.wbF], [ T.track, T.wbR], [-T.track, T.wbR]][i];
      wg.position.set(p[0], T.wheelR - T.restY, p[1]);      // oś koła w spoczynku: nadwozie stoi na y = restY (test/drive.js)
      root.add(wg);
    } else scene.add(wg);
    wheels.push(wg);
  }

  /* rower prowadzony przez gracza: postać gracza na siodełku (pedałuje w syncCar) */
  let rider = null;
  if (T.bike && !staticWheels){
    rider = buildHumanoid(PLAYER_PALETTE);
    rider.group.position.set(0, 0.14, -0.22); rider.group.rotation.x = 0.32;
    rider.armL.rotation.x = rider.armR.rotation.x = -1.05;
    body.add(rider.group);
  }
  scene.add(root);
  return { root: root, body: body, wheels: wheels, spots: spots, type: T.id, rider: rider,
           tailMat: lampR, headMat: lampF, paintMat: paint, mats: [paint, dark, glass, chrome, lampF, lampR] };
}
/* koła wg promienia (cache — wspólne dla modeli tego samego typu) */
const _wheelGeo = {};
function carWheelGeoFor(R, W){
  W = W || 0.30;
  const key = R + '/' + W;
  if (_wheelGeo[key]) return _wheelGeo[key];
  const tire = new THREE.CylinderGeometry(R, R, W, 16); tire.rotateZ(Math.PI/2);
  const rim = new THREE.CylinderGeometry(R*0.62, R*0.62, W + 0.02, 10); rim.rotateZ(Math.PI/2);
  const sp = new THREE.BoxGeometry(0.33, 0.07, R*1.1);
  const rimParts = [{ geo: rim, color: 0xffffff }];
  for (let s = 0; s < 3; s++) rimParts.push({ geo: sp, color: 0xffffff, rx: s * Math.PI / 3 });
  return (_wheelGeo[key] = { tire: tire, rim: mergeColored(rimParts) });
}
/* usunięcie modelu ze sceny i zwolnienie jego geometrii/materiałów (koła — wspólne, zostają) */
function disposeCarModel(m){
  scene.remove(m.root);
  m.wheels.forEach(w => { if (w.parent) w.parent.remove(w); });
  m.body.children.forEach(c => { if (c.geometry) c.geometry.dispose(); });
  m.mats.forEach(mt => mt.dispose());
}
const carWheelMat = { tire: new THREE.MeshLambertMaterial({ color: 0x141518 }),
                      rim: new THREE.MeshPhongMaterial({ color: 0x9aa0a8, shininess: 110, specular: 0xffffff }) };

let carModel = buildCarModel(0xb3272b, false, 'sedan');
let carType = 'sedan';                 // typ prowadzalnego auta (parametry jazdy w update-vehicle.js)

const CAR_SPAWN = new CANNON.Vec3(L(CENTER_I) - 3.5, COM_H + 0.06, L(CENTER_I) + 13);
const chassisBody = new CANNON.Body({ mass: 1250, material: matCar });
chassisBody.addShape(new CANNON.Box(new CANNON.Vec3(0.96, 0.35, 2.16)), new CANNON.Vec3(0, 0.15, 0));
chassisBody.position.copy(CAR_SPAWN);
/* nos na +Z (prawy pas jazdy); drzwi kierowcy wypadają wtedy od strony spawnu gracza */
chassisBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.PI);
chassisBody.angularDamping = 0.35;
chassisBody.linearDamping = 0.02;
chassisBody.collisionFilterGroup = G_CAR;
chassisBody.collisionFilterMask = -1;
chassisBody.allowSleep = false;

const vehicle = new CANNON.RaycastVehicle({
  chassisBody: chassisBody,
  indexRightAxis: 0,
  indexUpAxis: 1,
  indexForwardAxis: 2
});

const WHEEL_OPT = {
  radius: WHEEL_R,
  directionLocal: new CANNON.Vec3(0, -1, 0),
  suspensionStiffness: 40,
  suspensionRestLength: 0.36,
  frictionSlip: 3.4,
  dampingRelaxation: 4.0,
  dampingCompression: 5.5,
  maxSuspensionForce: 130000,
  rollInfluence: 0.03,
  axleLocal: new CANNON.Vec3(1, 0, 0),
  chassisConnectionPointLocal: new CANNON.Vec3(),
  maxSuspensionTravel: 0.34,
  customSlidingRotationalSpeed: -32,
  useCustomSlidingRotationalSpeed: true
};
[[ 0.86, -1.45], [-0.86, -1.45], [ 0.86, 1.45], [-0.86, 1.45]].forEach(p => {
  WHEEL_OPT.chassisConnectionPointLocal.set(p[0], 0.11, p[1]);
  vehicle.addWheel(WHEEL_OPT);
});
vehicle.addToWorld(world);

/* zmiana typu prowadzalnego auta w locie (to samo ciało i ten sam RaycastVehicle): bryła nadwozia,
   masa i bezwładność (liczone przy obrocie zerowym — cannon bierze AABB w układzie świata), koła
   i zawieszenie, model. paintHex = kolor lakieru nowego modelu. */
function applyCarType(type, paintHex){
  const T = CAR_TYPES[type];
  carType = type;
  const sh = chassisBody.shapes[0];
  sh.halfExtents.set(T.half[0], T.half[1], T.half[2]);
  sh.updateConvexPolyhedronRepresentation(); sh.updateBoundingSphereRadius();
  chassisBody.shapeOffsets[0].set(0, T.boxY, 0);
  const q = chassisBody.quaternion.clone();
  chassisBody.quaternion.set(0, 0, 0, 1);
  chassisBody.mass = T.mass; chassisBody.updateMassProperties();
  chassisBody.quaternion.copy(q);
  chassisBody.updateBoundingRadius(); chassisBody.aabbNeedsUpdate = true;
  const P = [[ T.track, T.wbF], [-T.track, T.wbF], [ T.track, T.wbR], [-T.track, T.wbR]];
  vehicle.wheelInfos.forEach((w, i) => {
    w.radius = T.wheelR; w.suspensionStiffness = T.stiff; w.suspensionRestLength = T.rest; w.maxSuspensionTravel = T.travel;
    w.frictionSlip = T.grip; w.dampingRelaxation = T.damp[0]; w.dampingCompression = T.damp[1];
    w.chassisConnectionPointLocal.set(P[i][0], T.connY, P[i][1]);
  });
  if (carModel.type !== type){ disposeCarModel(carModel); carModel = buildCarModel(paintHex, false, type); }
  carModel.paintMat.color.setHex(paintHex);
}
