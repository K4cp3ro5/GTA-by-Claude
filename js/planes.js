/* ---------------------------------------------------------------
   14b. SAMOLOTY — odrzutowiec i awionetka z lotniska (AIRPORT_PLANES): modele, wsiadanie, lot.
   Model lotu zręcznościowy: ciąg (gaz W/S) i opór ~v², grawitacja wzdłuż pochylenia, poniżej
   prędkości przeciągnięcia samolot opada i opuszcza nos; drążek = mysz (wychylenie wraca powoli do
   środka), przechył daje zakręt skoordynowany, A/D = ster kierunku (na ziemi: kołowanie), Spacja =
   hamulce kół. Ziemia z raycastu, zderzenie z budynkiem / twarde przyziemienie = katastrofa
   (samolot wraca na lotnisko po kilku sekundach). Każdy samolot ma ciało kinematyczne (kadłub +
   skrzydła), więc stojący na płycie jest przeszkodą dla aut i gracza.
   --------------------------------------------------------------- */
const G_PLANE = 16;
const PLANE_TYPES = {
  jet:  { name: 'Odrzutowiec', thrust: 7.5, vMax: 92, vStall: 50, vRot: 54, pitchRate: 0.55, rollRate: 1.1, yawGround: 0.42,
          gear: 2.35, camDist: 36, camH: 9, gauge: 360, half: [1.7, 1.8, 14.5], wing: [12.5, 0.25, 2.6], door: [-2.6, 8.5] },
  prop: { name: 'Awionetka', thrust: 5.0, vMax: 62, vStall: 24, vRot: 27, pitchRate: 1.0, rollRate: 2.0, yawGround: 0.8,
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
  p.v = 0; p.vy = 0; p.thr = 0; p.onGround = true; p.wreckT = 0;
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

/* --- wsiadanie / wysiadanie --- */
let curPlane = null;
const planeStick = { x: 0, y: 0 };
const planeKeysHelp = 'W / S — gaz, mysz — drążek, A / D — ster, Spacja — hamulce, F — wysiądź (na ziemi)';
function enterPlane(p){
  curPlane = p; mode = 'plane';
  player.mesh.visible = false; delBody(player.body);
  planeStick.x = planeStick.y = 0;
  hudToast(p.T.name + ': ' + planeKeysHelp, 4.5);
}
function exitPlane(force){
  const p = curPlane; if (!p) return;
  if (!force && (!p.onGround || p.v > 3)){ hudToast('Wyląduj i zatrzymaj się, żeby wysiąść'); return; }
  const d = planeDoorPoint(p, { x: 0, y: 0, z: 0 });
  mode = 'foot'; curPlane = null;
  player.mesh.visible = true;
  player.body.position.set(d.x, planeGroundY(d.x, d.z, p.pos.y + 2) + 1.2, d.z);
  player.body.velocity.set(0, 0, 0); player.body.wakeUp(); addBody(player.body);
  Sound.engine(false, 0, 0);
}

/* --- wybuch (katastrofa) --- */
const _boomMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.9 }), booms = [];
function planeCrash(p){
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), _boomMat.clone());
  m.position.copy(p.pos); scene.add(m); booms.push({ m: m, t: 0 });
  Sound.thud(40);
  if (curPlane === p){ exitPlane(true); damagePlayer(65, 'katastrofa'); }
  p.group.visible = false; if (p.bodyIn){ delBody(p.body); p.bodyIn = false; }
  p.wreckT = 8;
}

/* --- lot --- */
const _rayFrom = new CANNON.Vec3(), _rayTo = new CANNON.Vec3(), _pRes = new CANNON.RaycastResult(), _pRay = new CANNON.Ray();
function planeSweepHit(a, b){
  _pRes.reset(); _pRay.from.set(a.x, a.y, a.z); _pRay.to.set(b.x, b.y, b.z);
  _pRay.intersectWorld(world, { mode: CANNON.Ray.CLOSEST, result: _pRes, skipBackfaces: true, collisionFilterGroup: G_PLANE, collisionFilterMask: G_WORLD });
  return _pRes.hasHit ? _pRes : null;
}
const _pNew = new THREE.Vector3(), _pNose = new THREE.Vector3();
function updatePlane(dt){
  const p = curPlane; if (!p) return 0;
  const T = p.T, g = 9.81;
  if (down('forward')) p.thr = Math.min(1, p.thr + dt * 0.45);
  if (down('back')) p.thr = Math.max(0, p.thr - dt * 0.6);
  planeStick.x = approach(planeStick.x, 0, dt * 0.3); planeStick.y = approach(planeStick.y, 0, dt * 0.3);   // drążek powoli wraca do środka
  const rud = (down('left') ? 1 : 0) - (down('right') ? 1 : 0), brake = down('jump');
  _pF.set(0, 0, 1).applyQuaternion(p.quat); _pR.set(1, 0, 0).applyQuaternion(p.quat);
  const pitch = Math.asin(clamp(_pF.y, -1, 1)), roll = Math.asin(clamp(_pR.y, -1, 1));   // roll > 0: prawe skrzydło w górze (przechył w lewo)
  /* prędkość: ciąg − opór − składowa ciężaru; na ziemi opór toczenia i hamulce */
  let a = T.thrust * p.thr - T.thrust / (T.vMax * T.vMax) * p.v * p.v - g * Math.sin(pitch);
  if (p.onGround) a -= 0.25 + (brake ? 6 : 0);
  p.v = Math.max(0, p.v + a * dt);
  const lift = clamp((p.v - T.vStall * 0.75) / (T.vStall * 0.25), 0, 1), eff = clamp(p.v / T.vStall, 0.15, 1);
  const rotLocal = (axis, ang) => { _pAxis.copy(axis).applyQuaternion(p.quat); _pQ.setFromAxisAngle(_pAxis, ang); p.quat.premultiply(_pQ); };
  const X = new THREE.Vector3(1, 0, 0), Yl = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
  if (p.onGround){
    /* kołowanie: ster A/D, rotacja przy v ≥ ~vRot (drążek do siebie), bez przechyłu */
    const h = Math.atan2(_pF.x, _pF.z) + rud * T.yawGround * clamp(p.v / 6, 0.25, 1) * dt * (p.v > 0.3 ? 1 : 0.4);
    let pt = pitch;
    if (p.v > T.vRot * 0.92 && planeStick.y > 0.05) pt = Math.min(0.28, pt + planeStick.y * T.pitchRate * dt);
    else pt = Math.max(0, pt - dt * 0.4);
    p.quat.setFromEuler(_pE.set(-pt, h, 0, 'YXZ'));
  } else {
    /* drążek do siebie = nos w górę; blisko przeciągnięcia ciągnięcie słabnie (ochrona przed przeciągnięciem) */
    const effUp = clamp((p.v - T.vStall * 0.9) / (T.vStall * 0.4), 0, 1);
    rotLocal(X, -planeStick.y * T.pitchRate * (planeStick.y > 0 ? effUp : eff) * dt);
    rotLocal(Z, -planeStick.x * T.rollRate * eff * dt);                      // mysz w prawo = przechył w prawo
    rotLocal(Yl, rud * 0.35 * eff * dt);                                     // ster kierunku
    _pQ.setFromAxisAngle(_pY, g * Math.tan(clamp(roll, -1.2, 1.2)) / Math.max(p.v, 15) * lift * dt); p.quat.premultiply(_pQ);   // zakręt z przechyłu
    if (lift < 1){ p.vy -= g * (1 - lift) * dt; rotLocal(X, (1 - lift) * 0.5 * dt); }                                        // przeciągnięcie: opada, nos w dół
    else p.vy = damp(p.vy, 0, 2, dt);
  }
  p.quat.normalize();
  _pF.set(0, 0, 1).applyQuaternion(p.quat);
  _pNew.copy(p.pos).addScaledVector(_pF, p.v * dt); _pNew.y += p.vy * dt;
  /* zderzenie z zabudową / filarem / ziemią po drodze (odcinek od nosa) */
  _pNose.copy(p.pos).addScaledVector(_pF, T.half[2] * 0.9);
  const sweepTo = _pNose.clone().add(_pNew).sub(p.pos);
  const hit = p.v > 2 ? planeSweepHit(_pNose, sweepTo) : null;
  /* ściana / filar (ziemię i dachy obsługuje podwozie) */
  if (hit && hit.hitNormalWorld.y < 0.8){ if (p.v > 9) return planeCrash(p), 0; p.v = 0; _pNew.copy(p.pos); }
  /* ziemia pod kołami */
  const gy = planeGroundY(_pNew.x, _pNew.z, _pNew.y + 1);
  if (_pNew.y - T.gear <= gy + 0.02){
    const sink = -((_pNew.y - p.pos.y) / Math.max(dt, 1e-3));
    if (!p.onGround && (sink > 7 || Math.abs(roll) > 0.45 || pitch < -0.22)) return planeCrash(p), 0;   // twarde / krzywe przyziemienie
    _pNew.y = gy + T.gear; p.onGround = true; p.vy = 0;
  } else if (p.onGround && _pNew.y - T.gear > gy + 0.3) p.onGround = false;
  /* granice: zawracanie poza ±900 m, pułap 700 m */
  if (Math.abs(_pNew.x) > 900 || Math.abs(_pNew.z) > 900){ p.quat.premultiply(_pQ.setFromAxisAngle(_pY, Math.PI)); hudToast('Granica obszaru — zawracanie'); }
  if (_pNew.y > 700){ _pNew.y = 700; p.vy = Math.min(p.vy, 0); }
  p.pos.copy(_pNew);
  syncPlane(p);
  Sound.engine(true, 0.15 + p.thr * 0.75, p.thr, { pitch: p.kind === 'jet' ? 0.62 : 1.15, bright: p.kind === 'jet' ? 1.8 : 1.1 });
  return p.v * 3.6;
}
/* co klatkę: śmigła, wraki (powrót na lotnisko), wybuchy */
function updatePlanesIdle(dt){
  for (const p of planes){
    if (p.prop) p.prop.rotation.z += dt * (p === curPlane ? 8 + p.thr * 50 : 0);
    if (p.wreckT > 0){ p.wreckT -= dt; if (p.wreckT <= 0) resetPlane(p); }
  }
  for (let i = booms.length - 1; i >= 0; i--){
    const b = booms[i]; b.t += dt; b.m.scale.setScalar(2 + b.t * 22); b.m.material.opacity = Math.max(0, 0.9 - b.t * 0.9);
    if (b.t > 1){ scene.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose(); booms.splice(i, 1); }
  }
}
