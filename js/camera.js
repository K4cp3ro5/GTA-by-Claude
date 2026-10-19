/* ---------------------------------------------------------------
   19. KAMERA
   --------------------------------------------------------------- */
const camTarget = new THREE.Vector3();
const camWish   = new THREE.Vector3();
const camCur    = new THREE.Vector3(0, 6, 20);
const lookAt    = new THREE.Vector3();
const rayCaster = new THREE.Raycaster();
let camFov = 66;

function updateCamera(dt, kmh){
  let dist, height, tx, ty, tz;

  if (mode === 'car'){
    const p = chassisBody.position;
    tx = p.x; ty = p.y + 0.85; tz = p.z;
    dist = 7.6 + clamp(kmh / 90, 0, 1) * 1.7;
    height = 1.15;
    /* powrót kamery za auto, gdy gracz nie rusza myszą */
    if (clock - lastMouseMove > 0.55){
      const want = carYaw() + Math.PI;
      const spdW = clamp(kmh / 34, 0, 1);
      camYaw = angleDamp(camYaw, want, 1.2 + spdW * 3.4, dt);
      camPitch = damp(camPitch, -0.13, 1.6, dt);
    }
    camFov = damp(camFov, 66 + clamp(kmh / 190, 0, 1) * 15, 3, dt);
  } else {
    const p = player.body.position;
    tx = p.x; ty = p.y + 0.72; tz = p.z;
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

  /* wysięgnik sprężynowy: skracanie przy przeszkodzie */
  const dir = camWish.clone().sub(camTarget);
  const len = dir.length();
  dir.normalize();
  rayCaster.set(camTarget, dir);
  rayCaster.far = len + 0.4;
  const hits = rayCaster.intersectObjects(camBlockers, false);
  if (hits.length && hits[0].distance < len){
    camWish.copy(camTarget).addScaledVector(dir, Math.max(1.1, hits[0].distance - 0.35));
  }
  if (camWish.y < 0.6) camWish.y = 0.6;

  const k = mode === 'car' ? 12 : 16;
  camCur.x = damp(camCur.x, camWish.x, k, dt);
  camCur.y = damp(camCur.y, camWish.y, k, dt);
  camCur.z = damp(camCur.z, camWish.z, k, dt);
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
  sun.position.set(camTarget.x + sunDir.x * 95, sunDir.y * 95 + 2, camTarget.z + sunDir.z * 95);
}
