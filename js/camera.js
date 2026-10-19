/* ---------------------------------------------------------------
   19. KAMERA
   --------------------------------------------------------------- */
const camTarget = new THREE.Vector3();
const camWish   = new THREE.Vector3();
const camCur    = new THREE.Vector3(0, 6, 20);
const lookAt    = new THREE.Vector3();
const rayCaster = new THREE.Raycaster();
let camFov = 66, camKmh = 0, camDist = 7.6;
const _camEuler = new THREE.Euler();

function updateCamera(dt, kmh){
  let dist, height, tx, ty, tz;

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
    tx = p.x; ty = p.y + 0.85 + 0.72; tz = p.z;
    dist = 5.3;
    height = 0.35;
    camFov = damp(camFov, 68, 4, dt);
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

  if (Math.abs(camera.fov - camFov) > 0.01){
    camera.fov = camFov;
    camera.updateProjectionMatrix();
  }

  /* cień podąża za akcją */
  sun.target.position.set(camTarget.x, 0, camTarget.z);
  sun.position.set(camTarget.x + lightDir.x * 95, lightDir.y * 95 + 2, camTarget.z + lightDir.z * 95);
}
