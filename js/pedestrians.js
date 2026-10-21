/* ---------------------------------------------------------------
   11b. PIESI (NPC)
   Spacerują po chodniku dookoła kwartału; przy narożniku mogą skręcić na przejście
   dla pieszych (crosswalks z city-generation.js) do sąsiedniego kwartału:
   walk -> toCurb (do krawężnika) -> wait (luka w ruchu / zielone) -> cross -> walk (nowy kwartał).
   Auta NPC ustępują pieszym na jezdni (update-npc.js).
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
const pedBlockSet = new Set(pedBlockCandidates.map(b => b.bi + ',' + b.bj));
/* przejścia, z których korzystają piesi: oba końce na kwartałach z pętlą spacerową */
const pedCrosswalks = crosswalks.filter(c => c.blocks.every(b => pedBlockSet.has(b[0] + ',' + b[1])));
pedCrosswalks.forEach(c => { c.tl = trafficLights.find(t => Math.abs(t.x - L(c.i)) < 1 && Math.abs(t.z - L(c.j)) < 1) || null; });

const PED_SHIRTS = [0x8a3b3b, 0x3b5a8a, 0x4b7a4f, 0x6b4f8a, 0x8a7a3b, 0x3b8a83, 0x555b63, 0x9c7a2f, 0xc9c4b8, 0xb85a2a, 0x2a2d33, 0xd8b23a, 0x7a2f4f];
const PED_PANTS = [0x2c2f36, 0x33363d, 0x40424a, 0x25272d, 0x1e2024, 0x3a4a63, 0x5b4a3a, 0x6b6f75];
const Pedestrians = { list: [], fled: 0 };
const PED_WALK = 1.15, PED_CROSS = 1.55;

function spawnPed(bi, bj){
  const path = pedLoopFor(bi, bj);
  const idx = randInt(0, 3);
  /* różnorodność: kolory skóry/włosów z palet, ubrania z szerszej listy, wzrost 0.9–1.1, tempo */
  const P0 = PED_PALETTES[randInt(0, PED_PALETTES.length - 1)];
  const pal = { skin: P0.skin, hair: P0.hair, shirt: pick(PED_SHIRTS), pants: pick(PED_PANTS) };
  const h = buildHumanoid(pal);
  h.group.scale.setScalar(rand(0.9, 1.1));
  h.group.userData.pedRef = null;   // uzupełnione niżej po utworzeniu n
  scene.add(h.group);
  const n = {
    path: path, wp: (idx + 1) % 4, block: [bi, bj],
    pos: new THREE.Vector2(path[idx].x, path[idx].z), y: WALK_H,
    heading: 0, walkPhase: rand(0, TAU),
    speed: PED_WALK * rand(0.8, 1.25), dir: 1, fleeT: 0,
    group: h.group, armL: h.armL, armR: h.armR, legL: h.legL, legR: h.legR,
    body: null, state: 'walk', stateT: 0, cw: null, cwTo: null, waitT: 0
  };
  h.group.userData.pedRef = n;
  const b = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
  b.addShape(new CANNON.Sphere(0.36), new CANNON.Vec3(0, -0.45, 0));
  b.addShape(new CANNON.Sphere(0.36), new CANNON.Vec3(0,  0.45, 0));
  b.position.set(n.pos.x, WALK_H + 0.85, n.pos.y);
  b.collisionFilterGroup = G_PED;
  b.collisionFilterMask  = ~G_WORLD;   // kinematyczne: bez par ze światem (bryły wysp)
  b.allowSleep = false;
  b.isPed = true;
  b.pedRef = n;
  addBody(b);
  n.body = b;
  Pedestrians.list.push(n);
}

(function spawnAllPeds(){
  const pool = pedBlockCandidates.slice();
  const count = Math.min(30, pool.length);
  for (let k = 0; k < count; k++){
    const idx = randInt(0, pool.length - 1);
    const bpos = pool.splice(idx, 1)[0];
    spawnPed(bpos.bi, bpos.bj);
  }
})();

/* Czy można wejść na przejście c: na skrzyżowaniu ze światłami — gdy auta na przekraczanej
   jezdni mają czerwone, a poprzeczne dopiero dostały zielone (piesi mają ~11 s); zawsze —
   gdy żaden jadący pojazd nie zbliża się do przejścia na mniej niż ~22 m i nikt na nim nie stoi. */
function pedCrossSafe(c){
  if (c.tl){
    const tCross = c.road === 'ns' ? c.tl.t : (c.tl.t + TL_HALF) % TL_FULL;      // faza aut na przekraczanej jezdni
    const tOther = (tCross + TL_HALF) % TL_FULL;
    if (tlState(tCross) !== 'R') return false;
    const st = tlState(tOther);
    if (!(st === 'RY' || (st === 'G' && tOther - TL_RY < 4))) return false;
  }
  const near = (x, z, vx, vz) => {
    const ox = c.x - x, oz = c.z - z, d = Math.hypot(ox, oz);
    if (Math.abs(x - c.x) < c.hw + 1.2 && Math.abs(z - c.z) < c.hd + 1.2) return true;   // pojazd na przejściu
    if (d > 22) return false;
    const sp = Math.hypot(vx, vz);
    return sp > 0.8 && (ox*vx + oz*vz) / (d || 1) > 0.3 * sp;                            // jedzie w stronę przejścia
  };
  for (const m of npcs) if ((m.y || 0) < 1 && near(m.pos.x, m.pos.y, (m.dirX || 0) * m.speed, (m.dirZ || 0) * m.speed)) return false;
  const v = chassisBody.velocity;
  if (near(chassisBody.position.x, chassisBody.position.z, v.x, v.z)) return false;
  return true;
}
/* pieszy na jezdni (przechodzi albo leży) — auta NPC muszą się przed nim zatrzymać */
function pedOnRoad(n){ return n.y < WALK_H - 0.05; }

function pedStepTo(n, tx, tz, spd, dt){
  const dx = tx - n.pos.x, dz = tz - n.pos.y, dist = Math.hypot(dx, dz);
  if (dist < 0.25) return true;
  const st = Math.min(dist, spd * dt);
  n.pos.x += dx / dist * st; n.pos.y += dz / dist * st;
  n.heading = angleDamp(n.heading, Math.atan2(dx, dz), 6, dt);
  return false;
}
function updatePedestrians(dt){
  for (const n of Pedestrians.list){
    if (n.state === 'down'){
      n.stateT -= dt;
      if (n.stateT <= 0){
        let bi, bj;
        do { bi = randInt(0, GRID - 1); bj = randInt(0, GRID - 1); } while (isCornerBlock(bi, bj) || !pedBlockSet.has(bi + ',' + bj));
        n.path = pedLoopFor(bi, bj); n.block = [bi, bj];
        n.wp = 0; n.y = WALK_H;
        n.pos.set(n.path[0].x, n.path[0].z);
        n.group.rotation.x = 0;
        n.state = 'walk';
      }
      continue;
    }

    let moving = true;
    if (n.fleeT > 0) n.fleeT -= dt;
    const run = n.fleeT > 0 ? 2.6 : 1;                                       // ucieczka po strzałach: bieg
    if (n.state === 'walk'){
      const tgt = n.path[n.wp];
      if (pedStepTo(n, tgt.x, tgt.z, n.speed * run, dt)){
        /* narożnik: czasem przejście na sąsiedni kwartał (nie w czasie ucieczki) */
        const near = pedCrosswalks.filter(c => Math.hypot(c.a.x - tgt.x, c.a.z - tgt.z) < 4 || Math.hypot(c.b.x - tgt.x, c.b.z - tgt.z) < 4);
        const c = (near.length && n.fleeT <= 0 && rnd() < 0.45) ? pick(near) : null;
        if (c){
          const fromA = Math.hypot(c.a.x - tgt.x, c.a.z - tgt.z) < 4;
          n.cw = c; n.cwFrom = fromA ? c.a : c.b; n.cwTo = fromA ? c.b : c.a;
          n.cwBlock = c.blocks[fromA ? 1 : 0];
          n.state = 'toCurb';
        } else n.wp = (n.wp + (n.dir || 1) + 4) % 4;
      }
    } else if (n.state === 'toCurb'){
      if (pedStepTo(n, n.cwFrom.x, n.cwFrom.z, n.speed, dt)){ n.state = 'wait'; n.waitT = 0; }
    } else if (n.state === 'wait'){
      moving = false;
      n.waitT += dt;
      n.heading = angleDamp(n.heading, Math.atan2(n.cwTo.x - n.pos.x, n.cwTo.z - n.pos.y), 6, dt);
      if (pedCrossSafe(n.cw)) n.state = 'cross';
      else if (n.waitT > 30){ n.state = 'walk'; n.cw = null; n.wp = (n.wp + 1) % 4; }   // rezygnacja — idzie dalej swoim kwartałem
    } else if (n.state === 'cross'){
      /* auto tuż przed pieszym na jego drodze (np. wjechało na pasy) — pieszy przystaje, nie przechodzi przez nie */
      const wx = n.cwTo.x - n.pos.x, wz = n.cwTo.z - n.pos.y, wl = Math.hypot(wx, wz) || 1;
      const blockedBy = (x, z) => { const ox = x - n.pos.x, oz = z - n.pos.y, a = (ox*wx + oz*wz)/wl; return a > 0 && a < 3.2 && Math.abs(ox*wz - oz*wx)/wl < 2.3; };
      /* czeka tylko na pojazd w ruchu albo krótko (≤ 2 s) — przed stojącym (np. rowerem czekającym na niego) przechodzi dalej */
      if ((n.crossWaitT || 0) > 2) n.crossPass = true;                        // po 2 s przed stojącym — idzie do końca przejścia
      const stopIt = npcs.some(m => (m.speed > 0.5 || !n.crossPass) && blockedBy(m.pos.x, m.pos.y)) || blockedBy(chassisBody.position.x, chassisBody.position.z);
      n.crossWaitT = stopIt ? (n.crossWaitT || 0) + dt : 0;
      if (stopIt) moving = false;
      if (moving && pedStepTo(n, n.cwTo.x, n.cwTo.z, PED_CROSS * (run > 1 ? 1.8 : 1), dt)){
        /* po drugiej stronie: pętla nowego kwartału od najbliższego narożnika */
        n.block = n.cwBlock;
        n.path = pedLoopFor(n.block[0], n.block[1]);
        let best = 0, bd = 1e9;
        n.path.forEach((p, k) => { const d = Math.hypot(p.x - n.pos.x, p.z - n.pos.y); if (d < bd){ bd = d; best = k; } });
        n.wp = best; n.state = 'walk'; n.cw = null; n.dir = 1; n.crossPass = false; n.crossWaitT = 0;
        Pedestrians.crossings = (Pedestrians.crossings || 0) + 1;
      }
    }
    /* wysokość: zejście z krawężnika na jezdnię tylko między krawężnikami przejścia */
    let yT = WALK_H;
    if (n.state === 'cross'){
      const c = n.cw, across = c.road === 'ns' ? Math.abs(n.pos.x - L(c.i)) : Math.abs(n.pos.y - L(c.j));
      if (across < ROAD_H) yT = 0;
    }
    n.y = yT < n.y ? Math.max(yT, n.y - dt * 1.5) : Math.min(yT, n.y + dt * 1.5);
    n.body.position.set(n.pos.x, n.y + 0.85, n.pos.y);
    n.group.position.set(n.pos.x, n.y, n.pos.y);
    n.group.rotation.y = n.heading;

    if (moving){
      n.walkPhase += dt * (3.0 + (n.state === 'cross' ? PED_CROSS : n.speed) * 1.1 * run);
      const s = Math.sin(n.walkPhase), c = Math.sin(n.walkPhase + Math.PI);
      n.legL.rotation.x = s * 0.5; n.legR.rotation.x = c * 0.5;
      n.armL.rotation.x = c * 0.42; n.armR.rotation.x = s * 0.42;
    } else {
      n.legL.rotation.x = n.legR.rotation.x = n.armL.rotation.x = n.armR.rotation.x = 0;
    }
  }
}

/* strzał w (x,z): piesi w promieniu r uciekają biegiem 5–8 s, w stronę od strzelca (zawracają na pętli,
   przerywają czekanie przy przejściu) */
Pedestrians.scare = function(x, z, r){
  for (const n of this.list){
    if (n.state === 'down' || Math.hypot(n.pos.x - x, n.pos.y - z) > (r || 40)) continue;
    if (n.fleeT <= 0) this.fled++;
    n.fleeT = rand(5, 8);
    if (n.state === 'wait' || n.state === 'toCurb'){ n.state = 'walk'; n.cw = null; }
    if (n.state === 'walk'){
      const t = n.path[n.wp];
      if (Math.hypot(t.x - x, t.z - z) < Math.hypot(n.pos.x - x, n.pos.y - z)){ n.dir = -(n.dir || 1); n.wp = (n.wp + n.dir + 4) % 4; }
    }
  }
};
Pedestrians.hit = function(n, force, gentle){
  if (!n || n.state === 'down') return;
  n.state = 'down';
  n.stateT = gentle ? 3.5 : 5.5;
  n.cw = null;
  n.group.rotation.x = (rnd() < 0.5 ? 1 : -1) * Math.PI/2;
  n.body.position.set(n.pos.x, -50, n.pos.y);   // leżący pieszy nie zostawia niewidzialnej kolizji w miejscu, gdzie stał
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
