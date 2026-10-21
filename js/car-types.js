/* ---------------------------------------------------------------
   9b. TYPY AUT — zwykły (sedan), pickup, sportowy: parametry napędu, hamulców, przyczepności,
   zawieszenia, nadwozia (bryła kolizji) i modelu. Te same typy mają auto gracza (vehicle.js:
   applyCarType) i auta NPC (traffic-npc.js). Model liczony od podłoża, nos w lokalne +Z.
   dy = o ile środek nadwozia stoi wyżej niż w sedanie (koło, ugięcie, mocowanie zawieszenia);
   restY = wysokość środka nadwozia nad jezdnią w spoczynku.
   --------------------------------------------------------------- */
const CAR_TYPES = {
  sedan:  { name: 'Zwykły', mass: 1250, force: 5200, fadeKmh: 205, drag: 1.15, steer: 0.52, brake: 62, grip: 3.4,
            stiff: 40, rest: 0.36, travel: 0.34, damp: [4.0, 5.5], half: [0.96, 0.35, 2.16], boxY: 0.15,
            wheelR: 0.36, track: 0.86, wbF: -1.45, wbR: 1.45, connY: 0.11, pitch: 1.0, bright: 1.0,
            npc: { hw: 0.93, hl: 2.05, hh: 0.62, accel: 1.7, speed: 1.0, pirV: 52, pirA: 10 } },
  pickup: { name: 'Pickup', mass: 1900, force: 5400, fadeKmh: 190, drag: 1.40, steer: 0.50, brake: 58, grip: 3.3,
            stiff: 32, rest: 0.42, travel: 0.40, damp: [3.6, 5.0], half: [1.02, 0.45, 2.62], boxY: 0.22,
            wheelR: 0.42, track: 0.92, wbF: -1.6, wbR: 1.6, connY: 0.12, pitch: 0.78, bright: 0.8,
            npc: { hw: 1.0, hl: 2.65, hh: 0.75, accel: 1.35, speed: 0.95, pirV: 46, pirA: 7 } },
  sport:  { name: 'Sportowy', mass: 1150, force: 6400, fadeKmh: 300, drag: 0.70, steer: 0.55, brake: 76, grip: 4.3,
            stiff: 58, rest: 0.28, travel: 0.24, damp: [4.6, 6.2], half: [0.98, 0.28, 2.2], boxY: 0.08,
            wheelR: 0.35, track: 0.88, wbF: -1.40, wbR: 1.40, connY: 0.10, pitch: 1.3, bright: 1.45,
            npc: { hw: 0.97, hl: 2.2, hh: 0.52, accel: 2.3, speed: 1.08, pirV: 70, pirA: 15 } },
  /* rower: ten sam RaycastVehicle — 4 koła o rozstawie 0.12 m (wizualnie 2), w pionie trzyma go moment
     prostujący (update-vehicle.js); napęd, hamulce i hamowanie silnikiem skalowane do masy */
  bike:   { name: 'Rower', mass: 95, force: 150, fadeKmh: 32, drag: 0.32, steer: 0.55, brake: 2.4, grip: 2.6,
            stiff: 40, rest: 0.30, travel: 0.2, damp: [3.0, 4.0], half: [0.18, 0.35, 0.8], boxY: 0.28,
            wheelR: 0.34, track: 0.06, wbF: -0.55, wbR: 0.55, connY: 0.0, pitch: 1, bright: 1, bike: true, wheelW: 0.06,
            npc: { hw: 0.35, hl: 0.9, hh: 0.8, accel: 1.1, speed: 1 } }
};
const CAR_TYPE_IDS = ['sedan', 'pickup', 'sport'];
Object.keys(CAR_TYPES).forEach(k => {
  const T = CAR_TYPES[k], g = 9.82;
  T.id = k;
  T.gauge = k === 'sport' ? 280 : k === 'pickup' ? 180 : k === 'bike' ? 50 : 200;   // skala prędkościomierza
  T.dy = (T.wheelR - 0.36) + (T.rest - g / (4 * T.stiff)) - (0.36 - g / 160) - (T.connY - 0.11);
  T.restY = 0.48 + T.dy;
});
/* kierunkowskazy: jedna geometria na stronę (przód + tył), wspólny migający materiał */
const IND_Y = { sedan: 0.8, pickup: 1.05, sport: 0.66 };
const _indGeo = {};
function indicatorGeo(type, side){                     // side +1 lewy, −1 prawy
  const key = type + side; if (_indGeo[key]) return _indGeo[key];
  /* z obrysu brył modelu NA WYSOKOŚCI lampy (bez lusterek i zderzaków niżej / wyżej) — lampy na narożnikach nadwozia (połowa w blasze, lico 6 cm przed nią) */
  const y = IND_Y[type] || 0.8, all = carParts(type).filter(q => q[3] === 'paint' || q[3] === 'dark');
  const at = all.filter(q => Math.abs(q[5] - y) <= q[1] / 2 + 0.01), P = at.length ? at : all;
  const front = Math.max(...P.map(q => q[6] + q[2] / 2)), rear = Math.min(...P.map(q => q[6] - q[2] / 2));
  const half = Math.min(...[front, rear].map(zz => Math.max(...P.filter(q => Math.abs(q[6] - zz) <= q[2] / 2 + 0.1).map(q => Math.abs(q[4]) + q[0] / 2), 0.5))), x = side * (half - 0.065);   // przy krawędzi, na zewnątrz reflektorów
  const B = () => new THREE.BoxGeometry(0.12, 0.12, 0.08);
  return (_indGeo[key] = mergeColored([{ geo: B(), color: 0xffffff, x: x, y: y, z: front + 0.02 }, { geo: B(), color: 0xffffff, x: x, y: y, z: rear - 0.02 }]));
}
const indMat = new THREE.MeshBasicMaterial({ color: 0xffa21a });
let indBlinkOn = false;                                // faza migania (main-loop: ~1.4 Hz)
function addIndicators(group, type){
  if (CAR_TYPES[type].bike) return null;
  return [1, -1].map(sd => { const m = new THREE.Mesh(indicatorGeo(type, sd), indMat); m.visible = false; group.add(m); return m; });
}
/* rozkład typów w ruchu ulicznym: 65% zwykłe, 22% pickupy, 13% sportowe */
function randomCarType(){ const r = rnd(); return r < 0.65 ? 'sedan' : r < 0.87 ? 'pickup' : 'sport'; }

/* części nadwozia: [szer, wys, dł, materiał, x, y, z, rx] — materiały: paint, dark, glass, chrome, lampF, lampR */
function carParts(type){
  if (type === 'bike') return [
    [0.06, 0.06, 0.78, 'paint', 0, 0.62, 0.16, 0.72],      // rura dolna
    [0.06, 0.06, 0.62, 'paint', 0, 0.86, 0.06, 0.08],      // rura górna
    [0.06, 0.58, 0.06, 'paint', 0, 0.64, -0.2, -0.25],     // rura podsiodłowa
    [0.05, 0.05, 0.6, 'dark', 0, 0.38, -0.32, 0.12],       // tylne widełki
    [0.05, 0.62, 0.05, 'dark', 0, 0.64, 0.5, 0.3],         // widelec
    [0.62, 0.04, 0.04, 'dark', 0, 1.06, 0.44],             // kierownica
    [0.04, 0.26, 0.04, 'dark', 0, 0.95, 0.46],
    [0.15, 0.06, 0.27, 'dark', 0, 0.96, -0.28],            // siodełko
    [0.22, 0.04, 0.12, 'chrome', 0, 0.36, 0],              // korby
    [0.08, 0.06, 0.04, 'lampF', 0, 0.98, 0.55],
    [0.06, 0.04, 0.03, 'lampR', 0, 0.86, -0.64]
  ];
  if (type === 'pickup') return [
    [2.00, 0.50, 5.30, 'paint', 0, 0.90, 0],               // nadwozie
    [1.86, 0.32, 5.00, 'dark',  0, 0.58, 0],               // podwozie / progi
    [1.92, 0.18, 1.55, 'paint', 0, 1.22, 1.82, -0.04],     // maska
    [1.86, 0.62, 1.75, 'glass', 0, 1.48, 0.20],            // kabina
    [1.88, 0.10, 1.80, 'paint', 0, 1.84, 0.20],            // dach kabiny
    [0.09, 0.62, 0.09, 'dark',  0.92, 1.48, -0.66], [0.09, 0.62, 0.09, 'dark', -0.92, 1.48, -0.66],
    [0.08, 0.44, 2.05, 'paint',  0.96, 1.36, -1.60], [0.08, 0.44, 2.05, 'paint', -0.96, 1.36, -1.60],   // burty skrzyni
    [1.92, 0.44, 0.08, 'paint', 0, 1.36, -2.62],           // klapa
    [1.84, 0.05, 2.05, 'dark',  0, 1.16, -1.60],           // podłoga skrzyni
    [2.04, 0.28, 0.30, 'chrome', 0, 0.66,  2.68],          // zderzaki
    [2.04, 0.26, 0.30, 'dark',  0, 0.66, -2.68],
    [1.46, 0.34, 0.08, 'chrome', 0, 1.02, 2.66],           // grill
    [0.18, 0.14, 0.36, 'chrome',  1.08, 1.40, 0.95], [0.18, 0.14, 0.36, 'chrome', -1.08, 1.40, 0.95],
    [0.40, 0.18, 0.08, 'lampF',  0.70, 1.04, 2.66], [0.40, 0.18, 0.08, 'lampF', -0.70, 1.04, 2.66],
    [0.18, 0.40, 0.08, 'lampR',  0.86, 1.30, -2.67], [0.18, 0.40, 0.08, 'lampR', -0.86, 1.30, -2.67]
  ];
  if (type === 'sport') return [
    [1.98, 0.36, 4.40, 'paint', 0, 0.52, 0],
    [1.84, 0.22, 4.10, 'dark',  0, 0.32, 0],
    [1.88, 0.12, 1.60, 'paint', 0, 0.72, 1.28, -0.10],     // niska, opadająca maska
    [1.62, 0.40, 1.80, 'glass', 0, 0.90, -0.28],
    [1.44, 0.08, 1.20, 'paint', 0, 1.11, -0.36],
    [1.80, 0.12, 1.00, 'paint', 0, 0.76, -1.58, 0.07],
    [1.96, 0.18, 0.30, 'dark',  0, 0.40,  2.22], [1.96, 0.18, 0.30, 'dark', 0, 0.42, -2.22],
    [1.92, 0.05, 0.36, 'dark',  0, 0.26,  2.30],           // dokładka (splitter)
    [1.74, 0.06, 0.40, 'paint', 0, 1.10, -2.06],           // spojler
    [0.10, 0.26, 0.10, 'dark',   0.62, 0.95, -2.06], [0.10, 0.26, 0.10, 'dark', -0.62, 0.95, -2.06],
    [0.06, 0.20, 1.00, 'dark',   1.00, 0.50, -0.50], [0.06, 0.20, 1.00, 'dark', -1.00, 0.50, -0.50],   // wloty
    [0.14, 0.08, 0.30, 'chrome', 1.00, 0.86, 0.42], [0.14, 0.08, 0.30, 'chrome', -1.00, 0.86, 0.42],
    [0.52, 0.08, 0.10, 'lampF',  0.64, 0.66, 2.20], [0.52, 0.08, 0.10, 'lampF', -0.64, 0.66, 2.20],
    [1.50, 0.07, 0.06, 'lampR', 0, 0.74, -2.24]
  ];
  return [
    [1.92, 0.44, 4.32, 'paint', 0, 0.66, 0],
    [1.78, 0.30, 4.00, 'dark',  0, 0.38, 0],
    [1.80, 0.16, 1.42, 'paint', 0, 0.90, 1.22, -0.055],
    [1.74, 0.14, 1.10, 'paint', 0, 0.90, -1.45, 0.045],
    [1.64, 0.50, 2.06, 'glass', 0, 1.12, -0.12],
    [1.50, 0.10, 1.52, 'paint', 0, 1.38, -0.30],
    [0.09, 0.50, 0.09, 'dark',  0.78, 1.12, -1.12], [0.09, 0.50, 0.09, 'dark', -0.78, 1.12, -1.12],
    [1.94, 0.22, 0.34, 'dark',  0, 0.50,  2.19], [1.94, 0.22, 0.34, 'dark', 0, 0.50, -2.19],
    [1.30, 0.10, 0.22, 'chrome', 0, 0.66, 2.20],
    [0.16, 0.10, 0.34, 'chrome',  1.00, 1.03, 0.60], [0.16, 0.10, 0.34, 'chrome', -1.00, 1.03, 0.60],
    [0.06, 0.34, 4.10, 'dark',   0.97, 0.56, 0], [0.06, 0.34, 4.10, 'dark', -0.97, 0.56, 0],
    [0.44, 0.14, 0.10, 'lampF',  0.62, 0.82, 2.18], [0.44, 0.14, 0.10, 'lampF', -0.62, 0.82, 2.18],
    [0.42, 0.13, 0.08, 'lampR',  0.64, 0.84, -2.20], [0.42, 0.13, 0.08, 'lampR', -0.64, 0.84, -2.20],
    [0.86, 0.05, 0.06, 'lampR', 0, 0.98, -2.20]
  ];
}
