/* ---------------------------------------------------------------
   4. PROCEDURALNE TEKSTURY (ukryty <canvas>)
   --------------------------------------------------------------- */
function mkCanvas(w,h){
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function toTex(canvas, rx, ry){
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx === undefined ? 1 : rx, ry === undefined ? 1 : ry);
  t.anisotropy = MAXA;
  t.needsUpdate = true;
  return t;
}
function noiseOver(ctx, w, h, amount, alpha){
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4){
    const n = (rnd() - 0.5) * amount;
    d[i]   = clamp(d[i]   + n, 0, 255);
    d[i+1] = clamp(d[i+1] + n, 0, 255);
    d[i+2] = clamp(d[i+2] + n, 0, 255);
    if (alpha !== undefined) d[i+3] = alpha;
  }
  ctx.putImageData(img, 0, 0);
}

/* --- asfalt --- */
function texAsphalt(){
  const S = 256, c = mkCanvas(S,S), g = c.getContext('2d');
  g.fillStyle = '#35373c'; g.fillRect(0,0,S,S);
  for (let i = 0; i < 260; i++){
    g.fillStyle = 'rgba(' + randInt(20,70) + ',' + randInt(20,70) + ',' + randInt(22,74) + ',0.5)';
    g.beginPath();
    g.ellipse(rnd()*S, rnd()*S, rand(1,5), rand(1,4), rnd()*TAU, 0, TAU);
    g.fill();
  }
  noiseOver(g, S, S, 26);
  /* rysy i łaty po remontach */
  g.strokeStyle = 'rgba(28,29,33,.55)';
  for (let i = 0; i < 9; i++){
    g.lineWidth = rand(0.6, 2.2);
    g.beginPath();
    let x = rnd()*S, y = rnd()*S;
    g.moveTo(x,y);
    for (let k = 0; k < 5; k++){ x += rand(-40,40); y += rand(-40,40); g.lineTo(x,y); }
    g.stroke();
  }
  return toTex(c);
}

/* --- pas jezdni: U w poprzek (0..1), V wzdłuż --- */
function texRoad(){
  const W = 192, H = 384, c = mkCanvas(W,H), g = c.getContext('2d');
  g.fillStyle = '#33353a'; g.fillRect(0,0,W,H);
  for (let i = 0; i < 200; i++){
    g.fillStyle = 'rgba(' + randInt(24,68) + ',' + randInt(24,68) + ',' + randInt(26,72) + ',0.45)';
    g.beginPath(); g.ellipse(rnd()*W, rnd()*H, rand(1,4), rand(1,3), 0, 0, TAU); g.fill();
  }
  noiseOver(g, W, H, 22);
  /* krawędziowe linie ciągłe */
  g.fillStyle = 'rgba(226,224,214,.82)';
  g.fillRect(Math.round(W*0.055), 0, 4, H);
  g.fillRect(Math.round(W*0.945) - 4, 0, 4, H);
  /* środkowa linia przerywana: okres = połowa wysokości */
  const cx = W/2 - 2.5, period = H/2, dash = period * 0.52;
  g.fillStyle = 'rgba(232,230,220,.88)';
  for (let k = 0; k < 2; k++) g.fillRect(cx, k*period + (period-dash)/2, 5, dash);
  /* przetarcia farby */
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 70; i++){
    g.fillStyle = 'rgba(0,0,0,' + rand(0.12,0.5) + ')';
    g.beginPath(); g.ellipse(rnd()*W, rnd()*H, rand(1,4), rand(1,3), 0, 0, TAU); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  return toTex(c);
}

/* --- skrzyżowanie: asfalt + pasy dla pieszych z czterech stron --- */
function texCross(){
  const S = 384, c = mkCanvas(S,S), g = c.getContext('2d');
  g.fillStyle = '#33353a'; g.fillRect(0,0,S,S);
  for (let i = 0; i < 300; i++){
    g.fillStyle = 'rgba(' + randInt(24,68) + ',' + randInt(24,68) + ',' + randInt(26,72) + ',0.45)';
    g.beginPath(); g.ellipse(rnd()*S, rnd()*S, rand(1,5), rand(1,4), 0, 0, TAU); g.fill();
  }
  noiseOver(g, S, S, 22);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 160; i++){
    g.fillStyle = 'rgba(0,0,0,' + rand(0.1,0.45) + ')';
    g.beginPath(); g.ellipse(rnd()*S, rnd()*S, rand(1,5), rand(1,4), 0, 0, TAU); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  return toTex(c);
}

/* pojedynczy pas przejścia dla pieszych — osobna, lekka tekstura nakładana
   punktowo tylko na wybrane strony wybranych skrzyżowań (patrz sekcja 7) */
/* kafel zebry P-10: jeden biały pas (50%) na okres 1 m — powtarzany wzdłuż przejścia bez przerw */
function texCrossTile(){
  const W = 64, H = 96, c = mkCanvas(W,H), g = c.getContext('2d');
  g.fillStyle = '#34363b'; g.fillRect(0,0,W,H);
  noiseOver(g, W, H, 14);
  g.fillStyle = 'rgba(228,226,216,.86)';
  g.fillRect(W*0.25, 5, W*0.5, H - 10);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 18; i++){
    g.fillStyle = 'rgba(0,0,0,' + rand(0.08,0.4) + ')';
    g.beginPath(); g.ellipse(rnd()*W, rnd()*H, rand(1,3), rand(1,3), 0, 0, TAU); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  return toTex(c);
}

/* --- płyta chodnikowa --- */
function texWalk(){
  const S = 256, c = mkCanvas(S,S), g = c.getContext('2d');
  g.fillStyle = '#9d9a91'; g.fillRect(0,0,S,S);
  noiseOver(g, S, S, 30);
  g.strokeStyle = 'rgba(70,68,63,.42)';
  g.lineWidth = 2;
  for (let i = 0; i <= 4; i++){
    const p = i * S/4 + 0.5;
    g.beginPath(); g.moveTo(p,0); g.lineTo(p,S); g.stroke();
    g.beginPath(); g.moveTo(0,p); g.lineTo(S,p); g.stroke();
  }
  for (let i = 0; i < 40; i++){
    g.fillStyle = 'rgba(' + randInt(110,155) + ',' + randInt(108,152) + ',' + randInt(100,144) + ',.5)';
    g.beginPath(); g.ellipse(rnd()*S, rnd()*S, rand(2,9), rand(2,8), 0, 0, TAU); g.fill();
  }
  return toTex(c);
}

/* --- krawężnik --- */
function texCurb(){
  const S = 128, c = mkCanvas(S,S), g = c.getContext('2d');
  g.fillStyle = '#7e7c75'; g.fillRect(0,0,S,S);
  noiseOver(g, S, S, 26);
  g.fillStyle = 'rgba(52,50,46,.5)';
  for (let i = 0; i < 4; i++) g.fillRect(i*S/4, 0, 2, S);
  return toTex(c);
}

/* --- dach --- */
function texRoof(){
  const S = 128, c = mkCanvas(S,S), g = c.getContext('2d');
  g.fillStyle = '#3c3f44'; g.fillRect(0,0,S,S);
  noiseOver(g, S, S, 40);
  for (let i = 0; i < 25; i++){
    g.fillStyle = 'rgba(' + randInt(45,85) + ',' + randInt(45,85) + ',' + randInt(48,90) + ',.5)';
    g.fillRect(rnd()*S, rnd()*S, rand(4,22), rand(4,18));
  }
  return toTex(c);
}

/* --- fasada: mapa koloru + mapa emisji świecących okien ---
       jeden kafel = 8x8 jednostek świata = 4x4 okna            */
function texFacade(cfg){
  const S = 256, cols = cfg.cols, cell = S / cols;
  const c  = mkCanvas(S,S), g  = c.getContext('2d');
  const e  = mkCanvas(S,S), ge = e.getContext('2d');

  g.fillStyle = cfg.wall; g.fillRect(0,0,S,S);
  noiseOver(g, S, S, cfg.grain);
  ge.fillStyle = '#000'; ge.fillRect(0,0,S,S);

  /* pasy międzykondygnacyjne */
  g.fillStyle = cfg.band;
  for (let r = 0; r < cols; r++) g.fillRect(0, r*cell + cell*0.90, S, cell*0.10);

  const pad = cell * 0.17, wW = cell - pad*2, wH = cell*0.90 - pad*2;
  for (let r = 0; r < cols; r++){
    for (let q = 0; q < cols; q++){
      const x = q*cell + pad, y = r*cell + pad;
      /* rama */
      g.fillStyle = cfg.frame;
      g.fillRect(x - 2, y - 2, wW + 4, wH + 4);
      const lit = rnd() < cfg.lit;
      const glass = lit ? cfg.glow : cfg.glass;
      g.fillStyle = glass;
      g.fillRect(x, y, wW, wH);
      /* refleks nieba na szybie */
      g.fillStyle = 'rgba(255,255,255,' + (lit ? 0.10 : 0.16) + ')';
      g.beginPath();
      g.moveTo(x, y + wH); g.lineTo(x + wW*0.62, y); g.lineTo(x + wW, y); g.lineTo(x, y + wH*0.28);
      g.closePath(); g.fill();
      /* szpros */
      g.fillStyle = cfg.frame;
      g.fillRect(x + wW/2 - 1, y, 2, wH);
      if (lit){
        ge.fillStyle = cfg.glow;
        ge.fillRect(x, y, wW, wH);
        ge.fillStyle = 'rgba(0,0,0,.35)';
        ge.fillRect(x + wW/2 - 1, y, 2, wH);
      }
    }
  }
  return { map: toTex(c), emissiveMap: toTex(e) };
}
