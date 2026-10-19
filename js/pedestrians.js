/* ---------------------------------------------------------------
   11b. PIESI (NPC)
   --------------------------------------------------------------- */
const PED_PALETTES = [
  { skin:0xd9a882, shirt:0x8a3b3b, pants:0x2c2f36, hair:0x2a1f19 },
  { skin:0xc48f6a, shirt:0x3b5a8a, pants:0x33363d, hair:0x1a1a1a },
  { skin:0xe8c39e, shirt:0x4b7a4f, pants:0x40424a, hair:0x5b4632 },
  { skin:0xa9765a, shirt:0x6b4f8a, pants:0x25272d, hair:0x161616 },
  { skin:0xf0d3ad, shirt:0x8a7a3b, pants:0x2f3138, hair:0x7a5230 },
  { skin:0x8a6349, shirt:0x3b8a83, pants:0x2c2f36, hair:0x0f0f0f },
  { skin:0xd9a882, shirt:0x555b63, pants:0x1e2024, hair:0x3a2a1c },
  { skin:0xc9a075, shirt:0x9c7a2f, pants:0x33363d, hair:0x0f0f0f }
];

function pedLoopFor(bi, bj){
  const cx = blockCenter(bi), cz = blockCenter(bj);
  const inset = LOT/2 - 2.0;    // poza zasięgiem budynków (patrz addBuilding — max promień 12 przy LOT=30)
  const pts = [
    { x: cx+inset, z: cz+inset }, { x: cx-inset, z: cz+inset },
    { x: cx-inset, z: cz-inset }, { x: cx+inset, z: cz-inset }
  ];
  return rnd() < 0.5 ? pts : pts.slice().reverse();
}
function isCornerBlock(bi, bj){
  return !!specialCornerAt(bi, bj);
}

const Pedestrians = { list: [] };

function spawnPed(bi, bj){
  const path = pedLoopFor(bi, bj);
  const idx = randInt(0, 3);
  const pal = PED_PALETTES[randInt(0, PED_PALETTES.length - 1)];
  const h = buildHumanoid(pal);
  h.group.userData.pedRef = null;   // uzupełnione niżej po utworzeniu n
  scene.add(h.group);
  const n = {
    path: path, wp: (idx + 1) % 4,
    pos: new THREE.Vector2(path[idx].x, path[idx].z),
    heading: 0, walkPhase: rand(0, TAU),
    speed: 1.15 + rand(-0.18, 0.22),
    group: h.group, armL: h.armL, armR: h.armR, legL: h.legL, legR: h.legR,
    body: null, state: 'walk', stateT: 0
  };
  h.group.userData.pedRef = n;
  const b = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
  b.addShape(new CANNON.Sphere(0.36), new CANNON.Vec3(0, -0.45, 0));
  b.addShape(new CANNON.Sphere(0.36), new CANNON.Vec3(0,  0.45, 0));
  b.position.set(n.pos.x, WALK_H + 0.85, n.pos.y);
  b.collisionFilterGroup = G_PED;
  b.collisionFilterMask  = -1;
  b.allowSleep = false;
  b.isPed = true;
  b.pedRef = n;
  addBody(b);
  n.body = b;
  Pedestrians.list.push(n);
}

(function spawnAllPeds(){
  const pool = pedBlockCandidates.slice();
  const count = Math.min(20, pool.length);
  for (let k = 0; k < count; k++){
    const idx = randInt(0, pool.length - 1);
    const bpos = pool.splice(idx, 1)[0];
    spawnPed(bpos.bi, bpos.bj);
  }
})();

function updatePedestrians(dt){
  for (const n of Pedestrians.list){
    if (n.state === 'down'){
      n.stateT -= dt;
      if (n.stateT <= 0){
        let bi, bj;
        do { bi = randInt(0, GRID - 1); bj = randInt(0, GRID - 1); } while (isCornerBlock(bi, bj));
        n.path = pedLoopFor(bi, bj);
        n.wp = 0;
        n.pos.set(n.path[0].x, n.path[0].z);
        n.group.rotation.x = 0;
        n.state = 'walk';
      }
      continue;
    }

    const tgt = n.path[n.wp];
    const dx = tgt.x - n.pos.x, dz = tgt.z - n.pos.y;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.6){
      n.wp = (n.wp + 1) % 4;
    } else {
      const nx = dx / dist, nz = dz / dist;
      n.pos.x += nx * n.speed * dt;
      n.pos.y += nz * n.speed * dt;
      n.heading = angleDamp(n.heading, Math.atan2(nx, nz), 6, dt);
    }
    n.body.position.set(n.pos.x, WALK_H + 0.85, n.pos.y);
    n.group.position.set(n.pos.x, WALK_H, n.pos.y);
    n.group.rotation.y = n.heading;

    n.walkPhase += dt * (3.0 + n.speed * 1.1);
    const s = Math.sin(n.walkPhase), c = Math.sin(n.walkPhase + Math.PI);
    n.legL.rotation.x = s * 0.5; n.legR.rotation.x = c * 0.5;
    n.armL.rotation.x = c * 0.42; n.armR.rotation.x = s * 0.42;
  }
}

Pedestrians.hit = function(n, force, gentle){
  if (!n || n.state === 'down') return;
  n.state = 'down';
  n.stateT = gentle ? 3.5 : 5.5;
  n.group.rotation.x = (rnd() < 0.5 ? 1 : -1) * Math.PI/2;
  Sound.hurt();
};
Pedestrians.hitMesh = function(mesh, dmg){
  let o = mesh;
  while (o && !o.userData.pedRef) o = o.parent;
  if (o) Pedestrians.hit(o.userData.pedRef, dmg);
};
Pedestrians.meshes = function(){ return Pedestrians.list.filter(n => n.state !== 'down').map(n => n.group); };
function removePed(n){
  delBody(n.body);
  scene.remove(n.group);
  const idx = Pedestrians.list.indexOf(n);
  if (idx >= 0) Pedestrians.list.splice(idx, 1);
}
