/* ---------------------------------------------------------------
   KARETKI NPC — białe furgony z przedziałem medycznym, czerwonym pasem, napisem AMBULANS i niebieskimi kogutami.
   Jeżdżą po pętlach miejskich jak zwykłe auta NPC (logika z update-npc.js, wymiary jak pickup); co jakiś czas któraś
   włącza sygnał: koguty migają, słychać syrenę dwutonową (głośność wg najbliższej), karetka jedzie szybciej (dalej
   z zachowaniem przepisów). Liczba w menu deweloperskim (NPC → Karetki); zniszczona / usunięta wraca po chwili spoza kadru.
   Pojazdy służb gracza: skradziony radiowóz / karetka zachowuje barwy (carLivery na modelu auta gracza i atrapy), H włącza
   i wyłącza koguty z syreną (toggleServiceSiren; stan idzie za autem także po wysiadce — updateServiceSirens).
   --------------------------------------------------------------- */
const AMB = { want: 3, spawnT: 0, sirenD: 1e9 };
const AMB_COLOR = 0xf4f4f0;
let _ambGeo = null;
const _ambTextMat = (() => {
  const c = mkCanvas(256, 48), g = c.getContext('2d');
  g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, 256, 48); g.fillStyle = '#c8202a'; g.font = 'bold 36px Helvetica, Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('AMBULANS', 128, 26);
  return new THREE.MeshLambertMaterial({ map: toTex(c) });
})();
/* geometria wspólna (nos w lokalne +Z, jak modele NPC): nadwozie z kolorami wierzchołków + światła */
function ambGeometries(){
  if (_ambGeo) return _ambGeo;
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d), body = [], lamps = [];
  const W = 0xf4f4f0, RED = 0xc8202a, GLASS = 0x141d22, DARK = 0x1c1e22, add = (L, geo, color, x, y, z, rx) => L.push({ geo: geo, color: color, x: x || 0, y: y || 0, z: z || 0, rx: rx || 0 });
  add(body, B(1.96, 0.45, 5.2), 0xd9d9d4, 0, 0.6, 0);                       // podwozie / progi
  add(body, B(2.0, 2.0, 3.17), W, 0, 1.55, -1.035);                         // przedział medyczny
  add(body, B(1.94, 1.3, 1.45), W, 0, 1.2, 1.275);                          // kabina
  add(body, B(1.9, 0.55, 0.62), W, 0, 0.825, 2.31);                         // maska
  add(body, B(1.78, 0.55, 0.05), GLASS, 0, 1.5, 2.0);                        // szyba przednia
  for (const s of [-1, 1]){
    add(body, B(0.05, 0.45, 1.05), GLASS, s * 0.97, 1.5, 1.3);              // szyby boczne kabiny
    add(body, B(0.03, 0.22, 3.17), RED, s * 1.005, 1.0, -1.035);            // czerwony pas: przedział
    add(body, B(0.03, 0.22, 1.45), RED, s * 0.975, 1.0, 1.275);             //                kabina
    add(body, B(0.03, 0.55, 0.62), DARK, s * 0.955, 0.6, 2.31);             // nadkole / zderzak z boku
  }
  add(body, B(2.03, 0.22, 0.03), RED, 0, 1.0, -2.62);                       // pas z tyłu
  add(body, B(0.03, 1.6, 0.03), DARK, 0, 1.45, -2.625);                     // szczelina drzwi tylnych
  add(body, B(1.92, 0.22, 0.12), DARK, 0, 0.5, 2.63);                       // zderzak przedni
  add(body, B(1.96, 0.22, 0.12), DARK, 0, 0.5, -2.63);                      // zderzak tylny
  add(body, B(1.4, 0.1, 0.32), DARK, 0, 1.9, 1.3);                          // belka świetlna (podstawa)
  const shell = mergeColored(body);                                        // bez kół — karoseria na aucie gracza (koła są jego)
  const tg = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14); tg.rotateZ(Math.PI / 2);
  for (const [x, z] of [[0.9, 1.75], [-0.9, 1.75], [0.9, -1.6], [-0.9, -1.6]]) add(body, tg, 0x141518, x, 0.42, z);
  for (const s of [-1, 1]){
    add(lamps, B(0.38, 0.18, 0.05), 0xfff3d0, s * 0.68, 0.88, 2.63);        // reflektory
    add(lamps, B(0.22, 0.4, 0.05), 0x7a1512, s * 0.86, 1.05, -2.64);        // tylne światła
  }
  return (_ambGeo = { body: mergeColored(body), shell: shell, lamps: mergeColored(lamps), lamp: B(0.5, 0.14, 0.28), lampS: B(0.22, 0.16, 0.16), text: new THREE.PlaneGeometry(2.4, 0.45), textR: new THREE.PlaneGeometry(1.5, 0.28) });
}
/* karetka: karoseria (NPC z kołami i światłami; auto gracza — sama karoseria), koguty A / B, napisy */
function ambulanceGroup(npc){
  const G = ambGeometries(), g = new THREE.Group();
  const body = new THREE.Mesh(npc ? G.body : G.shell, _npcMatBody); body.castShadow = true; g.add(body);
  if (npc) g.add(new THREE.Mesh(G.lamps, _npcMatLamp));
  const bA = new THREE.MeshBasicMaterial({ color: 0x0a144a }), bB = new THREE.MeshBasicMaterial({ color: 0x0a144a });
  /* koguty: belka na kabinie (dwa) i narożniki przedziału (przód i tył) — naprzemiennie A / B */
  [[0.38, 2.02, 1.3, bA, 'lamp'], [-0.38, 2.02, 1.3, bB, 'lamp'], [0.86, 2.63, 0.4, bB, 'lampS'], [-0.86, 2.63, 0.4, bA, 'lampS'], [0.86, 2.63, -2.48, bA, 'lampS'], [-0.86, 2.63, -2.48, bB, 'lampS']]
    .forEach(q => { const m = new THREE.Mesh(G[q[4]], q[3]); m.position.set(q[0], q[1], q[2]); g.add(m); });
  for (const s of [-1, 1]){ const t = new THREE.Mesh(G.text, _ambTextMat); t.position.set(s * 1.012, 1.85, -1.0); t.rotation.y = s * Math.PI / 2; g.add(t); }
  const tr = new THREE.Mesh(G.textR, _ambTextMat); tr.position.set(0, 2.15, -2.632); tr.rotation.y = Math.PI; g.add(tr);
  return { group: g, a: bA, b: bB };
}
function buildAmbulanceModel(){ const M = ambulanceGroup(true); scene.add(M.group); return M; }

/* barwy służb na modelu auta gracza / atrapy (vehicle.js: buildCarModel; grupa w m.body — ten sam układ co carParts):
   radiowóz — policeLivery na lakierze w barwach policji; karetka — bryła karetki zamiast nadwozia pickupa (zostają koła
   i światła modelu, więc hamowanie i kierunkowskazy działają). livery = null zdejmuje barwy. */
function carLivery(m, type, livery){
  if (m.liv){ m.body.remove(m.liv.group); if (m.liv.own) m.liv.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); m.liv = null; }
  const shellMats = m.mats.slice(0, 4);                                    // paint, dark, glass, chrome (bez świateł)
  m.body.children.forEach(c => { if (c.isMesh && shellMats.indexOf(c.material) >= 0) c.visible = livery !== 'amb'; });
  if (!livery) return;
  let L;
  if (livery === 'amb'){ const M = ambulanceGroup(false); L = { group: M.group, a: M.a, b: M.b, kind: 'amb', onA: 0x2a5cff, onB: 0x2a5cff, offA: 0x0a144a, offB: 0x0a144a, own: false }; }
  else { const P = policeLivery(type, livery.slice(7)); L = { group: P.group, a: P.red, b: P.blue, kind: 'police', onA: 0xff2020, onB: 0x2050ff, offA: 0x4a0a0a, offB: 0x0a144a, own: true }; }
  m.body.add(L.group); m.liv = L;
}
function liveryLights(L, on, blink){ L.a.color.setHex(on && blink ? L.onA : L.offA); L.b.color.setHex(on && !blink ? L.onB : L.offB); }
/* H w radiowozie / karetce gracza */
function toggleServiceSiren(){
  if (!driving.livery) return;
  driving.siren = !driving.siren;
  hudToast(driving.siren ? 'Sygnały włączone (H)' : 'Sygnały wyłączone (H)', 1.6);
}
/* koguty i syreny pojazdów służb gracza: prowadzone auto i atrapy z włączonym sygnałem (głośność wg odległości; w aucie pełna) */
function updateServiceSirens(){
  const bP = Math.floor(clock * 6) % 2, bA = Math.floor(clock * 5) % 2, pp = playerWorldPos();
  let dP = 1e9, dA = 1e9;
  const one = (L, on, x, z, inside) => {
    liveryLights(L, on, L.kind === 'amb' ? bA : bP);
    if (!on) return;
    const d = inside ? 0 : Math.hypot(x - pp.x, z - pp.z);
    if (L.kind === 'amb') dA = Math.min(dA, d); else dP = Math.min(dP, d);
  };
  if (driving.livery && carModel.liv && !activeCarGone) one(carModel.liv, driving.siren, chassisBody.position.x, chassisBody.position.z, mode === 'car');
  for (const p of parkedCars) if (p.livery && p.mesh.liv) one(p.mesh.liv, p.siren, p.x, p.z, false);
  Sound.sirenSelf(dP < 1e8 ? clamp(1 - dP / 200, 0, 1) * 0.85 : 0);
  Sound.ambSelf(dA < 1e8 ? clamp(1 - dA / 200, 0, 1) * 0.85 : 0);
}
/* nowa karetka na pętli miejskiej, daleko od gracza (> far m) i od innych aut (> 12 m) */
function spawnAmbulance(far){
  const p = playerWorldPos(), city = LOOPS.filter(P => !P.hwyRoute);
  for (let t = 0; t < 40; t++){
    const P = city[randInt(0, city.length - 1)], sp = pathSpot(P, rnd()), a = P[sp.idx], b = P[(sp.idx + 1) % P.length];
    const x = lerp(a.x, b.x, sp.frac), z = lerp(a.z, b.z, sp.frac);
    if (Math.hypot(x - p.x, z - p.z) < far || npcs.some(m => Math.hypot(m.pos.x - x, m.pos.y - z) < 12)) continue;
    const n = spawnNpcCar(P, AMB_COLOR, sp.idx, sp.frac, 'pickup');
    /* profil: spokojny kierowca (bez pirata), model karetki zamiast pickupa */
    n.profile = 'karetka'; n.obey = 1; n.hwyF = 1; n.gapX = 0.3; n.react = 0.3; n.accel = CAR_TYPES.pickup.npc.accel; n.color = AMB_COLOR;
    n.target = clamp(n.target, 8, 12.5);
    scene.remove(n.mesh);
    const M = buildAmbulanceModel(); n.mesh = M.group; n.mesh.position.set(n.pos.x, n.y, n.pos.y);
    n.indMeshes = addIndicators(n.mesh, 'pickup');
    n.amb = { siren: false, t: rand(15, 50), base: n.target, a: M.a, b: M.b };
    return n;
  }
  return null;
}
function ambulances(){ return npcs.filter(n => n.amb); }
function setAmbulanceCount(k){
  AMB.want = k;
  const L = ambulances();
  while (L.length > k) removeNpcCar(L.pop());
  AMB.spawnT = 0;
}
function ambSiren(n, on){
  const A = n.amb; if (!A || A.siren === on) return;
  A.siren = on; A.t = on ? rand(25, 45) : rand(30, 80);
  n.target = on ? Math.max(A.base * 1.45, 15) : A.base;
  if (!on){ A.a.color.setHex(0x0a144a); A.b.color.setHex(0x0a144a); }
}
function updateAmbulances(dt){
  /* uzupełnianie: na starcie od razu (daleko od gracza), potem co 4 s jedna karetka spoza kadru */
  AMB.spawnT -= dt;
  if (AMB.spawnT <= 0){
    AMB.spawnT = 4;
    const have = ambulances().length, start = clock < 5;
    for (let k = have; k < AMB.want && (start || k === have); k++) spawnAmbulance(start ? 60 : 140);
  }
  const blink = Math.floor(clock * 5) % 2, pp = playerWorldPos();
  let sd = 1e9;
  for (const n of npcs){
    const A = n.amb; if (!A) continue;
    A.t -= dt;
    if (A.t <= 0) ambSiren(n, !A.siren);
    if (A.siren){
      A.a.color.setHex(blink ? 0x2a5cff : 0x0a144a); A.b.color.setHex(blink ? 0x0a144a : 0x2a5cff);
      sd = Math.min(sd, Math.hypot(n.pos.x - pp.x, n.pos.y - pp.z));
    }
  }
  AMB.sirenD = sd;
  Sound.ambSiren(sd < 1e8 ? clamp(1 - sd / 200, 0, 1) : 0);
  updateServiceSirens();
}
