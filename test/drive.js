"use strict";
/* Test jazdy: prawdziwy cannon.js + prawdziwe auto gry (RaycastVehicle, ta sama konfiguracja)
   na prawdziwej geometrii kolizji miasta/autostrady; Three.js = atrapy (tylko wizualia). */
const fs = require('fs'), vm = require('vm');
let CANNON;
try { CANNON = require('cannon'); } catch(e){ CANNON = require('/tmp/package/build/cannon.js'); }   // npm i cannon@0.6.2 (ta sama wersja co w grze)
function makeStub(name){
  const skip = ['length','name','prototype','caller','arguments'];
  return new Proxy(function Stub(){}, {
    get(t,p){ if (p===Symbol.toPrimitive) return h=>h==='number'?0:''; if (p==='valueOf') return ()=>0; if (p==='toString') return ()=>'';
      if (p===Symbol.iterator||p==='then') return undefined; if (skip.indexOf(p)===-1 && p in t) return t[p]; return makeStub(name+'.'+String(p)); },
    set(){return true;}, apply(){return makeStub(name+'()');}, construct(){return makeStub('new');}, has(){return true;} });
}
const THREE = makeStub('THREE');
const base = { THREE, CANNON, document: makeStub('document'), navigator: makeStub('navigator'),
  localStorage:{getItem(){return null;},setItem(){}}, performance:{now:()=>Date.now()},
  requestAnimationFrame(){return 1;}, cancelAnimationFrame(){}, addEventListener(){}, removeEventListener(){},
  innerWidth:1280, innerHeight:800, devicePixelRatio:1, console, Math, Object, Array, JSON, Date, String, Number, Boolean,
  Symbol, Map, Set, WeakMap, Proxy, Reflect, setTimeout, clearTimeout, isNaN, parseInt, parseFloat };
base.window = base; base.globalThis = base; base.self = base;
const order = fs.readFileSync(__dirname+'/../loadorder.txt','utf8').trim().split('\n').map(s=>s.trim());
let code = order.map(f => fs.readFileSync(__dirname+'/../js/'+f,'utf8')).join('\n');
code += `
function __run(x0, z0, heading, secs, stopFn, maxKmh, y0){
  npcs.slice().forEach(removeNpcCar);
  Pedestrians.list.slice().forEach(removePed);
  delBody(player.body);
  chassisBody.position.set(x0, (y0 || 0) + 0.9, z0);
  chassisBody.velocity.set(0,0,0); chassisBody.angularVelocity.set(0,0,0);
  chassisBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), heading + Math.PI);
  const out = { maxY:0, minY:9, flipped:false, tr:[] };
  for (let t = 0; t < secs*60; t++){
    const v = chassisBody.velocity, kmh = Math.hypot(v.x, v.z)*3.6;
    const f = kmh < maxKmh ? 4200 : 0;
    for (let i = 0; i < 4; i++){ vehicle.applyEngineForce(i >= 2 ? f : 0, i); vehicle.setBrake(0, i); }
    vehicle.setSteeringValue(0,0); vehicle.setSteeringValue(0,1);
    world.step(1/60);
    const p = chassisBody.position;
    out.maxY = Math.max(out.maxY, p.y); out.minY = Math.min(out.minY, p.y);
    const up = new CANNON.Vec3(0,1,0); const u = new CANNON.Vec3(); chassisBody.quaternion.vmult(up, u);
    if (u.y < 0.3) out.flipped = true;
    if (t % 120 === 0) out.tr.push([+p.x.toFixed(0), +p.y.toFixed(2), +p.z.toFixed(0), Math.round(kmh)]);
    if (stopFn(p)) { out.stopped = t/60; break; }
  }
  const p = chassisBody.position; out.end = [+p.x.toFixed(1), +p.y.toFixed(2), +p.z.toFixed(1)];
  return out;
}
/* autopilot "pure pursuit" po łamanej wps (szuka punktu w odległości lookahead przed autem) */
function __follow(x0, z0, heading, wps, secs, kmhMax, doneFn, look, y0){
  look = look || [6, 0.35];                              // punkt celowania: look[0] + look[1]*v metrów przed autem
  npcs.slice().forEach(removeNpcCar);
  Pedestrians.list.slice().forEach(removePed);
  delBody(player.body);
  chassisBody.position.set(x0, (y0 || 0) + 0.9, z0);
  chassisBody.velocity.set(0,0,0); chassisBody.angularVelocity.set(0,0,0);
  chassisBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), heading + Math.PI);
  const out = { maxDev:0, minY:9, maxY:0, flipped:false, tr:[] };
  let idx = 0;
  const path = [[x0, z0]].concat(wps);                   // trasa łącznie z punktem startu (do pomiaru odchylenia)
  const distSeg = (p, a, b) => {
    const vx = b[0]-a[0], vz = b[1]-a[1], l2 = vx*vx + vz*vz || 1;
    const t = Math.max(0, Math.min(1, ((p.x-a[0])*vx + (p.z-a[1])*vz)/l2));
    return Math.hypot(p.x - (a[0]+vx*t), p.z - (a[1]+vz*t));
  };
  for (let t = 0; t < secs*60; t++){
    const p = chassisBody.position, v = chassisBody.velocity, sp = Math.hypot(v.x, v.z), kmh = sp*3.6;
    while (idx < wps.length - 1 && Math.hypot(wps[idx][0]-p.x, wps[idx][1]-p.z) < look[0] + sp*look[1]) idx++;
    const tg = wps[idx];
    const fw = new CANNON.Vec3(); chassisBody.quaternion.vmult(new CANNON.Vec3(0,0,-1), fw);
    const tx = tg[0]-p.x, tz = tg[1]-p.z, tl = Math.hypot(tx, tz) || 1;
    const err = (tx*fw.z - tz*fw.x)/tl;                 // >0: cel po lewej (lewa = (fw.z, -fw.x))
    const lim = 0.45/(1 + sp/18);
    const st = Math.max(-lim, Math.min(lim, err*1.4));
    vehicle.setSteeringValue(st,0); vehicle.setSteeringValue(st,1);
    const f = (kmh < kmhMax ? 4200 : 0) * chassisBody.mass / 1250;   // siła wg masy (rower)
    for (let i = 0; i < 4; i++){ vehicle.applyEngineForce(i >= 2 ? f : 0, i); vehicle.setBrake(0, i); }
    world.step(1/60);
    let dev = 1e9; for (let k = 0; k < path.length-1; k++) dev = Math.min(dev, distSeg(p, path[k], path[k+1]));   // odległość do całej trasy (cross-track)
    out.maxDev = Math.max(out.maxDev, dev); out.minY = Math.min(out.minY, p.y); out.maxY = Math.max(out.maxY, p.y);
    const u = new CANNON.Vec3(); chassisBody.quaternion.vmult(new CANNON.Vec3(0,1,0), u); if (u.y < 0.3) out.flipped = true;
    if (t % 120 === 0) out.tr.push([+p.x.toFixed(0), +p.y.toFixed(1), +p.z.toFixed(0), Math.round(kmh)]);
    if (doneFn(p)){ out.done = +(t/60).toFixed(1); break; }
  }
  const p = chassisBody.position; out.end = [+p.x.toFixed(1), +p.y.toFixed(2), +p.z.toFixed(1)];
  return out;
}
/* osiągi typu auta na prawdziwym sterowaniu gry (updateCar: napęd, opór, hamulec wg car-types.js):
   0–100 km/h i v maks. na prostej A1+ (790 m), droga hamowania 100 -> 0 */
function __perf(type){
  npcs.slice().forEach(removeNpcCar); Pedestrians.list.slice().forEach(removePed); delBody(player.body);
  applyCarType(type, 0x888888); mode = 'car';
  const w = CW['A1+'], p0 = wayAt(w, 5), T = CAR_TYPES[type];
  const place = (d, v) => { const q = wayAt(w, d), o = HP.laneR; chassisBody.position.set(q.x - q.hz * o, q.y + T.restY + 0.05, q.z + q.hx * o);
    chassisBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), Math.atan2(q.hx, q.hz) + Math.PI); chassisBody.velocity.set(q.hx * v, 0, q.hz * v); chassisBody.angularVelocity.set(0,0,0); };
  const out = { t100: null, vmax: 0, brake: null, flipped: false };
  place(5, 0);
  for (let i = 0; i < 30; i++){ updateCar(1/60); world.step(1/60); }                   // osiadanie
  keys[BIND.forward] = true;
  let t = 0, x0 = chassisBody.position.x;
  for (; t < 60 * 60; t++){
    updateCar(1/60); world.step(1/60);
    const v = chassisBody.velocity, kmh = Math.hypot(v.x, v.z) * 3.6; out.vmax = Math.max(out.vmax, kmh);
    if (out.t100 === null && kmh >= (T.bike ? 20 : 100)) out.t100 = +(t / 60).toFixed(2);
    const q = new CANNON.Vec3(); chassisBody.quaternion.vmult(new CANNON.Vec3(0,1,0), q); if (q.y < 0.3) out.flipped = true;
    if (Math.hypot(chassisBody.position.x - p0.x, chassisBody.position.z - p0.z) > 780) break;
  }
  keys[BIND.forward] = false;
  place(60, (T.bike ? 25 : 100) / 3.6);
  for (let i = 0; i < 6; i++){ world.step(1/60); }
  const b0 = chassisBody.position.clone(); keys[BIND.back] = true;
  for (let i = 0; i < 60 * 15; i++){ updateCar(1/60); world.step(1/60); const v = chassisBody.velocity; if (Math.hypot(v.x, v.z) < 0.3){ out.brake = +Math.hypot(chassisBody.position.x - b0.x, chassisBody.position.z - b0.z).toFixed(1); break; } }
  keys[BIND.back] = false; mode = 'foot';
  out.vmax = Math.round(out.vmax); out.restY = +T.restY.toFixed(2); out.name = T.name;
  return out;
}
function __rbCenter(i){ return [L(ROUNDABOUT_PTS[i][0]), L(ROUNDABOUT_PTS[i][1])]; }
function __rbRoute(i, a, b){ return roundaboutRoute(i, a, b).map(p => [p.x, p.z]); }
function __lane(nm, lane){ const w = CW[nm]; return wayLane(w, 0, w.len, () => lane ? HP.laneL : HP.laneR, 6).map(p => [p.x, p.z, p.y]); }
function __trip(a, b){ return hwyTripPoints(a, b, 0).map(p => [p.x, p.z, p.y]); }
function __ramp(cw, kind){ return HWY_RAMPS.find(r => r.from === cw && r.kind === kind).to; }
function __term(k, which){ return termPoints(HWY_TERM[k][which]).map(p => [p.x, p.z, p.y]); }
function __hwyPt(id, s, off){ return hwyPt(id, s, off); }
function __consts(){ return { wall: WALL_X, rbApron: RB.apron,
  /* drzewo na chodniku, do którego da się podjechać 16 m od +Z bez innych przeszkód po drodze */
  tree: (() => { const free = t => ![signGeomLog, lampSpots, binSpots, hydSpots, HWY_PIERS].some(l => l.some(o => Math.abs(o.x - t.x) < 2.2 && o.z > t.z + 0.5 && o.z < t.z + 17)) && !treeSpots.some(o => o !== t && Math.abs(o.x - t.x) < 2.2 && o.z > t.z + 0.5 && o.z < t.z + 17) && !buildings.some(b => Math.abs(b.x - t.x) < b.w/2 + 1.2 && b.z - b.d/2 < t.z + 17 && b.z + b.d/2 > t.z);
    const s = treeSpots.find(q => q.y === undefined && Math.abs(q.z) < 200 && free(q)); return s ? [s.x, s.z] : null; })(),
  /* tor do muru północnego: x bez drzew pasa podmiejskiego i bez dróg */
  wallX: (() => { for (let x = 3.5; x < 250; x += 7) if (!treeSpots.some(t => Math.abs(t.x - x) < 2.5 && t.z < -CITY_EDGE) && !hwyQuery(x, -330, 3).length) return x; return 3.5; })(),
  /* słupek znaku STOP; start z chodnika 7 m przed nim, wzdłuż ulicy (od strony nadjeżdżających — tam jest front znaku) */
  sign: (() => {
    const clear = g => { const f = [Math.sin(g.rot), Math.cos(g.rot)];
      return ![signGeomLog, lampSpots, treeSpots, binSpots, hydSpots].some(l => l.some(o => { const rx = o.x - g.x, rz = o.z - g.z, al = rx*f[0] + rz*f[1], la = Math.abs(rx*f[1] - rz*f[0]); return al > 0.3 && al < 8 && la < 1.8; })); };
    const g = signLog.find(q => q.kind === 'STOP' && clear(q)); return g ? [g.x, g.z, Math.sin(g.rot), Math.cos(g.rot)] : null; })() }; }
`;
const ctx = vm.createContext(base);
new vm.Script(code,{filename:'game-drive.js'}).runInContext(ctx);

const K = base.__consts(); const CITY_EDGE_T = 271;
const rep = (name, r, extra) => console.log(name, '|', 'czas:', r.done !== undefined ? r.done : (r.stopped !== undefined ? r.stopped : 'NIE DOJECHAŁ'), 's | koniec:', JSON.stringify(r.end), '| min/max y:', r.minY.toFixed(2), '/', r.maxY.toFixed(2), '| przewrócone:', r.flipped, extra || '');
const mode = process.argv[2] || 'all';
let r;
const follow3 = (name, pts, kmh, look) => {
  const st = pts[1], nx = pts[4], hd = Math.atan2(nx[0] - st[0], nx[1] - st[1]), end = pts[pts.length - 2];
  let minY = 1e9, maxY = -1e9;
  const r = base.__follow(st[0], st[1], hd, pts.slice(2).map(p => [p[0], p[1]]), 120, kmh, p => { minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); return Math.hypot(p.x - end[0], p.z - end[1]) < 7; }, look || [8, 0.3], st[2]);
  if (process.env.TRACE) console.log('  ślad', JSON.stringify(r.tr));
  rep(' ' + name + ':', r, '| maks. odchylenie: ' + r.maxDev.toFixed(2) + ' m | y trasy ' + Math.min(...pts.map(p => p[2])).toFixed(1) + '–' + Math.max(...pts.map(p => p[2])).toFixed(1));
};
console.log('=== 1) A1 i A2: cała jezdnia prawym pasem (estakada 7 m, A2 nad węzłem 14 m) ===');
['A1+', 'A1-', 'A2+', 'A2-'].forEach(nm => follow3(nm, base.__lane(nm, 0), 90));
console.log('=== 2) węzeł: wszystkie 8 skrętów (4 pętle w lewo, 4 łącznice w prawo) od początku do końca autostrady ===');
/* (4 przejazdy prosto to test 1) */
['A1+','A1-','A2+','A2-'].forEach(cw => {
  const lp = base.__ramp(cw, 'loop'), cn = base.__ramp(cw, 'conn');
  follow3('pętla ' + cw + ' > ' + lp, base.__trip(cw, lp), 70, [5, 0.2]);
  follow3('łącznica ' + cw + ' > ' + cn, base.__trip(cw, cn), 70, [5, 0.2]);
});
console.log('=== 3) końce: zjazd do miasta i wjazd z miasta we wszystkich 4 narożnikach ===');
['SE','SW','NW','NE'].forEach((nm, k) => { follow3('zjazd ' + nm, base.__term(k, 'exit'), 50, [4, 0.2]); follow3('wjazd ' + nm, base.__term(k, 'entry'), 50, [4, 0.2]); });
console.log('=== 4) ulica pod estakadami i węzłem: aleja j=6 od x=-200 do x=200 ===');
r = base.__run(-200, 3.5, Math.PI / 2, 30, p => p.x > 200, 60);
rep(' pod:', r, '(y ma zostać ~0.5 — bez uderzenia w filar)');
console.log('=== 5) bariera na pomoście: A1+ przy s=-200, prostopadle w barierę zewnętrzną 40 km/h ===');
{ const p = base.__hwyPt('A1', -200, 9.0), q = base.__hwyPt('A1', -200, 30), hd = Math.atan2(q.x - p.x, q.z - p.z);
  r = base.__run(p.x, p.z, hd, 5, () => false, 40, p.y);
  rep(' bariera:', r, '| auto zostało na pomoście: ' + (r.minY > p.y - 1 ? 'tak' : 'NIE') + ' (pomost ' + p.y.toFixed(1) + ')'); }
console.log('=== 6) kolizje: drzewo, słupek znaku, mur przy 150 km/h ===');
const hit = (name, tx, tz, fromDx, fromDz, kmh) => {
  const d = Math.hypot(fromDx, fromDz), ux = -fromDx/d, uz = -fromDz/d;      // kierunek jazdy: na cel
  const hd = Math.atan2(ux, uz);
  const rr = base.__run(tx + fromDx, tz + fromDz, hd, 8, p => false, kmh);
  const pass = (rr.end[0] - tx)*ux + (rr.end[2] - tz)*uz;                     // > 0 = przejechał przez obiekt
  console.log(' ' + name + ': koniec ' + JSON.stringify(rr.end) + ' | za obiektem o ' + pass.toFixed(2) + ' m (ma być < 0) | przewrócone: ' + rr.flipped);
};
if (K.tree) hit('drzewo', K.tree[0], K.tree[1], 0, 16, 40);
if (K.sign){
  const s = K.sign, rr = base.__run(s[0] + s[2]*7, s[1] + s[3]*7, Math.atan2(-s[2], -s[3]), 6, p => false, 25);
  const pass = (rr.end[0] - s[0])*(-s[2]) + (rr.end[2] - s[1])*(-s[3]), d = Math.hypot(rr.end[0] - s[0], rr.end[2] - s[1]);
  console.log(' słupek znaku STOP: koniec ' + JSON.stringify(rr.end) + ' | za słupkiem o ' + pass.toFixed(2) + ' m (ma być < 0) | od słupka ' + d.toFixed(2) + ' m (ok. 2.2 = przód auta oparty o słupek) | przewrócone: ' + rr.flipped);
}
hit('mur północny', K.wallX, -K.wall, 0, K.wall - CITY_EDGE_T - 5, 150);
console.log('=== 8) TYPY AUT: 0–100 km/h, v maks. na prostej A1+ (790 m), droga hamowania 100 -> 0, rondo ===');
['sedan', 'pickup', 'sport', 'bike'].forEach(t => {
  const r = base.__perf(t);
  console.log(' ' + r.name + ':', t === 'bike' ? '0–20 (hamowanie z 25):' : '0–100:', r.t100, 's | v maks.:', r.vmax, 'km/h | hamowanie:', r.brake, 'm | przewrócone:', r.flipped, '| wys. nadwozia w spoczynku', r.restY);
  base.applyCarType(t, 0x888888);
  const c = base.__rbCenter(0), uOut = {x:-1,z:0}, route = base.__rbRoute(0, {x:0,z:1}, uOut), last = route[route.length - 1], tail = [[last[0] - 25, last[1]], [last[0] - 45, last[1]]];
  let minD = 1e9;
  const rr = base.__follow(c[0] + 3.5, c[1] + 45, Math.PI, route.concat(tail), 40, t === 'bike' ? 15 : 25, p => { minD = Math.min(minD, Math.hypot(p.x - c[0], p.z - c[1])); return Math.hypot(p.x - tail[1][0], p.z - tail[1][1]) < 4; }, t === 'pickup' ? [4.2, 0.2] : [3.2, 0.15]);   // dłuższy rozstaw osi: dalszy punkt celowania autopilota
  rep('   rondo w lewo:', rr, '| maks. odchylenie: ' + rr.maxDev.toFixed(2) + ' m | najbliżej środka: ' + minD.toFixed(2) + ' m');
});
base.applyCarType('sedan', 0xb3272b);
console.log('=== 7) RONDO (4,4): auto gracza wjeżdża z południa, objeżdża i zjeżdża — na wprost, w lewo, zawrotka po 3/4 ===');
[['na wprost (płn.)', {x:0,z:-1}], ['w lewo (zach.)', {x:-1,z:0}], ['w prawo (wsch.)', {x:1,z:0}]].forEach(([nm, uOut]) => {
  const c = base.__rbCenter(0), route = base.__rbRoute(0, {x:0,z:1}, uOut);
  const last = route[route.length - 1], tail = [[last[0] + uOut.x*25, last[1] + uOut.z*25], [last[0] + uOut.x*45, last[1] + uOut.z*45]];
  let minD = 1e9;
  const r = base.__follow(c[0] + 3.5, c[1] + 45, Math.PI, route.concat(tail), 40, 25, p => {
    minD = Math.min(minD, Math.hypot(p.x - c[0], p.z - c[1]));
    return Math.hypot(p.x - tail[1][0], p.z - tail[1][1]) < 4;
  }, [3.2, 0.15]);
  rep(' ' + nm + ':', r, '| maks. odchylenie od toru: ' + r.maxDev.toFixed(2) + ' m | najbliżej środka: ' + minD.toFixed(2) + ' m (wyspa+opaska ' + K.rbApron + ', + pół auta 0.96)');
});
