/* ---------------------------------------------------------------
   14e. KOTY — chodzą po chodnikach dookoła kwartałów (narożniki jak u pieszych, ±13.5 m od środka kwartału),
   przysiadają, machają ogonem, czasem przebiegają przez ulicę na sąsiedni kwartał (tylko gdy żadne auto NPC
   nie nadjeżdża; auto blisko w trakcie przebiegania — sprint). Wjechanie w kota autem gracza: auto wybucha,
   gracz ginie bez względu na nieśmiertelność, „JAK MOGŁEŚ?!”, odrodzenie w szpitalu.
   --------------------------------------------------------------- */
const CATS = [], CAT_COUNT = 16;
const CAT_COLS = [[0xd9822b, 0xf2f0ea], [0x1b1b1d, 0x1b1b1d], [0x8a8c8f, 0xd8d4cc], [0xf2f0ea, 0xd9822b], [0x8a6a48, 0x4a3a2c]];
const _catMat = new THREE.MeshLambertMaterial({ vertexColors: true });
function buildCat(col){
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d), c = col[0], c2 = col[1];
  const ear = new THREE.ConeGeometry(0.045, 0.09, 4);
  const g = new THREE.Group();
  const body = new THREE.Mesh(mergeColored([
    { geo: B(0.2, 0.18, 0.46), color: c, y: 0.25 }, { geo: B(0.16, 0.06, 0.3), color: c2, y: 0.17 },
    { geo: B(0.19, 0.17, 0.17), color: c, y: 0.37, z: 0.28 }, { geo: B(0.1, 0.07, 0.05), color: c2, y: 0.33, z: 0.37 },
    { geo: ear, color: c, x: 0.06, y: 0.48, z: 0.27 }, { geo: ear, color: c, x: -0.06, y: 0.48, z: 0.27 },
    { geo: B(0.03, 0.03, 0.01), color: 0x8fd16b, x: 0.05, y: 0.39, z: 0.367 }, { geo: B(0.03, 0.03, 0.01), color: 0x8fd16b, x: -0.05, y: 0.39, z: 0.367 },
    { geo: B(0.05, 0.17, 0.05), color: c, x: 0.07, y: 0.085, z: 0.16 }, { geo: B(0.05, 0.17, 0.05), color: c, x: -0.07, y: 0.085, z: 0.16 },
    { geo: B(0.05, 0.17, 0.05), color: c, x: 0.07, y: 0.085, z: -0.16 }, { geo: B(0.05, 0.17, 0.05), color: c, x: -0.07, y: 0.085, z: -0.16 }
  ]), _catMat);
  body.castShadow = true; g.add(body);
  const tail = new THREE.Group(); tail.position.set(0, 0.3, -0.22);
  tail.add(new THREE.Mesh(mergeColored([{ geo: B(0.04, 0.04, 0.3), color: c, z: -0.15 }]), _catMat));
  g.add(tail);
  scene.add(g);
  return { g: g, body: body, tail: tail };
}
const catCorner = (bi, bj, k) => { const cx = blockCenter(bi), cz = blockCenter(bj), s = [[1, 1], [-1, 1], [-1, -1], [1, -1]][k]; return { x: cx + s[0] * 13.5, z: cz + s[1] * 13.5, sx: s[0], sz: s[1] }; };
function spawnCat(i){
  const b = pedBlockCandidates[randInt(0, pedBlockCandidates.length - 1)], k = randInt(0, 3), p = catCorner(b.bi, b.bj, k);
  const m = buildCat(CAT_COLS[i % CAT_COLS.length]);
  const cat = { m: m, bi: b.bi, bj: b.bj, k: k, dir: rnd() < 0.5 ? 1 : -1, x: p.x, z: p.z, tx: p.x, tz: p.z, state: 'sit', t: rand(1, 4), sp: rand(0.8, 1.3), ph: rnd() * TAU, h: rnd() * TAU, dead: false };
  CATS.push(cat);
  return cat;
}
for (let i = 0; i < CAT_COUNT; i++) spawnCat(i);
function catNextTarget(c){
  /* na narożniku: przysiad, dalej po obwodzie kwartału albo przebiegnięcie przez ulicę na sąsiedni kwartał */
  const r = rnd(), here = catCorner(c.bi, c.bj, c.k);
  if (r < 0.25){ c.state = 'sit'; c.t = rand(2, 7); return; }
  if (r < 0.45){
    const alongX = rnd() < 0.5, nbi = c.bi + (alongX ? here.sx : 0), nbj = c.bj + (alongX ? 0 : here.sz);
    if (pedBlockSet.has(nbi + ',' + nbj)){
      const tx = alongX ? here.x + here.sx * 17 : here.x, tz = alongX ? here.z : here.z + here.sz * 17;
      const busy = npcs.some(n => Math.abs(n.y || 0) < 1 && Math.hypot(n.pos.x - (here.x + tx) / 2, n.pos.y - (here.z + tz) / 2) < 28);
      if (!busy){
        /* narożnik sąsiedniego kwartału naprzeciwko */
        const nk = [[1, 1], [-1, 1], [-1, -1], [1, -1]].findIndex(s => s[0] === (alongX ? -here.sx : here.sx) && s[1] === (alongX ? here.sz : -here.sz));
        c.bi = nbi; c.bj = nbj; c.k = nk; const q = catCorner(nbi, nbj, nk); c.tx = q.x; c.tz = q.z; c.state = 'cross'; return;
      }
    }
  }
  c.k = (c.k + c.dir + 4) % 4; const q = catCorner(c.bi, c.bj, c.k); c.tx = q.x; c.tz = q.z; c.state = 'walk';
}
const _catQ = new CANNON.Quaternion(), _catV = new CANNON.Vec3();
function updateCats(dt){
  const pp = playerWorldPos();
  const inCar = mode === 'car' && !activeCarGone, cv = chassisBody.velocity, carSp = Math.hypot(cv.x, cv.z);
  if (inCar) chassisBody.quaternion.conjugate(_catQ);
  for (const c of CATS){
    if (c.dead){ c.t -= dt; if (c.t <= 0){ const b = pedBlockCandidates[randInt(0, pedBlockCandidates.length - 1)], q = catCorner(b.bi, b.bj, 0); c.bi = b.bi; c.bj = b.bj; c.k = 0; c.x = c.tx = q.x; c.z = c.tz = q.z; c.dead = false; c.state = 'sit'; c.t = 3; c.m.g.visible = true; } continue; }
    const far = Math.hypot(c.x - pp.x, c.z - pp.z) > 260;
    if (c.state === 'sit'){ c.t -= dt; if (c.t <= 0) catNextTarget(c); }
    else {
      const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz);
      let sp = c.state === 'cross' ? 2.4 : c.sp;
      if (c.state === 'cross' && npcs.some(n => Math.hypot(n.pos.x - c.x, n.pos.y - c.z) < 9)) sp = 6.5;            // auto blisko — sprint
      if (d < 0.15){ c.x = c.tx; c.z = c.tz; catNextTarget(c); }
      else { const s = Math.min(d, sp * dt); c.x += dx / d * s; c.z += dz / d * s; c.h = angleDamp(c.h, Math.atan2(dx, dz), 8, dt); }
      c.ph += dt * sp * 7;
    }
    /* auto gracza najechało na kota */
    if (inCar && carSp > 1.2){
      const T = CAR_TYPES[carType], p = chassisBody.position;
      _catV.set(c.x - p.x, (c.state === 'cross' ? 0.2 : WALK_H + 0.2) - (p.y - T.restY), c.z - p.z); _catQ.vmult(_catV, _catV);
      if (Math.abs(_catV.x) < T.half[0] + 0.25 && Math.abs(_catV.z) < T.half[2] + 0.25 && Math.abs(_catV.y) < 1.2){ catTragedy(c); continue; }
    }
    if (far){ c.m.g.visible = false; continue; }
    c.m.g.visible = true;
    const onRoad = Math.abs(c.x - blockCenter(c.bi)) > 15.2 || Math.abs(c.z - blockCenter(c.bj)) > 15.2;
    const moving = c.state !== 'sit';
    c.m.g.position.set(c.x, (onRoad ? 0.02 : WALK_H) + (moving ? Math.abs(Math.sin(c.ph)) * 0.025 : 0), c.z);
    c.m.g.rotation.y = c.h;
    c.m.body.rotation.x = moving ? 0 : -0.25; c.m.body.position.y = moving ? 0 : -0.05;                 // siedzący: przód w górę
    c.m.tail.rotation.set(moving ? 0.5 : 1.1, Math.sin(clock * (moving ? 6 : 2.2) + c.ph) * 0.5, 0);
  }
}
function catTragedy(c){
  c.dead = true; c.t = 25; c.m.g.visible = false;
  hudToast('Jak mogłeś?! To był kot…', 4);
  destroyActiveCar('kot', 'JAK MOGŁEŚ?!');
}
