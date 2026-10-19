/* ---------------------------------------------------------------
   21. PĘTLA GŁÓWNA
   --------------------------------------------------------------- */
let clock = 0;
let last = performance.now();
const FIXED = 1 / 60;

function frame(now){
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;
  clock += dt;

  updateSky(dt);
  updateTrafficLights(dt);
  updateNpcs(dt);
  updateHighwayTraffic(dt);
  updatePedestrians(dt);
  const carState = updateCar(dt);
  if (mode === 'foot' && pointerLocked) updatePlayer(dt);
  else if (mode === 'foot') {
    /* pauza sterowania przy zwolnionym kursorze — postać wciąż stoi na fizyce */
    player.body.velocity.x = damp(player.body.velocity.x, 0, 10, dt);
    player.body.velocity.z = damp(player.body.velocity.z, 0, 10, dt);
  }
  Weapons.updatePose(dt);
  updateWheel();

  world.step(FIXED, dt, 3);

  if (mode === 'foot'){
    const b = player.body.position;
    player.mesh.position.set(b.x, b.y - 0.85, b.z);
  }
  syncCar();
  updateCamera(dt, carState.kmh);
  updateLampLights();
  updateHud(dt, carState.kmh);

  renderer.render(scene, camera);
}

/* ---------------------------------------------------------------
   22. START
   --------------------------------------------------------------- */
finalizeSigns();

/* jedna klatka "na sucho", żeby shadery skompilowały się przed startem */
renderer.compile(scene, camera);
syncCar();
updateSky(0);

goBtn.disabled = false;
goBtn.textContent = 'WEJDŹ DO MIASTA';
goBtn.focus();

requestAnimationFrame(frame);
