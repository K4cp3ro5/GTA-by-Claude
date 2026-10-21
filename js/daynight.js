/* ---------------------------------------------------------------
   15. CYKL DOBOWY
   --------------------------------------------------------------- */
let timeOfDay = 0.375;        // 09:00
const sunDir = new THREE.Vector3();
/* kierunek światła kierunkowego: słońce w dzień, nocą księżyc (to samo azymutalnie, odbite nad horyzont) */
const lightDir = new THREE.Vector3();
let dayF = 1, nightF = 0, duskF = 0;

const C_DAY    = new THREE.Color(0x8cb9e6);
const C_NIGHT  = new THREE.Color(0x0a1026);
const C_DUSK   = new THREE.Color(0xff8a3c);
const C_HEMI_D = new THREE.Color(0xbfd8ff);
const C_HEMI_N = new THREE.Color(0x4a5784);
const C_SUN_D  = new THREE.Color(0xfff6e2);
const C_SUN_K  = new THREE.Color(0xff7a2a);
const C_MOON   = new THREE.Color(0x8ea4d8);
const skyCol   = new THREE.Color();
const fogCol   = new THREE.Color();

function updateSky(dt){
  if (!timeFrozen) timeOfDay = (timeOfDay + dt / DAY_LENGTH * (down('daytime') ? 30 : 1) * dayMult) % 1;
  const th = (timeOfDay - 0.25) * TAU;
  sunDir.set(Math.cos(th) * 0.55, Math.sin(th), Math.cos(th) * 0.83).normalize();
  lightDir.set(sunDir.x, Math.max(Math.abs(sunDir.y), 0.12), sunDir.z).normalize();

  const up = sunDir.y;
  dayF   = smoothstep(-0.07, 0.20, up);
  nightF = 1 - dayF;
  duskF  = clamp(1 - Math.abs(up) / 0.30, 0, 1);

  skyCol.copy(C_NIGHT).lerp(C_DAY, dayF).lerp(C_DUSK, duskF * 0.7);
  scene.background = skyCol;
  fogCol.copy(skyCol).multiplyScalar(lerp(0.55, 0.92, dayF));
  scene.fog.color.copy(fogCol);
  scene.fog.density = lerp(0.0062, 0.0036, dayF) * fogMult;              // dalszy zasięg widzenia (w dzień ~ 2× dalej niż wcześniej)

  sun.intensity = dayF * 1.25 + nightF * 0.34;                 // nocą: słaba, chłodna poświata księżyca
  sun.color.copy(C_SUN_D).lerp(C_SUN_K, duskF * 0.85).lerp(C_MOON, nightF);
  hemi.intensity = 0.50 + dayF * 0.22;
  hemi.color.copy(C_HEMI_N).lerp(C_HEMI_D, dayF);
  hemi.groundColor.setHex(nightF > 0.5 ? 0x262833 : 0x3a3630);

  /* świecące okna */
  const glow = smoothstep(0.12, 0.72, nightF);
  for (let i = 0; i < facadeMats.length; i++) facadeMats[i].emissiveIntensity = glow * 1.15;

  /* latarnie */
  matLampGlass.color.setRGB(lerp(0.22, 1.0, glow), lerp(0.22, 0.72, glow), lerp(0.22, 0.28, glow));
  matGlow.opacity = glow * 0.55;
  lampGlows.visible = glow > 0.02;

  /* reflektory auta + tylne światła */
  const beam = smoothstep(0.08, 0.5, nightF);
  for (let i = 0; i < carModel.spots.length; i++) carModel.spots[i].intensity = beam * 2.3;
  carModel.headMat.color.setRGB(1, lerp(0.74, 0.95, beam), lerp(0.55, 0.82, beam));
}

/* przypinanie świateł punktowych do najbliższych latarni */
const _camPos = new THREE.Vector3();
function updateLampLights(){
  const on = nightF > 0.35;
  if (!on){
    for (let i = 0; i < lampLights.length; i++){ lampLights[i].visible = false; lampLights[i].intensity = 0; }
    return;
  }
  camera.getWorldPosition(_camPos);
  const best = [];
  for (let i = 0; i < lampBulbs.length; i++){
    const d = lampBulbs[i].distanceToSquared(_camPos);
    if (d > 1400) continue;
    if (best.length < 3){ best.push({ i:i, d:d }); best.sort((a,b) => a.d - b.d); }
    else if (d < best[2].d){ best[2] = { i:i, d:d }; best.sort((a,b) => a.d - b.d); }
  }
  for (let k = 0; k < lampLights.length; k++){
    const l = lampLights[k];
    if (k < best.length){
      l.position.copy(lampBulbs[best[k].i]);
      l.visible = true;
      l.intensity = 1.45 * smoothstep(0.35, 0.8, nightF);
    } else { l.visible = false; l.intensity = 0; }
  }
}
