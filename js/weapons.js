/* ---------------------------------------------------------------
   11c. EKWIPUNEK / BROŃ
   --------------------------------------------------------------- */
const WEAPON_DEFS = [
  { id:'fists',  name:'Pięści',   kind:'melee',  range:1.7, dmg:14, cooldown:0.42 },
  { id:'bat',    name:'Kij',      kind:'melee',  range:2.1, dmg:30, cooldown:0.55 },
  { id:'pistol', name:'Pistolet', kind:'ranged', range:42,  dmg:40, cooldown:0.22, magSize:12 }
];
const weaponRay = new THREE.Raycaster();

function buildPistolMesh(){
  const g = new THREE.Group();
  const dark  = new THREE.MeshLambertMaterial({ color:0x1c1d20 });
  const metal = new THREE.MeshPhongMaterial({ color:0x54575d, shininess:70 });
  function bx(w,h,d,mat,x,y,z){ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); m.position.set(x,y,z); m.castShadow=true; return m; }
  g.add(bx(0.07,0.17,0.055,dark,  0,-0.07,0));
  g.add(bx(0.055,0.06,0.24,metal, 0, 0.02,-0.11));
  g.add(bx(0.065,0.05,0.08,dark,  0,-0.01, 0.03));
  return g;
}
function buildBatMesh(){
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color:0x9c7a48 });
  const grip = new THREE.MeshLambertMaterial({ color:0x2a2a2a });
  function cy(rt,rb,h,mat,y){ const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,8),mat); m.position.set(0,y,0); m.castShadow=true; return m; }
  /* uchwyt tuż przy dłoni (blisko lokalnego y=0, punktu mocowania), grubszy
     koniec kija dalej — wcześniej było odwrotnie i wyglądało jakby postać
     trzymała kij za grubszy koniec */
  g.add(cy(0.018,0.022,0.22,grip, -0.11));
  g.add(cy(0.022,0.06, 0.55,wood, -0.495));
  return g;
}

const Weapons = {
  idx: 0, mag: 12, reserve: 48,
  cooldown: 0, swingT: 0, recoil: 0,
  meshes: {},

  init(){
    this.meshes.bat = buildBatMesh();
    this.meshes.pistol = buildPistolMesh();
    this.meshes.bat.visible = false;
    this.meshes.pistol.visible = false;
    this.meshes.bat.position.set(0, -0.60, 0.04);
    this.meshes.pistol.position.set(0, -0.60, 0.04);
    player.armR.add(this.meshes.bat);
    player.armR.add(this.meshes.pistol);
  },
  def(){ return WEAPON_DEFS[this.idx]; },
  armed(){ return this.idx !== 0; },

  select(i){
    if (i < 0 || i >= WEAPON_DEFS.length) return;
    if (this.meshes.bat) this.meshes.bat.visible = false;
    if (this.meshes.pistol) this.meshes.pistol.visible = false;
    this.idx = i;
    const id = this.def().id;
    if (this.meshes[id]) this.meshes[id].visible = true;
    player.armR.rotation.set(0, 0, 0);
  },
  cycle(dir){ this.select(((this.idx + dir) % WEAPON_DEFS.length + WEAPON_DEFS.length) % WEAPON_DEFS.length); },
  holster(){ this.select(0); },

  trigger(){
    if (mode !== 'foot' || player.dead || this.cooldown > 0) return;
    const d = this.def();
    if (d.kind === 'melee'){
      this.swingT = 1;
      this.cooldown = d.cooldown;
      Sound.swing();
      this._meleeHit(d);
    } else {
      if (this.mag <= 0){ this.reload(); return; }
      this.mag--;
      this.recoil = 1;
      this.cooldown = d.cooldown;
      Sound.shoot();
      this._rayHit(d);
    }
  },
  reload(){
    const d = this.def();
    if (d.kind !== 'ranged' || this.reserve <= 0 || this.mag >= d.magSize) return;
    const take = Math.min(d.magSize - this.mag, this.reserve);
    this.mag += take; this.reserve -= take;
    Sound.reload();
  },
  _rayHit(d){
    weaponRay.setFromCamera({ x:0, y:0 }, camera);
    weaponRay.far = d.range;
    const hits = weaponRay.intersectObjects(Pedestrians.meshes(), true);
    if (hits.length) Pedestrians.hitMesh(hits[0].object, d.dmg);
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
  },
  updatePose(dt){
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.swingT   = Math.max(0, this.swingT - dt * 2.4);
    this.recoil   = Math.max(0, this.recoil - dt * 6);
    if (this.armed() && mode === 'foot'){
      const d = this.def();
      const base = d.kind === 'melee' ? -0.35 : -0.20;
      player.armR.rotation.x = base - this.swingT * 1.6 + this.recoil * 0.2;
      player.armR.rotation.y = this.swingT * -0.8;
      player.armR.rotation.z = 0.12;
    }
  },
  updateHud(){
    const d = this.def();
    el.wname.textContent = d.name;
    el.wammo.textContent = d.kind === 'ranged' ? (this.mag + ' / ' + this.reserve) : '';
    el.weaponhud.classList.toggle('on', mode === 'foot');
    el.crosshair.classList.toggle('on', mode === 'foot' && d.kind === 'ranged');
  }
};
Weapons.init();

/* --- koło broni (radialne, sterowane wirtualnym kursorem — pointer lock nie daje pozycji bezwzględnej) --- */
let wheelOpen = false, wheelVX = 0, wheelVY = 0, wheelSel = 0;
const wheelWrap = document.getElementById('wheelWrap');
const wheelCanvas = document.getElementById('wheelCanvas');
const wctx = wheelCanvas.getContext('2d');

function drawWheel(){
  const cx = 180, cy = 180, R = 130, r0 = 46, n = WEAPON_DEFS.length;
  wctx.clearRect(0, 0, 360, 360);
  for (let i = 0; i < n; i++){
    const a0 = -Math.PI/2 + i/n*TAU - Math.PI/n, a1 = -Math.PI/2 + i/n*TAU + Math.PI/n;
    wctx.beginPath();
    wctx.moveTo(cx + Math.cos(a0)*r0, cy + Math.sin(a0)*r0);
    wctx.arc(cx, cy, R, a0, a1);
    wctx.arc(cx, cy, r0, a1, a0, true);
    wctx.closePath();
    wctx.fillStyle = i === wheelSel ? 'rgba(255,176,58,.88)' : 'rgba(30,32,38,.8)';
    wctx.fill();
    wctx.strokeStyle = 'rgba(20,22,27,.9)'; wctx.lineWidth = 3; wctx.stroke();
    const mid = -Math.PI/2 + i/n*TAU;
    const lx = cx + Math.cos(mid)*(R+r0)/2, ly = cy + Math.sin(mid)*(R+r0)/2;
    wctx.fillStyle = i === wheelSel ? '#14161b' : '#f2f0ea';
    wctx.font = '600 14px Inter, system-ui, sans-serif';
    wctx.textAlign = 'center'; wctx.textBaseline = 'middle';
    wctx.fillText(WEAPON_DEFS[i].name, lx, ly);
  }
}

function updateWheel(){
  const wasOpen = wheelOpen;
  wheelOpen = pointerLocked && mode === 'foot' && !player.dead && down('wheel');
  wheelWrap.classList.toggle('on', wheelOpen);
  if (wheelOpen && !wasOpen){ wheelVX = 0; wheelVY = 0; wheelSel = Weapons.idx; }
  if (wheelOpen){
    const n = WEAPON_DEFS.length;
    if (Math.hypot(wheelVX, wheelVY) > 12){
      const ang = Math.atan2(wheelVY, wheelVX);
      let idx = Math.round((ang + Math.PI/2) / TAU * n);
      wheelSel = ((idx % n) + n) % n;
    }
    drawWheel();
  } else if (wasOpen){
    Weapons.select(wheelSel);
  }
}
