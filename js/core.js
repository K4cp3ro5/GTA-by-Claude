"use strict";
/* GTA BY CLAUDE -- modul: core (biblioteki, narzedzia, stale, renderer) */

/* ---------------------------------------------------------------
   0. KONTROLA BIBLIOTEK
   --------------------------------------------------------------- */
const errBox = document.getElementById('err');
(function(){
  if (typeof THREE === 'undefined' || typeof CANNON === 'undefined') {
    errBox.textContent = 'Nie udało się wczytać bibliotek Three.js / cannon.js z CDN. ' +
      'Sprawdź połączenie z internetem i odśwież stronę (F5).';
    document.getElementById('gatetxt').style.display = 'none';
    document.getElementById('go').style.display = 'none';
  }
})();


/* ---------------------------------------------------------------
   1. NARZĘDZIA
   --------------------------------------------------------------- */
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
/* ziarno: stałe w grze; test/sim.js może podać inne (SEED=...), żeby sprawdzić inne układy miasta */
const rnd = mulberry32((typeof window !== "undefined" && window.GAME_SEED) || 0x5EED17);
const rand      = (a,b) => a + rnd() * (b - a);
const randInt   = (a,b) => Math.floor(a + rnd() * (b - a + 1));
const pick      = arr   => arr[Math.floor(rnd() * arr.length)];
const clamp     = (v,a,b) => v < a ? a : (v > b ? b : v);
const lerp      = (a,b,t) => a + (b - a) * t;
const damp      = (a,b,l,dt) => lerp(a, b, 1 - Math.exp(-l * dt));
function smoothstep(e0,e1,x){ const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
function approach(cur, target, maxDelta){
  const d = target - cur;
  if (Math.abs(d) <= maxDelta) return target;
  return cur + Math.sign(d) * maxDelta;
}
function wrapAngle(a){
  while (a >  Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}
function angleDamp(cur, target, l, dt){
  return cur + wrapAngle(target - cur) * (1 - Math.exp(-l * dt));
}

/* zgodność API cannon.js / cannon-es */
function addBody(b){ world.addBody(b); }
function delBody(b){ if (world.removeBody) world.removeBody(b); else world.remove(b); }


/* ---------------------------------------------------------------
   2. STAŁE ŚWIATA
   --------------------------------------------------------------- */
const GRID       = 12;                    // 12x12 kwartałów
const BLOCK      = 44;                    // rozstaw osi ulic
const ROAD_W     = 14;                    // szerokość jezdni
const ROAD_H     = ROAD_W / 2;
const LOT        = BLOCK - ROAD_W;        // 30 — bok podestu chodnika
const HALF       = GRID * BLOCK / 2;      // 264
const WALK_H     = 0.25;                  // wysokość krawężnika
const ROAD_TILE  = 15;                    // jednostek na kafel jezdni
const CITY_EDGE  = HALF + ROAD_H;         // 271 — zewnętrzna krawędź obwodnicy miasta
const BELT       = 125;                   // pas podmiejski między miastem a murem (końce autostrad)
const WALL_X     = CITY_EDGE + 1.5 + BELT; // mur dookoła świata (±397.5)
const DAY_LENGTH = 300;                   // sekund na dobę

/* rejestr postawionych znaków/sygnalizatorów (diagnostyka: test/sim.js sprawdza, czy żaden nie stoi w budynku) */
const signLog = [];
const L = i => -HALF + i * BLOCK;                 // oś ulicy nr i
const blockCenter = i => -HALF + i * BLOCK + BLOCK / 2;

/* Miejsce na znak przy PRAWEJ krawędzi jezdni dla auta nadjeżdżającego do punktu (cx,cz).
   d = jednostkowy wektor OD skrzyżowania W STRONĘ nadjeżdżających aut (kierunek ruchu auta to -d);
   along = odległość od środka wzdłuż dojazdu, lateral = odsunięcie na prawo od kierowcy
   (prawa strona kierowcy jadącego w -d to (d.z, -d.x)). rot = obrót grupy tak, by przód
   znaku (lokalne +Z) patrzył na nadjeżdżające auto. Wzór sprawdzony numerycznie w test/sim.js. */
function approachSpot(cx, cz, d, along, lateral){
  return { x: cx + d.x*along + d.z*lateral, z: cz + d.z*along - d.x*lateral, rot: Math.atan2(d.x, d.z) };
}
/* dodatki do minimapy spoza siatki miasta (autostrady, łącznice, drogi pasa podmiejskiego) — rysuje je hud.js */
const mapExtras = [];

const COM_H      = 0.55;                  // wysokość środka ciężkości auta
const WHEEL_R    = 0.36;


/* ---------------------------------------------------------------
   3. RENDERER, SCENA, KAMERA
   --------------------------------------------------------------- */
const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const MAXA = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b4e0);
scene.fog = new THREE.FogExp2(0x87b4e0, 0.0042);

const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.25, 1600);   // daleko: strzałka nad pasem lotniska
camera.position.set(0, 6, 20);

const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3a3630, 0.7);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 1.15);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far  = 260;
sun.shadow.camera.left = -62;
sun.shadow.camera.right = 62;
sun.shadow.camera.top = 62;
sun.shadow.camera.bottom = -62;
sun.shadow.bias = -0.0009;
sun.shadow.normalBias = 0.03;
scene.add(sun);
scene.add(sun.target);

/* trzy wędrujące światła punktowe "przyklejane" do najbliższych latarni */
const lampLights = [];
for (let i = 0; i < 3; i++){
  const pl = new THREE.PointLight(0xffb03a, 0, 22, 2);
  pl.visible = false;
  scene.add(pl);
  lampLights.push(pl);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
