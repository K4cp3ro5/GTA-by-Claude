/* ---------------------------------------------------------------
   9. POSTAĆ GRACZA
   --------------------------------------------------------------- */
const CENTER_I = Math.floor(GRID / 2);
const SPAWN = new THREE.Vector3(L(CENTER_I) + 9, 2.2, L(CENTER_I) + 9);

const player = {
  body: null, mesh: null, grounded: false, walkPhase: 0, speed: 0,
  facing: 0, stepTimer: 0, airTime: 0, fallSpeed: 0,
  health: 100, stamina: 100, dead: false, prevVy: 0, hurtFlash: 0
};

/* niskopolisowy humanoid — współdzielony przez gracza i pieszych NPC */
function buildHumanoid(pal){
  const g = new THREE.Group();
  const skin  = new THREE.MeshLambertMaterial({ color: pal.skin });
  const shirt = new THREE.MeshLambertMaterial({ color: pal.shirt });
  const pants = new THREE.MeshLambertMaterial({ color: pal.pants });
  const shoes = new THREE.MeshLambertMaterial({ color: 0x17181c });
  const hair  = new THREE.MeshLambertMaterial({ color: pal.hair });

  function box(w,h,d,mat,x,y,z){
    const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
    m.position.set(x,y,z); m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  g.add(box(0.52, 0.62, 0.30, shirt, 0, 1.19, 0));   // tors
  g.add(box(0.46, 0.22, 0.28, pants, 0, 0.83, 0));   // biodra
  const head = box(0.27, 0.30, 0.26, skin, 0, 1.66, 0.01);
  g.add(head);
  g.add(box(0.29, 0.10, 0.28, hair, 0, 1.79, 0.01));
  g.add(box(0.06, 0.06, 0.03, hair, 0, 1.66, 0.14)); // nos — kierunek patrzenia

  function limb(px, py, pz, w, h, d, mat, footMat){
    const pivot = new THREE.Group();
    pivot.position.set(px, py, pz);
    const seg = box(w, h, d, mat, 0, -h/2, 0);
    pivot.add(seg);
    if (footMat){
      const f = box(w*1.05, 0.11, d*1.7, footMat, 0, -h - 0.05, 0.05);
      pivot.add(f);
    }
    g.add(pivot);
    return pivot;
  }
  const armL = limb( 0.355, 1.44, 0, 0.14, 0.56, 0.16, shirt, null);
  const armR = limb(-0.355, 1.44, 0, 0.14, 0.56, 0.16, shirt, null);
  armL.add(box(0.13, 0.13, 0.15, skin, 0, -0.62, 0));
  armR.add(box(0.13, 0.13, 0.15, skin, 0, -0.62, 0));
  const legL = limb( 0.135, 0.80, 0, 0.19, 0.72, 0.20, pants, shoes);
  const legR = limb(-0.135, 0.80, 0, 0.19, 0.72, 0.20, pants, shoes);

  return { group: g, armL: armL, armR: armR, legL: legL, legR: legR };
}
const PLAYER_PALETTE = { skin:0xd9a882, shirt:0x28405e, pants:0x2c2f36, hair:0x2a1f19 };

(function buildPlayer(){
  const h = buildHumanoid(PLAYER_PALETTE);
  scene.add(h.group);
  player.mesh = h.group;
  player.armL = h.armL; player.armR = h.armR;
  player.legL = h.legL; player.legR = h.legR;

  const body = new CANNON.Body({ mass: 78, material: matPlayer });
  body.addShape(new CANNON.Sphere(0.40), new CANNON.Vec3(0, -0.45, 0));
  body.addShape(new CANNON.Sphere(0.40), new CANNON.Vec3(0,  0.45, 0));
  body.position.set(SPAWN.x, SPAWN.y, SPAWN.z);
  body.fixedRotation = true;
  body.updateMassProperties();
  body.linearDamping = 0.02;
  body.allowSleep = false;
  body.collisionFilterGroup = G_PLAYER;
  body.collisionFilterMask  = -1;
  addBody(body);
  player.body = body;
})();

/* promień do sprawdzania kontaktu z podłożem */
const groundRay = new CANNON.Ray();
const groundRes = new CANNON.RaycastResult();
function checkGrounded(){
  const p = player.body.position;
  groundRes.reset();
  groundRay.from.set(p.x, p.y, p.z);
  groundRay.to.set(p.x, p.y - 1.25, p.z);
  groundRay.intersectWorld(world, {
    mode: CANNON.Ray.CLOSEST,
    result: groundRes,
    skipBackfaces: true,
    collisionFilterGroup: G_WORLD,
    collisionFilterMask: G_WORLD | G_CAR
  });
  return groundRes.hasHit && groundRes.distance < 0.96;
}
