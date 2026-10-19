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
function __run(x0, z0, heading, secs, stopFn, maxKmh){
  npcs.slice().forEach(removeNpcCar);
  hwyTraffic.forEach(c => delBody(c.body)); hwyTraffic.length = 0;
  roundaboutCars.forEach(c => delBody(c.body)); roundaboutCars.length = 0;
  Pedestrians.list.slice().forEach(removePed);
  delBody(player.body);
  chassisBody.position.set(x0, 0.9, z0);
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
function __follow(x0, z0, heading, wps, secs, kmhMax, doneFn){
  npcs.slice().forEach(removeNpcCar);
  hwyTraffic.forEach(c => delBody(c.body)); hwyTraffic.length = 0;
  roundaboutCars.forEach(c => delBody(c.body)); roundaboutCars.length = 0;
  Pedestrians.list.slice().forEach(removePed);
  delBody(player.body);
  chassisBody.position.set(x0, 0.9, z0);
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
    while (idx < wps.length - 1 && Math.hypot(wps[idx][0]-p.x, wps[idx][1]-p.z) < 6 + sp*0.35) idx++;
    const tg = wps[idx];
    const fw = new CANNON.Vec3(); chassisBody.quaternion.vmult(new CANNON.Vec3(0,0,-1), fw);
    const tx = tg[0]-p.x, tz = tg[1]-p.z, tl = Math.hypot(tx, tz) || 1;
    const err = (tx*fw.z - tz*fw.x)/tl;                 // >0: cel po lewej (lewa = (fw.z, -fw.x))
    const lim = 0.45/(1 + sp/18);
    const st = Math.max(-lim, Math.min(lim, err*1.4));
    vehicle.setSteeringValue(st,0); vehicle.setSteeringValue(st,1);
    const f = kmh < kmhMax ? 4200 : 0;
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
function __bez(R, n){ const a = []; for (let k = 0; k <= n; k++){ const q = bezPt(R, k/n); a.push([q.x, q.z]); } return a; }
function __consts(){ return { laneA0: hwyLaneX('A',0), laneA1: hwyLaneX('A',1), laneB0: hwyLaneX('B',0), laneB1: hwyLaneX('B',1),
  zc: HWY_BR.zc, h: HWY_BR.h, z0: HWY_Z0, z1: HWY_Z1, ic: HWY_IC_Z, x2: HWY2_Z, yard: YARD_X, offs: __bez(HWY_OFF_RAMP, 20), ons: __bez(HWY_ON_RAMP, 20), wall: WALL_X, a0: HWY_A_OUT }; }
`;
const ctx = vm.createContext(base);
new vm.Script(code,{filename:'game-drive.js'}).runInContext(ctx);

const K = base.__consts();
const rep = (name, r, extra) => console.log(name, '|', 'czas:', r.done !== undefined ? r.done : (r.stopped !== undefined ? r.stopped : 'NIE DOJECHAŁ'), 's | koniec:', JSON.stringify(r.end), '| min/max y:', r.minY.toFixed(2), '/', r.maxY.toFixed(2), '| przewrócone:', r.flipped, extra || '');
const mode = process.argv[2] || 'all';
let r;
console.log('=== 1) jezdnia B (na -Z, prawy pas): z=+235 -> z=-262, przez węzeł i estakadę ===');
r = base.__run(K.laneB0, 235, Math.PI, 60, p => p.z < -262, 100);
console.log(' ślad:', JSON.stringify(r.tr)); rep(' B:', r, '(pomost ma dać ok. ' + (K.h + 0.55).toFixed(2) + ' m)');
console.log('=== 2) jezdnia A (na +Z, prawy pas): z=-262 -> z=+235 ===');
r = base.__run(K.laneA0, -262, 0, 60, p => p.z > 235, 100);
console.log(' ślad:', JSON.stringify(r.tr)); rep(' A:', r);
console.log('=== 3) ulica pod estakadą: x=250 -> plac (z=' + K.x2 + ') ===');
r = base.__run(250, K.x2, Math.PI/2, 60, p => p.x > K.yard - 15, 60);
console.log(' ślad:', JSON.stringify(r.tr)); rep(' pod:', r, '(ma być ok. 0.55 — bez uderzenia w filary/płytę)');
console.log('=== 4) ZJAZD: jezdnia A (prawy pas, z=-84) -> łącznica -> skrzyżowanie miasta ===');
r = base.__follow(K.laneA0, -84, 0, [[K.laneA0,-70]].concat(K.offs, [[255,K.ic]]), 60, 60, p => p.x < 266 && Math.abs(p.z - K.ic) < 4);
console.log(' ślad:', JSON.stringify(r.tr)); rep(' zjazd:', r, '| maks. odchylenie od osi: ' + r.maxDev.toFixed(2) + ' m');
console.log('=== 5) WJAZD: skrzyżowanie miasta -> łącznica -> prawy pas jezdni A ===');
r = base.__follow(245, K.ic, Math.PI/2, K.ons.concat([[K.laneA0, K.ic+90],[K.laneA0, K.ic+160]]), 60, 60, p => p.z > K.ic + 120 && Math.abs(p.x - K.laneA0) < 2.5);
console.log(' ślad:', JSON.stringify(r.tr)); rep(' wjazd:', r, '| maks. odchylenie od osi: ' + r.maxDev.toFixed(2) + ' m');
