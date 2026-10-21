/* ---------------------------------------------------------------
   17. AKTUALIZACJA POJAZDU
   --------------------------------------------------------------- */
let steer = 0, steerRaw = 0, engineRpm = 0, handbrakeOn = false, gearTxt = 'N';
/* kierunkowskazy gracza: 'L' | 'R' | null; gasną same, gdy po skręcie w tę stronę kierownica wróci do środka */
let playerInd = null, _indTurned = false, _indPrev = false;
function togglePlayerInd(side){ playerInd = playerInd === side ? null : side; _indTurned = false; }
/* opór powietrza i stabilizacja odchylenia — co KROK fizyki (preStep), nie co klatkę:
   siła dodana w klatce bez kroku sumowała się z następną i prędkość "pulsowała" */
world.addEventListener('preStep', () => {
  const v = chassisBody.velocity, spd = Math.hypot(v.x, v.z), drag = CAR_TYPES[carType].drag;
  chassisBody.force.x -= v.x * spd * drag;
  chassisBody.force.z -= v.z * spd * drag;
  /* tłumienie obrotu wokół osi pionowej bez skrętu (mniej "pływania" tyłu po puszczeniu kierownicy), nie przy ręcznym */
  if (!handbrakeOn && Math.abs(steer) < 0.05) chassisBody.angularVelocity.y *= 0.985;
  /* rower: moment prostujący (sprężyna + tłumik) wokół osi poziomych — trzyma ramę w pionie */
  if (CAR_TYPES[carType].bike){
    chassisBody.quaternion.vmult(_upLocal, _upW);
    const w = chassisBody.angularVelocity, kp = 900, kd = 150;
    chassisBody.torque.x += -_upW.z * kp - w.x * kd;
    chassisBody.torque.z +=  _upW.x * kp - w.z * kd;
  }
});
const _upLocal = new CANNON.Vec3(0, 1, 0), _upW = new CANNON.Vec3();
const HAND_F = 190;                        // ręczny; reszta parametrów wg typu auta (car-types.js)

const _fwdWorld = new CANNON.Vec3();
/* B-9: rower nie wjedzie na rampę ani pomost autostrady (droga o wysokości > 0.1 m pod kołami) — odbicie z komunikatem */
let _bikeBanT = 0;
function bikeHwyBan(dt){
  _bikeBanT -= dt;
  if (carType !== 'bike' || mode !== 'car' || _bikeBanT > 0) return;
  _bikeBanT = 0.15;
  const p = chassisBody.position, v = chassisBody.velocity;
  const on = hwyQuery(p.x, p.z, -0.3).some(h => h.y > 0.1 && Math.abs(h.y - (p.y - CAR_TYPES.bike.restY)) < 1.6);
  if (!on) return;
  const sp = Math.hypot(v.x, v.z) || 1;
  p.x -= v.x / sp * 2.5; p.z -= v.z / sp * 2.5; p.y += 0.05;           // 2.5 m wstecz
  v.set(-v.x * 0.2, 0, -v.z * 0.2); chassisBody.angularVelocity.set(0, 0, 0);
  hudToast('Zakaz wjazdu rowerów na autostradę (B-9)');
}
function updateCar(dt){
  bikeHwyBan(dt);
  const driving = (mode === 'car');
  const fwdWorld = _fwdWorld;
  chassisBody.quaternion.vmult(CAR_FWD, fwdWorld);
  const vel = chassisBody.velocity;
  const alongF = vel.x * fwdWorld.x + vel.z * fwdWorld.z;   // dodatnie = jazda przodem
  const spd = Math.hypot(vel.x, vel.z);
  const kmh = spd * 3.6;

  const CT = CAR_TYPES[carType], MAX_STEER = CT.steer, MAX_FORCE = CT.force, BRAKE_F = CT.brake, mScale = CT.mass / 1250;
  if (driving){
    const throttle = (down('forward') || keys['ArrowUp']) ? 1 : 0;
    const reverse  = (down('back')    || keys['ArrowDown']) ? 1 : 0;
    handbrakeOn = down('jump');

    /* skręt: klawisz ustawia CEL, a koła dochodzą do niego płynnie (najpierw liniowo, potem
       wygładzenie wykładnicze — bez szarpnięcia na starcie i końcu ruchu kierownicy).
       Maksymalny kąt maleje z prędkością (0.52 rad w miejscu, ~0.2 rad przy 120 km/h),
       a kierownica wolniej skręca, szybciej wraca do środka i szybko zmienia stronę. */
    let want = 0;
    if (down('left')  || keys['ArrowLeft'])  want += 1;
    if (down('right') || keys['ArrowRight']) want -= 1;
    const lock = MAX_STEER / (1 + spd / 20);
    const target = want * lock;
    const reversing = want !== 0 && Math.sign(target) !== Math.sign(steerRaw) && Math.abs(steerRaw) > 0.02;
    const rate = want === 0 ? 3.2 : (reversing ? 4.0 : 2.2 / (1 + spd / 30));
    steerRaw = approach(steerRaw, target, rate * dt);
    steer = damp(steer, steerRaw, 16, dt);
    vehicle.setSteeringValue(steer, 0);
    vehicle.setSteeringValue(steer, 1);

    let force = 0, brake = 0;
    if (throttle){
      if (alongF < -0.6){ brake = BRAKE_F; }                       // hamowanie przy cofaniu
      else {
        const fade = 1 - clamp(kmh / CT.fadeKmh, 0, 1);
        force = MAX_FORCE * (CT.bike ? fade : 0.35 + fade * 0.65) * carSpeedMult;   // rower: siła mięśni zanika do zera przy prędkości granicznej
      }
    } else if (reverse){
      if (alongF > 0.6){ brake = BRAKE_F; }                        // hamulec zasadniczy
      else force = -MAX_FORCE * 0.46 * carSpeedMult;
    } else {
      brake = CT.bike ? 0.15 : 5;                                  // hamowanie silnikiem (rower: wolne koło)
    }

    /* napęd na tył */
    vehicle.applyEngineForce(0, 0);
    vehicle.applyEngineForce(0, 1);
    vehicle.applyEngineForce(force, 2);
    vehicle.applyEngineForce(force, 3);

    for (let i = 0; i < 4; i++) vehicle.setBrake(brake, i);
    if (handbrakeOn){
      vehicle.setBrake(HAND_F * mScale, 2);
      vehicle.setBrake(HAND_F * mScale, 3);
      vehicle.applyEngineForce(0, 2);
      vehicle.applyEngineForce(0, 3);
      vehicle.wheelInfos[2].frictionSlip = 0.85;
      vehicle.wheelInfos[3].frictionSlip = 0.85;
    } else {
      vehicle.wheelInfos[2].frictionSlip = CT.grip;
      vehicle.wheelInfos[3].frictionSlip = CT.grip;
    }

    gearTxt = alongF < -0.8 ? 'R' : (spd < 0.4 ? 'N' : 'D');
    if (playerInd){
      const into = playerInd === 'L' ? steer > 0.22 : steer < -0.22;            // setSteeringValue(+) = w lewo
      if (into) _indTurned = true;
      else if (_indTurned && Math.abs(steer) < 0.05) playerInd = null;
    }

    /* obroty silnika */
    const load = throttle || reverse ? 1 : 0;
    const tRpm = clamp(0.14 + (kmh % 62) / 62 * 0.55 + clamp(kmh/200,0,1) * 0.42 + load * 0.12, 0, 1);
    engineRpm = damp(engineRpm, tRpm, 7, dt);
    if (CT.bike) Sound.engine(false, 0, 0); else Sound.engine(true, engineRpm, load, CT);

    /* światła stopu */
    const braking = (brake > 20) || handbrakeOn;
    carModel.tailMat.color.setRGB(braking ? 1.0 : 0.36, braking ? 0.18 : 0.08, braking ? 0.14 : 0.07);
  } else {
    for (let i = 0; i < 4; i++){ vehicle.applyEngineForce(0, i); vehicle.setBrake(24 * Math.max(mScale, 0.2), i); }
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

/* model auta = poza interpolowana między dwoma krokami fizyki (alpha z main-loop.js); koła liczone
   względem nadwozia z fizyki i przeniesione na nadwozie interpolowane, żeby nie "pływały" */
const _scPos = new THREE.Vector3(), _scQ0 = new THREE.Quaternion(), _scQ1 = new THREE.Quaternion();
const _scCur = new THREE.Matrix4(), _scInv = new THREE.Matrix4(), _scRen = new THREE.Matrix4(), _scW = new THREE.Matrix4();
const _scV = new THREE.Vector3(), _scQ = new THREE.Quaternion(), _scS = new THREE.Vector3(1, 1, 1);
function syncCar(alpha){
  const b = chassisBody, a = alpha === undefined ? 1 : alpha, p0 = b._hasPrev === true ? b._p0 : b.position, q0 = b._hasPrev === true ? b._q0 : b.quaternion;
  _scPos.set(lerp(p0.x, b.position.x, a), lerp(p0.y, b.position.y, a), lerp(p0.z, b.position.z, a));
  _scQ0.set(q0.x, q0.y, q0.z, q0.w); _scQ1.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
  _scQ0.slerp(_scQ1, a);
  carModel.root.position.copy(_scPos);
  carModel.root.quaternion.copy(_scQ0);
  _scV.set(b.position.x, b.position.y, b.position.z);
  _scCur.compose(_scV, _scQ1, _scS); _scInv.copy(_scCur).invert();
  _scRen.compose(_scPos, _scQ0, _scS);
  for (let i = 0; i < 4; i++){
    vehicle.updateWheelTransform(i);
    const t = vehicle.wheelInfos[i].worldTransform;
    _scV.set(t.position.x, t.position.y, t.position.z); _scQ.set(t.quaternion.x, t.quaternion.y, t.quaternion.z, t.quaternion.w);
    _scW.compose(_scV, _scQ, _scS).premultiply(_scInv).premultiply(_scRen);
    _scW.decompose(carModel.wheels[i].position, carModel.wheels[i].quaternion, _scV);
  }
  /* kierunkowskazy (miganie wspólne, dźwięk przy zmianie fazy) */
  if (carModel.ind){
    carModel.ind[0].visible = mode === 'car' && playerInd === 'L' && indBlinkOn;
    carModel.ind[1].visible = mode === 'car' && playerInd === 'R' && indBlinkOn;
    if (mode === 'car' && playerInd && indBlinkOn !== _indPrev) Sound.tick(indBlinkOn);
  }
  _indPrev = indBlinkOn;
  /* rower: koła w osi ramy (fizycznie rozstaw 0.12 m), przechył w zakręcie, rowerzysta pedałuje */
  if (CAR_TYPES[carType].bike){
    carModel.wheels[1].visible = carModel.wheels[3].visible = false;
    const v = chassisBody.velocity, sp = Math.hypot(v.x, v.z);
    carModel.body.rotation.z = damp(carModel.body.rotation.z, clamp(-steer * sp * 0.09, -0.45, 0.45), 6, 1 / 60);
    if (carModel.rider){
      carModel.rider.group.visible = mode === 'car';
      _pedal += sp * 0.05;
      carModel.rider.legL.rotation.x = -1.15 + Math.sin(_pedal) * 0.55; carModel.rider.legR.rotation.x = -1.15 - Math.sin(_pedal) * 0.55;
    }
  }
}
let _pedal = 0;
