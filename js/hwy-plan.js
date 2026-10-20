/* ---------------------------------------------------------------
   3b. PLAN AUTOSTRAD — czysta geometria (bez Three.js / cannon.js), liczona przed
   generowaniem miasta, bo od niej zależy, gdzie nie wolno stawiać budynków.
   - A1: oś x = z (NW–SE), A2: oś x = −z (SW–NE); parametr s = odległość od środka wzdłuż osi
     (A1: +s na SE, A2: +s na NE). Obie biegną estakadą 7 m nad miastem; A2 w środku
     (|s| < 150) wznosi się do 14 m i przechodzi nad A1.
   - Przekrój: dwie jezdnie (2 pasy 3.5 m + pobocze 2.5 m) po obu stronach pasa rozdziału 4 m;
     oś jezdni 6.75 m od osi autostrady. Jezdnia „+” jedzie w stronę +s, „−” w stronę −s;
     prawa strona kierunku jazdy jezdni „+” to wektor n osi.
   - Węzeł koniczynowy (0,0): w każdej ćwiartce między przekątnymi pętla (skręt w lewo, 270°)
     i łącznica zewnętrzna (skręt w prawo). Pętle i łącznice zbudowane w ćwiartce S i obrócone
     o 90°, 180°, 270°. Pas zbierający (kolektor) przy każdej jezdni w |s| ≤ 44.25 m.
   - Końce: za obwodnicą miasta każda jezdnia skręca łukiem R=60 m w pas podmiejski, schodzi
     na teren i przechodzi w zwykłą drogę jednokierunkową, która dochodzi do ulicy miasta
     (i=2, i=10, j=2, j=10). Projekt dla narożnika SE, pozostałe z obrotu.
   Drogi (ways) to polilinie {x,z,y} z półszerokością hw; z nich highways.js buduje geometrię
   i kolizje, a traffic-npc.js trasy aut.
   --------------------------------------------------------------- */
const SQ2 = Math.SQRT2, IS2 = 1 / SQ2;
const HP = {
  deck: 7.0, top: 14.0, slab: 0.8,                 // niweleta, niweleta A2 nad A1, grubość płyty
  cwOff: 6.75, cwHW: 4.75, medHW: 2.0, half: 11.5, // jezdnia: oś 6.75 m od osi autostrady, szer. 9.5 m
  laneR: 0.5, laneL: -3.0,                         // pasy względem osi jezdni (+ = w prawo od kierunku jazdy)
  rampHW: 2.75, auxOff: 14.25, auxLen: 50,         // łącznice 5.5 m; pas zbierający / rozpędowy przy jezdni
  colS: 44.25,                                     // zasięg kolektora (|s|) = punkty styczności pętli
  loopR: 30, connR: 60, connLine: 104,             // pętla R=30; łącznica: łuki R=60 i prosta 104 m od środka
  termR: 60, beltR: 25,                            // łuk końcowy R=60, łuk drogi w pasie podmiejskim R=25
  sSplit: 280 * SQ2,                               // koniec przekroju autostrady (za obwodnicą miasta)
  vmax: 100 / 3.6
};
HP.connS = 0;   // uzupełniane niżej (s początku łuku łącznicy)
const HWY_AX = {
  A1: { u: { x: IS2, z: IS2 }, n: { x: -IS2, z: IS2 } },
  A2: { u: { x: IS2, z: -IS2 }, n: { x: IS2, z: IS2 } }
};
/* niweleta: A1 płasko 7 m; A2 14 m dla |s| ≤ 20, potem łagodne zejście do 7 m przy |s| = 150
   (pochylenie: trapez 0 → 6.36% → 0, bez załamań) */
function hwyY(id, s){
  if (id === 'A1') return HP.deck;
  const a = Math.abs(s), g = 1 / 110;
  let F;
  if (a <= 20) F = 0;
  else if (a <= 40) F = g * (a - 20) * (a - 20) / 40;
  else if (a <= 130) F = g * 10 + g * (a - 40);
  else if (a <= 150){ const b = a - 130; F = g * 100 + g * (b - b * b / 40); }
  else F = 1;
  return HP.top - (HP.top - HP.deck) * F;
}
function hwyPt(id, s, off){
  const A = HWY_AX[id];
  return { x: A.u.x * s + A.n.x * off, z: A.u.z * s + A.n.z * off, y: hwyY(id, s) };
}
/* obrót o k × 90° wokół środka: (x,z) -> (−z, x) — zachowuje stronę ruchu (prawostronny) */
function rotK(p, k){
  let x = p.x, z = p.z;
  for (let i = 0; i < k; i++){ const t = x; x = -z; z = t; }
  return Object.assign({}, p, { x: x, z: z });
}
/* najbliższa oś autostrady w punkcie: { id, s, off } */
function hwyAxisOf(x, z){
  const o1 = -x * IS2 + z * IS2, o2 = x * IS2 + z * IS2;
  return Math.abs(o1) <= Math.abs(o2) ? { id: 'A1', s: x * IS2 + z * IS2, off: o1 } : { id: 'A2', s: x * IS2 - z * IS2, off: o2 };
}
const smooth01 = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);

/* --- prymitywy polilinii --- */
function plLine(a, b, step){
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step)), out = [];
  for (let i = 0; i <= n; i++) out.push({ x: a.x + (b.x - a.x) * i / n, z: a.z + (b.z - a.z) * i / n });
  return out;
}
function plArc(cx, cz, R, th0, th1, step){           // p = c + R(cos θ, sin θ); rosnące θ = skręt w prawo
  const n = Math.max(2, Math.ceil(Math.abs(th1 - th0) * R / step)), out = [];
  for (let i = 0; i <= n; i++){ const t = th0 + (th1 - th0) * i / n; out.push({ x: cx + Math.cos(t) * R, z: cz + Math.sin(t) * R }); }
  return out;
}
function plJoin(){                                   // sklejenie (bez dublowania punktów styku)
  const out = [];
  for (const part of arguments) part.forEach((p, i) => { if (i === 0 && out.length && Math.hypot(out[out.length-1].x - p.x, out[out.length-1].z - p.z) < 0.05) return; out.push(p); });
  return out;
}
function plMeasure(pts){ let d = 0; pts.forEach((p, i) => { if (i) d += Math.hypot(p.x - pts[i-1].x, p.z - pts[i-1].z); p.d = d; }); return d; }

/* ---------------------------------------------------------------
   DROGI (ways)
   --------------------------------------------------------------- */
const HWY_WAYS = [];
const HWY_GAPS = [];     // przerwy w barierze zewnętrznej jezdni: { cw: 'A1+', s0, s1 }
function addWay(w){
  w.len = plMeasure(w.pts);
  w.pts.forEach(p => { if (p.hw === undefined) p.hw = w.hw; });
  w.idx = HWY_WAYS.length;
  HWY_WAYS.push(w);
  return w;
}
const CW = {};          // jezdnie: 'A1+', 'A1-', 'A2+', 'A2-'
(function mainCarriageways(){
  ['A1', 'A2'].forEach(id => {
    [1, -1].forEach(sg => {
      const pts = [], n = Math.ceil(2 * HP.sSplit / 6);
      for (let i = 0; i <= n; i++){
        const s = sg * (-HP.sSplit + 2 * HP.sSplit * i / n);
        pts.push(Object.assign(hwyPt(id, s, sg * HP.cwOff), { s: s }));
      }
      CW[id + (sg > 0 ? '+' : '-')] = addWay({ name: id + (sg > 0 ? '+' : '-'), kind: 'cw', hid: id, sg: sg, pts: pts, hw: HP.cwHW, tex: 'hwy', barL: false, barR: true });
    });
    const mp = [], n = Math.ceil(2 * HP.sSplit / 6);
    for (let i = 0; i <= n; i++){ const s = -HP.sSplit + 2 * HP.sSplit * i / n; mp.push(Object.assign(hwyPt(id, s, 0), { s: s })); }
    addWay({ name: id + 'M', kind: 'med', hid: id, pts: mp, hw: HP.medHW, tex: 'med', barL: false, barR: false });
  });
})();
/* kolektory: pas 5.5 m przy prawej krawędzi każdej jezdni w |s| ≤ colS (tu pętle zjeżdżają i wjeżdżają) */
(function collectors(){
  ['A1', 'A2'].forEach(id => [1, -1].forEach(sg => {
    const pts = [], n = Math.ceil(2 * HP.colS / 6);
    for (let i = 0; i <= n; i++){ const s = sg * (-HP.colS + 2 * HP.colS * i / n); pts.push(Object.assign(hwyPt(id, s, sg * HP.auxOff), { s: s })); }
    addWay({ name: 'kol ' + id + (sg > 0 ? '+' : '-'), kind: 'col', hid: id, sg: sg, pts: pts, hw: HP.rampHW, tex: 'ramp', barL: false, barR: true });
    HWY_GAPS.push({ cw: id + (sg > 0 ? '+' : '-'), s0: -HP.colS, s1: HP.colS });
  }));
})();
/* pętla w ćwiartce S: z kolektora A1+ (s = +colS) dookoła środka (0, c) w prawo o 270° na kolektor A2+ (s = −colS) */
const HWY_RAMPS = [];    // { way, from: 'A1+', to: 'A2+', kind: 'loop'|'conn', fromS, toS, auxIn, auxOut }
(function loopsAndConnectors(){
  const R = HP.loopR, c = SQ2 * (R + HP.auxOff);
  const loopBase = plArc(0, c, R, -Math.PI / 4, Math.PI * 5 / 4, 2);
  /* łącznica w ćwiartce S: z A2+ (przed skrzyżowaniem) w prawo na A1+ (za skrzyżowaniem):
     pas wyłączenia 50 m wzdłuż A2+, łuk R=60 do kierunku E, prosta z = connLine, łuk R=60, pas włączenia wzdłuż A1+ */
  const Rc = HP.connR, zl = HP.connLine;
  const xe = (HP.auxOff + Rc) * SQ2 - zl - Rc;         // koniec pierwszego łuku na prostej
  const sC = ((xe - Rc * IS2) - (zl + Rc - Rc * IS2)) * IS2;   // s na A2 początku łuku (ujemne)
  HP.connS = -sC;
  const auxIn = []; for (let i = 0; i <= 10; i++){ const s = sC - HP.auxLen + HP.auxLen * i / 10; auxIn.push(hwyPt('A2', s, HP.auxOff)); }
  const auxOut = []; for (let i = 0; i <= 10; i++){ const s = -sC + HP.auxLen * i / 10; auxOut.push(hwyPt('A1', s, HP.auxOff)); }
  const connBase = plJoin(auxIn, plArc(xe, zl + Rc, Rc, Math.PI * 5 / 4, Math.PI * 3 / 2, 2), plLine({ x: xe, z: zl }, { x: -xe, z: zl }, 6),
                          plArc(-xe, zl + Rc, Rc, Math.PI * 3 / 2, Math.PI * 7 / 4, 2), auxOut);
  for (let k = 0; k < 4; k++){
    /* nazwy jezdni po obrocie: obrót o 90° zamienia A1+ -> A2-, A2+ -> A1+, A1- -> A2+, A2- -> A1- */
    const ROT = { 'A1+': 'A2-', 'A2+': 'A1+', 'A1-': 'A2+', 'A2-': 'A1-' };
    const nm = (cw) => { let x = cw; for (let i = 0; i < k; i++) x = ROT[x]; return x; };
    const lp = loopBase.map(p => rotK(p, k));
    const ya = hwyY(nm('A1+').slice(0, 2), HP.colS), yb = hwyY(nm('A2+').slice(0, 2), HP.colS);
    plMeasure(lp);
    lp.forEach(p => { p.y = lerp(ya, yb, smooth01(p.d / lp[lp.length - 1].d)); });
    const loop = addWay({ name: 'pętla ' + nm('A1+') + '>' + nm('A2+'), kind: 'loop', pts: lp, hw: HP.rampHW, tex: 'ramp', barL: true, barR: true, vmax: 50 / 3.6 });
    HWY_RAMPS.push({ way: loop, kind: 'loop', from: nm('A1+'), to: nm('A2+') });
    const cp = connBase.map(p => rotK(p, k));
    cp.forEach(p => { p.y = HP.deck; });
    const conn = addWay({ name: 'łącznica ' + nm('A2+') + '>' + nm('A1+'), kind: 'conn', pts: cp, hw: HP.rampHW, tex: 'ramp', barL: true, barR: true, vmax: 60 / 3.6,
                          auxIn: auxIn.length, auxOut: auxOut.length });
    HWY_RAMPS.push({ way: conn, kind: 'conn', from: nm('A2+'), to: nm('A1+') });
    /* przerwy w barierze jezdni wzdłuż pasów wyłączenia/włączenia: zakres s z obróconych punktów */
    const sOf = pts => pts.map(p => hwyAxisOf(p.x, p.z).s);
    const sIn = sOf(cp.slice(0, auxIn.length)), sOut = sOf(cp.slice(cp.length - auxOut.length));
    HWY_GAPS.push({ cw: nm('A2+'), s0: Math.min(...sIn), s1: Math.max(...sIn) });
    HWY_GAPS.push({ cw: nm('A1+'), s0: Math.min(...sOut), s1: Math.max(...sOut) });
  }
})();
/* --- końce (narożnik SE, potem obrót): wyjazd z A1+ i wjazd na A1− ---
   wyjazd: łuk R=60 w prawo o 135° schodzący z 7 m na teren, prosta na W (zwężenie 2 -> 1 pas),
   łuk R=25 w prawo na N, prosta na N do krawędzi miasta przy ulicy i=10 (pas 3.5 m od osi).
   wjazd: odbicie wyjazdu względem przekątnej x = z, w odwrotnym kierunku (j=10 na E). */
const HWY_TERM = [];     // { k, exit: way, entry: way, exitCw, entryCw }
(function terminals(){
  const P0 = hwyPt('A1', HP.sSplit, HP.cwOff), n1 = HWY_AX.A1.n;
  const C = { x: P0.x + HP.termR * n1.x, z: P0.z + HP.termR * n1.z };
  const arc = plArc(C.x, C.z, HP.termR, -Math.PI / 4, Math.PI / 2, 2);
  const zW = C.z + HP.termR, xT = L(10) + 3.5 + HP.beltR;
  const lineW = plLine({ x: C.x, z: zW }, { x: xT, z: zW }, 4);
  const arc2 = plArc(xT, zW - HP.beltR, HP.beltR, Math.PI / 2, Math.PI, 2);
  const lineN = plLine({ x: L(10) + 3.5, z: zW - HP.beltR }, { x: L(10) + 3.5, z: CITY_EDGE }, 6);
  const base = plJoin(arc.map(p => Object.assign(p, { part: 'arc' })), lineW.map(p => Object.assign(p, { part: 'narrow' })),
                      arc2.map(p => Object.assign(p, { part: 'belt' })), lineN.map(p => Object.assign(p, { part: 'belt' })));
  plMeasure(base);
  const arcLen = (Math.PI * 3 / 4) * HP.termR, nLen = lineW.length ? Math.hypot(lineW[0].x - xT, 0) : 1;
  base.forEach(p => {
    if (p.part === 'arc'){ const t = p.d / arcLen; p.y = HP.deck * (1 - smooth01(t)); p.hw = HP.cwHW; p.lr = HP.laneR; p.ll = HP.laneL; p.vmax = 70 / 3.6; }
    else if (p.part === 'narrow'){ const t = clamp((p.d - arcLen) / nLen, 0, 1); p.y = 0; p.hw = lerp(HP.cwHW, 3.5, t); p.lr = lerp(HP.laneR, 0, t); p.ll = lerp(HP.laneL, 0, t); p.vmax = 50 / 3.6; }
    else { p.y = 0; p.hw = 3.5; p.lr = 0; p.ll = 0; p.vmax = (p.d < arcLen + nLen + HP.beltR * Math.PI / 2 + 2) ? 40 / 3.6 : 50 / 3.6; }
  });
  const mirrorRev = pts => pts.slice().reverse().map(p => Object.assign({}, p, { x: p.z, z: p.x }));
  const CWEXIT  = ['A1+', 'A2-', 'A1-', 'A2+'];       // jezdnia kończąca się w narożniku k (SE, SW, NW, NE)
  const CWENTRY = ['A1-', 'A2+', 'A1+', 'A2-'];       // jezdnia zaczynająca się w narożniku k
  for (let k = 0; k < 4; k++){
    const ex = addWay({ name: 'koniec ' + CWEXIT[k], kind: 'term', pts: base.map(p => rotK(Object.assign({}, p), k)), hw: HP.cwHW, tex: 'term', barL: true, barR: true });
    const en = addWay({ name: 'początek ' + CWENTRY[k], kind: 'term', pts: mirrorRev(base).map(p => rotK(p, k)), hw: HP.cwHW, tex: 'term', barL: true, barR: true });
    HWY_TERM.push({ k: k, exit: ex, entry: en, exitCw: CWEXIT[k], entryCw: CWENTRY[k] });
  }
})();
/* przerwy w barierze zewnętrznej jezdni: segment jezdni w zakresie s którejś przerwy => bez bariery */
function cwBarrierGap(cw, s){ return HWY_GAPS.some(g => g.cw === cw && s > Math.min(g.s0, g.s1) - 0.5 && s < Math.max(g.s0, g.s1) + 0.5); }

/* ---------------------------------------------------------------
   ZAPYTANIA: co jest nad / pod punktem (siatka 8 m z próbkami co 2 m)
   --------------------------------------------------------------- */
const HWY_HASH = new Map(), HWY_CELL = 8;
(function buildHash(){
  HWY_WAYS.forEach(w => {
    for (let i = 0; i < w.pts.length - 1; i++){
      const a = w.pts[i], b = w.pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2));
      for (let k = 0; k < n; k++){
        const t = k / n, p = { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), y: lerp(a.y, b.y, t), hw: lerp(a.hw, b.hw, t), wi: w.idx };
        const key = Math.floor(p.x / HWY_CELL) + ',' + Math.floor(p.z / HWY_CELL);
        let c = HWY_HASH.get(key); if (!c){ c = []; HWY_HASH.set(key, c); } c.push(p);
      }
    }
  });
})();
/* drogi przykrywające punkt (odległość < hw + margin): [{ wi, y }] (po jednym na drogę, najbliższa próbka) */
function hwyQuery(x, z, margin){
  const out = new Map(), r = Math.ceil((12 + margin) / HWY_CELL), cx = Math.floor(x / HWY_CELL), cz = Math.floor(z / HWY_CELL);
  for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++){
    const c = HWY_HASH.get((cx + i) + ',' + (cz + j)); if (!c) continue;
    for (const p of c){
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < p.hw + margin + 1.1){ const o = out.get(p.wi); if (!o || d < o.d) out.set(p.wi, { wi: p.wi, y: p.y, d: d }); }
    }
  }
  return Array.from(out.values());
}
/* czy punkt jest pod/na autostradzie (wys. > 0.3) z zapasem margin */
function hwyCovered(x, z, margin){ return hwyQuery(x, z, margin).some(h => h.y > 0.3); }
/* czy prostokąt (budynek, plac) zahacza o pas autostrady z zapasem margin */
function hwyRectCovered(cx, cz, w, d, margin){
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++){
    if (hwyQuery(cx - w/2 + w * i / 4, cz - d/2 + d * j / 4, margin).length) return true;
  }
  return false;
}
/* jaka część kwartału (bi,bj) leży pod autostradą (0..1) */
function hwyBlockFrac(bi, bj){
  const cx = blockCenter(bi), cz = blockCenter(bj); let n = 0;
  for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) if (hwyQuery(cx - LOT/2 + LOT * (i + 0.5) / 7, cz - LOT/2 + LOT * (j + 0.5) / 7, 1).length) n++;
  return n / 49;
}

/* ---------------------------------------------------------------
   FILARY: autostrady — na środkach kwartałów leżących na osi (co 62.2 m, dwie kolumny);
   łącznice, pętle, końce — co ≥ 22 m tam, gdzie wolno (wnętrze kwartału ≥ 3.5 m od krawędzi
   albo pas podmiejski, nie pod inną drogą i nie na drodze na terenie)
   --------------------------------------------------------------- */
const HWY_PIERS = [];    // { x, z, top, size, wi }
let HWY_MAX_SPAN = 0;
/* kwartał bez pętli pieszych (te same punkty co w city-generation.js) — filar może stać bliżej krawężnika */
const _pedFree = new Map();
function blockPedFree(bi, bj){
  const k = bi + ',' + bj; if (_pedFree.has(k)) return _pedFree.get(k);
  const cx = blockCenter(bi), cz = blockCenter(bj), pi = LOT/2 - 2;
  const v = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]].some(q => hwyQuery(cx + q[0]*pi, cz + q[1]*pi, 1).some(h => h.y > 0.3));
  _pedFree.set(k, v); return v;
}
function pierSpotAllowed(x, z, wi, y){
  const inBelt = Math.abs(x) > CITY_EDGE + 1.5 || Math.abs(z) > CITY_EDGE + 1.5;
  if (!inBelt){
    const bi = Math.floor((x + HALF) / BLOCK), bj = Math.floor((z + HALF) / BLOCK);
    if (bi < 0 || bj < 0 || bi >= GRID || bj >= GRID) return false;
    const rim = blockPedFree(bi, bj) ? 1.0 : 3.5;              // chodnik z pieszymi: 3.5 m od krawędzi wolne
    if (Math.abs(x - blockCenter(bi)) > LOT/2 - rim - 0.8 || Math.abs(z - blockCenter(bj)) > LOT/2 - rim - 0.8) return false;
  }
  /* nie pod/przez inną drogę niżej (ani drogę na terenie) */
  return !hwyQuery(x, z, 1.2).some(h => h.wi !== wi && h.y < y - 1);
}
(function piers(){
  for (let k = 0; k < GRID; k++){
    const bc = blockCenter(k);
    [['A1', bc, bc], ['A2', bc, -bc]].forEach(a => {
      const ax = hwyAxisOf(a[1], a[2]);
      [HP.cwOff, -HP.cwOff].forEach(o => {
        const p = hwyPt(a[0], ax.s, o);
        HWY_PIERS.push({ x: p.x, z: p.z, top: p.y - HP.slab, size: 1.6, wi: CW[a[0] + '+'].idx, main: true });
      });
      /* kolektor (|s| ≤ colS) podparty trzecią kolumną na tej samej poprzecznicy */
      if (Math.abs(ax.s) < HP.colS) [HP.auxOff, -HP.auxOff].forEach(o => {
        const p = hwyPt(a[0], ax.s, o);
        HWY_PIERS.push({ x: p.x, z: p.z, top: p.y - HP.slab, size: 1.4, wi: CW[a[0] + (o > 0 ? '+' : '-')].idx, main: true, col: true });
      });
    });
  }
  HWY_MAX_SPAN = BLOCK * SQ2;
  HWY_WAYS.forEach(w => {
    if (w.kind === 'cw' || w.kind === 'med' || w.kind === 'col') return;   // kolektor: na poprzecznicach głównych filarów
    let last = (w.kind === 'col') ? -6 : -40, d = 0;
    for (let i = 0; i < w.pts.length - 1; i++){
      const a = w.pts[i], b = w.pts[i + 1], sl = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(sl));
      for (let k = 0; k < n; k++){
        const t = k / n, x = lerp(a.x, b.x, t), z = lerp(a.z, b.z, t), y = lerp(a.y, b.y, t), dd = d + sl * t;
        if (y - HP.slab < 3.7) { last = dd; continue; }               // nasyp (lity) — podparty sam
        if (dd - last >= 22 && pierSpotAllowed(x, z, w.idx, y)){
          HWY_MAX_SPAN = Math.max(HWY_MAX_SPAN, dd - last);
          HWY_PIERS.push({ x: x, z: z, top: y - HP.slab, size: 1.2, wi: w.idx });
          last = dd;
        }
      }
      d += sl;
    }
    if (w.kind !== 'col') HWY_MAX_SPAN = Math.max(HWY_MAX_SPAN, Math.min(d - last, 999));
  });
})();

/* ---------------------------------------------------------------
   TRASY NPC: punkty {x, z, y, vmax, hwy} wzdłuż dróg
   --------------------------------------------------------------- */
/* punkt na drodze w odległości d (+ kierunek jazdy) */
function wayAt(w, d){
  const P = w.pts;
  d = clamp(d, 0, w.len);
  let i = 0; while (i < P.length - 2 && P[i + 1].d < d) i++;
  const a = P[i], b = P[i + 1], sl = (b.d - a.d) || 1, t = (d - a.d) / sl;
  const hx = (b.x - a.x) / sl, hz = (b.z - a.z) / sl;
  return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), y: lerp(a.y, b.y, t), hx: hx, hz: hz, a: a, b: b, t: t };
}
/* punkty wzdłuż drogi od d0 do d1 co ~step, przesunięte w prawo o off(d) */
function wayLane(w, d0, d1, off, step, vmax){
  const out = [], n = Math.max(1, Math.ceil(Math.abs(d1 - d0) / step));
  for (let i = 0; i <= n; i++){
    const d = d0 + (d1 - d0) * i / n, q = wayAt(w, d), o = off(d, q);
    const vm = vmax !== undefined ? vmax : (q.a.vmax !== undefined ? lerp(q.a.vmax, q.b.vmax !== undefined ? q.b.vmax : q.a.vmax, q.t) : w.vmax);
    out.push({ x: q.x - q.hz * o, z: q.z + q.hx * o, y: q.y, vmax: vm, hwy: true });
  }
  return out;
}
/* odległość wzdłuż jezdni (od jej początku) do miejsca o parametrze s autostrady */
const cwD = (cw, s) => cw.sg > 0 ? s + HP.sSplit : HP.sSplit - s;
/* przejazd autostradą: od początku jezdni wjazdowej cwIn (narożnik) do końca jezdni cwOut, prosto
   (cwIn === cwOut) albo przez pętlę / łącznicę węzła; lane = pas na odcinkach prostych (0 prawy, 1 lewy) */
function hwyTripPoints(cwInName, cwOutName, lane){
  const cin = CW[cwInName], cout = CW[cwOutName], lo = lane === 1 ? HP.laneL : HP.laneR;
  const v = HP.vmax * (lane === 1 ? 1 : 0.85), aux = HP.auxOff - HP.cwOff, step = 6;
  const ease = (d, a, b, o0, o1) => lerp(o0, o1, smooth01((d - a) / (b - a)));
  if (cwInName === cwOutName) return wayLane(cin, 0, cin.len, () => lo, step, v);
  const rp = HWY_RAMPS.find(r => r.from === cwInName && r.to === cwOutName);
  const w = rp.way, out = [];
  if (rp.kind === 'loop'){
    /* kolektor jezdni wejściowej: z pasa na kolektor między wjazdem poprzedniej pętli a zjazdem */
    const dEnd = cwD(cin, cin.sg * HP.colS);
    out.push(...wayLane(cin, 0, dEnd, d => d < dEnd - 40 ? HP.laneR : ease(d, dEnd - 40, dEnd - 8, HP.laneR, aux), step, v));
    out.push(...wayLane(w, 2, w.len - 2, () => 0, 3));
    const dSt = cwD(cout, -cout.sg * HP.colS);
    out.push(...wayLane(cout, dSt, cout.len, d => d > dSt + 40 ? HP.laneR : ease(d, dSt + 8, dSt + 40, aux, HP.laneR), step, v));
  } else {
    /* łącznica: pas wyłączenia (pierwsze 50 m drogi łącznicy biegnie wzdłuż jezdni) */
    const dA = cwD(cin, cin.sg * -HP.connS) - HP.auxLen;
    out.push(...wayLane(cin, 0, dA + 40, d => d < dA ? HP.laneR : ease(d, dA, dA + 36, HP.laneR, aux), step, v));
    out.push(...wayLane(w, 42, w.len - 42, () => 0, 3));
    const dB = cwD(cout, cout.sg * HP.connS);
    out.push(...wayLane(cout, dB + 40, cout.len, d => d > dB + HP.auxLen ? HP.laneR : ease(d, dB + 14, dB + HP.auxLen, aux, HP.laneR), step, v));
  }
  return out;
}
/* końcówka (wjazd z miasta / zjazd do miasta) po prawym pasie */
function termPoints(w){ return wayLane(w, 0, w.len, (d, q) => lerp(q.a.lr, q.b.lr, q.t), 4); }
/* ograniczenie zmian prędkości: vmax w punkcie <= tyle, by zdążyć zwolnić do następnych (a = 2.5 m/s²) */
function smoothVmax(pts, a){
  for (let pass = 0; pass < 2; pass++){
    for (let i = pts.length - 1; i >= 0; i--){
      const p = pts[i], q = pts[(i + 1) % pts.length];
      if (p.vmax === undefined || q.vmax === undefined) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      p.vmax = Math.min(p.vmax, Math.sqrt(q.vmax * q.vmax + 2 * a * d));
    }
  }
  return pts;
}
