/* ---------------------------------------------------------------
   12. STEROWANIE
   --------------------------------------------------------------- */
const keys = Object.create(null);
let pointerLocked = false;
let camYaw = Math.PI, camPitch = -0.16;
let lastMouseMove = -99;
let mode = 'foot';                    // 'foot' | 'car'
let muted = false, gameStarted = false;   // gameStarted: pierwsze przejęcie kursora (potem Esc = pauza)

const gate     = document.getElementById('gate');
const goBtn    = document.getElementById('go');
const promptEl = document.getElementById('prompt');

/* --- przebindowywalne klawisze --- */
const DEFAULT_BINDS = {
  forward:'KeyW', back:'KeyS', left:'KeyA', right:'KeyD',
  sprint:'ShiftLeft', jump:'Space',
  enter:'KeyF', horn:'KeyH', reload:'KeyR', wheel:'KeyQ', vehicleWheel:'KeyV', indLeft:'KeyQ', indRight:'KeyE',
  slot1:'Digit1', slot2:'Digit2', slot3:'Digit3',
  daytime:'KeyT', mute:'KeyN', map:'KeyM'
};
const BIND_ROWS = [
  ['forward','Przód'], ['back','Tył'], ['left','Lewo'], ['right','Prawo'],
  ['sprint','Bieg'], ['jump','Skok / hamulec ręczny'],
  ['enter','Wsiądź / wysiądź / ukradnij auto (+ E)'],
  ['reload','Przeładuj / postaw auto na kołach'],
  ['wheel','Koło broni (przytrzymaj)'],
  ['vehicleWheel','Menu pojazdów (przytrzymaj)'],
  ['indLeft','Kierunkowskaz lewy (w aucie)'], ['indRight','Kierunkowskaz prawy (w aucie)'],
  ['slot1','Broń — slot 1'], ['slot2','Broń — slot 2'], ['slot3','Broń — slot 3'],
  ['horn','Klakson'], ['daytime','Przyspiesz dobę'], ['map','Mapa (PPM — cel trasy)'], ['mute','Wycisz dźwięk']
];
function loadBinds(){
  try {
    const raw = localStorage.getItem('nc_binds_v1');
    if (raw){
      const saved = JSON.parse(raw);
      if (saved.mute === 'KeyM' && !saved.map) saved.mute = 'KeyN';           // M to teraz mapa (stare zapisane sterowanie)
      return Object.assign({}, DEFAULT_BINDS, saved);
    }
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
  if (pointerLocked) gameStarted = true;
  gate.classList.toggle('hidden', pointerLocked || mapOpen);
  Sound.setPaused(!pointerLocked && !debugOpen);                // pauza (menu): dźwięk wyciszony
  if (!pointerLocked){
    goBtn.textContent = 'WRÓĆ DO GRY';
    if (gameStarted) document.getElementById('gatetxt').textContent = 'Pauza — miasto czeka, dźwięk wyciszony.';
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
  if (mode === 'plane' || mode === 'boat'){                                  // samolot / łódź: mysz tylko obraca kamerę
    planeCamYaw = clamp(planeCamYaw - e.movementX * 0.003, -2.6, 2.6);
    if (Math.abs(e.movementX) > 1.5) lastMouseMove = clock;
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
  if (mapOpen){ if (k === BIND.map || k === 'Escape'){ e.preventDefault(); closeMap(k === BIND.map); } return; }   // mapa: tylko zamknięcie
  if (!pointerLocked) return;   // menu/gate widoczne — klawisze nie sterują grą
  if (k === BIND.map){ openMap(); return; }

  if (keys[k]) return;
  keys[k] = true;
  if (mode === 'car' && (k === BIND.indLeft || k === BIND.indRight)){ togglePlayerInd(k === BIND.indLeft ? 'L' : 'R'); return; }
  if (k === BIND.enter || (k === 'KeyE' && mode !== 'car')) toggleVehicle();
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
  pirCount: document.getElementById('dbgPirCount'),
  bikeCount: document.getElementById('dbgBikeCount'),
  ram:      document.getElementById('dbgRam'),
  ramVal:   document.getElementById('dbgRamVal'),
  lod:      document.getElementById('dbgLod'),
  modeInfo: document.getElementById('dbgMode'),
  npcInd:   document.getElementById('dbgNpcInd'),
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
  } else Sound.setPaused(gameStarted && !pointerLocked);       // zamknięte nad menu pauzy: z powrotem cisza
}
function refreshDebugInfo(){
  dbg.carCount.textContent = String(npcs.length);
  dbg.pedCount.textContent = String(Pedestrians.list.length);
  dbg.bodies.textContent = String(world.bodies.length);
  dbg.counts.textContent = npcs.length + ' / ' + Pedestrians.list.length;
  dbg.fps.textContent = el.fps.textContent;
  dbg.pirCount.textContent = String(npcs.filter(n => n.profile === 'pirat').length);
  dbg.bikeCount.textContent = String(npcs.filter(n => n.type === 'bike').length);
  dbg.ram.value = String(PIRATE_RAM_CHANCE); dbg.ramVal.textContent = Math.round(PIRATE_RAM_CHANCE * 100) + '%';
  dbg.lod.checked = NPC_LOD_DIST < 1e6;
  dbg.modeInfo.textContent = mode + (mode === 'boat' ? ' · ' + BOAT_T.name : '') + (mode === 'car' ? ' · ' + CAR_TYPES[carType].name + ' (' + driving.owner + ')' : mode === 'plane' && curPlane ? ' · ' + curPlane.T.name : '');
  dbg.npcInd.textContent = npcs.filter(n => n.ind).length + ' / ' + npcs.reduce((a, n) => a + (n.rams || 0) + (n.pedHits || 0), 0);
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
/* --- pojazdy, samoloty, teleporty, piraci, rowerzyści (debug) --- */
function dbgOnFoot(){                                    // samolot: wysiadka; auto: trzeba wysiąść samemu (F)
  if (mode === 'plane') exitPlane(true);
  if (mode === 'boat') exitBoat(true);
  if (mode === 'car'){ hudToast('Najpierw wysiądź z auta (F)'); return false; }
  return true;
}
function dbgTeleport(x, z, heading, yTop){
  if (mode === 'plane') exitPlane(true);
  if (mode === 'boat') exitBoat(true);
  const g = groundAt(x, z, yTop === undefined ? 30 : yTop); const y = g === null ? 0 : g;
  if (mode === 'car') takeOver(carType, driving.color, driving.owner, x, y, z, heading);
  else { player.body.position.set(x, y + 1.2, z); player.body.velocity.set(0, 0, 0); }
  refreshDebugInfo();
}
debugEl.querySelectorAll('[data-car]').forEach(b => b.addEventListener('click', ev => {
  ev.stopPropagation();
  const type = b.dataset.car;
  if (mode === 'plane') exitPlane(true);
  if (mode === 'boat') exitBoat(true);
  if (mode === 'car'){                                   // w aucie: zmiana typu w miejscu
    const T = CAR_TYPES[carType], p = chassisBody.position;
    takeOver(type, driving.color, driving.owner, p.x, p.y - T.restY - 0.13, p.z, carYaw());
  } else { lastCarSpawn = -99; spawnOwnCar(type); }
  refreshDebugInfo();
}));
debugEl.querySelectorAll('[data-ind]').forEach(b => b.addEventListener('click', ev => {
  ev.stopPropagation();
  if (mode !== 'car'){ hudToast('Kierunkowskazy działają w aucie'); return; }
  playerInd = b.dataset.ind || null;
}));
debugEl.querySelectorAll('[data-plane]').forEach(b => b.addEventListener('click', ev => {
  ev.stopPropagation();
  if (!dbgOnFoot()) return;
  const p = planes.find(q => q.kind === b.dataset.plane); if (!p) return;
  resetPlane(p);
  if (b.dataset.air){                                    // od razu w locie: 150 m nad lotniskiem, kurs na wschód, ponad prędkością przeciągnięcia
    p.pos.set(-120, 150, AIRPORT.runway.z); p.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    p.onGround = false; p.v = p.T.vStall * 1.35; p.thr = 0.75; syncPlane(p);
  } else { const d = planeDoorPoint(p, { x: 0, y: 0, z: 0 }); player.body.position.set(d.x, d.y + 1.2, d.z); }
  enterPlane(p);
  camCur.set(p.pos.x - 30, p.pos.y + 10, p.pos.z);
  refreshDebugInfo();
}));
debugEl.querySelectorAll('[data-tp]').forEach(b => b.addEventListener('click', ev => {
  ev.stopPropagation();
  const k = b.dataset.tp;
  if (k === 'airport') dbgTeleport(AIRPORT.access.x - 2, -690, 0);
  else if (k === 'port') dbgTeleport(L(5) - 2, -330, Math.PI);
  else if (k === 'airportW') dbgTeleport(AIRPORT_W.front.x + 2, 30, Math.PI);
  else if (k === 'ring') dbgTeleport(L(12) + 3.5, 60, Math.PI);           // wschodnia obwodnica, pas na północ
  else if (k === 'exit'){ const q = wayAt(HWY_TERM[0].exit, HWY_TERM[0].exit.len - 160); dbgTeleport(q.x, q.z, Math.atan2(q.hx, q.hz), q.y + 3); }
  else {                                                 // pomost A1 przed węzłem (punkt trasy NPC na jezdni)
    const P = HWY_LOOPS[0][0], i = P.findIndex((q, j) => q.hwy && (q.y || 0) > 6 && Math.hypot(q.x, q.z) > 90 && Math.hypot(q.x, q.z) < 140);
    const a = P[Math.max(0, i)], c = P[(Math.max(0, i) + 1) % P.length];
    dbgTeleport(a.x, a.z, Math.atan2(c.x - a.x, c.z - a.z), (a.y || 0) + 3);
  }
}));
document.getElementById('dbgAddPirate').addEventListener('click', ev => {
  ev.stopPropagation();
  for (let t = 0; t < 12; t++){ const n = spawnRandomNpcCar(); if (n.type !== 'bike' && !n.path.hwyRoute){ npcMakePirate(n); break; } removeNpcCar(n); }
  refreshDebugInfo();
});
document.getElementById('dbgNearPirate').addEventListener('click', ev => {
  ev.stopPropagation();
  const p = mode === 'car' ? chassisBody.position : player.body.position;
  const c = npcs.filter(n => n.type !== 'bike' && n.profile !== 'pirat').sort((a, b) => Math.hypot(a.pos.x - p.x, a.pos.y - p.z) - Math.hypot(b.pos.x - p.x, b.pos.y - p.z))[0];
  if (c){ npcMakePirate(c); hudToast('Pirat: auto ' + Math.round(Math.hypot(c.pos.x - p.x, c.pos.y - p.z)) + ' m od ciebie'); }
  refreshDebugInfo();
});
document.getElementById('dbgAddBikes').addEventListener('click', ev => {
  ev.stopPropagation();
  const city = LOOPS.filter(P => !P.hwyRoute && !P.some(q => q.rb !== undefined));
  for (let k = 0; k < 2; k++) spawnNpcBike(bikeLoopOf(city[randInt(0, city.length - 1)]), randInt(0, 5));
  refreshDebugInfo();
});
dbg.ram.addEventListener('input', () => { PIRATE_RAM_CHANCE = parseFloat(dbg.ram.value); dbg.ramVal.textContent = Math.round(PIRATE_RAM_CHANCE * 100) + '%'; });
dbg.lod.addEventListener('change', () => { NPC_LOD_DIST = dbg.lod.checked ? 220 : Infinity; });
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
