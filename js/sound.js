/* ---------------------------------------------------------------
   13. DŹWIĘK — Web Audio API (czysta synteza)
   --------------------------------------------------------------- */
const Sound = {
  ctx: null, master: null, ready: false,
  eng: null, engGain: null, engFilter: null, sub: null, subGain: null,
  hornNodes: null, noise: null,

  init(){
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch(err){ return; }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = muted ? 0 : 0.55;
    this.master.connect(ctx.destination);

    /* bufor szumu do kroków i szumu opon */
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;

    /* silnik: piła + prostokąt przez filtr dolnoprzepustowy */
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 500;
    this.engFilter.Q.value = 4;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engFilter.connect(this.engGain);
    this.engGain.connect(this.master);

    this.eng = ctx.createOscillator();
    this.eng.type = 'sawtooth';
    this.eng.frequency.value = 55;
    this.eng.connect(this.engFilter);
    this.eng.start();

    this.sub = ctx.createOscillator();
    this.sub.type = 'square';
    this.sub.frequency.value = 27;
    this.subGain = ctx.createGain();
    this.subGain.gain.value = 0.55;
    this.sub.connect(this.subGain);
    this.subGain.connect(this.engFilter);
    this.sub.start();

    this.ready = true;
  },

  paused: false,
  setMuted(m){
    if (!this.ready) return;
    this.master.gain.setTargetAtTime(m || this.paused ? 0 : 0.55, this.ctx.currentTime, 0.05);
  },
  setPaused(p){                               // pauza (menu Esc): cisza, po powrocie głośność zgodna z wyciszeniem (M)
    this.paused = p;
    this.setMuted(muted);
  },

  /* rpm01: 0..1, load: 0..1 */
  engine(on, rpm01, load, tone){
    if (!this.ready) return;
    const t = this.ctx.currentTime, pitch = tone ? tone.pitch : 1, bright = tone ? tone.bright : 1;
    const f = (42 + rpm01 * 168) * pitch;
    this.eng.frequency.setTargetAtTime(f, t, 0.06);
    this.sub.frequency.setTargetAtTime(f * 0.5, t, 0.06);
    this.engFilter.frequency.setTargetAtTime((280 + rpm01 * 1700 + load * 420) * bright, t, 0.08);
    this.engGain.gain.setTargetAtTime(on ? (0.055 + rpm01 * 0.085 + load * 0.03) : 0, t, 0.12);
  },

  horn(on){
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (on){
      if (this.hornNodes) return;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.26, t + 0.03);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 2400;
      g.connect(f); f.connect(this.master);
      const oscs = [440, 554.4, 660].map((fr, i) => {
        const o = ctx.createOscillator();
        o.type = i === 2 ? 'sine' : 'square';
        o.frequency.value = fr;
        const og = ctx.createGain();
        og.gain.value = i === 2 ? 0.25 : 0.5;
        o.connect(og); og.connect(g);
        o.start();
        return o;
      });
      this.hornNodes = { g: g, oscs: oscs };
    } else if (this.hornNodes){
      const h = this.hornNodes;
      this.hornNodes = null;
      h.g.gain.cancelScheduledValues(t);
      h.g.gain.setValueAtTime(Math.max(h.g.gain.value, 0.0001), t);
      h.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      h.oscs.forEach(o => { try { o.stop(t + 0.12); } catch(e){} });
    }
  },

  step(hard){
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rand(0.85, 1.2);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = rand(900, 1500);
    f.Q.value = 1.1;
    const g = ctx.createGain();
    const vol = hard ? 0.20 : 0.11;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.16);

    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(rand(95, 135), t);
    o.frequency.exponentialRampToValueAtTime(52, t + 0.09);
    const og = ctx.createGain();
    og.gain.setValueAtTime(vol * 0.85, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    o.connect(og); og.connect(this.master);
    o.start(t); o.stop(t + 0.13);
  },

  tick(on){
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(on ? 1900 : 1400, t);
    g.gain.setValueAtTime(0.025, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.03);
  },
  /* wybuch: niski spadający ton + szum przez filtr dolnoprzepustowy zamykający się w ~2.5 s (s: 0..1 — siła i odległość) */
  boom(s){
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + 1.2);
    og.gain.setValueAtTime(0.55 * s, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 1.5);
    for (let k = 0; k < 3; k++){                                             // trzask + dudnienie (3 nakładające się warstwy szumu)
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), t0 = t + k * 0.09;
      src.buffer = this.noise; src.loop = true;
      f.type = 'lowpass'; f.frequency.setValueAtTime(k ? 900 : 4000, t0); f.frequency.exponentialRampToValueAtTime(80, t0 + 2.4);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime((k ? 0.35 : 0.5) * s, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.6);
      src.connect(f); f.connect(g); g.connect(this.master); src.start(t0); src.stop(t0 + 2.7);
    }
  },
  thud(strength){
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.min(0.4, 0.05 + strength * 0.02), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.32);

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 0.8;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(Math.min(0.3, 0.03 + strength * 0.018), t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    src.connect(f); f.connect(ng); ng.connect(this.master);
    src.start(t); src.stop(t + 0.2);
  },

  hurt(){
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(210, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.22);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.28);
  },

  shoot(rifle){
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rifle ? 1.25 : 1.6;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = rifle ? 1250 : 1800; f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(rifle ? 0.3 : 0.34, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (rifle ? 0.13 : 0.09));
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.1);

    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.06);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.26, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(og); og.connect(this.master);
    o.start(t); o.stop(t + 0.08);
  },

  reload(){
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [0, 0.11].forEach(off => {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(off === 0 ? 520 : 700, t + off);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.10, t + off);
      g.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.045);
      o.connect(g); g.connect(this.master);
      o.start(t + off); o.stop(t + off + 0.05);
    });
  },

  swing(){
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.9;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(2200, t + 0.16);
    f.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.18);
  },

  /* syrena radiowozów (police.js): dwa tony zawodzące wolnym LFO, głośność wg najbliższego radiowozu w pościgu (0..1) */
  sirenNodes: null, _sirNpc: 0, _sirMe: 0, _ambNpc: 0, _ambMe: 0,
  siren(vol){ this._sirNpc = vol; this._sirenApply(Math.max(vol * 0.07, this._sirMe * 0.3)); },
  sirenSelf(vol){ this._sirMe = vol; this._sirenApply(Math.max(this._sirNpc * 0.07, vol * 0.3)); },   // skradziony radiowóz gracza (H) — głośniej, w aucie ponad silnikiem
  _sirenApply(level){
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (!this.sirenNodes){
      if (level <= 0.0001) return;
      const g = ctx.createGain(); g.gain.value = 0;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 0.9;
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 900;
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.32;              // wycie: 600–1300 Hz co ~3 s
      const lg = ctx.createGain(); lg.gain.value = 350; lfo.connect(lg); lg.connect(o.frequency);
      o.connect(f); f.connect(g); g.connect(this.master); o.start(); lfo.start();
      this.sirenNodes = { g: g, o: o, lfo: lfo };
    }
    this.sirenNodes.g.gain.setTargetAtTime(level, t, 0.15);
  },
  /* syrena karetek (ambulances.js): dwa tony na zmianę (hi-lo ~0.7 s), głośność wg najbliższej karetki na sygnale (0..1) */
  ambNodes: null,
  ambSiren(vol){ this._ambNpc = vol; this._ambApply(Math.max(vol * 0.045, this._ambMe * 0.2)); },
  ambSelf(vol){ this._ambMe = vol; this._ambApply(Math.max(this._ambNpc * 0.045, vol * 0.2)); },     // skradziona karetka gracza (H)
  _ambApply(level){
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (!this.ambNodes){
      if (level <= 0.0001) return;
      const g = ctx.createGain(); g.gain.value = 0;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.1;
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 820;
      const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 0.72;            // 660 / 980 Hz na zmianę
      const lg = ctx.createGain(); lg.gain.value = 160; lfo.connect(lg); lg.connect(o.frequency);
      o.connect(f); f.connect(g); g.connect(this.master); o.start(); lfo.start();
      this.ambNodes = { g: g, o: o, lfo: lfo };
    }
    this.ambNodes.g.gain.setTargetAtTime(level, t, 0.15);
  },
  /* „blip” przy włączaniu (w górę) / wyłączaniu (w dół) sygnałów pojazdu służb — słychać od razu po H */
  chirp(up){
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(up ? 600 : 1300, t); o.frequency.exponentialRampToValueAtTime(up ? 1300 : 600, t + 0.22);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.3);
  },
  /* wirnik helikoptera (heli.js): szum przez filtr pasmowy, głośność modulowana „łopatami” (rate Hz), vol 0..1 */
  rotorNodes: null,
  rotor(vol, rate){
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (!this.rotorNodes){
      if (vol <= 0.001) return;
      const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 1.2;
      const am = ctx.createGain(); am.gain.value = 0.5;
      const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 12;
      const lg = ctx.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(am.gain);
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(am); am.connect(g); g.connect(this.master); src.start(); lfo.start();
      this.rotorNodes = { g: g, lfo: lfo };
    }
    this.rotorNodes.lfo.frequency.setTargetAtTime(Math.max(2, rate || 12), t, 0.3);
    this.rotorNodes.g.gain.setTargetAtTime(clamp(vol, 0, 1) * 0.5, t, 0.2);
  }
};

let _crashT = -9, _crashD = 0, _carCrashT = -9, _carCrashV = 14;
/* dźwięk uderzenia karoserii + obrażenia od kraksy + potrącenie pieszego */
chassisBody.addEventListener('collide', e => {
  const v = e.contact ? Math.abs(e.contact.getImpactVelocityAlongNormal()) : 0;
  if (v > 3.2) Sound.thud(v);
  /* obrażenia raz na kraksę (kilka kształtów naraz = kilka zdarzeń): najmocniejsze uderzenie w oknie 0.4 s */
  if (mode === 'car' && v > 11){ const d = (v - 11) * 3.6; if (clock - _crashT > 0.4){ _crashT = clock; _crashD = 0; } if (d > _crashD){ damagePlayer(d - _crashD, 'kraksa'); _crashD = d; } }
  if (e.body && e.body.copRef && v > 2.2){ if (mode === 'car') copHit(e.body.copRef, v > 7 ? 100 : 40, 'auto'); }   // policjant pieszo (police.js)
  else if (e.body && e.body.isPed && v > 2.2){ const pd = e.body.pedRef; if (mode === 'car' && pd && pd.state !== 'down') policeCrime(v > 7 ? 'zabójstwo' : 'potrącenie', pd.pos.x, pd.pos.y); Pedestrians.hit(pd, v); }   // body.pedRef = obiekt pieszego (samo ciało nie ma group/state)
  if (e.body && e.body.npcRef && v > 5.6){ const n = e.body.npcRef; if (n.cop) policeRammed(n, v); else npcHitByPlayer(n, v); if (v > 10){ n.hp = (n.hp === undefined ? 100 : n.hp) - (v - 10) * 3.6; if (n.hp <= 0) _boomQueue.push(() => destroyNpcCar(n, true)); } }   // > 20 km/h: NPC staje; od 36 km/h traci zdrowie (wybuch dopiero po ciężkich kraksach)
  /* stan auta gracza: najmocniejsze uderzenie w oknie 0.4 s */
  /* radiowóz (ciało kinematyczne = nieskończona masa) liczony łagodniej — PIT i taranowanie bez wybuchu przy pierwszym kontakcie */
  const vc = e.body && e.body.npcRef && e.body.npcRef.cop ? v * 0.55 : v;
  if (vc > CAR_CRASH_V0){ if (clock - _carCrashT > 0.4){ _carCrashT = clock; _carCrashV = CAR_CRASH_V0; } if (vc > _carCrashV){ const dv = vc, prev = _carCrashV; _carCrashV = vc; _boomQueue.push(() => carCrashDamage(dv, prev)); } }
});
