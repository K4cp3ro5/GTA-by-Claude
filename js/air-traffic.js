/* ---------------------------------------------------------------
   14b2. RUCH LOTNICZY NPC — samoloty latające między lotniskami po drugich pasach (NPC_RUNWAYS z airport.js:
   wysepka 09L/27R, lotnisko miejskie 18R/36L). Lot po wyliczonej trasie: rozbieg i oderwanie na pasie,
   wznoszenie na wysokość przelotową, łuk Hermite'a do punktu podejścia 900 m przed progiem pasa docelowego
   (kierunek lądowania — krótsza trasa), ścieżka schodzenia ~4°, wyrównanie, przyziemienie, hamowanie przed końcem
   pasa, postój, zawrót w miejscu i start w przeciwną stronę do drugiego lotniska. Pas zajmuje jeden samolot
   naraz (busy): podchodzący do zajętego pasa odchodzi na drugi krąg (nowy łuk do punktu podejścia).
   Przechył z krzywizny trasy, pochylenie z gradientu wysokości. Ciało kinematyczne jak samolotów na płycie.
   --------------------------------------------------------------- */
const AIR_T = {
  jet:  { vR: 47, vC: 64, vTd: 40, acc: 4.6, dec: 3.7, cruise: 200, climb: 1100 },
  prop: { vR: 26, vC: 40, vTd: 25, acc: 3.6, dec: 3.0, cruise: 160, climb: 800 }
};
const AIR_LIVERIES = [0xd9d4c8, 0x2a6cd8, 0xb3272b, 0x2f8a4c, 0xe0a52c, 0x6b3a8f];
const AIR_FINAL = 900, AIR_GLIDE = 0.075, AIR_TD = 60;
let AIR_COUNT = 3;
const airPlanes = [];
NPC_RUNWAYS.forEach(r => { r.busy = null; r.ux = r.ax === 'x' ? 1 : 0; r.uz = r.ax === 'x' ? 0 : 1; });
const rwPt = (r, u) => ({ x: r.cx + r.ux * u, z: r.cz + r.uz * u });

/* trasa pozioma: tablica punktów co ~5 m (x, z) + długości łuku; Hermite między (A, tA) a (B, tB) */
function airHermite(out, ax, az, tax, taz, bx, bz, tbx, tbz, k){
  const n = Math.max(8, Math.ceil(Math.hypot(bx - ax, bz - az) * 1.6 / 5));
  for (let i = 1; i <= n; i++){
    const t = i / n, t2 = t * t, t3 = t2 * t, h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    out.push([h00 * ax + h10 * k * tax + h01 * bx + h11 * k * tbx, h00 * az + h10 * k * taz + h01 * bz + h11 * k * tbz]);
  }
}
function airLine(out, ax, az, dx, dz, len){ const n = Math.max(1, Math.ceil(len / 5)); for (let i = 1; i <= n; i++) out.push([ax + dx * len * i / n, az + dz * len * i / n]); }
function airPathLen(pts){ let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; }

/* plan lotu z bieżącego stanu (na ziemi: rozbieg z miejsca; w powietrzu: dalej po kursie) na pas r1 */
function airPlan(a, r1, loop){
  const A = a.A, fx = Math.sin(a.heading), fz = Math.cos(a.heading);
  /* kierunek lądowania: ten, który daje krótszą trasę */
  let best = null;
  for (const sg of [1, -1]){
    const dx = r1.ux * sg, dz = r1.uz * sg, th = rwPt(r1, -sg * r1.half), F = { x: th.x - dx * AIR_FINAL, z: th.z - dz * AIR_FINAL };
    const pts = [[a.pos.x, a.pos.z]];
    const pre = a.onGround ? A.vR * A.vR / (2 * A.acc) + 450 : 250;
    airLine(pts, a.pos.x, a.pos.z, fx, fz, pre);
    const c = pts[pts.length - 1], k = clamp(Math.hypot(F.x - c[0], F.z - c[1]) * (loop ? 1.7 : 1.0), 450, 1900);
    airHermite(pts, c[0], c[1], fx, fz, F.x, F.z, dx, dz, k);
    const sF = airPathLen(pts);
    airLine(pts, F.x, F.z, dx, dz, AIR_FINAL + AIR_TD + A.vTd * A.vTd / (2 * A.dec));
    const L = airPathLen(pts);
    if (!best || L < best.L) best = { pts: pts, L: L, sF: sF, dx: dx, dz: dz };
  }
  const P = best.pts, S = [0];
  for (let i = 1; i < P.length; i++) S.push(S[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  a.path = P; a.S = S; a.s = 0; a.seg = 0; a.r1 = r1; a.loop = !!loop;
  a.sLift = a.onGround ? A.vR * A.vR / (2 * A.acc) : -1;
  a.sF = best.sF; a.sTd = best.sF + AIR_FINAL + AIR_TD; a.sEnd = S[S.length - 1];
  a.y0 = a.onGround ? 0 : a.alt; a.v0 = a.onGround ? 0 : a.v;
  a.state = a.onGround ? 'roll' : 'fly';
}
/* wysokość nad pasem w punkcie s trasy: wznoszenie (od oderwania albo od bieżącej) i ścieżka schodzenia z wyrównaniem */
function airAlt(a, s){
  const A = a.A;
  let up;
  if (a.sLift >= 0) up = s <= a.sLift ? 0 : A.cruise * smooth01((s - a.sLift) / A.climb);
  else up = lerp(a.y0, A.cruise, smooth01(s / 900));
  const d = a.sTd - s, down = d <= 0 ? 0 : d < 80 ? AIR_GLIDE * d * d / 160 : AIR_GLIDE * (d - 40);
  return Math.max(0, Math.min(up, down));
}
function airSpeed(a, s){
  const A = a.A;
  const go = a.sLift >= 0 ? Math.sqrt(2 * A.acc * Math.max(s, 0.4)) : a.v0 + (A.vC - a.v0) * smooth01(s / 600);
  const app = A.vTd + (A.vC - A.vTd) * clamp((a.sTd - s) / 1600, 0, 1);
  const stop = Math.sqrt(Math.max(0, 2 * A.dec * (a.sEnd - s)));
  return Math.max(Math.min(go, A.vC, app, stop), s < a.sEnd - 0.5 ? 1.2 : 0);
}
function airSample(a, s, out){
  const S = a.S, P = a.path;
  while (a.seg < S.length - 2 && S[a.seg + 1] < s) a.seg++;
  const i = a.seg, t = clamp((s - S[i]) / ((S[i + 1] - S[i]) || 1), 0, 1);
  out.x = lerp(P[i][0], P[i + 1][0], t); out.z = lerp(P[i][1], P[i + 1][1], t);
  out.h = Math.atan2(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]);
  return out;
}

function spawnAirPlane(i){
  const kind = i % 3 === 2 ? 'prop' : 'jet', T = PLANE_TYPES[kind], m = buildPlaneModel(kind, AIR_LIVERIES[i % AIR_LIVERIES.length]);
  const b = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: matCar });
  b.addShape(new CANNON.Box(new CANNON.Vec3(T.half[0], T.half[1], T.half[2])));
  b.addShape(new CANNON.Box(new CANNON.Vec3(T.wing[0], T.wing[1], T.wing[2])), new CANNON.Vec3(0, kind === 'jet' ? -0.9 : 0.95, kind === 'jet' ? -1 : 0.85));
  b.collisionFilterGroup = G_PLANE; b.collisionFilterMask = ~G_WORLD; b.isPlane = true;
  addBody(b);
  const r0 = NPC_RUNWAYS[i % NPC_RUNWAYS.length], st = rwPt(r0, -(r0.half - 15));
  const a = { kind: kind, T: T, A: AIR_T[kind], group: m.group, prop: m.prop, body: b, pos: new THREE.Vector3(st.x, T.gear + 0.03, st.z),
    heading: Math.atan2(r0.ux, r0.uz), pitch: 0, bank: 0, alt: 0, v: 0, onGround: true, r0: r0, r1: null, state: 'wait', t: 4 + i * 20, path: null, _p: {} };
  airPlanes.push(a);
  if (!r0.busy) r0.busy = a;                                                       // czeka na progu: pas zajęty
  else {                                                                          // pas zajęty: start w powietrzu, 1.4 km od lotniska
    const th = i * 2.1 + 0.6, r1 = NPC_RUNWAYS[(i + 1) % NPC_RUNWAYS.length];
    a.pos.set(r1.cx + Math.cos(th) * 1400, a.A.cruise, r1.cz + Math.sin(th) * 1400);
    a.heading = Math.atan2(r1.cx - a.pos.x, r1.cz - a.pos.z); a.onGround = false; a.alt = a.A.cruise; a.v = a.A.vC; a.r0 = null;
    airPlan(a, r1);
  }
  airSync(a);
  return a;
}
function removeAirPlane(a){
  if (a.r0 && a.r0.busy === a) a.r0.busy = null;
  if (a.r1 && a.r1.busy === a) a.r1.busy = null;
  delBody(a.body); scene.remove(a.group);
  const i = airPlanes.indexOf(a); if (i >= 0) airPlanes.splice(i, 1);
}
function setAirCount(n){
  AIR_COUNT = n;
  while (airPlanes.length > n) removeAirPlane(airPlanes[airPlanes.length - 1]);
  for (let i = airPlanes.length; i < n; i++) spawnAirPlane(i);
}
function airSync(a){
  a.group.position.copy(a.pos);
  a.group.rotation.set(-a.pitch, a.heading, a.bank, 'YXZ');
  a.body.position.set(a.pos.x, a.pos.y, a.pos.z);
  a.body.quaternion.setFromEuler(-a.pitch, a.heading, a.bank, 'YXZ');
}
/* czy pas wolny dla startu: inny samolot NPC, gracz, auto */
function airRunwayClear(r, a){
  if (r.busy && r.busy !== a) return false;
  const inR = (x, z) => Math.abs((x - r.cx) * r.ux + (z - r.cz) * r.uz) < r.half + 20 && Math.abs((x - r.cx) * r.uz - (z - r.cz) * r.ux) < r.hw + 10;
  const pp = playerWorldPos();
  if (inR(pp.x, pp.z) && (pp.y || 0) < 20) return false;
  return !(curPlane && curPlane.onGround && inR(curPlane.pos.x, curPlane.pos.z));
}
function updateAirTraffic(dt){
  for (const a of airPlanes){
    if (a.prop) a.prop.rotation.z += dt * (a.state === 'wait' ? 10 : 50);
    if (a.state === 'wait' || a.state === 'turn'){
      a.t -= dt;
      if (a.state === 'turn'){                                                    // zawrót w miejscu (~8 s)
        const want = wrapAngle(a.turnTo - a.heading);
        a.heading += clamp(want, -0.4 * dt, 0.4 * dt);
        if (Math.abs(want) < 0.01){ a.heading = a.turnTo; a.state = 'wait'; a.t = rand(3, 6); }
      } else if (a.t <= 0 && airRunwayClear(a.r0, a)){
        a.r0.busy = a; a.onGround = true;
        airPlan(a, NPC_RUNWAYS.find(r => r !== a.r0) || a.r0);
      }
      a.pitch = damp(a.pitch, 0, 4, dt); a.bank = damp(a.bank, 0, 4, dt);
      airSync(a);
      continue;
    }
    /* lot po trasie */
    const v = airSpeed(a, a.s);
    a.v = v; a.s = Math.min(a.sEnd, a.s + v * dt);
    const q = airSample(a, a.s, a._p), h0 = a.heading;
    a.heading = q.h; a.pos.x = q.x; a.pos.z = q.z;
    const alt = airAlt(a, a.s), alt2 = airAlt(a, a.s + 4);
    a.alt = alt; a.onGround = alt < 0.05 && (a.s < (a.sLift >= 0 ? a.sLift : 0) + 1 || a.s >= a.sTd);
    a.pos.y = alt + a.T.gear + 0.03;
    const rate = dt > 0 ? wrapAngle(a.heading - h0) / dt : 0;                    // prędkość zakrętu -> przechył
    a.bank = damp(a.bank, -clamp(Math.atan(v * rate / 9.8), -0.55, 0.55), 2.5, dt);
    a.pitch = damp(a.pitch, Math.atan((alt2 - alt) / 4) + (a.onGround ? 0 : 0.03), 3, dt);
    /* zwolnienie pasu startu po wzniesieniu; rezerwacja pasu docelowego przed podejściem (zajęty: drugi krąg) */
    if (a.r0 && a.r0.busy === a && alt > 25) a.r0.busy = null;
    if (!a.onGround && a.s > a.sF - 700 && a.r1.busy !== a){
      if (!a.r1.busy) a.r1.busy = a;
      else { a.alt = alt; a.v = v; a.onGround = false; airPlan(a, a.r1, true); }
    }
    if (a.s >= a.sEnd - 0.01 && v < 0.05){                                       // koniec dobiegu: postój, zawrót, start z powrotem
      a.r0 = a.r1; a.state = 'turn'; a.turnTo = wrapAngle(a.heading + Math.PI); a.v = 0; a.pitch = 0;
    }
    airSync(a);
    /* zderzenie z samolotem gracza w powietrzu */
    if (mode === 'plane' && curPlane && !curPlane.onGround && !(curPlane.wreckT > 0) && a.pos.distanceTo(curPlane.pos) < a.T.half[2] + curPlane.T.half[2] * 0.6){
      hudToast('Zderzenie w powietrzu!', 2.5); planeCrash(curPlane);
    }
  }
}
setAirCount(AIR_COUNT);
