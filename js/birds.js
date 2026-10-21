/* ---------------------------------------------------------------
   14d. PTAKI — stada mew (jedna dynamiczna siatka: tułów + dwa skrzydła na ptaka, machanie): dwa stada krążą nad
   miastem, jedno nad portem, jedno w pobliżu gracza. Co kilka sekund ptak w pobliżu „zrzuca balast”: kropla spada
   z grawitacją, w miejscu trafienia (ziemia, dach, auto) zostaje biała plama, która blednie i znika po kilku
   sekundach; trafienie w gracza / szybę auta — komunikat i plama na ekranie.
   --------------------------------------------------------------- */
const BIRD_FLOCKS = [
  { n: 8, alt: 55, r: 140, cx: -60, cz: 40,   w: 0.05, ph: 0 },          // nad miastem
  { n: 7, alt: 48, r: 110, cx: 120, cz: -120, w: -0.06, ph: 2 },
  { n: 9, alt: 32, r: 60,  cx: 0,   cz: -360, w: 0.08, ph: 4 },          // nad portem
  { n: 7, alt: 30, r: 45,  follow: true, w: 0.09, ph: 1 }                // w pobliżu gracza
];
const birds = [];
BIRD_FLOCKS.forEach((f, fi) => { for (let k = 0; k < f.n; k++) birds.push({ f: f, off: new THREE.Vector3(rand(-9, 9), rand(-3, 3), rand(-9, 9)), flap: rand(0, TAU), fr: rand(7, 10), pos: new THREE.Vector3(), prev: new THREE.Vector3(), head: 0, span: rand(0.7, 0.9) }); });
const _birdGeo = new THREE.BufferGeometry();
_birdGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(birds.length * 27), 3));
_birdGeo.setAttribute('color', new THREE.Float32BufferAttribute((function(){
  const c = new Float32Array(birds.length * 27), W = [0.95, 0.95, 0.94], G = [0.62, 0.64, 0.67], D = [0.18, 0.19, 0.2];
  for (let b = 0; b < birds.length; b++){
    const v = [W, W, W, W, G, D, W, G, D];                      // tułów biały, skrzydła szare z ciemną końcówką
    v.forEach((col, i) => c.set(col, b * 27 + i * 3));
  }
  return c;
})(), 3));
const birdMesh = new THREE.Mesh(_birdGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
birdMesh.frustumCulled = false; scene.add(birdMesh);

/* krople i plamy */
const _dropGeo = new THREE.SphereGeometry(0.12, 6, 5), _dropMat = new THREE.MeshBasicMaterial({ color: 0xf6f6f2 });
const drops = [], splats = [];
let _dropT = rand(4, 8);
const splatEl = document.getElementById('birdSplat');
let _splatScreenT = 0;
function splatAt(x, y, z, nx, ny, nz){
  const r = rand(0.45, 1.0), n = 12, pts = [];
  for (let k = 0; k < n; k++){ const a = k / n * TAU, rr = r * rand(0.6, 1.25); pts.push(new THREE.Vector2(Math.cos(a) * rr, Math.sin(a) * rr)); }
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xf4f4ef, transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
  m.position.set(x + nx * 0.03, y + ny * 0.03, z + nz * 0.03);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(nx, ny, nz));
  m.rotateZ(rand(0, TAU));
  scene.add(m); splats.push({ m: m, t: 0, life: rand(6, 9) });
  if (splats.length > 16){ const s = splats.shift(); scene.remove(s.m); s.m.geometry.dispose(); s.m.material.dispose(); }
}
function splatScreen(msg){
  hudToast(msg, 2.5);
  if (splatEl){ splatEl.style.left = rand(25, 65) + '%'; splatEl.style.top = rand(20, 55) + '%'; splatEl.classList.add('on'); _splatScreenT = 3; }
}
function birdDrop(b){
  const m = new THREE.Mesh(_dropGeo, _dropMat); m.position.copy(b.pos); scene.add(m);
  const v = b.pos.clone().sub(b.prev).multiplyScalar(30);                       // prędkość ptaka (ok. 1/30 s między klatkami)
  drops.push({ m: m, v: new THREE.Vector3(clamp(v.x, -8, 8), 0, clamp(v.z, -8, 8)), t: 0 });
}
function updateBirds(dt){
  const t = clock, pp = playerWorldPos();
  const pos = _birdGeo.attributes.position.array;
  birds.forEach((b, i) => {
    const f = b.f, a = t * f.w + f.ph;
    const cx = f.follow ? pp.x : f.cx, cz = f.follow ? pp.z : f.cz;
    const r = f.r * (0.85 + 0.15 * Math.sin(t * 0.13 + f.ph));
    b.prev.copy(b.pos);
    b.pos.set(cx + Math.cos(a) * r + b.off.x + Math.sin(t * 0.7 + i) * 2, f.alt + b.off.y + Math.sin(t * 0.5 + i * 1.3) * 2, cz + Math.sin(a) * r + b.off.z + Math.cos(t * 0.6 + i) * 2);
    if (f.follow) b.pos.y = Math.max(b.pos.y, (pp.y || 0) + 22);
    const dx = b.pos.x - b.prev.x, dz = b.pos.z - b.prev.z;
    if (dx * dx + dz * dz > 1e-6) b.head = Math.atan2(dx, dz);
    b.flap += dt * b.fr;
    const fl = Math.sin(b.flap) * 0.55, s = b.span, ch = Math.cos(b.head), sh = Math.sin(b.head);
    /* lokalnie: przód +z, bok +x; P(lx, ly, lz) -> świat */
    const K = 1.6, P = (lx, ly, lz, o) => { lx *= K; ly *= K; lz *= K; pos[o] = b.pos.x + lx * ch + lz * sh; pos[o + 1] = b.pos.y + ly; pos[o + 2] = b.pos.z - lx * sh + lz * ch; };   // mewa ~2.5 m rozpiętości (czytelna z dołu)
    const o = i * 27;
    P(0, 0.05, 0.45, o); P(-0.09, 0, -0.35, o + 3); P(0.09, 0, -0.35, o + 6);                              // tułów
    P(0, 0, 0.18, o + 9); P(0, 0, -0.12, o + 12); P(s * 1.2, fl * s, -0.1, o + 15);                          // skrzydło lewe
    P(0, 0, 0.18, o + 18); P(0, 0, -0.12, o + 21); P(-s * 1.2, fl * s, -0.1, o + 24);                        // skrzydło prawe
  });
  _birdGeo.attributes.position.needsUpdate = true;
  /* zrzut: losowo, ptak w promieniu 90 m od gracza */
  _dropT -= dt;
  if (_dropT <= 0){
    _dropT = rand(5, 12);
    const near = birds.filter(b => Math.hypot(b.pos.x - pp.x, b.pos.z - pp.z) < 90);
    if (near.length) birdDrop(near[randInt(0, near.length - 1)]);
  }
  for (let i = drops.length - 1; i >= 0; i--){
    const d = drops[i], p = d.m.position, x0 = p.x, y0 = p.y, z0 = p.z;
    d.t += dt; d.v.y -= 9.8 * dt;
    p.addScaledVector(d.v, dt);
    /* trafienie gracza (pieszo) albo auta gracza */
    const pb = mode === 'foot' ? player.body.position : null;
    if (pb && Math.hypot(p.x - pb.x, p.z - pb.z) < 0.55 && p.y < pb.y + 1.0 && p.y > pb.y - 1.0){ splatScreen('Ptak trafił prosto w ciebie!'); scene.remove(d.m); drops.splice(i, 1); continue; }
    if (mode === 'car'){ const c = chassisBody.position; if (Math.hypot(p.x - c.x, p.z - c.z) < 1.4 && p.y < c.y + 1.3 && p.y > c.y - 0.6){ splatScreen('Ptak trafił w szybę!'); scene.remove(d.m); drops.splice(i, 1); continue; } }
    const h = rayHit(x0, y0, z0, p.x, p.y, p.z, G_WORLD | G_CAR);
    if (h){
      const n = h.hitNormalWorld, mov = h.body && (h.body.npcRef || h.body.isBoat || h.body.isPlane || h.body.type === CANNON.Body.KINEMATIC);
      if (!mov) splatAt(h.hitPointWorld.x, h.hitPointWorld.y, h.hitPointWorld.z, n.x, n.y, n.z);   // na ruchomym (auto, łódź) bez plamy w powietrzu
      scene.remove(d.m); drops.splice(i, 1); continue;
    }
    if ((p.y < WATER_Y && !isLand(p.x, p.z)) || d.t > 12){ scene.remove(d.m); drops.splice(i, 1); }
  }
  for (let i = splats.length - 1; i >= 0; i--){
    const s = splats[i]; s.t += dt;
    s.m.material.opacity = 0.95 * clamp((s.life - s.t) / 2.5, 0, 1);
    if (s.t > s.life){ scene.remove(s.m); s.m.geometry.dispose(); s.m.material.dispose(); splats.splice(i, 1); }
  }
  if (_splatScreenT > 0){ _splatScreenT -= dt; if (_splatScreenT <= 0 && splatEl) splatEl.classList.remove('on'); }
}
