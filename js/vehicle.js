/* ---------------------------------------------------------------
   10. POJAZD GRACZA
   --------------------------------------------------------------- */
/* model auta gracza: części scalone wg materiału (7 siatek zamiast 23). staticWheels = koła
   przyczepione do modelu (atrapa zaparkowanego auta); bez tego koła są osobnymi obiektami
   ustawianymi z fizyki w syncCar */
const TRACK = 0.86, WB_F = -1.45, WB_R = 1.45, CONN_Y = 0.11;
function buildCarModel(paintHex, staticWheels){
  const root  = new THREE.Group();
  const body  = new THREE.Group();
  body.position.y = -COM_H;          // model liczony od podłoża, ciało od środka masy
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
  function add(w,h,d, mat, x,y,z, rx){ parts.get(mat).push({ geo: new THREE.BoxGeometry(w,h,d), color: 0xffffff, x: x, y: y, z: z, rx: rx }); }

  add(1.92, 0.44, 4.32, paint, 0, 0.66, 0);              // nadwozie
  add(1.78, 0.30, 4.00, dark,  0, 0.38, 0);              // próg / podwozie
  add(1.80, 0.16, 1.42, paint, 0, 0.90, 1.22, -0.055);   // maska
  add(1.74, 0.14, 1.10, paint, 0, 0.90, -1.45, 0.045);   // klapa bagażnika
  add(1.64, 0.50, 2.06, glass, 0, 1.12, -0.12);          // kabina (szyby)
  add(1.50, 0.10, 1.52, paint, 0, 1.38, -0.30);          // dach
  add(0.09, 0.50, 0.09, dark,  0.78, 1.12, -1.12);       // słupki C
  add(0.09, 0.50, 0.09, dark, -0.78, 1.12, -1.12);
  add(1.94, 0.22, 0.34, dark,  0, 0.50,  2.19);          // zderzaki
  add(1.94, 0.22, 0.34, dark,  0, 0.50, -2.19);
  add(1.30, 0.10, 0.22, chrome, 0, 0.66, 2.20);          // grill
  add(0.16, 0.10, 0.34, chrome,  1.00, 1.03, 0.60);      // lusterka
  add(0.16, 0.10, 0.34, chrome, -1.00, 1.03, 0.60);
  add(1.46, 0.06, 0.34, paint, 0, 1.20, -2.00);          // spojler
  add(0.10, 0.16, 0.10, dark,   0.62, 1.12, -2.00);
  add(0.10, 0.16, 0.10, dark,  -0.62, 1.12, -2.00);
  add(0.06, 0.34, 4.10, dark,   0.97, 0.56, 0);          // listwy boczne
  add(0.06, 0.34, 4.10, dark,  -0.97, 0.56, 0);
  add(0.44, 0.14, 0.10, lampF,  0.62, 0.82, 2.18);       // reflektory
  add(0.44, 0.14, 0.10, lampF, -0.62, 0.82, 2.18);
  add(0.42, 0.13, 0.08, lampR,  0.64, 0.84, -2.20);      // tylne światła
  add(0.42, 0.13, 0.08, lampR, -0.64, 0.84, -2.20);
  add(0.86, 0.05, 0.06, lampR, 0, 0.98, -2.20);          // listwa tylna
  parts.forEach((list, mat) => {
    const m = new THREE.Mesh(mergeColored(list), mat);
    m.castShadow = true; m.receiveShadow = true;
    body.add(m);
  });

  /* reflektory — prawdziwe SpotLighty (tylko auto prowadzone; atrapa ich nie potrzebuje) */
  const spots = [];
  if (!staticWheels){
    for (let i = 0; i < 2; i++){
      const sx = i ? -0.62 : 0.62;
      const sp = new THREE.SpotLight(0xfff0cf, 0, 52, 0.46, 0.55, 1.3);
      sp.position.set(sx, 0.82, 2.2);
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
  for (let i = 0; i < 4; i++){
    const wg = new THREE.Group();
    const tire = new THREE.Mesh(carWheelGeo.tire, carWheelMat.tire); tire.castShadow = true; wg.add(tire);
    wg.add(new THREE.Mesh(carWheelGeo.rim, carWheelMat.rim));
    if (staticWheels){
      const p = [[ TRACK, WB_F], [-TRACK, WB_F], [ TRACK, WB_R], [-TRACK, WB_R]][i];
      wg.position.set(p[0], WHEEL_R - 0.48, p[1]);          // oś koła w spoczynku: nadwozie stoi na y≈0.48 (test/drive.js)
      root.add(wg);
    } else scene.add(wg);
    wheels.push(wg);
  }

  scene.add(root);
  return { root: root, body: body, wheels: wheels, spots: spots,
           tailMat: lampR, headMat: lampF, paintMat: paint };
}
const carWheelGeo = (function(){
  const tire = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.30, 16); tire.rotateZ(Math.PI/2);
  const rim = new THREE.CylinderGeometry(WHEEL_R*0.62, WHEEL_R*0.62, 0.32, 10); rim.rotateZ(Math.PI/2);
  const sp = new THREE.BoxGeometry(0.33, 0.07, WHEEL_R*1.1);
  const rimParts = [{ geo: rim, color: 0xffffff }];
  for (let s = 0; s < 3; s++) rimParts.push({ geo: sp, color: 0xffffff, rx: s * Math.PI / 3 });
  return { tire: tire, rim: mergeColored(rimParts) };
})();
const carWheelMat = { tire: new THREE.MeshLambertMaterial({ color: 0x141518 }),
                      rim: new THREE.MeshPhongMaterial({ color: 0x9aa0a8, shininess: 110, specular: 0xffffff }) };

const carModel = buildCarModel(0xb3272b);

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
[[ TRACK, WB_F], [-TRACK, WB_F], [ TRACK, WB_R], [-TRACK, WB_R]].forEach(p => {
  WHEEL_OPT.chassisConnectionPointLocal.set(p[0], CONN_Y, p[1]);
  vehicle.addWheel(WHEEL_OPT);
});
vehicle.addToWorld(world);
const REAR_GRIP = 3.4;
