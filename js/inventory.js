/* ---------------------------------------------------------------
   14f. EKWIPUNEK, WĘDKOWANIE, KARMIENIE KOTÓW
   - Ekwipunek jak w Minecrafcie: 36 pól (0–8 = pasek na dole ekranu, 9–35 = plecak pod Tab). Przedmioty: broń
     (wybór pola = Weapons.select), wędka, ryby (stos do 16). Klawisze 1–9 i rolka — pole paska; Tab — plecak:
     klik na pole bierze przedmiot, klik na drugie zamienia (albo łączy stos tej samej ryby).
   - Wędkowanie (wędka w ręce, pieszo): LPM zarzuca spławik ~9 m przed siebie (musi trafić w wodę), po 3–9 s
     ryba bierze (spławik nurkuje, dźwięk, napis) — LPM w ciągu 1.3 s = ryba do ekwipunku; za wcześnie / za późno —
     nic. Odejście, zmiana przedmiotu albo wejście do pojazdu zwija żyłkę.
   - Ryba w ręce przy kocie (≤ 2.6 m): F albo LPM — kot je, serduszka, potem chodzi za graczem (cats.js).
   --------------------------------------------------------------- */
const ITEMS = {
  fists:  { name: 'Pięści', weapon: 0 }, pistol: { name: 'Pistolet', weapon: 1 }, rifle: { name: 'Karabin', weapon: 2 },
  rpgh: { name: 'RPG naprowadzane', weapon: 3 }, rod: { name: 'Wędka', tool: 'rod' },
  karp:   { name: 'Karp', fish: true, col: '#b8893a', w: [1.2, 4.5] }, okon: { name: 'Okoń', fish: true, col: '#6f8f3a', w: [0.2, 1.1] },
  szczupak: { name: 'Szczupak', fish: true, col: '#7f9a5a', w: [1.5, 6] }, dorsz: { name: 'Dorsz', fish: true, col: '#8f8a7a', w: [0.8, 3.5] },
  losos:  { name: 'Łosoś', fish: true, col: '#d8826a', w: [1.5, 5.5] }, fladra: { name: 'Flądra', fish: true, col: '#a8946a', w: [0.4, 1.6] }
};
const FISH_LOOK = {
  okon:     { L: 0.30, H: 0.11, W: 0.05, back: 0x3d5a22, side: 0x8fa83a, belly: 0xe8e0b0, fin: 0xd8602a, pattern: 'bars' },
  fladra:   { L: 0.32, H: 0.20, W: 0.025, back: 0x6b5a3a, side: 0x8a7550, belly: 0xf2ece0, fin: 0x7a6544, pattern: 'spots', spot: 0xd8702a },
  dorsz:    { L: 0.44, H: 0.11, W: 0.07, back: 0x5a5440, side: 0x9a9070, belly: 0xf0ece0, fin: 0x6a6450, pattern: 'speckle', spot: 0x3a3428 },
  karp:     { L: 0.42, H: 0.17, W: 0.08, back: 0x6a4a1a, side: 0xc89a3a, belly: 0xf2dc9a, fin: 0x9a6a2a, pattern: 'scales', spot: 0xa87a2a },
  szczupak: { L: 0.62, H: 0.09, W: 0.06, back: 0x2f4a24, side: 0x6f8a44, belly: 0xe8e4c8, fin: 0x8a6a3a, pattern: 'spots', spot: 0xd8e0a0 },
  losos:    { L: 0.55, H: 0.13, W: 0.07, back: 0x4a5a6a, side: 0xc8ccd2, belly: 0xf8f4f0, fin: 0x6a7480, pattern: 'speckle', spot: 0x2a2c30, blush: 0xe89a8a }
};
/* model ryby: wrzecionowate ciało (spłaszczona sfera z kolorem wg wysokości i deseniem), ogon z wcięciem, płetwy, oko; nos w +Z */
const _fishMeshes = {};
function buildFishMesh(id){
  if (_fishMeshes[id]) return _fishMeshes[id];
  const F = FISH_LOOK[id], L = F.L, H = F.H, W = F.W;
  const body = new THREE.SphereGeometry(1, 28, 16); body.scale(W / 2, H / 2, L / 2);                                 // gęsto — drobny deseń
  const hash = (x, y, z) => Math.abs(Math.sin(x * 921.7 + y * 513.3 + z * 247.1)) % 1;
  const bodyFn = (x, y, z) => {
    const v = y / (H / 2), u = z / (L / 2);
    if (u > 0.78 && Math.abs(v) < 0.5 && Math.abs(x) > W * 0.3) return 0x2a2c30;                      // skrzela / pyszczek
    if (F.pattern === 'bars' && v > -0.2 && Math.floor((u + 1) * 3.5) % 2 === 0 && u < 0.6) return F.back;
    if ((F.pattern === 'spots' || F.pattern === 'speckle') && v > (F.pattern === 'speckle' ? 0.1 : -0.3) && hash(x, y, z) < (F.pattern === 'spots' ? 0.16 : 0.1)) return F.spot;
    if (F.pattern === 'scales' && v > -0.3 && hash(x, y, z) < 0.12) return F.spot;
    if (F.blush && v > -0.4 && v < 0.15) return F.blush;
    return v > 0.45 ? F.back : v > -0.35 ? F.side : F.belly;
  };
  const tri = (pts, thick) => { const s = new THREE.Shape(); pts.forEach((p, k) => k ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])); const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false }); g.translate(0, 0, -thick / 2); g.rotateY(Math.PI / 2); return g; };
  const parts = [
    { geo: body, color: F.side, colorFn: bodyFn },
    { geo: tri([[0, 0], [L * 0.2, H * 0.55], [L * 0.07, 0], [L * 0.2, -H * 0.55]], 0.012), color: F.fin, z: -L / 2 + 0.01 },                 // ogon (płetwa ogonowa z wcięciem)
    { geo: tri([[0, 0], [-L * 0.08, H * 0.32], [-L * 0.3, H * 0.05]], 0.01), color: F.fin, y: H * 0.42, z: L * 0.12 },                       // płetwa grzbietowa
    { geo: tri([[0, 0], [-L * 0.1, -H * 0.18], [-L * 0.16, 0]], 0.008), color: F.fin, y: -H * 0.38, z: -L * 0.05 },                          // płetwa odbytowa
    { geo: new THREE.SphereGeometry(Math.max(0.008, H * 0.07), 8, 6), color: 0x111111, x: W * 0.42, y: H * 0.12, z: L * 0.36 },
    { geo: new THREE.SphereGeometry(Math.max(0.008, H * 0.07), 8, 6), color: 0x111111, x: -W * 0.42, y: H * 0.12, z: L * 0.36 },
    { geo: new THREE.BoxGeometry(0.006, H * 0.22, H * 0.3), color: F.fin, x: W * 0.5, y: -H * 0.12, z: L * 0.18, ry: 0.5 },               // płetwy piersiowe
    { geo: new THREE.BoxGeometry(0.006, H * 0.22, H * 0.3), color: F.fin, x: -W * 0.5, y: -H * 0.12, z: L * 0.18, ry: -0.5 }
  ];
  return (_fishMeshes[id] = mergeColored(parts));
}
const FISH_TABLE = [['okon', 30], ['fladra', 20], ['dorsz', 20], ['karp', 14], ['szczupak', 9], ['losos', 7]];
const INV = { slots: new Array(36).fill(null), sel: 0, open: false, pick: -1 };
['fists', 'pistol', 'rifle', 'rpgh', 'rod'].forEach((id, i) => { INV.slots[i] = { id: id, n: 1 }; });
const invItem = () => INV.slots[INV.sel];
const invHeld = () => { const it = invItem(); return it ? it.id : 'fists'; };
const invHeldFish = () => { const it = invItem(); return !!(it && ITEMS[it.id].fish); };

/* --- ikony (rysowane raz na płótnie) --- */
const _iconCache = {};
function itemIcon(id){
  if (_iconCache[id]) return _iconCache[id];
  const c = mkCanvas(64, 64), g = c.getContext('2d'), it = ITEMS[id];
  g.lineCap = 'round'; g.lineJoin = 'round';
  const poly = (pts, fill) => { g.fillStyle = fill; g.beginPath(); pts.forEach((p, k) => k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fill(); };
  if (id === 'fists'){ g.fillStyle = '#d9a882'; g.beginPath(); g.roundRect ? g.roundRect(16, 20, 32, 26, 8) : g.rect(16, 20, 32, 26); g.fill(); g.strokeStyle = '#a87a58'; g.lineWidth = 2; for (let k = 0; k < 3; k++){ g.beginPath(); g.moveTo(24 + k * 8, 20); g.lineTo(24 + k * 8, 32); g.stroke(); } poly([[16, 34], [10, 40], [14, 46], [20, 42]], '#d9a882'); }
  else if (id === 'pistol'){ poly([[12, 22], [52, 22], [52, 32], [30, 32], [26, 50], [16, 50], [20, 32], [12, 32]], '#6a6f78'); poly([[12, 22], [52, 22], [52, 29], [12, 29]], '#a9aeb6'); poly([[20, 33], [29, 33], [26, 49], [17, 49]], '#3a3d44'); }   // jasne na ciemnym polu paska
  else if (id === 'rifle'){ poly([[4, 26], [58, 26], [58, 32], [36, 32], [33, 42], [27, 42], [26, 32], [16, 32], [14, 38], [4, 38]], '#7a7f88'); poly([[30, 32], [36, 32], [38, 48], [32, 48]], '#4a4d55'); poly([[22, 21], [40, 21], [40, 26], [22, 26]], '#2f3238'); poly([[40, 27], [54, 27], [54, 31], [40, 31]], '#8c9468'); }
  else if (id === 'rpg' || id === 'rpgh'){ poly([[6, 30], [44, 30], [44, 38], [6, 38]], id === 'rpg' ? '#4a5a3a' : '#6a7488'); poly([[44, 27], [58, 34], [44, 41]], id === 'rpg' ? '#5d6b45' : '#c8ccd2'); poly([[20, 38], [25, 38], [25, 47], [20, 47]], '#1b1c1f'); if (id === 'rpgh'){ g.fillStyle = '#40ff70'; g.fillRect(28, 25, 6, 5); g.fillStyle = '#c0392b'; g.fillRect(40, 30, 4, 8); } }
  else if (id === 'rod'){ g.strokeStyle = '#7a5a3a'; g.lineWidth = 4; g.beginPath(); g.moveTo(10, 56); g.lineTo(52, 8); g.stroke(); g.fillStyle = '#2a2c30'; g.beginPath(); g.arc(18, 48, 5, 0, TAU); g.fill(); g.strokeStyle = '#e8e8e8'; g.lineWidth = 1; g.beginPath(); g.moveTo(52, 8); g.lineTo(54, 40); g.stroke(); g.fillStyle = '#e03a2a'; g.beginPath(); g.arc(54, 42, 4, 0, TAU); g.fill(); }
  else if (it && it.fish){
    const F = FISH_LOOK[id], hex = v => '#' + v.toString(16).padStart(6, '0'), len = 13 + F.L * 21, hh = 5 + F.H * 40, cx = 26, cy = 33;   // połowa długości / wysokości — z ogonem mieści się w 64 px
    poly([[cx + len - 4, cy], [cx + len + 9, cy - hh * 0.8], [cx + len + 4, cy], [cx + len + 9, cy + hh * 0.8]], hex(F.fin));                  // ogon
    poly([[cx - 4, cy - hh + 1], [cx + len * 0.4, cy - hh - 5], [cx + len * 0.6, cy - hh + 2]], hex(F.fin));                                   // płetwa grzbietowa
    const gr = g.createLinearGradient(0, cy - hh, 0, cy + hh); gr.addColorStop(0, hex(F.back)); gr.addColorStop(0.45, hex(F.side)); gr.addColorStop(1, hex(F.belly));
    g.fillStyle = gr; g.beginPath(); g.ellipse(cx, cy, len, hh, 0, 0, TAU); g.fill();
    g.save(); g.beginPath(); g.ellipse(cx, cy, len, hh, 0, 0, TAU); g.clip();
    if (F.pattern === 'bars'){ g.fillStyle = 'rgba(30,45,15,.55)'; for (let k = 0; k < 5; k++) g.fillRect(cx - len * 0.6 + k * len * 0.32, cy - hh, 3, hh * 1.2); }
    else if (F.spot){ g.fillStyle = hex(F.spot); for (let k = 0; k < 14; k++){ const a = (k * 2.39) % TAU, r = (k * 0.37) % 1; g.beginPath(); g.arc(cx + Math.cos(a) * len * 0.7 * r, cy - hh * 0.3 + Math.sin(a) * hh * 0.4 * r, 1.4, 0, TAU); g.fill(); } }
    if (F.blush){ g.fillStyle = 'rgba(232,154,138,.6)'; g.fillRect(cx - len, cy - 2, len * 2, 5); }
    g.restore();
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1.5; g.beginPath(); g.arc(cx - len * 0.55, cy, hh * 0.75, -0.9, 0.9); g.stroke();       // skrzela
    poly([[cx - len * 0.2, cy + hh * 0.4], [cx - len * 0.05, cy + hh + 3], [cx + len * 0.05, cy + hh * 0.5]], hex(F.fin));                  // płetwa piersiowa
    g.fillStyle = '#fff'; g.beginPath(); g.arc(cx - len * 0.72, cy - hh * 0.2, 2.6, 0, TAU); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(cx - len * 0.74, cy - hh * 0.2, 1.5, 0, TAU); g.fill();
  }
  return (_iconCache[id] = c.toDataURL());
}

/* --- interfejs: pasek i plecak --- */
const _hotbarEl = document.getElementById('hotbar'), _invEl = document.getElementById('invPanel'), _invGrid = document.getElementById('invGrid'), _invHot = document.getElementById('invHot');
function slotHTML(i){
  const it = INV.slots[i];
  return '<div class="islot' + (i === INV.sel ? ' sel' : '') + (i === INV.pick ? ' pick' : '') + '" data-slot="' + i + '">' + (i < 9 ? '<span class="ik">' + (i + 1) + '</span>' : '') +
    (it ? '<img alt="" src="' + itemIcon(it.id) + '">' + (it.n > 1 ? '<b>' + it.n + '</b>' : '') : '') + '</div>';
}
function invRender(){
  let h = ''; for (let i = 0; i < 9; i++) h += slotHTML(i); _hotbarEl.innerHTML = h;
  if (INV.open){ let g = ''; for (let i = 9; i < 36; i++) g += slotHTML(i); _invGrid.innerHTML = g; _invHot.innerHTML = h; }
  const it = invItem(); document.getElementById('invName').textContent = it ? ITEMS[it.id].name + (it.n > 1 ? ' × ' + it.n : '') : '';
}
function invSelect(i){
  if (i < 0 || i > 8) return;
  if (INV.sel !== i) fishCancel();
  INV.sel = i;
  const it = invItem(), def = it && ITEMS[it.id];
  Weapons.select(def && def.weapon !== undefined ? def.weapon : 0);
  invRender();
}
function invCycle(dir){ invSelect(((INV.sel + dir) % 9 + 9) % 9); }
/* koło broni (Q): pole paska z tą bronią, inaczej sama broń */
function invSelectWeapon(w){ const i = INV.slots.slice(0, 9).findIndex(s => s && ITEMS[s.id].weapon === w); if (i >= 0) invSelect(i); else Weapons.select(w); }
function invAdd(id, n){
  n = n || 1;
  for (let i = 0; i < 36 && n > 0; i++){ const s = INV.slots[i]; if (s && s.id === id && ITEMS[id].fish && s.n < 16){ const k = Math.min(n, 16 - s.n); s.n += k; n -= k; } }
  for (let i = 0; i < 36 && n > 0; i++){ if (!INV.slots[i]){ INV.slots[i] = { id: id, n: Math.min(n, 16) }; n -= Math.min(n, 16); } }
  invRender();
  if (n > 0) invFullWarn(ITEMS[id].name);
  return n === 0;
}
/* przedmiot się nie zmieścił: czerwone ostrzeżenie nad paskiem, pasek mruga, dźwięk */
let _invWarnT = 0;
function invFullWarn(name){
  const w = document.getElementById('invWarn');
  w.innerHTML = '<b>Ekwipunek pełny</b> — nie można podnieść: ' + name + '<small>Zrób miejsce — np. nakarm kota rybą (Tab — plecak)</small>';
  w.classList.remove('on'); void w.offsetWidth; w.classList.add('on');
  _hotbarEl.classList.remove('full'); void _hotbarEl.offsetWidth; _hotbarEl.classList.add('full');
  clearTimeout(_invWarnT); _invWarnT = setTimeout(() => { w.classList.remove('on'); _hotbarEl.classList.remove('full'); }, 3200);
  if (typeof Sound !== 'undefined' && Sound.tick) Sound.tick(false);
}
function invTake(i){ const s = INV.slots[i]; if (!s) return; s.n--; if (s.n <= 0) INV.slots[i] = null; invSelect(INV.sel); }
function toggleInventory(){
  INV.open = !INV.open; INV.pick = -1;
  _invEl.classList.toggle('on', INV.open);
  if (INV.open){ wasLockedBeforeDebug = pointerLocked; if (pointerLocked) document.exitPointerLock(); }
  else if (wasLockedBeforeDebug) lockPointer();
  invRender();
}
_invEl.addEventListener('click', ev => {
  ev.stopPropagation();
  const el = ev.target.closest('[data-slot]');
  if (!el){ if (ev.target === _invEl) toggleInventory(); return; }
  const i = +el.dataset.slot;
  if (INV.pick < 0){ if (INV.slots[i]) INV.pick = i; }
  else {
    const a = INV.slots[INV.pick], b = INV.slots[i];
    if (b && a && a.id === b.id && ITEMS[a.id].fish && INV.pick !== i){ const k = Math.min(a.n, 16 - b.n); b.n += k; a.n -= k; if (a.n <= 0) INV.slots[INV.pick] = null; }
    else { INV.slots[INV.pick] = b; INV.slots[i] = a; }
    INV.pick = -1;
    invSelect(INV.sel);
  }
  invRender();
});
document.getElementById('invClose').addEventListener('click', ev => { ev.stopPropagation(); toggleInventory(); });

/* --- modele w dłoni: wędka i ryba --- */
/* wędka spinningowa (oś −Y od dłoni do szczytówki, spód = lokalne −Z): korkowa rękojeść z dolnikiem, uchwyt kołowrotka,
   kołowrotek (szpula z żyłką, kabłąk, korbka), dwuczęściowy blank zwężający się ku szczytówce z owijkami, przelotki od spodu */
const _rodMesh = (() => {
  const P = [], cyl = (r0, r1, y0, y1, color, seg) => { const g = new THREE.CylinderGeometry(r1, r0, Math.abs(y1 - y0), seg || 10); P.push({ geo: g, color: color, y: (y0 + y1) / 2 }); };
  cyl(0.024, 0.024, 0.34, 0.3, 0x1b1c1f);                                       // dolnik
  cyl(0.021, 0.019, 0.3, 0.1, 0xc9a26a, 12);                                    // korek (rękojeść dolna)
  cyl(0.017, 0.017, 0.1, -0.06, 0x2a2c30);                                      // uchwyt kołowrotka
  cyl(0.02, 0.016, -0.06, -0.22, 0xc9a26a, 12);                                 // korek (rękojeść górna)
  cyl(0.013, 0.011, -0.22, -0.26, 0x1b1c1f);                                    // pierścień
  cyl(0.011, 0.007, -0.26, -1.2, 0x23415e, 8);                                  // blank — dolna część (granat)
  cyl(0.0085, 0.0085, -1.17, -1.23, 0xc8ccd2, 8);                               // łącznik
  cyl(0.007, 0.0028, -1.2, -2.1, 0x23415e, 6);                                  // blank — szczytówka
  cyl(0.0035, 0.0028, -2.04, -2.1, 0xe8e2d0, 6);                                // biały koniec szczytówki
  [-0.5, -0.85, -1.15, -1.45, -1.72, -1.95].forEach((y, i) => {                 // przelotki od spodu, coraz mniejsze
    const r = 0.03 - i * 0.004, t = new THREE.TorusGeometry(r, 0.0025, 4, 12); t.rotateX(Math.PI / 2);
    P.push({ geo: t, color: 0xb9bec6, y: y, z: -(r + 0.018 - i * 0.0015) });
    P.push({ geo: new THREE.BoxGeometry(0.003, 0.004, 0.018 - i * 0.0015), color: 0x9aa0a8, y: y, z: -0.01 - (0.009 - i * 0.0008) });
    cyl(0.0105 - i * 0.0012, 0.0105 - i * 0.0012, y + 0.012, y - 0.012, 0xb8302a, 8);      // owijka przelotki
  });
  /* kołowrotek pod uchwytem: stopka, korpus, szpula z żyłką (oś wzdłuż wędki), kabłąk, korbka z gałką */
  P.push({ geo: new THREE.BoxGeometry(0.012, 0.05, 0.06), color: 0x2a2c30, y: 0.02, z: -0.04 });
  P.push({ geo: new THREE.CylinderGeometry(0.03, 0.034, 0.06, 14), color: 0x3a3d44, y: 0.02, z: -0.085 });
  P.push({ geo: new THREE.CylinderGeometry(0.037, 0.037, 0.035, 16), color: 0xa8acb4, y: -0.025, z: -0.085 });
  P.push({ geo: new THREE.CylinderGeometry(0.033, 0.033, 0.022, 16), color: 0xe8ecef, y: -0.026, z: -0.085 });   // nawinięta żyłka
  const bail = new THREE.TorusGeometry(0.04, 0.0025, 4, 16, Math.PI); bail.rotateX(Math.PI / 2);
  P.push({ geo: bail, color: 0xc8ccd2, y: -0.05, z: -0.085 });
  P.push({ geo: new THREE.BoxGeometry(0.07, 0.008, 0.008), color: 0x2a2c30, x: 0.045, y: 0.03, z: -0.085 });     // ramię korbki
  P.push({ geo: new THREE.CylinderGeometry(0.009, 0.009, 0.025, 8), color: 0x1b1c1f, x: 0.08, y: 0.03, z: -0.072, rx: Math.PI / 2 });
  const g = new THREE.Mesh(mergeColored(P), new THREE.MeshLambertMaterial({ vertexColors: true }));
  g.castShadow = true;
  g.position.set(0, -0.62, 0.04); g.rotation.x = -1.36;                      // ręka w przód i w dół, wędka w przód i w górę
  g.visible = false; player.armR.add(g); return g;
})();
const _fishHeld = (() => { const m = new THREE.Mesh(buildFishMesh('okon'), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })); m.rotation.x = Math.PI / 2 - 0.3; m.position.set(0, -0.7, 0.05); m.castShadow = true; m.visible = false; player.armR.add(m); return m; })();
const FISH = { state: 'idle', t: 0, from: new THREE.Vector3(), bob: new THREE.Vector3(), at: { x: 0, z: 0 } };
const _bobber = (() => { const m = new THREE.Mesh(mergeColored([{ geo: new THREE.SphereGeometry(0.09, 10, 8), color: 0xe03a2a, y: 0.03 }, { geo: new THREE.SphereGeometry(0.092, 10, 4, 0, TAU, Math.PI / 2, Math.PI / 2), color: 0xf2f0ea }]), new THREE.MeshLambertMaterial({ vertexColors: true })); m.visible = false; scene.add(m); return m; })();
const _lineGeo = new THREE.BufferGeometry(); _lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Array(10 * 3).fill(0), 3));
const _line = new THREE.Line(_lineGeo, new THREE.LineBasicMaterial({ color: 0xeeeeee, transparent: true, opacity: 0.8 })); _line.visible = false; _line.frustumCulled = false; scene.add(_line);
const _tip = new THREE.Vector3();
function rodTip(out){ _rodMesh.updateWorldMatrix(true, false); return out.set(0, -2.1, 0).applyMatrix4(_rodMesh.matrixWorld); }
function fishCancel(){ FISH.state = 'idle'; _bobber.visible = false; _line.visible = false; }
function fishClick(){
  if (FISH.state === 'idle'){
    const p = player.body.position, f = { x: -Math.sin(camYaw), z: -Math.cos(camYaw) };
    let tx = 0, tz = 0, ok = false;
    for (const d of [9, 11, 7, 13, 5.5]){ tx = p.x + f.x * d; tz = p.z + f.z * d; if (!isLand(tx, tz) && !BOAT_OBSTACLES.some(o => inRect(o, tx, tz))){ ok = true; break; } }
    if (!ok){ hudToast('Zarzuć do wody — stań na brzegu albo pomoście, przodem do morza'); return; }
    player.facing = camYaw + Math.PI; player.mesh.rotation.y = player.facing;      // przodem do rzutu
    FISH.state = 'cast'; FISH.t = 0; FISH.at = { x: p.x, z: p.z }; rodTip(FISH.from); FISH.bob.set(tx, WATER_Y + 0.05, tz);
    Sound.swing();
  } else if (FISH.state === 'wait'){ hudToast('Za wcześnie — nic nie bierze'); fishCancel(); }
  else if (FISH.state === 'bite'){
    let r = rnd() * FISH_TABLE.reduce((a, q) => a + q[1], 0), id = 'okon';
    for (const [k, w] of FISH_TABLE){ if ((r -= w) <= 0){ id = k; break; } }
    const kg = rand(ITEMS[id].w[0], ITEMS[id].w[1]);
    if (invAdd(id, 1)) hudToast('Złowiono: ' + ITEMS[id].name + ' · ' + kg.toFixed(1).replace('.', ',') + ' kg', 3); else hudToast('Ryba wróciła do wody', 3);
    Sound.reload(); fishCancel();
  }
}
function updateFishing(dt){
  const rod = mode === 'foot' && invHeld() === 'rod' && !player.dead;
  _rodMesh.visible = rod;
  const it = invItem(), fish = mode === 'foot' && it && ITEMS[it.id].fish && !player.dead;
  _fishHeld.visible = !!fish; if (fish && _fishHeld.geometry !== buildFishMesh(it.id)){ _fishHeld.geometry = buildFishMesh(it.id); const L = FISH_LOOK[it.id].L; _fishHeld.position.set(0, -0.62 - L / 2, 0.05); }
  if (rod || fish){ player.armR.rotation.set(rod ? -0.85 + (FISH.state === 'bite' ? Math.sin(clock * 30) * 0.06 : 0) : -0.5, 0, 0.1); }
  if (!rod){ if (FISH.state !== 'idle') fishCancel(); return; }
  if (FISH.state === 'idle') return;
  const p = player.body.position;
  if (Math.hypot(p.x - FISH.at.x, p.z - FISH.at.z) > 3){ hudToast('Żyłka zwinięta'); fishCancel(); return; }
  FISH.t += dt;
  rodTip(_tip);
  let bx = FISH.bob.x, by = FISH.bob.y, bz = FISH.bob.z;
  if (FISH.state === 'cast'){
    const k = Math.min(1, FISH.t / 0.6);
    bx = lerp(FISH.from.x, FISH.bob.x, k); bz = lerp(FISH.from.z, FISH.bob.z, k); by = lerp(FISH.from.y, FISH.bob.y, k) + Math.sin(k * Math.PI) * 2.5;
    if (k >= 1){ FISH.state = 'wait'; FISH.t = 0; FISH.wait = rand(3, 9); }
  } else if (FISH.state === 'wait'){
    by += Math.sin(clock * 2.4) * 0.025;
    if (FISH.t > FISH.wait){ FISH.state = 'bite'; FISH.t = 0; Sound.tick(true); hudToast('Bierze! Kliknij LPM', 1.3); }
  } else if (FISH.state === 'bite'){
    by -= 0.12 + Math.abs(Math.sin(clock * 14)) * 0.08;
    if (FISH.t > 1.3){ hudToast('Ryba uciekła…'); fishCancel(); return; }
  }
  _bobber.visible = true; _bobber.position.set(bx, by, bz);
  _line.visible = true;
  const a = _lineGeo.attributes.position.array, sag = FISH.state === 'cast' ? 0 : 0.6;
  for (let k = 0; k < 10; k++){ const u = k / 9; a[k * 3] = lerp(_tip.x, bx, u); a[k * 3 + 1] = lerp(_tip.y, by, u) - Math.sin(u * Math.PI) * sag; a[k * 3 + 2] = lerp(_tip.z, bz, u); }
  _lineGeo.attributes.position.needsUpdate = true;
}
/* LPM: wędka — zarzucanie / zacięcie; ryba — karmienie kota. true = obsłużone (bez strzału) */
function invHandleClick(){
  if (mode !== 'foot' || player.dead) return false;
  if (invHeld() === 'rod'){ fishClick(); return true; }
  if (invHeldFish()){ invTryFeed(); return true; }
  return false;
}
function invFeedCat(){ return mode === 'foot' && invHeldFish() ? catNear(player.body.position.x, player.body.position.z, 2.6) : null; }
function invTryFeed(){
  const c = invFeedCat(); if (!c) return false;
  invTake(INV.sel); const r = catFeed(c);
  hudToast(r === 'full' ? 'Kot zjadł, ale masz już ' + CAT_FRIEND_MAX + ' kotów-przyjaciół — ten zostaje na swoim podwórku' : r === 'again' ? 'Twój kot zjadł rybę ♥' : 'Nakarmiłeś kota ♥ — teraz chodzi za tobą (' + catFriendCount() + '/' + CAT_FRIEND_MAX + ')', 3.5);
  return true;
}
function updateInventory(dt){
  updateFishing(dt);
  _hotbarEl.classList.toggle('on', mode === 'foot' && !player.dead);
}
/* HUD broni dla przedmiotów bez broni: nazwa i stan wędkowania; true = obsłużone */
function invHud(){
  const it = invItem(), def = it && ITEMS[it.id];
  if (!def || def.weapon !== undefined) return false;
  el.wname.textContent = def.name + (it.n > 1 ? ' × ' + it.n : '');
  el.wammo.textContent = def.tool === 'rod' ? (FISH.state === 'wait' ? 'czekanie…' : FISH.state === 'bite' ? 'BIERZE!' : FISH.state === 'cast' ? '…' : 'LPM — zarzuć') : (invFeedCat() ? 'F — nakarm kota' : '');
  el.weaponhud.classList.toggle('on', mode === 'foot');
  el.crosshair.classList.remove('on'); document.getElementById('lockBox').style.display = 'none'; document.getElementById('lockZone').classList.remove('on');
  return true;
}
invRender();
