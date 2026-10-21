/* ---------------------------------------------------------------
   14b. SAMOLOTY — odrzutowiec i awionetka z lotniska (AIRPORT_PLANES): modele, wsiadanie, lot.
   Model lotu zręcznościowy: ciąg (gaz W/S) i opór ~v², grawitacja wzdłuż pochylenia; strzałki ustawiają
   docelowe pochylenie i przechył (puszczone — lot poziomy), przechył daje zakręt, asystent lądowania przy
   małym gazie, A/D = kołowanie, Spacja = hamulce. F w locie = skok ze spadochronem (samolot bez pilota
   nurkuje). Zderzenie z budynkiem / twarde przyziemienie = katastrofa (wybuch, odłamki, dym, płonący
   wrak; pilot ginie), samolot wraca na lotnisko po kilkunastu sekundach. Każdy samolot ma ciało kinematyczne (kadłub +
   skrzydła), więc stojący na płycie jest przeszkodą dla aut i gracza.
   --------------------------------------------------------------- */
const G_PLANE = 16;
const PLANE_TYPES = {
  jet:  { name: 'Odrzutowiec', thrust: 7.5, vMax: 92, vStall: 40, vRot: 45, pitchRate: 0.55, rollRate: 1.1, yawGround: 0.42,
          gear: 2.35, camDist: 36, camH: 9, gauge: 360, half: [1.7, 1.8, 14.5], wing: [12.5, 0.25, 2.6], door: [-2.6, 8.5] },
  prop: { name: 'Awionetka', thrust: 5.0, vMax: 62, vStall: 20, vRot: 23, pitchRate: 1.0, rollRate: 2.0, yawGround: 0.8,
          gear: 1.4, camDist: 15, camH: 4, gauge: 240, half: [0.8, 1.0, 4.3], wing: [5.6, 0.12, 0.9], door: [-1.5, 0.6] }
};
const _planeMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 60, specular: 0x333333 });

/* --- modele (nos w lokalne +Z, środek ciężkości w y = 0, koła na y = −gear) --- */
function planeWing(pts, thick){                        // płaski kształt w XZ (punkty [x, z]) wyciągnięty w dół o thick
  const sh = new THREE.Shape(); pts.forEach((p, i) => i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1]));
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false }); g.rotateX(Math.PI / 2);   // kształt y -> z, grubość w dół
  return g;
}
function planeFin(pts, thick){                         // kształt w płaszczyźnie (z, y) wyciągnięty w bok
  const sh = new THREE.Shape(); pts.forEach((p, i) => i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1]));
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false }); g.rotateY(-Math.PI / 2); g.translate(thick / 2, 0, 0);
  return g;
}
function cylZ(r0, r1, len, seg){ const g = new THREE.CylinderGeometry(r1, r0, len, seg || 14); g.rotateX(Math.PI / 2); return g; }   // oś Z, r0 z tyłu, r1 z przodu
function wheelX(r, w){ const g = new THREE.CylinderGeometry(r, r, w, 14); g.rotateZ(Math.PI / 2); return g; }          // koło: oś obrotu X (toczy się wzdłuż Z)
/* kadłub: bryła obrotowa wokół osi Z z profilu [[z, r], …] (od ogona do nosa); 16 ścian — boczne ściany
   leżą tuż nad i tuż pod osią (pas okien / malowania); lift(z) unosi oś (podniesiony ogon) */
function fuselage(profile, lift){
  const g = new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(Math.max(0.001, p[1]), p[0])), 16);
  g.rotateX(Math.PI / 2);                                // oś lathe (y) -> z
  const a = g.attributes.position;
  for (let i = 0; i < a.count; i++) a.setY(i, a.getY(i) + lift(a.getZ(i)));
  g.computeVertexNormals();
  return g;
}
/* zastrzał / goleń: prostopadłościan t × t od punktu a do b */
function strut(a, b, t){
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
  const g = new THREE.BoxGeometry(t, len, t);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())));   // r128: bez applyQuaternion
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return g;
}
function buildPlaneModel(kind, livery){
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d), parts = [], add = (geo, color, x, y, z, fn) => parts.push({ geo: geo, color: color, x: x || 0, y: y || 0, z: z || 0, colorFn: fn, quads: !!fn });
  const WHITE = 0xe9eaec, DARK = 0x262a30, GREY = 0xb9bec6, WIN = 0x1b2a38;
  let prop = null;
  if (kind === 'jet'){
    /* kadłub z nosem i stożkiem ogonowym w jednej bryle; ogon uniesiony o 0.09 m na metr za z = −8 */
    const lift = z => z < -8 ? (-8 - z) * 0.09 : 0;
    const prof = [[-16.6, 0.05], [-16.2, 0.3], [-15, 0.6], [-13.5, 0.95], [-12, 1.25], [-10, 1.52], [-8.5, 1.65]];
    for (let z = -8; z <= 9; z += 0.5) prof.push([z, 1.65]);
    prof.push([10, 1.6], [11, 1.48], [12, 1.25], [12.8, 0.98], [13.5, 0.65], [14, 0.32], [14.25, 0.05]);
    add(fuselage(prof, lift), WHITE, 0, 0, 0, (x, y, z) => {
      const side = Math.abs(x) > 1.0;
      if (z > 12 && z < 12.8 && y > 0.3 && y < 1.0) return WIN;                                         // szyby kabiny (pas na nosie)
      if (side && y > 0 && y < 0.7 && z > -7.5 && z < 9.6) return Math.floor((z + 20) / 0.5) % 2 ? WIN : null;   // okna co 1 m
      if (side && y < 0 && y > -0.7 && z > -11 && z < 11.5) return livery;                         // pas malowania
      if (z < -14.8) return livery;                                                                // końcówka ogona
      return null;
    });
    for (const sx of [-1, 1]){
      add(planeWing([[0, 3.2], [sx * 12.5, -3.6], [sx * 12.5, -5.4], [0, -3.2]], 0.32), WHITE, 0, -0.75, 0);   // skrzydła (skos), nasada w kadłubie
      add(planeWing([[sx * 12.5, -3.6], [sx * 12.7, -4.0], [sx * 12.7, -5.2], [sx * 12.5, -5.4]], 0.32), livery, 0, -0.75, 0);
      add(cylZ(0.8, 0.9, 3.6), GREY, sx * 4.8, -1.75, 1.2);                 // silniki
      add(cylZ(0.72, 0.72, 0.12), DARK, sx * 4.8, -1.75, 3.05);
      add(cylZ(0.35, 0.62, 0.7), DARK, sx * 4.8, -1.75, -0.95);             // dysza
      add(B(0.25, 0.75, 2.2), GREY, sx * 4.8, -0.95, 0.6);                  // pylon (do spodu skrzydła)
      add(planeWing([[0, -11.0], [sx * 4.9, -13.6], [sx * 4.9, -14.8], [0, -14.2]], 0.2), WHITE, 0, 1.0, 0);   // statecznik poziomy (nasada w ogonie)
      add(strut([sx * 1.7, -1.2, -0.8], [sx * 1.7, -1.8, -0.8], 0.3), DARK);   // podwozie główne: goleń + 2 koła
      add(wheelX(0.55, 0.32), DARK, sx * 1.52, -1.8, -0.8); add(wheelX(0.55, 0.32), DARK, sx * 1.88, -1.8, -0.8);
    }
    add(planeFin([[-9.0, 1.0], [-15.8, 1.1], [-16.4, 6.6], [-14.2, 6.6]], 0.34), livery, 0, 0, 0);   // statecznik pionowy (spód w kadłubie)
    add(strut([0, -1.2, 9.2], [0, -1.95, 9.2], 0.22), DARK); add(wheelX(0.4, 0.26), DARK, 0, -1.95, 9.2);   // podwozie przednie
  } else {
    /* kadłub z osłoną silnika: szyby kabiny i osłona malowane na bryle */
    const prof = [[-3.5, 0.03], [-3.3, 0.16], [-2.5, 0.3], [-1.5, 0.48], [-0.6, 0.66], [0, 0.76], [0.5, 0.79], [1.0, 0.8], [1.6, 0.8], [2.3, 0.78], [2.8, 0.74], [3.3, 0.62], [3.42, 0.35], [3.45, 0.05]];
    add(fuselage(prof, () => 0), WHITE, 0, 0, 0, (x, y, z) => {
      if (z > 2.3) return livery;                                                                  // osłona silnika
      if (z > 0.15 && z < 2.0 && y > 0.12) return WIN;                                             // kabina: szyby boczne i przednia
      if (Math.abs(x) > 0.3 && y < 0 && y > -0.45 && z < 0.15 && z > -3) return livery;            // pas
      return null;
    });
    const sp = new THREE.ConeGeometry(0.3, 0.6, 10); sp.rotateX(Math.PI / 2); add(sp, DARK, 0, 0, 3.72);   // kołpak śmigła
    add(B(11.2, 0.14, 1.55), WHITE, 0, 0.86, 0.95);                          // skrzydło (górnopłat) — leży na dachu kabiny
    add(B(1.0, 0.1, 1.2), WHITE, 0, 0.83, 0.95);                             // owiewka nasady skrzydła
    for (const sx of [-1, 1]){
      add(B(0.9, 0.15, 1.56), livery, sx * 5.1, 0.86, 0.95);                 // końcówki skrzydeł
      add(strut([sx * 0.6, -0.4, 0.9], [sx * 2.7, 0.79, 0.95], 0.07), GREY);   // zastrzał: dół kadłuba -> spód skrzydła
      add(strut([sx * 0.45, -0.55, 0.5], [sx * 1.0, -1.15, 0.5], 0.08), GREY); add(wheelX(0.3, 0.16), DARK, sx * 1.08, -1.15, 0.5);   // podwozie główne
    }
    add(B(3.6, 0.1, 0.95), WHITE, 0, 0.1, -2.95);                            // statecznik poziomy (nasada w ogonie)
    add(planeFin([[-2.2, 0.12], [-3.35, 0.12], [-3.6, 1.45], [-3.0, 1.45]], 0.1), livery, 0, 0, 0);   // statecznik pionowy
    add(strut([0, -0.6, 2.4], [0, -1.15, 2.4], 0.08), GREY); add(wheelX(0.25, 0.14), DARK, 0, -1.15, 2.4);   // koło przednie
    const pg = new THREE.BoxGeometry(0.16, 2.3, 0.05);
    prop = new THREE.Mesh(pg, new THREE.MeshLambertMaterial({ color: 0x1b1d21 }));
    prop.position.set(0, 0, 3.55);
  }
  const group = new THREE.Group(), m = new THREE.Mesh(mergeColored(parts), _planeMat);
  m.castShadow = m.receiveShadow = true;
  group.add(m); if (prop) group.add(prop);
  scene.add(group);
  return { group: group, prop: prop };
}

/* --- samoloty na lotnisku --- */
const planes = [];
const _pQ = new THREE.Quaternion(), _pE = new THREE.Euler(), _pF = new THREE.Vector3(), _pR = new THREE.Vector3(), _pAxis = new THREE.Vector3(), _pY = new THREE.Vector3(0, 1, 0);
function planeGroundY(x, z, yTop){ const g = groundAt(x, z, yTop); return g === null ? 0 : g; }
function resetPlane(p){
  const T = p.T, s = p.spec;
  p.pos.set(s.x, planeGroundY(s.x, s.z, 30) + T.gear, s.z);
  p.quat.setFromEuler(_pE.set(0, s.heading, 0, 'YXZ'));
  p.v = 0; p.vy = 0; p.thr = 0; p.onGround = true; p.wreckT = 0; p.free = false; p.freeT = 0; p.agl = undefined; p.wreck = null; p.waitReset = false;
  p.body.collisionFilterMask = -1; p.group.children[0].material = _planeMat;
  p.group.visible = true;
  if (!p.bodyIn){ addBody(p.body); p.bodyIn = true; }
  syncPlane(p);
}
function syncPlane(p){
  p.group.position.copy(p.pos); p.group.quaternion.copy(p.quat);
  p.body.position.set(p.pos.x, p.pos.y, p.pos.z);
  const bq = p.body.quaternion; bq.x = p.quat.x; bq.y = p.quat.y; bq.z = p.quat.z; bq.w = p.quat.w;
}
(function spawnPlanes(){
  AIRPORT_PLANES.forEach(s => {
    const T = PLANE_TYPES[s.kind], m = buildPlaneModel(s.kind, s.livery);
    const b = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: matCar });
    b.addShape(new CANNON.Box(new CANNON.Vec3(T.half[0], T.half[1], T.half[2])));
    b.addShape(new CANNON.Box(new CANNON.Vec3(T.wing[0], T.wing[1], T.wing[2])), new CANNON.Vec3(0, s.kind === 'jet' ? -0.9 : 0.95, s.kind === 'jet' ? -1 : 0.85));
    b.collisionFilterGroup = G_PLANE; b.collisionFilterMask = -1; b.isPlane = true;
    const p = { kind: s.kind, T: T, spec: s, group: m.group, prop: m.prop, body: b, bodyIn: false, pos: new THREE.Vector3(), quat: new THREE.Quaternion(), v: 0, vy: 0, thr: 0, onGround: true, wreckT: 0 };
    planes.push(p);
    resetPlane(p);
  });
})();

function planeDoorPoint(p, out){
  const d = p.T.door; _pF.set(d[0], 0, d[1]).applyQuaternion(p.quat);
  out.x = p.pos.x + _pF.x; out.z = p.pos.z + _pF.z; out.y = p.pos.y - p.T.gear;
  return out;
}

/* --- wsiadanie / wysiadanie, skok ze spadochronem --- */
let curPlane = null;
const planeKeysHelp = 'W / S — gaz · ↑ / ↓ — w górę / w dół · ← / → — skręt · A / D — kołowanie · Spacja — hamulce · F — wysiadka (w locie: spadochron)';
function enterPlane(p){
  curPlane = p; mode = 'plane'; p.free = false;
  player.mesh.visible = false; delBody(player.body);
  planeCamYaw = 0;
  hudToast(p.T.name + ': ' + planeKeysHelp, 6);
  setTimeout(() => { if (curPlane === p) hudToast('Lądowanie: nad pasem zdejmij gaz (S) i puść strzałki — samolot sam łagodnie przyziemi', 5); }, 6500);
}
function exitPlane(force){
  const p = curPlane; if (!p) return;
  if (!force && (!p.onGround || p.v > 3)){
    if (p.onGround) { hudToast('Zatrzymaj się, żeby wysiąść'); return; }
    if ((p.agl || 0) < 15){ hudToast('Za nisko na skok — wyląduj'); return; }
    return bailOut(p);
  }
  /* na ziemi: przy drzwiach; w powietrzu (wymuszone: debug, śmierć) albo drzwi w zabudowie — najbliższe bezpieczne miejsce */
  const d = planeDoorPoint(p, { x: 0, y: 0, z: 0 });
  let s = p.onGround ? safeSpot(d.x, d.z, 0, 3) : null;
  if (!s) s = safeSpot(p.pos.x, p.pos.z, 8, 40) || { x: HOSPITAL_SPAWN.x, y: 0, z: HOSPITAL_SPAWN.z };
  mode = 'foot'; curPlane = null;
  player.mesh.visible = true;
  player.body.position.set(s.x, s.y + 1.2, s.z);
  player.body.velocity.set(0, 0, 0); player.body.wakeUp(); addBody(player.body);
  player.fallSpeed = 0;
  Sound.engine(false, 0, 0);
}
/* wolne miejsce na ziemi dla pieszego: promień rMin…rMax wokół (x, z), poziome podłoże do 1 m (ulica, chodnik,
   trawa — nie dach, nie pomost), poza budynkami, wrakami, samolotami i wodą; null = nic w zasięgu */
function safeSpot(x, z, rMin, rMax){
  for (let r = rMin; r <= rMax; r += 3){
    const n = r < 1 ? 1 : Math.max(8, Math.round(r * 1.2));
    for (let k = 0; k < n; k++){
      const a = k / n * TAU + r * 0.37, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (Math.abs(px) > WALL_X - 3 || Math.abs(pz) > WALL_X - 3) continue;
      const h = rayHit(px, 160, pz, px, -2, pz, G_WORLD | G_CAR | G_PLANE);
      if (!h || h.hitNormalWorld.y < 0.85 || h.hitPointWorld.y > 1.0 || h.body.isPlane) continue;
      if (buildings.some(b => Math.abs(px - b.x) < b.w / 2 + 1.5 && Math.abs(pz - b.z) < b.d / 2 + 1.5)) continue;
      if (planes.some(q => (q.wreck || q.wreckT > 0) && Math.hypot(px - q.pos.x, pz - q.pos.z) < 14)) continue;
      if (terrainLog.some(t => t.kind === 'pond' && Math.hypot(px - t.x, pz - t.z) < (t.r || 8) + 1)) continue;
      return { x: px, y: h.hitPointWorld.y, z: pz };
    }
  }
  return null;
}

/* --- spadochron: prostokątna czasza (7 komór w łuku), kurs czaszy; A/D — skręt (przechył czaszy, szybsze
   opadanie), W — szybszy lot i opadanie, S — hamowanie (wolniej, płasko); kamera za plecami, gdy mysz w spoczynku --- */
const PARA = { glide: 7, fast: 11, slow: 3.5, sink: 4.6, sinkFast: 6.5, sinkSlow: 3.4, turn: 1.15 };
function buildParachute(){
  const g = new THREE.Group(), canopy = new THREE.Group();
  const cols = [0xd8402c, 0xf2c230, 0xd8402c, 0xf2f0ea, 0xd8402c, 0xf2c230, 0xd8402c];
  const cells = 7, span = 7.6, chord = 2.7, R = 6.5, arc = span / R;
  for (let k = 0; k < cells; k++){
    const a = (k + 0.5) / cells * arc - arc / 2, cw = span / cells + 0.04;
    const m = new THREE.Mesh(new THREE.BoxGeometry(cw, 0.42, chord), new THREE.MeshLambertMaterial({ color: cols[k] }));
    m.position.set(Math.sin(a) * R, Math.cos(a) * R - R, 0); m.rotation.z = -a; m.castShadow = true;
    canopy.add(m);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(cw * 0.96, 0.3, 0.12), new THREE.MeshLambertMaterial({ color: 0x2a2a2a }));   // wloty komór z przodu
    nose.position.set(Math.sin(a) * R, Math.cos(a) * R - R - 0.04, chord / 2 + 0.02); nose.rotation.z = -a; canopy.add(nose);
  }
  canopy.position.y = 5.2; g.add(canopy);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x2a2a2a }), lineGeo = new THREE.BoxGeometry(0.025, 1, 0.025);
  for (let k = 0; k <= cells; k += 1) for (const zc of [-chord * 0.35, chord * 0.35]){       // linki: spód brzegów komór -> uprząż (nad barkami)
    const a = k / cells * arc - arc / 2, ex = Math.sin(a) * R, ey = 5.2 + Math.cos(a) * R - R - 0.21, from = new THREE.Vector3(Math.sign(ex) * 0.25, 0.9, 0), to = new THREE.Vector3(ex, ey, zc);
    const d = to.clone().sub(from), l = new THREE.Mesh(lineGeo, lineMat);
    l.scale.y = d.length(); l.position.copy(from).addScaledVector(d, 0.5); l.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    g.add(l);
  }
  g.userData.canopy = canopy;
  g.visible = false; scene.add(g);
  return g;
}
const parachute = { on: false, t: 0, mesh: null, heading: 0, speed: 0, bank: 0 };
function bailOut(p){
  _pR.set(1, 0, 0).applyQuaternion(p.quat); _pF.set(0, 0, 1).applyQuaternion(p.quat);
  const h = Math.atan2(_pF.x, _pF.z), side = p.T.wing[0] + 4;                       // poza rozpiętością skrzydła — samolot nie zahaczy gracza
  mode = 'foot'; curPlane = null;
  p.free = true; p.freeT = 0; p.freeTurn = rand(-0.6, 0.6);
  p.body.collisionFilterMask = G_WORLD | G_CAR;                                      // samolot bez pilota nie trąca gracza w powietrzu
  player.mesh.visible = true;
  player.body.position.set(p.pos.x - _pR.x * side, p.pos.y - p.T.half[1] - 3, p.pos.z - _pR.z * side);
  player.body.velocity.set(_pF.x * p.v * 0.25, Math.min(0, p.vy) - 2, _pF.z * p.v * 0.25);
  player.body.wakeUp(); addBody(player.body);
  player.fallSpeed = 0;
  if (!parachute.mesh) parachute.mesh = buildParachute();
  Object.assign(parachute, { on: true, t: 0, heading: h, speed: PARA.glide, bank: 0 });
  parachute.mesh.visible = false;
  Sound.engine(false, 0, 0);
  hudToast('Skok! A / D — skręt · W — szybciej · S — hamowanie', 4);
}
function endParachute(){ parachute.on = false; if (parachute.mesh) parachute.mesh.visible = false; }
/* wywoływane po updatePlayer (nadpisuje prędkość i obrót postaci) */
function updateParachute(dt){
  if (!parachute.on) return;
  const b = player.body, m = parachute.mesh;
  parachute.t += dt;
  if (player.dead || mode !== 'foot'){ endParachute(); return; }
  if (parachute.t < 0.7) return;                                                    // swobodny spadek, zanim czasza się otworzy
  const s = Math.min(1, (parachute.t - 0.7) / 0.6), live = pointerLocked && !player.dead;
  const turn = live ? (down('left') || keys['ArrowLeft'] ? 1 : 0) - (down('right') || keys['ArrowRight'] ? 1 : 0) : 0;
  const fast = live && (down('forward') || keys['ArrowUp']), slow = live && (down('back') || keys['ArrowDown']);
  parachute.heading += turn * PARA.turn * dt;                                       // A = w lewo (kurs rośnie)
  parachute.bank = damp(parachute.bank, -turn * 0.38, 3, dt);
  parachute.speed = damp(parachute.speed, fast ? PARA.fast : slow ? PARA.slow : PARA.glide, 1.5, dt);
  const sink = (fast ? PARA.sinkFast : slow ? PARA.sinkSlow : PARA.sink) + Math.abs(turn) * 1.2;
  const fx = Math.sin(parachute.heading), fz = Math.cos(parachute.heading);
  b.velocity.x = damp(b.velocity.x, fx * parachute.speed * s, 2.2, dt);
  b.velocity.z = damp(b.velocity.z, fz * parachute.speed * s, 2.2, dt);
  /* opadanie: hamowanie czaszy do -sink, potem stała prędkość; krok fizyki doda grawitację świata — kompensacja */
  const g = -world.gravity.y; let vy = b.velocity.y;
  vy = vy < -sink ? approach(vy, -sink, 14 * dt) : Math.max(vy - g * dt, -sink);
  b.velocity.y = vy + g * dt;
  player.fallSpeed = Math.min(player.fallSpeed, 6);                                 // pod czaszą bez obrażeń od upadku
  player.facing = parachute.heading; player.mesh.rotation.y = parachute.heading;
  if (clock - lastMouseMove > 0.8) camYaw = angleDamp(camYaw, parachute.heading + Math.PI, 2.2, dt);   // kamera za plecami
  /* czasza: rozwija się 0.6 s, nad graczem, w kierunku lotu, przechyla się w zakręcie */
  m.visible = true;
  m.scale.set(0.25 + 0.75 * s, 0.6 + 0.4 * s, 0.25 + 0.75 * s);
  m.position.set(b.position.x, b.position.y - 0.85, b.position.z);
  m.rotation.set(0, parachute.heading, 0);
  m.userData.canopy.rotation.set(-0.08 + (fast ? -0.08 : slow ? 0.12 : 0), 0, parachute.bank);
  if (parachute.t > 1.3 && checkGrounded()){ endParachute(); hudToast('Wylądowano'); }
}

/* --- katastrofa: kula ognia, błysk, odłamki, dym, płonący wrak, wstrząs kamery, huk --- */
const _fxSphere = new THREE.SphereGeometry(1, 14, 10), _fxBox = new THREE.BoxGeometry(1, 1, 1);
const _wreckMat = new THREE.MeshLambertMaterial({ vertexColors: true, color: 0x2b2724 });
const fxList = [], _smokeCol = new THREE.Color(0x2e2a28);                                                            // { kind, m, t, life, … }
function fxAdd(o){ fxList.push(o); return o; }
function planeCrash(p){
  const T = p.T, at = p.pos.clone(), big = p.kind === 'jet' ? 1 : 0.55;
  const gh = rayHit(at.x, at.y + 2, at.z, at.x, -5, at.z, G_WORLD), gy = gh && gh.hitNormalWorld.y > 0.6 ? gh.hitPointWorld.y : 0;   // podłoże pod miejscem wybuchu (dowolnie wysoko)
  const pilot = curPlane === p;
  /* wybuch: jądro (biało-żółte), ogień (pomarańczowy), kilka kul z opóźnieniem */
  fxAdd({ kind: 'ball', m: fxMesh(0xffe08a, 0.9, true), t: 0, life: 0.35, at: at.clone(), r0: 2 * big, r1: 10 * big });
  fxAdd({ kind: 'ball', m: fxMesh(0xff7a1a, 0.95, false), t: 0, life: 1.6, at: at.clone(), r0: 3 * big, r1: 18 * big, smoke: true });
  for (let k = 0; k < 9; k++) fxAdd({ kind: 'ball', m: fxMesh([0xffa52a, 0xe0461a, 0xffc94a][k % 3], 0.95, false), t: -k * 0.1, life: rand(1.2, 1.8), r0: 2 * big, r1: rand(6, 12) * big, smoke: true,
    at: at.clone().add(new THREE.Vector3(rand(-8, 8), rand(0, 6), rand(-8, 8)).multiplyScalar(big)) });
  const light = new THREE.PointLight(0xffa040, 8, 160 * big); light.position.copy(at); light.position.y += 4; scene.add(light);
  fxAdd({ kind: 'light', m: light, t: 0, life: 1.6 });
  /* odłamki w kolorach samolotu: lot balistyczny, odbicie od ziemi */
  const cols = [0xe9eaec, 0xe9eaec, 0xb9bec6, 0x262a30, p.spec.livery || 0x1a4fa0];
  for (let k = 0; k < Math.round(16 * big + 6); k++){
    const mat = new THREE.MeshLambertMaterial({ color: cols[k % cols.length] }), m = new THREE.Mesh(_fxBox, mat);
    m.scale.set(rand(0.3, 1.6) * big + 0.2, rand(0.1, 0.4), rand(0.4, 2.2) * big + 0.2); m.position.copy(at); m.castShadow = true; scene.add(m);
    const a = rand(0, TAU), sp = rand(8, 26) * (0.6 + big * 0.4);
    fxAdd({ kind: 'debris', m: m, t: 0, life: 14, v: new THREE.Vector3(Math.cos(a) * sp, rand(6, 22), Math.sin(a) * sp), w: new THREE.Vector3(rand(-6, 6), rand(-6, 6), rand(-6, 6)), gy: gy });
  }
  /* wrak: przyciemniony model na ziemi, przechylony; płomienie i dym przez cały czas wraku */
  p.free = false;
  p.wreck = { y: gy + T.gear * 0.45, fire: 0, smoke: 0 };
  _pF.set(0, 0, 1).applyQuaternion(p.quat); _pF.y = 0; _pF.normalize();
  p.pos.set(at.x - _pF.x * T.half[2] * 0.6, p.wreck.y, at.z - _pF.z * T.half[2] * 0.6);       // wrak cofnięty od ściany, w którą uderzył nos
  p.quat.setFromEuler(_pE.set(0.12, Math.atan2(_pF.x, _pF.z), rand(-0.35, 0.35), 'YXZ'));
  p.group.children[0].material = _wreckMat; if (p.prop) p.prop.visible = false;
  p.group.position.copy(p.pos); p.group.quaternion.copy(p.quat);
  if (p.bodyIn){ delBody(p.body); p.bodyIn = false; }
  p.v = 0; p.vy = 0; p.thr = 0; p.wreckT = 14;
  /* dźwięk i wstrząs (słabszy z daleka) */
  const cam = camera.position, dist = Math.hypot(cam.x - at.x, cam.y - at.y, cam.z - at.z);
  Sound.boom(clamp(1 - dist / 600, 0.15, 1) * (0.6 + big * 0.4));
  camShake = Math.max(camShake, clamp(1.6 - dist / 120, 0, 1.6) * big + (pilot ? 0.6 : 0));
  /* pilot w środku — ginie */
  if (pilot){
    exitPlane(true);                                                          // gracz obok wraku, poza ogniem (safeSpot)
    if (godMode) hudToast('Katastrofa — przeżyłeś dzięki nieśmiertelności', 3);
    else { damagePlayer(1000, 'katastrofa'); hudToast('Katastrofa — pilot nie przeżył', 3); }
  }
}
function fxMesh(color, opacity, add){
  const m = new THREE.Mesh(_fxSphere, new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }));
  m.visible = false; scene.add(m); return m;
}
function fxRemove(i){
  const f = fxList[i]; scene.remove(f.m);
  if (f.m.material) f.m.material.dispose();
  fxList.splice(i, 1);
}
function updateFx(dt){
  for (let i = fxList.length - 1; i >= 0; i--){
    const f = fxList[i]; f.t += dt;
    if (f.t < 0) continue;
    const k = f.t / f.life;
    if (k >= 1){ fxRemove(i); continue; }
    if (f.kind === 'ball'){
      f.m.visible = true; f.m.position.copy(f.at); f.m.position.y += f.t * 3;
      f.m.scale.setScalar(f.r0 + (f.r1 - f.r0) * Math.sqrt(k)); f.m.material.opacity = 0.95 * (1 - k * k);
      if (f.smoke){ if (!f.c0) f.c0 = f.m.material.color.clone(); f.m.material.color.copy(f.c0).lerp(_smokeCol, clamp((k - 0.35) / 0.5, 0, 1)); }   // ogień przechodzi w dym
    } else if (f.kind === 'light'){
      f.m.intensity = 8 * (1 - k) * (0.85 + Math.random() * 0.3);
    } else if (f.kind === 'debris'){
      const m = f.m;
      if (!f.rest){
        f.v.y -= 9.81 * dt; m.position.addScaledVector(f.v, dt);
        m.rotation.x += f.w.x * dt; m.rotation.y += f.w.y * dt; m.rotation.z += f.w.z * dt;
        if ((f.n = (f.n || 0) + 1) % 6 === 0){ const g2 = rayHit(m.position.x, m.position.y + 0.5, m.position.z, m.position.x, -5, m.position.z, G_WORLD); f.gy = g2 ? g2.hitPointWorld.y : 0; }   // podłoże pod odłamkiem (dach, ulica)
      if (m.position.y < f.gy + 0.15){ m.position.y = f.gy + 0.15; f.v.y *= -0.3; f.v.x *= 0.5; f.v.z *= 0.5; f.w.multiplyScalar(0.5);
          if (Math.abs(f.v.y) < 1.5){ f.rest = true; m.rotation.x = 0; m.rotation.z = 0; } }
      }
      if (k > 0.85) m.scale.multiplyScalar(1 - dt * 2);
    } else if (f.kind === 'smoke'){
      f.m.visible = true; f.m.position.y += dt * f.rise; f.m.position.x += dt * 1.2;
      f.m.scale.setScalar(f.r0 + f.t * 2.2); f.m.material.opacity = 0.45 * Math.min(1, f.t * 3) * (1 - k);
    } else if (f.kind === 'flame'){
      f.m.visible = true; f.m.scale.set(f.r * (0.8 + Math.random() * 0.4), f.r * (1.3 + Math.random() * 0.8), f.r * (0.8 + Math.random() * 0.4));
      f.m.material.opacity = 0.85 * (1 - k);
    }
  }
}
/* tlący się wrak: dym (ciemne kule unoszące się i rosnące) i języki ognia */
function wreckEmit(p, dt){
  const w = p.wreck; if (!w) return;
  const big = p.kind === 'jet' ? 1 : 0.55, burn = p.wreckT > 4;
  w.smoke -= dt; w.fire -= dt;
  if (w.smoke <= 0){
    w.smoke = 0.18;
    const s = fxMesh(burn ? 0x2b2b2d : 0x55575a, 0.45, false);
    s.position.set(p.pos.x + rand(-4, 4) * big, p.pos.y + 1, p.pos.z + rand(-4, 4) * big);
    fxAdd({ kind: 'smoke', m: s, t: 0, life: rand(4, 6), rise: rand(3, 5), r0: rand(1.5, 2.5) * big });
  }
  if (burn && w.fire <= 0){
    w.fire = 0.12;
    const f = fxMesh(Math.random() < 0.5 ? 0xff7a1a : 0xffb030, 0.85, true);
    f.position.set(p.pos.x + rand(-6, 6) * big, p.pos.y + rand(0, 1.5), p.pos.z + rand(-6, 6) * big);
    fxAdd({ kind: 'flame', m: f, t: 0, life: 0.6, r: rand(1, 2.2) * big });
  }
}

/* --- lot (sterowanie zręcznościowe): ↑/↓ = docelowe pochylenie, ←/→ = docelowy przechył (puszczone — samolot
   wraca do lotu poziomego), zakręt z przechyłu, ochrona przed przeciągnięciem, asystent lądowania: bez strzałek,
   gaz < 35% i < 35 m nad ziemią — łagodne zniżanie, tuż nad ziemią wyrównanie i opadanie ~1.5 m/s --- */
const _rayFrom = new CANNON.Vec3(), _rayTo = new CANNON.Vec3(), _pRes = new CANNON.RaycastResult(), _pRay = new CANNON.Ray();
function planeSweepHit(a, b){
  _pRes.reset(); _pRay.from.set(a.x, a.y, a.z); _pRay.to.set(b.x, b.y, b.z);
  _pRay.intersectWorld(world, { mode: CANNON.Ray.CLOSEST, result: _pRes, skipBackfaces: true, collisionFilterGroup: G_PLANE, collisionFilterMask: G_WORLD });
  return _pRes.hasHit ? _pRes : null;
}
const _pNew = new THREE.Vector3(), _pNose = new THREE.Vector3();
/* jeden krok lotu samolotu p; inp = { thr: −1|0|1, pitch: −1..1, turn: −1..1 (+ w prawo), rud: −1..1 (+ w lewo), brake } ; false = rozbił się */
function planeStep(p, dt, inp){
  const T = p.T, g = 9.81;
  if (inp.thr > 0) p.thr = Math.min(1, p.thr + dt * 0.45);
  if (inp.thr < 0) p.thr = Math.max(0, p.thr - dt * 0.6);
  _pF.set(0, 0, 1).applyQuaternion(p.quat); _pR.set(1, 0, 0).applyQuaternion(p.quat);
  let pitch = Math.asin(clamp(_pF.y, -1, 1)), bank = Math.asin(clamp(_pR.y / Math.max(0.2, Math.cos(pitch)), -1, 1)), h = Math.atan2(_pF.x, _pF.z);
  /* prędkość: ciąg − opór − składowa ciężaru; na ziemi opór toczenia, hamulce i hamowanie aerodynamiczne bez gazu */
  let a = T.thrust * p.thr - T.thrust / (T.vMax * T.vMax) * p.v * p.v - g * Math.sin(pitch);
  if (p.onGround) a -= 0.25 + (inp.brake ? 9 : 0) + (p.thr < 0.05 && p.v > 5 ? 1.5 : 0);
  p.v = Math.max(0, p.v + a * dt);
  const lift = clamp((p.v - T.vStall * 0.75) / (T.vStall * 0.25), 0, 1), eff = clamp(p.v / T.vStall, 0.3, 1), agl = p.agl === undefined ? 99 : p.agl;
  if (p.onGround){
    h += inp.rud * T.yawGround * clamp(p.v / 6, 0.25, 1) * dt * (p.v > 0.3 ? 1 : 0.4);
    if (p.v > T.vRot * 0.92 && inp.pitch > 0) pitch = Math.min(0.22, pitch + T.pitchRate * 0.6 * dt);
    else pitch = Math.max(0, pitch - dt * 0.4);
    bank = 0;
  } else {
    let tp = inp.pitch > 0 ? 0.3 : inp.pitch < 0 ? -0.32 : 0;
    if (inp.pitch > 0) tp *= clamp((p.v - T.vStall * 0.95) / (T.vStall * 0.3), 0, 1);            // za wolno — nos nie idzie w górę
    const land = !inp.pitch && p.thr < 0.35 && agl < 35;
    if (land) tp = agl > 6 ? -0.08 : -0.01;
    if (lift < 1) tp = Math.min(tp, -0.15 * (1 - lift));                                         // przeciągnięcie: nos w dół
    pitch = approach(pitch, tp, T.pitchRate * 0.8 * Math.max(eff, 0.4) * dt);
    bank = approach(bank, clamp(inp.turn, -1, 1) * 0.7, T.rollRate * 0.6 * dt);
    h -= g * Math.tan(bank) / Math.max(p.v, 15) * Math.max(lift, 0.3) * dt;                     // zakręt z przechyłu (w prawo: kurs maleje)
    h += inp.rud * 0.25 * eff * dt;
    if (lift < 1) p.vy -= g * (1 - lift) * dt; else p.vy = damp(p.vy, 0, 2, dt);
    if (land && agl < 6) p.vy = approach(p.vy, -1.5, 4 * dt);
  }
  p.quat.setFromEuler(_pE.set(-pitch, h, bank, 'YXZ'));
  _pF.set(0, 0, 1).applyQuaternion(p.quat);
  _pNew.copy(p.pos).addScaledVector(_pF, p.v * dt); _pNew.y += p.vy * dt;
  /* zderzenie z zabudową / filarem po drodze (odcinek od nosa); ziemię i dachy obsługuje podwozie */
  _pNose.copy(p.pos).addScaledVector(_pF, T.half[2] * 0.9);
  const sweepTo = _pNose.clone().add(_pNew).sub(p.pos);
  const hit = p.v > 2 ? planeSweepHit(_pNose, sweepTo) : null;
  if (hit && hit.hitNormalWorld.y < 0.8){ if (p.v > 9){ planeCrash(p); return false; } p.v = 0; _pNew.copy(p.pos); }
  const gy = planeGroundY(_pNew.x, _pNew.z, _pNew.y + 1);
  if (_pNew.y - T.gear <= gy + 0.02){
    const sink = -((_pNew.y - p.pos.y) / Math.max(dt, 1e-3));
    if (!p.onGround && (sink > 9 || Math.abs(bank) > 0.6 || pitch < -0.3)){ planeCrash(p); return false; }   // twarde / krzywe przyziemienie
    _pNew.y = gy + T.gear; p.onGround = true; p.vy = 0;
  } else if (p.onGround && _pNew.y - T.gear > gy + 0.3) p.onGround = false;
  p.agl = _pNew.y - T.gear - gy;
  /* granice: zawracanie poza ±900 m, pułap 700 m */
  if (Math.abs(_pNew.x) > 900 || Math.abs(_pNew.z) > 900){ p.quat.premultiply(_pQ.setFromAxisAngle(_pY, Math.PI)); if (p === curPlane) hudToast('Granica obszaru — zawracanie'); }
  if (_pNew.y > 700){ _pNew.y = 700; p.vy = Math.min(p.vy, 0); }
  p.pos.copy(_pNew);
  syncPlane(p);
  return true;
}
function updatePlane(dt){
  const p = curPlane; if (!p) return 0;
  const ar = (keys['ArrowRight'] ? 1 : 0) - (keys['ArrowLeft'] ? 1 : 0);
  const ok = planeStep(p, dt, {
    thr: down('forward') ? 1 : down('back') ? -1 : 0,
    pitch: (keys['ArrowUp'] ? 1 : 0) - (keys['ArrowDown'] ? 1 : 0),
    turn: ar,
    rud: (down('left') ? 1 : 0) - (down('right') ? 1 : 0) - (p.onGround ? ar : 0),          // na ziemi ←/→ też skręca
    brake: down('jump')
  });
  if (!ok) return 0;
  Sound.engine(true, 0.15 + p.thr * 0.75, p.thr, { pitch: p.kind === 'jet' ? 0.62 : 1.15, bright: p.kind === 'jet' ? 1.8 : 1.1 });
  return p.v * 3.6;
}
/* co klatkę: śmigła, samoloty bez pilota (nurkują), wraki (dym, ogień, powrót na lotnisko), efekty, spadochron */
function updatePlanesIdle(dt){
  for (const p of planes){
    if (p.prop) p.prop.rotation.z += dt * (p === curPlane || p.free ? 8 + p.thr * 50 : 0);
    /* bez pilota: 1.5 s szybowania, potem nurkowanie; bezpiecznik — rozbicie po 45 s */
    if (p.free && !(p.wreckT > 0)){
      p.freeT += dt;
      if (p.freeT > 45) planeCrash(p);
      else planeStep(p, dt, { thr: 0, pitch: p.freeT < 1.5 ? 0 : -1, turn: p.freeT < 1.5 ? 0 : p.freeTurn, rud: 0, brake: false });
    }
    if (p.wreckT > 0){
      wreckEmit(p, dt);
      p.wreckT -= dt;
      if (p.wreckT <= 0){ p.wreck = null; p.group.visible = false; p.group.children[0].material = _planeMat; p.waitReset = true; }
    }
    /* powrót na lotnisko dopiero, gdy miejsce postoju jest wolne (gracz, auto, NPC dalej niż 25 m) */
    if (p.waitReset){
      const s = p.spec, near = (x, z) => Math.hypot(x - s.x, z - s.z) < 25;
      const busy = near(player.body.position.x, player.body.position.z) || near(chassisBody.position.x, chassisBody.position.z) || npcs.some(n => near(n.pos.x, n.pos.y)) || parkedCars.some(q => near(q.x, q.z));
      if (!busy){ p.waitReset = false; if (p.prop) p.prop.visible = true; resetPlane(p); }
    }
  }
  updateFx(dt);
}
