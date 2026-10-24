/* ---------------------------------------------------------------
   14f. HELIKOPTERY — cywilne na lądowiskach dachów wieżowców (HELIPADS z districts.js, windy LIFTS), śmigłowiec
   ratunkowy na dachu szpitala, helikoptery na obu lotniskach; policyjny (police.js) startuje z dachu komisariatu.
   Lot gracza (zręcznościowy): W/S — wznoszenie / opadanie (puszczone: zawis na wysokości), ↑/↓ — pochylenie (lot
   do przodu / do tyłu), ←/→ — przechył (lot w bok), A/D — obrót, Spacja — wyhamowanie do zawisu; lądowanie na
   dowolnej płaskiej powierzchni (ulica, dach, lądowisko); uderzenie wirnikiem w ścianę z prędkością albo twarde
   przyziemienie = katastrofa. Wysiadka F na ziemi / dachu (obok drzwi), w powietrzu — skok ze spadochronem.
   AI (heliAiStep): lot do punktu z omijaniem zabudowy — wysokość przelotowa nad najwyższym dachem na drodze
   (heightAt: siatka 8 m, promień w dół, pamięć podręczna) + promień w kierunku lotu; pochylenie i przechył
   z przyspieszenia (naturalny lot), obrót w stronę lotu albo celu.
   --------------------------------------------------------------- */
const HELI_T = { vMax: 44, climb: 9, sink: 7, yawRate: 1.9, gauge: 220, camDist: 15, camH: 5, skid: 1.55, rotorR: 5.2 };
const HELI_LIVERY = {
  civ:    { body: 0x2a6cb8, trim: 0xf2f0ea, name: 'Helikopter' },
  news:   { body: 0xe0a52c, trim: 0x22262b, name: 'Helikopter' },
  medic:  { body: 0xf2f0ea, trim: 0xd62f2f, name: 'Śmigłowiec ratunkowy' },
  police: { body: 0x1d3460, trim: 0xf2f0ea, name: 'Helikopter policji' }
};
const _heliMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 70, specular: 0x444444 });
function heliTextTex(word){
  const c = mkCanvas(256, 48), g = c.getContext('2d');
  g.fillStyle = '#1d3460'; g.fillRect(0, 0, 256, 48); g.fillStyle = '#ffffff'; g.font = 'bold 34px Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(word, 128, 26);
  return toTex(c);
}
/* model: nos w lokalne +Z, środek kadłuba w 0, płozy na y = −skid; wirnik i śmigło ogonowe — osobne grupy (obrót) */
function buildHeliModel(kind){
  const L = HELI_LIVERY[kind], B = (w, h, d) => new THREE.BoxGeometry(w, h, d), parts = [], glass = 0x1b2a38, dark = 0x2a2d33, grey = 0x8a8f96;
  const add = (geo, color, x, y, z, rx, ry, rz) => parts.push({ geo: geo, color: color, x: x || 0, y: y || 0, z: z || 0, rx: rx || 0, ry: ry || 0, rz: rz || 0 });
  add(B(1.9, 1.3, 3.0), L.body, 0, -0.25, 0.1);                       // kadłub
  add(B(1.6, 0.55, 2.2), L.body, 0, 0.66, -0.2);                      // dach kabiny
  add(B(1.7, 1.05, 0.9), L.body, 0, -0.2, 1.95);                      // nos
  add(B(1.56, 0.12, 0.7), L.body, 0, -0.75, 2.5);                     // podbródek
  add(B(1.62, 0.95, 0.08), glass, 0, 0.36, 1.64, -0.62);              // szyba czołowa
  add(B(1.3, 0.5, 0.06), glass, 0, -0.35, 2.42, 0.25);                // dolna szyba nosa
  for (const s of [-1, 1]){
    add(B(0.05, 0.72, 1.5), glass, s * 0.96, 0.18, 0.55);             // okna boczne
    add(B(0.05, 0.62, 1.0), glass, s * 0.96, 0.2, -0.95);
    add(B(0.06, 0.2, 3.2), L.trim, s * 0.96, -0.62, 0.15);            // pas
    add(B(0.07, 0.07, 3.6), grey, s * 0.95, -HELI_T.skid + 0.04, 0.2);   // płozy
    add(B(0.07, 0.07, 0.4), grey, s * 0.95, -HELI_T.skid + 0.16, 2.05, 0.6);
    for (const z of [1.15, -0.75]) add(B(0.07, 0.62, 0.07), grey, s * 0.85, -1.22, z, 0, 0, s * 0.25);
  }
  add(B(1.05, 0.5, 1.7), dark, 0, 1.05, -0.55);                       // osłona silnika
  add(new THREE.CylinderGeometry(0.11, 0.13, 0.5, 8), dark, 0, 1.45, 0.1);   // maszt wirnika
  add(B(0.36, 0.38, 4.5), L.body, 0, 0.18, -3.5);                     // belka ogonowa
  add(B(0.08, 1.3, 0.75), L.body, 0, 0.82, -5.55, -0.35);             // statecznik pionowy
  add(B(1.7, 0.06, 0.42), L.body, 0, 0.22, -4.9);                     // statecznik poziomy
  add(B(0.38, 0.12, 4.0), L.trim, 0, 0.0, -3.4);                      // pas na belce
  if (kind === 'medic'){ add(B(0.04, 0.7, 0.22), 0xd62f2f, 0.99, 0.2, 0.55); add(B(0.04, 0.22, 0.7), 0xd62f2f, 0.99, 0.2, 0.55); add(B(0.04, 0.7, 0.22), 0xd62f2f, -0.99, 0.2, 0.55); add(B(0.04, 0.22, 0.7), 0xd62f2f, -0.99, 0.2, 0.55); }
  if (kind === 'police') add(new THREE.CylinderGeometry(0.16, 0.2, 0.3, 10), 0xd8d4cc, 0.5, -0.95, 1.9);    // reflektor
  const group = new THREE.Group(), m = new THREE.Mesh(mergeColored(parts), _heliMat);
  m.castShadow = m.receiveShadow = true; group.add(m);
  /* wirnik: 4 łopaty + piasta; przy obrotach — przezroczysta tarcza */
  const rotor = new THREE.Group(); rotor.position.set(0, 1.72, 0.1);
  const blade = mergeColored([0, 1, 2, 3].map(k => ({ geo: B(HELI_T.rotorR, 0.05, 0.3), color: 0x1b1d21, x: Math.cos(k * Math.PI / 2) * HELI_T.rotorR / 2, z: -Math.sin(k * Math.PI / 2) * HELI_T.rotorR / 2, ry: k * Math.PI / 2 })).concat([{ geo: new THREE.CylinderGeometry(0.22, 0.22, 0.16, 10), color: 0x3a3d44 }]));
  const bm = new THREE.Mesh(blade, _heliMat); bm.castShadow = true; rotor.add(bm);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(HELI_T.rotorR, 32), new THREE.MeshBasicMaterial({ color: 0x1b1d21, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  disc.rotation.x = -Math.PI / 2; rotor.add(disc);
  group.add(rotor);
  const tail = new THREE.Group(); tail.position.set(0.22, 0.85, -5.6);
  tail.add(new THREE.Mesh(mergeColored([{ geo: B(0.04, 1.2, 0.14), color: 0x1b1d21 }, { geo: B(0.04, 0.14, 1.2), color: 0x1b1d21 }]), _heliMat));
  group.add(tail);
  let beacon = null, beam = null;
  if (kind === 'police'){
    const tex = heliTextTex('POLICJA');
    for (const s of [-1, 1]){ const p = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.42), new THREE.MeshLambertMaterial({ map: tex })); p.position.set(s * 0.19, 0.18, -3.3); p.rotation.y = s * Math.PI / 2; group.add(p); }
    beacon = [new THREE.Mesh(B(0.18, 0.1, 0.18), new THREE.MeshBasicMaterial({ color: 0x400808 })), new THREE.Mesh(B(0.18, 0.1, 0.18), new THREE.MeshBasicMaterial({ color: 0x081040 }))];
    beacon[0].position.set(0.3, 0.98, -0.9); beacon[1].position.set(-0.3, 0.98, -0.9); group.add(beacon[0]); group.add(beacon[1]);
    /* snop reflektora (nocą i w pościgu): stożek z wierzchołkiem przy reflektorze, w dół i lekko do przodu */
    const cg = new THREE.ConeGeometry(9, 42, 20, 1, true); cg.translate(0, -21, 0);
    beam = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: 0xfff3c8, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    beam.position.set(0.5, -1.05, 1.9); beam.rotation.x = 0.35; group.add(beam);
  }
  scene.add(group);
  return { group: group, rotor: rotor, disc: disc, tail: tail, beacon: beacon, beam: beam };
}

/* --- helikoptery w świecie --- */
const helis = [];
let curHeli = null;
const _hQ = new THREE.Quaternion(), _hE = new THREE.Euler(), _hF = new THREE.Vector3(), _hR = new THREE.Vector3(), _hN = new THREE.Vector3();
function syncHeli(h){
  h.group.position.copy(h.pos);
  h.group.quaternion.setFromEuler(_hE.set(h.pitch, h.yaw, h.roll, 'YXZ'));
  h.body.position.set(h.pos.x, h.pos.y, h.pos.z);
  const q = h.group.quaternion, bq = h.body.quaternion; bq.x = q.x; bq.y = q.y; bq.z = q.z; bq.w = q.w;
}
function makeHeli(kind, x, yTop, z, yaw){
  const m = buildHeliModel(kind);
  const b = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: matCar });
  b.addShape(new CANNON.Box(new CANNON.Vec3(1.0, 0.95, 1.9)), new CANNON.Vec3(0, -0.3, 0.3));
  b.addShape(new CANNON.Box(new CANNON.Vec3(0.25, 0.3, 2.3)), new CANNON.Vec3(0, 0.2, -3.5));
  b.collisionFilterGroup = G_PLANE; b.collisionFilterMask = ~G_WORLD; b.isHeli = true;
  const h = { kind: kind, L: HELI_LIVERY[kind], m: m, group: m.group, rotor: m.rotor, body: b, pos: new THREE.Vector3(x, yTop + HELI_T.skid, z), vel: new THREE.Vector3(),
    yaw: yaw, pitch: 0, roll: 0, yawRate: 0, rpm: 0, onGround: true, agl: 0, aglT: 0, hp: 100, spot: { x: x, y: yTop, z: z, yaw: yaw }, ai: null, gone: false, wreck: null, respawnT: 0 };
  b.heliRef = h; addBody(b); h.bodyIn = true;
  helis.push(h); syncHeli(h);
  return h;
}
(function spawnHelis(){
  /* dachy: wieżowce z największym lądowiskiem (do 4), szpital; lotniska: obok hangaru (wysepka) i przy hangarach łukowych */
  const pads = HELIPADS.filter(p => p.kind === 'tower' && p.r >= 3.8).sort((a, b) => b.r - a.r).slice(0, 4);
  pads.forEach((p, k) => makeHeli(k % 2 ? 'news' : 'civ', p.x, p.y, p.z, Math.PI / 4 + Math.PI));
  HELIPADS.filter(p => p.kind === 'hospital').forEach(p => makeHeli('medic', p.x, p.y, p.z, -Math.PI / 2));
  makeHeli('civ', -300, 0.02, 112, Math.PI);                                         // lotnisko miejskie: przy hangarach łukowych
  makeHeli('news', 150, 0.02, -752, 0);                                               // lotnisko na wysepce: obok hangaru
})();

/* wysokość najwyższej przeszkody (dach, pomost, ziemia, woda) w komórce 8 m — dla AI lotu; świat jest statyczny, więc pamięć na stałe */
const _hgt = new Map();
function heightAt(x, z){
  const kx = Math.floor(x / 8), kz = Math.floor(z / 8), key = kx * 4096 + kz;
  let v = _hgt.get(key);
  if (v === undefined){
    let m = isLand(x, z) ? 0 : WATER_Y;
    for (const [ox, oz] of [[2, 2], [6, 2], [2, 6], [6, 6], [4, 4]]){
      const h = rayHit(kx * 8 + ox, 320, kz * 8 + oz, kx * 8 + ox, -20, kz * 8 + oz, G_WORLD);
      if (h && h.hitPointWorld.y > m) m = h.hitPointWorld.y;
    }
    _hgt.set(key, v = m);
  }
  return v;
}
const _hRay = new CANNON.Ray(), _hRes = new CANNON.RaycastResult();
function heliRay(x0, y0, z0, x1, y1, z1){
  _hRes.reset(); _hRay.from.set(x0, y0, z0); _hRay.to.set(x1, y1, z1);
  _hRay.intersectWorld(world, { mode: CANNON.Ray.CLOSEST, result: _hRes, skipBackfaces: true, collisionFilterGroup: G_PLANE, collisionFilterMask: G_WORLD });
  return _hRes.hasHit ? _hRes : null;
}

/* --- wsiadanie / wysiadanie / skok --- */
const heliKeysHelp = 'W / S — w górę / w dół · ↑ / ↓ — lot do przodu / do tyłu · ← / → — w bok · A / D — obrót · Spacja — zawis · F — wysiadka (w powietrzu: spadochron)';
function heliDoorPoint(h, out){
  _hR.set(-Math.cos(h.yaw), 0, Math.sin(h.yaw));                                      // prawa burta; drzwi pilota po lewej
  out.x = h.pos.x - _hR.x * 1.6; out.z = h.pos.z - _hR.z * 1.6; out.y = h.pos.y - HELI_T.skid;
  return out;
}
function enterHeli(h){
  if (h.ai && typeof policeHeliStolen === 'function') policeHeliStolen(h);
  curHeli = h; mode = 'heli'; h.ai = null;
  player.mesh.visible = false; delBody(player.body);
  Weapons.holster();
  planeCamYaw = 0;
  hudToast(h.L.name + ': ' + heliKeysHelp, 6);
}
/* miejsce wysiadki obok drzwi (lewa albo prawa burta) na tej samej powierzchni co płozy — także na dachu */
function heliDoorSpot(h){
  _hR.set(-Math.cos(h.yaw), 0, Math.sin(h.yaw));
  const base = h.pos.y - HELI_T.skid;
  for (const s of [-1, 1]) for (const d of [2.2, 3.2]){
    const x = h.pos.x + _hR.x * s * d, z = h.pos.z + _hR.z * s * d;
    if (rayHit(h.pos.x, base + 1.0, h.pos.z, x, base + 1.0, z, G_WORLD)) continue;
    const g = rayHit(x, base + 1.5, z, x, base - 1.5, z, G_WORLD);
    if (g && g.hitNormalWorld.y > 0.8 && Math.abs(g.hitPointWorld.y - base) < 1.2) return { x: x, y: g.hitPointWorld.y, z: z };
  }
  return null;
}
function exitHeli(force){
  const h = curHeli; if (!h) return;
  if (!force){
    if (!h.onGround){ if (h.agl < 12){ hudToast('Wyląduj, żeby wysiąść'); return; } heliBail(h); return; }
    if (Math.hypot(h.vel.x, h.vel.z) > 2){ hudToast('Zatrzymaj się, żeby wysiąść'); return; }
  }
  let s = h.onGround ? heliDoorSpot(h) : null;
  if (!s) s = safeSpot(h.pos.x, h.pos.z, 4, 40) || { x: HOSPITAL_SPAWN.x, y: 0, z: HOSPITAL_SPAWN.z };
  mode = 'foot'; curHeli = null;
  player.mesh.visible = true;
  player.body.position.set(s.x, s.y + 1.2, s.z); player.body.velocity.set(0, 0, 0); player.body.wakeUp(); addBody(player.body);
  noLerp(player.body); player.fallSpeed = 0; player.facing = h.yaw;
  Sound.engine(false, 0, 0);
}
/* skok z lecącego helikoptera: obok kabiny, ze spadochronem; helikopter bez pilota opada i rozbija się */
function heliBail(h){
  _hR.set(-Math.cos(h.yaw), 0, Math.sin(h.yaw));
  mode = 'foot'; curHeli = null; h.free = true; h.freeT = 0;
  player.mesh.visible = true;
  player.body.position.set(h.pos.x - _hR.x * 3.2, h.pos.y - 2.2, h.pos.z - _hR.z * 3.2);
  player.body.velocity.set(h.vel.x * 0.6, Math.min(0, h.vel.y) - 1, h.vel.z * 0.6);
  player.body.wakeUp(); addBody(player.body); noLerp(player.body);
  player.fallSpeed = 0;
  openParachute(h.yaw, 0.15);
  Sound.engine(false, 0, 0);
}

/* --- lot gracza: wejścia → pochylenie / przechył / obrót, przyspieszenie z przechyłu wirnika, opór; ruch i kolizje (heliMove) --- */
function heliPhysics(h, dt, inp){
  const T = HELI_T, g = 9.81, lift = h.rpm > 0.85;
  _hF.set(Math.sin(h.yaw), 0, Math.cos(h.yaw)); _hR.set(-Math.cos(h.yaw), 0, Math.sin(h.yaw));
  const vF = h.vel.x * _hF.x + h.vel.z * _hF.z, vR = h.vel.x * _hR.x + h.vel.z * _hR.z;
  let tp = inp.fw * 0.3, tr = inp.sd * 0.3;
  if (inp.brake){ tp = clamp(vF * 0.03, -0.3, 0.3); tr = clamp(vR * 0.04, -0.25, 0.25); tp = -tp; tr = -tr; }
  if (h.onGround){ tp = 0; tr = 0; }
  h.pitch = approach(h.pitch, tp, 1.2 * dt); h.roll = approach(h.roll, tr, 1.4 * dt);
  h.yawRate = approach(h.yawRate, (h.onGround && !lift ? 0 : inp.yw) * T.yawRate, 3 * dt);
  h.yaw += h.yawRate * dt;
  if (!h.onGround){
    const aF = 2 * g * Math.tan(h.pitch), aR = 2 * g * Math.tan(h.roll);
    h.vel.x += (_hF.x * aF + _hR.x * aR) * dt; h.vel.z += (_hF.z * aF + _hR.z * aR) * dt;
    const kd = Math.exp(-(inp.brake ? 1.1 : 0.15) * dt); h.vel.x *= kd; h.vel.z *= kd;
  }
  let vyT = inp.up > 0 ? T.climb : inp.up < 0 ? -Math.min(T.sink, 1.4 + Math.max(0, h.agl) * 0.8) : 0;   // tuż nad ziemią opadanie zwalnia (miękkie przyziemienie)
  if (!lift) vyT = h.onGround ? 0 : -7;                                                 // wirnik nie rozkręcony: nie unosi
  h.vel.y = approach(h.vel.y, vyT, (inp.up ? 7 : 5) * dt);
  if (h.onGround && h.vel.y < 0) h.vel.y = 0;
  return heliMove(h, dt);
}
function heliMove(h, dt){
  const T = HELI_T, next = _hN.copy(h.pos).addScaledVector(h.vel, dt), hs = Math.hypot(h.vel.x, h.vel.z);
  /* poziomo: kadłub i wirnik (promień wirnika przed sobą) — ściana: przy prędkości katastrofa, wolno — ślizg wzdłuż ściany */
  if (hs > 0.3){
    const dx = h.vel.x / hs, dz = h.vel.z / hs, reach = hs * dt + T.rotorR * 0.9;
    for (const oy of [1.7, -0.3, -1.3]){
      const hit = heliRay(h.pos.x, h.pos.y + oy, h.pos.z, h.pos.x + dx * reach, h.pos.y + oy, h.pos.z + dz * reach);
      if (hit && hit.hitNormalWorld.y < 0.7){
        if (hs > 11){ heliCrash(h); return false; }
        const n = hit.hitNormalWorld, vn = h.vel.x * n.x + h.vel.z * n.z;
        if (vn < 0){ h.vel.x -= vn * n.x * 1.3; h.vel.z -= vn * n.z * 1.3; }
        next.x = h.pos.x + h.vel.x * dt; next.z = h.pos.z + h.vel.z * dt;
        break;
      }
    }
  }
  if (h.vel.y > 0 && heliRay(next.x, h.pos.y + 1.6, next.z, next.x, next.y + 2.4, next.z)){ h.vel.y = 0; next.y = h.pos.y; }   // strop nad wirnikiem (pomost, wiata)
  /* podparcie płóz: ziemia, dach, lądowisko; woda = katastrofa */
  const gh = heliRay(next.x, next.y + 1.0, next.z, next.x, next.y - T.skid - 0.8, next.z), water = !isLand(next.x, next.z);
  const sup = gh ? gh.hitPointWorld.y : (water ? WATER_Y : -Infinity);
  if (next.y - T.skid <= sup + 0.01){
    if (water && !gh){ heliCrash(h, true); return false; }
    if (!h.onGround && (-h.vel.y > 6.5 || Math.abs(h.roll) > 0.45 || Math.abs(h.pitch) > 0.45)){ heliCrash(h); return false; }   // twarde / krzywe przyziemienie
    next.y = sup + T.skid; if (h.vel.y < 0) h.vel.y = 0;
    h.onGround = true;
    const f = Math.exp(-6 * dt); h.vel.x *= f; h.vel.z *= f;
    h.pitch = damp(h.pitch, 0, 6, dt); h.roll = damp(h.roll, 0, 6, dt);
  } else if (h.onGround && next.y - T.skid > sup + 0.25) h.onGround = false;
  /* granice obszaru i pułap */
  if (Math.abs(next.x) > 1300 || Math.abs(next.z) > 1300){ h.vel.x *= -0.5; h.vel.z *= -0.5; next.x = clamp(next.x, -1299, 1299); next.z = clamp(next.z, -1299, 1299); if (h === curHeli) hudToast('Granica obszaru — zawracanie'); }
  if (next.y > 450){ next.y = 450; h.vel.y = Math.min(0, h.vel.y); }
  h.pos.copy(next);
  h.aglT -= dt;
  if (h.aglT <= 0){ h.aglT = 0.2; const g2 = heliRay(h.pos.x, h.pos.y - T.skid + 0.2, h.pos.z, h.pos.x, h.pos.y - 400, h.pos.z); h.agl = h.pos.y - T.skid - Math.max(g2 ? g2.hitPointWorld.y : -1e9, isLand(h.pos.x, h.pos.z) ? -1e9 : WATER_Y); }
  syncHeli(h);
  return true;
}
function updateHeli(dt){
  const h = curHeli; if (!h) return 0;
  h.rpm = Math.min(1, h.rpm + dt * 0.5);
  const live = pointerLocked && !player.dead;
  const ok = heliPhysics(h, dt, {
    up: live ? (down('forward') ? 1 : 0) - (down('back') ? 1 : 0) : 0,
    fw: live ? (keys['ArrowUp'] ? 1 : 0) - (keys['ArrowDown'] ? 1 : 0) : 0,
    sd: live ? (keys['ArrowRight'] ? 1 : 0) - (keys['ArrowLeft'] ? 1 : 0) : 0,
    yw: live ? (down('left') ? 1 : 0) - (down('right') ? 1 : 0) : 0,
    brake: live && down('jump')
  });
  if (!ok) return 0;
  Sound.engine(true, 0.25 + h.rpm * 0.3, 0.2 + Math.abs(h.vel.y) * 0.03, { pitch: 1.7, bright: 0.45 });
  return Math.hypot(h.vel.x, h.vel.z) * 3.6;
}

/* --- AI lotu (police.js): do punktu tgt z omijaniem zabudowy. o: { vMax, face: {x,z}|null, low: true — zniżanie do tgt.y (zrzut, lądowanie) } --- */
function heliAiStep(h, dt, tgt, o){
  const T = HELI_T; o = o || {};
  h.rpm = Math.min(1, h.rpm + dt * 0.45);
  if (h.rpm < 0.9){ syncHeli(h); return; }
  const dx = tgt.x - h.pos.x, dz = tgt.z - h.pos.z, dh = Math.hypot(dx, dz), vMax = o.vMax || 30;
  const sp = Math.min(vMax, dh * 0.45);
  let vx = dh > 0.05 ? dx / dh * sp : 0, vz = dh > 0.05 ? dz / dh * sp : 0;
  /* przeszkody: najwyższy dach / pomost na drodze (pas ±7 m, do ~80 m przed) i pod helikopterem */
  const hs = Math.hypot(h.vel.x, h.vel.z), ux = hs > 1 ? h.vel.x / hs : (dh > 0.05 ? dx / dh : 0), uz = hs > 1 ? h.vel.z / hs : (dh > 0.05 ? dz / dh : 0);
  let floor = heightAt(h.pos.x, h.pos.z), near = floor;
  const look = Math.min(90, 14 + hs * 2.4);
  for (let d = 8; d <= look; d += 8) for (const lat of [-8, 0, 8]){ const f = heightAt(h.pos.x + ux * d - uz * lat, h.pos.z + uz * d + ux * lat); if (f > floor) floor = f; if (d <= 16 && f > near) near = f; }
  const ty = o.low ? Math.max(tgt.y, near + T.skid + 0.3) : Math.max(tgt.y, floor + T.skid + 16);
  let vy = clamp((ty - h.pos.y) * 0.9, o.low ? -9 : -6, 8);                          // zniżanie do zrzutu szybciej (przy celu i tak zwalnia)
  if (floor + T.skid + 5 > h.pos.y && !o.low){ vx *= 0.2; vz *= 0.2; vy = Math.max(vy, 6); }          // za nisko przed przeszkodą: najpierw w górę
  /* bezpiecznik: promień w kierunku lotu (dźwigi, kolejki, maszty, których siatka 8 m nie złapie) */
  if (hs > 2){ const r = hs * 1.4 + T.rotorR + 2, hit = heliRay(h.pos.x, h.pos.y, h.pos.z, h.pos.x + ux * r, h.pos.y + h.vel.y * 1.4, h.pos.z + uz * r); if (hit){ vx *= 0.1; vz *= 0.1; vy = Math.max(vy, 7); } }
  const ax = vx - h.vel.x, az = vz - h.vel.z, al = Math.hypot(ax, az), amax = 6.5 * dt, k = al > amax ? amax / al : 1;
  h.vel.x += ax * k; h.vel.z += az * k; h.vel.y += clamp(vy - h.vel.y, -5 * dt, 5 * dt);
  h.pos.addScaledVector(h.vel, dt);
  const sup = heightAt(h.pos.x, h.pos.z) + T.skid; if (h.pos.y < sup){ h.pos.y = sup; if (h.vel.y < 0) h.vel.y = 0; }   // podparcie tylko spod siebie
  /* orientacja: kurs w stronę lotu (szybko) albo celu obserwacji; pochylenie i przechył z prędkości i przyspieszenia */
  const spd = Math.hypot(h.vel.x, h.vel.z);
  const yawT = o.face ? Math.atan2(o.face.x - h.pos.x, o.face.z - h.pos.z) : spd > 5 ? Math.atan2(h.vel.x, h.vel.z) : h.yaw;
  h.yaw += clamp(wrapAngle(yawT - h.yaw), -1.0 * dt, 1.0 * dt);
  _hF.set(Math.sin(h.yaw), 0, Math.cos(h.yaw)); _hR.set(-Math.cos(h.yaw), 0, Math.sin(h.yaw));
  const aF = (ax * k * _hF.x + az * k * _hF.z) / Math.max(dt, 1e-3), aR = (ax * k * _hR.x + az * k * _hR.z) / Math.max(dt, 1e-3);
  const vF = h.vel.x * _hF.x + h.vel.z * _hF.z, vR = h.vel.x * _hR.x + h.vel.z * _hR.z;
  h.pitch = damp(h.pitch, clamp(vF * 0.011 + aF * 0.03, -0.25, 0.32), 2.5, dt);
  h.roll = damp(h.roll, clamp(vR * 0.018 + aR * 0.035, -0.35, 0.35), 2.5, dt);
  h.onGround = h.pos.y - T.skid <= sup - T.skid + 0.05 && spd < 0.5;
  syncHeli(h);
}

/* --- katastrofa, wrak, powrót na lądowisko --- */
function heliCrash(h, water){
  if (h.gone) return;
  const at = h.pos.clone(), pilot = curHeli === h;
  explodeAt(at.x, at.y, at.z, water ? 0.9 : 1.5, { debrisCol: h.L.body, noCats: true, cause: 'katastrofa', heli: h });
  h.gone = true; h.free = false;
  if (h.bodyIn){ delBody(h.body); h.bodyIn = false; }
  if (pilot){
    exitHeli(true);
    if (godMode) hudToast('Katastrofa helikoptera — przeżyłeś dzięki nieśmiertelności', 3);
    else { damagePlayer(1000, 'katastrofa'); hudToast('Helikopter się rozbił', 3); }
  }
  /* wrak: spada na ziemię pod miejscem wybuchu (na wodzie tonie), dym i ogień */
  const g = rayHit(at.x, at.y, at.z, at.x, -20, at.z, G_WORLD), gy = water || !isLand(at.x, at.z) ? WATER_Y - 3 : g ? g.hitPointWorld.y : 0;
  h.wreck = { y: gy + 0.6, t: 0, smoke: 0, fire: 0, sink: water || !isLand(at.x, at.z) };
  h.group.children[0].material = _wreckMat; h.rotor.visible = false; if (h.m.beam) h.m.beam.visible = false;
  h.vel.set(0, 0, 0); h.respawnT = 60;
  if (h.ai && typeof policeHeliDown === 'function') policeHeliDown(h);
}
function updateHelis(dt){
  let rotorVol = 0, rotorRate = 12;
  for (const h of helis){
    /* bez pilota w powietrzu (skok): opada z kręceniem, rozbija się przy ziemi */
    if (h.free && !h.gone){
      h.freeT += dt; h.yawRate += dt * 0.8; h.yaw += h.yawRate * dt; h.roll = damp(h.roll, 0.4, 0.5, dt);
      h.vel.x *= Math.exp(-0.4 * dt); h.vel.z *= Math.exp(-0.4 * dt); h.vel.y = approach(h.vel.y, -14, 6 * dt);
      if (!heliMove(h, dt)) continue;
      if (h.onGround || h.freeT > 30) heliCrash(h);
    }
    if (!h.gone && h !== curHeli && !h.ai && !h.free) h.rpm = Math.max(0, h.rpm - dt * 0.25);   // zaparkowany: wirnik zwalnia
    h.rotor.rotation.y += dt * h.rpm * 26; h.m.tail.rotation.x += dt * h.rpm * 44;
    h.m.disc.material.opacity = clamp((h.rpm - 0.5) * 0.3, 0, 0.14);
    if (h.m.beacon){ const on = h.ai && h.ai.flash; h.m.beacon[0].material.color.setHex(on && Math.floor(clock * 4) % 2 ? 0xff2a2a : 0x400808); h.m.beacon[1].material.color.setHex(on && Math.floor(clock * 4) % 2 === 0 ? 0x2a5aff : 0x081040); }
    if (h.m.beam) h.m.beam.material.opacity = h.ai && !h.gone && (h.ai.beam || timeOfDay < 0.24 || timeOfDay > 0.82) ? 0.09 : 0;
    /* dźwięk wirnika: własny albo najbliższego lecącego */
    if (!h.gone && h.rpm > 0.3){
      const p = camera.position, d = Math.hypot(h.pos.x - p.x, h.pos.y - p.y, h.pos.z - p.z), v = h === curHeli ? 0.75 * h.rpm : clamp(1 - d / 260, 0, 1) * 0.7 * h.rpm;
      if (v > rotorVol){ rotorVol = v; rotorRate = 7 + h.rpm * 6; }
    }
    /* wrak: dym i ogień, potem powrót na lądowisko, gdy gracz daleko */
    if (h.gone){
      const w = h.wreck;
      if (w){
        w.t += dt;
        if (h.group.position.y > w.y){ h.group.position.y = Math.max(w.y, h.group.position.y - dt * 18); h.group.rotation.z += dt * 2; }
        else if (w.sink){ h.group.position.y -= dt * 0.8; if (h.group.position.y < WATER_Y - 10) h.group.visible = false; }
        else {
          w.smoke -= dt; w.fire -= dt;
          if (w.smoke <= 0){ w.smoke = 0.25; const s = fxMesh(0x2b2b2d, 0.45, false); s.position.set(h.group.position.x + rand(-2, 2), w.y + 1, h.group.position.z + rand(-2, 2)); fxAdd({ kind: 'smoke', m: s, t: 0, life: rand(3, 5), rise: rand(3, 5), r0: rand(1, 1.8) }); }
          if (w.t < 25 && w.fire <= 0){ w.fire = 0.15; const f = fxMesh(Math.random() < 0.5 ? 0xff7a1a : 0xffb030, 0.85, true); f.position.set(h.group.position.x + rand(-2, 2), w.y + rand(0, 1), h.group.position.z + rand(-2, 2)); fxAdd({ kind: 'flame', m: f, t: 0, life: 0.6, r: rand(0.8, 1.5) }); }
        }
        if (w.t > 45){ h.group.visible = false; h.wreck = null; }
      }
      h.respawnT -= dt;
      const pp = playerWorldPos();
      if (h.respawnT <= 0 && !h.wreck && Math.hypot(pp.x - h.spot.x, pp.z - h.spot.z) > 150 && !h.policeOwned) heliReset(h);
    }
  }
  Sound.rotor(rotorVol, rotorRate);
}
function heliReset(h){
  h.gone = false; h.free = false; h.hp = 100; h.ai = null; h.rpm = 0; h.vel.set(0, 0, 0); h.pitch = 0; h.roll = 0; h.yawRate = 0; h.onGround = true;
  h.pos.set(h.spot.x, h.spot.y + HELI_T.skid, h.spot.z); h.yaw = h.spot.yaw;
  h.group.visible = true; h.group.rotation.set(0, 0, 0); h.group.children[0].material = _heliMat; h.rotor.visible = true; if (h.m.beam) h.m.beam.visible = true;
  if (!h.bodyIn){ addBody(h.body); h.bodyIn = true; }
  syncHeli(h);
}
/* trafienie (kule, rakieta): police.js dolicza przestępstwo */
function heliDamage(h, dmg, byPlayer){
  if (h.gone) return;
  h.hp -= dmg;
  if (byPlayer && h.ai && typeof policeCrime === 'function') policeCrime('atak na policję', h.pos.x, h.pos.z);
  if (h.hp <= 0) heliCrash(h);
}

/* --- windy na dach (LIFTS): F przy drzwiach na parterze — na dach; F przy włazie na dachu — na dół --- */
function liftNear(){
  if (mode !== 'foot' || player.dead || player.hiding) return null;
  const p = player.body.position, fy = p.y - 0.9;
  for (const l of LIFTS){
    if (Math.hypot(p.x - l.x, p.z - l.z) < 1.8 && Math.abs(fy - l.y) < 1.2) return { lift: l, up: true };
    if (Math.hypot(p.x - l.rx, p.z - l.rz) < 1.8 && Math.abs(fy - l.ry) < 1.2) return { lift: l, up: false };
  }
  return null;
}
function liftUse(L){
  const l = L.lift, x = L.up ? l.rx : l.x, z = L.up ? l.rz : l.z, y = L.up ? l.ry : l.y;
  player.body.position.set(x, y + 1.2, z); player.body.velocity.set(0, 0, 0); player.fallSpeed = 0; noLerp(player.body);
  hudToast(L.up ? 'Winda: dach — lądowisko' : 'Winda: parter', 2);
  Sound.reload();
}

/* skok z wysokości pieszo: Spacja w swobodnym spadku (≥ 25 m nad ziemią) otwiera spadochron (planes.js: updateParachute) */
let _ffT = 0, _ffAgl = 0, _ffJump = false;
function openParachute(heading, t0){
  if (!parachute.mesh) parachute.mesh = buildParachute();
  Object.assign(parachute, { on: true, t: t0 || 0, heading: heading, speed: PARA.glide, bank: 0, yawRate: 0 });
  parachute.mesh.visible = false;
  hudToast('Spadochron! A / D — skręt · W — szybciej · S — hamowanie', 4);
}
function updateFreeFall(dt){
  const jump = down('jump');
  const was = _ffJump; _ffJump = jump;
  player.canChute = false;
  if (mode !== 'foot' || player.dead || player.hiding || parachute.on || player.grounded || player.body.velocity.y > -7){ _ffT = 0; return; }
  _ffT -= dt;
  if (_ffT <= 0){ _ffT = 0.15; const p = player.body.position, g = rayHit(p.x, p.y - 1, p.z, p.x, p.y - 300, p.z, G_WORLD); _ffAgl = p.y - 0.9 - (g ? g.hitPointWorld.y : (isLand(p.x, p.z) ? 0 : WATER_Y)); }
  player.canChute = _ffAgl > 22;
  if (player.canChute && jump && !was) openParachute(player.facing, 0.5);
}
