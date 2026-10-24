/* ---------------------------------------------------------------
   19. KAMERA
   --------------------------------------------------------------- */
const camTarget = new THREE.Vector3();
const camWish   = new THREE.Vector3();
const camCur    = new THREE.Vector3(0, 6, 20);
const lookAt    = new THREE.Vector3();
const rayCaster = new THREE.Raycaster();
let camFov = 66, camKmh = 0, camDist = 7.6;
let camShake = 0, planeCamYaw = 0, planeCamPitch = 0;  // wstrząs (wybuch) / obrót i nachylenie kamery pojazdu myszą (wracają za ogon)
const CAM_PITCH_MIN = -1.53, CAM_PITCH_MAX = 1.5;      // pieszo i w aucie: od patrzenia prawie pionowo w dół do prawie pionowo w górę
/* wysięgnik kamery: odległość do pierwszej przeszkody od celu w stronę kamery — siatki (camBlockers) i wszystkie kolizje świata
   (budynki, drzewa, latarnie, wiadukty, ściany hal); kamera staje przed nią, żeby postać / pojazd była widoczna */
/* siatki przeszkód kamery są statyczne: ich trójkąty (w układzie świata) leżą w siatce komórek 16 m, a promień sprawdza tylko trójkąty
   z komórek wokół odcinka (THREE.Raycaster przeglądał wszystkie ~49 tys. — ~1 ms na klatkę). Test trójkąta jak w THREE.Ray.intersectTriangle
   (z pomijaniem tylnych ścian wg strony materiału), więc wynik jest ten sam: najbliższe trafienie w zasięgu. */
const CAMGRID = { cell: 16, cells: new Map(), v: null, side: null, stamp: null, q: 0, built: false };
function camGridBuild(){
  CAMGRID.built = true;
  const V = [], S = [], C = CAMGRID.cell, cells = CAMGRID.cells, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (const m of camBlockers){
    m.updateMatrixWorld(true);
    const g = m.geometry, pos = g.attributes.position, idx = g.index, mats = Array.isArray(m.material) ? m.material : null;
    const n = idx ? idx.count : pos.count;
    const ranges = mats ? g.groups.map(gr => [gr.start, gr.start + gr.count, mats[gr.materialIndex]])
      : [[Math.max(0, g.drawRange.start), Math.min(n, g.drawRange.start + g.drawRange.count), m.material]];
    for (const [s0, s1, mat] of ranges){
      if (!mat) continue;
      for (let k = s0, e = Math.min(s1, n); k + 2 < e; k += 3){
        const ia = idx ? idx.getX(k) : k, ib = idx ? idx.getX(k + 1) : k + 1, ic = idx ? idx.getX(k + 2) : k + 2;
        a.fromBufferAttribute(pos, ia).applyMatrix4(m.matrixWorld); b.fromBufferAttribute(pos, ib).applyMatrix4(m.matrixWorld); c.fromBufferAttribute(pos, ic).applyMatrix4(m.matrixWorld);
        const t = S.length; V.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); S.push(mat.side);
        const x0 = Math.floor(Math.min(a.x, b.x, c.x) / C), x1 = Math.floor(Math.max(a.x, b.x, c.x) / C), z0 = Math.floor(Math.min(a.z, b.z, c.z) / C), z1 = Math.floor(Math.max(a.z, b.z, c.z) / C);
        for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++){ const key = cx * 65536 + cz; let L = cells.get(key); if (!L) cells.set(key, L = []); L.push(t); }
      }
    }
  }
  CAMGRID.v = new Float32Array(V); CAMGRID.side = new Uint8Array(S); CAMGRID.stamp = new Uint32Array(S.length);
}
/* odległość wzdłuż promienia (o, d — znormalizowany) do najbliższego trójkąta siatek kamery, najwyżej far; Infinity — brak */
function camGridRay(ox, oy, oz, dx, dy, dz, far){
  if (!CAMGRID.built) camGridBuild();
  const C = CAMGRID.cell, V = CAMGRID.v, S = CAMGRID.side, st = CAMGRID.stamp, q = ++CAMGRID.q;
  const ex = ox + dx * far, ez = oz + dz * far;
  const x0 = Math.floor(Math.min(ox, ex) / C), x1 = Math.floor(Math.max(ox, ex) / C), z0 = Math.floor(Math.min(oz, ez) / C), z1 = Math.floor(Math.max(oz, ez) / C);
  let best = Infinity;
  for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++){
    const L = CAMGRID.cells.get(cx * 65536 + cz); if (!L) continue;
    for (let k = 0; k < L.length; k++){
      const t = L[k]; if (st[t] === q) continue; st[t] = q;
      const i = t * 9, side = S[t];
      /* THREE.Ray.intersectTriangle(a, b, c, backfaceCulling); BackSide — odwrócona kolejność (c, b, a) z pomijaniem */
      let ax = V[i], ay = V[i + 1], az = V[i + 2], cx2 = V[i + 6], cy2 = V[i + 7], cz2 = V[i + 8];
      if (side === THREE.BackSide){ ax = V[i + 6]; ay = V[i + 7]; az = V[i + 8]; cx2 = V[i]; cy2 = V[i + 1]; cz2 = V[i + 2]; }
      const e1x = V[i + 3] - ax, e1y = V[i + 4] - ay, e1z = V[i + 5] - az, e2x = cx2 - ax, e2y = cy2 - ay, e2z = cz2 - az;
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      let DdN = dx * nx + dy * ny + dz * nz, sign;
      if (DdN > 0){ if (side !== THREE.DoubleSide) continue; sign = 1; }
      else if (DdN < 0){ sign = -1; DdN = -DdN; }
      else continue;
      const qx = ox - ax, qy = oy - ay, qz = oz - az;
      const DdQxE2 = sign * (dx * (qy * e2z - qz * e2y) + dy * (qz * e2x - qx * e2z) + dz * (qx * e2y - qy * e2x));
      if (DdQxE2 < 0) continue;
      const DdE1xQ = sign * (dx * (e1y * qz - e1z * qy) + dy * (e1z * qx - e1x * qz) + dz * (e1x * qy - e1y * qx));
      if (DdE1xQ < 0 || DdQxE2 + DdE1xQ > DdN) continue;
      const QdN = -sign * (qx * nx + qy * ny + qz * nz);
      if (QdN < 0) continue;
      const tt = QdN / DdN;
      if (tt <= far && tt < best) best = tt;
    }
  }
  return best;
}
function camBoomFree(from, dir, len){
  let free = len;
  const hd = camGridRay(from.x, from.y, from.z, dir.x, dir.y, dir.z, len + 0.4);
  if (hd < free) free = hd;
  const h = rayHit(from.x, from.y, from.z, from.x + dir.x * (len + 0.4), from.y + dir.y * (len + 0.4), from.z + dir.z * (len + 0.4), G_WORLD);
  if (h && h.distance < free) free = h.distance;
  return free < len ? Math.max(0.45, free - 0.35) : len;
}
/* kamera pojazdu (łódź, samolot, helikopter): orbita wokół celu (mysz — pełny obrót i góra / dół, po 1.2 s bez ruchu myszy wraca za
   ogon), wysięgnik skracany przed przeszkodą, nie schodzi pod ziemię / wodę; patrzy przed nos, gdy kamera jest za ogonem */
const _ocT = new THREE.Vector3(), _ocD = new THREE.Vector3();
function orbitCam(dt, cx, cy, cz, yawBase, dist, camH, ahead, stiff){
  if (clock - lastMouseMove > 1.2){ planeCamYaw = angleDamp(planeCamYaw, 0, 1.5, dt); planeCamPitch = damp(planeCamPitch, 0, 1.5, dt); }
  const yw = yawBase + planeCamYaw, R0 = Math.hypot(dist, camH), el = clamp(Math.atan2(camH, dist) + planeCamPitch, -1.2, 1.5);
  _ocT.set(cx, cy + 1, cz);
  _ocD.set(-Math.sin(yw) * Math.cos(el), Math.sin(el), -Math.cos(yw) * Math.cos(el));
  const len = camBoomFree(_ocT, _ocD, R0);
  _cpW.copy(_ocT).addScaledVector(_ocD, len);
  const gy = Math.max(heightAt(_cpW.x, _cpW.z), isLand(_cpW.x, _cpW.z) ? 0 : WATER_Y) + 0.6; if (_cpW.y < gy && len >= R0 - 0.01) _cpW.y = gy;
  if (len < R0 - 0.01) camCur.copy(_cpW);                                          // przed przeszkodą od razu (bez przenikania)
  else { camCur.x = damp(camCur.x, _cpW.x, stiff, dt); camCur.y = damp(camCur.y, _cpW.y, stiff, dt); camCur.z = damp(camCur.z, _cpW.z, stiff, dt); }
  camera.position.copy(camCur);
  const back = Math.abs(planeCamYaw) < 0.15 && Math.abs(planeCamPitch) < 0.15;
  camera.lookAt(cx + Math.sin(yawBase) * (back ? ahead : 0), cy + (back ? 0 : 0.5), cz + Math.cos(yawBase) * (back ? ahead : 0));
  return yw;
}
const _camEuler = new THREE.Euler();

const _cpF = new THREE.Vector3(), _cpW = new THREE.Vector3(), _cpL = new THREE.Vector3();
function updateCamera(dt, kmh){
  let dist, height, tx, ty, tz;
  if (mode === 'ride' && curRide){ rideCamera(dt); return; }      // przejażdżka kolejką (park.js)
  if (mode === 'boat' && curBoat){
    /* łódź: kamera pościgowa za rufą (mysz obraca jak w samolocie) */
    const b = curBoat;
    const h = orbitCam(dt, b.pos.x, WATER_Y + 0.2, b.pos.z, b.heading, BOAT_T.camDist, BOAT_T.camH, 6, 6);
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
    orbitCam(dt, p.pos.x, p.pos.y - 1, p.pos.z, Math.atan2(_cpF.x, _cpF.z), T.camDist, T.camH, 25, 5);
    camFov = damp(camFov, 70 + clamp(kmh / 400, 0, 1) * 10, 2, dt);
    if (Math.abs(camera.fov - camFov - fovAdd) > 0.01){ camera.fov = camFov + fovAdd; camera.updateProjectionMatrix(); }
    sun.target.position.set(p.pos.x, 0, p.pos.z);
    sun.position.set(p.pos.x + lightDir.x * 95, lightDir.y * 95 + 2, p.pos.z + lightDir.z * 95);
    camYaw = Math.atan2(-_cpF.x, -_cpF.z);
    return;
  }

  if (mode === 'heli' && curHeli){
    /* helikopter: za ogonem i nad wirnikiem, patrzy przed nos; mysz obraca (wraca za ogon) */
    const h = curHeli;
    const yw = orbitCam(dt, h.pos.x, h.pos.y - 1, h.pos.z, h.yaw, HELI_T.camDist, HELI_T.camH, 10, 6);
    camFov = damp(camFov, 68 + clamp(kmh / 160, 0, 1) * 8, 2, dt);
    if (Math.abs(camera.fov - camFov - fovAdd) > 0.01){ camera.fov = camFov + fovAdd; camera.updateProjectionMatrix(); }
    sun.target.position.set(h.pos.x, 0, h.pos.z);
    sun.position.set(h.pos.x + lightDir.x * 95, lightDir.y * 95 + 2, h.pos.z + lightDir.z * 95);
    camYaw = yw + Math.PI;
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
    const k = Weapons.aimK, ads = Weapons.adsK, sh = k * (0.82 - ads * 0.2), pk = para ? 1 - k : 0;   // pod czaszą: kamera daleko, przy celowaniu — zza ramienia
    tx = p.x + Math.cos(camYaw) * sh; ty = p.y + 0.85 + 0.72 + pk * 1.6 - k * 0.1; tz = p.z - Math.sin(camYaw) * sh;
    dist = lerp(lerp(5.3, 3.3, k) - ads * 1.2, 10.5, pk);
    height = lerp(lerp(0.35, 0.16, k), 1.2, pk);
    camFov = damp(camFov, 68 - ads * 18, k > 0.05 ? 10 : 4, dt);
  }

  camTarget.set(tx, ty, tz);
  /* patrzenie w górę (camPitch > 0.32, ku 0…1): kamera podjeżdża blisko i nisko za plecy, a spojrzenie unosi się najwyżej do ~45°
     (w aucie ~29°) — postać / auto zostaje w dolnej części kadru, nad nią niebo (jak w GTA); kamera nie schodzi pod postać */
  const kUp = clamp((camPitch - 0.32) / (CAM_PITCH_MAX - 0.32), 0, 1), ku = kUp * kUp * (3 - 2 * kUp);
  const footY = mode === 'car' ? carModel.root.position.y - 0.45 : player.mesh.position.y;
  dist = lerp(dist, mode === 'car' ? CAR_TYPES[carType].half[2] + 3.5 : 2.0, ku);
  const posPitch = Math.min(camPitch, 0.32), cp = Math.cos(posPitch), sp = Math.sin(posPitch);
  camWish.set(
    camTarget.x + Math.sin(camYaw) * cp * dist,
    camTarget.y + height - sp * dist,
    camTarget.z + Math.cos(camYaw) * cp * dist
  );
  camWish.y = lerp(camWish.y, footY + (mode === 'car' ? 0.95 : 0.5), ku);

  /* wysięgnik sprężynowy: przy przeszkodzie skraca się od razu, a wydłuża płynnie (bez pompowania) */
  const dir = camWish.clone().sub(camTarget);
  const len = dir.length();
  dir.normalize();
  const free = camBoomFree(camTarget, dir, len);
  camDist = free < camDist ? free : damp(camDist, free, 2.5, dt);
  camWish.copy(camTarget).addScaledVector(dir, camDist);
  if (camWish.y < footY + 0.3) camWish.y = footY + 0.3;

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
  if (ku > 0){
    const el = lerp(0.32, mode === 'car' ? 0.5 : 0.78, ku);
    lookAt.lerp(_cpL.set(camCur.x - Math.sin(camYaw) * Math.cos(el) * 12, camCur.y + Math.sin(el) * 12, camCur.z - Math.cos(camYaw) * Math.cos(el) * 12), ku);
  }
  camera.lookAt(lookAt);

  const fovW = camFov + fovAdd + ku * 8;                                            // patrząc w górę — trochę szerzej
  if (Math.abs(camera.fov - fovW) > 0.01){
    camera.fov = fovW;
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
