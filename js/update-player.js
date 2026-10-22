/* ---------------------------------------------------------------
   16. AKTUALIZACJA PIESZEGO
   --------------------------------------------------------------- */
const moveDir = new THREE.Vector3();
function updatePlayer(dt){
  const b = player.body;
  const wasGrounded = player.grounded;
  player.grounded = checkGrounded();

  if (!player.grounded){
    player.airTime += dt;
    if (-b.velocity.y > player.fallSpeed) player.fallSpeed = -b.velocity.y;
  } else {
    if (!wasGrounded && player.fallSpeed > 11){
      damagePlayer(clamp((player.fallSpeed - 11) * 6.5, 0, 85), 'upadek');
    }
    player.airTime = 0;
    player.fallSpeed = 0;
  }

  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
  const rx =  Math.cos(camYaw), rz = -Math.sin(camYaw);
  let ix = 0, iz = 0;
  if (!player.dead){
    if (down('forward') || keys['ArrowUp'])    iz += 1;
    if (down('back')    || keys['ArrowDown'])  iz -= 1;
    if (down('right')   || keys['ArrowRight']) ix += 1;
    if (down('left')    || keys['ArrowLeft'])  ix -= 1;
  }

  moveDir.set(fx * iz + rx * ix, 0, fz * iz + rz * ix);
  const has = moveDir.lengthSq() > 0.0001;
  if (has) moveDir.normalize();

  const wantSprint = down('sprint') || !!(keys['ShiftLeft'] || keys['ShiftRight']);
  const running = wantSprint && has && player.stamina > 0.5 && !Weapons.ads;
  const maxSpd = (running ? 8.2 : 4.3) * (Weapons.ads ? 0.62 : 1);                // przycelowanie (PPM): wolniejszy chód
  const accel = (player.grounded ? 30 : 7) * dt;

  const tx = has ? moveDir.x * maxSpd : 0;
  const tz = has ? moveDir.z * maxSpd : 0;
  b.velocity.x = approach(b.velocity.x, tx, accel);
  b.velocity.z = approach(b.velocity.z, tz, accel);

  /* kondycja: zużywana biegiem, regeneruje się w marszu / bezruchu */
  if (running) player.stamina = clamp(player.stamina - dt * 15, 0, 100);
  else         player.stamina = clamp(player.stamina + dt * (has ? 6 : 11), 0, 100);

  if (!player.dead && down('jump') && player.grounded && player.airTime < 0.001){
    b.velocity.y = 7.6;
    player.grounded = false;
    player.airTime = 0.02;
    Sound.step(true);
  }

  /* obrót modelu w stronę ruchu */
  if (has) player.facing = angleDamp(player.facing, Math.atan2(moveDir.x, moveDir.z), 14, dt);

  const hv = Math.hypot(b.velocity.x, b.velocity.z);
  player.speed = hv;

  player.mesh.rotation.y = player.facing;

  /* animacja chodu / biegu */
  const moving = hv > 0.35 && player.grounded;
  const prevPhase = player.walkPhase;
  if (moving) player.walkPhase += dt * (3.0 + hv * 1.15);
  else        player.walkPhase = damp(player.walkPhase % TAU, 0, 8, dt);

  const amp = clamp(hv / 8.2, 0, 1) * (Weapons.armed() ? 0.55 : 1);
  const legAmp = 0.28 + amp * 0.62;
  const armAmp = 0.22 + amp * 0.58;
  const s = Math.sin(player.walkPhase);
  const c = Math.sin(player.walkPhase + Math.PI);

  if (player.grounded){
    player.legL.rotation.x =  s * legAmp;
    player.legR.rotation.x =  c * legAmp;
    player.armL.rotation.x =  c * armAmp;
    if (!Weapons.armed()) player.armR.rotation.x = s * armAmp;
    player.armL.rotation.z = -0.07;
    if (!Weapons.armed()) player.armR.rotation.z = 0.07;
  } else {
    player.legL.rotation.x = damp(player.legL.rotation.x, -0.55, 9, dt);
    player.legR.rotation.x = damp(player.legR.rotation.x,  0.30, 9, dt);
    player.armL.rotation.x = damp(player.armL.rotation.x, -1.30, 9, dt);
    if (!Weapons.armed()) player.armR.rotation.x = damp(player.armR.rotation.x, -1.30, 9, dt);
  }
  /* lekkie kołysanie torsu */
  player.mesh.rotation.z = Math.sin(player.walkPhase * 2) * 0.012 * amp;

  /* kroki — na przejściu fazy przez wielokrotność PI */
  if (moving){
    const a = Math.floor(prevPhase / Math.PI), bb = Math.floor(player.walkPhase / Math.PI);
    if (bb > a) Sound.step(running);
  }

  /* wypadnięcie ze świata */
  if (b.position.y < -12){
    b.position.set(SPAWN.x, SPAWN.y, SPAWN.z);
    b.velocity.set(0,0,0);
    player.fallSpeed = 0;
  }

  player.hurtFlash = Math.max(0, player.hurtFlash - dt * 1.8);
}

function damagePlayer(amount, cause){
  if (player.dead || amount <= 0 || godMode) return;
  player.health = clamp(player.health - amount, 0, 100);
  player.hurtFlash = 1;
  Sound.hurt();
  if (player.health <= 0 && !player.dead){
    player.dead = true;
    if (mode === 'car') Weapons.holster();
    setTimeout(respawnPlayer, 1200);
  }
}

function respawnPlayer(){
  if (mode === 'ride') rideEnd(curRide, true);
  if (mode === 'plane') exitPlane(true);
  if (mode === 'boat') exitBoat(true);
  if (mode === 'car'){
    mode = 'foot';
    player.mesh.visible = true;
    addBody(player.body);
    chassisBody.velocity.scale(0.05, chassisBody.velocity);
    for (let i = 0; i < 4; i++){ vehicle.applyEngineForce(0, i); vehicle.setBrake(160, i); }
    Sound.engine(false, 0, 0);
  }
  endParachute();
  player.mesh.visible = true;
  /* odrodzenie przed szpitalem (plac przed wejściem), twarzą do miasta */
  player.body.position.set(HOSPITAL_SPAWN.x, 1.2, HOSPITAL_SPAWN.z);
  player.facing = HOSPITAL_SPAWN.facing; camYaw = HOSPITAL_SPAWN.facing + Math.PI; camPitch = -0.12;
  player.body.velocity.set(0, 0, 0);
  player.body.wakeUp();
  player.fallSpeed = 0;
  player.health = 100;
  player.stamina = 100;
  player.dead = false; player.deathMsg = null;
  hudToast('Szpital — wypisano cię po leczeniu', 3);
}
