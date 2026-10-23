/* ---------------------------------------------------------------
   14e2. KRYJÓWKI — kontenery na śmieci między budynkami (F: schowaj się / wyjdź) i wnętrza hal z otwartymi wrotami
   (HIDE_ZONES z districts.js: hale przemysłowe, hangary obu lotnisk). W kontenerze gracza nie widać (postać i ciało
   poza światem, kamera krąży wokół kontenera); policja znajdzie go tylko, sprawdzając kontener z bliska (police.js),
   albo od razu, jeśli widziała, jak do niego wchodził. Kontenery: jedna scalona siatka, kolizja w komórkach.
   --------------------------------------------------------------- */
const HIDE_BINS = [];                                  // { x, z, y, rot, suspect }
(function placeBins(){
  const parts = [], body = 0x2f5d3a, lid = 0x22262b;
  const add = (b, geo, color, lx, ly, lz) => { const c = Math.cos(b.rot), s = Math.sin(b.rot); parts.push({ geo: geo, color: color, x: b.x + lx * c + lz * s, y: b.y + ly, z: b.z - lx * s + lz * c, ry: b.rot }); };
  const G = { box: new THREE.BoxGeometry(1.9, 1.1, 1.2), lidA: new THREE.BoxGeometry(0.97, 0.08, 1.3), rim: new THREE.BoxGeometry(2.0, 0.12, 1.3), wheel: new THREE.BoxGeometry(0.1, 0.2, 0.2), bar: new THREE.BoxGeometry(1.7, 0.06, 0.06) };
  const near = (list, x, z, r) => list.some(s => Math.hypot(s.x - x, s.z - z) < r);
  const inBld = (x, z, m) => buildings.some(b => Math.abs(x - b.x) < b.w / 2 + m && Math.abs(z - b.z) < b.d / 2 + m);
  for (let bi = 0; bi < GRID; bi++) for (let bj = 0; bj < GRID; bj++){
    const cx = blockCenter(bi), cz = blockCenter(bj);
    let placed = 0;
    for (let t = 0; t < 26 && placed < 2; t++){                                 // do dwóch kontenerów na kwartał
      const side = randInt(0, 3), along = rand(-10, 10), inset = rand(9.6, 11.4);
      const x = cx + (side < 2 ? along : (side === 2 ? inset : -inset)), z = cz + (side < 2 ? (side === 0 ? inset : -inset) : along);
      const rot = side < 2 ? 0 : Math.PI / 2;                                   // dłuższy bok wzdłuż krawężnika
      if (hwyCovered(x, z, 2) || inBld(x, z, 1.3) || !inBld(x, z, 4.5)) continue;   // tuż przy ścianie budynku, ale nie w nim
      if (near(treeSpots, x, z, 2.2) || near(lampSpots, x, z, 1.8) || near(binSpots, x, z, 1.6) || near(hydSpots, x, z, 1.6) || near(HIDE_BINS, x, z, 6)) continue;
      const g = rayHit(x, 6, z, x, -1, z, G_WORLD); if (!g || g.hitNormalWorld.y < 0.9 || g.hitPointWorld.y > 0.6 || g.hitPointWorld.y < -0.1) continue;   // chodnik / plac, nic nad głową
      const y = g.hitPointWorld.y, c = Math.cos(rot), s = Math.sin(rot);
      let free = true;
      for (const [lx, lz] of [[1.2, 0], [-1.2, 0], [0, 0.85], [0, -0.85], [1.1, 0.75], [-1.1, -0.75], [1.1, -0.75], [-1.1, 0.75]]){
        if (rayHit(x, y + 0.6, z, x + lx * c + lz * s, y + 0.6, z - lx * s + lz * c, G_WORLD | G_CAR)){ free = false; break; }
      }
      if (!free) continue;
      const ox = side < 2 ? 0 : (side === 2 ? 1 : -1), oz = side < 2 ? (side === 0 ? 1 : -1) : 0;              // wolne przejście do krawężnika (bez płotu, np. zakładu)
      if (rayHit(x + ox * 0.8, y + 0.6, z + oz * 0.8, cx + ox * 14.6 + (side < 2 ? along : 0), y + 0.6, cz + oz * 14.6 + (side < 2 ? 0 : along), G_WORLD)) continue;
      HIDE_BINS.push({ x: x, z: z, y: y, rot: rot, suspect: false });
      placed++;
    }
  }
  for (const b of HIDE_BINS){
    add(b, G.box, body, 0, 0.62, 0); add(b, G.rim, 0x24482d, 0, 1.2, 0);
    add(b, G.lidA, lid, -0.49, 1.29, 0); add(b, G.lidA, lid, 0.49, 1.29, 0);
    add(b, G.bar, 0x8a8f96, 0, 0.9, 0.64);
    for (const [wx, wz] of [[0.8, 0.45], [-0.8, 0.45], [0.8, -0.45], [-0.8, -0.45]]) add(b, G.wheel, 0x141518, wx, 0.1, wz);
    staticBoxRot(b.x, b.y + 0.65, b.z, 1.95, 1.3, 1.25, b.rot);
  }
  if (parts.length){ const m = new THREE.Mesh(mergeColored(parts), new THREE.MeshLambertMaterial({ vertexColors: true })); m.castShadow = m.receiveShadow = true; m.matrixAutoUpdate = false; scene.add(m); }
})();

/* najbliższy kontener w zasięgu ręki (pieszo, na ziemi) */
function hideBinNear(r){
  if (mode !== 'foot' || player.dead || (typeof parachute !== 'undefined' && parachute.on)) return null;
  const p = player.body.position;
  let best = null, bd = r || 1.9;
  for (const b of HIDE_BINS){ const d = Math.hypot(b.x - p.x, b.z - p.z); if (d < bd && Math.abs(p.y - 0.9 - b.y) < 1.2){ bd = d; best = b; } }
  return best;
}
/* schowanie: ciało poza światem (bez kolizji z kontenerem), postać niewidoczna; widziany przy wchodzeniu — policja wie, gdzie szukać */
function hideEnter(b){
  player.hiding = b; b.suspect = typeof WANTED !== 'undefined' && WANTED.stars > 0 && WANTED.seen;
  Weapons.holster(); fishCancel();
  delBody(player.body);
  player.body.position.set(b.x, b.y + 1.05, b.z); player.body.velocity.set(0, 0, 0);
  noLerp(player.body); savePrev(player.body);
  player.mesh.visible = false;
  hudToast('Schowałeś się w kontenerze — F, aby wyjść', 3);
  Sound.thud(3);
}
function hideExit(silent){
  const b = player.hiding; if (!b) return;
  player.hiding = null; b.suspect = false;
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  let x = b.x + 1.25 * s, z = b.z + 1.25 * c;                                    // przód kontenera (od strony ulicy, gdy wolne)
  if (rayHit(b.x, b.y + 0.9, b.z, x, b.y + 0.9, z, G_WORLD)){ x = b.x - 1.25 * s; z = b.z - 1.25 * c; }
  player.body.position.set(x, b.y + 1.1, z); player.body.velocity.set(0, 0, 0); player.fallSpeed = 0;
  addBody(player.body); player.body.wakeUp(); noLerp(player.body);
  player.mesh.visible = true;
  if (!silent) Sound.thud(3);
}
/* policja znalazła gracza w kontenerze: wyskakuje na zewnątrz */
function hideFound(){ if (player.hiding){ hideExit(); hudToast('Policja zajrzała do kontenera!', 2.5); } }
