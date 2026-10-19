/* ---------------------------------------------------------------
   6. ŚWIAT FIZYCZNY
   --------------------------------------------------------------- */
const world = new CANNON.World();
world.gravity.set(0, -20, 0);
world.broadphase = new CANNON.SAPBroadphase(world);
world.broadphase.axisIndex = 0;
world.allowSleep = true;
world.solver.iterations = 9;
world.solver.tolerance  = 0.002;
world.defaultContactMaterial.friction = 0.45;
world.defaultContactMaterial.restitution = 0.02;

const matGround = new CANNON.Material('ground');
const matCar    = new CANNON.Material('car');
const matPlayer = new CANNON.Material('player');
world.addContactMaterial(new CANNON.ContactMaterial(matGround, matCar,    { friction:0.16, restitution:0.08 }));
world.addContactMaterial(new CANNON.ContactMaterial(matGround, matPlayer, { friction:0.0,  restitution:0.0  }));
world.addContactMaterial(new CANNON.ContactMaterial(matCar,    matPlayer, { friction:0.1,  restitution:0.0  }));

/* grupy kolizji: 1 = świat, 2 = pieszy (gracz), 4 = pojazdy, 8 = piesi NPC */
const G_WORLD = 1, G_PLAYER = 2, G_CAR = 4, G_PED = 8;

const groundBody = new CANNON.Body({ mass:0, material:matGround });
groundBody.addShape(new CANNON.Plane());
groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1,0,0), -Math.PI/2);
groundBody.collisionFilterGroup = G_WORLD;
groundBody.collisionFilterMask  = -1;   // cannon.js domyślnie daje mask:1 — bez tego świat nie kolidowałby z graczem/autem
addBody(groundBody);

function staticBox(cx, cy, cz, w, h, d){
  const b = new CANNON.Body({ mass:0, material:matGround });
  b.addShape(new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2)));
  b.position.set(cx, cy, cz);
  b.collisionFilterGroup = G_WORLD;
  b.collisionFilterMask  = -1;          // to samo dotyczy każdego statycznego obiektu (budynki, krawężniki, latarnie, bariera...)
  addBody(b);
  return b;
}
function staticBoxRot(cx, cy, cz, w, h, d, rotY){
  const b = new CANNON.Body({ mass:0, material:matGround });
  b.addShape(new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2)));
  b.position.set(cx, cy, cz);
  b.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), rotY);
  b.collisionFilterGroup = G_WORLD;
  b.collisionFilterMask  = -1;
  addBody(b);
  return b;
}
function staticCylinder(cx, cy, cz, radius, h){
  const b = new CANNON.Body({ mass:0, material:matGround });
  const cyl = new CANNON.Cylinder(radius, radius, h, 14);
  b.addShape(cyl);
  b.position.set(cx, cy, cz);
  b.quaternion.setFromAxisAngle(new CANNON.Vec3(1,0,0), -Math.PI/2);  // cylinder cannon.js ma oś lokalną Z — stawiamy pionowo (sprawdzone numerycznie)
  b.collisionFilterGroup = G_WORLD;
  b.collisionFilterMask  = -1;
  addBody(b);
  return b;
}
