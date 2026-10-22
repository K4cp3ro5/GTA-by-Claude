/* ---------------------------------------------------------------
   11c. EKWIPUNEK / BROŃ — pięści, kij, pistolet, karabin (ogień ciągły).
   Broń palna: kamera „zza ramienia” (postać z lewej, celownik na środku ekranu nigdy nie zasłonięty — jak
   w strzelankach TPP), postać obraca się w stronę celownika, PPM = przycelowanie (bliżej, węższe pole widzenia,
   mniejszy rozrzut, wolniejszy chód). Strzał: promień z kamery przez środek ekranu (piesi — siatki THREE,
   świat, auta, samoloty, łodzie — promień cannon), potem sprawdzenie z lufy, czy po drodze nie ma ściany.
   Rozrzut rośnie w ruchu i przy serii, odrzut podbija kamerę. Efekty: błysk z lufy, smugacz, pył / iskry.
   --------------------------------------------------------------- */
const WEAPON_DEFS = [
  { id:'fists',  name:'Pięści',   kind:'melee',  range:1.7, dmg:14, cooldown:0.42 },
  { id:'bat',    name:'Kij',      kind:'melee',  range:2.1, dmg:30, cooldown:0.55 },
  { id:'pistol', name:'Pistolet', kind:'ranged', range:70,  dmg:40, cooldown:0.2,  magSize:12, reloadT:1.1, spread:0.010, kick:0.028, bloom:0.55, muzzle:0.2 },
  { id:'rifle',  name:'Karabin',  kind:'ranged', range:160, dmg:28, cooldown:0.095, magSize:30, reloadT:1.8, spread:0.008, kick:0.011, bloom:0.22, muzzle:0.8, auto:true },
  { id:'rpgh',   name:'RPG naprowadzane', kind:'ranged', range:1000, dmg:0, cooldown:0.9, magSize:1, reloadT:2.6, spread:0.002, kick:0.07, bloom:0.1, muzzle:1.0, projectile:true, homing:true },
];
const weaponRay = new THREE.Raycaster();
let infAmmo = false;                                                            // menu deweloperskie

/* modele w układzie „naturalnym” (lufa +Z, góra +Y, dłoń na chwycie w 0,0,0); broń palna wisi na osobnym przegubie
   przed klatką piersiową postaci (gunPivot), pochylonym wg celowania — ręce sięgają do chwytu i łoża */
const _wMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 55, specular: 0x444444 });
function weaponMesh(parts, scale){
  const inner = new THREE.Mesh(mergeColored(parts), _wMat); inner.castShadow = true;
  inner.scale.setScalar(scale || 1);
  const g = new THREE.Group(); g.add(inner); return g;
}
function buildPistolMesh(){
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d), BLK = 0x1b1c1f, STEEL = 0x45484e, FR = 0x26282c;
  return weaponMesh([
    { geo: B(0.032, 0.115, 0.046), color: BLK, x: 0, y: -0.005, z: -0.012, rx: -0.26 },      // chwyt
    { geo: B(0.034, 0.03, 0.17), color: FR, x: 0, y: 0.052, z: 0.052 },                       // szkielet
    { geo: B(0.036, 0.036, 0.192), color: STEEL, x: 0, y: 0.085, z: 0.055 },                 // zamek
    { geo: B(0.02, 0.02, 0.012), color: 0x0c0c0d, x: 0, y: 0.08, z: 0.153 },                  // wylot lufy
    { geo: B(0.012, 0.032, 0.045), color: BLK, x: 0, y: 0.022, z: 0.05 },                     // kabłąk spustu
    { geo: B(0.007, 0.01, 0.007), color: 0xdcdcdc, x: 0, y: 0.107, z: 0.142 },                // muszka
    { geo: B(0.024, 0.01, 0.009), color: BLK, x: 0, y: 0.107, z: -0.03 },                     // szczerbinka
    { geo: B(0.037, 0.012, 0.05), color: 0x2f3237, x: 0, y: 0.09, z: -0.02 }                  // ząbkowanie zamka
  ], 1.3);
}
function buildRifleMesh(){
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d), BLK = 0x1b1c1f, REC = 0x2c2e33, OL = 0x4a4d3c;
  const scope = new THREE.CylinderGeometry(0.024, 0.024, 0.17, 10); scope.rotateX(Math.PI / 2);
  const lens = new THREE.CylinderGeometry(0.03, 0.03, 0.04, 10); lens.rotateX(Math.PI / 2);
  const brl = new THREE.CylinderGeometry(0.011, 0.011, 0.24, 8); brl.rotateX(Math.PI / 2);
  return weaponMesh([
    { geo: B(0.03, 0.1, 0.045), color: BLK, x: 0, y: -0.035, z: 0, rx: -0.3 },               // chwyt pistoletowy
    { geo: B(0.05, 0.075, 0.34), color: REC, x: 0, y: 0.05, z: 0.07 },                       // komora zamkowa
    { geo: B(0.032, 0.014, 0.3), color: BLK, x: 0, y: 0.094, z: 0.08 },                      // szyna
    { geo: B(0.058, 0.062, 0.27), color: OL, x: 0, y: 0.046, z: 0.37 },                      // łoże
    { geo: brl, color: BLK, x: 0, y: 0.05, z: 0.6 },                                          // lufa
    { geo: B(0.03, 0.03, 0.055), color: BLK, x: 0, y: 0.05, z: 0.735 },                      // hamulec wylotowy
    { geo: B(0.036, 0.17, 0.062), color: BLK, x: 0, y: -0.06, z: 0.165, rx: 0.22 },          // magazynek
    { geo: B(0.04, 0.068, 0.25), color: REC, x: 0, y: 0.032, z: -0.215 },                    // kolba
    { geo: B(0.046, 0.12, 0.03), color: BLK, x: 0, y: 0.012, z: -0.345 },                    // stopka kolby
    { geo: scope, color: 0x151618, x: 0, y: 0.13, z: 0.08 },                                  // luneta
    { geo: lens, color: 0x101820, x: 0, y: 0.13, z: 0.18 }, { geo: lens, color: 0x101820, x: 0, y: 0.13, z: -0.02 },
    { geo: B(0.012, 0.03, 0.04), color: BLK, x: 0, y: 0.022, z: 0.05 },                      // kabłąk
    { geo: B(0.02, 0.05, 0.02), color: BLK, x: 0, y: 0.1, z: 0.47 }                          // muszka
  ], 1.05);
}
/* granatnik RPG: rura z wylotem, chwyt i spust, celownik, głowica (osobna siatka — znika po strzale do przeładowania) */
function buildRpgMesh(homing){
  const tube = new THREE.CylinderGeometry(0.075, 0.075, 1.25, 12); tube.rotateX(Math.PI / 2);
  const bell = new THREE.CylinderGeometry(0.11, 0.08, 0.22, 12); bell.rotateX(Math.PI / 2);
  const g = weaponMesh([
    { geo: tube, color: homing ? 0x3b4250 : 0x4a5a3a, x: 0, y: 0.08, z: 0.1 }, { geo: bell, color: 0x2a2c30, x: 0, y: 0.08, z: -0.6 },
    { geo: new THREE.BoxGeometry(0.04, 0.13, 0.06), color: 0x1b1c1f, x: 0, y: -0.03, z: 0 }, { geo: new THREE.BoxGeometry(0.04, 0.12, 0.05), color: 0x1b1c1f, x: 0, y: -0.02, z: 0.32 },
    { geo: new THREE.BoxGeometry(0.06, 0.1, 0.12), color: 0x1b1c1f, x: -0.08, y: 0.17, z: 0.12 }, { geo: new THREE.BoxGeometry(0.16, 0.03, 0.3), color: 0x6b5a3a, x: 0, y: 0.0, z: -0.25 }
  ], 1);
  const hc = new THREE.ConeGeometry(0.11, 0.32, 10); hc.rotateX(Math.PI / 2);
  const hb = new THREE.CylinderGeometry(0.07, 0.07, 0.18, 10); hb.rotateX(Math.PI / 2);
  const head = new THREE.Mesh(mergeColored([{ geo: hc, color: homing ? 0xc8ccd2 : 0x5d6b45, z: 0.97 }, { geo: hb, color: homing ? 0xc0392b : 0x3a4430, z: 0.74 }]), _wMat);
  if (homing){ const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.16), new THREE.MeshBasicMaterial({ color: 0x40ff70 })); eye.position.set(0.1, 0.18, 0.15); g.add(eye); }
  head.position.y = 0.08; head.castShadow = true; g.add(head); g.userData.head = head;
  return g;
}
/* kij baseballowy: jedna bryła obrotowa (profil gałka → rączka → stożek → beczka → zaokrąglony koniec), punkt mocowania
   w dłoni = lokalne y = 0, kij w −Y; owijka na rączce, słoje drewna (pasy wzdłuż), wypalony znak i ciemniejszy koniec */
function buildBatMesh(){
  const prof = [[0, 0.07], [0.03, 0.07], [0.036, 0.06], [0.034, 0.045], [0.021, 0.035], [0.019, 0.0], [0.019, -0.2], [0.021, -0.3],
    [0.028, -0.42], [0.037, -0.54], [0.044, -0.64], [0.047, -0.74], [0.047, -0.8], [0.044, -0.83], [0.034, -0.85], [0, -0.855]];
  const geo = new THREE.LatheGeometry(prof.reverse().map(p => new THREE.Vector2(p[0], p[1])), 18);   // profil od dołu do góry — ściany na zewnątrz
  const ring = (y, a, b) => y < a && y > b;
  const fn = (x, y, z) => {
    if (y > -0.24) return ring(y, 0.075, 0.034) ? 0x1a1b1e : (Math.floor((y + 0.4) * 55) % 2 ? 0x2b2d33 : 0x22242a);   // gałka, owijka (paski taśmy)
    if (ring(y, -0.6, -0.69) && x > 0.02 && Math.abs(z) < 0.03) return 0x3a2412;                                          // wypalony znak
    if (y < -0.825) return 0x6e4a26;                                                                                       // koniec beczki
    const a = Math.atan2(z, x), grain = Math.sin(a * 7 + y * 3) + Math.sin(a * 13 - y * 9) * 0.5;
    return grain > 0.9 ? 0x9a7240 : grain < -0.9 ? 0xc89c62 : 0xb58a52;                                                    // słoje
  };
  const m = new THREE.Mesh(mergeColored([{ geo: geo, color: 0xb58a52, colorFn: fn, quads: true }]), new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.castShadow = true;
  const g = new THREE.Group(); g.add(m);
  return g;
}

/* efekty strzału (proste siatki dodawane do sceny — bez nowych świateł, żeby nie przekompilowywać shaderów) */
const _tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
const _flashMat = new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
const _tracerGeo = new THREE.BoxGeometry(0.025, 0.025, 1);
const _flashGeo = new THREE.SphereGeometry(1, 8, 6);
const shotFx = [];
function shotFxAdd(m, life){ scene.add(m); shotFx.push({ m: m, t: 0, life: life }); }
function updateShotFx(dt){
  for (let i = shotFx.length - 1; i >= 0; i--){
    const f = shotFx[i]; f.t += dt;
    if (f.t >= f.life){ scene.remove(f.m); if (f.m.material !== _tracerMat && f.m.material !== _flashMat) f.m.material.dispose(); shotFx.splice(i, 1); continue; }
    const k = f.t / f.life;
    if (f.puff){ f.m.position.addScaledVector(f.puff, dt); f.m.scale.setScalar(f.r * (1 + k * 2.5)); f.m.material.opacity = 0.6 * (1 - k); }
    else f.m.visible = k < 0.999;
  }
}
const _wA = new THREE.Vector3(), _wB = new THREE.Vector3(), _wD = new THREE.Vector3(), _wO = new THREE.Vector3(), _wM = new THREE.Vector3(), _wT = new THREE.Vector3();

const Weapons = {
  idx: 0, ammo: {},
  cooldown: 0, swingT: 0, recoil: 0, bloom: 0, reloadT: 0, hitMark: 0,
  aimK: 0, adsK: 0, ads: false,
  meshes: {},

  init(){
    this.meshes.bat = buildBatMesh();
    this.meshes.pistol = buildPistolMesh();
    this.meshes.rifle = buildRifleMesh();
    this.meshes.rpgh = buildRpgMesh(true);
    this.meshes.bat.position.set(0, -0.63, 0.02); player.armR.add(this.meshes.bat);
    this.pivot = new THREE.Group(); player.mesh.add(this.pivot);
    this.pivot.add(this.meshes.pistol); this.pivot.add(this.meshes.rifle); this.pivot.add(this.meshes.rpgh); this.pivot.add(this.meshes.rpgh);
    for (const id in this.meshes) this.meshes[id].visible = false;
    WEAPON_DEFS.forEach(d => { if (d.kind === 'ranged') this.ammo[d.id] = { mag: d.magSize }; });   // magazynków bez limitu — liczy się tylko zawartość bieżącego
  },
  def(){ return WEAPON_DEFS[this.idx]; },
  armed(){ return this.idx !== 0; },
  /* broń palna w dłoni, pieszo: kamera zza ramienia i postać zwrócona w stronę celownika; pod otwartą czaszą tylko przy PPM
     (bez celowania kamera zostaje za czaszą), w swobodnym spadku — nie */
  aiming(){
    if (mode !== 'foot' || this.def().kind !== 'ranged' || player.dead) return false;
    if (typeof parachute !== 'undefined' && parachute.on) return parachute.t > 0.7 && !!mouseDownR;
    return true;
  },
  /* namierzanie RPG trwa tylko przy przycelowaniu (PPM) */
  locking(){ return !!this.def().homing && this.aiming() && pointerLocked && !!mouseDownR; },

  select(i){
    if (i < 0 || i >= WEAPON_DEFS.length) return;
    for (const id in this.meshes) this.meshes[id].visible = false;
    this.idx = i; this.reloadT = 0;
    const id = this.def().id;
    if (this.meshes[id]) this.meshes[id].visible = true;
    player.armR.rotation.set(0, 0, 0); player.armL.rotation.set(0, 0, 0);
  },
  cycle(dir){ this.select(((this.idx + dir) % WEAPON_DEFS.length + WEAPON_DEFS.length) % WEAPON_DEFS.length); },
  holster(){ this.select(0); },
  fillAmmo(){ WEAPON_DEFS.forEach(d => { if (d.kind === 'ranged') this.ammo[d.id].mag = d.magSize; }); this.reloadT = 0; },

  trigger(){
    if (mode !== 'foot' || player.dead || this.cooldown > 0 || this.reloadT > 0) return;
    const d = this.def();
    if (d.kind === 'melee'){
      this.swingT = 1;
      this.cooldown = d.cooldown;
      Sound.swing();
      this._meleeHit(d);
      return;
    }
    const a = this.ammo[d.id];
    if (a.mag <= 0){ this.reload(); return; }
    if (!infAmmo) a.mag--;
    this.recoil = 1;
    this.cooldown = d.cooldown;
    Sound.shoot(d.id !== 'pistol');
    Pedestrians.scare(player.body.position.x, player.body.position.z, 40);
    npcPanicAt(player.body.position.x, player.body.position.z);
    this._fire(d);
    /* odrzut: kamera w górę (przy przycelowaniu słabiej), lekko na boki; rozrzut rośnie przy serii */
    const kk = d.kick * (this.ads ? 0.6 : 1);
    camPitch = clamp(camPitch + kk, -0.95, 0.62); camYaw += (Math.random() - 0.5) * kk * 0.6;
    this.bloom = Math.min(1.6, this.bloom + d.bloom);
    if (a.mag <= 0) setTimeout(() => this.reload(), 180);
  },
  reload(){
    const d = this.def(); if (d.kind !== 'ranged' || this.reloadT > 0) return;
    const a = this.ammo[d.id];
    if (a.mag >= d.magSize) return;
    this.reloadT = d.reloadT;
    Sound.reload();
  },
  _finishReload(){
    const d = this.def(), a = this.ammo[d.id]; if (!a) return;
    a.mag = d.magSize;
  },
  /* aktualny rozrzut (rad): baza × seria × ruch × przycelowanie */
  spread(){
    const d = this.def(); if (d.kind !== 'ranged') return 0;
    const mv = clamp(player.speed / 4.3, 0, 1.8), air = player.grounded ? 0 : 1.5;
    return d.spread * (1 + this.bloom * 2.2 + mv * 1.4 + air) * (this.ads ? 0.4 : 1);
  },
  _muzzle(out){
    const d = this.def(), m = this.meshes[d.id];
    m.updateWorldMatrix(true, false);
    return out.set(0, d.id === 'rifle' ? 0.05 : d.projectile ? 0.08 : 0.1, d.muzzle).applyMatrix4(m.matrixWorld);
  },
  _fire(d){
    /* promień z kamery przez środek ekranu (z rozrzutem), początek przy postaci — nic za plecami nie blokuje */
    camera.getWorldDirection(_wD);
    const sp = this.spread();
    _wT.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2 * sp); _wD.add(_wT).normalize();
    const pb = player.body.position;
    _wO.copy(camera.position);
    const t0 = Math.max(0, (pb.x - _wO.x) * _wD.x + (pb.y + 0.6 - _wO.y) * _wD.y + (pb.z - _wO.z) * _wD.z);
    _wO.addScaledVector(_wD, t0);
    let dist = d.range, hitPed = null, hitBody = null, nrm = null;
    weaponRay.set(_wO, _wD); weaponRay.far = d.range;
    const ph = weaponRay.intersectObjects(Pedestrians.meshes(), true);
    if (ph.length){ dist = ph[0].distance; hitPed = ph[0].object; }
    let hitCat = null;
    if (typeof CATS !== 'undefined'){ const ch = weaponRay.intersectObjects(CATS.filter(c => !c.dead && c.m.g.visible).map(c => c.m.g), true); if (ch.length && ch[0].distance < dist){ dist = ch[0].distance; hitPed = null; let o = ch[0].object; while (o && !o.userData.catRef) o = o.parent; hitCat = o ? o.userData.catRef : null; } }
    _wB.copy(_wO).addScaledVector(_wD, d.range);
    const h = rayHit(_wO.x, _wO.y, _wO.z, _wB.x, _wB.y, _wB.z, G_WORLD | G_CAR | G_PLANE);
    if (h && h.distance < dist){ dist = h.distance; hitPed = null; hitCat = null; hitBody = h.body; nrm = h.hitNormalWorld; }
    _wB.copy(_wO).addScaledVector(_wD, dist);
    this._muzzle(_wM);
    if (d.projectile){                                                       // RPG: rakieta z lufy w punkt pod celownikiem
      fireRocket(_wM, _wT.copy(_wB).sub(_wM).normalize(), d.homing && this.lock && this.lockT >= LOCK_TIME ? this.lock : null);
      this.lock = null; this.lockT = 0;
      for (let k = 0; k < 5; k++){ const s = fxMesh(0xcfcac0, 0.55, false); s.position.copy(_wM).addScaledVector(_wT, -1.6 - k * 0.4); fxAdd({ kind: 'smoke', m: s, t: 0, life: 1.2, rise: 0.4, r0: 0.4 }); }   // podmuch z tyłu
      this._effects(_wM, _wM, null, null);
      return;
    }
    /* z lufy do punktu trafienia: ściana tuż przed postacią przejmuje strzał */
    const mh = rayHit(_wM.x, _wM.y, _wM.z, _wB.x, _wB.y, _wB.z, G_WORLD);
    if (mh && mh.distance < _wM.distanceTo(_wB) - 0.3){ _wB.set(mh.hitPointWorld.x, mh.hitPointWorld.y, mh.hitPointWorld.z); hitPed = null; hitCat = null; hitBody = mh.body; nrm = mh.hitNormalWorld; }
    if (hitCat){ this._effects(_wM, _wB, 'ped', null); catHarmed(hitCat, 'strzał'); return; }
    /* skutki */
    if (hitPed){ Pedestrians.hitMesh(hitPed, d.dmg); this.hitMark = 1; }
    else if (hitBody && vehicleBulletHit(hitBody, d.dmg)) this.hitMark = 1;       // auta: NPC, twoje, zaparkowane (destruction.js)
    const metal = hitBody && (hitBody.npcRef || hitBody.isPlane || hitBody.isBoat || hitBody === chassisBody || parkedCars.some(q => q.body === hitBody));
    this._effects(_wM, _wB, hitPed ? 'ped' : hitBody ? (metal ? 'metal' : 'dust') : null, nrm);
  },
  _effects(from, to, kind, nrm){
    const len = from.distanceTo(to);
    if (len > 1.5){
      const t = new THREE.Mesh(_tracerGeo, _tracerMat);
      t.position.copy(from).lerp(to, 0.5); t.scale.set(1, 1, len); t.lookAt(to);
      shotFxAdd(t, 0.05);
    }
    const f = new THREE.Mesh(_flashGeo, _flashMat); f.position.copy(from); f.scale.setScalar(this.def().projectile ? 0.25 : this.def().id === 'rifle' ? 0.075 : 0.06);
    shotFxAdd(f, 0.045);
    if (!kind) return;
    for (let k = 0; k < (kind === 'metal' ? 4 : 3); k++){
      const p = new THREE.Mesh(_flashGeo, new THREE.MeshBasicMaterial({ color: kind === 'metal' ? 0xffd27a : kind === 'ped' ? 0x8e1b16 : 0xb8b0a2, transparent: true, opacity: 0.6, depthWrite: false, blending: kind === 'metal' ? THREE.AdditiveBlending : THREE.NormalBlending }));
      p.position.copy(to);
      const o = { m: p, t: 0, life: kind === 'metal' ? 0.18 : 0.45, r: kind === 'metal' ? 0.04 : 0.09, puff: new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2) };
      if (nrm) o.puff.add(_wT.set(nrm.x, nrm.y, nrm.z).multiplyScalar(kind === 'metal' ? 4 : 1.5));
      p.scale.setScalar(o.r); scene.add(p); shotFx.push(o);
    }
  },
  _meleeHit(d){
    const p = player.body.position;
    for (const n of Pedestrians.list){
      if (n.state === 'down') continue;
      const dx = n.pos.x - p.x, dz = n.pos.y - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist > d.range) continue;
      const ang = Math.atan2(dx, dz);
      let diff = ang - player.facing;
      while (diff >  Math.PI) diff -= TAU;
      while (diff < -Math.PI) diff += TAU;
      if (Math.abs(diff) < 0.9) Pedestrians.hit(n, d.dmg, true);
    }
    if (typeof CATS !== 'undefined') for (const c of CATS){                      // cios w kota
      if (c.dead || Math.hypot(c.x - p.x, c.z - p.z) > d.range + 0.3) continue;
      if (Math.abs(wrapAngle(Math.atan2(c.x - p.x, c.z - p.z) - player.facing)) < 0.9){ catHarmed(c, 'cios'); return; }
    }
  },
  /* namierzanie (RPG naprowadzane, jak w GTA V): po przycelowaniu (PPM) cele w KWADRATOWEJ strefie na środku ekranu (połowa boku =
     LOCK_ZONE × wysokość ekranu), do LOCK_RANGE = 1 km, widoczne; wybierany najbliższy środka (zasłonięty — następny); utrzymany LOCK_TIME =
     namierzony. Widoczność (długi raycast przez komórki kolizji) sprawdzana co 0.15 s dla trzech najlepszych kandydatów. */
  updateLock(dt){
    if (!this.locking()){ this.lock = null; this.lockT = 0; return; }
    const cp = camera.position, half = LOCK_ZONE * innerHeight, cand = [];
    for (const t of lockTargets()){
      const p = lockTargetPos(t); if (!p) continue;
      const l = Math.hypot(p.x - cp.x, p.y - cp.y, p.z - cp.z);
      if (l < 6 || l > LOCK_RANGE) continue;
      _wA.set(p.x, p.y, p.z).project(camera); if (_wA.z > 1) continue;
      const sx = _wA.x * innerWidth / 2, sy = _wA.y * innerHeight / 2;                          // piksele od środka ekranu
      if (Math.abs(sx) > half || Math.abs(sy) > half) continue;
      cand.push({ t: t, l: l, s: Math.hypot(sx, sy) + l * 0.02 + (this.lock && t.o === this.lock.o ? -40 : 0) });   // bliżej środka i gracza; obecny cel ma przewagę
    }
    cand.sort((a, b) => a.s - b.s);
    this._losT = (this._losT || 0) - dt;
    if (this._losT <= 0 || !this._hidden){
      this._losT = 0.15; this._hidden = new Set();
      for (const q of cand.slice(0, 3)){ const p = lockTargetPos(q.t), h = rayHit(cp.x, cp.y, cp.z, p.x, p.y, p.z, G_WORLD); if (h && h.distance < q.l - 3) this._hidden.add(q.t.o); }
    }
    const bq = cand.find(q => !this._hidden.has(q.t.o)), best = bq ? bq.t : null;                // pierwszy niezasłonięty
    this.lockDist = bq ? bq.l : 0;
    if (best && this.lock && best.o === this.lock.o){ const was = this.lockT; this.lockT += dt; if (was < LOCK_TIME && this.lockT >= LOCK_TIME) Sound.tick(true); }
    else { this.lock = best; this.lockT = 0; }
  },
  updatePose(dt){
    updateShotFx(dt);
    this.updateLock(dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.swingT   = Math.max(0, this.swingT - dt * 2.4);
    this.recoil   = Math.max(0, this.recoil - dt * 9);
    this.bloom    = Math.max(0, this.bloom - dt * (this.def().auto ? 1.6 : 2.4));
    this.hitMark  = Math.max(0, this.hitMark - dt * 5);
    if (this.reloadT > 0){ this.reloadT -= dt; if (this.reloadT <= 0){ this.reloadT = 0; this._finishReload(); } }
    const aim = this.aiming() && pointerLocked;
    this.ads = aim && !!mouseDownR;
    this.aimK = damp(this.aimK, aim ? 1 : 0, 10, dt);
    this.adsK = damp(this.adsK, this.ads ? 1 : 0, 12, dt);
    if (aim && mouseDown && this.def().auto) this.trigger();                    // ogień ciągły (karabin)
    if (!this.armed() || mode !== 'foot') return;
    const d = this.def(); if (!d) return;
    if (d.kind === 'melee'){
      player.armR.rotation.x = -0.35 - this.swingT * 1.6;
      player.armR.rotation.y = this.swingT * -0.8;
      player.armR.rotation.z = 0.12;
      return;
    }
    /* postać w stronę celownika; broń przed klatką (karabin: kolba przy prawym barku, pistolet: oburącz na
       wyciągniętych rękach), pochylona wg kamery; przy przeładowaniu opuszczona i przechylona */
    const aim2 = this.aiming();
    if (aim2){ player.facing = angleDamp(player.facing, camYaw + Math.PI, 18, dt); player.mesh.rotation.y = player.facing; }
    const rel = this.reloadT > 0 ? Math.sin(Math.PI * clamp(1 - this.reloadT / d.reloadT, 0, 1)) : 0;
    const rpg = d.id === 'rpg' || d.id === 'rpgh', e = (aim2 ? clamp(camPitch * 0.85 + 0.08, -0.7, 0.75) : -0.55) * (rpg ? 0.8 : 1) - rel * (rpg ? 0.3 : 0.6), rifle = d.id === 'rifle';
    const P = this.pivot, back = this.recoil * (rifle ? 0.04 : rpg ? 0.12 : 0.06);
    if (rpg) P.position.set(-0.3, 1.5 + Math.sin(e) * 0.15, 0.12 - back);                               // RPG na prawym barku
    else P.position.set(rifle ? -0.06 : 0, (rifle ? 1.22 : 1.3) + Math.sin(e) * (rifle ? 0.1 : 0.45), (rifle ? 0.42 : Math.cos(e) * 0.48) - back);
    P.rotation.set(-e - this.recoil * (rifle ? 0.05 : rpg ? 0.1 : 0.18), 0, rel * 0.7, 'YXZ');
    if (rpg) this.meshes[d.id].userData.head.visible = this.ammo[d.id].mag > 0 && !(this.reloadT > 0 && this.reloadT > d.reloadT * 0.4);
    /* ręce: prawa do chwytu, lewa do łoża (karabin) / chwytu (pistolet) — kierunek od barku do punktu */
    P.updateMatrix();
    _wB.set(0, 0, 0).applyMatrix4(P.matrix);
    player.armR.quaternion.setFromUnitVectors(_down, _wA.copy(_wB).sub(player.armR.position).normalize());
    _wB.set(0, rifle || rpg ? 0.02 : -0.01, rpg ? 0.32 : rifle ? 0.3 : 0.02).applyMatrix4(P.matrix);
    player.armL.quaternion.setFromUnitVectors(_down, _wA.copy(_wB).sub(player.armL.position).normalize());
  },
  updateHud(){
    if (typeof invHud === 'function' && invHud()) return;                     // wędka / ryba w ręce (inventory.js)
    const d = this.def(), a = this.ammo[d.id];
    el.wname.textContent = d.name;
    el.wammo.textContent = d.kind === 'ranged' ? (this.reloadT > 0 ? 'PRZEŁADOWANIE' : String(a.mag)) : '';
    el.weaponhud.classList.toggle('on', mode === 'foot' && !player.dead);
    const on = mode === 'foot' && d.kind === 'ranged' && !player.dead;
    el.crosshair.classList.toggle('on', on);
    const lb = document.getElementById('lockBox'), lz = document.getElementById('lockZone');
    const lk = on && this.locking();
    lz.classList.toggle('on', lk); lz.style.setProperty('--s', (LOCK_ZONE * 2 * innerHeight) + 'px'); lz.classList.toggle('has', !!(this.lock && lk));
    if (this.lock && lk){
      const p = lockTargetPos(this.lock);
      if (p){ _wA.set(p.x, p.y, p.z).project(camera);
        if (_wA.z < 1){ lb.style.display = 'block'; lb.style.left = ((_wA.x + 1) / 2 * innerWidth) + 'px'; lb.style.top = ((1 - _wA.y) / 2 * innerHeight) + 'px';
          const locked = this.lockT >= LOCK_TIME; lb.classList.toggle('locked', locked); lb.style.setProperty('--k', locked ? 1 : 1.8 - this.lockT / LOCK_TIME * 0.8); lb.dataset.t = (locked ? 'NAMIERZONY' : 'NAMIERZANIE…') + ' · ' + Math.round(this.lockDist || 0) + ' m'; }
        else lb.style.display = 'none'; }
      else lb.style.display = 'none';
    } else lb.style.display = 'none';
    if (on){
      const px = Math.max(3, Math.tan(this.spread()) / Math.tan(camera.fov * Math.PI / 360) * innerHeight / 2);   // rozrzut w pikselach
      el.crosshair.style.setProperty('--gap', px.toFixed(1) + 'px');
      el.crosshair.classList.toggle('hit', this.hitMark > 0.05);
    }
  }
};
const _down = new THREE.Vector3(0, -1, 0), LOCK_TIME = 0.9, LOCK_ZONE = 0.17, LOCK_RANGE = 1000;
Weapons.init();

/* --- koło wyboru (radialne, sterowane wirtualnym kursorem — pointer lock nie daje pozycji bezwzględnej):
   broń (Q) albo pojazdy (V, vehicle-entry.js: VEHICLE_MENU) — ta sama mechanika i rysowanie --- */
let wheelOpen = false, wheelVX = 0, wheelVY = 0, wheelSel = 0, wheelMenu = null;
const wheelWrap = document.getElementById('wheelWrap');
const wheelCanvas = document.getElementById('wheelCanvas');
const wctx = wheelCanvas.getContext('2d');

function drawWheel(labels, off){
  const cx = 180, cy = 180, R = 130, r0 = 46, n = labels.length;
  wctx.clearRect(0, 0, 360, 360);
  for (let i = 0; i < n; i++){
    const a0 = -Math.PI/2 + i/n*TAU - Math.PI/n, a1 = -Math.PI/2 + i/n*TAU + Math.PI/n;
    wctx.beginPath();
    wctx.moveTo(cx + Math.cos(a0)*r0, cy + Math.sin(a0)*r0);
    wctx.arc(cx, cy, R, a0, a1);
    wctx.arc(cx, cy, r0, a1, a0, true);
    wctx.closePath();
    const dis = off && off[i];                                                // niedostępne (zniszczony pojazd — odliczanie)
    wctx.fillStyle = dis ? (i === wheelSel ? 'rgba(90,92,98,.9)' : 'rgba(40,41,46,.78)') : i === wheelSel ? 'rgba(255,176,58,.88)' : 'rgba(30,32,38,.8)';
    wctx.fill();
    wctx.strokeStyle = 'rgba(20,22,27,.9)'; wctx.lineWidth = 3; wctx.stroke();
    const mid = -Math.PI/2 + i/n*TAU;
    const lx = cx + Math.cos(mid)*(R+r0)/2, ly = cy + Math.sin(mid)*(R+r0)/2;
    wctx.fillStyle = dis ? '#8d8b86' : i === wheelSel ? '#14161b' : '#f2f0ea';
    wctx.font = '600 14px Inter, system-ui, sans-serif';
    wctx.textAlign = 'center'; wctx.textBaseline = 'middle';
    const parts = String(labels[i]).split(String.fromCharCode(10));
    parts.forEach((t, k) => { wctx.font = k ? '500 12px Inter, system-ui, sans-serif' : '600 14px Inter, system-ui, sans-serif'; wctx.fillText(t, lx, ly + (k - (parts.length - 1) / 2) * 16); });
  }
}

function updateWheel(){
  const was = wheelMenu, can = pointerLocked && mode === 'foot' && !player.dead;
  const menu = !can ? null : down('wheel') ? 'weapons' : down('vehicleWheel') ? 'vehicles' : null;
  if (menu && menu !== was){ wheelVX = 0; wheelVY = 0; wheelSel = menu === 'weapons' ? Weapons.idx : 0; }
  wheelMenu = menu; wheelOpen = !!menu;
  wheelWrap.classList.toggle('on', wheelOpen);
  if (menu){
    const blk = menu === 'vehicles' ? VEHICLE_MENU.map(m => carTypeBlocked(m.type)) : null;
    const labels = menu === 'weapons' ? WEAPON_DEFS.map(d => d.name) : VEHICLE_MENU.map((m, i) => blk[i] > 0 ? m.label + String.fromCharCode(10) + 'zniszczony · ' + Math.ceil(blk[i]) + ' s' : m.label), n = labels.length;
    if (Math.hypot(wheelVX, wheelVY) > 12){
      const ang = Math.atan2(wheelVY, wheelVX);
      let idx = Math.round((ang + Math.PI/2) / TAU * n);
      wheelSel = ((idx % n) + n) % n;
    }
    drawWheel(labels, blk && blk.map(b => b > 0));
  } else if (was === 'weapons') invSelectWeapon(wheelSel);
  else if (was === 'vehicles') vehicleMenuPick(wheelSel);
}
