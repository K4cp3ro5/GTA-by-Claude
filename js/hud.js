/* ---------------------------------------------------------------
   20. HUD + MINIMAPA
   --------------------------------------------------------------- */
const el = {
  modetxt: document.getElementById('modetxt'),
  clock:   document.getElementById('clock'),
  phase:   document.getElementById('phase'),
  clockIcon: document.getElementById('clockIcon'),
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
  carlblTxt:   document.getElementById('carlblTxt'),
  indLh:       document.getElementById('indLh'),
  indRh:       document.getElementById('indRh'),
  toast:       document.getElementById('toast')
};
/* przyczyny śmierci (damagePlayer(…, cause), killPlayer) — podtytuł ekranu śmierci */
const DEATH_CAUSES = { upadek: 'Upadek z wysokości.', kraksa: 'Wypadek samochodowy.', wybuch: 'Wybuch — za blisko ognia.', rakieta: 'Trafienie rakietą.', katastrofa: 'Katastrofa lotnicza.',
  'wyskok': 'Wyskok z pędzącego auta.', strzał: 'Postrzał.', kot: 'Skrzywdziłeś kota. Karma wraca natychmiast.' };
/* krótki komunikat na środku ekranu */
let _toastT = 0;
function hudToast(text, secs){ el.toast.textContent = text; el.toast.classList.add('on'); _toastT = secs || 2.2; }

/* statyczna mapa CAŁEGO świata (miasto + pas podmiejski + autostrady) rysowana raz */
const MAP_SCALE = 1.35;
const MAP_X0 = -490, MAP_Z0 = -890;                                  // obie wyspy (z nasypem i drugim pasem) z morzem dookoła
const MAP_W = 980, MAP_H = 1340;
const mapStatic = mkCanvas(Math.ceil(MAP_W * MAP_SCALE), Math.ceil(MAP_H * MAP_SCALE));
(function drawStaticMap(){
  const g = mapStatic.getContext('2d');
  const wx = v => (v - MAP_X0) * MAP_SCALE, wz = v => (v - MAP_Z0) * MAP_SCALE;
  g.fillStyle = '#16384b'; g.fillRect(0, 0, mapStatic.width, mapStatic.height);   // morze
  ISLANDS.forEach(r => { g.fillStyle = r.name === 'main' ? '#171a20' : '#1f2a1c'; g.fillRect(wx(r.x0), wz(r.z0), (r.x1 - r.x0) * MAP_SCALE, (r.z1 - r.z0) * MAP_SCALE); });
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
  g.strokeStyle = 'rgba(160,210,230,.35)'; g.lineWidth = 2;          // linia brzegowa (nabrzeża)
  ISLANDS.forEach(r => g.strokeRect(wx(r.x0), wz(r.z0), (r.x1 - r.x0) * MAP_SCALE, (r.z1 - r.z0) * MAP_SCALE));
})();

const mm = document.getElementById('minimap');
const mg = mm.getContext('2d');
const MM = mm.width;

let mmZoom = 0.62;                                     // skala minimapy względem mapStatic (mniej = szerszy widok)
function drawMinimap(){
  const wp0 = playerWorldPos(), px = wp0.x, pz = wp0.z;
  const cx = (px - MAP_X0) * MAP_SCALE;
  const cz = (pz - MAP_Z0) * MAP_SCALE;
  /* przybliżenie minimapy wg trybu (pieszo bliżej, autem / łodzią dalej, samolotem najdalej) — płynnie */
  const zt = mode === 'plane' ? 0.28 : (mode === 'car' || mode === 'boat') ? 0.5 : 0.62;
  mmZoom += (zt - mmZoom) * 0.08;
  const zs = MAP_SCALE * mmZoom;

  mg.clearRect(0, 0, MM, MM);
  mg.fillStyle = '#16384b';
  mg.fillRect(0, 0, MM, MM);
  mg.save(); mg.translate(MM / 2, MM / 2); mg.scale(mmZoom, mmZoom); mg.drawImage(mapStatic, -cx, -cz); mg.restore();

  const toMap = (wx, wz) => [ MM/2 + (wx - px) * zs, MM/2 + (wz - pz) * zs ];
  navDrawMinimap(mg, toMap, MM);                       // trasa do celu (navigation.js)

  /* NPC (piraci drogowi większym kwasowo zielonym punktem, jak lakier) */
  for (let i = 0; i < npcs.length; i++){
    const p = toMap(npcs[i].pos.x, npcs[i].pos.y), pir = npcs[i].profile === 'pirat';
    if (p[0] < -6 || p[0] > MM+6 || p[1] < -6 || p[1] > MM+6) continue;
    mg.fillStyle = pir ? '#7cff2e' : '#7f8794';
    if (pir) mg.fillRect(p[0]-2.5, p[1]-2.5, 5, 5); else mg.fillRect(p[0]-2, p[1]-2, 4, 4);
  }

  /* zaparkowane skradzione (i porzucone prowadzalne skradzione) — małe fioletowe kwadraty */
  mg.fillStyle = '#b07ad8';
  const sq = (x, z) => { const p = toMap(x, z); if (p[0] > -6 && p[0] < MM+6 && p[1] > -6 && p[1] < MM+6) mg.fillRect(p[0]-2.5, p[1]-2.5, 5, 5); };
  parkedCars.forEach(q => { if (q.owner === 'stolen') sq(q.x, q.z); });
  if (mode === 'foot' && driving.owner !== 'player') sq(chassisBody.position.x, chassisBody.position.z);
  /* auto gracza — strzałka jak u pieszego, ten sam poprawny wzór obrotu (prowadzone albo zaparkowane twoje) */
  const ownP = driving.owner === 'player' || mode === 'car' ? null : parkedCars.find(q => q.owner === 'player');
  if (!ownP && activeCarGone){ /* auto zniszczone */ } else {
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
  }

  /* łodzie (niebieskie kreski) i łódź gracza */
  for (const b of boats){ const q = toMap(b.pos.x, b.pos.z); if (b === curBoat || q[0] < -6 || q[0] > MM + 6 || q[1] < -6 || q[1] > MM + 6) continue; mg.save(); mg.translate(q[0], q[1]); mg.rotate(-b.heading + Math.PI); mg.fillStyle = '#7fc4e8'; mg.fillRect(-1.5, -3.5, 3, 7); mg.restore(); }
  if (mode === 'boat' && curBoat){
    mg.save(); mg.translate(MM / 2, MM / 2); mg.rotate(-curBoat.heading + Math.PI);
    mg.fillStyle = '#f2f0ea'; mg.beginPath(); mg.moveTo(0, -7); mg.lineTo(3.5, -1); mg.lineTo(3.5, 6); mg.lineTo(-3.5, 6); mg.lineTo(-3.5, -1); mg.closePath(); mg.fill();
    mg.restore();
  }
  /* koty — pomarańczowe kropki (nakarmione: różowe) */
  for (const c of CATS){ if (c.dead) continue; const q = toMap(c.x, c.z); if (q[0] < -4 || q[0] > MM + 4 || q[1] < -4 || q[1] > MM + 4) continue; mg.fillStyle = c.fedT > clock ? '#ff7aa2' : '#ff9d2e'; mg.beginPath(); mg.arc(q[0], q[1], 2.2, 0, TAU); mg.fill(); }
  /* samoloty NPC (ruch lotniczy) — małe sylwetki */
  for (const a of airPlanes){ const q = toMap(a.pos.x, a.pos.z); if (q[0] < -8 || q[0] > MM + 8 || q[1] < -8 || q[1] > MM + 8) continue; mg.save(); mg.translate(q[0], q[1]); mg.rotate(-a.heading + Math.PI); mg.fillStyle = '#cfe3ee'; mg.fillRect(-0.9, -4.5, 1.8, 9); mg.fillRect(-4.5, -1, 9, 2); mg.fillRect(-2, 3, 4, 1.4); mg.restore(); }
  /* samolot gracza */
  if (mode === 'plane' && curPlane){
    _cpF.set(0, 0, 1).applyQuaternion(curPlane.quat);
    mg.save(); mg.translate(MM / 2, MM / 2); mg.rotate(-Math.atan2(_cpF.x, _cpF.z) + Math.PI);
    mg.fillStyle = '#f2f0ea'; mg.beginPath(); mg.moveTo(0, -7); mg.lineTo(1.4, -1); mg.lineTo(7, 1.5); mg.lineTo(1.4, 1.5); mg.lineTo(0.9, 5); mg.lineTo(3, 6.5); mg.lineTo(-3, 6.5); mg.lineTo(-0.9, 5); mg.lineTo(-1.4, 1.5); mg.lineTo(-7, 1.5); mg.lineTo(-1.4, -1); mg.closePath(); mg.fill();
    mg.restore();
  }
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

/* --- kompas: pasek kierunków (kierunek patrzenia kamery), znacznik twojego auta --- */
const compassCv = document.getElementById('compassCv'), cctx = compassCv.getContext('2d');
const _cDir = new THREE.Vector3();
const COMPASS_LBL = { 0: 'PN', 45: 'PN-WSCH', 90: 'WSCH', 135: 'PD-WSCH', 180: 'PD', 225: 'PD-ZACH', 270: 'ZACH', 315: 'PN-ZACH' };
function bearingTo(dx, dz){ return (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360; }   // 0 = północ (−Z), 90 = wschód
function drawCompass(){
  const W = compassCv.width, Hh = compassCv.height, ppd = 2.1, c = cctx;
  camera.getWorldDirection(_cDir);
  const b = bearingTo(_cDir.x, _cDir.z);
  c.clearRect(0, 0, W, Hh);
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  for (let d = Math.ceil((b - 100) / 5) * 5; d <= b + 100; d += 5){
    const x = W / 2 + (d - b) * ppd, n = ((d % 360) + 360) % 360, edge = 1 - Math.min(1, Math.abs(x - W / 2) / (W / 2));
    c.globalAlpha = 0.25 + edge * 0.75;
    const major = n % 45 === 0, h = major ? 8 : n % 15 === 0 ? 5 : 3;
    c.fillStyle = n % 90 === 0 ? '#f2f0ea' : '#9a978f';
    c.fillRect(Math.round(x), Hh - 4 - h, 1, h);
    if (major){
      c.font = (n % 90 === 0 ? '600 11px ' : '500 8px ') + 'Inter, system-ui, sans-serif';
      c.fillStyle = n === 0 ? '#ffb03a' : (n % 90 === 0 ? '#f2f0ea' : '#9a978f');
      c.fillText(COMPASS_LBL[n], x, Hh - 15);
    }
  }
  c.globalAlpha = 1;
  /* twoje auto (gdy nie jedziesz nim) */
  const own = (mode === 'car' && driving.owner === 'player') ? null : (driving.owner === 'player' ? { x: chassisBody.position.x, z: chassisBody.position.z } : parkedCars.find(q => q.owner === 'player'));
  if (own){
    const p = mode === 'car' ? chassisBody.position : player.body.position;
    let rel = ((bearingTo(own.x - p.x, own.z - p.z) - b + 540) % 360) - 180;
    const x = W / 2 + clamp(rel, -95, 95) * ppd;
    c.fillStyle = '#e05a4a'; c.beginPath(); c.moveTo(x, Hh - 3); c.lineTo(x - 4, Hh - 9); c.lineTo(x + 4, Hh - 9); c.closePath(); c.fill();
  }
  /* środek: znacznik i kurs w stopniach */
  c.fillStyle = '#ffb03a'; c.fillRect(W / 2 - 0.5, 2, 1.5, 7);
  c.font = '500 9px Inter, system-ui, sans-serif'; c.fillStyle = '#c9c6bd';
  c.fillText(Math.round(b) % 360 + '°', W / 2 + 18, 10);
}
/* --- prędkościomierz: tarcza 240° do v maks. typu, wskazówka, liczba, obroty na wewnętrznym łuku --- */
const speedCv = document.getElementById('speedCv'), sctx = speedCv.getContext('2d');
function drawSpeedo(kmh, gauge, rpm){
  const c = sctx, W = speedCv.width, cx = W / 2, cy = 82, R = 70, a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  const vmax = gauge || CAR_TYPES[carType].gauge || 200, f = v => a0 + (a1 - a0) * clamp(v / vmax, 0, 1);
  const rp = rpm === undefined ? engineRpm : rpm;
  c.clearRect(0, 0, W, speedCv.height);
  c.lineCap = 'round';
  c.lineWidth = 4; c.strokeStyle = 'rgba(200,198,191,.16)'; c.beginPath(); c.arc(cx, cy, R, a0, a1); c.stroke();
  c.strokeStyle = '#ffb03a'; c.beginPath(); c.arc(cx, cy, R, a0, f(kmh)); c.stroke();
  /* obroty */
  c.lineWidth = 2; c.strokeStyle = 'rgba(200,198,191,.10)'; c.beginPath(); c.arc(cx, cy, R - 9, a0, a1); c.stroke();
  c.strokeStyle = rp > 0.85 ? '#ff4a3d' : '#6f8fa0'; c.beginPath(); c.arc(cx, cy, R - 9, a0, a0 + (a1 - a0) * clamp(rp, 0, 1)); c.stroke();
  /* podziałka */
  const step = vmax <= 60 ? 10 : 20;
  c.font = '500 9px Inter, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let v = 0; v <= vmax; v += step / 2){
    const a = f(v), major = v % step === 0, r0 = R + 4, r1 = R + (major ? 9 : 6);
    c.strokeStyle = major ? 'rgba(242,240,234,.65)' : 'rgba(242,240,234,.28)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); c.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); c.stroke();
    if (major && (vmax <= 60 || v % (step * 2) === 0)){ c.fillStyle = '#8d8b86'; c.fillText(String(v), cx + Math.cos(a) * (R - 20), cy + Math.sin(a) * (R - 20)); }
  }
  /* wskazówka */
  const an = f(kmh);
  c.strokeStyle = '#f2f0ea'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx + Math.cos(an) * 14, cy + Math.sin(an) * 14); c.lineTo(cx + Math.cos(an) * (R - 3), cy + Math.sin(an) * (R - 3)); c.stroke();
  /* liczba */
  c.fillStyle = '#f2f0ea'; c.font = '300 30px Inter, system-ui, sans-serif'; c.fillText(String(Math.round(kmh)), cx, cy + 4);
  c.fillStyle = '#8d8b86'; c.font = '500 8px Inter, system-ui, sans-serif'; c.fillText('KM/H', cx, cy + 24);
}
let hudAcc = 0, fpsAcc = 0, fpsCount = 0;
function updateHud(dt, kmh){
  hudAcc += dt; fpsAcc += dt; fpsCount++;

  el.speedo.classList.toggle('on', mode === 'car' || mode === 'plane' || mode === 'boat' || mode === 'ride');
  if (mode === 'plane' && curPlane){
    const p = curPlane, lbl = 'Samolot · ' + p.T.name;
    if (el.carlblTxt.textContent !== lbl){ el.carlblTxt.textContent = lbl; el.carlbl.classList.remove('stolen'); }
    drawSpeedo(kmh, p.T.gauge, p.thr);
    el.gval.textContent = Math.round(p.thr * 100) + '% · WYS ' + Math.max(0, Math.round(p.pos.y - p.T.gear - planeGroundY(p.pos.x, p.pos.z, p.pos.y))) + ' m';
    el.ghand.textContent = 'GAZ'; el.ghand.className = '';
  } else if (mode === 'boat' && curBoat){
    const lbl = 'Łódź · ' + BOAT_T.name;
    if (el.carlblTxt.textContent !== lbl){ el.carlblTxt.textContent = lbl; el.carlbl.classList.remove('stolen'); }
    drawSpeedo(kmh, BOAT_T.gauge, Math.abs(curBoat.thr));
    el.gval.textContent = curBoat.v < -0.3 ? 'R' : curBoat.v > 0.3 ? 'D' : 'N';
    el.ghand.textContent = 'GAZ'; el.ghand.className = '';
  } else if (mode === 'ride' && curRide){
    const lbl = 'Przejażdżka · ' + curRide.name.replace('Kolejka ', '');
    if (el.carlblTxt.textContent !== lbl){ el.carlblTxt.textContent = lbl; el.carlbl.classList.remove('stolen'); }
    drawSpeedo(rideSpeed() * 3.6, 140, 0);
    el.gval.textContent = 'WYS ' + Math.round(ridePos().y) + ' m'; el.ghand.textContent = 'KOLEJKA'; el.ghand.className = '';
  } else if (el.ghand.textContent !== 'RĘCZNY') el.ghand.textContent = 'RĘCZNY';
  if (_toastT > 0){ _toastT -= dt; if (_toastT <= 0) el.toast.classList.remove('on'); }
  if (mode === 'car'){
    const lbl = (driving.owner === 'player' ? (CAR_TYPES[carType].bike ? 'Twój rower' : 'Twój samochód') : 'Skradziony') + ' · ' + CAR_TYPES[carType].name;
    if (el.carlblTxt.textContent !== lbl){ el.carlblTxt.textContent = lbl; el.carlbl.classList.toggle('stolen', driving.owner !== 'player'); }
    drawSpeedo(kmh);
    el.indLh.classList.toggle('on', playerInd === 'L' && indBlinkOn); el.indRh.classList.toggle('on', playerInd === 'R' && indBlinkOn);
    el.gval.textContent = gearTxt;
    el.ghand.className = handbrakeOn ? 'hot' : '';
  }

  drawCompass();
  el.healthfill.style.width = player.health + '%';
  el.healthval.textContent = Math.round(player.health);
  el.healthtrack.classList.toggle('low', player.health < 30);
  el.staminafill.style.width = player.stamina + '%';
  el.staminaval.textContent = Math.round(player.stamina);
  Weapons.updateHud();
  el.hurtFlash.style.opacity = (player.hurtFlash * 0.7).toFixed(2);
  el.deadScreen.classList.toggle('on', player.dead);
  renderer.domElement.classList.toggle('dead', player.dead);
  if (player.dead){
    const t = player.deathMsg || 'NIE ŻYJESZ', why = DEATH_CAUSES[player.deathCause] || 'Tym razem się nie udało.';
    const dsT = document.getElementById('dsTitle'), dsC = document.getElementById('dsCause');
    if (dsT.textContent !== t) dsT.textContent = t;
    if (dsC.textContent !== why) dsC.textContent = why;
    const left = Math.max(0, ((player.respawnAt || 0) - performance.now()) / 1000);
    document.getElementById('dsTimer').textContent = 'Odrodzenie w szpitalu za ' + Math.ceil(left) + ' s';
    document.getElementById('dsBar').style.width = Math.round(100 - left / (RESPAWN_MS / 1000) * 100) + '%';
  }

  if (hudAcc > 0.12){
    hudAcc = 0;
    el.modetxt.textContent = mode === 'car' ? 'W pojeździe' : mode === 'plane' ? 'W powietrzu' : mode === 'boat' ? 'Na wodzie' : mode === 'ride' ? 'Przejażdżka' : 'Pieszo';
    const hours = timeOfDay * 24;
    const hh = Math.floor(hours), mmn = Math.floor((hours - hh) * 60);
    el.clock.textContent = (hh < 10 ? '0' : '') + hh + ':' + (mmn < 10 ? '0' : '') + mmn;
    el.clockIcon.textContent = (timeOfDay > 0.25 && timeOfDay < 0.8) ? '☀' : '☾';
    el.phase.textContent = phaseName(timeOfDay) + (muted ? ' · wyciszone' : '');
    const wp1 = playerWorldPos(), px = wp1.x, pz = wp1.z;
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
  promptEl.classList.toggle('on', near || mode === 'car' || mode === 'boat' || (mode === 'ride' && curRide && curRide.canExit) || (mode === 'plane' && curPlane && ((curPlane.onGround && curPlane.v < 3) || (!curPlane.onGround && curPlane.agl > 15))));
  const want = mode === 'ride' ? 'outRide' : mode === 'car' ? 'out' : mode === 'boat' ? 'outBoat' : mode === 'plane' ? (curPlane && !curPlane.onGround ? 'bail' : 'outPlane') : (near ? (nv.kind === 'npc' ? 'jack' : nv.kind === 'plane' ? 'plane' : nv.kind === 'boat' ? 'boat' : nv.kind === 'ride' ? (nv.ride.ready() ? 'ride:' : 'rideWait:') + nv.ride.name : 'in') : lastPrompt);
  if (want !== lastPrompt){
    lastPrompt = want;
    promptEl.innerHTML = want === 'out' || want === 'outRide' ? 'Naciśnij <kbd>F</kbd>, aby wysiąść'
                        : want === 'outPlane' ? 'Naciśnij <kbd>F</kbd>, aby wysiąść z samolotu'
                        : want === 'bail' ? 'Naciśnij <kbd>F</kbd>, aby wyskoczyć ze spadochronem'
                        : want === 'outBoat' ? 'Naciśnij <kbd>F</kbd> przy brzegu, aby wysiąść'
                        : want === 'boat' ? 'Naciśnij <kbd>F</kbd>, aby wsiąść do łodzi'
                        : want.indexOf('ride:') === 0 ? 'Naciśnij <kbd>F</kbd> — przejażdżka: ' + want.slice(5)
                        : want.indexOf('rideWait:') === 0 ? (nv && nv.ride ? nv.ride.wait : '')
                        : want === 'jack' ? 'Naciśnij <kbd>F</kbd> lub <kbd>E</kbd>, aby ukraść auto'
                        : want === 'plane' ? 'Naciśnij <kbd>F</kbd> lub <kbd>E</kbd>, aby wsiąść do samolotu'
                        : 'Naciśnij <kbd>F</kbd> lub <kbd>E</kbd>, aby wsiąść';
  }
}
let lastPrompt = 'in';
