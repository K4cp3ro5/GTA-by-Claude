/* ---------------------------------------------------------------
   14c. ŁODZIE — motorówki przy pomostach (BOAT_SPOTS z islands.js): model, wsiadanie z pomostu / nabrzeża,
   pływanie (W/S gaz i wsteczny, A/D ster — skręt rośnie z prędkością, Spacja hamowanie), kołysanie na fali,
   kilwater, zderzenia z lądem, pomostami, statkiem i innymi łodziami (odbicie). Wysiadka F tylko przy
   brzegu (safeSpot ≤ 9 m). Ciało kinematyczne (przeszkoda dla aut i pieszych na pomoście).
   --------------------------------------------------------------- */
const BOAT_T = { name: 'Motorówka', vMax: 17, vRev: 4, accel: 5, turn: 1.0, len: 6.4, beam: 2.3, camDist: 11, camH: 3.6, gauge: 80, door: [1.6, 0.4] };
const BOAT_COLORS = [0xc0392b, 0x1a4fa0, 0x2f8a4c, 0xe0a52c, 0xeeeeea];
function buildBoatModel(color){
  const parts = [], add = (geo, c, x, y, z) => parts.push({ geo: geo, color: c, x: x || 0, y: y || 0, z: z || 0 });
  const L = BOAT_T.len / 2, Bm = BOAT_T.beam / 2;
  const hull = [[-Bm, -L], [Bm, -L], [Bm, L * 0.35], [0, L], [-Bm, L * 0.35]];             // obrys z góry (dziób w +Z)
  add(planeWing(hull, 0.75), color, 0, 0.45, 0);                                          // kadłub (0.45 … −0.3)
  add(planeWing(hull.map(p => [p[0] * 0.9, p[1] * 0.93]), 0.06), 0xe9e4d8, 0, 0.47, 0);  // pokład
  add(new THREE.BoxGeometry(Bm * 2 + 0.04, 0.12, L * 1.3), 0xf2f0ea, 0, 0.1, -L * 0.3);  // pas burtowy
  add(new THREE.BoxGeometry(1.5, 0.55, 0.9), 0xe9eaec, 0, 0.78, 0.4);                    // konsola
  const ws = new THREE.BoxGeometry(1.6, 0.5, 0.06); ws.rotateX(-0.5); add(ws, 0x1b2a38, 0, 1.15, 0.85);   // szyba
  add(new THREE.BoxGeometry(1.4, 0.4, 0.8), 0x3b3f45, 0, 0.7, -1.4);                    // kanapa
  add(new THREE.BoxGeometry(0.5, 0.9, 0.5), 0x262a30, 0, 0.6, -L - 0.15);               // silnik za burtą
  add(new THREE.BoxGeometry(0.16, 0.7, 0.16), 0x262a30, 0, -0.05, -L - 0.25);
  const g = new THREE.Group(), m = new THREE.Mesh(mergeColored(parts), new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 50 }));
  m.castShadow = true; g.add(m);
  /* kilwater: biały klin za rufą, widoczny przy prędkości */
  const wakeGeo = new THREE.BufferGeometry(); wakeGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1.2, 0, -L, 1.2, 0, -L, 0, 0, -L - 14], 3)); wakeGeo.computeVertexNormals();
  const wake = new THREE.Mesh(wakeGeo, new THREE.MeshBasicMaterial({ color: 0xf2f8fb, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  wake.position.y = -0.7; g.add(wake);
  scene.add(g);
  return { group: g, wake: wake };
}
const boats = [], _boatAxis = new CANNON.Vec3(0, 1, 0);
(function spawnBoats(){
  BOAT_SPOTS.forEach((s, i) => {
    const m = buildBoatModel(BOAT_COLORS[i % BOAT_COLORS.length]);
    const b = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: matCar });
    b.addShape(new CANNON.Box(new CANNON.Vec3(BOAT_T.beam / 2, 0.5, BOAT_T.len / 2)));
    b.collisionFilterGroup = G_CAR; b.collisionFilterMask = ~G_WORLD; b.isBoat = true;
    addBody(b);
    const bt = { spec: s, group: m.group, wake: m.wake, body: b, pos: new THREE.Vector3(s.x, WATER_Y, s.z), heading: s.heading, v: 0, thr: 0, phase: i * 1.7, roll: 0 };
    boats.push(bt);
    syncBoat(bt, 0);
  });
})();
function syncBoat(b, t){
  const y = WATER_Y + 0.12 + Math.sin(t * 1.6 + b.phase) * 0.07, pitch = -clamp(b.v / BOAT_T.vMax, 0, 1) * 0.07 + Math.sin(t * 1.3 + b.phase) * 0.02;
  b.group.position.set(b.pos.x, y, b.pos.z);
  b.group.rotation.set(pitch, b.heading, b.roll + Math.sin(t * 1.1 + b.phase) * 0.03, 'YXZ');
  b.body.position.set(b.pos.x, y + 0.3, b.pos.z);
  b.body.quaternion.setFromAxisAngle(_boatAxis, b.heading);
  b.wake.material.opacity = clamp((Math.abs(b.v) - 2) / 10, 0, 0.55);
  b.wake.scale.z = 0.3 + clamp(Math.abs(b.v) / BOAT_T.vMax, 0, 1);
}
function boatDoorPoint(b, out){
  const d = BOAT_T.door, c = Math.cos(b.heading), s = Math.sin(b.heading);
  out.x = b.pos.x + d[0] * c + d[1] * s; out.z = b.pos.z - d[0] * s + d[1] * c; out.y = 0;
  return out;
}
/* czy kadłub (5 punktów obrysu) w (x, z, h) zahacza o ląd, przeszkodę albo inną łódź */
function boatBlocked(b, x, z, h){
  const f = { x: Math.sin(h), z: Math.cos(h) }, r = { x: -f.z, z: f.x }, L = BOAT_T.len / 2 + 0.3, W = BOAT_T.beam / 2 + 0.2;
  for (const [a, l] of [[L, 0], [L * 0.4, W], [L * 0.4, -W], [-L, W], [-L, -W]]){
    const px = x + f.x * a + r.x * l, pz = z + f.z * a + r.z * l;
    if (isLand(px, pz) || BOAT_OBSTACLES.some(o => inRect(o, px, pz))) return true;
  }
  return boats.some(o => o !== b && Math.hypot(o.pos.x - x, o.pos.z - z) < BOAT_T.len * 0.85);
}

let curBoat = null;
const boatKeysHelp = 'W / S — gaz / wsteczny · A / D — ster · Spacja — hamowanie · F — wysiadka przy brzegu';
function enterBoat(b){
  curBoat = b; mode = 'boat';
  player.mesh.visible = false; delBody(player.body);
  hudToast(BOAT_T.name + ': ' + boatKeysHelp, 5);
}
function exitBoat(force){
  const b = curBoat; if (!b) return;
  const s = safeSpot(b.pos.x, b.pos.z, 2, 9);
  if (!s && !force){ hudToast('Podpłyń do pomostu albo nabrzeża, żeby wysiąść'); return; }
  const p = s || safeSpot(b.pos.x, b.pos.z, 2, 200) || { x: HOSPITAL_SPAWN.x, y: 0, z: HOSPITAL_SPAWN.z };
  mode = 'foot'; curBoat = null; b.thr = 0;
  player.mesh.visible = true;
  player.body.position.set(p.x, p.y + 1.2, p.z); player.body.velocity.set(0, 0, 0); player.body.wakeUp(); addBody(player.body);
  player.fallSpeed = 0;
  Sound.engine(false, 0, 0);
}
/* sterowana łódź: zwraca km/h */
function updateBoat(dt){
  const b = curBoat; if (!b) return 0;
  const fwd = down('forward') || keys['ArrowUp'], back = down('back') || keys['ArrowDown'], brake = down('jump');
  const steer = ((down('left') || keys['ArrowLeft']) ? 1 : 0) - ((down('right') || keys['ArrowRight']) ? 1 : 0);
  b.thr = fwd ? 1 : back ? -1 : 0;
  const target = b.thr > 0 ? BOAT_T.vMax : b.thr < 0 ? -BOAT_T.vRev : 0;
  b.v = approach(b.v, target, (b.thr ? BOAT_T.accel : 2.2) * (brake ? 3 : 1) * dt);
  if (brake && !b.thr) b.v = approach(b.v, 0, 6 * dt);
  const tr = BOAT_T.turn * clamp(Math.abs(b.v) / 6, 0.15, 1) * Math.sign(b.v || 1);
  b.heading += steer * tr * dt;                                                   // A = w lewo (kurs rośnie)
  b.roll = damp(b.roll, -steer * clamp(Math.abs(b.v) / BOAT_T.vMax, 0, 1) * 0.18, 4, dt);
  const nx = b.pos.x + Math.sin(b.heading) * b.v * dt, nz = b.pos.z + Math.cos(b.heading) * b.v * dt;
  if (boatBlocked(b, nx, nz, b.heading)){
    if (Math.abs(b.v) > 6) Sound.thud(Math.abs(b.v));
    b.v *= -0.25;                                                                 // odbicie od brzegu / przeszkody
  } else { b.pos.x = nx; b.pos.z = nz; }
  if (Math.abs(b.pos.x) > 1300 || Math.abs(b.pos.z) > 1300){ b.heading += Math.PI; hudToast('Granica obszaru — zawracanie'); }
  syncBoat(b, clock);
  Sound.engine(true, 0.12 + Math.abs(b.thr) * 0.6 * clamp(Math.abs(b.v) / BOAT_T.vMax + 0.3, 0, 1), Math.abs(b.thr), { pitch: 1.35, bright: 0.9 });
  return Math.abs(b.v) * 3.6;
}
/* pozostałe łodzie: kołysanie, wygaszanie prędkości porzuconej łodzi */
function updateBoatsIdle(dt){
  for (const b of boats){
    if (b === curBoat) continue;
    if (Math.abs(b.v) > 0.05){
      b.v = approach(b.v, 0, 3 * dt);
      const nx = b.pos.x + Math.sin(b.heading) * b.v * dt, nz = b.pos.z + Math.cos(b.heading) * b.v * dt;
      if (!boatBlocked(b, nx, nz, b.heading)){ b.pos.x = nx; b.pos.z = nz; } else b.v = 0;
    }
    b.roll = damp(b.roll, 0, 2, dt);
    syncBoat(b, clock);
  }
}

/* pozycja „gracza” w świecie niezależnie od trybu (HUD, mapa, nawigacja) */
function playerWorldPos(){
  if (mode === 'car') return chassisBody.position;
  if (mode === 'plane' && curPlane) return curPlane.pos;
  if (mode === 'boat' && curBoat) return curBoat.pos;
  return player.body.position;
}
