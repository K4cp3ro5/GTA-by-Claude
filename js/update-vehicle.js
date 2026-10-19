/* ---------------------------------------------------------------
   17. AKTUALIZACJA POJAZDU
   --------------------------------------------------------------- */
let steer = 0, engineRpm = 0, handbrakeOn = false, gearTxt = 'N';
const MAX_STEER = 0.52, MAX_FORCE = 5200, BRAKE_F = 62, HAND_F = 190;

const _fwdWorld = new CANNON.Vec3();
function updateCar(dt){
  const driving = (mode === 'car');
  const fwdWorld = _fwdWorld;
  chassisBody.quaternion.vmult(CAR_FWD, fwdWorld);
  const vel = chassisBody.velocity;
  const alongF = vel.x * fwdWorld.x + vel.z * fwdWorld.z;   // dodatnie = jazda przodem
  const spd = Math.hypot(vel.x, vel.z);
  const kmh = spd * 3.6;

  /* opór powietrza — ogranicza prędkość maksymalną */
  const drag = 1.15;
  chassisBody.force.x -= vel.x * spd * drag;
  chassisBody.force.z -= vel.z * spd * drag;

  if (driving){
    const throttle = (down('forward') || keys['ArrowUp']) ? 1 : 0;
    const reverse  = (down('back')    || keys['ArrowDown']) ? 1 : 0;
    handbrakeOn = down('jump');

    /* skręt z powrotem kół do centrum i mniejszym kątem przy prędkości */
    let want = 0;
    if (down('left')  || keys['ArrowLeft'])  want += 1;
    if (down('right') || keys['ArrowRight']) want -= 1;
    const speedFactor = 1 - clamp(kmh / 165, 0, 0.62);
    const rate = want !== 0 ? 4.4 : 7.5;
    steer = approach(steer, want * MAX_STEER * speedFactor, rate * dt);
    vehicle.setSteeringValue(steer, 0);
    vehicle.setSteeringValue(steer, 1);

    let force = 0, brake = 0;
    if (throttle){
      if (alongF < -0.6){ brake = BRAKE_F; }                       // hamowanie przy cofaniu
      else {
        const fade = 1 - clamp(kmh / 205, 0, 1);
        force = MAX_FORCE * (0.35 + fade * 0.65) * carSpeedMult;
      }
    } else if (reverse){
      if (alongF > 0.6){ brake = BRAKE_F; }                        // hamulec zasadniczy
      else force = -MAX_FORCE * 0.46 * carSpeedMult;
    } else {
      brake = 5;                                                   // hamowanie silnikiem
    }

    /* napęd na tył */
    vehicle.applyEngineForce(0, 0);
    vehicle.applyEngineForce(0, 1);
    vehicle.applyEngineForce(force, 2);
    vehicle.applyEngineForce(force, 3);

    for (let i = 0; i < 4; i++) vehicle.setBrake(brake, i);
    if (handbrakeOn){
      vehicle.setBrake(HAND_F, 2);
      vehicle.setBrake(HAND_F, 3);
      vehicle.applyEngineForce(0, 2);
      vehicle.applyEngineForce(0, 3);
      vehicle.wheelInfos[2].frictionSlip = 0.85;
      vehicle.wheelInfos[3].frictionSlip = 0.85;
    } else {
      vehicle.wheelInfos[2].frictionSlip = REAR_GRIP;
      vehicle.wheelInfos[3].frictionSlip = REAR_GRIP;
    }

    gearTxt = alongF < -0.8 ? 'R' : (spd < 0.4 ? 'N' : 'D');

    /* obroty silnika */
    const load = throttle || reverse ? 1 : 0;
    const tRpm = clamp(0.14 + (kmh % 62) / 62 * 0.55 + clamp(kmh/200,0,1) * 0.42 + load * 0.12, 0, 1);
    engineRpm = damp(engineRpm, tRpm, 7, dt);
    Sound.engine(true, engineRpm, load);

    /* światła stopu */
    const braking = (brake > 20) || handbrakeOn;
    carModel.tailMat.color.setRGB(braking ? 1.0 : 0.36, braking ? 0.18 : 0.08, braking ? 0.14 : 0.07);
  } else {
    for (let i = 0; i < 4; i++){ vehicle.applyEngineForce(0, i); vehicle.setBrake(24, i); }
    handbrakeOn = false;
    engineRpm = damp(engineRpm, 0, 3, dt);
    carModel.tailMat.color.setRGB(0.36, 0.08, 0.07);
  }

  /* wypadnięcie ze świata */
  if (chassisBody.position.y < -12){
    chassisBody.position.set(CAR_SPAWN.x, CAR_SPAWN.y, CAR_SPAWN.z);
    chassisBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), Math.PI);
    chassisBody.velocity.set(0,0,0);
    chassisBody.angularVelocity.set(0,0,0);
  }

  return { kmh: kmh, spd: spd, fwd: fwdWorld };
}

function syncCar(){
  carModel.root.position.copy(chassisBody.position);
  carModel.root.quaternion.copy(chassisBody.quaternion);
  for (let i = 0; i < 4; i++){
    vehicle.updateWheelTransform(i);
    const t = vehicle.wheelInfos[i].worldTransform;
    carModel.wheels[i].position.copy(t.position);
    carModel.wheels[i].quaternion.copy(t.quaternion);
  }
}
