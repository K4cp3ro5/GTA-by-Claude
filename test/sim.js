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
class Quat { constructor(){this.x=0;this.y=0;this.z=0;this.w=1;} setFromAxisAngle(){return this;} copy(){return this;} vmult(a,b){ return b||a; } }
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

const order = fs.readFileSync(__dirname+'/../loadorder.txt','utf8').trim().split('\n').map(s=>s.trim());
let code = order.map(f => fs.readFileSync(__dirname+'/../js/'+f,'utf8')).join('\n');
code += `
function __static(){
  const out = {};
  /* normalne: poziome trójkąty muszą patrzeć W GÓRĘ (inaczej z góry niewidoczne) */
  const down = {};
  [['roadBuf',roadBuf],['crossBuf',crossBuf],['crosswalkBuf',crosswalkBuf],['roundaboutPaintBuf',roundaboutPaintBuf],['hwyBuf',hwyBuf],['hwyRampBuf',hwyRampBuf],['yardBuf',yardBuf],['yardPaintBuf',yardPaintBuf],['walkBuf',walkBuf]].forEach(([nm,b]) => {
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
  out.signProblems = bad;
  /* ronda: kierunek okrążania (matematyczny kąt z mapy: wschód=+x, północ=-z) musi rosnąć = przeciwnie do wskazówek */
  const rb = roundaboutCars[0], a0 = rb.a;
  const pos = a => [rb.cx + Math.sin(a)*rb.r, rb.cz + Math.cos(a)*rb.r];
  const th = a => Math.atan2(-(pos(a)[1] - rb.cz), pos(a)[0] - rb.cx);
  let dth = th(a0 + 0.01) - th(a0); if (dth > Math.PI) dth -= TAU; if (dth < -Math.PI) dth += TAU;
  const p1 = pos(a0), p2 = pos(a0 + 0.01), hd = rb.a + Math.PI/2;
  const dot = ((p2[0]-p1[0])*Math.sin(hd) + (p2[1]-p1[1])*Math.cos(hd)) / Math.hypot(p2[0]-p1[0], p2[1]-p1[1]);
  out.roundabout = { ccwFromAbove: dth > 0, headingAlongMotion: +dot.toFixed(3) };
  /* wszystko wewnątrz jednego muru */
  const outside = [];
  mapExtras.forEach(e => {
    const xs = e.t === 'rect' ? [e.x0, e.x1] : e.t === 'disc' ? [e.x - e.r, e.x + e.r] : e.pts.map(q => q[0]);
    const zs = e.t === 'rect' ? [e.z0, e.z1] : e.t === 'disc' ? [e.z - e.r, e.z + e.r] : e.pts.map(q => q[1]);
    if (Math.min(...xs) < -WALL_X || Math.max(...xs) > WORLD_X1 || Math.min(...zs) < -WALL_X || Math.max(...zs) > WALL_X) outside.push(JSON.stringify(e).slice(0,80));
  });
  signLog.forEach(g => { if (g.x < -WALL_X || g.x > WORLD_X1 || Math.abs(g.z) > WALL_X) outside.push(g.kind+'@'+g.x.toFixed(0)+','+g.z.toFixed(0)); });
  out.outsideWall = outside;
  out.world = { x0: -WALL_X, x1: WORLD_X1, hwyZ: [HWY_Z0, HWY_Z1], hwy: [HWY_A_OUT, HWY_B_OUT], bridgeZ: HWY_BR.zc, ic: HWY_IC_Z };
  return out;
}
function __sim(seconds){
  const dt = 0.05, steps = Math.floor(seconds/dt);
  chassisBody.position.set(9999, 0.6, 9999);       // auto gracza poza trasami
  player.body.position.set(-9999, 1, -9999);
  const cnt = { red:0, stop:0, yield:0, rbNear:0 };
  const _r = redLightAhead, _s = stopSignAhead, _y = roundaboutYield;
  redLightAhead = (...a) => { const v = _r(...a); if (v) cnt.red++; return v; };
  stopSignAhead = (...a) => { const v = _s(...a); if (v) cnt.stop++; return v; };
  roundaboutYield = (...a) => { const v = _y(...a); if (v) cnt.yield++; return v; };
  const hw = { steps:0, vMin:1e9, vMax:0, vSum:0, vN:0, lanes:0, overlaps:0, minGap:1e9, prevT:new Map(), wrongSide:0, laneCrossBad:0 };
  const stuck = new Map(), report = { stuckMax:0, stuckIds:[], overlaps:0, overlapPairs:new Set(), minSpeedSamples:0 };
  for (let s = 0; s < steps; s++){
    updateTrafficLights(dt); updateNpcs(dt); updateRoundaboutTraffic(dt); updateHighwayTraffic(dt);
    for (let i = 0; i < hwyTraffic.length; i++){
      const c = hwyTraffic[i];
      hw.vMin = Math.min(hw.vMin, c.v); hw.vMax = Math.max(hw.vMax, c.v); hw.vSum += c.v; hw.vN++;
      if (hw.prevT.has(c) && hw.prevT.get(c) !== c.tlane) hw.lanes++;
      hw.prevT.set(c, c.tlane);
      if ((c.side === 'A') !== (c.x < HWY_X) || (c.dir > 0) !== (c.side === 'A')) hw.wrongSide++;
      if (Math.abs(c.z) > WALL_X - 0.5 || c.x < HWY_A_OUT || c.x > HWY_B_OUT) hw.laneCrossBad++;
      for (let k = i + 1; k < hwyTraffic.length; k++){
        const o = hwyTraffic[k];
        if (o.side !== c.side) continue;
        let dz = Math.abs(o.z - c.z); dz = Math.min(dz, HWY_LOOP - dz);
        const dx = Math.abs(o.x - c.x);
        if (dx < 2.0){ hw.minGap = Math.min(hw.minGap, dz); if (dz < 4.2) hw.overlaps++; }
      }
    }
    for (const n of npcs){ n.body.position.x += n.body.velocity.x*dt; n.body.position.z += n.body.velocity.z*dt; }
    for (let i = 0; i < npcs.length; i++){
      const n = npcs[i];
      const sp = Math.hypot(n.body.velocity.x, n.body.velocity.z);
      const st = (stuck.get(i)||0);
      stuck.set(i, sp < 0.3 ? st + dt : 0);
      if (stuck.get(i) > report.stuckMax){ report.stuckMax = stuck.get(i); report.stuckId = i; report.stuckAt = [n.pos.x.toFixed(0), n.pos.y.toFixed(0)]; }
      for (const c of roundaboutCars){
        const wx = c.cx + Math.sin(c.a)*c.r, wz = c.cz + Math.cos(c.a)*c.r;
        if (Math.hypot(n.pos.x-wx, n.pos.y-wz) < 1.6) cnt.rbNear++;
      }
      for (let k = i+1; k < npcs.length; k++){
        const m = npcs[k];
        if (Math.hypot(n.pos.x-m.pos.x, n.pos.y-m.pos.y) < 1.3){ report.overlaps++; report.overlapPairs.add(i+'-'+k); (report.locs = report.locs || []).push([+n.pos.x.toFixed(0), +n.pos.y.toFixed(0), +n.heading.toFixed(1), +m.heading.toFixed(1)]); }
      }
    }
  }
  if (report.stuckMax > 30){
    const sn = npcs[report.stuckId];
    report.dump = npcs.map((m,i)=>({i, x:+m.pos.x.toFixed(1), z:+m.pos.y.toFixed(1), h:+m.heading.toFixed(2), sp:+Math.hypot(m.body.velocity.x,m.body.velocity.z).toFixed(2), blk:m.blocked, sp2:m.stopPass, hold:m.stopHold, wp:m.wp}))
      .filter(m => Math.hypot(m.x-sn.pos.x, m.z-sn.pos.y) < 20);
  }
  report.cnt = cnt;
  report.npcCount = npcs.length;
  report.signs = signLog.length;
  report.signsInBuildings = signLog.filter(g => buildings.some(b => Math.abs(g.x-b.x) < b.w/2+0.3 && Math.abs(g.z-b.z) < b.d/2+0.3)).map(g => g.kind+'@'+g.x.toFixed(0)+','+g.z.toFixed(0));
  report.overlapPairs = Array.from(report.overlapPairs);
  report.hw = hw;
  report.hwyDirsOk = hwyTraffic.every(c => (c.dir > 0) === (c.x < HWY_X) );    // ruch prawostronny: zachodnia jezdnia (A) jedzie na +Z
  return report;
}`;
const ctx = vm.createContext(base);
new vm.Script(code, {filename:'game-sim.js'}).runInContext(ctx);
const secs = parseInt(process.argv[2] || '600', 10);
const st = base.__static();
console.log('--- kontrole statyczne ---');
console.log('Normalne (poziome ściany patrzące w górę/w dół):', JSON.stringify(st.normals));
console.log('Problemy ze znakami (poza jezdnią, przodem, po prawej):', st.signProblems.length, st.signProblems.slice(0,8));
console.log('Rondo:', JSON.stringify(st.roundabout));
console.log('Elementy poza murem:', st.outsideWall.length, st.outsideWall.slice(0,5));
console.log('Świat:', JSON.stringify(st.world));
const r = base.__sim(secs);
console.log('Symulacja', secs, 's gry,', r.npcCount, 'aut NPC miejskich');
console.log('Najdłuższy postój jednego auta (v<0.3):', r.stuckMax.toFixed(1), 's', r.stuckAt ? '(auto #'+r.stuckId+' przy '+r.stuckAt+')' : '');
console.log('Zdarzenia nakładania się aut (<1.3 u):', r.overlaps, r.overlapPairs.slice(0,8));
if (r.dump) console.log('ZAKLESZCZENIE — auta w pobliżu:', JSON.stringify(r.dump));
if (r.locs) console.log('miejsca nakładania (x,z,h1,h2):', JSON.stringify(r.locs.slice(0,14)));
console.log('Aktywacje reguł (klatki z hamowaniem): światła', r.cnt.red, '| STOP', r.cnt.stop, '| ustępowanie na rondach', r.cnt.yield);
console.log('Auta miejskie blisko aut krążących na rondach (<1.6 u):', r.cnt.rbNear);
console.log('Postawionych znaków/sygnalizatorów:', r.signs, '| stojących w budynku:', r.signsInBuildings.length, r.signsInBuildings.slice(0,6));
console.log('Autostrada — kierunki zgodne z pasem:', r.hwyDirsOk);
const h = r.hw;
console.log('Autostrada: prędkości', (h.vMin*3.6).toFixed(0)+'–'+(h.vMax*3.6).toFixed(0), 'km/h, średnia', (h.vSum/h.vN*3.6).toFixed(0), 'km/h | zmian pasa:', h.lanes,
  '| najmniejszy odstęp w pasie:', h.minGap.toFixed(1), 'm | nakładania:', h.overlaps, '| zła strona/kierunek:', h.wrongSide, '| poza jezdnią/murem:', h.laneCrossBad);
