/* ---------------------------------------------------------------
   20. HUD + MINIMAPA
   --------------------------------------------------------------- */
const el = {
  modetxt: document.getElementById('modetxt'),
  clock:   document.getElementById('clock'),
  phase:   document.getElementById('phase'),
  kmh:     document.getElementById('kmh'),
  barfill: document.getElementById('barfill'),
  speedo:  document.getElementById('speedo'),
  gval:    document.getElementById('gval'),
  ghand:   document.getElementById('ghand'),
  coords:  document.getElementById('coords'),
  fps:     document.getElementById('fps'),
  healthfill:  document.getElementById('healthfill'),
  healthval:   document.getElementById('healthval'),
  healthtrack: document.getElementById('healthtrack'),
  staminafill: document.getElementById('staminafill'),
  staminaval:  document.getElementById('staminaval'),
  weaponhud:   document.getElementById('weaponhud'),
  wname:       document.getElementById('wname'),
  wammo:       document.getElementById('wammo'),
  crosshair:   document.getElementById('crosshair'),
  hurtFlash:   document.getElementById('hurtFlash'),
  deadScreen:  document.getElementById('deadScreen'),
  carlbl:      document.getElementById('carlbl'),
  toast:       document.getElementById('toast')
};
/* krótki komunikat na środku ekranu */
let _toastT = 0;
function hudToast(text, secs){ el.toast.textContent = text; el.toast.classList.add('on'); _toastT = secs || 2.2; }

/* statyczna mapa CAŁEGO świata (miasto + pas podmiejski + autostrady) rysowana raz */
const MAP_SCALE = 1.35;
const MAP_X0 = -WALL_X - 6, MAP_Z0 = -WALL_X - 6;
const MAP_W = (WALL_X + 6) * 2, MAP_H = (WALL_X + 6) * 2;
const mapStatic = mkCanvas(Math.ceil(MAP_W * MAP_SCALE), Math.ceil(MAP_H * MAP_SCALE));
(function drawStaticMap(){
  const g = mapStatic.getContext('2d');
  const wx = v => (v - MAP_X0) * MAP_SCALE, wz = v => (v - MAP_Z0) * MAP_SCALE;
  g.fillStyle = '#0d0f13'; g.fillRect(0, 0, mapStatic.width, mapStatic.height);
  g.fillStyle = '#171a20';                                            // teren wewnątrz muru
  g.fillRect(wx(-WALL_X), wz(-WALL_X), WALL_X * 2 * MAP_SCALE, WALL_X * 2 * MAP_SCALE);
  g.fillStyle = '#23262c';                                            // jezdnie miasta
  g.fillRect(wx(-CITY_EDGE), wz(-CITY_EDGE), CITY_EDGE * 2 * MAP_SCALE, CITY_EDGE * 2 * MAP_SCALE);
  for (let i = 0; i < GRID; i++){
    for (let j = 0; j < GRID; j++){
      g.fillStyle = '#31353d';
      g.fillRect(wx(blockCenter(i) - LOT/2), wz(blockCenter(j) - LOT/2), LOT * MAP_SCALE, LOT * MAP_SCALE);
    }
  }
  g.fillStyle = '#464b55';                                            // zabudowa
  for (let i = 0; i < buildings.length; i++){
    const b = buildings[i];
    g.fillRect(wx(b.x - b.w/2), wz(b.z - b.d/2), b.w * MAP_SCALE, b.d * MAP_SCALE);
  }
  g.strokeStyle = 'rgba(232,230,220,.16)'; g.setLineDash([5,7]); g.lineWidth = 1;   // osie ulic
  for (let i = 0; i <= GRID; i++){
    g.beginPath(); g.moveTo(wx(L(i)), wz(-CITY_EDGE)); g.lineTo(wx(L(i)), wz(CITY_EDGE)); g.stroke();
    g.beginPath(); g.moveTo(wx(-CITY_EDGE), wz(L(i))); g.lineTo(wx(CITY_EDGE), wz(L(i))); g.stroke();
  }
  g.setLineDash([]);
  /* autostrady A1/A2, koniczyna, łącznice i zjazdy w pasie podmiejskim (highways.js) */
  mapExtras.forEach(e => {
    g.fillStyle = e.c; g.strokeStyle = e.c;
    if (e.t === 'rect') g.fillRect(wx(e.x0), wz(e.z0), (e.x1 - e.x0) * MAP_SCALE, (e.z1 - e.z0) * MAP_SCALE);
    else if (e.t === 'disc'){ g.beginPath(); g.arc(wx(e.x), wz(e.z), e.r * MAP_SCALE, 0, TAU); g.fill(); }
    else if (e.t === 'line'){
      g.lineWidth = e.w * MAP_SCALE; g.lineCap = 'butt'; g.lineJoin = 'round'; g.beginPath();
      e.pts.forEach((q, k) => k ? g.lineTo(wx(q[0]), wz(q[1])) : g.moveTo(wx(q[0]), wz(q[1])));
      g.stroke();
    }
  });
  g.strokeStyle = 'rgba(255,176,58,.30)'; g.lineWidth = 2;            // mur dookoła całości
  g.strokeRect(wx(-WALL_X), wz(-WALL_X), WALL_X * 2 * MAP_SCALE, WALL_X * 2 * MAP_SCALE);
})();

const mm = document.getElementById('minimap');
const mg = mm.getContext('2d');
const MM = mm.width;

function drawMinimap(){
  const px = mode === 'car' ? chassisBody.position.x : player.body.position.x;
  const pz = mode === 'car' ? chassisBody.position.z : player.body.position.z;
  const cx = (px - MAP_X0) * MAP_SCALE;
  const cz = (pz - MAP_Z0) * MAP_SCALE;

  mg.clearRect(0, 0, MM, MM);
  mg.fillStyle = '#0d0f13';
  mg.fillRect(0, 0, MM, MM);
  mg.drawImage(mapStatic, Math.round(MM/2 - cx), Math.round(MM/2 - cz));

  const toMap = (wx, wz) => [ MM/2 + (wx - px) * MAP_SCALE, MM/2 + (wz - pz) * MAP_SCALE ];

  /* NPC */
  mg.fillStyle = '#7f8794';
  for (let i = 0; i < npcs.length; i++){
    const p = toMap(npcs[i].pos.x, npcs[i].pos.y);
    if (p[0] < -6 || p[0] > MM+6 || p[1] < -6 || p[1] > MM+6) continue;
    mg.fillRect(p[0]-2, p[1]-2, 4, 4);
  }

  /* zaparkowane skradzione (i porzucone prowadzalne skradzione) — małe fioletowe kwadraty */
  mg.fillStyle = '#b07ad8';
  const sq = (x, z) => { const p = toMap(x, z); if (p[0] > -6 && p[0] < MM+6 && p[1] > -6 && p[1] < MM+6) mg.fillRect(p[0]-2.5, p[1]-2.5, 5, 5); };
  parkedCars.forEach(q => { if (q.owner === 'stolen') sq(q.x, q.z); });
  if (mode === 'foot' && driving.owner !== 'player') sq(chassisBody.position.x, chassisBody.position.z);
  /* auto gracza — strzałka jak u pieszego, ten sam poprawny wzór obrotu (prowadzone albo zaparkowane twoje) */
  const ownP = driving.owner === 'player' || mode === 'car' ? null : parkedCars.find(q => q.owner === 'player');
  const cp = ownP ? toMap(ownP.x, ownP.z) : toMap(chassisBody.position.x, chassisBody.position.z);
  const cy = ownP ? ownP.heading : carYaw();
  mg.save();
  mg.translate(clamp(cp[0], 5, MM-5), clamp(cp[1], 5, MM-5));
  mg.rotate(-cy + Math.PI);
  mg.fillStyle = mode === 'car' ? (driving.owner === 'player' ? '#ffb03a' : '#e8a35a') : '#e05a4a';
  mg.beginPath();
  mg.moveTo(0, -6.5); mg.lineTo(3.6, 4.5); mg.lineTo(0, 2.2); mg.lineTo(-3.6, 4.5);
  mg.closePath(); mg.fill();
  mg.restore();

  /* gracz */
  if (mode === 'foot'){
    const pp = toMap(player.body.position.x, player.body.position.z);
    mg.save();
    mg.translate(pp[0], pp[1]);
    mg.rotate(-player.facing + Math.PI);
    mg.fillStyle = '#f2f0ea';
    mg.beginPath();
    mg.moveTo(0, -6); mg.lineTo(4.2, 4.5); mg.lineTo(0, 2); mg.lineTo(-4.2, 4.5);
    mg.closePath(); mg.fill();
    mg.restore();
  }

  /* stożek widzenia kamery — kierunek patrzenia to camYaw+PI (kamera stoi
     za celem pod kątem camYaw), a wzór na obrót znacznika to -kierunek+PI,
     więc razem: -(camYaw+PI)+PI = -camYaw (sprawdzone numerycznie) */
  mg.save();
  mg.translate(MM/2, MM/2);
  mg.rotate(-camYaw);
  mg.fillStyle = 'rgba(255,176,58,.10)';
  mg.beginPath();
  mg.moveTo(0,0);
  mg.arc(0, 0, 34, -Math.PI/2 - 0.55, -Math.PI/2 + 0.55);
  mg.closePath(); mg.fill();
  mg.restore();

  mg.strokeStyle = 'rgba(200,198,191,.14)';
  mg.strokeRect(0.5, 0.5, MM-1, MM-1);
}

const PHASES = [
  [0.00,'głęboka noc'], [0.21,'świt'], [0.30,'poranek'], [0.45,'południe'],
  [0.63,'popołudnie'], [0.76,'zachód słońca'], [0.84,'zmierzch'], [0.90,'noc']
];
function phaseName(t){
  let name = PHASES[0][1];
  for (let i = 0; i < PHASES.length; i++) if (t >= PHASES[i][0]) name = PHASES[i][1];
  return name;
}

let hudAcc = 0, fpsAcc = 0, fpsCount = 0;
function updateHud(dt, kmh){
  hudAcc += dt; fpsAcc += dt; fpsCount++;

  el.speedo.classList.toggle('on', mode === 'car');
  if (_toastT > 0){ _toastT -= dt; if (_toastT <= 0) el.toast.classList.remove('on'); }
  if (mode === 'car'){
    const lbl = (driving.owner === 'player' ? 'Twój samochód' : 'Skradziony') + ' · ' + CAR_TYPES[carType].name;
    if (el.carlbl.textContent !== lbl){ el.carlbl.textContent = lbl; el.carlbl.classList.toggle('stolen', driving.owner !== 'player'); }
    el.kmh.firstChild.nodeValue = String(Math.round(kmh));
    el.barfill.style.width = clamp(kmh / 210 * 100, 0, 100) + '%';
    el.gval.textContent = gearTxt;
    el.ghand.className = handbrakeOn ? 'hot' : '';
  }

  el.healthfill.style.width = player.health + '%';
  el.healthval.textContent = Math.round(player.health);
  el.healthtrack.classList.toggle('low', player.health < 30);
  el.staminafill.style.width = player.stamina + '%';
  el.staminaval.textContent = Math.round(player.stamina);
  Weapons.updateHud();
  el.hurtFlash.style.opacity = (player.hurtFlash * 0.7).toFixed(2);
  el.deadScreen.classList.toggle('on', player.dead);

  if (hudAcc > 0.12){
    hudAcc = 0;
    el.modetxt.textContent = mode === 'car' ? 'W pojeździe' : 'Pieszo';
    const hours = timeOfDay * 24;
    const hh = Math.floor(hours), mmn = Math.floor((hours - hh) * 60);
    el.clock.textContent = (hh < 10 ? '0' : '') + hh + ':' + (mmn < 10 ? '0' : '') + mmn;
    el.phase.textContent = phaseName(timeOfDay) + (muted ? ' · wyciszone' : '');
    const px = mode === 'car' ? chassisBody.position.x : player.body.position.x;
    const pz = mode === 'car' ? chassisBody.position.z : player.body.position.z;
    el.coords.textContent = Math.round(px) + ', ' + Math.round(pz);
    drawMinimap();
  }
  if (fpsAcc > 0.5){
    el.fps.textContent = Math.round(fpsCount / fpsAcc) + ' fps · ' + renderer.info.render.calls + ' draw calls';
    fpsAcc = 0; fpsCount = 0;
    if (debugOpen) refreshDebugInfo();
  }

  let nv = null;
  if (mode === 'foot') nv = nearestVehicle();
  const near = !!nv && nv.dist < 3.5;
  promptEl.classList.toggle('on', near || mode === 'car');
  const want = mode === 'car' ? 'out' : (near ? (nv.kind === 'npc' ? 'jack' : 'in') : lastPrompt);
  if (want !== lastPrompt){
    lastPrompt = want;
    promptEl.innerHTML = want === 'out' ? 'Naciśnij <kbd>F</kbd> lub <kbd>E</kbd>, aby wysiąść'
                        : want === 'jack' ? 'Naciśnij <kbd>F</kbd> lub <kbd>E</kbd>, aby ukraść auto'
                        : 'Naciśnij <kbd>F</kbd> lub <kbd>E</kbd>, aby wsiąść';
  }
}
let lastPrompt = 'in';
