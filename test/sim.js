"use strict";
/* Symulacja logiki ruchu: uruchamia PRAWDZIWY kod gry (core..main-loop) w Node
   z prawdziwymi Body/Vec3/Vector2 (minimalnymi) i atrapami reszty, po czym
   krok po kroku wywołuje update* i integruje pozycje aut kinematycznych.
   Szuka: zakleszczeń (auto stoi > 45 s), nakładania się aut, jazdy pod prąd
   na autostradzie. */
const fs = require('fs'), vm = require('vm');
function makeStub(name, over){
  over = over || {};
  const target = function Stub(){};
  const skip = ['length','name','prototype','caller','arguments'];
  return new Proxy(target, {
    get(t, p){
      if (typeof p === 'string' && p in over) return over[p];
      if (p === Symbol.toPrimitive) return h => h === 'number' ? 0 : '';
      if (p === 'valueOf') return () => 0;
      if (p === 'toString') return () => '';
      if (p === Symbol.iterator || p === 'then') return undefined;
      if (skip.indexOf(p) === -1 && p in t) return t[p];
      return makeStub(name + '.' + String(p));
    },
    set(){ return true; }, apply(){ return makeStub(name+'()'); }, construct(){ return makeStub('new'); }, has(){ return true; }
  });
}
function chainProxy(obj){
  const px = new Proxy(obj, {
    get(t,p){
      if (p in t) return typeof t[p] === 'function' ? (...a) => { t[p](...a); return px; } : t[p];
      if (typeof p === 'symbol' || p === 'then') return undefined;
      return () => px;
    },
    set(t,p,v){ t[p]=v; return true; }
  });
  return px;
}
class V3 { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z; return chainProxy(this);} set(x,y,z){this.x=x;this.y=y;this.z=z;} copy(o){this.x=o.x;this.y=o.y;this.z=o.z;} }
class V2 { constructor(x=0,y=0){this.x=x;this.y=y; return chainProxy(this);} set(x,y){this.x=x;this.y=y;} }
class Quat { constructor(){this.x=0;this.y=0;this.z=0;this.w=1;} setFromAxisAngle(){return this;} copy(){return this;} vmult(a,b){ return b||a; } mult(q,t){ return t||this; } }
function RealBody(){
  const b = { position:new V3(), velocity:new V3(), angularVelocity:new V3(), force:new V3(), quaternion:new Quat() };
  return new Proxy(b, { get(t,p){ if (p in t) return t[p]; return () => {}; }, set(t,p,v){ t[p]=v; return true; } });
}
RealBody.KINEMATIC = 4; RealBody.DYNAMIC = 1; RealBody.STATIC = 2;
const CANNON = makeStub('CANNON', { Vec3: V3, Body: RealBody, Quaternion: Quat });
const THREE = makeStub('THREE', { Vector2: V2, Vector3: V3 });

const base = { THREE, CANNON, document: makeStub('document'), navigator: makeStub('navigator'),
  localStorage:{getItem(){return null;},setItem(){}}, performance:{now:()=>Date.now()},
  requestAnimationFrame(){return 1;}, cancelAnimationFrame(){}, addEventListener(){}, removeEventListener(){},
  innerWidth:1280, innerHeight:800, devicePixelRatio:1, console, Math, Object, Array, JSON, Date, String, Number, Boolean,
  Symbol, Map, Set, WeakMap, Proxy, Reflect, setTimeout, clearTimeout, isNaN, parseInt, parseFloat };
base.window = base; base.globalThis = base; base.self = base;
if (process.env.SEED) base.GAME_SEED = parseInt(process.env.SEED, 10);

const order = fs.readFileSync(__dirname+'/../loadorder.txt','utf8').trim().split('\n').map(s=>s.trim());
let code = order.map(f => fs.readFileSync(__dirname+'/../js/'+f,'utf8')).join('\n');
code += `
/* --- węzeł: czy punkt (x,z) na wysokości y leży ≥ tol wewnątrz innej drogi (|Δy| < 0.3) — indeks drogi albo null --- */
let __segGrid = null;
function __insideWay(x, z, y, wi, tol){
  const CS = 16;
  if (!__segGrid){
    __segGrid = new Map();
    HWY_WAYS.forEach(w => { for (let i = 0; i < w.pts.length - 1; i++){ const a = w.pts[i], b = w.pts[i+1], s = { w: w.idx, a: a, b: b };
      const x0 = Math.floor((Math.min(a.x, b.x) - 12) / CS), x1 = Math.floor((Math.max(a.x, b.x) + 12) / CS);
      const z0 = Math.floor((Math.min(a.z, b.z) - 12) / CS), z1 = Math.floor((Math.max(a.z, b.z) + 12) / CS);
      for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++){ const k = gx + ',' + gz; if (!__segGrid.has(k)) __segGrid.set(k, []); __segGrid.get(k).push(s); } } });
  }
  const c = __segGrid.get(Math.floor(x / CS) + ',' + Math.floor(z / CS)); if (!c) return null;
  for (const s of c){ if (s.w === wi) continue;
    const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, l2 = dx*dx + dz*dz || 1, t = ((x - s.a.x)*dx + (z - s.a.z)*dz) / l2;
    if (t < 0 || t > 1) continue;
    const px = s.a.x + dx*t, pz = s.a.z + dz*t, hw = s.a.hw + (s.b.hw - s.a.hw)*t, yy = s.a.y + (s.b.y - s.a.y)*t;
    if (Math.abs(yy - y) < 0.3 && Math.hypot(x - px, z - pz) < hw - tol) return s.w;
  }
  return null;
}
/* wysokości powierzchni pod punktem: nawierzchnie dróg, góra pasa rozdziału, korony barier, nosy */
function __surfacesAt(x, z){
  const ys = [];
  HWY_WAYS.forEach(w => { for (let i = 0; i < w.pts.length - 1; i++){ const a = w.pts[i], b = w.pts[i+1];
    const dx = b.x - a.x, dz = b.z - a.z, l2 = dx*dx + dz*dz || 1, t = ((x - a.x)*dx + (z - a.z)*dz) / l2;
    if (t < -0.01 || t > 1.01) continue;
    const px = a.x + dx*t, pz = a.z + dz*t, hw = a.hw + (b.hw - a.hw)*t, y = a.y + (b.y - a.y)*t, l = Math.sqrt(l2);
    const lat = ((x - px) * -dz + (z - pz) * dx) / l;                 // + w prawo
    if (Math.abs(lat) <= hw) ys.push(w.kind === 'med' ? y + 0.9 : y);
    else if (Math.abs(lat) <= hw + 0.4 && wayBarrier(w, i, Math.sign(lat))) ys.push(y + 1.0);
  } });
  HWY_GORES.forEach(g => { for (let i = 0; i < g.pts.length - 1; i++){ const a = g.pts[i], b = g.pts[i+1];
    const poly = [[a.ex, a.ez], [b.ex, b.ez], [b.lx, b.lz], [a.lx, a.lz]];
    let inside = false; for (let k = 0, m = 3; k < 4; m = k++){ const [xi, zi] = poly[k], [xj, zj] = poly[m]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside; }
    if (inside) ys.push((a.y + b.y) / 2);
  } });
  return ys;
}
/* nakładanie górnych powierzchni dróg i nosów na tym samym poziomie: próbki co 0.5 m */
function hwyOverlapCheck(){
  const pairs = {};
  const hit = (k, x, z) => { const p = pairs[k] || (pairs[k] = { n: 0, at: [x.toFixed(0), z.toFixed(0)] }); p.n++; };
  HWY_WAYS.forEach(w => { for (let i = 0; i < w.pts.length - 1; i++){ const a = w.pts[i], b = w.pts[i+1];
    const l = Math.hypot(b.x - a.x, b.z - a.z); if (l < 0.01) continue; const hx = (b.x - a.x)/l, hz = (b.z - a.z)/l;
    for (let d = 0.25; d < l; d += 0.5){ const t = d / l, hw = a.hw + (b.hw - a.hw)*t, y = a.y + (b.y - a.y)*t;
      for (let o = -hw + 0.35; o < hw - 0.1; o += 0.5){
        const x = a.x + hx*d - hz*o, z = a.z + hz*d + hx*o, o2 = __insideWay(x, z, y, w.idx, 0.1);
        if (o2 !== null) hit(w.name + ' | ' + HWY_WAYS[o2].name, x, z);
      } } } });
  (typeof HWY_GORES !== 'undefined' ? HWY_GORES : []).forEach(g => g.pts.forEach((p, i) => { if (!i) return; const q = g.pts[i - 1];
    for (let t = 0.2; t < 0.9; t += 0.3){ const x = lerp(lerp(q.ex, p.ex, 0.5), lerp(q.lx, p.lx, 0.5), t), z = lerp(lerp(q.ez, p.ez, 0.5), lerp(q.lz, p.lz, 0.5), t);
      const o2 = __insideWay(x, z, p.y, -1, 0.1); if (o2 !== null) hit('nos ' + g.cw + ' | ' + HWY_WAYS[o2].name, x, z); } }));
  return { pairs: Object.keys(pairs).length, area: +Object.values(pairs).reduce((s, p) => s + p.n * 0.25, 0).toFixed(1), list: Object.entries(pairs).slice(0, 10).map(e => e[0] + ': ' + (e[1].n*0.25).toFixed(1) + ' m² @' + e[1].at) };
}
function __static(){
  const out = {};
  /* normalne: poziome trójkąty muszą patrzeć W GÓRĘ (inaczej z góry niewidoczne) */
  const down = {};
  [['roadBuf',roadBuf],['crossBuf',crossBuf],['crosswalkBuf',crosswalkBuf],['roundaboutPaintBuf',roundaboutPaintBuf],['hwTopBuf',hwTopBuf],['hwTopAuxBuf',hwTopAuxBuf],['hwRampBuf',hwRampBuf],['hwRampAuxBuf',hwRampAuxBuf],['hwGoreBuf',hwGoreBuf],['lawnBuf',lawnBuf],['walkBuf',walkBuf]].forEach(([nm,b]) => {
    let flatUp = 0, flatDown = 0;
    for (let i = 0; i < b.n.length; i += 3){
      const ny = b.n[i+1];
      if (ny > 0.9) flatUp++; else if (ny < -0.9) flatDown++;
    }
    down[nm] = { up: flatUp/6, down: flatDown/6 };
  });
  out.normals = down;
  /* znaki w mieście: poza jezdnią, przodem do nadjeżdżających, po PRAWEJ kierowcy */
  const nearAxis = v => { let m = 1e9; for (let i = 0; i <= GRID; i++) m = Math.min(m, Math.abs(v - L(i))); return m; };
  const bad = [];
  signLog.forEach(g => {
    if (!['C-12','A-7','STOP','sygnalizator'].includes(g.kind)) return;
    if (nearAxis(g.x) < ROAD_H - 0.01 && nearAxis(g.z) < ROAD_H - 0.01) bad.push(g.kind+' w skrzyżowaniu '+g.x.toFixed(0)+','+g.z.toFixed(0));
    else if (nearAxis(g.x) < ROAD_H - 0.01 || nearAxis(g.z) < ROAD_H - 0.01) bad.push(g.kind+' NA JEZDNI '+g.x.toFixed(1)+','+g.z.toFixed(1));
    // środek najbliższego skrzyżowania
    let best = null, bd = 1e9;
    for (let i = 0; i <= GRID; i++) for (let j = 0; j <= GRID; j++){
      const dd = Math.hypot(g.x - L(i), g.z - L(j)); if (dd < bd){ bd = dd; best = [L(i), L(j)]; }
    }
    const f = [Math.sin(g.rot), Math.cos(g.rot)], rx = g.x - best[0], rz = g.z - best[1];
    const along = rx*f[0] + rz*f[1], lateral = rx*f[1] - rz*f[0];     // prawa kierowcy = (d.z, -d.x)
    if (along < ROAD_H || lateral < ROAD_H) bad.push(g.kind+' źle: along '+along.toFixed(1)+' lateral '+lateral.toFixed(1)+' @'+g.x.toFixed(0)+','+g.z.toFixed(0));
  });
  /* konstrukcja znaków: lico każdej tarczy przed słupkiem (od przodu słupek niewidoczny), rewers za licem */
  signFaceBufs.forEach(e => { for (let i = 0; i < e.buf.n.length; i += 3) if (Math.abs(e.buf.n[i+1]) > 0.01) bad.push('lico tarczy nie jest pionowe'); });
  signGeomLog.forEach(g => {
    if (!(g.poleTop < g.faceTop && g.poleTop > g.faceBottom)) bad.push('słupek ' + g.poleTop.toFixed(2) + ' poza tarczami ' + g.faceBottom.toFixed(2) + '–' + g.faceTop.toFixed(2) + ' @' + g.x.toFixed(0) + ',' + g.z.toFixed(0));
    if (g.poleFront >= g.backZ) bad.push('słupek przebija rewers @' + g.x.toFixed(0) + ',' + g.z.toFixed(0));
  });
  /* wszystkie znaki w mieście (poza C-9 na wysepce ronda): na chodniku, nie na jezdni */
  signLog.forEach(g => {
    if (g.kind === 'C-9' || Math.abs(g.x) > CITY_EDGE || Math.abs(g.z) > CITY_EDGE || hwyCovered(g.x, g.z, 0.5)) return;   // znaki na/pod autostradą osobno
    if (!['C-12','A-7','STOP','sygnalizator'].includes(g.kind) && (nearAxis(g.x) < ROAD_H - 0.01 || nearAxis(g.z) < ROAD_H - 0.01)) bad.push(g.kind + ' NA JEZDNI ' + g.x.toFixed(1) + ',' + g.z.toFixed(1));
  });
  /* słupki: podstawa na nawierzchni / koronie bariery / pasie rozdziału / nosie / chodniku / gruncie (≤ 5 cm) */
  const float = [];
  signGeomLog.forEach(g => (g.poles || []).forEach(p => {
    if (p.base < 0.3) return;                                   // chodnik / grunt (kontrola „na jezdni” osobno)
    const ys = __surfacesAt(p.x, p.z);
    if (!ys.some(y => Math.abs(y - p.base) < 0.05)) float.push((g.kind || '?') + ' @' + p.x.toFixed(1) + ',' + p.z.toFixed(1) + ' podstawa ' + p.base.toFixed(2) + ' pod: [' + ys.map(y => y.toFixed(2)).join(',') + ']');
  }));
  /* duplikaty: ten sam znak, ten sam kierunek, < 3 m */
  let dups = 0; const dupEx = [];
  signLog.forEach((a, i) => { for (let k = i + 1; k < signLog.length; k++){ const b = signLog[k];
    if (a.kind === b.kind && Math.abs(wrapAngle(a.rot - b.rot)) < 0.3 && Math.hypot(a.x - b.x, a.z - b.z) < 3){ dups++; if (dupEx.length < 3) dupEx.push(a.kind + ' @' + a.x.toFixed(0) + ',' + a.z.toFixed(0)); } } });
  /* aleja z pierwszeństwem: każdy wlot poprzeczny ma A-7 albo STOP, każdy wylot alei D-1 */
  const prioMiss = [];
  const signNear = (kinds, x, z, r) => signLog.some(s => kinds.includes(s.kind) && Math.hypot(s.x - x, s.z - z) < r);
  PRIO.forEach((axis, key) => {
    const [i, j] = key.split(',').map(Number), cx = L(i), cz = L(j);
    if (TL_PTS.some(t => t[0] === i && t[1] === j)) return;
    [-1, 1].forEach(sz => { if (j + sz < 0 || j + sz > GRID) return; if (!legalTravel(i, j, {x:0, z:sz}, {x:0, z:-sz})) return;
      if (!signNear(['A-7', 'STOP'], cx, cz + sz * STOP_AT, 9)) prioMiss.push('A-7/STOP ' + i + ',' + j + (sz > 0 ? ' S' : ' N')); });
    [-1, 1].forEach(sx => { if (i + sx < 1 || i + sx > GRID) return;
      if (!signNear(['D-1'], cx + sx * (ROAD_H + 5), cz, 9)) prioMiss.push('D-1 ' + i + ',' + j + (sx > 0 ? ' E' : ' W')); });
  });
  out.signChecks = { float: float.length, dups: dups, prioMissing: prioMiss.length, examples: float.slice(0, 4).concat(dupEx, prioMiss.slice(0, 3)) };
  const kinds = {}; signLog.forEach(g => kinds[g.kind] = (kinds[g.kind] || 0) + 1);
  out.signKinds = kinds;
  out.signProblems = bad;
  /* ronda: trasy NPC przez każde rondo — przeciwnie do wskazówek zegara (kąt rośnie), tor auta
     (± pół szerokości nadwozia 0.95) poza opaską wyspy, wewnątrz krawędzi i z dala od wysepek rozdzielających */
  const rbs = ROUNDABOUT_PTS.map(() => ({ routes: 0, turns: {} })), rbBad = [];
  LOOPS.forEach(path => {
    for (let i = 0; i < path.length; i++){
      const p = path[i], q = path[(i + 1) % path.length];
      if (p.rb === undefined) continue;
      const c = { x: L(ROUNDABOUT_PTS[p.rb][0]), z: L(ROUNDABOUT_PTS[p.rb][1]) };
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      if (p.first){ rbs[p.rb].routes++; }
      if (d < RB.apron + 0.95) rbBad.push('tor przy wyspie ' + d.toFixed(2) + ' @rondo ' + p.rb);
      if (p.k === 'ring' && q.k === 'ring' && q.rb === p.rb){
        const da = wrapAngle(Math.atan2(q.x - c.x, q.z - c.z) - Math.atan2(p.x - c.x, p.z - c.z));
        if (d > RB.ringR - 0.1 && Math.hypot(q.x - c.x, q.z - c.z) > RB.ringR - 0.1 && da <= 0) rbBad.push('ruch zgodny z zegarem @rondo ' + p.rb);
        if (d > RB.outer - 0.95) rbBad.push('tor przy krawędzi ' + d.toFixed(2));
      }
      RB_ARMS.forEach(u => {
        const al = (p.x - c.x)*u.x + (p.z - c.z)*u.z, lat = Math.abs((p.x - c.x)*u.z - (p.z - c.z)*u.x);
        if (al > RB.splitFrom - 0.5 && al < RB.splitTo + 0.5 && lat < RB.splitW0 + 0.95) rbBad.push('tor na wysepce @rondo ' + p.rb);
      });
    }
  });
  out.roundabout = { routesPerRb: rbs.map(r => r.routes), problems: rbBad.slice(0, 6), nProblems: rbBad.length };
  /* wszystko wewnątrz jednego muru */
  const outside = [];
  mapExtras.forEach(e => {
    const xs = e.t === 'rect' ? [e.x0, e.x1] : e.t === 'disc' ? [e.x - e.r, e.x + e.r] : e.pts.map(q => q[0]);
    const zs = e.t === 'rect' ? [e.z0, e.z1] : e.t === 'disc' ? [e.z - e.r, e.z + e.r] : e.pts.map(q => q[1]);
    if (Math.min(...xs) < -WALL_X || Math.max(...xs) > WALL_X || Math.min(...zs) < -WALL_X || Math.max(...zs) > WALL_X) outside.push(JSON.stringify(e).slice(0,80));
  });
  signLog.forEach(g => { if (Math.abs(g.x) > WALL_X || Math.abs(g.z) > WALL_X) outside.push(g.kind+'@'+g.x.toFixed(0)+','+g.z.toFixed(0)); });
  HWY_WAYS.forEach(w => w.pts.forEach(p => { if (Math.max(Math.abs(p.x), Math.abs(p.z)) + p.hw + 0.5 > WALL_X - 0.6) outside.push(w.name); }));
  out.outsideWall = outside;
  /* autostrady: filary nie na jezdni ani chodniku (pas 3.5 m przy krawędzi kwartału), prześwit nad ulicami,
     żaden budynek w pasie autostrady, normalne nawierzchni */
  const hb = { pierRoad: [], pierWalk: [], clearance: [], minClear: 99, buildings: 0 };
  HWY_PIERS.forEach(p => {
    if (Math.abs(p.x) > CITY_EDGE || Math.abs(p.z) > CITY_EDGE) return;
    const h = p.size / 2;
    if (nearAxis(p.x) < ROAD_H + h + 0.3 || nearAxis(p.z) < ROAD_H + h + 0.3){ hb.pierRoad.push(p.x.toFixed(0) + ',' + p.z.toFixed(0)); return; }
    const bi = Math.floor((p.x + HALF) / BLOCK), bj = Math.floor((p.z + HALF) / BLOCK);
    const rim = blockPedFree(bi, bj) ? 1.0 : 3.5;                       // chodnik z pieszymi: 3.5 m, bez pieszych: 1 m od krawężnika
    if (Math.abs(p.x - blockCenter(bi)) > LOT/2 - rim - h + 0.01 || Math.abs(p.z - blockCenter(bj)) > LOT/2 - rim - h + 0.01) hb.pierWalk.push(p.x.toFixed(0) + ',' + p.z.toFixed(0));
  });
  HWY_WAYS.forEach(w => w.pts.forEach(p => {
    if (p.y < 0.3 || Math.abs(p.x) > CITY_EDGE + 1 || Math.abs(p.z) > CITY_EDGE + 1) return;
    if (nearAxis(p.x) < ROAD_H + p.hw || nearAxis(p.z) < ROAD_H + p.hw){
      const c = p.y - HP.slab; hb.minClear = Math.min(hb.minClear, c);
      if (c < 5.8) hb.clearance.push(w.name + ' ' + c.toFixed(2));
    }
  }));
  hb.buildings = buildings.filter(b => hwyRectCovered(b.x, b.z, b.w, b.d, 0)).length;
  /* węzeł: nakładanie nawierzchni (ta sama wysokość), bariery na jezdni sąsiedniej drogi, nosy, sekwencja ćwiartek */
  const ov = hwyOverlapCheck();
  const onRoad = [];
  HWY_WAYS.forEach(w => { for (let i = 0; i < w.pts.length - 1; i++) [1, -1].forEach(sd => {
    if (!wayBarrier(w, i, sd)) return;
    const a = w.pts[i], b = w.pts[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z) || 1, rx = -(b.z - a.z) / l, rz = (b.x - a.x) / l;
    [0.25, 0.5, 0.75].forEach(t => { const hw = lerp(a.hw, b.hw, t) + 0.2, x = lerp(a.x, b.x, t) + rx * sd * hw, z = lerp(a.z, b.z, t) + rz * sd * hw, y = lerp(a.y, b.y, t);
      const o = __insideWay(x, z, y, w.idx, 0.05); if (o !== null) onRoad.push(w.name + ' na ' + HWY_WAYS[o].name + ' @' + x.toFixed(0) + ',' + z.toFixed(0)); });
  }); });
  const seq = ['A1+', 'A1-', 'A2+', 'A2-'].map(cw => {
    const ex = HWY_RAMPS.find(r => r.kind === 'conn' && r.from === cw), en = HWY_RAMPS.find(r => r.kind === 'conn' && r.to === cw);
    const sOf = p => Math.abs(hwyAxisOf(p.x, p.z).s);
    return [sOf(ex.way.pts[0]), sOf(ex.way.pts[ex.way.auxIn - 1]), HP.colS, HP.colS, sOf(en.way.pts[en.way.pts.length - en.way.auxOut]), sOf(en.way.pts[en.way.pts.length - 1])].map(v => v.toFixed(1)).join('/');
  });
  hb.overlap = ov; hb.barrierOnRoad = onRoad; hb.seq = seq;
  /* teren węzła: kopce, stawy, boiska nie na ulicach, nie przy filarach, kopiec pod pomostem z prześwitem ≥ 3 m */
  const tb = [];
  terrainLog.forEach(t => {
    if (t.kind === 'green') return;
    if (nearAxis(t.x) < ROAD_H + t.r - 1 || nearAxis(t.z) < ROAD_H + t.r - 1) tb.push(t.kind + ' na ulicy @' + t.x.toFixed(0) + ',' + t.z.toFixed(0));
    if (HWY_PIERS.some(p => Math.hypot(p.x - t.x, p.z - t.z) < t.r * 0.6 + p.size / 2)) tb.push(t.kind + ' przy filarze @' + t.x.toFixed(0) + ',' + t.z.toFixed(0));
    if (t.kind === 'mound' && deckClearAt(t.x, t.z) < t.h + 3) tb.push('kopiec pod pomostem @' + t.x.toFixed(0) + ',' + t.z.toFixed(0));
  });
  out.terrain = { mounds: terrainLog.filter(t => t.kind === 'mound').length, ponds: terrainLog.filter(t => t.kind === 'pond').length, courts: terrainLog.filter(t => t.kind === 'court').length,
                  greens: terrainLog.filter(t => t.kind === 'green').length, problems: tb.length, examples: tb.slice(0, 5) };
  hb.gores = HWY_GORES.length; hb.goreMinGap = Math.min(...HWY_GORES.map(g => g.gap));
  out.hwy = { ways: HWY_WAYS.length, piers: HWY_PIERS.length, maxSpan: +HWY_MAX_SPAN.toFixed(1), pierRoad: hb.pierRoad.length, pierWalk: hb.pierWalk.length,
              lowClearance: hb.clearance.length, minClearance: +hb.minClear.toFixed(2), buildingsInBand: hb.buildings,
              overlapArea: hb.overlap.area, barrierOnRoad: hb.barrierOnRoad.length, gores: hb.gores, goreMinGap: +hb.goreMinGap.toFixed(2),
              seqSame: hb.seq.every(q => q === hb.seq[0]), seq: hb.seq[0],
              examples: hb.pierRoad.concat(hb.pierWalk, hb.clearance, hb.overlap.list, hb.barrierOnRoad).slice(0, 6) };
  out.world = { wall: WALL_X, cityEdge: CITY_EDGE };
  return out;
}
/* prawdziwe nakładanie nadwozi: test osi rozdzielającej (SAT) dla prostokątów 1.86 x 4.1 m
   obróconych wg kierunku jazdy (pomniejszone o 0.1 m — styk zderzaków to jeszcze nie kolizja) */
function __obb(a, b){
  const ha = [0.88, 2.0], ax = [[Math.cos(a.h), -Math.sin(a.h)], [Math.sin(a.h), Math.cos(a.h)]];
  const bx = [[Math.cos(b.h), -Math.sin(b.h)], [Math.sin(b.h), Math.cos(b.h)]];
  const d = [b.x - a.x, b.z - a.z];
  for (const axis of ax.concat(bx)){
    const ra = ha[0]*Math.abs(ax[0][0]*axis[0] + ax[0][1]*axis[1]) + ha[1]*Math.abs(ax[1][0]*axis[0] + ax[1][1]*axis[1]);
    const rb = ha[0]*Math.abs(bx[0][0]*axis[0] + bx[0][1]*axis[1]) + ha[1]*Math.abs(bx[1][0]*axis[0] + bx[1][1]*axis[1]);
    if (Math.abs(d[0]*axis[0] + d[1]*axis[1]) > ra + rb) return false;
  }
  return true;
}
function __sim(seconds){
  const dt = 0.05, steps = Math.floor(seconds/dt);
  chassisBody.position.set(9999, 0.6, 9999);       // auto gracza poza trasami
  player.body.position.set(-9999, 1, -9999);
  const cnt = { red:0, stop:0, yield:0, rbNear:0, rbWrong:0, red2:0, stop2:0, rbPass:0, pedWaitMax:0, pedMinD:99, pedHit:0, overLimit:0, v30:0, v50:0, wrongWay:0, hwyMax:0 };
  const _r = redLightAhead, _s = stopSignAhead, _y = roundaboutYield;
  let late = false;   // druga połowa symulacji — reguły muszą działać przez cały czas, nie tylko na starcie
  redLightAhead = (...a) => { const v = _r(...a); if (v){ cnt.red++; if (late) cnt.red2++; } return v; };
  stopSignAhead = (...a) => { const v = _s(...a); if (v){ cnt.stop++; if (late) cnt.stop2++; } return v; };
  roundaboutYield = (...a) => { const v = _y(...a); if (v) cnt.yield++; return v; };
  const stuck = new Map(), report = { stuckMax:0, stuckIds:[], overlaps:0, overlapPairs:new Set(), minSpeedSamples:0 };
  for (let s = 0; s < steps; s++){
    late = s > steps / 2;
    updateTrafficLights(dt); updateNpcs(dt); updatePedestrians(dt);
    for (const p of Pedestrians.list){
      if (p.state === 'wait') cnt.pedWaitMax = Math.max(cnt.pedWaitMax, p.waitT);
      if (!pedOnRoad(p)) continue;
      for (const n of npcs){ const d = Math.hypot(n.pos.x - p.pos.x, n.pos.y - p.pos.y); if (d < cnt.pedMinD) cnt.pedMinD = d; if (d < 2.2) cnt.pedHit++; }
    }
    for (const n of npcs){ n.body.position.x += n.body.velocity.x*dt; n.body.position.z += n.body.velocity.z*dt; }
    for (let i = 0; i < npcs.length; i++){
      const n = npcs[i];
      const sp = Math.hypot(n.body.velocity.x, n.body.velocity.z);
      if (n.__rbPrev === 'ring' && n.rbPhase !== 'ring') cnt.rbPass++;
      /* autostrady: przejazdy pętli / łącznic, wjazdy z przekątnych, prędkość */
      const rk = n.path[n.wp].rk;
      if (rk !== n.__rk){ if (rk === 'loop') cnt.loopPass = (cnt.loopPass || 0) + 1; if (rk === 'conn') cnt.connPass = (cnt.connPass || 0) + 1; if (rk === 'enter') cnt.hwyEnter = (cnt.hwyEnter || 0) + 1; n.__rk = rk; }
      if ((n.y || 0) > 1) cnt.hwyMax = Math.max(cnt.hwyMax, n.speed);
      /* przepisy: limit prędkości strefy (z tolerancją 10%), jednokierunkowe */
      /* na autostradzie / łącznicy limitem jest vmax punktu trasy (znaki B-33 przy rampach), ulice pod estakadą nie liczą się */
      const tg = n.path[n.wp], onHwy = tg.hwy || (n.y || 0) > 1;
      const tp = n.path[(n.wp - 1 + n.path.length) % n.path.length];   // limit odcinka: większy z jego końców (hamowanie trwa)
      const lim = onHwy ? (tg.vmax !== undefined && tp.vmax !== undefined ? Math.max(tg.vmax, tp.vmax) : tg.vmax) : speedLimitAt(n.pos.x, n.pos.y);
      if (lim && n.speed > lim * 1.1 + 0.3) cnt.overLimit++;
      if (!onHwy && inZone30(n.pos.x, n.pos.y)) cnt.v30 = Math.max(cnt.v30, n.speed);
      else if (!onHwy && lim) cnt.v50 = Math.max(cnt.v50, n.speed);
      if (!onHwy && n.speed > 1 && oneWayWrong(n.pos.x, n.pos.y, n.dirX || 0, n.dirZ || 0)) cnt.wrongWay++;
      n.__rbPrev = n.rbPhase;
      const st = (stuck.get(i)||0);
      stuck.set(i, sp < 0.3 ? st + dt : 0);
      if (stuck.get(i) > report.stuckMax){ report.stuckMax = stuck.get(i); report.stuckId = i; report.stuckAt = [n.pos.x.toFixed(0), n.pos.y.toFixed(0)]; }
      /* rondo: nadwozie na wyspie (opasce) albo jazda po pasie okrężnym zgodnie z ruchem wskazówek */
      for (const q of ROUNDABOUT_PTS){
        const cx = L(q[0]), cz = L(q[1]), d = Math.hypot(n.pos.x - cx, n.pos.y - cz);
        if (d < RB.apron + 0.85) cnt.rbNear++;
        if (d > RB.apron + 1 && d < RB.outer - 0.5 && n.speed > 1 && n.rbPhase === 'ring'){
          const tx = (n.pos.y - cz) / d, tz = -(n.pos.x - cx) / d;          // styczna przeciwnie do wskazówek: (cos a, -sin a)
          if ((n.dirX || 0)*tx + (n.dirZ || 0)*tz < -0.3) cnt.rbWrong++;
        }
      }
      for (let k = i+1; k < npcs.length; k++){
        const m = npcs[k];
        if (Math.abs((n.y || 0) - (m.y || 0)) < 2.5 && Math.hypot(n.pos.x-m.pos.x, n.pos.y-m.pos.y) < 4.6 && __obb({x:n.pos.x, z:n.pos.y, h:n.heading}, {x:m.pos.x, z:m.pos.y, h:m.heading})){ report.overlaps++; if ((n.y || 0) > 1) cnt.hwyOverlap = (cnt.hwyOverlap || 0) + 1; report.overlapPairs.add(i+'-'+k); (report.locs = report.locs || []).push([+n.pos.x.toFixed(0), +n.pos.y.toFixed(0), +n.heading.toFixed(1), +m.heading.toFixed(1)]); }
      }
    }
  }
  if (report.stuckMax > 30){
    const sn = npcs[report.stuckId];
    report.dump = npcs.map((m,i)=>({i, x:+m.pos.x.toFixed(1), z:+m.pos.y.toFixed(1), h:+m.heading.toFixed(2), sp:+Math.hypot(m.body.velocity.x,m.body.velocity.z).toFixed(2), blk:m.blocked, sp2:m.stopPass, hold:m.stopHold, wp:m.wp}))
      .filter(m => Math.hypot(m.x-sn.pos.x, m.z-sn.pos.y) < 20);
  }
  report.cnt = cnt;
  report.hwyRun = { nakładaniaNaAutostradzie: cnt.hwyOverlap || 0, przejazdyPętli: cnt.loopPass || 0, przejazdyŁącznic: cnt.connPass || 0, wjazdyZPrzekątnych: cnt.hwyEnter || 0, maksKmh: +(cnt.hwyMax*3.6).toFixed(0), poniżejPomostu: cnt.underDeck || 0 };
  report.npcCount = npcs.length;
  report.whyStuck = report.stuckMax > 30 ? npcs.filter(m => m.speed < 0.3).map(m => m.id + ':' + m.why).slice(0, 12) : [];
  report.peds = Pedestrians.list.length; report.crossings = Pedestrians.crossings || 0; report.pedCw = pedCrosswalks.length;
  report.signs = signLog.length;
  report.signsInBuildings = signLog.filter(g => buildings.some(b => Math.abs(g.x-b.x) < b.w/2+0.3 && Math.abs(g.z-b.z) < b.d/2+0.3)).map(g => g.kind+'@'+g.x.toFixed(0)+','+g.z.toFixed(0));
  report.overlapPairs = Array.from(report.overlapPairs);
  return report;
}`;
const ctx = vm.createContext(base);
new vm.Script(code, {filename:'game-sim.js'}).runInContext(ctx);
const secs = parseInt(process.argv[2] || '600', 10);
const st = base.__static();
console.log('--- kontrole statyczne ---');
console.log('Normalne (poziome ściany patrzące w górę/w dół):', JSON.stringify(st.normals));
console.log('Problemy ze znakami (poza jezdnią, przodem, po prawej):', st.signProblems.length, st.signProblems.slice(0,8));
console.log('Ronda (trasy NPC):', JSON.stringify(st.roundabout));
console.log('Znaki wg rodzaju:', JSON.stringify(st.signKinds));
console.log('Elementy poza murem:', st.outsideWall.length, st.outsideWall.slice(0,5));
console.log('Świat:', JSON.stringify(st.world));
console.log('Autostrady (statycznie):', JSON.stringify(st.hwy));
console.log('Teren węzła:', JSON.stringify(st.terrain));
console.log('Znaki (kontrola):', JSON.stringify(st.signChecks));
const r = base.__sim(secs);
console.log('Symulacja', secs, 's gry,', r.npcCount, 'aut NPC (miasto + trasy przez autostrady)');
console.log('Najdłuższy postój jednego auta (v<0.3):', r.stuckMax.toFixed(1), 's', r.stuckAt ? '(auto #'+r.stuckId+' przy '+r.stuckAt+')' : '');
console.log('Klatki z nakładaniem się nadwozi aut miejskich (test SAT):', r.overlaps, r.overlapPairs.slice(0,8));
if (r.dump) console.log('ZAKLESZCZENIE — auta w pobliżu:', JSON.stringify(r.dump), '| przyczyny postoju (id:why):', r.whyStuck.join(' '));
if (r.locs) console.log('miejsca nakładania (x,z,h1,h2):', JSON.stringify(r.locs.slice(0,14)));
console.log('Aktywacje reguł (klatki z hamowaniem): światła', r.cnt.red, '| STOP', r.cnt.stop, '| ustępowanie na rondach', r.cnt.yield, '| w 2. połowie: światła', r.cnt.red2, 'STOP', r.cnt.stop2);
console.log('Ronda: klatki z nadwoziem na wyspie:', r.cnt.rbNear, '| jazda pod prąd po pasie okrężnym:', r.cnt.rbWrong, '| przejazdy przez ronda:', r.cnt.rbPass);
console.log('Piesi:', r.peds, 'przejść przez jezdnię:', r.crossings, '| przejścia używane przez pieszych:', r.pedCw, '| najdłuższe czekanie:', r.cnt.pedWaitMax.toFixed(1), 's | najbliżej auta NPC (pieszy na jezdni):', r.cnt.pedMinD.toFixed(2), 'm | klatki < 2.2 m (środek–środek):', r.cnt.pedHit);
console.log('Przepisy: klatki z przekroczeniem limitu >10%:', r.cnt.overLimit, '| maks. w strefie 30:', (r.cnt.v30*3.6).toFixed(0), 'km/h | maks. w mieście (50):', (r.cnt.v50*3.6).toFixed(0), 'km/h | maks. na autostradzie:', (r.cnt.hwyMax*3.6).toFixed(0), 'km/h | jazda pod prąd po jednokierunkowej:', r.cnt.wrongWay);
console.log('Postawionych znaków/sygnalizatorów:', r.signs, '| stojących w budynku:', r.signsInBuildings.length, r.signsInBuildings.slice(0,6));
console.log('Autostrady (ruch):', JSON.stringify(r.hwyRun));
