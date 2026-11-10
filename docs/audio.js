/* ═══════════════════════════════════════════════════════════
   MANAN SHAH — PORTFOLIO · THE SCORE
   Loaded only when someone presses the sound toggle. Nothing
   here runs, or is even downloaded, for a silent visit.
   ═══════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════
   1 · FLIGHT SCORE (generative WebAudio, no files)

   Rewritten 2026-10. The old bed was a sawtooth engine drone
   plus a static A-major pad, which sat on one chord forever and
   fought the page. This is an actual piece of music: a slow
   four-chord dusk progression in A minor (Am9 - Fmaj9 - Cmaj9 -
   Gmaj6), a soft bell voice that arpeggiates the chord currently
   sounding, a filtered air bed instead of an engine, and a sub
   that breathes. Everything is scheduled ahead of the clock so
   it never stutters when the main thread is busy with Three.js.
   ════════════════════════════════════════════ */

/* scale degrees in Hz, A minor. Each chord is [root, ...voicing] */
const PROGRESSION = [
  { pad: [110.00, 164.81, 196.00, 261.63], bells: [440.00, 523.25, 659.25, 783.99, 880.00] }, // Am9
  { pad: [87.31, 174.61, 220.00, 261.63], bells: [349.23, 440.00, 523.25, 698.46, 880.00] },  // Fmaj9
  { pad: [130.81, 196.00, 246.94, 329.63], bells: [392.00, 493.88, 587.33, 659.25, 783.99] }, // Cmaj9
  { pad: [98.00, 146.83, 196.00, 246.94], bells: [392.00, 493.88, 587.33, 739.99, 880.00] },  // Gmaj6
];
const BAR = 7.4;          // seconds per chord
const BELL_GRID = 0.925;  // eighth-note grid for the bell voice

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.on = false;
    this.master = null;
    this.lastBell = 0;
    this.chordIndex = 0;
    this.nextChordAt = 0;
    this.nextBellAt = 0;
    this.bellStep = 0;
    this.timer = null;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const ctx = this.ctx;

    // ── master bus: gentle compression, then a shelf to take the edge off
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -24;
    comp.ratio.value = 4;
    comp.attack.value = 0.02;
    comp.release.value = 0.3;
    const tilt = ctx.createBiquadFilter();
    tilt.type = "highshelf";
    tilt.frequency.value = 3200;
    tilt.gain.value = -5;
    this.master.connect(comp).connect(tilt).connect(ctx.destination);

    // ── a long ping-pong-ish delay the bells sing into
    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = BELL_GRID * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 2200;
    const delayOut = ctx.createGain();
    delayOut.gain.value = 0.38;
    this.delay.connect(damp).connect(fb).connect(this.delay);
    this.delay.connect(delayOut).connect(this.master);

    // ── air bed: band-passed noise that answers the throttle. This is the
    //    airflow over the airframe, not an engine. No sawtooth anywhere.
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < nd.length; i++) {
      // pink-ish: one-pole smoothed white, much softer than raw noise
      lp = lp * 0.96 + (Math.random() * 2 - 1) * 0.04;
      nd[i] = lp * 3.2;
    }
    const air = ctx.createBufferSource();
    air.buffer = noiseBuf;
    air.loop = true;
    this.airFilter = ctx.createBiquadFilter();
    this.airFilter.type = "bandpass";
    this.airFilter.frequency.value = 420;
    this.airFilter.Q.value = 0.6;
    this.airGain = ctx.createGain();
    this.airGain.gain.value = 0.055;
    air.connect(this.airFilter).connect(this.airGain).connect(this.master);
    air.start();
    const airLfo = ctx.createOscillator();
    airLfo.frequency.value = 0.045;
    const airLfoGain = ctx.createGain();
    airLfoGain.gain.value = 190;
    airLfo.connect(airLfoGain).connect(this.airFilter.frequency);
    airLfo.start();

    // ── pad bus: four detuned voices, retuned on every chord change
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = "lowpass";
    this.padFilter.frequency.value = 900;
    this.padFilter.Q.value = 0.7;
    this.padBus = ctx.createGain();
    this.padBus.gain.value = 0.09;
    this.padFilter.connect(this.padBus).connect(this.master);
    // a little of the pad into the delay for depth
    const padSend = ctx.createGain();
    padSend.gain.value = 0.12;
    this.padBus.connect(padSend).connect(this.delay);

    this.padVoices = PROGRESSION[0].pad.map((freq, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? "sine" : "triangle";
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.5 : 0.3;
      // slow independent drift so the chord never sounds static
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07 + i * 0.031;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 4 + i;
      lfo.connect(lfoGain).connect(o.detune);
      o.connect(g).connect(this.padFilter);
      o.start();
      lfo.start();
      return { osc: o, gain: g };
    });

    // ── sub: one octave under the root, breathing
    this.sub = ctx.createOscillator();
    this.sub.type = "sine";
    this.sub.frequency.value = PROGRESSION[0].pad[0] / 2;
    this.subGain = ctx.createGain();
    this.subGain.gain.value = 0.085;
    const subLfo = ctx.createOscillator();
    subLfo.frequency.value = 0.09;
    const subLfoGain = ctx.createGain();
    subLfoGain.gain.value = 0.03;
    subLfo.connect(subLfoGain).connect(this.subGain.gain);
    this.sub.connect(this.subGain).connect(this.master);
    this.sub.start();
    subLfo.start();

    const now = ctx.currentTime;
    this.nextChordAt = now + 0.1;
    this.nextBellAt = now + BAR * 0.5;
  }

  /* retune the pad + sub to a chord, glided rather than jumped */
  setChord(i, when) {
    const chord = PROGRESSION[i % PROGRESSION.length];
    this.padVoices.forEach((v, n) => {
      const f = chord.pad[n % chord.pad.length];
      v.osc.frequency.setTargetAtTime(f, when, 1.1);
    });
    this.sub.frequency.setTargetAtTime(chord.pad[0] / 2, when, 1.4);
  }

  /* one struck bell: a sine with a fast attack and a long tail, plus a
     quiet octave partial so it reads as a plucked mallet, not a beep */
  strike(freq, when, vel = 1) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.055 * vel, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 2.4);
    g.connect(this.master);
    g.connect(this.delay);

    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = freq;
    o.connect(g);
    o.start(when);
    o.stop(when + 2.5);

    const p = ctx.createOscillator();
    p.type = "sine";
    p.frequency.value = freq * 2.004;
    const pg = ctx.createGain();
    pg.gain.value = 0.22;
    p.connect(pg).connect(g);
    p.start(when);
    p.stop(when + 1.2);
  }

  /* look ahead ~250ms and schedule whatever falls in the window. Running
     off a timer rather than the render loop keeps the music steady even
     when a frame takes 40ms to draw a city. */
  schedule() {
    if (!this.ctx || !this.on) return;
    const horizon = this.ctx.currentTime + 0.25;

    while (this.nextChordAt < horizon) {
      this.setChord(this.chordIndex, this.nextChordAt);
      // mark the chord change with the root an octave up, very soft
      const chord = PROGRESSION[this.chordIndex % PROGRESSION.length];
      this.strike(chord.pad[1] * 2, this.nextChordAt, 0.5);
      this.chordIndex++;
      this.nextChordAt += BAR;
    }

    while (this.nextBellAt < horizon) {
      // sparse: only about a third of the grid positions sound, so it
      // stays a texture and never becomes a melody competing with reading
      if (Math.random() < 0.34) {
        const chord = PROGRESSION[(this.chordIndex - 1 + PROGRESSION.length) % PROGRESSION.length];
        const notes = chord.bells;
        // walk the voicing rather than jumping randomly around it
        this.bellStep += Math.random() < 0.5 ? 1 : -1;
        const f = notes[((this.bellStep % notes.length) + notes.length) % notes.length];
        this.strike(f, this.nextBellAt, 0.55 + Math.random() * 0.35);
      }
      this.nextBellAt += BELL_GRID;
    }
  }

  /* section-change chime: still here, now tuned to the current chord so a
     checkpoint lands in key instead of on a fixed scale */
  bell(step = 0) {
    if (!this.ctx || !this.on) return;
    const now = this.ctx.currentTime;
    if (now - this.lastBell < 0.2) return;
    this.lastBell = now;
    const chord = PROGRESSION[(this.chordIndex - 1 + PROGRESSION.length) % PROGRESSION.length];
    const notes = chord.bells;
    this.strike(notes[Math.abs(step) % notes.length], now + 0.01, 1.15);
  }

  /* the scroll throttle opens the airflow and brightens the pad. The
     music itself keeps its own tempo: scrolling changes the air, not the
     beat, which is why fast scrolling no longer sounds like a siren. */
  setScrollEnergy(v) {
    if (!this.ctx || !this.on) return;
    const t = Math.min(Math.abs(v) * 3, 1);
    const now = this.ctx.currentTime;
    this.airFilter.frequency.setTargetAtTime(420 + t * 720, now, 0.25);
    this.airGain.gain.setTargetAtTime(0.055 + t * 0.05, now, 0.3);
    this.padFilter.frequency.setTargetAtTime(900 + t * 900, now, 0.4);
  }

  async start() {
    this.init();
    if (!this.ctx) return;
    await this.ctx.resume();
    this.on = true;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(0.9, this.ctx.currentTime, 1.6);
    if (!this.timer) this.timer = setInterval(() => this.schedule(), 120);
    this.schedule();
  }

  stop() {
    if (!this.ctx) return;
    this.on = false;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }
}
