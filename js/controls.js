/* ---------------------------------------------------------------
   12. STEROWANIE
   --------------------------------------------------------------- */
const keys = Object.create(null);
let pointerLocked = false;
let camYaw = Math.PI, camPitch = -0.16;
let lastMouseMove = -99;
let mode = 'foot';                    // 'foot' | 'car'
let muted = false;

const gate     = document.getElementById('gate');
const goBtn    = document.getElementById('go');
const promptEl = document.getElementById('prompt');

/* --- przebindowywalne klawisze --- */
const DEFAULT_BINDS = {
  forward:'KeyW', back:'KeyS', left:'KeyA', right:'KeyD',
  sprint:'ShiftLeft', jump:'Space',
  enter:'KeyF', horn:'KeyH', reload:'KeyR', wheel:'KeyQ', vehicleWheel:'KeyV',
  slot1:'Digit1', slot2:'Digit2', slot3:'Digit3',
  daytime:'KeyT', mute:'KeyM'
};
const BIND_ROWS = [
  ['forward','Przód'], ['back','Tył'], ['left','Lewo'], ['right','Prawo'],
  ['sprint','Bieg'], ['jump','Skok / hamulec ręczny'],
  ['enter','Wsiądź / wysiądź / ukradnij auto (+ E)'],
  ['reload','Przeładuj / postaw auto na kołach'],
  ['wheel','Koło broni (przytrzymaj)'],
  ['vehicleWheel','Menu pojazdów (przytrzymaj)'],
  ['slot1','Broń — slot 1'], ['slot2','Broń — slot 2'], ['slot3','Broń — slot 3'],
  ['horn','Klakson'], ['daytime','Przyspiesz dobę'], ['mute','Wycisz dźwięk']
];
function loadBinds(){
  try {
    const raw = localStorage.getItem('nc_binds_v1');
    if (raw) return Object.assign({}, DEFAULT_BINDS, JSON.parse(raw));
  } catch(e){}
  return Object.assign({}, DEFAULT_BINDS);
}
function saveBinds(){ try { localStorage.setItem('nc_binds_v1', JSON.stringify(BIND)); } catch(e){} }
let BIND = loadBinds();
function down(action){ return !!keys[BIND[action]]; }

function keyLabel(code){
  if (!code) return '—';
  if (code.indexOf('Key') === 0) return code.slice(3);
  if (code.indexOf('Digit') === 0) return code.slice(5);
  if (code.indexOf('Arrow') === 0) return code.slice(5);
  if (code === 'Space') return 'Spacja';
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'ControlLeft' || code === 'ControlRight') return 'Ctrl';
  if (code === 'AltLeft' || code === 'AltRight') return 'Alt';
  return code;
}

const settingsEl   = document.getElementById('settings');
const settingsBtn  = document.getElementById('settingsBtn');
const bindListEl   = document.getElementById('bindList');
let rebindTarget = null;

function buildBindList(){
  bindListEl.innerHTML = '';
  BIND_ROWS.forEach(row => {
    const action = row[0], label = row[1];
    const r = document.createElement('div');
    r.className = 'bind-row';
    const s = document.createElement('span');
    s.textContent = label;
    const b = document.createElement('button');
    b.className = 'keybtn';
    b.textContent = keyLabel(BIND[action]);
    b.addEventListener('click', ev => {
      ev.stopPropagation();
      rebindTarget = action;
      Array.from(bindListEl.querySelectorAll('.keybtn')).forEach(x => x.classList.remove('waiting'));
      b.classList.add('waiting');
      b.textContent = '...';
    });
    r.appendChild(s); r.appendChild(b);
    bindListEl.appendChild(r);
  });
}
buildBindList();

function openSettings(){ settingsEl.classList.add('on'); }
function closeSettings(){ settingsEl.classList.remove('on'); rebindTarget = null; }
settingsBtn.addEventListener('click', ev => { ev.stopPropagation(); openSettings(); });
document.getElementById('closeSettings').addEventListener('click', ev => { ev.stopPropagation(); closeSettings(); });
document.getElementById('resetBinds').addEventListener('click', ev => {
  ev.stopPropagation();
  BIND = Object.assign({}, DEFAULT_BINDS);
  saveBinds(); buildBindList();
});
settingsEl.addEventListener('click', ev => { if (ev.target === settingsEl) closeSettings(); });

function lockPointer(){
  const el = renderer.domElement;
  if (el.requestPointerLock) el.requestPointerLock();
}
document.addEventListener('pointerlockchange', () => {
  pointerLocked = (document.pointerLockElement === renderer.domElement);
  gate.classList.toggle('hidden', pointerLocked);
  if (!pointerLocked){
    goBtn.textContent = 'WRÓĆ DO GRY';
    for (const k in keys) keys[k] = false;
    mouseDown = false;
  } else {
    closeSettings();
  }
});
goBtn.addEventListener('click', () => {
  if (goBtn.disabled) return;
  Sound.init();
  lockPointer();
});
renderer.domElement.addEventListener('click', () => { if (!pointerLocked && !goBtn.disabled){ Sound.init(); lockPointer(); } });
gate.addEventListener('click', e => {
  if (e.target === goBtn || e.target === settingsBtn || goBtn.disabled || settingsEl.classList.contains('on')) return;
  Sound.init(); lockPointer();
});

document.addEventListener('mousemove', e => {
  if (!pointerLocked) return;
  if (wheelOpen){
    wheelVX += e.movementX;
    wheelVY += e.movementY;
    return;
  }
  if (mode === 'plane'){                                                     // mysz = drążek (wychylenie, wraca powoli do środka)
    planeStick.x = clamp(planeStick.x + e.movementX * 0.0035, -1, 1);
    planeStick.y = clamp(planeStick.y + e.movementY * 0.0035, -1, 1);
    return;
  }
  const s = 0.0022;
  camYaw   -= e.movementX * s;
  camPitch -= e.movementY * s;
  camPitch = clamp(camPitch, -0.95, 0.62);
  if (Math.abs(e.movementX) + Math.abs(e.movementY) > 1.5) lastMouseMove = clock;
});

let mouseDown = false;
document.addEventListener('mousedown', e => {
  if (!pointerLocked || e.button !== 0 || wheelOpen) return;
  mouseDown = true;
  Weapons.trigger();
});
document.addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; });
document.addEventListener('wheel', e => {
  if (!pointerLocked || mode !== 'foot') return;
  Weapons.cycle(e.deltaY > 0 ? 1 : -1);
}, { passive:true });

document.addEventListener('keydown', e => {
  const k = e.code;
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].indexOf(k) >= 0) e.preventDefault();

  if (rebindTarget){
    e.preventDefault();
    if (k !== 'Escape'){ BIND[rebindTarget] = k; saveBinds(); }
    rebindTarget = null;
    buildBindList();
    return;
  }
  if (k === 'Backquote'){ e.preventDefault(); toggleDebugMenu(); return; }
  if (!pointerLocked) return;   // menu/gate widoczne — klawisze nie sterują grą

  if (keys[k]) return;
  keys[k] = true;
  if (k === BIND.enter || k === 'KeyE') toggleVehicle();
  if (k === BIND.horn && mode === 'car') Sound.horn(true);
  if (k === BIND.reload){ if (mode === 'car') resetCar(); else Weapons.reload(); }
  if (k === BIND.mute){ muted = !muted; Sound.setMuted(muted); }
  if (mode === 'foot'){
    if (k === BIND.slot1) Weapons.select(0);
    if (k === BIND.slot2) Weapons.select(1);
    if (k === BIND.slot3) Weapons.select(2);
  }
});
document.addEventListener('keyup', e => {
  keys[e.code] = false;
  if (e.code === BIND.horn) Sound.horn(false);
});
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseDown = false; Sound.horn(false); });

/* --- debug menu --- */
let godMode = false, timeFrozen = false, debugOpen = false, wasLockedBeforeDebug = false, carSpeedMult = 1;
const debugEl = document.getElementById('debugMenu');
const dbg = {
  carCount: document.getElementById('dbgCarCount'),
  pedCount: document.getElementById('dbgPedCount'),
  addCars:  document.getElementById('dbgAddCars'),
  subCars:  document.getElementById('dbgSubCars'),
  clearCars: document.getElementById('dbgClearCars'),
  addPeds:  document.getElementById('dbgAddPeds'),
  subPeds:  document.getElementById('dbgSubPeds'),
  clearPeds: document.getElementById('dbgClearPeds'),
  time:     document.getElementById('dbgTime'),
  timeLbl:  document.getElementById('dbgTimeLabel'),
  freeze:   document.getElementById('dbgFreeze'),
  heal:     document.getElementById('dbgHeal'),
  ammo:     document.getElementById('dbgAmmo'),
  god:      document.getElementById('dbgGod'),
  teleport: document.getElementById('dbgTeleport'),
  speed:    document.getElementById('dbgSpeed'),
  speedVal: document.getElementById('dbgSpeedVal'),
  bodies:   document.getElementById('dbgBodies'),
  counts:   document.getElementById('dbgCounts'),
  fps:      document.getElementById('dbgFps'),
  close:    document.getElementById('closeDebug'),
  clearStolen: document.getElementById('dbgClearStolen')
};

function toggleDebugMenu(){
  debugOpen = !debugOpen;
  debugEl.classList.toggle('on', debugOpen);
  if (debugOpen){
    wasLockedBeforeDebug = pointerLocked;
    if (pointerLocked) document.exitPointerLock();
    dbg.time.value = String(Math.round(timeOfDay * 1440) % 1440);
    dbg.timeLbl.textContent = timeLabel(parseInt(dbg.time.value, 10));
    dbg.freeze.checked = timeFrozen;
    dbg.god.checked = godMode;
    dbg.speed.value = String(carSpeedMult);
    dbg.speedVal.textContent = carSpeedMult.toFixed(1) + '×';
    refreshDebugInfo();
  } else if (wasLockedBeforeDebug){
    lockPointer();
  }
}
function refreshDebugInfo(){
  dbg.carCount.textContent = String(npcs.length);
  dbg.pedCount.textContent = String(Pedestrians.list.length);
  dbg.bodies.textContent = String(world.bodies.length);
  dbg.counts.textContent = npcs.length + ' / ' + Pedestrians.list.length;
  dbg.fps.textContent = el.fps.textContent;
}
function timeLabel(v){
  const h = Math.floor(v / 60), m = v % 60;
  return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
}
debugEl.addEventListener('click', ev => { if (ev.target === debugEl) toggleDebugMenu(); });
dbg.close.addEventListener('click', ev => { ev.stopPropagation(); toggleDebugMenu(); });
dbg.addCars.addEventListener('click', ev => {
  ev.stopPropagation();
  for (let i = 0; i < 5 && npcs.length < 60; i++) spawnRandomNpcCar();
  refreshDebugInfo();
});
dbg.subCars.addEventListener('click', ev => {
  ev.stopPropagation();
  for (let i = 0; i < 5 && npcs.length > 0; i++) removeNpcCar(npcs[npcs.length - 1]);
  refreshDebugInfo();
});
dbg.clearCars.addEventListener('click', ev => {
  ev.stopPropagation();
  while (npcs.length) removeNpcCar(npcs[npcs.length - 1]);
  refreshDebugInfo();
});
dbg.addPeds.addEventListener('click', ev => {
  ev.stopPropagation();
  const pool = pedBlockCandidates.slice();
  for (let i = 0; i < 10 && Pedestrians.list.length < 80 && pool.length; i++){
    const idx = randInt(0, pool.length - 1);
    const b = pool.splice(idx, 1)[0];
    spawnPed(b.bi, b.bj);
  }
  refreshDebugInfo();
});
dbg.subPeds.addEventListener('click', ev => {
  ev.stopPropagation();
  for (let i = 0; i < 10 && Pedestrians.list.length > 0; i++) removePed(Pedestrians.list[Pedestrians.list.length - 1]);
  refreshDebugInfo();
});
dbg.clearPeds.addEventListener('click', ev => {
  ev.stopPropagation();
  while (Pedestrians.list.length) removePed(Pedestrians.list[Pedestrians.list.length - 1]);
  refreshDebugInfo();
});
dbg.time.addEventListener('input', () => {
  const v = parseInt(dbg.time.value, 10);
  timeOfDay = v / 1440;
  dbg.timeLbl.textContent = timeLabel(v);
});
dbg.freeze.addEventListener('change', () => { timeFrozen = dbg.freeze.checked; });
dbg.god.addEventListener('change', () => { godMode = dbg.god.checked; });
dbg.speed.addEventListener('input', () => {
  carSpeedMult = parseFloat(dbg.speed.value);
  dbg.speedVal.textContent = carSpeedMult.toFixed(1) + '×';
});
dbg.heal.addEventListener('click', ev => { ev.stopPropagation(); player.health = 100; player.stamina = 100; });
dbg.clearStolen.addEventListener('click', ev => { ev.stopPropagation(); parkedCars.filter(q => q.owner === 'stolen').forEach(removeParked); refreshDebugInfo(); });
dbg.ammo.addEventListener('click', ev => { ev.stopPropagation(); Weapons.reserve += 200; });
dbg.teleport.addEventListener('click', ev => {
  ev.stopPropagation();
  if (mode === 'car'){
    chassisBody.position.set(CAR_SPAWN.x, CAR_SPAWN.y, CAR_SPAWN.z);
    chassisBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), Math.PI);
    chassisBody.velocity.set(0,0,0); chassisBody.angularVelocity.set(0,0,0);
  } else {
    player.body.position.set(SPAWN.x, SPAWN.y, SPAWN.z);
    player.body.velocity.set(0,0,0);
  }
});
