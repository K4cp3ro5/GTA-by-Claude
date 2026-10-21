/* ---------------------------------------------------------------
   19. KAMERA
   --------------------------------------------------------------- */
const camTarget = new THREE.Vector3();
const camWish   = new THREE.Vector3();
const camCur    = new THREE.Vector3(0, 6, 20);
const lookAt    = new THREE.Vector3();
const rayCaster = new THREE.Raycaster();
let camFov = 66, camKmh = 0, camDist = 7.6;
let camShake = 0, planeCamYaw = 0;                     // wstrząs (wybuch) / obrót kamery samolotu myszą (wraca za ogon)
const _camEuler = new THREE.Euler();

const _cpF = new THREE.Vector3(), _cpW = new THREE.Vector3(), _cpL = new THREE.Vector3();
function updateCamera(dt, kmh){
  let dist, height, tx, ty, tz;
  if (mode === 'boat' && curBoat){
    /* łódź: kamera pościgowa za rufą (mysz obraca jak w samolocie) */
    const b = curBoat;
    if (clock - lastMouseMove > 1.2) planeCamYaw = angleDamp(planeCamYaw, 0, 1.5, dt);
    const h = b.heading + planeCamYaw;
    _cpW.set(b.pos.x - Math.sin(h) * BOAT_T.camDist, WATER_Y + BOAT_T.camH, b.pos.z - Math.cos(h) * BOAT_T.camDist);
    camCur.x = damp(camCur.x, _cpW.x, 6, dt); camCur.y = damp(camCur.y, _cpW.y, 6, dt); camCur.z = damp(camCur.z, _cpW.z, 6, dt);
    camera.position.copy(camCur);
    camera.lookAt(b.pos.x + Math.sin(b.heading) * 6, WATER_Y + 1.2, b.pos.z + Math.cos(b.heading) * 6);
    camFov = damp(camFov, 66 + clamp(kmh / 60, 0, 1) * 8, 2, dt);
    if (Math.abs(camera.fov - camFov - fovAdd) > 0.01){ camera.fov = camFov + fovAdd; camera.updateProjectionMatrix(); }
    sun.target.position.set(b.pos.x, 0, b.pos.z);
    sun.position.set(b.pos.x + lightDir.x * 95, lightDir.y * 95 + 2, b.pos.z + lightDir.z * 95);
    camYaw = h + Math.PI;
    return;
  }
  if (mode === 'plane' && curPlane){
    /* kamera pościgowa: za ogonem i nad samolotem, patrzy przed nos; płynnie, bez wysięgnika kolizyjnego */
    const p = curPlane, T = p.T;
    _cpF.set(0, 0, 1).applyQuaternion(p.quat);
    if (clock - lastMouseMove > 1.2) planeCamYaw = angleDamp(planeCamYaw, 0, 1.5, dt);
    _cpL.copy(_cpF).applyAxisAngle(_pY, planeCamYaw);
    _cpW.copy(p.pos).addScaledVector(_cpL, -T.camDist); _cpW.y += T.camH;
    const gy = planeGroundY(_cpW.x, _cpW.z, _cpW.y + 5) + 1.5; if (_cpW.y < gy) _cpW.y = gy;
    camCur.x = damp(camCur.x, _cpW.x, 5, dt); camCur.y = damp(camCur.y, _cpW.y, 5, dt); camCur.z = damp(camCur.z, _cpW.z, 5, dt);
    camera.position.copy(camCur);
    _cpL.copy(p.pos).addScaledVector(_cpF, planeCamYaw ? 0 : 25); camera.lookAt(_cpL);
    camFov = damp(camFov, 70 + clamp(kmh / 400, 0, 1) * 10, 2, dt);
    if (Math.abs(camera.fov - camFov - fovAdd) > 0.01){ camera.fov = camFov + fovAdd; camera.updateProjectionMatrix(); }
    sun.target.position.set(p.pos.x, 0, p.pos.z);
    sun.position.set(p.pos.x + lightDir.x * 95, lightDir.y * 95 + 2, p.pos.z + lightDir.z * 95);
    camYaw = Math.atan2(-_cpF.x, -_cpF.z);
    return;
  }

  camKmh = damp(camKmh, kmh, 3, dt);                 // prędkość dla kamery bez drgań z fizyki
  if (mode === 'car'){
    /* cel = interpolowany model auta (syncCar), nie ciało fizyczne skaczące co krok 1/60 s */
    const p = carModel.root.position;
    tx = p.x; ty = p.y + 0.85; tz = p.z;
    dist = 7.6 + clamp(camKmh / 90, 0, 1) * 1.7;
    height = 1.15;
    /* powrót kamery za auto, gdy gracz nie rusza myszą (kurs z interpolowanego modelu) */
    if (clock - lastMouseMove > 0.55){
      _camEuler.setFromQuaternion(carModel.root.quaternion, 'YXZ');
      const want = _camEuler.y;                      // tył modelu (fizyczny przód to lokalne -Z) = kurs + PI
      const spdW = clamp(camKmh / 34, 0, 1);
      camYaw = angleDamp(camYaw, want, 1.0 + spdW * 2.6, dt);
      camPitch = damp(camPitch, -0.13, 1.6, dt);
    }
    camFov = damp(camFov, 66 + clamp(camKmh / 190, 0, 1) * 15, 2, dt);
  } else {
    const p = player.mesh.position;
    const para = typeof parachute !== 'undefined' && parachute.on && parachute.t > 0.7;
    /* broń palna: kamera zza prawego ramienia (cel przesunięty w prawo od postaci) — celownik na środku ekranu
       nie jest zasłonięty przez postać; PPM (przycelowanie): bliżej i węższe pole widzenia */
    const k = Weapons.aimK, ads = Weapons.adsK, sh = k * (0.82 - ads * 0.2);
    tx = p.x + Math.cos(camYaw) * sh; ty = p.y + 0.85 + 0.72 + (para ? 1.6 : 0) - k * 0.1; tz = p.z - Math.sin(camYaw) * sh;
    dist = para ? 10.5 : lerp(5.3, 3.3, k) - ads * 1.2;
    height = para ? 1.2 : lerp(0.35, 0.16, k);
    camFov = damp(camFov, 68 - ads * 18, k > 0.05 ? 10 : 4, dt);
  }

  camTarget.set(tx, ty, tz);
  const cp = Math.cos(camPitch), sp = Math.sin(camPitch);
  camWish.set(
    camTarget.x + Math.sin(camYaw) * cp * dist,
    camTarget.y + height - sp * dist,
    camTarget.z + Math.cos(camYaw) * cp * dist
  );

  /* wysięgnik sprężynowy: przy przeszkodzie skraca się od razu, a wydłuża płynnie (bez pompowania) */
  const dir = camWish.clone().sub(camTarget);
  const len = dir.length();
  dir.normalize();
  rayCaster.set(camTarget, dir);
  rayCaster.far = len + 0.4;
  const hits = rayCaster.intersectObjects(camBlockers, false);
  const free = (hits.length && hits[0].distance < len) ? Math.max(1.1, hits[0].distance - 0.35) : len;
  camDist = free < camDist ? free : damp(camDist, free, 2.5, dt);
  camWish.copy(camTarget).addScaledVector(dir, camDist);
  if (camWish.y < 0.6) camWish.y = 0.6;

  /* w aucie: kamera sztywno na wysięgniku za interpolowanym celem (wygładzony jest kąt camYaw),
     bo ściganie celu z opóźnieniem dawało drgania przy nierównym kroku klatek */
  if (mode === 'car') camCur.copy(camWish);
  else {
    camCur.x = damp(camCur.x, camWish.x, 16, dt);
    camCur.y = damp(camCur.y, camWish.y, 16, dt);
    camCur.z = damp(camCur.z, camWish.z, 16, dt);
  }
  camera.position.copy(camCur);

  lookAt.copy(camTarget);
  lookAt.y += mode === 'car' ? 0.35 : 0.30;
  camera.lookAt(lookAt);

  if (Math.abs(camera.fov - camFov - fovAdd) > 0.01){
    camera.fov = camFov + fovAdd;
    camera.updateProjectionMatrix();
  }

  /* cień podąża za akcją */
  sun.target.position.set(camTarget.x, 0, camTarget.z);
  sun.position.set(camTarget.x + lightDir.x * 95, lightDir.y * 95 + 2, camTarget.z + lightDir.z * 95);
}

/* wstrząs kamery po wybuchu (main-loop po updateCamera) */
function applyCamShake(dt){
  if (camShake <= 0) return;
  camera.position.x += (Math.random() - 0.5) * camShake; camera.position.y += (Math.random() - 0.5) * camShake * 0.6; camera.position.z += (Math.random() - 0.5) * camShake;
  camShake = Math.max(0, camShake - dt * 1.4);
}
