/* ---------------------------------------------------------------
   7c. SYGNALIZACJA ŚWIETLNA
   Kilka wybranych skrzyżowań (nie wszystkie) dostaje działającą
   sygnalizację 2-fazową: NS zielone / EW czerwone, potem odwrotnie,
   z krótką przerwą "wszystkie czerwone" między fazami. NPC naprawdę
   się zatrzymują (patrz update-npc.js) — nie tylko wizualne światła.
   --------------------------------------------------------------- */
const TL_PTS = [[3,3],[9,3],[6,9]];   // (i,j) siatki, poza rondami i narożnikami
const TL_CYCLE = 9, TL_ALLRED = 1.4;  // sekundy na fazę / przerwę
const trafficLights = [];

function buildSignalHead(x, z, rotY){
  signLog.push({kind:'sygnalizator',x:x,z:z,rot:rotY});
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.09,3.2,6), new THREE.MeshLambertMaterial({color:0x2a2b2e}));
  pole.position.y = 1.6; g.add(pole);
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.32,0.78,0.26), new THREE.MeshLambertMaterial({color:0x17181b}));
  box.position.set(0, 3.0, 0.14); g.add(box);
  const matR = new THREE.MeshBasicMaterial({ color:0x3a0f0c });
  const matG = new THREE.MeshBasicMaterial({ color:0x0f3a16 });
  const red = new THREE.Mesh(new THREE.SphereGeometry(0.1,8,8), matR);
  red.position.set(0, 3.24, 0.28); g.add(red);
  const grn = new THREE.Mesh(new THREE.SphereGeometry(0.1,8,8), matG);
  grn.position.set(0, 2.78, 0.28); g.add(grn);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  scene.add(g);
  staticBox(x, 1.6, z, 0.25, 3.2, 0.25);
  return { red: matR, grn: matG };
}

TL_PTS.forEach(p => {
  const cx = L(p[0]), cz = L(p[1]), o = ROAD_H + 1.0;
  const heads = [
    buildSignalHead(cx - o, cz - o, 0),           // od -Z (patrzy w +Z)
    buildSignalHead(cx + o, cz + o, Math.PI),     // od +Z
    buildSignalHead(cx - o, cz + o, -Math.PI/2),  // od -X
    buildSignalHead(cx + o, cz - o,  Math.PI/2)   // od +X
  ];
  trafficLights.push({ x: cx, z: cz, radius: 10, nsHeads: [heads[0],heads[1]], ewHeads: [heads[2],heads[3]], nsGreen: true, t: rand(0, TL_CYCLE) });
});

function setHead(h, isGreen){
  h.red.color.setHex(isGreen ? 0x3a0f0c : 0xff2a22);
  h.grn.color.setHex(isGreen ? 0x2ad94a : 0x0f3a16);
}
function updateTrafficLights(dt){
  const full = TL_CYCLE + TL_ALLRED;
  for (const tl of trafficLights){
    tl.t = (tl.t + dt) % (full * 2);
    const inFirst = tl.t < full;
    const local = inFirst ? tl.t : tl.t - full;
    const nsOn = inFirst && local < TL_CYCLE;
    const ewOn = !inFirst && local < TL_CYCLE;
    tl.nsGreen = nsOn;
    tl.ewGreenNow = ewOn;
    tl.nsHeads.forEach(h => setHead(h, nsOn));
    tl.ewHeads.forEach(h => setHead(h, ewOn));
  }
}

/* true, jeśli npc jadący kierunkiem (dx,dz) z pozycji (px,pz) powinien
   się teraz zatrzymać przed najbliższą czerwoną sygnalizacją */
function redLightAhead(px, pz, dx, dz){
  for (const tl of trafficLights){
    const ox = tl.x - px, oz = tl.z - pz;
    const dist = Math.hypot(ox, oz);
    if (dist > tl.radius) continue;
    const ahead = ox*dx + oz*dz;
    if (ahead < 2 || ahead > 9.5) continue;
    const lat = Math.abs(ox*-dz + oz*dx);
    if (lat > 3.5) continue;
    const isNS = Math.abs(dz) >= Math.abs(dx);
    const green = isNS ? tl.nsGreen : tl.ewGreenNow;
    if (!green) return true;
  }
  return false;
}

/* ---------------------------------------------------------------
   7d. ZNAK B-20 "STOP" (działający) + B-33 ograniczenie prędkości
   STOP naprawdę zatrzymuje NPC: hamują na dojeździe, stoją ~1.4 s
   przy linii i dopiero wtedy ruszają (stopPass chroni przed
   zakleszczeniem — bez tego auto czekałoby w nieskończoność).
   B-33 jest na razie tylko oznakowaniem (prędkości NPC wynikają ze
   stref w traffic-npc.js), nie egzekwowanym limitem.
   --------------------------------------------------------------- */
/* wybrane programowo (test: skrzyżowania, przez które realnie przejeżdżają prostopadłe trasy NPC,
   poza rondami, światłami, narożnikami tras i węzłem autostrady) */
const STOP_PTS = [[5,6],[6,3],[6,7],[1,4],[7,10]];
const stopSigns = [];

function texStop(){
  const S = 128, c = mkCanvas(S,S), g = c.getContext('2d');
  g.fillStyle = '#f2f0ea'; g.beginPath();
  for (let k = 0; k < 8; k++){ const a = TAU*(k+0.5)/8; g.lineTo(S/2+Math.cos(a)*S*0.5, S/2+Math.sin(a)*S*0.5); }
  g.closePath(); g.fill();
  g.fillStyle = '#c5161d'; g.beginPath();
  for (let k = 0; k < 8; k++){ const a = TAU*(k+0.5)/8; g.lineTo(S/2+Math.cos(a)*S*0.44, S/2+Math.sin(a)*S*0.44); }
  g.closePath(); g.fill();
  g.fillStyle = '#fff'; g.font = '700 38px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('STOP', S/2, S/2+2);
  return toTex(c);
}
function texSpeed(n){
  const S = 128, c = mkCanvas(S,S), g = c.getContext('2d');
  g.fillStyle = '#f2f0ea'; g.beginPath(); g.arc(S/2,S/2,S/2-2,0,TAU); g.fill();
  g.strokeStyle = '#c5161d'; g.lineWidth = 12; g.beginPath(); g.arc(S/2,S/2,S/2-12,0,TAU); g.stroke();
  g.fillStyle = '#111'; g.font = '700 50px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(n), S/2, S/2+3);
  return toTex(c);
}
const stopTex = texStop();
function buildDiscSign(x, z, rotY, tex, seg, r){
  signLog.push({kind:(seg === 8 ? 'STOP' : 'B-33'),x:x,z:z,rot:rotY});
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,2.3,6), new THREE.MeshLambertMaterial({color:0x3a3d42}));
  pole.position.y = 1.15; g.add(pole);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r, seg), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
  disc.position.set(0, 2.35, 0.03);
  if (seg === 8) disc.rotation.z = 0;
  g.add(disc);
  g.position.set(x,0,z); g.rotation.y = rotY;
  scene.add(g);
  staticBox(x, 1.15, z, 0.18, 2.3, 0.18);
}
STOP_PTS.forEach(p => {
  const cx = L(p[0]), cz = L(p[1]);
  stopSigns.push({ x: cx, z: cz, radius: 10 });
  [{x:0,z:1},{x:0,z:-1},{x:1,z:0},{x:-1,z:0}].forEach(d => {
    const a = approachSpot(cx, cz, d, ROAD_H + 1.6, ROAD_H + 0.9);   // prawa krawędź dojazdu, przodem do kierowcy
    buildDiscSign(a.x, a.z, a.rot, stopTex, 8, 0.42);
  });
});
/* B-33 (ograniczenie do 100 km/h): na wjeździe na autostradę w obu kierunkach (prawa krawędź, przodem do kierowcy);
   B-33 (50 km/h) na łącznicy zjazdowej przed miastem */
buildDiscSign(HWY_A_OUT - 1.6, HWY_IC_Z - 78, Math.PI, texSpeed(100), 24, 0.45);   // jezdnia A (jedzie na +Z, nadjeżdża od północy), za estakadą
buildDiscSign(HWY_B_OUT + 1.6, HWY_Z1 - 50, 0, texSpeed(100), 24, 0.45);         // kierunek B jedzie na -Z, nadjeżdża od południa
{ const rs = rampSignSpot(HWY_OFF_RAMP, 0.74, HWY_RAMP_W/2 + 1.3); buildDiscSign(rs.x, rs.z, rs.rot, texSpeed(50), 24, 0.45); }

function stopSignAhead(n, dx, dz, dt){
  let inZone = false;
  for (const s of stopSigns){
    const ox = s.x - n.pos.x, oz = s.z - n.pos.y;
    if (Math.hypot(ox, oz) > s.radius) continue;
    const ahead = ox*dx + oz*dz;
    if (ahead < 1.5 || ahead > 9) continue;
    const lat = Math.abs(ox*-dz + oz*dx);
    if (lat > 3.5) continue;
    inZone = true;
    if (n.stopPass) return false;
    if (n.speed < 0.6){          // postój gdziekolwiek w strefie dojazdu liczy się do odczekania
      n.stopHold = (n.stopHold || 0) + dt;
      if (n.stopHold > 1.4){ n.stopPass = true; n.stopHold = 0; return false; }
    }
    return true;
  }
  if (!inZone){ n.stopPass = false; n.stopHold = 0; }
  return false;
}
