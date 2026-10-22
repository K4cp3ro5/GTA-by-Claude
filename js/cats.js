/* ---------------------------------------------------------------
   14e. KOTY — trzy rodzaje:
   - 'walk': chodniki dookoła kwartałów (narożniki ±13.5 m od środka), przysiad, przebieganie przez ulicę na sąsiedni
     kwartał (tylko gdy żadne auto NPC nie nadjeżdża; auto blisko w trakcie — sprint);
   - 'roam': wędrówka po trawie pasa podmiejskiego (losowe cele poza budynkami, autostradami i parkiem);
   - 'park': spacer po alejkach parku rozrywki (graf zwiedzających z park.js).
   Spawn z dala od gracza (> 40 m), równomiernie po kwartałach; na minimapie i mapie — pomarańczowe kropki.
   Nakarmiony rybą (inventory.js): je, serduszka, potem chodzi za graczem ~90 s.
   Skrzywdzenie kota przez gracza (auto, kula, cios, wybuch): gracz wybucha i ginie bez względu na nieśmiertelność,
   „JAK MOGŁEŚ?!”, odrodzenie w szpitalu.
   --------------------------------------------------------------- */
const CATS = [];
let CAT_COUNT = 34;
const CAT_COLS = [[0xd9822b, 0xf2f0ea], [0x1b1b1d, 0x1b1b1d], [0x8a8c8f, 0xd8d4cc], [0xf2f0ea, 0xd9822b], [0x8a6a48, 0x4a3a2c], [0xe8c48a, 0xf2f0ea]];
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
  g.userData.catRef = null;
  scene.add(g);
  return { g: g, body: body, tail: tail };
}
const catCorner = (bi, bj, k) => { const cx = blockCenter(bi), cz = blockCenter(bj), s = [[1, 1], [-1, 1], [-1, -1], [1, -1]][k]; return { x: cx + s[0] * 13.5, z: cz + s[1] * 13.5, sx: s[0], sz: s[1] }; };
/* wolny punkt na trawie pasa podmiejskiego (poza budynkami, autostradami, lotniskami, parkiem) */
function catRoamSpot(){
  for (let t = 0; t < 40; t++){
    const side = randInt(0, 3), along = rand(-385, 385), depth = rand(CITY_EDGE + 8, WALL_X - 6);
    const x = side < 2 ? along : (side === 2 ? depth : -depth), z = side < 2 ? (side === 0 ? depth : -depth) : along;
    if (hwyQuery(x, z, 4).length || inRect({ x0: PARK.x0 - 4, x1: PARK.x1 + 4, z0: PARK.z0 - 4, z1: PARK.z1 + 4 }, x, z)) continue;
    if (x < -CITY_EDGE && Math.abs(z) < 190) continue;                                   // lotnisko miejskie
    if (z < -CITY_EDGE && Math.abs(x) < 175) continue;                                   // port
    if (buildings.some(b => Math.abs(x - b.x) < b.w / 2 + 3 && Math.abs(z - b.z) < b.d / 2 + 3)) continue;
    return { x: x, z: z };
  }
  return null;
}
function catPlace(c, kind){
  const pp = typeof playerWorldPos === 'function' ? playerWorldPos() : player.body.position;   // boats.js wczytuje się później
  c.kind = kind; c.state = 'sit'; c.t = rand(1, 5); c.dead = false; c.fedT = 0; c.eatT = 0;
  for (let t = 0; t < 30; t++){
    if (kind === 'walk'){
      const b = pedBlockCandidates[randInt(0, pedBlockCandidates.length - 1)], k = randInt(0, 3), p = catCorner(b.bi, b.bj, k);
      if (t < 25 && Math.hypot(p.x - pp.x, p.z - pp.z) < 40) continue;
      c.bi = b.bi; c.bj = b.bj; c.k = k; c.x = c.tx = p.x; c.z = c.tz = p.z; break;
    } else if (kind === 'roam'){
      const p = catRoamSpot(); if (!p || (t < 25 && Math.hypot(p.x - pp.x, p.z - pp.z) < 40)) continue;
      c.x = c.tx = p.x; c.z = c.tz = p.z; break;
    } else {
      if (typeof PARK_GRAPH === 'undefined' || !PARK_GRAPH){ if (typeof parkGraph === 'function') PARK_GRAPH = parkGraph(); }
      const ids = Object.keys(PARK_GRAPH), a = PARK_GRAPH[ids[randInt(0, ids.length - 1)]];
      c.from = a; c.to = PARK_GRAPH[a.nb[0]]; c.u = 0; c.x = c.tx = a.x; c.z = c.tz = a.z; break;
    }
  }
  c.m.g.visible = true;
}
function spawnCat(i){
  const m = buildCat(CAT_COLS[i % CAT_COLS.length]);
  const c = { m: m, i: i, dir: rnd() < 0.5 ? 1 : -1, x: 0, z: 0, tx: 0, tz: 0, sp: rand(0.8, 1.3), ph: rnd() * TAU, h: rnd() * TAU, dead: false };
  m.g.userData.catRef = c;
  catPlace(c, i % 6 === 4 ? 'roam' : i % 9 === 7 ? 'park' : 'walk');
  CATS.push(c);
  return c;
}
function setCatCount(n){
  CAT_COUNT = n;
  while (CATS.length > n){ const c = CATS.pop(); scene.remove(c.m.g); }
  while (CATS.length < n) spawnCat(CATS.length);
}
setCatCount(CAT_COUNT);
function catNextTarget(c){
  if (c.kind === 'roam'){                                                                // nowy cel na trawie w promieniu ~25 m
    if (rnd() < 0.35){ c.state = 'sit'; c.t = rand(3, 9); return; }
    for (let t = 0; t < 12; t++){
      const a = rnd() * TAU, r = rand(6, 25), x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (Math.abs(x) < CITY_EDGE + 6 && Math.abs(z) < CITY_EDGE + 6) continue;
      if (Math.abs(x) > WALL_X - 5 || Math.abs(z) > WALL_X - 5 || hwyQuery(x, z, 3).length) continue;
      if (buildings.some(b => Math.abs(x - b.x) < b.w / 2 + 2 && Math.abs(z - b.z) < b.d / 2 + 2)) continue;
      c.tx = x; c.tz = z; c.state = 'walk'; return;
    }
    c.state = 'sit'; c.t = 2; return;
  }
  if (c.kind === 'park'){
    const prev = c.from; c.from = c.to; const opts = c.from.nb.filter(id => PARK_GRAPH[id] !== prev);
    c.to = PARK_GRAPH[opts.length ? opts[randInt(0, opts.length - 1)] : c.from.nb[0]]; c.tx = c.to.x; c.tz = c.to.z;
    if (rnd() < 0.3){ c.state = 'sit'; c.t = rand(2, 6); } else c.state = 'walk';
    return;
  }
  /* chodnik: na narożniku przysiad, dalej po obwodzie kwartału albo przebiegnięcie przez ulicę */
  const r = rnd(), here = catCorner(c.bi, c.bj, c.k);
  if (r < 0.25){ c.state = 'sit'; c.t = rand(2, 7); return; }
  if (r < 0.45){
    const alongX = rnd() < 0.5, nbi = c.bi + (alongX ? here.sx : 0), nbj = c.bj + (alongX ? 0 : here.sz);
    if (pedBlockSet.has(nbi + ',' + nbj)){
      const tx = alongX ? here.x + here.sx * 17 : here.x, tz = alongX ? here.z : here.z + here.sz * 17;
      const busy = npcs.some(n => Math.abs(n.y || 0) < 1 && Math.hypot(n.pos.x - (here.x + tx) / 2, n.pos.y - (here.z + tz) / 2) < 28);
      if (!busy){
        const nk = [[1, 1], [-1, 1], [-1, -1], [1, -1]].findIndex(s => s[0] === (alongX ? -here.sx : here.sx) && s[1] === (alongX ? here.sz : -here.sz));
        c.bi = nbi; c.bj = nbj; c.k = nk; const q = catCorner(nbi, nbj, nk); c.tx = q.x; c.tz = q.z; c.state = 'cross'; return;
      }
    }
  }
  c.k = (c.k + c.dir + 4) % 4; const q = catCorner(c.bi, c.bj, c.k); c.tx = q.x; c.tz = q.z; c.state = 'walk';
}
function catGroundY(c){
  if (c.kind !== 'walk') return 0.02;
  return Math.abs(c.x - blockCenter(c.bi)) > 15.2 || Math.abs(c.z - blockCenter(c.bj)) > 15.2 ? 0.02 : WALK_H;
}
const _catQ = new CANNON.Quaternion(), _catV = new CANNON.Vec3();
function updateCats(dt){
  const pp = playerWorldPos();
  const inCar = mode === 'car' && !activeCarGone, cv = chassisBody.velocity, carSp = Math.hypot(cv.x, cv.z);
  if (inCar) chassisBody.quaternion.conjugate(_catQ);
  for (const c of CATS){
    if (c.dead){ c.t -= dt; if (c.t <= 0) catPlace(c, c.kind); continue; }
    const far = Math.hypot(c.x - pp.x, c.z - pp.z) > 260;
    const follow = c.fedT > clock && mode === 'foot' && !player.dead;
    if (c.eatT > 0){ c.eatT -= dt; c.state = 'sit'; }
    else if (follow){                                                                     // nakarmiony: idzie za graczem
      const px = player.body.position.x, pz = player.body.position.z, dx = px - c.x, dz = pz - c.z, d = Math.hypot(dx, dz);
      if (d > 2.2){ const s = Math.min(d - 2, (d > 8 ? 4.5 : 1.6) * dt); c.x += dx / d * s; c.z += dz / d * s; c.h = angleDamp(c.h, Math.atan2(dx, dz), 8, dt); c.state = 'walk'; c.ph += dt * 9; }
      else c.state = 'sit';
      if (rnd() < dt * 0.4) catHearts(c, 1);
    } else if (c.state === 'sit'){ c.t -= dt; if (c.t <= 0) catNextTarget(c); }
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
      _catV.set(c.x - p.x, catGroundY(c) + 0.2 - (p.y - T.restY), c.z - p.z); _catQ.vmult(_catV, _catV);
      if (Math.abs(_catV.x) < T.half[0] + 0.25 && Math.abs(_catV.z) < T.half[2] + 0.25 && Math.abs(_catV.y) < 1.2){ catHarmed(c, 'auto'); continue; }
    }
    if (far){ c.m.g.visible = false; continue; }
    c.m.g.visible = true;
    const moving = c.state !== 'sit';
    c.m.g.position.set(c.x, catGroundY(c) + (moving ? Math.abs(Math.sin(c.ph)) * 0.025 : 0), c.z);
    c.m.g.rotation.y = c.h;
    c.m.body.rotation.x = c.eatT > 0 ? 0.25 : moving ? 0 : -0.25; c.m.body.position.y = moving ? 0 : -0.05;          // siedzący: przód w górę; je: głowa w dół
    c.m.tail.rotation.set(moving ? 0.5 : 1.1, Math.sin(clock * (moving ? 6 : c.fedT > clock ? 9 : 2.2) + c.ph) * 0.5, 0);
  }
  updateHearts(dt);
}
/* kot skrzywdzony przez gracza: gracz wybucha i ginie (nieśmiertelność nie chroni) */
function catHarmed(c, how){
  if (c.dead) return;
  c.dead = true; c.t = 25; c.m.g.visible = false;
  if (player.dead) return;
  hudToast('Jak mogłeś?! To był kot…', 4);
  if (mode === 'car' && !activeCarGone){ destroyActiveCar('kot', 'JAK MOGŁEŚ?!'); return; }
  const p = playerWorldPos();
  killPlayer('JAK MOGŁEŚ?!');
  explodeAt(p.x, (p.y || 1) - 0.4, p.z, 1, { noCats: true, cause: 'kot' });
}
/* kot najbliżej punktu (karmienie) */
function catNear(x, z, r){ let best = null, bd = r; for (const c of CATS){ if (c.dead) continue; const d = Math.hypot(c.x - x, c.z - z); if (d < bd){ bd = d; best = c; } } return best; }
function catFeed(c){
  c.eatT = 3.2; c.fedT = clock + 3.2 + 90; c.state = 'sit';
  c.h = Math.atan2(player.body.position.x - c.x, player.body.position.z - c.z);
  catHearts(c, 9);
}
/* serduszka: płaskie kształty serca obracane do kamery, unoszą się i znikają */
const _heartGeo = (() => { const s = new THREE.Shape(); s.moveTo(0, -0.12); s.bezierCurveTo(-0.02, -0.06, -0.16, -0.02, -0.16, 0.06); s.bezierCurveTo(-0.16, 0.14, -0.06, 0.17, 0, 0.09);
  s.bezierCurveTo(0.06, 0.17, 0.16, 0.14, 0.16, 0.06); s.bezierCurveTo(0.16, -0.02, 0.02, -0.06, 0, -0.12); return new THREE.ShapeGeometry(s); })();
const hearts = [];
function catHearts(c, n){
  for (let k = 0; k < n; k++){
    const m = new THREE.Mesh(_heartGeo, new THREE.MeshBasicMaterial({ color: k % 3 ? 0xff4d6d : 0xff8fa3, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(c.x + rand(-0.3, 0.3), catGroundY(c) + 0.55, c.z + rand(-0.3, 0.3)); m.scale.setScalar(rand(0.8, 1.3)); scene.add(m);
    hearts.push({ m: m, t: -k * 0.18, vx: rand(-0.2, 0.2), vz: rand(-0.2, 0.2) });
  }
}
function updateHearts(dt){
  for (let i = hearts.length - 1; i >= 0; i--){
    const h = hearts[i]; h.t += dt;
    if (h.t < 0){ h.m.visible = false; continue; }
    h.m.visible = true;
    if (h.t > 1.8){ scene.remove(h.m); h.m.material.dispose(); hearts.splice(i, 1); continue; }
    h.m.position.x += h.vx * dt; h.m.position.z += h.vz * dt; h.m.position.y += dt * 0.9;
    h.m.quaternion.copy(camera.quaternion); h.m.material.opacity = 1 - h.t / 1.8;
  }
}
