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

/* niskopolisowy humanoid — współdzielony przez gracza i pieszych NPC.
   5 siatek (tułów z głową + 4 kończyny na przegubach) z kolorami wierzchołków zamiast 12;
   geometrie wspólne dla tej samej palety */
const _humMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const _humCache = new Map();
function humanoidGeometries(pal){
  const key = [pal.skin, pal.shirt, pal.pants, pal.hair].join(',');
  if (_humCache.has(key)) return _humCache.get(key);
  const B = (w,h,d) => new THREE.BoxGeometry(w,h,d), SHOES = 0x17181c;
  const torso = mergeColored([
    { geo: B(0.52, 0.62, 0.30), color: pal.shirt, y: 1.19 },          // tors
    { geo: B(0.46, 0.22, 0.28), color: pal.pants, y: 0.83 },          // biodra
    { geo: B(0.27, 0.30, 0.26), color: pal.skin,  y: 1.66, z: 0.01 }, // głowa
    { geo: B(0.29, 0.10, 0.28), color: pal.hair,  y: 1.79, z: 0.01 },
    { geo: B(0.06, 0.06, 0.03), color: pal.hair,  y: 1.66, z: 0.14 }  // nos — kierunek patrzenia
  ]);
  /* kończyny liczone od przegubu (y=0) w dół */
  const arm = mergeColored([
    { geo: B(0.14, 0.56, 0.16), color: pal.shirt, y: -0.28 },
    { geo: B(0.13, 0.13, 0.15), color: pal.skin,  y: -0.62 }
  ]);
  const leg = mergeColored([
    { geo: B(0.19, 0.72, 0.20), color: pal.pants, y: -0.36 },
    { geo: B(0.19*1.05, 0.11, 0.20*1.7), color: SHOES, y: -0.72 - 0.05, z: 0.05 }
  ]);
  const r = { torso: torso, arm: arm, leg: leg };
  _humCache.set(key, r);
  return r;
}
function buildHumanoid(pal){
  const g = new THREE.Group(), G = humanoidGeometries(pal);
  const mesh = geo => { const m = new THREE.Mesh(geo, _humMat); m.castShadow = true; m.receiveShadow = true; return m; };
  g.add(mesh(G.torso));
  function limb(px, py, geo){
    const pivot = new THREE.Group();
    pivot.position.set(px, py, 0);
    pivot.add(mesh(geo));
    g.add(pivot);
    return pivot;
  }
  const armL = limb( 0.355, 1.44, G.arm);
  const armR = limb(-0.355, 1.44, G.arm);
  const legL = limb( 0.135, 0.80, G.leg);
  const legR = limb(-0.135, 0.80, G.leg);
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
