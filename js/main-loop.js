/* ---------------------------------------------------------------
   21. PĘTLA GŁÓWNA
   --------------------------------------------------------------- */
let clock = 0;
let last = performance.now();
const FIXED = 1 / 60;

/* Fizyka w stałych krokach 1/60 s (akumulator), a obraz interpolowany między dwoma ostatnimi
   krokami (alpha = ułamek następnego kroku). Bez tego przy 75/120/144 Hz albo nierównych
   klatkach auto i kamera "skakały" (raz 0, raz 2 kroki fizyki na klatkę). */
let physAcc = 0;
function savePrev(b){
  if (b._hasPrev !== true){ b._p0 = new CANNON.Vec3(); b._q0 = new CANNON.Quaternion(); b._hasPrev = true; }
  b._p0.copy(b.position); b._q0.copy(b.quaternion);
}
/* teleport (kradzież, respawn, reset auta, debug) = brak interpolacji: poprzednia poza = bieżąca */
function noLerp(b){ if (b._hasPrev === true && Math.hypot(b._p0.x - b.position.x, b._p0.z - b.position.z) > 6) savePrev(b); }
function physicsStep(dt){
  physAcc += dt;
  let steps = 0;
  const t0 = performance.now();
  while (physAcc >= FIXED && steps < 2){
    savePrev(chassisBody); savePrev(player.body);
    for (const n of npcs) savePrev(n.body);
    world.step(FIXED);
    physAcc -= FIXED; steps++;
    if (performance.now() - t0 > FIXED * 1000) break;   // krok wolniejszy niż czas rzeczywisty: nie nadrabiamy (spirala spowolnienia)
  }
  if (physAcc > FIXED) physAcc = FIXED * 0.99;     // zaległość odrzucona — gra zwalnia zamiast się zacinać
  if (chassisBody._hasPrev !== true){ savePrev(chassisBody); savePrev(player.body); }
  noLerp(chassisBody); noLerp(player.body);
  for (const n of npcs) if (n.body._hasPrev === true) noLerp(n.body);
  return physAcc / FIXED;
}

function frame(now){
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;
  /* pauza: menu otwarte klawiszem Esc po starcie gry (debug menu nie zatrzymuje świata) — tylko render */
  if (gameStarted && !pointerLocked && !debugOpen){ renderer.render(scene, camera); return; }
  clock += dt;
  indBlinkOn = (clock * 1.4) % 1 < 0.5;

  updateSky(dt);
  updateTrafficLights(dt);
  updateNpcs(dt);
  updatePedestrians(dt);
  const carState = updateCar(dt);
  const planeKmh = mode === 'plane' ? updatePlane(dt) : 0;
  updatePlanesIdle(dt);
  const boatKmh = mode === 'boat' ? updateBoat(dt) : 0;
  updateBoatsIdle(dt);
  updateBirds(dt);
  const vehKmh = mode === 'plane' ? planeKmh : mode === 'boat' ? boatKmh : carState.kmh;
  if (mode === 'foot' && pointerLocked){ if (!(parachute.on && parachute.t > 0.7)) updatePlayer(dt); }   // pod otwartą czaszą steruje updateParachute
  else if (mode === 'foot') {
    /* pauza sterowania przy zwolnionym kursorze — postać wciąż stoi na fizyce */
    player.body.velocity.x = damp(player.body.velocity.x, 0, 10, dt);
    player.body.velocity.z = damp(player.body.velocity.z, 0, 10, dt);
  }
  updateParachute(dt);                         // po updatePlayer: nadpisuje prędkość i obrót postaci pod czaszą
  Weapons.updatePose(dt);
  updateWheel();
  pruneParked();

  const alpha = physicsStep(dt);
  updateWaterHazards(dt);
  navUpdate(dt);
  updateSea(dt);

  if (mode === 'foot'){
    const b = player.body;
    player.mesh.position.set(lerp(b._p0.x, b.position.x, alpha), lerp(b._p0.y, b.position.y, alpha) - 0.85, lerp(b._p0.z, b.position.z, alpha));
    syncParachute();
  }
  for (const n of npcs){                       // auta NPC: model między dwoma ostatnimi krokami fizyki
    const b = n.body;
    if (b._hasPrev === true) n.mesh.position.set(lerp(b._p0.x, b.position.x, alpha), n.y || 0, lerp(b._p0.z, b.position.z, alpha));
  }
  syncCar(alpha);
  updateCamera(dt, vehKmh);
  applyCamShake(dt);
  updateLampLights();
  updateHud(dt, vehKmh);

  renderer.render(scene, camera);
}

/* ---------------------------------------------------------------
   22. START
   --------------------------------------------------------------- */
finalizeSigns();

/* jedna klatka "na sucho", żeby shadery skompilowały się przed startem */
renderer.compile(scene, camera);
savePrev(chassisBody); savePrev(player.body);
syncCar(1);
updateSky(0);

goBtn.disabled = false;
goBtn.textContent = 'WEJDŹ DO MIASTA';
goBtn.focus();
if (typeof LOADER !== 'undefined') LOADER.finish();

requestAnimationFrame(frame);
