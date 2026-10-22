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
  slot1:'Digit1', slot2:'Digit2', slot3:'Digit3', slot4:'Digit4', slot5:'Digit5', slot6:'Digit6', slot7:'Digit7', slot8:'Digit8', slot9:'Digit9', inventory:'Tab',
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
  ['slot1','Pasek — pole 1'], ['slot2','Pasek — pole 2'], ['slot3','Pasek — pole 3'], ['slot4','Pasek — pole 4'], ['slot5','Pasek — pole 5'], ['slot6','Pasek — pole 6'], ['slot7','Pasek — pole 7'], ['slot8','Pasek — pole 8'], ['slot9','Pasek — pole 9'], ['inventory','Ekwipunek (plecak)'],
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
  buildGateKeys();
}
/* ściągawka sterowania na ekranie startowym / pauzy (z aktualnych klawiszy) */
function buildGateKeys(){
  const box = document.getElementById('gateKeys'); if (!box) return;
  const K = a => '<kbd>' + keyLabel(BIND[a]) + '</kbd>', T = t => '<kbd>' + t + '</kbd>';
  const rows = [
    [K('forward') + K('left') + K('back') + K('right'), 'Ruch / jazda'], [K('sprint') + K('jump'), 'Bieg · skok / ręczny'],
    [K('enter'), 'Wsiądź / wysiądź / ukradnij'], [K('vehicleWheel'), 'Menu pojazdów (przytrzymaj)'], null,
    [T('LPM') + T('PPM'), 'Strzał · przycelowanie'], [K('wheel') + T('1–9'), 'Koło broni · pasek ekwipunku'], [K('inventory'), 'Plecak (ekwipunek)'], [K('reload'), 'Przeładuj / postaw auto'], null,
    [K('map') + K('daytime'), 'Mapa · przyspiesz dobę'], [K('mute') + T('Esc') + T('`'), 'Dźwięk · pauza · menu dev']
  ];
  box.innerHTML = rows.map(r => r ? '<span class="k">' + r[0] + '</span><span>' + r[1] + '</span>' : '<i class="sep"></i>').join('');
}
buildBindList();

function openSettings(){ settingsEl.classList.add('on'); }
function closeSettings(){ settingsEl.classList.remove('on'); rebindTarget = null; }
settingsBtn.addEventListener('click', ev => { ev.stopPropagation(); openSettings(); });
document.getElementById('gMap').addEventListener('click', ev => { ev.stopPropagation(); openMap(); });
document.getElementById('gDev').addEventListener('click', ev => { ev.stopPropagation(); toggleDebugMenu(); });
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
  gate.classList.toggle('hidden', pointerLocked || mapOpen || INV.open);
  gate.classList.toggle('paused', gameStarted);
  Sound.setPaused(!pointerLocked && !debugOpen && !INV.open);                // pauza (menu): dźwięk wyciszony
  if (!pointerLocked){
    goBtn.textContent = 'WRÓĆ DO GRY';
    if (gameStarted){                                                       // pauza: stan gry w jednym wierszu
      const md = mode === 'car' ? 'w aucie' : mode === 'plane' ? 'w samolocie' : mode === 'boat' ? 'na łodzi' : 'pieszo';
      document.getElementById('gatetxt').textContent = document.getElementById('clock').textContent + ' · ' + document.getElementById('phase').textContent + ' · ' + md + ' · zdrowie ' + Math.round(player.health) + ' — miasto czeka, dźwięk wyciszony.';
    }
    for (const k in keys) keys[k] = false;
    mouseDown = false; mouseDownR = false;
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
  if (e.target === goBtn || e.target === settingsBtn || e.target.closest('.gbtn') || goBtn.disabled || settingsEl.classList.contains('on')) return;
  Sound.init(); lockPointer();
});

document.addEventListener('mousemove', e => {
  if (!pointerLocked) return;
  if (wheelOpen){
    wheelVX += e.movementX;
    wheelVY += e.movementY;
    return;
  }
  if (mode === 'plane' || mode === 'boat' || mode === 'ride'){               // samolot / łódź / przejażdżka: mysz obraca kamerę
    planeCamYaw = clamp(planeCamYaw - e.movementX * 0.003, -2.6, 2.6);
    if (mode === 'ride') rideLookPitch = clamp(rideLookPitch - e.movementY * 0.003, -1.2, 1.0);
    if (Math.abs(e.movementX) > 1.5) lastMouseMove = clock;
    return;
  }
  const s = 0.0022;
  camYaw   -= e.movementX * s;
  camPitch -= e.movementY * s;
  camPitch = clamp(camPitch, -0.95, 0.62);
  if (Math.abs(e.movementX) + Math.abs(e.movementY) > 1.5) lastMouseMove = clock;
});

let mouseDown = false, mouseDownR = false;          // PPM = przycelowanie (broń palna)
document.addEventListener('contextmenu', e => { if (pointerLocked) e.preventDefault(); });
document.addEventListener('mousedown', e => {
  if (e.button === 2 && pointerLocked){ mouseDownR = true; return; }
  if (!pointerLocked || e.button !== 0 || wheelOpen) return;
  mouseDown = true;
  if (invHandleClick()) return;                                          // wędka / ryba (inventory.js)
  Weapons.trigger();
});
document.addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; if (e.button === 2) mouseDownR = false; });
document.addEventListener('wheel', e => {
  if (!pointerLocked || mode !== 'foot') return;
  invCycle(e.deltaY > 0 ? 1 : -1);
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
  if (k === BIND.inventory && (pointerLocked || INV.open) && !mapOpen && (mode === 'foot' || INV.open)){ e.preventDefault(); toggleInventory(); return; }
  if (INV.open && k === 'Escape'){ toggleInventory(); return; }
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
    for (let i = 1; i <= 9; i++) if (k === BIND['slot' + i]) invSelect(i - 1);
  }
});
document.addEventListener('keyup', e => {
  keys[e.code] = false;
  if (e.code === BIND.horn) Sound.horn(false);
});
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseDown = false; mouseDownR = false; Sound.horn(false); });

/* --- menu deweloperskie (`): suwaki / przełączniki z data-dbg (DBG_CTL: odczyt, zapis, format),
   przyciski z data-act / data-car / data-plane / data-tp; nagłówek ze statystykami odświeżany z hud.js --- */
let godMode = false, timeFrozen = false, debugOpen = false, wasLockedBeforeDebug = false, carSpeedMult = 1, fogMult = 1;
let dayMult = 1, gameSpeed = 1, npcFrozen = false, fovAdd = 0;
const debugEl = document.getElementById('debugMenu');
const dbgEl = id => document.getElementById(id);
const POP0 = {};                                            // liczebności startowe (przycisk „Domyślne”)
const npcCarsOnly = () => npcs.filter(n => n.type !== 'bike');
function setNpcCars(n){
  let c = npcCarsOnly();
  while (c.length > n){ removeNpcCar(c[c.length - 1]); c.pop(); }
  for (let k = c.length; k < n; k++) spawnRandomNpcCar();
}
function setNpcBikes(n){
  const city = LOOPS.filter(P => !P.hwyRoute && !P.some(q => q.rb !== undefined));
  let b = npcs.filter(q => q.type === 'bike');
  while (b.length > n){ removeNpcCar(b[b.length - 1]); b.pop(); }
  for (let k = b.length; k < n; k++) if (!spawnNpcBike(bikeLoopOf(city[randInt(0, city.length - 1)]), k)) break;
}
function setPeds(n){
  while (Pedestrians.list.length > n) removePed(Pedestrians.list[Pedestrians.list.length - 1]);
  for (let k = Pedestrians.list.length; k < n; k++){ const b = pedBlockCandidates[randInt(0, pedBlockCandidates.length - 1)]; spawnPed(b.bi, b.bj); }
}
function setNpcFrozen(on){
  npcFrozen = on;
  if (on){ for (const n of npcs) n.body.velocity.set(0, 0, 0); for (const p of Pedestrians.list) if (p.body) p.body.velocity.set(0, 0, 0); }
}
const pct = v => Math.round(v * 100) + '%';
const DBG_CTL = {
  cars:      { get: () => npcCarsOnly().length,                  set: v => setNpcCars(v),          heavy: true },
  bikes:     { get: () => npcs.filter(n => n.type === 'bike').length, set: v => setNpcBikes(v), heavy: true },
  peds:      { get: () => Pedestrians.list.length,               set: v => setPeds(v),             heavy: true },
  boats:     { get: () => boats.filter(b => b.npc).length,       set: v => setNpcBoatCount(v),     heavy: true },
  air:       { get: () => airPlanes.length,                      set: v => setAirCount(v),         heavy: true },
  cats:      { get: () => CATS.length,                           set: v => setCatCount(v),         heavy: true },
  freezeNpc: { get: () => npcFrozen,                             set: v => setNpcFrozen(v) },
  lod:       { get: () => NPC_LOD_DIST < 1e6,                    set: v => { NPC_LOD_DIST = v ? 220 : Infinity; } },
  ram:       { get: () => PIRATE_RAM_CHANCE,                     set: v => { PIRATE_RAM_CHANCE = v; }, fmt: pct },
  time:      { get: () => Math.round(timeOfDay * 1440) % 1440,   set: v => { timeOfDay = v / 1440; updateSky(0); }, fmt: v => timeLabel(v) },
  freezeTime:{ get: () => timeFrozen,                            set: v => { timeFrozen = v; } },
  daySpeed:  { get: () => dayMult,                               set: v => { dayMult = v; }, fmt: v => v + '×' },
  gameSpeed: { get: () => gameSpeed,                             set: v => { gameSpeed = v; }, fmt: v => v.toFixed(2) + '×' },
  fog:       { get: () => fogMult,                               set: v => { fogMult = v; }, fmt: pct },
  shadows:   { get: () => sun.castShadow,                        set: v => { sun.castShadow = v; } },
  res:       { get: () => renderer.getPixelRatio(),              set: v => { renderer.setPixelRatio(v); renderer.setSize(innerWidth, innerHeight); }, fmt: pct },
  fov:       { get: () => fovAdd,                                set: v => { fovAdd = v; }, fmt: v => (v > 0 ? '+' : '') + v + '°' },
  hud:       { get: () => document.getElementById('hud').style.display !== 'none', set: v => { document.getElementById('hud').style.display = v ? '' : 'none'; } },
  god:       { get: () => godMode,                               set: v => { godMode = v; } },
  infAmmo:   { get: () => infAmmo,                               set: v => { infAmmo = v; } },
  carSpeed:  { get: () => carSpeedMult,                          set: v => { carSpeedMult = v; }, fmt: v => v.toFixed(1) + '×' }
};
function timeLabel(v){
  const h = Math.floor(v / 60), m = v % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
/* odczyt stanu do kontrolek (przy otwarciu i po akcjach); pomija kontrolkę, którą użytkownik właśnie przesuwa */
function syncDebugControls(skip){
  debugEl.querySelectorAll('[data-dbg]').forEach(inp => {
    const c = DBG_CTL[inp.dataset.dbg]; if (!c || inp === skip) return;
    const v = c.get();
    if (inp.type === 'checkbox') inp.checked = !!v;
    else { inp.value = String(v); const o = inp.parentNode.querySelector('output'); if (o) o.textContent = c.fmt ? c.fmt(+v) : String(v); }
  });
}
debugEl.querySelectorAll('[data-dbg]').forEach(inp => {
  const c = DBG_CTL[inp.dataset.dbg]; if (!c) return;
  const out = inp.parentNode.querySelector('output');
  const val = () => inp.type === 'checkbox' ? inp.checked : parseFloat(inp.value);
  inp.addEventListener('input', () => {
    if (out) out.textContent = c.fmt ? c.fmt(val()) : String(val());
    if (!c.heavy) c.set(val());
  });
  inp.addEventListener('change', () => { c.set(val()); syncDebugControls(inp); refreshDebugInfo(); });
  inp.addEventListener('click', ev => ev.stopPropagation());
});

function toggleDebugMenu(){
  debugOpen = !debugOpen;
  debugEl.classList.toggle('on', debugOpen);
  if (debugOpen){
    if (POP0.cars === undefined) ['cars', 'bikes', 'peds', 'boats', 'air', 'cats'].forEach(k => { POP0[k] = DBG_CTL[k].get(); });   // liczebności startowe
    wasLockedBeforeDebug = pointerLocked;
    if (pointerLocked) document.exitPointerLock();
    syncDebugControls();
    refreshDebugInfo();
  } else if (wasLockedBeforeDebug){
    lockPointer();
  } else Sound.setPaused(gameStarted && !pointerLocked);       // zamknięte nad menu pauzy: z powrotem cisza
}
function refreshDebugInfo(){
  const nb = npcs.filter(n => n.type === 'bike').length;
  dbgEl('dbgFps').textContent = (el.fps.textContent.match(/^d+/) || ['—'])[0];
  dbgEl('dbgBodies').textContent = String(world.bodies.length);
  dbgEl('dbgCars').textContent = (npcs.length - nb) + ' / ' + nb;
  dbgEl('dbgPeds').textContent = String(Pedestrians.list.length);
  dbgEl('dbgSeaAir').textContent = boats.filter(b => b.npc).length + ' / ' + airPlanes.length;
  dbgEl('dbgMode').textContent = mode === 'car' ? CAR_TYPES[carType].name + (driving.owner === 'stolen' ? ' (kradzione)' : '') : mode === 'plane' && curPlane ? curPlane.T.name : mode === 'boat' ? BOAT_T.name : mode === 'ride' && curRide ? curRide.name : 'pieszo';
  dbgEl('dbgPirCount').textContent = String(npcs.filter(n => n.profile === 'pirat').length);
}
debugEl.addEventListener('click', ev => { if (ev.target === debugEl) toggleDebugMenu(); });
dbgEl('closeDebug').addEventListener('click', ev => { ev.stopPropagation(); toggleDebugMenu(); });

/* --- akcje --- */
function dbgOnFoot(){                                    // samolot / łódź: wysiadka; auto: trzeba wysiąść samemu (F)
  if (mode === 'ride') rideEnd(curRide, true);
  if (mode === 'plane') exitPlane(true);
  if (mode === 'boat') exitBoat(true);
  if (mode === 'car'){ hudToast('Najpierw wysiądź z auta (F)'); return false; }
  return true;
}
function dbgTeleport(x, z, heading, yTop){
  if (mode === 'ride') rideEnd(curRide, true);
  if (mode === 'plane') exitPlane(true);
  if (mode === 'boat') exitBoat(true);
  const g = groundAt(x, z, yTop === undefined ? 30 : yTop); const y = g === null ? 0 : g;
  if (mode === 'car') takeOver(carType, driving.color, driving.owner, x, y, z, heading);
  else { player.body.position.set(x, y + 1.2, z); player.body.velocity.set(0, 0, 0); if (heading !== undefined){ player.facing = heading; camYaw = heading + Math.PI; } }
  refreshDebugInfo();
}
const dbgDrop = onMe => {
  const p = playerWorldPos(), b = birds[0];
  b.pos.set(p.x + (onMe ? 0 : 5), (p.y || 0) + 22, p.z + (onMe ? 0 : 3)); b.prev.copy(b.pos); birdDrop(b);
};
const DBG_ACT = {
  popDefault: () => { setNpcCars(POP0.cars); setNpcBikes(POP0.bikes); setPeds(POP0.peds); setNpcBoatCount(POP0.boats); setAirCount(POP0.air); setCatCount(POP0.cats); },
  popClear:   () => { setNpcCars(0); setNpcBikes(0); setPeds(0); },
  addPirate:  () => { for (let t = 0; t < 12; t++){ const n = spawnRandomNpcCar(); if (n.type !== 'bike' && !n.path.hwyRoute){ npcMakePirate(n); break; } removeNpcCar(n); } },
  nearPirate: () => {
    const p = playerWorldPos();
    const c = npcs.filter(n => n.type !== 'bike' && n.profile !== 'pirat').sort((a, b) => Math.hypot(a.pos.x - p.x, a.pos.y - p.z) - Math.hypot(b.pos.x - p.x, b.pos.y - p.z))[0];
    if (c){ npcMakePirate(c); hudToast('Pirat: auto ' + Math.round(Math.hypot(c.pos.x - p.x, c.pos.y - p.z)) + ' m od ciebie'); }
  },
  heal:        () => { player.health = 100; player.stamina = 100; },
  ammo:        () => Weapons.fillAmmo(),
  fixCar:      () => { if (mode === 'car') resetCar(); else hudToast('Działa w aucie'); },
  clearStolen: () => parkedCars.filter(q => q.owner === 'stolen').forEach(removeParked),
  boat:        () => {
    if (mode === 'plane') exitPlane(true);
    if (mode === 'car'){ hudToast('Najpierw wysiądź z auta (F)'); return; }
    if (mode === 'boat') return;
    const b = boats.find(q => !q.npc); b.v = 0; enterBoat(b); camCur.set(b.pos.x, 6, b.pos.z + 12);
  },
  wpHospital: () => { setWaypoint(HOSPITAL_SPAWN.x, HOSPITAL_SPAWN.z + 2); hudToast('Cel: szpital'); },
  wpAirport:  () => { setWaypoint(AIRPORT_W.front.x, AIRPORT_W.term.z0 + 10); hudToast('Cel: lotnisko miejskie'); },
  wpClear:    () => setWaypoint(null),
  birdNear:   () => dbgDrop(false),
  birdMe:     () => dbgDrop(true)
};
debugEl.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', ev => { ev.stopPropagation(); const f = DBG_ACT[b.dataset.act]; if (f) f(); syncDebugControls(); refreshDebugInfo(); }));
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
  if (k === 'start'){ if (mode === 'car') dbgTeleport(CAR_SPAWN.x, CAR_SPAWN.z, 0); else dbgTeleport(SPAWN.x, SPAWN.z); }
  else if (k === 'hospital') dbgTeleport(HOSPITAL_SPAWN.x, HOSPITAL_SPAWN.z, HOSPITAL_SPAWN.facing);
  else if (k === 'airport') dbgTeleport(AIRPORT.access.x - 2, -690, 0);
  else if (k === 'port') dbgTeleport(L(5) - 2, -330, Math.PI);
  else if (k === 'airportW') dbgTeleport(AIRPORT_W.front.x + 2, 30, Math.PI);
  else if (k === 'ring') dbgTeleport(L(12) + 3.5, 60, Math.PI);           // wschodnia obwodnica, pas na północ
  else if (k === 'park') dbgTeleport(PARK.gateX - 12, 0, Math.PI / 2);
  else if (k === 'clover') dbgTeleport(L(6) + 30, L(6) + 9, -Math.PI / 2, 3);   // ulica pod węzłem
  else if (k === 'exit'){ const q = wayAt(HWY_TERM[0].exit, HWY_TERM[0].exit.len - 160); dbgTeleport(q.x, q.z, Math.atan2(q.hx, q.hz), q.y + 3); }
  else {                                                 // pomost A1 przed węzłem (punkt trasy NPC na jezdni)
    const P = HWY_LOOPS[0][0], i = P.findIndex((q, j) => q.hwy && (q.y || 0) > 6 && Math.hypot(q.x, q.z) > 90 && Math.hypot(q.x, q.z) < 140);
    const a = P[Math.max(0, i)], c = P[(Math.max(0, i) + 1) % P.length];
    dbgTeleport(a.x, a.z, Math.atan2(c.x - a.x, c.z - a.z), (a.y || 0) + 3);
  }
}));
