/* ---------------------------------------------------------------
   14d. ZNISZCZENIA — wybuchy, zdrowie pojazdów, wraki, rakiety RPG.
   - explodeAt(x, y, z, power): kula ognia, odłamki, dym (bez nowych świateł — bez przekompilowania shaderów),
     huk i wstrząs wg odległości; obrażenia w promieniu: gracz, piesi, auta NPC, atrapy, prowadzalne auto,
     samoloty na ziemi; wybuchy łańcuchowe przez kolejkę (bez rekurencji).
   - Zdrowie: auto gracza `carHp` (kraksy w sound.js, kule, wybuchy), auta NPC `n.hp` (zderzenia z graczem,
     kule), atrapy `p.hp`. Zero = wybuch i wrak (atrapa owner 'wreck': spalony model, kolizja, dym i ogień,
     znika po 2 min, gdy gracz daleko). Zniszczone auto GRACZA (owner 'player') blokuje swój typ w menu V
     na 60 s (`carDestroyedUntil`).
   - Prowadzalne auto zniszczone: wrak w jego miejscu, ciało poza światem (`activeCarGone`) do czasu
     następnego przejęcia (takeOver); kierowca ginie (z nieśmiertelnością — wyrzucony obok).
   - Rakiety: lot 70 m/s z dymem, trafienie (świat, auta, samoloty, piesi, woda) albo 320 m = wybuch.
   --------------------------------------------------------------- */
const CAR_HP_MAX = 100;
let carHp = CAR_HP_MAX;
const carDestroyedUntil = {};                                    // typ -> clock, do kiedy zablokowany w menu V
const _boomQueue = [], rockets = [], wreckFx = [];
function carTypeBlocked(type){ return Math.max(0, (carDestroyedUntil[type] || 0) - clock); }

/* --- wybuch --- */
function explodeAt(x, y, z, power, opts){
  power = power || 1; opts = opts || {};
  const at = new THREE.Vector3(x, y, z), big = power;
  fxAdd({ kind: 'ball', m: fxMesh(0xffe08a, 0.95, true), t: 0, life: 0.3, at: at.clone(), r0: 0.8 * big, r1: 5.5 * big });
  fxAdd({ kind: 'ball', m: fxMesh(0xff7a1a, 0.95, false), t: 0, life: 1.3, at: at.clone(), r0: 1.5 * big, r1: 8 * big, smoke: true });
  for (let k = 0; k < 6; k++) fxAdd({ kind: 'ball', m: fxMesh([0xffa52a, 0xe0461a, 0xffc94a][k % 3], 0.95, false), t: -k * 0.06, life: rand(0.9, 1.4), r0: big, r1: rand(3, 6) * big, smoke: true,
    at: at.clone().add(new THREE.Vector3(rand(-2.5, 2.5), rand(0, 2.5), rand(-2.5, 2.5)).multiplyScalar(big)) });
  const gh = rayHit(x, y + 1.5, z, x, y - 30, z, G_WORLD), gy = gh ? gh.hitPointWorld.y : Math.min(y, 0);
  for (let k = 0; k < (opts.debris === false ? 0 : 7); k++){
    const m = new THREE.Mesh(_fxBox, new THREE.MeshLambertMaterial({ color: opts.debrisCol && k % 2 ? opts.debrisCol : 0x2b2724 }));
    m.scale.set(rand(0.15, 0.6), rand(0.08, 0.25), rand(0.15, 0.8)); m.position.copy(at); m.castShadow = true; scene.add(m);
    const a = rand(0, TAU), sp = rand(5, 14);
    fxAdd({ kind: 'debris', m: m, t: 0, life: 9, v: new THREE.Vector3(Math.cos(a) * sp, rand(5, 13), Math.sin(a) * sp), w: new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)), gy: gy });
  }
  const cam = camera.position, dist = Math.hypot(cam.x - x, cam.y - y, cam.z - z);
  Sound.boom(clamp(1 - dist / 500, 0.12, 1) * clamp(0.5 + power * 0.4, 0.5, 1));
  camShake = Math.max(camShake, clamp(1.1 - dist / 70, 0, 1.1) * power);
  /* obrażenia */
  const R = 9 * power, Rk = 4.2 * power;
  if (mode === 'foot' && !player.dead){
    const pb = player.body.position, d = Math.hypot(pb.x - x, pb.y - 0.9 - y, pb.z - z);
    if (d < R){
      damagePlayer(d < Rk ? 200 : 90 * (1 - d / R), opts.cause || 'wybuch');
      const k = 14 * (1 - d / R) / (d || 1); player.body.velocity.x += (pb.x - x) * k; player.body.velocity.z += (pb.z - z) * k; player.body.velocity.y += 7 * (1 - d / R);
    }
  }
  for (const n of Pedestrians.list){ if (n.state !== 'down' && Math.hypot(n.pos.x - x, n.pos.y - z) < R * 0.75) Pedestrians.hit(n, 100); }
  if (Pedestrians.scare) Pedestrians.scare(x, z, 60);
  if (typeof npcPanicAt === 'function') npcPanicAt(x, z);
  for (const n of npcs.slice()){
    if (Math.abs((n.y || 0) - y) > 6) continue;
    const d = Math.hypot(n.pos.x - x, n.pos.y - z);
    if (d < Rk + 1) _boomQueue.push(() => destroyNpcCar(n));
    else if (d < R){ n.hp = (n.hp === undefined ? 100 : n.hp) - 70 * (1 - d / R); if (n.hp <= 0) _boomQueue.push(() => destroyNpcCar(n)); else npcHitByPlayer(n, 6); }
  }
  for (const p of parkedCars.slice()){
    if (p.owner === 'wreck' || Math.abs(p.y - y) > 6) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < Rk + 1) _boomQueue.push(() => destroyParked(p));
    else if (d < R){ p.hp = (p.hp === undefined ? 100 : p.hp) - 70 * (1 - d / R); if (p.hp <= 0) _boomQueue.push(() => destroyParked(p)); }
  }
  if (!activeCarGone){
    const c = chassisBody.position, d = Math.hypot(c.x - x, c.y - y, c.z - z);
    if (d < R && !opts.self){
      carHp -= d < Rk + 1 ? 999 : 70 * (1 - d / R);
      const k = 3500 * (1 - d / R) / (d || 1); chassisBody.velocity.x += (c.x - x) * k / CAR_TYPES[carType].mass; chassisBody.velocity.z += (c.z - z) * k / CAR_TYPES[carType].mass; chassisBody.velocity.y += 4 * (1 - d / R);
      if (carHp <= 0) _boomQueue.push(() => destroyActiveCar('wybuch'));
    }
  }
  for (const p of planes){ if (!(p.wreckT > 0) && !p.wreck && p !== curPlane && Math.hypot(p.pos.x - x, p.pos.y - y, p.pos.z - z) < 6 * power) _boomQueue.push(() => planeCrash(p)); }
  for (const a of airPlanes.slice()){ if (Math.hypot(a.pos.x - x, a.pos.y - y, a.pos.z - z) < 9 * power) _boomQueue.push(() => destroyAirPlane(a)); }
  /* koty w zasięgu: skrzywdzone przez gracza (cats.js) */
  if (!opts.noCats && typeof CATS !== 'undefined') for (const c of CATS){ if (!c.dead && Math.hypot(c.x - x, c.z - z) < R * 0.7) _boomQueue.push(() => catHarmed(c, 'wybuch')); }
}
/* samolot NPC trafiony: duża kula ognia w powietrzu i odłamki, samolot znika, wraca po 40 s */
function destroyAirPlane(a){
  if (airPlanes.indexOf(a) < 0) return;
  const p = a.pos;
  explodeAt(p.x, p.y, p.z, 1.8, { debrisCol: 0xe9eaec, noCats: true });
  removeAirPlane(a);
  hudToast('Samolot zestrzelony', 2.5);
  setTimeout(() => setAirCount(AIR_COUNT), 40000);
}
/* wrak w miejscu auta: atrapa owner 'wreck' (spalony model, kolizja), dym i ogień */
function addWreck(type, color, x, yGround, z, heading){
  if (type === 'bike') return null;
  const p = addParked('wreck', type, color, x, yGround, z, heading);
  p.mesh.mats.forEach(m => { if (m.color) m.color.setHex(0x2a2522); if (m.emissive) m.emissive.setHex(0); if (m.map) m.map = null; if (m.specular) m.specular.setHex(0x111111); m.needsUpdate = true; });
  p.mesh.root.rotation.z = rand(-0.06, 0.06);
  wreckFx.push({ p: p, t: 0, smoke: 0, fire: 0 });
  return p;
}
function destroyNpcCar(n){
  if (npcs.indexOf(n) < 0) return;
  const x = n.pos.x, z = n.pos.y, y = n.y || 0;
  explodeAt(x, y + 0.8, z, 1, { debrisCol: n.color });
  removeNpcCar(n);
  addWreck(n.type || 'sedan', n.color, x, y, z, n.heading + Math.PI);
  setTimeout(() => { if (npcs.length < 220) spawnRandomNpcCar(); }, 4000);                 // ruch się uzupełnia
}
function destroyParked(p){
  if (parkedCars.indexOf(p) < 0 || p.owner === 'wreck') return;
  explodeAt(p.x, p.y + 0.8, p.z, 1, { debrisCol: p.color });
  if (p.owner === 'player'){ carDestroyedUntil[p.type] = clock + 60; hudToast('Twój pojazd zniszczony — ' + CAR_TYPES[p.type].name + ' dostępny za 60 s (menu V)', 3.5); }
  removeParked(p);
  addWreck(p.type, p.color, p.x, p.y, p.z, p.heading);
}
/* prowadzalne auto: wrak w jego miejscu, ciało poza światem; kierowca ginie (z nieśmiertelnością — obok wraku) */
function destroyActiveCar(cause, forceKill){
  if (activeCarGone) return;
  const T = CAR_TYPES[carType], p = chassisBody.position, x = p.x, z = p.z, yg = p.y - T.restY, h = carYaw(), inside = mode === 'car';
  explodeAt(x, yg + 0.9, z, 1.1, { self: true, debrisCol: driving.color });
  if (driving.owner === 'player'){ carDestroyedUntil[carType] = clock + 60; if (!inside) hudToast('Twój pojazd zniszczony — dostępny za 60 s (menu V)', 3.5); }
  addWreck(carType, driving.color, x, yg, z, h);
  removeActiveCar();
  if (inside){
    mode = 'foot'; player.mesh.visible = true;
    const s = safeSpot(x, z, 3, 20) || { x: x + 3, y: yg, z: z };
    player.body.position.set(s.x, s.y + 1.2, s.z); player.body.velocity.set(0, 0, 0); player.body.wakeUp(); addBody(player.body);
    player.fallSpeed = 0; Sound.engine(false, 0, 0); Sound.horn(false);
    if (forceKill) killPlayer(forceKill);
    else if (godMode) hudToast('Auto wybuchło — przeżyłeś dzięki nieśmiertelności', 3);
    else { damagePlayer(1000, cause || 'wybuch'); hudToast('Auto wybuchło', 3); }
  }
}
function removeActiveCar(){
  activeCarGone = true;
  delBody(chassisBody);
  chassisBody.position.set(9000, -300, 9000); chassisBody.velocity.set(0, 0, 0); chassisBody.angularVelocity.set(0, 0, 0);
  carModel.root.visible = false;
  setDriving('none', carType, driving.color);
}
/* śmierć bez względu na nieśmiertelność (koty) — komunikat na ekranie śmierci */
function killPlayer(msg){
  if (player.dead) return;
  player.health = 0; player.dead = true; player.deathMsg = msg; player.deathCause = 'kot'; player.hurtFlash = 1;
  Sound.hurt();
  player.respawnAt = performance.now() + RESPAWN_MS + 600;
  setTimeout(respawnPlayer, RESPAWN_MS + 600);
}
/* trafienie pojazdu kulą (weapons.js): body — ciało trafione promieniem */
function vehicleBulletHit(body, dmg){
  const k = 0.35;
  if (body.npcRef){ const n = body.npcRef; n.hp = (n.hp === undefined ? 100 : n.hp) - dmg * k; if (n.hp <= 0) destroyNpcCar(n); else if ((n.shotHits = (n.shotHits || 0) + 1) >= 2) npcHitByPlayer(n, 6); return true; }
  if (body === chassisBody && !activeCarGone){ carHp -= dmg * k; if (carHp <= 0) destroyActiveCar('strzał'); return true; }
  const p = parkedCars.find(q => q.body === body);
  if (p && p.owner !== 'wreck'){ p.hp = (p.hp === undefined ? 100 : p.hp) - dmg * k; if (p.hp <= 0) destroyParked(p); return true; }
  return false;
}
/* kraksa auta gracza (sound.js): obrażenia od prędkości uderzenia ponad CAR_CRASH_V0 (50 km/h), w oknie 0.4 s liczy się tylko przyrost
   najmocniejszego uderzenia (prev). Uderzenie 72 km/h ≈ −16, 108 km/h ≈ −42, wybuch od jednego uderzenia dopiero ~200 km/h. */
const CAR_CRASH_V0 = 14, CAR_CRASH_K = 2.6;
function carCrashDamage(v, prev){
  if (activeCarGone || v < CAR_CRASH_V0) return;
  carHp -= (v - Math.max(CAR_CRASH_V0, prev || 0)) * CAR_CRASH_K;
  if (carHp <= 0) destroyActiveCar('kraksa');
}

/* --- rakiety RPG --- */
const _rkGeo = (() => { const g = new THREE.CylinderGeometry(0.06, 0.06, 0.7, 8); g.rotateX(Math.PI / 2); return g; })();
const _rkMat = new THREE.MeshLambertMaterial({ color: 0x4a5a3a });
function fireRocket(from, dir, target){
  const m = new THREE.Mesh(_rkGeo, _rkMat); m.position.copy(from); m.lookAt(from.x + dir.x, from.y + dir.y, from.z + dir.z); scene.add(m);
  const flame = fxMesh(0xffb040, 0.95, true); flame.visible = true; flame.scale.setScalar(0.18); m.add(flame); flame.position.set(0, 0, -0.45);
  rockets.push({ m: m, p: from.clone(), d: dir.clone().normalize(), dist: 0, smoke: 0, v: 55, target: target || null });
}
const _rkRay = new THREE.Raycaster(), _rkA = new THREE.Vector3();
function updateRockets(dt){
  for (let i = rockets.length - 1; i >= 0; i--){
    const r = rockets[i];
    r.v = Math.min(r.target ? 150 : 120, r.v + 90 * dt);                                  // przyspiesza: start 55 m/s, naprowadzana do 150 m/s
    const step = r.v * dt;
    /* naprowadzanie: kierunek obracany do celu (maks. 2.6 rad/s, szybciej blisko celu), zapalnik zbliżeniowy 2.5 m (+ droga w klatce) */
    if (r.target){
      const tp = lockTargetPos(r.target);
      if (!tp) r.target = null;
      else {
        _rkA.set(tp.x - r.p.x, tp.y - r.p.y, tp.z - r.p.z); const dd = _rkA.length();
        if (dd < 2.5 + step * 0.5){ scene.remove(r.m); rockets.splice(i, 1); explodeAt(r.p.x, r.p.y, r.p.z, 1.15, { cause: 'rakieta' }); continue; }
        _rkA.divideScalar(dd); const ang = Math.acos(clamp(r.d.dot(_rkA), -1, 1)), mx = (dd < 60 ? 4.5 : 2.6) * dt;
        if (ang > 1e-4){ r.d.lerp(_rkA, Math.min(1, mx / ang)).normalize(); r.m.lookAt(r.p.x + r.d.x, r.p.y + r.d.y, r.p.z + r.d.z); }
      }
    }
    _rkA.copy(r.p).addScaledVector(r.d, step);
    let hit = null, hd = step;
    const h = rayHit(r.p.x, r.p.y, r.p.z, _rkA.x, _rkA.y, _rkA.z, G_WORLD | G_CAR | G_PLANE);
    if (h && h.distance < hd){ hd = h.distance; hit = h.hitPointWorld; }
    _rkRay.set(r.p, r.d); _rkRay.far = hd;
    const ph = _rkRay.intersectObjects(Pedestrians.meshes(), true);
    if (ph.length){ hd = ph[0].distance; hit = ph[0].point; }
    if (!hit && _rkA.y < WATER_Y && !isLand(_rkA.x, _rkA.z)){ hit = _rkA.clone(); hit.y = WATER_Y; }
    r.dist += step;
    if (hit || r.dist > 1200){
      const at = hit ? new THREE.Vector3(hit.x, hit.y, hit.z).addScaledVector(r.d, -0.3) : _rkA;
      scene.remove(r.m); rockets.splice(i, 1);
      explodeAt(at.x, at.y, at.z, 1.15, { cause: 'rakieta' });
      continue;
    }
    r.p.copy(_rkA); r.m.position.copy(r.p);
    r.smoke -= dt;
    if (r.smoke <= 0){ r.smoke = 0.03; const s = fxMesh(0xb8b4ac, 0.5, false); s.position.copy(r.p).addScaledVector(r.d, -0.5); fxAdd({ kind: 'smoke', m: s, t: 0, life: 1.6, rise: 0.6, r0: 0.25 }); }
  }
}
/* cele namierzania (RPG naprowadzane): auta NPC, piesi, samoloty NPC i na lotniskach, łodzie NPC — pozycja albo null, gdy cel zniknął */
function lockTargets(){
  const T = [];
  for (const n of npcs) T.push({ kind: 'npc', o: n });
  for (const a of airPlanes) T.push({ kind: 'air', o: a });
  for (const b of boats) if (b.npc) T.push({ kind: 'boat', o: b });
  for (const q of Pedestrians.list) if (q.state !== 'down') T.push({ kind: 'ped', o: q });
  for (const p of planes) if (!p.wreck && !(p.wreckT > 0) && p !== curPlane) T.push({ kind: 'plane', o: p });
  return T;
}
const _ltp = { x: 0, y: 0, z: 0 };
function lockTargetPos(t){
  const o = t.o;
  if (t.kind === 'npc'){ if (npcs.indexOf(o) < 0) return null; _ltp.x = o.pos.x; _ltp.y = (o.y || 0) + 0.8; _ltp.z = o.pos.y; }
  else if (t.kind === 'air'){ if (airPlanes.indexOf(o) < 0) return null; _ltp.x = o.pos.x; _ltp.y = o.pos.y; _ltp.z = o.pos.z; }
  else if (t.kind === 'boat'){ if (boats.indexOf(o) < 0) return null; _ltp.x = o.pos.x; _ltp.y = WATER_Y + 0.8; _ltp.z = o.pos.z; }
  else if (t.kind === 'ped'){ if (o.state === 'down' || Pedestrians.list.indexOf(o) < 0) return null; _ltp.x = o.pos.x; _ltp.y = (o.y || 0) + 1.1; _ltp.z = o.pos.y; }
  else { if (o.wreck || o.wreckT > 0) return null; _ltp.x = o.pos.x; _ltp.y = o.pos.y; _ltp.z = o.pos.z; }
  return _ltp;
}
/* co klatkę: kolejka wybuchów łańcuchowych, rakiety, dym i ogień wraków, sprzątanie starych wraków */
function updateDestruction(dt){
  for (let k = 0; k < 3 && _boomQueue.length; k++) _boomQueue.shift()();
  updateRockets(dt);
  const pp = playerWorldPos();
  for (let i = wreckFx.length - 1; i >= 0; i--){
    const w = wreckFx[i], p = w.p;
    if (parkedCars.indexOf(p) < 0){ wreckFx.splice(i, 1); continue; }
    w.t += dt; w.smoke -= dt; w.fire -= dt;
    if (w.t < 40 && w.smoke <= 0){ w.smoke = w.t < 15 ? 0.22 : 0.5; const s = fxMesh(w.t < 15 ? 0x2b2b2d : 0x55575a, 0.4, false); s.position.set(p.x + rand(-0.8, 0.8), p.y + 1.3, p.z + rand(-0.8, 0.8)); fxAdd({ kind: 'smoke', m: s, t: 0, life: rand(3, 4.5), rise: rand(2.5, 4), r0: rand(0.6, 1.0) }); }
    if (w.t < 15 && w.fire <= 0){ w.fire = 0.14; const f = fxMesh(Math.random() < 0.5 ? 0xff7a1a : 0xffb030, 0.85, true); f.position.set(p.x + rand(-1, 1), p.y + rand(0.6, 1.4), p.z + rand(-1, 1)); fxAdd({ kind: 'flame', m: f, t: 0, life: 0.5, r: rand(0.5, 0.9) }); }
    if (w.t > 120 && Math.hypot(p.x - pp.x, p.z - pp.z) > 80){ removeParked(p); wreckFx.splice(i, 1); }
  }
}
