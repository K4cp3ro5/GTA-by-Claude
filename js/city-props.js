/* ---------------------------------------------------------------
   8. DETALE MIEJSKIE (InstancedMesh)
   --------------------------------------------------------------- */
const M4 = new THREE.Matrix4(), QT = new THREE.Quaternion(),
      V3 = new THREE.Vector3(), SC = new THREE.Vector3(1,1,1);

function instance(geo, mat, list, fill, cast, receive){
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  im.castShadow = !!cast; im.receiveShadow = !!receive;
  for (let i = 0; i < list.length; i++){
    fill(list[i], M4, i);
    im.setMatrixAt(i, M4);
  }
  im.instanceMatrix.needsUpdate = true;
  im.frustumCulled = false;
  scene.add(im);
  return im;
}
function setTRS(m, x,y,z, ry, sx,sy,sz){
  QT.setFromAxisAngle(new THREE.Vector3(0,1,0), ry || 0);
  V3.set(x,y,z);
  SC.set(sx === undefined ? 1 : sx, sy === undefined ? 1 : sy, sz === undefined ? 1 : sz);
  m.compose(V3, QT, SC);
}

const matMetalDark = new THREE.MeshLambertMaterial({ color:0x2e3238 });
const matMetalMid  = new THREE.MeshLambertMaterial({ color:0x4a5058 });
const matBark      = new THREE.MeshLambertMaterial({ color:0x584434 });
/* MeshLambertMaterial w r128 nie ma flatShading — fasetowy wygląd daje geometria bez indeksów (normalne per ściana, faceted()) */
const matLeafA     = new THREE.MeshLambertMaterial({ color:0x4f7a3c });
const matLeafB     = new THREE.MeshLambertMaterial({ color:0x3f6b35 });
function faceted(geo){ const g = geo.index ? geo.toNonIndexed() : geo; g.computeVertexNormals(); return g; }
const matBin       = new THREE.MeshLambertMaterial({ color:0x2f4a3a });
const matHydrant   = new THREE.MeshLambertMaterial({ color:0xc0392b });
const matLampGlass = new THREE.MeshBasicMaterial({ color:0x3a3a3a });
const matGlow      = new THREE.MeshBasicMaterial({
  color:0xffb03a, transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false
});

const LAMP_H = 5.6;
const lampY = s => (s.y !== undefined ? s.y : WALK_H);     // poziom podłoża pod latarnią
instance(new THREE.CylinderGeometry(0.09, 0.14, LAMP_H, 6), matMetalDark, lampSpots,
  (s,m) => setTRS(m, s.x, lampY(s) + LAMP_H/2, s.z, s.rot), true, false);
instance(new THREE.BoxGeometry(0.09, 0.09, 1.25), matMetalDark, lampSpots,
  (s,m) => {
    QT.setFromAxisAngle(new THREE.Vector3(0,1,0), s.rot);
    V3.set(s.x, lampY(s) + LAMP_H - 0.12, s.z).add(new THREE.Vector3(0,0,0.6).applyQuaternion(QT));
    SC.set(1,1,1); m.compose(V3, QT, SC);
  }, true, false);
const lampHeads = instance(new THREE.BoxGeometry(0.44, 0.17, 0.72), matLampGlass, lampSpots,
  (s,m) => {
    QT.setFromAxisAngle(new THREE.Vector3(0,1,0), s.rot);
    V3.set(s.x, lampY(s) + LAMP_H - 0.22, s.z).add(new THREE.Vector3(0,0,1.15).applyQuaternion(QT));
    SC.set(1,1,1); m.compose(V3, QT, SC);
  }, false, false);

/* światło rozlane pod latarnią (addytywna plama). Latarnia uliczna stoi 0.6 m od krawężnika
   z głowicą nad jezdnią: plama to dwa półkola ze środkiem na linii krawężnika — część
   jezdniowa na poziomie asfaltu, chodnikowa na poziomie chodnika (inaczej jedna tarcza
   wisiałaby 25 cm nad jezdnią albo chowała się pod chodnikiem).
   CircleGeometry po rotateX(-PI/2): kąt th -> (cos th, 0, -sin th); th z [PI, 2PI] = lokalne +Z (w stronę wysięgnika). */
const glowGeo = new THREE.CircleGeometry(3.6, 14);
glowGeo.rotateX(-Math.PI/2);
const glowRoadGeo = new THREE.CircleGeometry(5.5, 12, Math.PI, Math.PI);  glowRoadGeo.rotateX(-Math.PI/2);
const glowWalkGeo = new THREE.CircleGeometry(5.5, 12, 0, Math.PI);        glowWalkGeo.rotateX(-Math.PI/2);
const streetLamps = lampSpots.filter(s => s.street), otherLamps = lampSpots.filter(s => !s.street);
const glowAt = (s, along, y) => (s2, m) => {
  QT.setFromAxisAngle(new THREE.Vector3(0,1,0), s2.rot);
  V3.set(s2.x, y(s2), s2.z).add(new THREE.Vector3(0,0,along).applyQuaternion(QT));
  SC.set(1,1,1); m.compose(V3, QT, SC);
};
const lampGlows = new THREE.Group();
[ instance(glowGeo, matGlow, otherLamps, glowAt(null, 1.15, s => (s.gy !== undefined ? s.gy : lampY(s)) + 0.035), false, false),
  instance(glowRoadGeo, matGlow, streetLamps, glowAt(null, 0.6, () => 0.035), false, false),
  instance(glowWalkGeo, matGlow, streetLamps, glowAt(null, 0.6, s => lampY(s) + 0.035), false, false)
].forEach(im => { scene.remove(im); im.renderOrder = 2; lampGlows.add(im); });
scene.add(lampGlows);

/* pozycje żarówek do świateł punktowych */
const lampBulbs = lampSpots.map(s => {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), s.rot);
  const o = new THREE.Vector3(0,0,1.15).applyQuaternion(q);
  return new THREE.Vector3(s.x + o.x, lampY(s) + LAMP_H - 0.4, s.z + o.z);
});
lampSpots.forEach(s => staticBox(s.x, lampY(s) + 1.4, s.z, 0.26, 2.8, 0.26));

/* drzewa */
const treesA = treeSpots.filter(t => t.type === 0);
const treesB = treeSpots.filter(t => t.type === 1);
const treeY = t => (t.y !== undefined ? t.y : WALK_H);   // poziom podłoża pod drzewem
instance(new THREE.CylinderGeometry(0.16, 0.26, 2.3, 6), matBark, treeSpots,
  (t,m) => setTRS(m, t.x, treeY(t) + 1.15*t.scale, t.z, t.rot, t.scale, t.scale, t.scale), true, false);
if (treesA.length) instance(faceted(new THREE.ConeGeometry(1.75, 3.9, 7)), matLeafA, treesA,
  (t,m) => setTRS(m, t.x, treeY(t) + (2.3 + 1.95)*t.scale - 0.4*t.scale, t.z, t.rot, t.scale, t.scale, t.scale), true, false);
if (treesB.length) instance(faceted(new THREE.IcosahedronGeometry(1.7, 0)), matLeafB,  treesB,
  (t,m) => setTRS(m, t.x, treeY(t) + (2.3 + 1.35)*t.scale, t.z, t.rot, t.scale, t.scale*0.92, t.scale), true, false);
treeSpots.forEach(t => staticBox(t.x, treeY(t) + 1.15*t.scale, t.z, 0.45*t.scale, 2.3*t.scale, 0.45*t.scale));

/* kosze */
if (binSpots.length){
  instance(new THREE.CylinderGeometry(0.34, 0.28, 0.92, 9), matBin, binSpots,
    (s,m) => setTRS(m, s.x, WALK_H + 0.46, s.z, rnd()*TAU), true, true);
  instance(new THREE.TorusGeometry(0.34, 0.045, 5, 10), matMetalMid, binSpots,
    (s,m) => { QT.setFromAxisAngle(new THREE.Vector3(1,0,0), Math.PI/2);
               V3.set(s.x, WALK_H + 0.92, s.z); SC.set(1,1,1); m.compose(V3,QT,SC); }, true, false);
  binSpots.forEach(s => staticBox(s.x, WALK_H + 0.46, s.z, 0.68, 0.92, 0.68));
}
/* hydranty */
if (hydSpots.length){
  instance(new THREE.CylinderGeometry(0.17, 0.21, 0.72, 8), matHydrant, hydSpots,
    (s,m) => setTRS(m, s.x, WALK_H + 0.36, s.z, rnd()*TAU), true, true);
  instance(new THREE.SphereGeometry(0.17, 8, 6), matHydrant, hydSpots,
    (s,m) => setTRS(m, s.x, WALK_H + 0.74, s.z, 0), true, false);
  instance(new THREE.BoxGeometry(0.62, 0.13, 0.13), matHydrant, hydSpots,
    (s,m) => setTRS(m, s.x, WALK_H + 0.52, s.z, rnd()*TAU), true, false);
  hydSpots.forEach(s => staticBox(s.x, WALK_H + 0.4, s.z, 0.45, 0.8, 0.45));
}
