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

/* Statyczna kolizja świata: małe bryły (budynki, krawężniki, słupki, latarnie, drzewa…) nie są
   osobnymi ciałami, tylko kształtami w złożonych ciałach — po jednym na kwadrat STATIC_CELL × STATIC_CELL m.
   Przy ~2600 osobnych ciałach broadphase cannon.js przeglądał je wszystkie w każdym kroku
   (krok fizyki 30–80 ms); teraz to kilkaset ciał. Bryły większe od komórki (mur, długie ściany)
   dostają własne ciało. */
const STATIC_CELL = 48;
const staticCells = new Map();
const _cellQ = new CANNON.Quaternion(), _axisY = new CANNON.Vec3(0, 1, 0), _axisX = new CANNON.Vec3(1, 0, 0);
function staticShape(shape, x, y, z, quat, big){
  const key = big ? null : Math.floor(x / STATIC_CELL) + ',' + Math.floor(z / STATIC_CELL);
  let b = key && staticCells.get(key), fresh = false;
  if (!b){
    b = new CANNON.Body({ mass:0, material:matGround });
    if (key){ const p = key.split(',').map(Number); b.position.set((p[0] + 0.5) * STATIC_CELL, 0, (p[1] + 0.5) * STATIC_CELL); staticCells.set(key, b); }
    else b.position.set(x, 0, z);
    b.collisionFilterGroup = G_WORLD;
    b.collisionFilterMask  = -1;          // to samo dotyczy każdego statycznego obiektu (budynki, krawężniki, latarnie, bariera...)
    fresh = true;
  }
  b.addShape(shape, new CANNON.Vec3(x - b.position.x, y, z - b.position.z), quat);
  if (fresh) addBody(b);
  else b.aabbNeedsUpdate = true;
  return b;
}
function staticBox(cx, cy, cz, w, h, d){
  return staticShape(new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2)), cx, cy, cz, undefined, Math.max(w, d) > STATIC_CELL);
}
function staticBoxRot(cx, cy, cz, w, h, d, rotY){
  const q = new CANNON.Quaternion(); q.setFromAxisAngle(_axisY, rotY);
  return staticShape(new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2)), cx, cy, cz, q, Math.max(w, d) > STATIC_CELL);
}
function staticCylinder(cx, cy, cz, radius, h){
  const q = new CANNON.Quaternion(); q.setFromAxisAngle(_axisX, -Math.PI/2);   // cylinder cannon.js ma oś lokalną Z — stawiamy pionowo (sprawdzone numerycznie)
  return staticShape(new CANNON.Cylinder(radius, radius, h, 14), cx, cy, cz, q, radius * 2 > STATIC_CELL);
}
