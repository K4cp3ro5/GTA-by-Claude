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
if (process.env.SEED) base.GAME_SEED = parseInt(process.env.SEED, 10);

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
  /* wszystkie znaki w mieście (poza C-9 na wysepce ronda): na chodniku, nie na jezdni */
  signLog.forEach(g => {
    if (g.kind === 'C-9' || Math.abs(g.x) > WALL_X || Math.abs(g.z) > WALL_X) return;
    if (!['C-12','A-7','STOP','sygnalizator'].includes(g.kind) && (nearAxis(g.x) < ROAD_H - 0.01 || nearAxis(g.z) < ROAD_H - 0.01)) bad.push(g.kind + ' NA JEZDNI ' + g.x.toFixed(1) + ',' + g.z.toFixed(1));
  });
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
    if (Math.min(...xs) < -WALL_X || Math.max(...xs) > WORLD_X1 || Math.min(...zs) < -WALL_X || Math.max(...zs) > WALL_X) outside.push(JSON.stringify(e).slice(0,80));
  });
  signLog.forEach(g => { if (g.x < -WALL_X || g.x > WORLD_X1 || Math.abs(g.z) > WALL_X) outside.push(g.kind+'@'+g.x.toFixed(0)+','+g.z.toFixed(0)); });
  out.outsideWall = outside;
  out.world = { x0: -WALL_X, x1: WORLD_X1, hwyZ: [HWY_Z0, HWY_Z1], hwy: [HWY_A_OUT, HWY_B_OUT], bridgeZ: HWY_BR.zc, ic: HWY_IC_Z };
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
  const cnt = { red:0, stop:0, yield:0, rbNear:0, rbWrong:0, red2:0, stop2:0, rbPass:0, pedWaitMax:0, pedMinD:99, pedHit:0, npcHwy:0, east:0, overLimit:0, v30:0, v50:0, wrongWay:0, hwy100:0 };
  const _r = redLightAhead, _s = stopSignAhead, _y = roundaboutYield;
  let late = false;   // druga połowa symulacji — reguły muszą działać przez cały czas, nie tylko na starcie
  redLightAhead = (...a) => { const v = _r(...a); if (v){ cnt.red++; if (late) cnt.red2++; } return v; };
  stopSignAhead = (...a) => { const v = _s(...a); if (v){ cnt.stop++; if (late) cnt.stop2++; } return v; };
  roundaboutYield = (...a) => { const v = _y(...a); if (v) cnt.yield++; return v; };
  const hw = { steps:0, vMin:1e9, vMax:0, vSum:0, vN:0, lanes:0, overlaps:0, minGap:1e9, prevT:new Map(), wrongSide:0, laneCrossBad:0 };
  const stuck = new Map(), report = { stuckMax:0, stuckIds:[], overlaps:0, overlapPairs:new Set(), minSpeedSamples:0 };
  for (let s = 0; s < steps; s++){
    late = s > steps / 2;
    updateTrafficLights(dt); updateNpcs(dt); updateHighwayTraffic(dt); updatePedestrians(dt);
    for (const p of Pedestrians.list){
      if (p.state === 'wait') cnt.pedWaitMax = Math.max(cnt.pedWaitMax, p.waitT);
      if (!pedOnRoad(p)) continue;
      for (const n of npcs){ const d = Math.hypot(n.pos.x - p.pos.x, n.pos.y - p.pos.y); if (d < cnt.pedMinD) cnt.pedMinD = d; if (d < 2.2) cnt.pedHit++; }
    }
    for (let i = 0; i < hwyTraffic.length; i++){
      const c = hwyTraffic[i];
      hw.vMin = Math.min(hw.vMin, c.v); hw.vMax = Math.max(hw.vMax, c.v); hw.vSum += c.v; hw.vN++;
      if (s > 200 && hwyLimit(c.side, c.z) < 30) cnt.hwy100 = Math.max(cnt.hwy100, c.v);   // po rozruchu (10 s)
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
    /* auta miejskie na łącznicach / w strefie wschodniej vs auta autostradowe (SAT) */
    for (const n of npcs){ if (n.pos.x < 280) continue; if (n.pos.x > 340) cnt.east++;
      for (const c of hwyTraffic){ const hd = (c.dir > 0 ? 0 : Math.PI); if (Math.hypot(n.pos.x - c.x, n.pos.y - c.z) < 4.6 && __obb({x:n.pos.x,z:n.pos.y,h:n.heading},{x:c.x,z:c.z,h:hd})) cnt.npcHwy++; } }
    for (let i = 0; i < npcs.length; i++){
      const n = npcs[i];
      const sp = Math.hypot(n.body.velocity.x, n.body.velocity.z);
      if (n.__rbPrev === 'ring' && n.rbPhase !== 'ring') cnt.rbPass++;
      /* przepisy: limit prędkości strefy (z tolerancją 10%), jednokierunkowe */
      const lim = speedLimitAt(n.pos.x, n.pos.y);
      if (lim && n.speed > lim * 1.1 + 0.3) cnt.overLimit++;
      if (inZone30(n.pos.x, n.pos.y)) cnt.v30 = Math.max(cnt.v30, n.speed);
      else if (lim) cnt.v50 = Math.max(cnt.v50, n.speed);
      if (n.speed > 1 && oneWayWrong(n.pos.x, n.pos.y, n.dirX || 0, n.dirZ || 0)) cnt.wrongWay++;
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
        if (Math.hypot(n.pos.x-m.pos.x, n.pos.y-m.pos.y) < 4.6 && __obb({x:n.pos.x, z:n.pos.y, h:n.heading}, {x:m.pos.x, z:m.pos.y, h:m.heading})){ report.overlaps++; report.overlapPairs.add(i+'-'+k); (report.locs = report.locs || []).push([+n.pos.x.toFixed(0), +n.pos.y.toFixed(0), +n.heading.toFixed(1), +m.heading.toFixed(1)]); }
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
  report.hwyStats = hwyStats;
  report.whyStuck = report.stuckMax > 30 ? npcs.filter(m => m.speed < 0.3).map(m => m.id + ':' + m.why).slice(0, 12) : [];
  report.peds = Pedestrians.list.length; report.crossings = Pedestrians.crossings || 0; report.pedCw = pedCrosswalks.length;
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
console.log('Ronda (trasy NPC):', JSON.stringify(st.roundabout));
console.log('Znaki wg rodzaju:', JSON.stringify(st.signKinds));
console.log('Elementy poza murem:', st.outsideWall.length, st.outsideWall.slice(0,5));
console.log('Świat:', JSON.stringify(st.world));
const r = base.__sim(secs);
console.log('Symulacja', secs, 's gry,', r.npcCount, 'aut NPC miejskich');
console.log('Najdłuższy postój jednego auta (v<0.3):', r.stuckMax.toFixed(1), 's', r.stuckAt ? '(auto #'+r.stuckId+' przy '+r.stuckAt+')' : '');
console.log('Klatki z nakładaniem się nadwozi aut miejskich (test SAT):', r.overlaps, r.overlapPairs.slice(0,8));
if (r.dump) console.log('ZAKLESZCZENIE — auta w pobliżu:', JSON.stringify(r.dump), '| przyczyny postoju (id:why):', r.whyStuck.join(' '));
if (r.locs) console.log('miejsca nakładania (x,z,h1,h2):', JSON.stringify(r.locs.slice(0,14)));
console.log('Aktywacje reguł (klatki z hamowaniem): światła', r.cnt.red, '| STOP', r.cnt.stop, '| ustępowanie na rondach', r.cnt.yield, '| w 2. połowie: światła', r.cnt.red2, 'STOP', r.cnt.stop2);
console.log('Ronda: klatki z nadwoziem na wyspie:', r.cnt.rbNear, '| jazda pod prąd po pasie okrężnym:', r.cnt.rbWrong, '| przejazdy przez ronda:', r.cnt.rbPass);
console.log('Piesi:', r.peds, 'przejść przez jezdnię:', r.crossings, '| przejścia używane przez pieszych:', r.pedCw, '| najdłuższe czekanie:', r.cnt.pedWaitMax.toFixed(1), 's | najbliżej auta NPC (pieszy na jezdni):', r.cnt.pedMinD.toFixed(2), 'm | klatki < 2.2 m (środek–środek):', r.cnt.pedHit);
console.log('Przepisy: klatki z przekroczeniem limitu >10%:', r.cnt.overLimit, '| maks. w strefie 30:', (r.cnt.v30*3.6).toFixed(0), 'km/h | maks. w mieście (50):', (r.cnt.v50*3.6).toFixed(0), 'km/h | maks. na autostradzie w strefie 100:', (r.cnt.hwy100*3.6).toFixed(0), 'km/h | jazda pod prąd po jednokierunkowej:', r.cnt.wrongWay);
console.log('Postawionych znaków/sygnalizatorów:', r.signs, '| stojących w budynku:', r.signsInBuildings.length, r.signsInBuildings.slice(0,6));
console.log('Autostrada — kierunki zgodne z pasem:', r.hwyDirsOk, '| auta miejskie: wjazdy na autostradę', r.hwyStats.merges, 'zjazdy', r.hwyStats.exits, '| nakładania auto miejskie–autostradowe:', r.cnt.npcHwy, '| klatki ruchu w strefie wschodniej:', r.cnt.east);
const h = r.hw;
console.log('Autostrada: prędkości', (h.vMin*3.6).toFixed(0)+'–'+(h.vMax*3.6).toFixed(0), 'km/h, średnia', (h.vSum/h.vN*3.6).toFixed(0), 'km/h | zmian pasa:', h.lanes,
  '| najmniejszy odstęp w pasie:', h.minGap.toFixed(1), 'm | nakładania:', h.overlaps, '| zła strona/kierunek:', h.wrongSide, '| poza jezdnią/murem:', h.laneCrossBad);
