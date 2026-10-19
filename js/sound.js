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

  setMuted(m){
    if (!this.ready) return;
    this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
  },

  /* rpm01: 0..1, load: 0..1 */
  engine(on, rpm01, load){
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const f = 42 + rpm01 * 168;
    this.eng.frequency.setTargetAtTime(f, t, 0.06);
    this.sub.frequency.setTargetAtTime(f * 0.5, t, 0.06);
    this.engFilter.frequency.setTargetAtTime(280 + rpm01 * 1700 + load * 420, t, 0.08);
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

  shoot(){
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 1.6;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.34, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
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
  }
};

/* dźwięk uderzenia karoserii + obrażenia od kraksy + potrącenie pieszego */
chassisBody.addEventListener('collide', e => {
  const v = e.contact ? Math.abs(e.contact.getImpactVelocityAlongNormal()) : 0;
  if (v > 3.2) Sound.thud(v);
  if (mode === 'car' && v > 10) damagePlayer((v - 10) * 4, 'kraksa');
  if (e.body && e.body.isPed && v > 2.2) Pedestrians.hit(e.body, v);
});
