/* ═══════════════════════════════════════════════════════════
   MANAN SHAH — PORTFOLIO
   A dusk open world flown third-person: PBR materials, real
   planar water reflections, cities with traffic, a suspension
   bridge, helicopters, balloons, boats. Scroll is the throttle
   AND the altitude: sky → deck-level → back into the sunset.
   Every model is procedural — zero asset downloads.
   ═══════════════════════════════════════════════════════════ */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { Reflector } from "three/addons/objects/Reflector.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { Lensflare, LensflareElement } from "three/addons/objects/Lensflare.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// if the animation CDNs failed, degrade to a static readable page
if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") {
  document.getElementById("preloader")?.remove();
  document.getElementById("enterOverlay")?.remove();
  document.querySelectorAll(".char, .w-inner").forEach((c) => { c.style.transform = "none"; c.style.opacity = "1"; });
  throw new Error("Animation libraries unavailable; rendering static portfolio.");
}
gsap.registerPlugin(ScrollTrigger);
window.__4D_BOOTED = true;

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isTouch = window.matchMedia("(hover: none), (pointer: coarse)").matches;
const LOW_PERF = window.innerWidth < 900;

/* ────────────────────────────────────────────
   STATE
   ──────────────────────────────────────────── */
const state = {
  scroll: 0,
  scrollVel: 0,
  travel: 0,
  alt: 22,          // smoothed flight altitude
  mouse: { x: 0, y: 0 },
  mouseLerp: { x: 0, y: 0 },
  entered: false,
};

/* ════════════════════════════════════════════
   1 · FLIGHT AUDIO (WebAudio, no files)
   ════════════════════════════════════════════ */
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.on = false;
    this.master = null;
    this.lastBell = 0;
  }
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -26;
    comp.ratio.value = 5;
    this.master.connect(comp).connect(ctx.destination);

    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * 0.5;
    const wind = ctx.createBufferSource();
    wind.buffer = noiseBuf;
    wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = "bandpass";
    this.windFilter.frequency.value = 550;
    this.windFilter.Q.value = 0.45;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.03;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.master);
    wind.start();
    const windLfo = ctx.createOscillator();
    windLfo.frequency.value = 0.06;
    const windLfoGain = ctx.createGain();
    windLfoGain.gain.value = 240;
    windLfo.connect(windLfoGain).connect(this.windFilter.frequency);
    windLfo.start();

    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = "lowpass";
    this.engineFilter.frequency.value = 190;
    this.engineFilter.Q.value = 1.1;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.045;
    this.engineFilter.connect(this.engineGain).connect(this.master);
    this.engineOscs = [];
    for (const [freq, det] of [[42, 0], [63.5, 7]]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = freq;
      o.detune.value = det;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      o.connect(g).connect(this.engineFilter);
      o.start();
      this.engineOscs.push(o);
    }

    const padFilter = ctx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 760;
    const padGain = ctx.createGain();
    padGain.gain.value = 0.05;
    padFilter.connect(padGain).connect(this.master);
    [[110, 0.13], [138.59, 0.11], [164.81, 0.17], [220, 0.09]].forEach(([freq, rate], i) => {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = i === 3 ? 0.35 : 0.55;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rate;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 5.5;
      lfo.connect(lfoGain).connect(o.detune);
      o.connect(g).connect(padFilter);
      o.start();
      lfo.start();
    });

    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = 0.46;
    const fb = ctx.createGain();
    fb.gain.value = 0.34;
    const delayOut = ctx.createGain();
    delayOut.gain.value = 0.5;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(delayOut).connect(this.master);
  }
  bell(step = 0) {
    if (!this.ctx || !this.on) return;
    const now = this.ctx.currentTime;
    if (now - this.lastBell < 0.18) return;
    this.lastBell = now;
    const scale = [440, 493.88, 554.37, 659.25, 739.99, 880];
    const freq = scale[Math.abs(step) % scale.length];
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.05, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
    o.connect(g);
    g.connect(this.master);
    g.connect(this.delay);
    o.start(now);
    o.stop(now + 1.6);
  }
  setScrollEnergy(v) {
    if (!this.ctx || !this.on) return;
    const t = Math.min(Math.abs(v) * 3, 1);
    const now = this.ctx.currentTime;
    this.engineFilter.frequency.setTargetAtTime(190 + t * 850, now, 0.2);
    this.engineGain.gain.setTargetAtTime(0.045 + t * 0.05, now, 0.25);
    this.engineOscs[0].frequency.setTargetAtTime(42 * (1 + t * 0.22), now, 0.3);
    this.engineOscs[1].frequency.setTargetAtTime(63.5 * (1 + t * 0.22), now, 0.3);
    this.windGain.gain.setTargetAtTime(0.03 + t * 0.045, now, 0.25);
  }
  async start() {
    this.init();
    if (!this.ctx) return;
    await this.ctx.resume();
    this.on = true;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(0.85, this.ctx.currentTime, 1.2);
  }
  stop() {
    if (!this.ctx) return;
    this.on = false;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
  }
}
const audio = new AudioEngine();

const audioToggle = document.getElementById("audioToggle");
const audioLabel = document.getElementById("audioLabel");
function setAudioUI(on) {
  audioToggle.classList.toggle("is-on", on);
  audioLabel.textContent = on ? "SOUND ON" : "SOUND OFF";
}
audioToggle.addEventListener("click", async () => {
  if (audio.on) { audio.stop(); setAudioUI(false); }
  else { await audio.start(); setAudioUI(true); }
});

/* ════════════════════════════════════════════
   2 · WORLD CONSTANTS + HELPERS
   ════════════════════════════════════════════ */
const CAM_Z = 10;
const WORLD_LEN = 720;
const CHUNKS = 12;
const SPACING = WORLD_LEN / CHUNKS;

let renderer, scene, camera, composer, bloomPass;
let islands = [], clouds = [], lanterns = [], traffic = [], blinkers = [];
let boats = [], balloons = [], cars = [], rotors = [];
let birds = [], bridgeCars = [], tailRotors = [], beamRotors = [], flameSprites = [], foamSprites = [];
let spinners = [];
let waterShimmer = null, waterShimmerB = null;
let starsA = null, starsB = null, airDust = null, airDustBase = null;
let cloudShadows = [], rings = [];
let wheels = [], buoys = [], coastCars = [];
let waveMesh = null, waveBase = null;
let planeCubeCam = null, planeEnvRT = null, envWaterProxy = null, waterMirror = null;
let gradePass = null, planeBlob = null, sprays = [], jets = [];
let cubeFrame = 0;
let ANISO = 1;
let HIGH_END = false;
let ourPlane, trailMats = [], glintA, glintB;
let webglOK = false;

const mod = (n, m) => ((n % m) + m) % m;
const rnd = (() => { let s = 1337; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();

/* wrap a world offset into (30 - WORLD_LEN, 30]; travel moves the world
   TOWARD the camera (+Z), so scrolling reads as flying forward */
const wrapZ = (offset, travel) => (30 - WORLD_LEN) + mod(offset + travel, WORLD_LEN);

/* roughen a geometry's silhouette so nothing looks machine-perfect */
function jitter(geo, amt) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const h = Math.sin(i * 127.1) * 43758.5453;
    const n = (h - Math.floor(h)) - 0.5;
    pos.setX(i, pos.getX(i) * (1 + n * amt));
    pos.setZ(i, pos.getZ(i) * (1 + n * amt * 0.8));
  }
  geo.computeVertexNormals();
  return geo;
}

/* ── canvas textures ── */
function makeSkyTexture() {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 1024;
  const g = c.getContext("2d");
  // bright tropical day: rich blue zenith washing down to a pale glare band
  const grad = g.createLinearGradient(0, 0, 0, 1024);
  grad.addColorStop(0.0, "#2a63c2");
  grad.addColorStop(0.26, "#3d7bce");
  grad.addColorStop(0.42, "#66a0da");
  grad.addColorStop(0.51, "#a3cbe7");
  grad.addColorStop(0.555, "#e4f1f7");
  grad.addColorStop(0.62, "#b6d5e8");
  grad.addColorStop(1.0, "#87b4d4");
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 1024);
  // soft white glare streaks just above the horizon
  for (let i = 0; i < 4; i++) {
    const y = 512 + i * 8 + Math.random() * 5;
    g.fillStyle = "rgba(255,255,255,0.2)";
    g.fillRect(0, y, 512, 2 + Math.random() * 3);
  }
  // puffy white cumulus: sunlit tops, soft grey-blue undersides. Kept off
  // the zenith, where the dome's UV stretching smears painted clouds.
  const cumulus = (cx, cy, s) => {
    g.save();
    g.fillStyle = "rgba(148,168,192,0.4)";
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.ellipse(cx + (i - 2) * 9 * s, cy + 3.5 * s, 10 * s, 3.5 * s, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.shadowBlur = 7;
    g.shadowColor = "rgba(255,255,255,0.9)";
    g.fillStyle = "rgba(255,255,255,0.94)";
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.ellipse(cx + (i - 2) * 8.5 * s, cy - 2 * s + Math.abs(i - 2) * 1.2, 9.5 * s, 4.6 * s - Math.abs(i - 2) * 0.8, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  };
  for (let i = 0; i < 11; i++) {
    cumulus(20 + Math.random() * 472, 455 + Math.random() * 50, 0.5 + Math.random() * 1);
  }
  for (let i = 0; i < 6; i++) {
    cumulus(30 + Math.random() * 452, 372 + Math.random() * 70, 0.8 + Math.random() * 1.1);
  }
  return new THREE.CanvasTexture(c);
}

function makeRadialSprite(stops, size = 128) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [p, col] of stops) grad.addColorStop(p, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

/* realistic office tower: floor bands, mullions, mixed lit/dark floors */
function makeWindowTexture(seed) {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 256;
  const g = c.getContext("2d");
  // daytime facade: light masonry, windows read as blue sky-glass with the
  // occasional interior light, not a night grid of lit amber
  g.fillStyle = "#c9cfd8";
  g.fillRect(0, 0, 128, 256);
  let s = seed;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let fy = 4; fy < 250; fy += 7) {
    for (let fx = 4; fx < 122; fx += 6) {
      const roll = r();
      if (roll < 0.72) {
        const b = 0.5 + r() * 0.5; // glass catching more or less sky
        g.fillStyle = `rgba(${Math.floor(88 * b + 40)},${Math.floor(118 * b + 50)},${Math.floor(158 * b + 60)},0.92)`;
        g.fillRect(fx, fy, 4, 4);
      } else if (roll < 0.76) {
        g.fillStyle = "rgba(255,238,190,0.85)"; // rare interior light
        g.fillRect(fx, fy, 4, 4);
      }
    }
  }
  // vertical mullions + floor lines
  g.fillStyle = "rgba(90,98,112,0.4)";
  for (let x = 0; x < 128; x += 24) g.fillRect(x, 0, 1, 256);
  g.fillStyle = "rgba(90,98,112,0.25)";
  for (let y = 0; y < 256; y += 14) g.fillRect(0, y, 128, 1);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

function makeCloudTexture() {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 128;
  const g = c.getContext("2d");
  for (let i = 0; i < 6; i++) {
    const x = 40 + Math.random() * 176, y = 45 + Math.random() * 38, r = 24 + Math.random() * 36;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(216,206,232,0.45)");
    grad.addColorStop(1, "rgba(216,206,232,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 128);
  }
  return new THREE.CanvasTexture(c);
}

function makeTrailTexture() {
  const c = document.createElement("canvas");
  c.width = 16; c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "rgba(255,255,255,0.8)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 256);
  return new THREE.CanvasTexture(c);
}

/* mountain skin: rock striations low, snow cap high. ConeGeometry's V runs
   0 at the base to 1 at the apex, so this gradient reads as a real peak. */
function makeMountainTexture(seed) {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 256;
  const g = c.getContext("2d");
  let s = seed;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const grad = g.createLinearGradient(0, 256, 0, 0); // bottom(v=0) → top(v=1)
  grad.addColorStop(0.0, "#241f38");
  grad.addColorStop(0.42, "#3a3255");
  grad.addColorStop(0.66, "#57517a");
  grad.addColorStop(0.8, "#8783a0");
  grad.addColorStop(0.88, "#cfcbdc");
  grad.addColorStop(1.0, "#f5f3fa");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  // vertical rock striations (ridgelines catching the last light)
  for (let i = 0; i < 46; i++) {
    const x = r() * 128;
    const y0 = 256 - r() * 210;
    const len = 30 + r() * 90;
    g.strokeStyle = r() < 0.5 ? "rgba(0,0,0,0.14)" : "rgba(255,255,255,0.07)";
    g.lineWidth = 1 + r() * 2;
    g.beginPath();
    g.moveTo(x, y0);
    g.lineTo(x + (r() - 0.5) * 14, y0 - len);
    g.stroke();
  }
  // scattered snow patches just below the cap
  for (let i = 0; i < 18; i++) {
    g.fillStyle = `rgba(255,255,255,${0.1 + r() * 0.25})`;
    g.beginPath();
    g.ellipse(r() * 128, 18 + r() * 55, 3 + r() * 8, 2 + r() * 4, 0, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.x = 2;
  return tex;
}

function makeBirdTexture() {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 32;
  const g = c.getContext("2d");
  g.strokeStyle = "rgba(20,18,32,0.85)";
  g.lineWidth = 3;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(4, 20);
  g.quadraticCurveTo(20, 4, 32, 16);
  g.quadraticCurveTo(44, 4, 60, 20);
  g.stroke();
  return new THREE.CanvasTexture(c);
}

function makeBeamTexture() {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 32;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, "rgba(255,224,170,0.85)");
  grad.addColorStop(1, "rgba(255,224,170,0)");
  g.fillStyle = grad;
  for (let y = 0; y < 32; y++) {
    const fade = 1 - Math.abs(y - 16) / 16;
    g.globalAlpha = fade;
    g.fillRect(0, y, 128, 1);
  }
  g.globalAlpha = 1;
  return new THREE.CanvasTexture(c);
}

/* tileable water shimmer: a handful of very soft ripple bands, scrolled in
   the tick loop. Kept sparse and low-contrast on purpose — a busy or bright
   tiled texture aliases into a harsh bright grid once it recedes toward the
   horizon at a grazing angle. */
function makeRippleTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  for (let i = 0; i < 10; i++) {
    const y = (i / 10) * 256 + Math.sin(i * 12.9) * 10;
    g.strokeStyle = `rgba(255,214,180,0.05)`;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 256; x += 16) {
      g.lineTo(x, y + Math.sin(x * 0.05 + i) * 6);
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

/* mottled ground: base color with organic light/dark speckle, tileable */
function makeGroundTexture(base, light, dark, seed) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  let s = seed;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 700; i++) {
    g.fillStyle = r() < 0.5 ? light : dark;
    g.globalAlpha = 0.06 + r() * 0.14;
    const size = 1 + r() * 3;
    g.fillRect(r() * 128, r() * 128, size, size);
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.anisotropy = ANISO;
  return tex;
}

/* jet fan disc: radial blades, spun in the tick loop */
function makeFanTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  g.translate(32, 32);
  for (let i = 0; i < 12; i++) {
    g.rotate(Math.PI / 6);
    g.fillStyle = i % 2 ? "rgba(120,125,140,0.9)" : "rgba(70,74,90,0.9)";
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(4, -28);
    g.lineTo(-4, -28);
    g.closePath();
    g.fill();
  }
  return new THREE.CanvasTexture(c);
}

/* airliner-grade fuselage skin baked in canvas: silver belly to white crown,
   cabin windows on both flanks, an orange cheatline, panel seams, rivet rows
   and exhaust grime. Lathe UVs: u wraps the hull (0=right flank, .25=belly,
   .5=left flank, .75=crown), v runs nose(0)→tail(1), so v=0 sits at the
   BOTTOM of the canvas (flipY). */
const FUS_FRAMES = [0.08, 0.16, 0.26, 0.36, 0.48, 0.6, 0.72, 0.84, 0.93];
function makeFuselageTexture() {
  const W = 1024, H = 512;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  const vy = (v) => H - v * H;
  // paint: silver-gray belly washing up to a bright white crown
  const grad = g.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0.0, "#e8eaf0");
  grad.addColorStop(0.25, "#c6cad4");
  grad.addColorStop(0.5, "#e8eaf0");
  grad.addColorStop(0.75, "#f8f9fc");
  grad.addColorStop(1.0, "#e8eaf0");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // longitudinal stringers (nose→tail = vertical in canvas space)
  g.strokeStyle = "rgba(40,50,66,0.07)";
  g.lineWidth = 1;
  for (let x = 32; x < W; x += 64) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
  }
  // frame stations: seam rings around the hull, with twin rivet rows
  for (const v of FUS_FRAMES) {
    const y = vy(v);
    g.strokeStyle = "rgba(40,50,66,0.13)";
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    g.fillStyle = "rgba(30,40,56,0.15)";
    for (let x = 4; x < W; x += 9) {
      g.fillRect(x, y - 4, 1.6, 1.6);
      g.fillRect(x + 4, y + 3, 1.6, 1.6);
    }
  }
  // orange cheatline down both flanks, nose to tail (soft edges)
  for (const fx of [0, W / 2, W]) {
    const lg = g.createLinearGradient(fx - 26, 0, fx + 26, 0);
    lg.addColorStop(0, "rgba(232,120,64,0)");
    lg.addColorStop(0.5, "rgba(232,120,64,0.95)");
    lg.addColorStop(1, "rgba(232,120,64,0)");
    g.fillStyle = lg;
    g.fillRect(fx - 26, vy(0.97), 52, vy(0.1) - vy(0.97));
  }
  // cabin windows: a lengthwise row on each flank, just above the cheatline
  for (const fx of [W * 0.945, W * 0.555]) {
    for (let i = 0; i < 6; i++) {
      const y = vy(0.3 + i * 0.052);
      g.fillStyle = "#232c3e";
      g.beginPath();
      g.roundRect(fx - 7, y - 9, 14, 18, 5);
      g.fill();
      g.fillStyle = "rgba(140,190,230,0.55)"; // glass catching the sky
      g.fillRect(fx - 4, y - 7, 8, 5);
    }
  }
  // exhaust grime streaking back from the stacks, low on each flank
  for (const fx of [W * 0.08, W * 0.42]) {
    const sg = g.createLinearGradient(0, vy(0.1), 0, vy(0.42));
    sg.addColorStop(0, "rgba(30,26,24,0.32)");
    sg.addColorStop(1, "rgba(30,26,24,0)");
    g.fillStyle = sg;
    g.beginPath();
    g.moveTo(fx - 8, vy(0.1));
    g.lineTo(fx + 8, vy(0.1));
    g.lineTo(fx + 16, vy(0.42));
    g.lineTo(fx - 16, vy(0.42));
    g.closePath();
    g.fill();
  }
  // painted registration on the rear flanks, reading along the hull
  g.font = "bold 30px 'Geist Mono', monospace";
  g.fillStyle = "rgba(29,39,53,0.9)";
  g.textAlign = "center";
  for (const fx of [W * 0.97, W * 0.53]) {
    g.save();
    g.translate(fx, vy(0.78));
    g.rotate(Math.PI / 2);
    g.fillText("MS-26", 0, 0);
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/* matching bump map: seams read as grooves, rivets as raised dots, windows
   as recesses — the raking sun makes the skin read as riveted aluminum */
function makeFuselageBump() {
  const W = 1024, H = 512;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  const vy = (v) => H - v * H;
  g.fillStyle = "#808080";
  g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(0,0,0,0.22)";
  g.lineWidth = 1;
  for (let x = 32; x < W; x += 64) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
  }
  for (const v of FUS_FRAMES) {
    const y = vy(v);
    g.strokeStyle = "rgba(0,0,0,0.5)";
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    g.fillStyle = "rgba(255,255,255,0.55)";
    for (let x = 4; x < W; x += 9) {
      g.fillRect(x, y - 4, 1.6, 1.6);
      g.fillRect(x + 4, y + 3, 1.6, 1.6);
    }
  }
  g.fillStyle = "rgba(0,0,0,0.6)";
  for (const fx of [W * 0.945, W * 0.555]) {
    for (let i = 0; i < 6; i++) {
      const y = vy(0.3 + i * 0.052);
      g.beginPath();
      g.roundRect(fx - 7, y - 9, 14, 18, 5);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/* prop-wash disc: streaked arcs that rotate with the blades, reading as
   motion blur instead of a flat gray circle */
function makePropBlurTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 6, 64, 64, 64);
  grad.addColorStop(0, "rgba(60,66,84,0.4)");
  grad.addColorStop(0.75, "rgba(60,66,84,0.16)");
  grad.addColorStop(1, "rgba(60,66,84,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  // streaks: brighter arc smears at a few radii
  for (let i = 0; i < 9; i++) {
    const r = 16 + i * 5.4;
    const a0 = (i * 2.4) % (Math.PI * 2);
    g.strokeStyle = `rgba(210,218,232,${0.1 + (i % 3) * 0.04})`;
    g.lineWidth = 2.2;
    g.beginPath();
    g.arc(64, 64, r, a0, a0 + 2.4);
    g.stroke();
    g.beginPath();
    g.arc(64, 64, r, a0 + Math.PI, a0 + Math.PI + 2.4);
    g.stroke();
  }
  return new THREE.CanvasTexture(c);
}

/* ── materials: PBR, dusk-lit ── */
const MAT = {};
function initMaterials() {
  const winA = makeWindowTexture(7919);
  const winB = makeWindowTexture(104729);
  const winC = makeWindowTexture(15485863);
  const winD = makeWindowTexture(32452843);
  [winA, winB, winC, winD].forEach((t) => { t.anisotropy = ANISO; });
  const mkWall = (tint, tex) => new THREE.MeshStandardMaterial({
    color: tint, map: tex, emissive: 0xffffff, emissiveMap: tex,
    emissiveIntensity: 0.12, roughness: 0.45, metalness: 0.25,
  });
  MAT.walls = [
    mkWall(0xe4e7ec, winA), mkWall(0xd2d9e2, winB),
    mkWall(0xece6d8, winC), mkWall(0xc6d0da, winD),
  ];
  MAT.grass = new THREE.MeshStandardMaterial({
    map: makeGroundTexture("#4a7c50", "#6ba468", "#37623e", 4241), roughness: 0.95,
  });
  MAT.shore = new THREE.MeshStandardMaterial({
    map: makeGroundTexture("#d6c69e", "#eadfc2", "#b5a67f", 7333), roughness: 1,
  });
  // signage reads as painted hardware in daylight, not glowing tubes
  MAT.neonPink = new THREE.MeshStandardMaterial({ color: 0xd88aa6, roughness: 0.6 });
  MAT.neonCyan = new THREE.MeshStandardMaterial({ color: 0x7ec4bc, roughness: 0.6 });
  MAT.neonRed = new THREE.MeshStandardMaterial({ color: 0xc86a5e, roughness: 0.6 });
  MAT.neonBlue = new THREE.MeshStandardMaterial({ color: 0x7a9ac8, roughness: 0.6 });
  MAT.storefront = new THREE.MeshStandardMaterial({ color: 0xd8b98a, roughness: 0.7 });
  // faint white shimmer columns off the shorelines (subtle in daylight)
  const streakTex = makeTrailTexture();
  MAT.streaks = [0xffffff, 0xf0fbff, 0xe8fff8, 0xffffff].map((col) =>
    new THREE.MeshBasicMaterial({
      map: streakTex, color: col, transparent: true, opacity: 0.08,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  MAT.palmTrunk = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 });
  MAT.frond = new THREE.MeshStandardMaterial({ color: 0x3d8a52, roughness: 0.9, side: THREE.DoubleSide });
  MAT.intake = new THREE.MeshStandardMaterial({ color: 0x0e1018, roughness: 0.3, metalness: 0.9 });
  MAT.pool = new THREE.MeshBasicMaterial({ color: 0x4fd8e0 });
  MAT.canopy = new THREE.MeshStandardMaterial({
    color: 0x24303f, transparent: true, opacity: 0.72, roughness: 0.08, metalness: 0.85,
  });
  // tail registration decal, shared by the whole fleet
  const decal = document.createElement("canvas");
  decal.width = 128; decal.height = 64;
  const dg = decal.getContext("2d");
  dg.font = "bold 34px 'Geist Mono', monospace";
  dg.fillStyle = "#1d2735";
  dg.textAlign = "center";
  dg.fillText("MS-26", 64, 44);
  MAT.tailCode = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(decal), transparent: true, side: THREE.DoubleSide,
  });
  MAT.paint = [0xc0503e, 0x3e6ec0, 0xd8913a, 0x3ea08a, 0xd8d8dc, 0xf2f0e8].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.25 })
  );
  MAT.fan = new THREE.MeshBasicMaterial({ map: makeFanTexture(), transparent: true });
  MAT.rock = new THREE.MeshStandardMaterial({ color: 0x8f8d96, roughness: 0.9, flatShading: true });
  MAT.trunk = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 1 });
  MAT.leaf = new THREE.MeshStandardMaterial({ color: 0x357a44, roughness: 0.95 });
  MAT.leafDark = new THREE.MeshStandardMaterial({ color: 0x27603a, roughness: 0.95 });
  MAT.wallA = MAT.walls[0];
  MAT.wallB = MAT.walls[1];
  MAT.roof = new THREE.MeshStandardMaterial({ color: 0x9aa0ac, roughness: 0.85 });
  MAT.concrete = new THREE.MeshStandardMaterial({ color: 0xbcc2ca, roughness: 0.8 });
  MAT.tower = new THREE.MeshStandardMaterial({ color: 0xd9d2c2, roughness: 0.6 });
  MAT.towerTop = new THREE.MeshStandardMaterial({ color: 0xb8453f, roughness: 0.6 });
  MAT.fuselage = new THREE.MeshStandardMaterial({ color: 0xe8e9ee, roughness: 0.22, metalness: 0.7 });
  // the hero hull: baked livery + rivet bump over polished aluminum
  const fusTex = makeFuselageTexture();
  fusTex.anisotropy = ANISO;
  const fusBump = makeFuselageBump();
  fusBump.anisotropy = ANISO;
  MAT.hull = new THREE.MeshStandardMaterial({
    map: fusTex, bumpMap: fusBump, bumpScale: 0.02,
    roughness: 0.2, metalness: 0.55,
  });
  MAT.wingA = new THREE.MeshStandardMaterial({ color: 0xff9e64, roughness: 0.38, metalness: 0.4 });
  MAT.wingB = new THREE.MeshStandardMaterial({ color: 0x7583ff, roughness: 0.38, metalness: 0.4 });
  MAT.wingC = new THREE.MeshStandardMaterial({ color: 0x58c4a5, roughness: 0.38, metalness: 0.4 });
  MAT.glassC = new THREE.MeshStandardMaterial({ color: 0x161c33, roughness: 0.15, metalness: 0.8 });
  MAT.carBody = new THREE.MeshStandardMaterial({ color: 0x2a2a3e, roughness: 0.4, metalness: 0.6 });
  MAT.tank = new THREE.MeshStandardMaterial({ color: 0x8b8698, roughness: 0.6, metalness: 0.3 });
  // the sun sits behind these ridges, so they read mostly in silhouette —
  // a soft warm emissive (same trick as the lit windows) keeps the rock
  // and snow gradient legible without fighting the backlit mood
  const mountainTex = makeMountainTexture(55441);
  MAT.mountainNear = new THREE.MeshStandardMaterial({
    map: mountainTex, roughness: 0.98, fog: false,
    emissive: 0xffdcb0, emissiveMap: mountainTex, emissiveIntensity: 0.4,
  });
  MAT.mountainMid = new THREE.MeshStandardMaterial({
    color: 0x2f2a4a, roughness: 1, fog: false,
    emissive: 0x3a3358, emissiveIntensity: 0.35,
  });
  MAT.mountainFar = new THREE.MeshBasicMaterial({ color: 0x2a2444, fog: false });
  MAT.ridge = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, fog: false });
  MAT.beam = new THREE.MeshBasicMaterial({ map: makeBeamTexture(), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  MAT.bird = new THREE.SpriteMaterial({ map: makeBirdTexture(), transparent: true, opacity: 0.7, depthWrite: false });
  MAT.lightRed = new THREE.SpriteMaterial({ map: makeRadialSprite([[0, "rgba(255,120,110,1)"], [0.4, "rgba(255,70,60,0.5)"], [1, "rgba(255,70,60,0)"]], 64), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  MAT.lightGreen = new THREE.SpriteMaterial({ map: makeRadialSprite([[0, "rgba(140,255,170,1)"], [0.4, "rgba(70,255,120,0.5)"], [1, "rgba(70,255,120,0)"]], 64), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  MAT.lightAmber = new THREE.SpriteMaterial({ map: makeRadialSprite([[0, "rgba(255,214,150,1)"], [0.4, "rgba(255,180,100,0.5)"], [1, "rgba(255,180,100,0)"]], 64), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  MAT.lightWhite = new THREE.SpriteMaterial({ map: makeRadialSprite([[0, "rgba(255,255,255,1)"], [0.4, "rgba(230,235,255,0.5)"], [1, "rgba(230,235,255,0)"]], 64), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
}

/* ════════════════════════════════════════════
   3 · MODELS
   ════════════════════════════════════════════ */
/* a bush floatplane: smooth lathe fuselage, high strut-braced wing, round
   engine cowl with a spinning two-blade prop, twin pontoons on struts */
function makeAircraft(wingMat) {
  const g = new THREE.Group();

  const ctrl = {};

  // fuselage: revolve a stubby taildragger profile, nose toward -Z.
  // 48 segments + the baked livery: windows, seams, rivets, grime.
  const profile = [
    [0.001, -1.55], [0.18, -1.42], [0.3, -1.05], [0.34, -0.45],
    [0.3, 0.25], [0.2, 0.9], [0.1, 1.45], [0.001, 1.75],
  ].map(([r, z]) => new THREE.Vector2(r, z));
  const fus = new THREE.Mesh(new THREE.LatheGeometry(profile, 48), MAT.hull);
  fus.rotation.x = Math.PI / 2;
  g.add(fus);

  // round engine cowl with cooling gills + the prop assembly
  const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.42, 28), wingMat);
  cowl.rotation.x = Math.PI / 2;
  cowl.position.z = -1.6;
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.29, 28), MAT.intake);
  face.position.z = -1.82;
  face.rotation.y = Math.PI;
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const gill = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.07, 0.09), MAT.intake);
      gill.position.set(sx * 0.315, 0.1 - i * 0.1, -1.5);
      g.add(gill);
    }
  }
  const hub = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 14), MAT.hull);
  hub.rotation.x = -Math.PI / 2;
  hub.position.z = -1.94;
  // two twisted blades + a streaked blur disc, spun as one assembly
  const propG = new THREE.Group();
  for (const dir of [1, -1]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.74, 0.026), MAT.intake);
    blade.position.y = dir * 0.4;
    blade.rotation.y = dir * 0.42; // airfoil twist
    propG.add(blade);
  }
  const blur = new THREE.Mesh(
    new THREE.CircleGeometry(0.76, 28),
    new THREE.MeshBasicMaterial({ map: makePropBlurTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide })
  );
  blur.position.z = 0.012;
  propG.add(blur);
  propG.position.z = -1.88;
  spinners.push(propG);
  g.add(cowl, face, hub, propG);

  // cockpit glasshouse: framed panes, instrument panel, pilot inside
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.85), MAT.canopy);
  cabin.position.set(0, 0.28, -0.72);
  g.add(cabin);
  for (const fz of [-1.13, -0.86, -0.31]) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.315, 0.024), MAT.intake);
    frame.position.set(0, 0.28, fz);
    g.add(frame);
  }
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.06), MAT.intake);
  panel.position.set(0, 0.3, -1.08);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshStandardMaterial({ color: 0xd9b08c, roughness: 0.8 }));
  head.position.set(0.09, 0.32, -0.68);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.12), new THREE.MeshStandardMaterial({ color: 0x8a4a3a, roughness: 0.85 }));
  torso.position.set(0.09, 0.2, -0.68);
  // windshield sheen: a soft sun-catch on the front pane
  const sheen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.16),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  sheen.position.set(0.06, 0.33, -1.15);
  sheen.rotation.y = Math.PI;
  sheen.rotation.x = 0.14;
  g.add(panel, head, torso, sheen);

  // antenna wire from the cabin roof to the fin tip
  const wireFrom = new THREE.Vector3(0, 0.44, -0.7);
  const wireTo = new THREE.Vector3(0, 0.76, 1.32);
  const wireDir = wireTo.clone().sub(wireFrom);
  const wire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, wireDir.length(), 4),
    MAT.intake
  );
  wire.position.copy(wireFrom).add(wireDir.clone().multiplyScalar(0.5));
  wire.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), wireDir.normalize());
  g.add(wire);
  // belly whip antenna
  const whip = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.3, 4), MAT.intake);
  whip.position.set(0.1, -0.4, 0.4);
  whip.rotation.x = 0.4;
  g.add(whip);

  // exhaust stacks behind the cowl
  for (const sx of [-1, 1]) {
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.2, 6), MAT.intake);
    stack.position.set(sx * 0.24, -0.14, -1.32);
    stack.rotation.x = 0.9;
    g.add(stack);
  }

  // tail registration on both sides of the fin
  for (const sx of [-1, 1]) {
    const code = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), MAT.tailCode);
    code.position.set(sx * 0.032, 0.42, 1.33);
    code.rotation.y = sx * Math.PI / 2;
    g.add(code);
  }

  // high wing across the cabin roof, gentle taper, no sweep
  for (const sx of [-1, 1]) {
    const wgeo = new THREE.BoxGeometry(2.3, 0.06, 0.72);
    wgeo.translate(sx * 1.15, 0, 0);
    wgeo.applyMatrix4(new THREE.Matrix4().makeShear(0, 0, 0, 0, sx * 0.05, 0));
    const wing = new THREE.Mesh(wgeo, wingMat);
    wing.position.set(0, 0.5, -0.55);
    wing.rotation.z = sx * -0.02;
    g.add(wing);
    // rounded wingtip cap
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), wingMat);
    cap.scale.set(0.6, 0.55, 3.2);
    cap.position.set(sx * 2.3, 0.5, -0.44);
    g.add(cap);
    // lift strut from the belly to mid-wing, braced by a jury strut
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.25, 6), MAT.fuselage);
    strut.position.set(sx * 0.62, 0.08, -0.5);
    strut.rotation.z = sx * 1.05;
    const jury = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.38, 5), MAT.fuselage);
    jury.position.set(sx * 1.02, 0.32, -0.5);
    g.add(strut, jury);
    // aileron: a live control surface hinged off the outer trailing edge
    const ailGeo = new THREE.BoxGeometry(0.72, 0.04, 0.17);
    ailGeo.translate(0, 0, 0.085);
    const ail = new THREE.Mesh(ailGeo, wingMat);
    ail.position.set(sx * 1.72, 0.485, -0.33);
    g.add(ail);
    ctrl[sx < 0 ? "ailL" : "ailR"] = ail;
    // wingtip nav-light housing
    const lampBox = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.1), MAT.intake);
    lampBox.position.set(sx * 2.28, 0.5, -0.58);
    g.add(lampBox);
  }
  // pitot tube + landing light in the left leading edge
  const pitot = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 5), MAT.intake);
  pitot.rotation.x = Math.PI / 2;
  pitot.position.set(-1.5, 0.47, -0.98);
  const ldg = new THREE.Mesh(new THREE.CircleGeometry(0.05, 10), new THREE.MeshBasicMaterial({ color: 0xfff6da }));
  ldg.position.set(-1.1, 0.5, -0.915);
  ldg.rotation.y = Math.PI;
  g.add(pitot, ldg);

  // tail: fin + live rudder, tailplanes + live elevators
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.72, 0.34), wingMat);
  fin.position.set(0, 0.42, 1.27);
  g.add(fin);
  const rudGeo = new THREE.BoxGeometry(0.045, 0.62, 0.2);
  rudGeo.translate(0, 0, 0.1);
  const rud = new THREE.Mesh(rudGeo, wingMat);
  rud.position.set(0, 0.44, 1.44);
  g.add(rud);
  ctrl.rud = rud;
  ctrl.elevs = [];
  for (const sx of [-1, 1]) {
    const tp = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.045, 0.3), wingMat);
    tp.position.set(sx * 0.42, 0.14, 1.32);
    g.add(tp);
    const elGeo = new THREE.BoxGeometry(0.7, 0.04, 0.16);
    elGeo.translate(0, 0, 0.08);
    const el = new THREE.Mesh(elGeo, wingMat);
    el.position.set(sx * 0.42, 0.14, 1.47);
    g.add(el);
    ctrl.elevs.push(el);
  }

  // twin pontoons on struts — the reason it can land anywhere out here
  for (const sx of [-1, 1]) {
    const ponGeo = new THREE.CylinderGeometry(0.11, 0.13, 1.9, 10);
    ponGeo.rotateX(Math.PI / 2);
    const pon = new THREE.Mesh(ponGeo, MAT.intake);
    pon.position.set(sx * 0.42, -0.62, -0.25);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.35, 10), MAT.intake);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(sx * 0.42, -0.62, -1.35);
    g.add(pon, nose);
    // spray rails along the chines + a water rudder at the stern
    for (const rs of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 1.05), MAT.fuselage);
      rail.position.set(sx * 0.42 + rs * 0.105, -0.66, -0.55);
      g.add(rail);
    }
    const wrud = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.11, 0.09), MAT.intake);
    wrud.position.set(sx * 0.42, -0.7, 0.72);
    g.add(wrud);
    for (const pz of [-0.7, 0.35]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.5, 6), MAT.fuselage);
      leg.position.set(sx * 0.38, -0.36, pz);
      leg.rotation.x = 0.15;
      g.add(leg);
    }
  }
  // cross-braces tying the floats together
  for (const bz of [-0.9, 0.3]) {
    const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.84, 5), MAT.fuselage);
    brace.rotation.z = Math.PI / 2;
    brace.position.set(0, -0.56, bz);
    g.add(brace);
  }

  // nav lights: red port, green starboard, amber tail, red belly beacon
  const navL = new THREE.Sprite(MAT.lightRed.clone());
  navL.position.set(-2.32, 0.5, -0.55); navL.scale.setScalar(0.28);
  const navR = new THREE.Sprite(MAT.lightGreen.clone());
  navR.position.set(2.32, 0.5, -0.55); navR.scale.setScalar(0.28);
  const navT = new THREE.Sprite(MAT.lightAmber.clone());
  navT.position.set(0, 0.82, 1.42); navT.scale.setScalar(0.22);
  const beacon = new THREE.Sprite(MAT.lightRed.clone());
  beacon.position.set(0, -0.3, 0.4); beacon.scale.setScalar(0.2);
  const strobe = new THREE.Sprite(MAT.lightWhite.clone());
  strobe.position.set(0, 0.12, 1.78); strobe.scale.setScalar(0.3);
  g.add(navL, navR, navT, beacon, strobe);
  g.userData.navLights = [navL, navR, navT, beacon, strobe];
  g.userData.ctrl = ctrl;
  return g;
}

function makeBuilding(h, w, d, wall) {
  const b = new THREE.Group();
  const setback = h > 9 && rnd() < 0.45;
  const mats = [wall, wall, MAT.roof, MAT.roof, wall, wall];
  if (setback) {
    const h1 = h * 0.62, h2 = h * 0.38;
    const lower = new THREE.Mesh(new THREE.BoxGeometry(w, h1, d), mats);
    lower.position.y = h1 / 2;
    const upper = new THREE.Mesh(new THREE.BoxGeometry(w * 0.62, h2, d * 0.62), mats);
    upper.position.y = h1 + h2 / 2;
    b.add(lower, upper);
  } else {
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
    box.position.y = h / 2;
    b.add(box);
  }
  // rooftop pool: a cyan gem visible from the air
  if (!setback && h < 7 && rnd() < 0.22) {
    const pool = new THREE.Mesh(new THREE.CircleGeometry(Math.min(w, d) * 0.28, 12), MAT.pool);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set((rnd() - 0.5) * w * 0.3, h + 0.02, (rnd() - 0.5) * d * 0.3);
    b.add(pool);
  }
  // rooftop mechanicals, or a water tank on stilts (classic skyline silhouette)
  const roll = rnd();
  if (roll < 0.32) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w * 0.3, 0.5, d * 0.3), MAT.concrete);
    m.position.set((rnd() - 0.5) * w * 0.4, h + 0.25, (rnd() - 0.5) * d * 0.4);
    b.add(m);
  } else if (roll < 0.5 && h > 6) {
    const legH = 0.5;
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, legH, 6), MAT.concrete);
    legs.position.set(0, h + legH / 2, 0);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.7, 10), MAT.tank);
    tank.position.set(0, h + legH + 0.35, 0);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.3, 10), MAT.roof);
    cap.position.set(0, h + legH + 0.85, 0);
    b.add(legs, tank, cap);
  }
  b.userData.h = h;
  return b;
}

function makeTree() {
  const t = new THREE.Group();
  const th = 0.5 + rnd() * 0.7;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, th, 6), MAT.trunk);
  trunk.position.y = th / 2;
  const lower = new THREE.Mesh(new THREE.ConeGeometry(0.6 + rnd() * 0.35, 1.1 + rnd() * 0.5, 8), rnd() < 0.5 ? MAT.leaf : MAT.leafDark);
  lower.position.y = th + 0.5;
  const upper = new THREE.Mesh(new THREE.ConeGeometry(0.42 + rnd() * 0.2, 0.9 + rnd() * 0.4, 8), MAT.leaf);
  upper.position.y = th + 1.15;
  t.add(trunk, lower, upper);
  return t;
}

function makeUmbrella() {
  const u = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5), MAT.tower);
  pole.position.y = 0.25;
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.16, 8), MAT.paint[Math.floor(rnd() * 4)]);
  top.position.y = 0.52;
  u.add(pole, top);
  u.rotation.z = (rnd() - 0.5) * 0.2;
  return u;
}

function makeBush() {
  const b = new THREE.Group();
  const n = 2 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) {
    const lump = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16 + rnd() * 0.12), rnd() < 0.5 ? MAT.leaf : MAT.leafDark);
    lump.position.set((rnd() - 0.5) * 0.22, 0.14 + rnd() * 0.08, (rnd() - 0.5) * 0.22);
    lump.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    b.add(lump);
  }
  return b;
}

function makeHelicopter() {
  const h = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), MAT.glassC);
  body.scale.set(1, 0.75, 1.4);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.6, 8), MAT.concrete);
  boom.rotation.x = Math.PI / 2;
  boom.position.set(0, 0.1, 1.1);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(3, 0.03, 0.14), MAT.roof);
  rotor.position.y = 0.55;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.35), MAT.concrete);
  tail.position.set(0, 0.3, 1.9);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.03), MAT.roof);
  tailRotor.position.set(0.1, 0.3, 1.9);
  const beacon = new THREE.Sprite(MAT.lightRed.clone());
  beacon.position.y = 0.75;
  beacon.scale.setScalar(0.4);
  beacon.userData.strobe = rnd() * Math.PI * 2;
  blinkers.push(beacon);
  h.add(body, boom, rotor, tail, tailRotor, beacon);
  rotors.push(rotor);
  tailRotors.push(tailRotor);
  return h;
}

function makeIsland(kind, radius) {
  const g = new THREE.Group();
  const shore = new THREE.Mesh(jitter(new THREE.CylinderGeometry(radius * 1.1, radius * 1.3, 0.4, 18), 0.12), MAT.shore);
  shore.position.y = 0.12;
  const base = new THREE.Mesh(jitter(new THREE.CylinderGeometry(radius, radius * 1.18, 1.4, 18), 0.1), MAT.grass);
  base.position.y = 1.0;
  g.add(shore, base);
  const topY = 1.7;

  if (kind === "city") {
    const n = 22 + Math.floor(rnd() * 14);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.pow(rnd(), 0.7) * radius * 0.66;
      const near = 1 - r / (radius * 0.9);
      const h = 2.5 + rnd() * 3.5 + near * near * 14;
      const b = makeBuilding(h, 1 + rnd() * 1.6, 1 + rnd() * 1.6, MAT.walls[Math.floor(rnd() * 4)]);
      b.position.set(Math.cos(a) * r, topY - 0.2, Math.sin(a) * r);
      b.rotation.y = rnd() * 0.7;
      g.add(b);
      if (h > 11) {
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 1.6, 5), MAT.roof);
        mast.position.set(b.position.x, topY - 0.2 + h + 0.8, b.position.z);
        g.add(mast);
        const warn = new THREE.Sprite(MAT.lightRed.clone());
        warn.position.set(b.position.x, mast.position.y + 0.85, b.position.z);
        warn.scale.setScalar(0.7);
        warn.userData.strobe = rnd() * Math.PI * 2;
        blinkers.push(warn);
        g.add(warn);
      }
    }
    // warm urban glow washing up between the buildings, like lit streets
    if (!LOW_PERF) {
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(radius * 0.85, 24),
        new THREE.MeshBasicMaterial({ color: 0xd9d2be, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = topY + 0.015;
      g.add(glow);
    }
    // ring road with moving cars
    const roadR = radius * 0.8;
    const road = new THREE.Mesh(new THREE.RingGeometry(roadR - 0.7, roadR + 0.7, 40), new THREE.MeshStandardMaterial({ color: 0x1b1b2c, roughness: 0.9 }));
    road.rotation.x = -Math.PI / 2;
    road.position.y = topY + 0.02;
    g.add(road);
    const carCount = 4 + Math.floor(rnd() * 3);
    for (let i = 0; i < carCount; i++) {
      const car = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.5), MAT.carBody);
      body.position.y = 0.1;
      const head = new THREE.Sprite(MAT.lightWhite.clone());
      head.position.set(0, 0.1, -0.32); head.scale.setScalar(0.3);
      const tail = new THREE.Sprite(MAT.lightRed.clone());
      tail.position.set(0, 0.1, 0.32); tail.scale.setScalar(0.22);
      car.add(body, head, tail);
      g.add(car);
      cars.push({ car, r: roadR, angle: rnd() * Math.PI * 2, speed: (0.25 + rnd() * 0.2) * (rnd() < 0.5 ? 1 : -1), y: topY + 0.06 });
    }
    // street lamps at the rim: a pole plus the glow, not just a floating dot
    for (let i = 0; i < 6; i++) {
      const a = rnd() * Math.PI * 2;
      const px = Math.cos(a) * radius * 0.92, pz = Math.sin(a) * radius * 0.92;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.5, 6), MAT.concrete);
      pole.position.set(px, topY + 0.25, pz);
      const s = new THREE.Sprite(MAT.lightAmber.clone());
      s.position.set(px, topY + 0.5, pz);
      s.scale.setScalar(0.65);
      g.add(pole, s);
    }
    // marina: a dock arm reaching into the water with moored boats
    if (!LOW_PERF && rnd() < 0.55) {
      const mAngle = rnd() * Math.PI * 2;
      const marina = new THREE.Group();
      const pier = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 5.5), MAT.trunk);
      pier.position.set(0, 0.35, 2.75);
      marina.add(pier);
      for (let i = 0; i < 3; i++) {
        const slipZ = 1.2 + i * 1.6;
        const hull = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 1), MAT.paint[Math.floor(rnd() * 6)]);
        hull.position.set(0.55, 0.22, slipZ);
        marina.add(hull);
        if (rnd() < 0.6) {
          const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 1, 5), MAT.tower);
          mast.position.set(0.55, 0.75, slipZ);
          marina.add(mast);
        }
      }
      marina.position.set(Math.cos(mAngle) * radius * 1.05, 0, Math.sin(mAngle) * radius * 1.05);
      marina.rotation.y = -mAngle;
      g.add(marina);
    }
    // helicopter over the second city we build
    if (!makeIsland.heliDone && rnd() < 0.6) {
      makeIsland.heliDone = true;
      const heli = makeHelicopter();
      heli.position.set(radius * 0.3, topY + 9, -radius * 0.3);
      heli.userData.isHeli = true;
      g.add(heli);
    }
  } else if (kind === "grass") {
    const n = Math.floor(radius * 1.6);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const r = rnd() * radius * 0.74;
      const tree = makeTree();
      tree.position.set(Math.cos(a) * r, topY - 0.15, Math.sin(a) * r);
      tree.rotation.y = rnd() * Math.PI;
      g.add(tree);
    }
    const bushCount = Math.floor(radius * 1.1);
    for (let i = 0; i < bushCount; i++) {
      const a = rnd() * Math.PI * 2;
      const r = rnd() * radius * 0.8;
      const bush = makeBush();
      bush.position.set(Math.cos(a) * r, topY - 0.15, Math.sin(a) * r);
      g.add(bush);
    }
    // palms lean over the waterline
    if (!LOW_PERF) {
      const palmCount = 2 + Math.floor(rnd() * 2);
      for (let i = 0; i < palmCount; i++) {
        const a = rnd() * Math.PI * 2;
        const palm = makePalm(0.9 + rnd() * 0.5);
        palm.position.set(Math.cos(a) * radius * 0.95, topY - 0.2, Math.sin(a) * radius * 0.95);
        palm.rotation.y = a + Math.PI; // trunk curves outward, over the water
        g.add(palm);
      }
      // a little beach scene: umbrellas on the shore ring
      const umbCount = 2 + Math.floor(rnd() * 3);
      for (let i = 0; i < umbCount; i++) {
        const a = rnd() * Math.PI * 2;
        const umb = makeUmbrella();
        umb.position.set(Math.cos(a) * radius * 1.12, 0.35, Math.sin(a) * radius * 1.12);
        g.add(umb);
      }
    }
    for (let i = 0; i < 4; i++) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + rnd() * 0.45), MAT.rock);
      const a = rnd() * Math.PI * 2;
      rock.position.set(Math.cos(a) * radius * 0.8, topY - 0.1, Math.sin(a) * radius * 0.8);
      rock.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      g.add(rock);
    }
    // a cabin with a porch light
    if (rnd() < 0.6) {
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 1), MAT.trunk);
      cabin.position.set(0, topY + 0.25, 0);
      const roofM = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.6, 4), MAT.towerTop);
      roofM.position.set(0, topY + 0.95, 0);
      roofM.rotation.y = Math.PI / 4;
      const porch = new THREE.Sprite(MAT.lightAmber.clone());
      porch.position.set(0.7, topY + 0.5, 0.6);
      porch.scale.setScalar(0.55);
      g.add(cabin, roofM, porch);
    }
    // a small wooden dock reaching from the shore into the water
    if (!LOW_PERF && rnd() < 0.55) {
      const dockAngle = rnd() * Math.PI * 2;
      const dock = new THREE.Group();
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 2.4), MAT.trunk);
      plank.position.set(0, -0.35, 1.2);
      dock.add(plank);
      for (const pz of [0.2, 1.2, 2.2]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.6, 6), MAT.trunk);
        post.position.set(0.22, -0.62, pz);
        const post2 = post.clone();
        post2.position.x = -0.22;
        dock.add(post, post2);
      }
      dock.position.set(Math.cos(dockAngle) * radius * 1.12, topY + 0.35, Math.sin(dockAngle) * radius * 1.12);
      dock.rotation.y = -dockAngle;
      g.add(dock);
    }
  } else if (kind === "lighthouse") {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.5, 3.4, 12), MAT.tower);
    tower.position.y = topY + 1.5;
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.7, 12), MAT.towerTop);
    top.position.y = topY + 3.55;
    g.add(tower, top);
    const beam = new THREE.Sprite(MAT.lightAmber.clone());
    beam.position.y = topY + 3.3;
    beam.scale.setScalar(2.4);
    beam.userData.strobe = rnd() * Math.PI * 2;
    blinkers.push(beam);
    g.add(beam);
    // a real sweeping beam wedge, rotating continuously over the water
    const wedge = new THREE.Mesh(new THREE.PlaneGeometry(16, 0.9), MAT.beam.clone());
    wedge.position.set(0, topY + 3.3, 0);
    wedge.rotation.x = -Math.PI / 2.35;
    const beamPivot = new THREE.Group();
    beamPivot.add(wedge);
    beamPivot.position.y = 0;
    g.add(beamPivot);
    beamRotors.push(beamPivot);
    for (let i = 0; i < 5; i++) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35 + rnd() * 0.5), MAT.rock);
      const a = rnd() * Math.PI * 2;
      rock.position.set(Math.cos(a) * radius * 0.75, topY - 0.15, Math.sin(a) * radius * 0.75);
      rock.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      g.add(rock);
    }
  }

  // shallow-water halo, kept subtle: real shallows fade, they don't glow
  const shallows = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 2.1, 28),
    new THREE.MeshBasicMaterial({ color: 0x2fa8a4, transparent: true, opacity: 0.18, depthWrite: false })
  );
  shallows.rotation.x = -Math.PI / 2;
  shallows.position.y = 0.035;
  g.add(shallows);
  const shallowsBright = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 1.5, 24),
    new THREE.MeshBasicMaterial({ color: 0x55c8bc, transparent: true, opacity: 0.16, depthWrite: false })
  );
  shallowsBright.rotation.x = -Math.PI / 2;
  shallowsBright.position.y = 0.045;
  g.add(shallowsBright);

  // shoreline foam: a ring of soft flickering whitecaps around every island
  if (!LOW_PERF) {
    const foamCount = Math.max(6, Math.floor(radius * 0.9));
    for (let i = 0; i < foamCount; i++) {
      const a = (i / foamCount) * Math.PI * 2 + rnd() * 0.3;
      const foam = new THREE.Sprite(MAT.lightWhite.clone());
      foam.material.opacity = 0.28;
      foam.scale.setScalar(0.5 + rnd() * 0.4);
      foam.position.set(Math.cos(a) * radius * 1.16, 0.1, Math.sin(a) * radius * 1.16);
      foam.userData.phase = rnd() * Math.PI * 2;
      foamSprites.push(foam);
      g.add(foam);
    }
  }
  return g;
}

/* palm: curved trunk from stacked segments, drooping fronds — merged into
   just two meshes so we can scatter them generously */
function makePalm(s = 1) {
  const trunkGeos = [], frondGeos = [];
  let x = 0, y = 0;
  for (let j = 0; j < 3; j++) {
    const seg = new THREE.CylinderGeometry(0.05 * s * (1 - j * 0.18), 0.06 * s * (1 - j * 0.18), 0.55 * s, 6);
    seg.rotateZ(0.09 * (j + 1));
    seg.translate(x, y + 0.26 * s, 0);
    trunkGeos.push(seg);
    x += 0.1 * s * (j + 1) * 0.5;
    y += 0.5 * s;
  }
  for (let i = 0; i < 7; i++) {
    const frond = new THREE.BoxGeometry(0.95 * s, 0.015, 0.2 * s);
    frond.translate(0.5 * s, 0, 0);
    frond.rotateZ(-0.55 - Math.sin(i * 3.7) * 0.15); // droop
    frond.rotateY((i / 7) * Math.PI * 2);
    frond.translate(x, y + 0.12 * s, 0);
    frondGeos.push(frond);
  }
  const palm = new THREE.Group();
  palm.add(new THREE.Mesh(mergeGeometries(trunkGeos), MAT.palmTrunk));
  palm.add(new THREE.Mesh(mergeGeometries(frondGeos), MAT.frond));
  return palm;
}

/* mainland coast chunk: a slab of city waterfront that tiles along the loop.
   Buildings are merged into a handful of meshes per chunk so both shores can
   run the full length of the world without wrecking the frame rate. */
/* boardwalk Ferris wheel: ring, spokes, gondolas — turns in the tick loop */
function makeFerris() {
  const f = new THREE.Group();
  const wheel = new THREE.Group();
  const R = 4.2;
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(R, 0.09, 8, 36), MAT.paint[0]));
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(R * 0.55, 0.05, 6, 28), MAT.tower));
  for (let i = 0; i < 8; i++) {
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, R * 2, 5), MAT.tower);
    spoke.rotation.z = (i / 8) * Math.PI;
    wheel.add(spoke);
    const a = (i / 8) * Math.PI * 2;
    const gondola = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.4), MAT.paint[i % 6]);
    gondola.position.set(Math.cos(a) * R, Math.sin(a) * R - 0.3, 0);
    wheel.add(gondola);
  }
  wheel.position.y = R + 1.2;
  f.add(wheel);
  wheels.push(wheel);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, R + 1.4, 6), MAT.concrete);
    leg.position.set(sx * 1.1, (R + 1.4) / 2, 0.4);
    leg.rotation.z = sx * 0.18;
    f.add(leg);
  }
  return f;
}

/* harbor crane + container stacks: a working port district */
function makePort(cr) {
  const p = new THREE.Group();
  for (let c = 0; c < 2; c++) {
    const crane = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6.5, 0.5), MAT.paint[2]);
    tower.position.y = 3.25;
    const boom = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 7), MAT.paint[2]);
    boom.position.set(0, 6.2, -2.2);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.4, 4), MAT.intake);
    cable.position.set(0, 5, -4.6);
    const hook = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.9), MAT.paint[c === 0 ? 1 : 3]);
    hook.position.set(0, 3.6, -4.6);
    crane.add(tower, boom, cable, hook);
    crane.position.set(c * 6 - 2, 0, c * 3);
    crane.rotation.y = cr() * 0.8 - 0.4;
    p.add(crane);
  }
  const stacks = [];
  for (let i = 0; i < 14; i++) {
    const box = new THREE.BoxGeometry(0.9, 0.55, 2);
    box.translate(
      (cr() - 0.5) * 9,
      0.28 + Math.floor(cr() * 3) * 0.55,
      4 + (cr() - 0.5) * 6
    );
    stacks.push({ geo: box, mat: Math.floor(cr() * 6) });
  }
  const byMat = {};
  for (const s of stacks) (byMat[s.mat] = byMat[s.mat] || []).push(s.geo);
  for (const [m, geos] of Object.entries(byMat)) {
    p.add(new THREE.Mesh(mergeGeometries(geos), MAT.paint[+m]));
  }
  return p;
}

function makeCoast(side, seed, opts = {}) {
  const D = WORLD_LEN / 6; // chunk depth; 6 chunks tile one full loop per side
  let s = seed;
  const cr = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const g = new THREE.Group();

  // land slab + sand beach at the waterline (flat Z ends so chunks tile)
  const land = new THREE.Mesh(new THREE.BoxGeometry(72, 2.4, D), MAT.grass);
  land.position.set(side * 96, 1.2, 0);
  const beach = new THREE.Mesh(new THREE.BoxGeometry(7, 0.7, D), MAT.shore);
  beach.position.set(side * 58.5, 0.35, 0);
  g.add(land, beach);

  // building rows: waterfront mid-rise, low-rise behind, sparse far towers
  const buckets = [[], [], [], []];
  const neon = { pink: [], cyan: [], red: [], blue: [] };
  const storefronts = [];
  const rows = LOW_PERF ? 2 : 4; // 4th row: tall downtown behind the waterfront
  for (let row = 0; row < rows; row++) {
    const rowX = side * (66 + row * 11);
    const step = 7 + row * 2.5;
    for (let z = -D / 2 + 4; z < D / 2 - 4; z += step) {
      if (cr() < 0.16) continue; // gaps read as streets
      const tall = cr() < (row >= 2 ? 0.25 : 0.08);
      const h = row === 3 ? 8 + cr() * 14
        : tall ? 11 + cr() * 9
        : row === 0 ? 3.5 + cr() * 5 : 2.2 + cr() * 3.4;
      const w = 2.2 + cr() * 2.6;
      const d = 2.2 + cr() * 2.4;
      const bx = rowX + (cr() - 0.5) * 5;
      const geo = new THREE.BoxGeometry(w, h, d);
      geo.translate(bx, 2.4 + h / 2, z + (cr() - 0.5) * 2);
      buckets[Math.floor(cr() * 4)].push(geo);
      if (!LOW_PERF && row === 0) {
        const face = bx - side * (w / 2 + 0.05);
        // neon crown, or a vertical sign running down the facade
        if (cr() < 0.28) {
          const strip = new THREE.BoxGeometry(w * 0.85, 0.07, 0.07);
          strip.translate(face, 2.4 + h - 0.3, z);
          (cr() < 0.5 ? neon.pink : neon.cyan).push(strip);
        } else if (cr() < 0.3) {
          const sign = new THREE.BoxGeometry(0.08, Math.min(h * 0.6, 2.6), 0.08);
          sign.translate(face, 2.4 + h * 0.55, z);
          (cr() < 0.5 ? neon.red : neon.blue).push(sign);
        }
        // storefront glow strip at street level — the warm base-light wash
        if (cr() < 0.6) {
          const shop = new THREE.BoxGeometry(0.06, 0.5, w * 0.8);
          shop.translate(face, 2.75, z);
          storefronts.push(shop);
        }
      }
    }
  }
  buckets.forEach((geos, i) => {
    if (geos.length) g.add(new THREE.Mesh(mergeGeometries(geos), MAT.walls[i]));
  });
  if (neon.pink.length) g.add(new THREE.Mesh(mergeGeometries(neon.pink), MAT.neonPink));
  if (neon.cyan.length) g.add(new THREE.Mesh(mergeGeometries(neon.cyan), MAT.neonCyan));
  if (neon.red.length) g.add(new THREE.Mesh(mergeGeometries(neon.red), MAT.neonRed));
  if (neon.blue.length) g.add(new THREE.Mesh(mergeGeometries(neon.blue), MAT.neonBlue));
  if (storefronts.length) g.add(new THREE.Mesh(mergeGeometries(storefronts), MAT.storefront));

  // colored light columns reflecting in the water just off this shore
  if (!LOW_PERF) {
    const streakBuckets = [[], [], [], []];
    for (let i = 0; i < 7; i++) {
      const len = 6 + cr() * 9;
      const sgeo = new THREE.PlaneGeometry(0.3 + cr() * 0.25, len);
      sgeo.rotateX(-Math.PI / 2);
      sgeo.translate(side * (52 - cr() * 3), 0.05, -D / 2 + 8 + i * (D / 7) + cr() * 8);
      streakBuckets[Math.floor(cr() * 4)].push(sgeo);
    }
    streakBuckets.forEach((geos, i) => {
      if (geos.length) g.add(new THREE.Mesh(mergeGeometries(geos), MAT.streaks[i]));
    });
  }

  // a shimmer of warm light-specks hanging over the blocks: distant windows,
  // signs and street light scatter that makes the city read as alive
  if (!LOW_PERF) {
    const SPECKS = 220;
    const sp = new Float32Array(SPECKS * 3);
    for (let i = 0; i < SPECKS; i++) {
      sp[i * 3] = side * (62 + cr() * 55);
      sp[i * 3 + 1] = 2.6 + Math.pow(cr(), 2) * 14;
      sp[i * 3 + 2] = (cr() - 0.5) * D * 0.94;
    }
    const spGeo = new THREE.BufferGeometry();
    spGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    g.add(new THREE.Points(spGeo, new THREE.PointsMaterial({
      color: 0xffffff, size: 0.1, transparent: true, opacity: 0.2,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })));
  }

  // palms along the beach + a few shore lights
  if (!LOW_PERF) {
    for (let i = 0; i < 7; i++) {
      const palm = makePalm(1.5 + cr() * 0.8);
      palm.position.set(side * (60 + cr() * 2.5), 0.7, -D / 2 + 6 + i * (D / 7) + cr() * 8);
      palm.rotation.y = cr() * Math.PI * 2;
      palm.scale.x *= side; // lean toward the water on both shores
      g.add(palm);
    }
    for (let i = 0; i < 6; i++) {
      const lamp = new THREE.Sprite(MAT.lightAmber.clone());
      lamp.position.set(side * 61, 3.1, -D / 2 + 8 + i * (D / 6) + cr() * 10);
      lamp.scale.setScalar(0.9);
      g.add(lamp);
    }
    // umbrellas dotted down the sand
    for (let i = 0; i < 4; i++) {
      const umb = makeUmbrella();
      umb.position.set(side * (57 + cr() * 2), 0.7, -D / 2 + 12 + i * (D / 4) + cr() * 12);
      g.add(umb);
    }
    // waterfront boulevard with moving traffic
    const road = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.06, D),
      new THREE.MeshStandardMaterial({ color: 0x4a4e58, roughness: 0.9 })
    );
    road.position.set(side * 63.2, 2.44, 0);
    g.add(road);
    for (let i = 0; i < 3; i++) {
      const car = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.58), MAT.paint[Math.floor(cr() * 6)]);
      car.position.set(side * (62.7 + (i % 2)), 2.55, 0);
      g.add(car);
      coastCars.push({ car, D, speed: 3 + cr() * 2.5, phase: cr() * D, dir: i % 2 === 0 ? 1 : -1 });
    }
  }
  // landmark districts: a boardwalk wheel here, a working port there
  if (!LOW_PERF && opts.ferris) {
    const ferris = makeFerris();
    ferris.position.set(side * 66, 2.4, -D * 0.18);
    ferris.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    g.add(ferris);
  }
  if (!LOW_PERF && opts.port) {
    const port = makePort(cr);
    port.position.set(side * 70, 2.4, D * 0.22);
    port.rotation.y = side > 0 ? Math.PI : 0;
    g.add(port);
  }
  return g;
}

/* a real mountain ridge: a displaced heightfield with multiple peaks,
   valleys and shoulders, colored by altitude (rock → scree → snow) with
   per-vertex grain. Far belts get hazier colors baked in. */
function makeRidge(width, depth, height, seed, haze) {
  const segsW = 88, segsD = 12;
  const geo = new THREE.PlaneGeometry(width, depth, segsW, segsD);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const hs = new Float32Array(pos.count);
  const ramp = [
    [0.0, 0x4a6e50], [0.3, 0x5d7a5e], [0.55, 0x7e8078],
    [0.72, 0xa3a49e], [0.85, 0xe6e9ea], [1.0, 0xffffff],
  ].map(([p, c]) => [p, new THREE.Color(c)]);
  const hazeCol = new THREE.Color(0xaacbe2);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / width + 0.5;
    const v = pos.getZ(i) / depth + 0.5;
    // ridge envelope + layered sine "noise" = believable peaks and saddles
    const env = Math.pow(Math.sin(u * Math.PI), 0.7) * Math.pow(Math.sin(v * Math.PI), 0.5);
    let h = 0.5
      + Math.sin(u * 9.1 + seed) * 0.26
      + Math.sin(u * 17.3 + seed * 2.1) * 0.14
      + Math.sin(u * 31.7 + seed * 3.7) * 0.07
      + Math.sin(v * 4.2 + seed) * 0.1;
    h *= 0.72 + 0.28 * Math.sin(u * 3.1 + seed * 1.3);
    h = Math.pow(Math.max(h, 0), 1.35) * env;
    const jit = Math.sin(i * 127.1 + seed) * 0.02;
    hs[i] = Math.max(h + jit, 0);
    pos.setY(i, hs[i] * height);
    // color by normalized height with grain, pulled toward haze for far belts
    const t = THREE.MathUtils.clamp(h + jit * 3, 0, 1);
    let k = ramp.length - 2;
    for (let r = 0; r < ramp.length - 1; r++) if (t >= ramp[r][0]) k = r;
    const span = ramp[k + 1][0] - ramp[k][0];
    tmp.copy(ramp[k][1]).lerp(ramp[k + 1][1], (t - ramp[k][0]) / span);
    tmp.lerp(hazeCol, haze);
    // low slopes read as forest: heavier speckle below the treeline
    const grainAmt = t < 0.3 ? 0.12 : 0.05;
    const grain = 1 + Math.sin(i * 311.7 + seed * 5) * grainAmt;
    colors[i * 3] = tmp.r * grain;
    colors[i * 3 + 1] = tmp.g * grain;
    colors[i * 3 + 2] = tmp.b * grain;
  }
  // slope pass: steep faces darken into exposed rock, the detail that makes
  // a ridge read as terrain instead of a colored bump
  const rowLen = segsW + 1;
  for (let i = 0; i < pos.count; i++) {
    const col = i % rowLen;
    const row = Math.floor(i / rowLen);
    const left = col > 0 ? hs[i - 1] : hs[i + 1];
    const up = row > 0 ? hs[i - rowLen] : hs[i + rowLen];
    const slope = (Math.abs(hs[i] - left) + Math.abs(hs[i] - up)) * 9;
    const shade = 1 - Math.min(slope, 0.3);
    colors[i * 3] *= shade;
    colors[i * 3 + 1] *= shade;
    colors[i * 3 + 2] *= shade;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, MAT.ridge);
}

/* suspension bridge spanning the channel — fly under it low, over it high */
function makeBridge() {
  const g = new THREE.Group();
  const deckY = 6.5;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(88, 0.5, 3.2), MAT.concrete);
  deck.position.y = deckY;
  g.add(deck);
  // towers
  for (const tx of [-16, 16]) {
    for (const tz of [-1.3, 1.3]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.9, 17, 0.9), MAT.concrete);
      col.position.set(tx, 8.5, tz);
      g.add(col);
    }
    const cross = new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 3.6), MAT.concrete);
    cross.position.set(tx, 15.5, 0);
    g.add(cross);
    const warn = new THREE.Sprite(MAT.lightRed.clone());
    warn.position.set(tx, 17.4, 0);
    warn.scale.setScalar(0.6);
    warn.userData.strobe = rnd() * Math.PI * 2;
    blinkers.push(warn);
    g.add(warn);
  }
  // main cables: tower-to-tower sag + anchor runs to the deck ends
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x8888a0, roughness: 0.5, metalness: 0.7 });
  for (const cz of [-1.3, 1.3]) {
    const spans = [
      new THREE.QuadraticBezierCurve3(new THREE.Vector3(-16, 16, cz), new THREE.Vector3(0, 8, cz), new THREE.Vector3(16, 16, cz)),
      new THREE.QuadraticBezierCurve3(new THREE.Vector3(-44, deckY + 0.4, cz), new THREE.Vector3(-30, 12, cz), new THREE.Vector3(-16, 16, cz)),
      new THREE.QuadraticBezierCurve3(new THREE.Vector3(16, 16, cz), new THREE.Vector3(30, 12, cz), new THREE.Vector3(44, deckY + 0.4, cz)),
    ];
    for (const curve of spans) {
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.07, 6), cableMat));
    }
  }
  // deck lights
  for (let x = -40; x <= 40; x += 8) {
    const s = new THREE.Sprite(MAT.lightAmber.clone());
    s.position.set(x, deckY + 0.7, 0);
    s.scale.setScalar(0.55);
    g.add(s);
  }
  // traffic crossing the span, back and forth, one lane each way
  const laneCount = LOW_PERF ? 1 : 3;
  for (let i = 0; i < laneCount; i++) {
    const car = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.5), MAT.carBody);
    body.position.y = 0.1;
    const head = new THREE.Sprite(MAT.lightWhite.clone());
    head.position.set(0, 0.1, -0.32); head.scale.setScalar(0.28);
    const tail = new THREE.Sprite(MAT.lightRed.clone());
    tail.position.set(0, 0.1, 0.32); tail.scale.setScalar(0.2);
    car.add(body, head, tail);
    const lane = i % 2 === 0 ? 0.8 : -0.8;
    car.position.set(0, deckY + 0.32, lane);
    g.add(car);
    bridgeCars.push({ car, z: lane, phase: rnd() * Math.PI * 2, speed: 0.12 + rnd() * 0.05, dir: lane > 0 ? 1 : -1 });
  }
  return g;
}

/* GTA-trailer finishing pass: orange/teal grade, lens chromatic fringe,
   filmic contrast + saturation, vignette, animated grain. Runs last in
   the composer so it grades the bloomed frame like a colorist would. */
const CinematicGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uTime;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      // chromatic fringe that grows toward the frame edge, like a real lens
      float ca = 0.008 * r2;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + d * ca).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - d * ca).b;
      // exposure lift lives HERE: tone mapping doesn't run inside the
      // composer chain, so the final pass owns overall brightness
      col *= 1.16;
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      // orange and teal, kept light-handed so the frame stays bright
      col = mix(col, col * vec3(0.92, 1.01, 1.06), (1.0 - smoothstep(0.0, 0.55, luma)) * 0.18);
      col = mix(col, col * vec3(1.06, 1.0, 0.92), smoothstep(0.55, 1.0, luma) * 0.22);
      // natural saturation + a bright, gentle curve
      col = mix(vec3(luma), col, 1.08);
      col = clamp((col - 0.5) * 1.03 + 0.515, 0.0, 1.0);
      // soft vignette
      col *= 1.0 - smoothstep(0.22, 0.7, r2) * 0.16;
      // whisper of film grain
      col += (hash(vUv * vec2(1547.0, 991.0) + fract(uTime) * 7.13) - 0.5) * 0.014;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

/* ════════════════════════════════════════════
   4 · SCENE
   ════════════════════════════════════════════ */
function initScene() {
  const canvas = document.getElementById("scene");
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  } catch (e) {
    document.getElementById("webglFallback").hidden = false;
    return;
  }
  webglOK = true;
  ANISO = renderer.capabilities.getMaxAnisotropy();
  HIGH_END = !LOW_PERF && window.devicePixelRatio >= 2;
  // full native pixel density on capable machines: text-sharp 4K-class output
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, LOW_PERF ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.26;
  if (!LOW_PERF) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xc3dcec, 90, 460);
  camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 900);
  camera.position.set(0, state.alt + 2.2, CAM_Z);

  initMaterials();

  // sky
  const skyTex = makeSkyTexture();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(430, 24, 18),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false })
  );
  scene.add(sky);

  // image-based lighting: bake a tiny sky+sea probe through PMREM so every
  // PBR surface picks up real sky reflections instead of flat speculars
  if (!LOW_PERF) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(
      new THREE.SphereGeometry(50, 24, 16),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide })
    ));
    const envSea = new THREE.Mesh(
      new THREE.CircleGeometry(120, 24),
      new THREE.MeshBasicMaterial({ color: 0x177f92 })
    );
    envSea.rotation.x = -Math.PI / 2;
    envSea.position.y = -1.2;
    envScene.add(envSea);
    const envSun = new THREE.Mesh(
      new THREE.SphereGeometry(3, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    envSun.position.set(15, 23, -28);
    envScene.add(envSun);
    scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    pmrem.dispose();
  }

  // sun
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeRadialSprite([[0, "rgba(255,252,240,1)"], [0.12, "rgba(255,244,214,0.9)"], [0.4, "rgba(255,240,210,0.2)"], [1, "rgba(255,240,210,0)"]], 256),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  sun.position.set(150, 230, -280);
  sun.scale.setScalar(55);
  scene.add(sun);

  // trailer-grade lens flare: ghost train walking across the frame whenever
  // the sun is in shot (occluded automatically when it hides behind terrain)
  if (!LOW_PERF) {
    const flTex = makeRadialSprite([[0, "rgba(255,248,230,1)"], [0.25, "rgba(255,236,200,0.5)"], [1, "rgba(255,236,200,0)"]], 256);
    const ghostCool = makeRadialSprite([[0, "rgba(140,220,255,0.55)"], [0.4, "rgba(140,220,255,0.14)"], [1, "rgba(140,220,255,0)"]], 128);
    const ghostWarm = makeRadialSprite([[0, "rgba(255,190,140,0.5)"], [0.4, "rgba(255,190,140,0.12)"], [1, "rgba(255,190,140,0)"]], 128);
    const flare = new Lensflare();
    flare.addElement(new LensflareElement(flTex, 420, 0));
    flare.addElement(new LensflareElement(ghostCool, 70, 0.35));
    flare.addElement(new LensflareElement(ghostWarm, 110, 0.55));
    flare.addElement(new LensflareElement(ghostCool, 50, 0.75));
    flare.addElement(new LensflareElement(ghostWarm, 150, 1.0));
    const flareAnchor = new THREE.Object3D();
    flareAnchor.position.copy(sun.position);
    flareAnchor.add(flare);
    scene.add(flareAnchor);
  }

  // ── water: a real planar reflection (the whole scene mirrors in it)
  if (!LOW_PERF) {
    waterMirror = new Reflector(new THREE.PlaneGeometry(1800, 1800), {
      clipBias: 0.003,
      textureWidth: HIGH_END ? 2560 : 2048,
      textureHeight: HIGH_END ? 2560 : 2048,
      color: 0xb2c9d4,
    });
    waterMirror.rotation.x = -Math.PI / 2;
    waterMirror.position.y = 0;
    scene.add(waterMirror);
    // flat stand-in shown ONLY while the plane's cube probe renders, so the
    // Reflector doesn't re-render six extra times per probe update
    envWaterProxy = new THREE.Mesh(
      new THREE.PlaneGeometry(1800, 1800),
      new THREE.MeshBasicMaterial({ color: 0x2493a6 })
    );
    envWaterProxy.rotation.x = -Math.PI / 2;
    envWaterProxy.visible = false;
    scene.add(envWaterProxy);
    // sea tint over the mirror: deep ocean blue, less candy-teal
    const tint = new THREE.Mesh(
      new THREE.PlaneGeometry(1800, 1800),
      new THREE.MeshBasicMaterial({ color: 0x14607a, transparent: true, opacity: 0.3, depthWrite: false })
    );
    tint.rotation.x = -Math.PI / 2;
    tint.position.y = 0.02;
    scene.add(tint);

    // a real moving swell riding above the mirror: displaced vertices catch
    // the sun as true specular glints, and shadows land on the surface
    const waveGeo = new THREE.PlaneGeometry(240, 240, 64, 64);
    waveGeo.rotateX(-Math.PI / 2);
    waveBase = Float32Array.from(waveGeo.attributes.position.array);
    waveMesh = new THREE.Mesh(waveGeo, new THREE.MeshStandardMaterial({
      color: 0x1d8fa0, transparent: true, opacity: 0.22,
      roughness: 0.12, metalness: 0.4,
    }));
    waveMesh.position.y = 0.14;
    waveMesh.receiveShadow = true;
    scene.add(waveMesh);
  } else {
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(1800, 1800),
      new THREE.MeshStandardMaterial({ color: 0x1d8a9c, roughness: 0.3, metalness: 0.3 })
    );
    water.rotation.x = -Math.PI / 2;
    scene.add(water);
  }

  // sun streak reinforces the reflection glow
  const sc = document.createElement("canvas");
  sc.width = 64; sc.height = 512;
  const sg = sc.getContext("2d");
  for (let y = 0; y < 512; y++) {
    const vFade = 1 - y / 512;
    const grad = sg.createLinearGradient(0, 0, 64, 0);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.5, `rgba(255,255,255,${(0.5 * vFade).toFixed(3)})`);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    sg.fillStyle = grad;
    sg.fillRect(0, y, 64, 1);
  }
  const streak = new THREE.Mesh(
    new THREE.PlaneGeometry(5, 300),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
  );
  streak.rotation.x = -Math.PI / 2;
  streak.position.set(60, 0.06, -168);
  scene.add(streak);

  // a drifting shimmer of ripple bands, scrolled every frame — the water
  // reads as gently moving without deforming the reflector's geometry
  if (!LOW_PERF) {
    // two ripple layers sliding against each other: live interference on
    // the surface instead of a static sheen
    const mkShimmer = (opacity, y) => {
      const mat = new THREE.MeshBasicMaterial({
        map: makeRippleTexture(), transparent: true, opacity,
        depthWrite: false, fog: true,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = y;
      scene.add(mesh);
      return mat;
    };
    waterShimmer = mkShimmer(0.1, 0.03);
    waterShimmerB = mkShimmer(0.07, 0.04);
    waterShimmerB.map = waterShimmer.map.clone();
    waterShimmerB.map.repeat.set(4.2, 4.2);

    // cloud shadows crawling across the sea — the aerial-view tell
    const shadowTex = makeRadialSprite(
      [[0, "rgba(22,34,50,0.42)"], [0.55, "rgba(22,34,50,0.22)"], [1, "rgba(22,34,50,0)"]], 128
    );
    for (let i = 0; i < 8; i++) {
      const s = 26 + rnd() * 42;
      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(s, s * 0.62),
        new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.rotation.z = rnd() * Math.PI;
      shadow.position.set((rnd() - 0.5) * 130, 0.08, 0);
      shadow.userData.baseOffset = i * (WORLD_LEN / 8) + rnd() * 30;
      cloudShadows.push(shadow);
      scene.add(shadow);
    }

    // checkpoint rings on the flight line — fly through them as you scroll
    const ringGlowTex = makeRadialSprite(
      [[0, "rgba(255,196,130,0.5)"], [0.5, "rgba(255,171,112,0.16)"], [1, "rgba(255,171,112,0)"]], 128
    );
    for (let i = 0; i < 6; i++) {
      const group = new THREE.Group();
      const torus = new THREE.Mesh(
        new THREE.TorusGeometry(2.5, 0.09, 10, 40),
        new THREE.MeshBasicMaterial({ color: 0xffb36a, transparent: true, opacity: 0.75 })
      );
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: ringGlowTex, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      glow.scale.setScalar(7);
      group.add(torus, glow);
      group.position.set(Math.sin(i * 2.1) * 2.5, 12, 0);
      group.userData = {
        baseOffset: i * (WORLD_LEN / 6) + 55,
        torus, glow, pulse: 0, lastZ: -999,
      };
      rings.push(group);
      scene.add(group);
    }
  }

  // glints riding the surface
  const mkGlints = (count, seedMul) => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rnd() - 0.5) * 320;
      pos[i * 3 + 1] = 0.07;
      pos[i * 3 + 2] = 20 - rnd() * 340 * seedMul;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffffff, size: 0.14, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
  };
  glintA = mkGlints(LOW_PERF ? 550 : 1600, 1);
  glintB = mkGlints(LOW_PERF ? 550 : 1600, 0.9);
  scene.add(glintA, glintB);

  // ── true 3D star field above the dome's painted stars, twinkling
  if (!LOW_PERF) {
    const mkStars = (count) => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const az = rnd() * Math.PI * 2;
        const el = 0.18 + Math.pow(rnd(), 1.4) * 1.25; // hug the upper sky
        const R = 395;
        pos[i * 3] = Math.cos(el) * Math.cos(az) * R;
        pos[i * 3 + 1] = Math.sin(el) * R;
        pos[i * 3 + 2] = Math.cos(el) * Math.sin(az) * R;
      }
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      return new THREE.Points(geo, new THREE.PointsMaterial({
        color: 0xf2ecff, size: 1.5, transparent: true, opacity: 0.7,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false, sizeAttenuation: true,
      }));
    };
    starsA = mkStars(700);
    starsB = mkStars(700);
    scene.add(starsA, starsB);
  }

  // ── near-field air dust: streams past the plane, selling speed and depth
  if (!LOW_PERF) {
    const DUST = 900;
    const dGeo = new THREE.BufferGeometry();
    const dPos = new Float32Array(DUST * 3);
    airDustBase = new Float32Array(DUST);
    for (let i = 0; i < DUST; i++) {
      dPos[i * 3] = (rnd() - 0.5) * 40;
      dPos[i * 3 + 1] = 1 + rnd() * 22;
      airDustBase[i] = rnd() * WORLD_LEN;
      dPos[i * 3 + 2] = 0;
    }
    dGeo.setAttribute("position", new THREE.BufferAttribute(dPos, 3));
    airDust = new THREE.Points(dGeo, new THREE.PointsMaterial({
      color: 0xffffff, size: 0.045, transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    scene.add(airDust);
  }

  // ── mountain ranges: displaced-heightfield ridges in three belts, real
  //    multi-peak skylines with altitude coloring, ringing the entire world
  // near belt: three frontal ridges, full color, directional light rakes them
  const nearSpecs = [[-170, -235, 46], [5, -255, 58], [175, -240, 50]];
  nearSpecs.forEach(([x, z, h], i) => {
    const ridge = makeRidge(260, 60, h, 11.3 + i * 7.7, 0.12);
    ridge.position.set(x, -1.5, z);
    scene.add(ridge);
  });
  // mid belt: a ring of six hazier, larger ranges
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + 0.35;
    const R = 320 + rnd() * 40;
    const ridge = makeRidge(340, 80, 62 + rnd() * 22, 40 + i * 13.1, 0.45);
    ridge.position.set(Math.sin(ang) * R, -2, 10 - Math.cos(ang) * R);
    ridge.rotation.y = ang;
    scene.add(ridge);
  }
  // far belt: five huge near-silhouette ranges closing the horizon
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2;
    const R = 405;
    const ridge = makeRidge(430, 90, 88 + rnd() * 26, 90 + i * 23.7, 0.72);
    ridge.position.set(Math.sin(ang) * R, -3, 10 - Math.cos(ang) * R);
    ridge.rotation.y = ang;
    scene.add(ridge);
  }

  // ── the wrapped world: islands, a bridge, islets
  const kinds = ["city", "grass", "city", "lighthouse", "city", "grass", "city", "grass", "grass", "city", "grass", "grass"];
  const xs = [-27, 22, 30, -30, 27, -23, -33, 20, 34, -27, 24, -21];
  let parkedDone = false;
  for (let i = 0; i < CHUNKS; i++) {
    const kind = kinds[i];
    const radius = kind === "lighthouse" ? 4.5 : kind === "city" ? 11 + rnd() * 5 : 8 + rnd() * 6;
    const island = makeIsland(kind, radius);
    island.position.x = xs[i];
    island.userData.baseOffset = i * SPACING + rnd() * 14;
    islands.push(island);
    scene.add(island);
    // one grass island is home base: a sister floatplane moored offshore
    if (!LOW_PERF && kind === "grass" && !parkedDone) {
      parkedDone = true;
      const parked = makeAircraft(MAT.wingC);
      spinners.pop(); // engines off at the dock
      parked.scale.setScalar(0.55);
      parked.position.set(radius * 1.35, 0.42, 1.5);
      parked.rotation.y = 0.8;
      island.add(parked);
    }
  }
  const bridge = makeBridge();
  bridge.userData.baseOffset = 5.5 * SPACING;
  islands.push(bridge);
  scene.add(bridge);

  // ── mainland coasts: continuous waterfront city on BOTH shores, tiling
  //    the full loop so the world is built out in every direction you look
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const coast = makeCoast(side, 1013 + i * 97 + (side > 0 ? 7 : 0), {
        ferris: side > 0 && i === 1,   // boardwalk wheel on the east shore
        port: side < 0 && i === 4,     // container port on the west shore
      });
      coast.userData.baseOffset = i * (WORLD_LEN / 6);
      islands.push(coast);
      scene.add(coast);
    }
  }

  // ── far metropolis: a second, hazier skyline deep behind each coast so
  //    the city reads as going on for miles
  if (!LOW_PERF) {
    for (const side of [-1, 1]) {
      for (let ci = 0; ci < 3; ci++) {
        const D2 = WORLD_LEN / 3;
        const chunk = new THREE.Group();
        let s2 = 5501 + ci * 131 + (side > 0 ? 17 : 0);
        const fr = () => (s2 = (s2 * 16807) % 2147483647) / 2147483647;
        const buckets = [[], [], [], []];
        for (let z = -D2 / 2 + 6; z < D2 / 2 - 6; z += 9) {
          if (fr() < 0.2) continue;
          const h = 10 + fr() * 22;
          const w = 3.5 + fr() * 4;
          const geo = new THREE.BoxGeometry(w, h, 3.5 + fr() * 3);
          geo.translate(side * (155 + fr() * 55), h / 2, z + (fr() - 0.5) * 3);
          buckets[Math.floor(fr() * 4)].push(geo);
        }
        buckets.forEach((geos, i) => {
          if (geos.length) chunk.add(new THREE.Mesh(mergeGeometries(geos), MAT.walls[i]));
        });
        chunk.userData.baseOffset = ci * D2;
        islands.push(chunk);
        scene.add(chunk);
      }
    }
  }

  for (let i = 0; i < 12; i++) {
    const islet = new THREE.Group();
    const r = 1.4 + rnd() * 2.2;
    const mound = new THREE.Mesh(jitter(new THREE.ConeGeometry(r, 1 + rnd() * 1.2, 9), 0.18), MAT.rock);
    mound.position.y = 0.35;
    islet.add(mound);
    if (rnd() < 0.5) {
      const tuft = makeTree();
      tuft.scale.setScalar(0.7);
      tuft.position.y = 0.9;
      islet.add(tuft);
    }
    const side = i % 2 === 0 ? -1 : 1;
    islet.position.x = side * (9 + rnd() * 30);
    islet.userData.baseOffset = i * (WORLD_LEN / 12) + rnd() * 30;
    islands.push(islet);
    scene.add(islet);
  }

  // boats, each trailing a soft wake
  const trailTexEarly = makeTrailTexture();
  for (let i = 0; i < 7; i++) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 1.7), MAT.carBody);
    hull.position.y = 0.18;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.55), MAT.tower);
    cabin.position.set(0, 0.45, -0.15);
    const lamp = new THREE.Sprite(MAT.lightAmber.clone());
    lamp.position.set(0, 0.85, -0.15);
    lamp.scale.setScalar(0.45);
    boat.add(hull, cabin, lamp);
    if (!LOW_PERF) {
      const wake = new THREE.Mesh(
        new THREE.PlaneGeometry(0.3, 2.6),
        new THREE.MeshBasicMaterial({ map: trailTexEarly, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      );
      wake.rotation.x = -Math.PI / 2;
      wake.position.set(0, -0.16, 1.3);
      boat.add(wake);
    }
    const side = i % 2 === 0 ? -1 : 1;
    boat.position.x = side * (7 + rnd() * 16);
    boat.rotation.y = (rnd() - 0.5) * 1.2;
    boat.userData.baseOffset = i * (WORLD_LEN / 7) + rnd() * 40;
    boat.userData.phase = rnd() * Math.PI * 2;
    boats.push(boat);
    scene.add(boat);
  }

  // sailboats: white hulls heeling gently under triangular sails
  if (!LOW_PERF) {
    for (let i = 0; i < 4; i++) {
      const wrapper = new THREE.Group();
      const sail = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 1.25), MAT.tower);
      hull.position.y = 0.16;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.5, 6), MAT.trunk);
      mast.position.set(0, 0.95, 0.05);
      const sailGeo = new THREE.BufferGeometry();
      sailGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
        0, 0.3, 0.02,   0, 1.62, 0.02,   0, 0.34, -0.85,
      ]), 3));
      sailGeo.computeVertexNormals();
      const canvasSail = new THREE.Mesh(sailGeo, new THREE.MeshStandardMaterial({
        color: 0xf6f2e8, roughness: 0.8, side: THREE.DoubleSide,
      }));
      sail.add(hull, mast, canvasSail);
      sail.rotation.z = 0.14 + rnd() * 0.1; // heeling in the breeze
      wrapper.add(sail);
      const side = i % 2 === 0 ? -1 : 1;
      wrapper.position.x = side * (10 + rnd() * 20);
      wrapper.rotation.y = (rnd() - 0.5) * 2;
      wrapper.userData.baseOffset = i * (WORLD_LEN / 4) + 70 + rnd() * 30;
      wrapper.userData.phase = rnd() * Math.PI * 2;
      boats.push(wrapper);
      scene.add(wrapper);
    }
  }

  // balloons, each with a flickering burner flame
  const balloonMats = [MAT.wingA, MAT.wingB, MAT.wingC];
  for (let i = 0; i < 3; i++) {
    const bal = new THREE.Group();
    const envelope = new THREE.Mesh(new THREE.SphereGeometry(1.3, 14, 12), balloonMats[i]);
    envelope.scale.y = 1.15;
    const basket = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), MAT.trunk);
    basket.position.y = -1.9;
    const lamp = new THREE.Sprite(MAT.lightAmber.clone());
    lamp.position.y = -1.5;
    lamp.scale.setScalar(0.5);
    const flame = new THREE.Sprite(MAT.lightWhite.clone());
    flame.position.y = -1.65;
    flame.scale.setScalar(0.32);
    flame.userData.phase = rnd() * Math.PI * 2;
    flameSprites.push(flame);
    bal.add(envelope, basket, lamp, flame);
    bal.position.set([-21, 26, 8][i], 13 + i * 3.5, 0);
    bal.userData.baseOffset = i * (WORLD_LEN / 3) + 60;
    bal.userData.phase = i * 2.4;
    balloons.push(bal);
    scene.add(bal);
  }

  // a blimp cruising high over the bay
  if (!LOW_PERF) {
    const blimp = new THREE.Group();
    const envelope = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 12), MAT.tower);
    envelope.scale.set(2.6, 0.8, 0.8);
    const gondola = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 1.1), MAT.intake);
    gondola.position.y = -1.2;
    const finV = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.9), MAT.paint[0]);
    finV.position.set(0, 0.2, 3.1);
    const finH = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 0.9), MAT.paint[0]);
    finH.position.set(0, 0, 3.1);
    blimp.add(envelope, gondola, finV, finH);
    blimp.position.set(-14, 24, 0);
    blimp.rotation.y = 0.25;
    blimp.userData.baseOffset = 200;
    blimp.userData.phase = 4.2;
    balloons.push(blimp);
    scene.add(blimp);
  }

  // red/green channel buoys marking the flight line like a sea lane
  for (let i = 0; i < 12; i++) {
    const isRed = i % 2 === 0;
    const buoy = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.42, 8),
      isRed ? MAT.paint[0] : new THREE.MeshStandardMaterial({ color: 0x2c8a52, roughness: 0.5 })
    );
    body.position.y = 0.22;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.07, 8), MAT.tower);
    band.position.y = 0.1;
    buoy.add(body, band);
    buoy.position.x = isRed ? -5.5 : 5.5;
    buoy.userData.baseOffset = i * (WORLD_LEN / 12) + 15;
    buoy.userData.phase = rnd() * Math.PI * 2;
    buoys.push(buoy);
    scene.add(buoy);
  }

  // clouds: puff clusters instead of single flat sprites, for volume
  const cloudTex = makeCloudTexture();
  for (let i = 0; i < 10; i++) {
    const cl = new THREE.Group();
    const puffN = 4 + Math.floor(rnd() * 4);
    for (let p = 0; p < puffN; p++) {
      const puff = new THREE.Sprite(new THREE.SpriteMaterial({
        map: cloudTex, color: 0xd8dcee, transparent: true,
        opacity: 0.12 + rnd() * 0.12, depthWrite: false,
      }));
      puff.position.set((rnd() - 0.5) * 16, (rnd() - 0.5) * 3.5, (rnd() - 0.5) * 6);
      puff.scale.set(12 + rnd() * 14, 4.5 + rnd() * 4, 1);
      cl.add(puff);
    }
    cl.position.set((rnd() - 0.5) * 150, 24 + rnd() * 16, 0);
    cl.userData.baseOffset = i * (WORLD_LEN / 10) + rnd() * 20;
    clouds.push(cl);
    scene.add(cl);
  }

  // high crossing jets dragging contrails: background life above the bay
  if (!LOW_PERF) {
    for (let i = 0; i < 2; i++) {
      const jet = new THREE.Group();
      const dart = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.9, 8), MAT.tower);
      dart.rotation.x = -Math.PI / 2;
      jet.add(dart);
      for (const sx of [-1, 1]) {
        const jw = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 0.22), MAT.tower);
        jw.position.set(sx * 0.36, 0, 0.15);
        jw.rotation.z = sx * -0.12;
        jet.add(jw);
      }
      const contrail = new THREE.Mesh(
        new THREE.PlaneGeometry(0.16, 26),
        new THREE.MeshBasicMaterial({ map: makeTrailTexture(), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      );
      contrail.rotation.x = -Math.PI / 2;
      contrail.position.set(0, -0.05, 13.6);
      jet.add(contrail);
      jet.position.set(i === 0 ? -46 : 52, 40 + i * 5, 0);
      jet.userData.baseOffset = i * (WORLD_LEN / 2) + 90;
      jets.push(jet);
      scene.add(jet);
    }
  }

  // bird flocks, high and distant, wings flapping
  if (!LOW_PERF) {
    for (let f = 0; f < 3; f++) {
      const flock = new THREE.Group();
      const sprites = [];
      const flockSize = 5 + Math.floor(rnd() * 4);
      for (let i = 0; i < flockSize; i++) {
        const bird = new THREE.Sprite(MAT.bird.clone());
        const bs = 0.35 + rnd() * 0.2;
        bird.scale.set(bs, bs, 1);
        bird.position.set((rnd() - 0.5) * 3.5, (rnd() - 0.5) * 1.2, (rnd() - 0.5) * 3.5);
        bird.userData.flapPhase = rnd() * Math.PI * 2;
        bird.userData.baseScale = bs;
        flock.add(bird);
        sprites.push(bird);
      }
      flock.position.set((rnd() - 0.5) * 50, 19 + rnd() * 8, 0);
      flock.userData.baseOffset = f * (WORLD_LEN / 3) + rnd() * 40;
      scene.add(flock);
      birds.push({ group: flock, baseOffset: flock.userData.baseOffset, phase: rnd() * Math.PI * 2, sprites });
    }
  }

  // channel lanterns
  for (let i = 0; i < 18; i++) {
    const s = new THREE.Sprite(MAT.lightAmber.clone());
    s.position.set((rnd() - 0.5) * 18, 0.45, 0);
    s.scale.setScalar(0.7);
    s.userData.baseOffset = i * (WORLD_LEN / 18) + rnd() * 24;
    s.userData.phase = rnd() * Math.PI * 2;
    lanterns.push(s);
    scene.add(s);
  }

  // our aircraft
  ourPlane = makeAircraft(MAT.wingA);
  ourPlane.scale.setScalar(0.75);
  ourPlane.position.set(0, state.alt, -2.2);
  scene.add(ourPlane);
  const trailTex = makeTrailTexture();
  for (const side of [-1, 1]) {
    const trail = new THREE.Mesh(
      new THREE.PlaneGeometry(0.07, 5.5),
      new THREE.MeshBasicMaterial({ map: trailTex, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    trail.rotation.x = -Math.PI / 2;
    trail.position.set(side * 2.3, 0, 2.9);
    ourPlane.add(trail);
    trailMats.push(trail.material);
  }

  if (!LOW_PERF) {
    // live cube probe riding the plane: the hull mirrors the actual world
    planeEnvRT = new THREE.WebGLCubeRenderTarget(256, {
      generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter,
    });
    planeCubeCam = new THREE.CubeCamera(0.7, 620, planeEnvRT);
    scene.add(planeCubeCam);
    for (const [m, k] of [
      [MAT.hull, 1.15], [MAT.canopy, 1.7], [MAT.fuselage, 1.0],
      [MAT.wingA, 0.9], [MAT.wingB, 0.9], [MAT.wingC, 0.9], [MAT.intake, 1.2],
    ]) {
      m.envMap = planeEnvRT.texture;
      m.envMapIntensity = k;
    }

    // GTA-style contact shadow: a soft blob on the sea under the plane
    planeBlob = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6),
      new THREE.MeshBasicMaterial({
        map: makeRadialSprite([[0, "rgba(10,16,26,0.55)"], [0.5, "rgba(10,16,26,0.28)"], [1, "rgba(10,16,26,0)"]], 128),
        transparent: true, depthWrite: false,
      })
    );
    planeBlob.rotation.x = -Math.PI / 2;
    planeBlob.position.y = 0.09;
    scene.add(planeBlob);

    // float spray kicked up when we drag the deck
    for (const sx of [-1, 1]) {
      const sp = new THREE.Sprite(MAT.lightWhite.clone());
      sp.material.opacity = 0;
      sp.scale.set(1.1, 0.65, 1);
      scene.add(sp);
      sprays.push({ sp, sx });
    }
  }

  // oncoming traffic
  const wingMats = [MAT.wingB, MAT.wingC, MAT.wingB, MAT.wingC];
  [[-9, 5.2], [7, 7.6], [13, 10.4], [-16, 13.5]].forEach(([x, y], i) => {
    const p = makeAircraft(wingMats[i]);
    p.rotation.y = Math.PI;
    p.position.set(x, y, 0);
    p.userData.baseOffset = i * (WORLD_LEN / 4) + 40;
    p.userData.phase = i * 2.1;
    traffic.push(p);
    scene.add(p);
  });

  // midday tropical lighting: high warm-white sun, blue sky fill
  // (dialed back from 1.05/0.4: the IBL probe now carries part of the fill)
  scene.add(new THREE.HemisphereLight(0xbfd9f2, 0x8a9a80, 0.85));
  const sunLight = new THREE.DirectionalLight(0xfff2d8, 2.2);
  sunLight.position.set(60, 110, -50);
  if (!LOW_PERF) {
    // one fixed ortho shadow frustum around the viewer: the world treadmills
    // through it, so everything near the camera gets true cast shadows
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(HIGH_END ? 4096 : 2048, HIGH_END ? 4096 : 2048);
    const sc = sunLight.shadow.camera;
    sc.left = -130; sc.right = 130; sc.top = 60; sc.bottom = -240;
    sc.near = 20; sc.far = 450;
    sunLight.shadow.bias = -0.0004;
  }
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0xdfeaf5, 0.24));

  if (!LOW_PERF) {
    // invisible catcher floating over the mirror: shadows of islands, boats
    // and the plane itself darken the sea (the Reflector can't receive them)
    const catcher = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 420),
      new THREE.ShadowMaterial({ opacity: 0.25 })
    );
    catcher.rotation.x = -Math.PI / 2;
    catcher.position.y = 0.028;
    catcher.receiveShadow = true;
    scene.add(catcher);
    // every solid thing near the flight path casts and receives
    const shadowRoots = [ourPlane, ...traffic, ...islands, ...boats, ...balloons, ...buoys];
    for (const root of shadowRoots) {
      root.traverse((o) => {
        if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
      });
    }
  }

  try {
    // MSAA + half-float target: the bloom pipeline normally bypasses the
    // canvas's antialiasing, so bring it back inside the composer
    const bufSize = renderer.getDrawingBufferSize(new THREE.Vector2());
    const msaaTarget = new THREE.WebGLRenderTarget(bufSize.width, bufSize.height, {
      samples: LOW_PERF ? 0 : 4,
      type: THREE.HalfFloatType,
    });
    composer = new EffectComposer(renderer, msaaTarget);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight), 0.12, 0.8, 0.55
    );
    composer.addPass(bloomPass);
    gradePass = new ShaderPass(CinematicGradeShader);
    composer.addPass(gradePass);
  } catch (e) {
    composer = null;
  }

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (composer) composer.setSize(window.innerWidth, window.innerHeight);
  });
}

/* ════════════════════════════════════════════
   5 · RENDER LOOP — sky, dive, climb
   ════════════════════════════════════════════ */
const clock = new THREE.Clock();
let prevAlt = 22;
function tick() {
  requestAnimationFrame(tick);
  if (!webglOK) return;
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // quicker stick response: the plane answers the mouse, not three beats later
  state.mouseLerp.x += (state.mouse.x - state.mouseLerp.x) * 0.085;
  state.mouseLerp.y += (state.mouse.y - state.mouseLerp.y) * 0.085;

  // unhurried cruise: roughly one world loop per page, gentle idle drift
  const travel = state.scroll * WORLD_LEN * 1.05 + t * 1.6;
  state.travel = travel;

  // ── the flight arc: high above the world → down between the
  //    islands → climbing back into the sunset by the contact section
  const s = state.scroll;
  const targetAlt = 3.6 + (22 - 3.6) * (Math.cos(s * Math.PI * 2) + 1) / 2;
  state.alt += (targetAlt - state.alt) * 0.035;
  const climbRate = state.alt - prevAlt;
  prevAlt = state.alt;

  for (const isl of islands) isl.position.z = wrapZ(isl.userData.baseOffset, travel);
  for (const cl of clouds) cl.position.z = wrapZ(cl.userData.baseOffset, travel * 0.55);
  for (const j of jets) j.position.z = wrapZ(j.userData.baseOffset, travel * 3.2);
  for (const b of boats) {
    b.position.z = wrapZ(b.userData.baseOffset, travel * 0.94);
    b.position.y = Math.sin(t * 1.1 + b.userData.phase) * 0.07;
    b.rotation.z = Math.sin(t * 0.9 + b.userData.phase) * 0.06;
  }
  for (const bal of balloons) {
    bal.position.z = wrapZ(bal.userData.baseOffset, travel * 0.7);
    bal.position.y += Math.sin(t * 0.6 + bal.userData.phase) * 0.006;
    bal.rotation.z = Math.sin(t * 0.5 + bal.userData.phase) * 0.05;
  }
  for (const ln of lanterns) {
    ln.position.z = wrapZ(ln.userData.baseOffset, travel);
    ln.position.y = 0.45 + Math.sin(t * 1.4 + ln.userData.phase) * 0.08;
    ln.material.opacity = 0.2 + Math.sin(t * 2 + ln.userData.phase) * 0.1;
  }
  for (const p of traffic) {
    p.position.z = wrapZ(p.userData.baseOffset, travel * 2.3);
    p.position.y += Math.sin(t * 1.2 + p.userData.phase) * 0.004;
    p.rotation.z = Math.sin(t * 0.7 + p.userData.phase) * 0.08;
    for (const [j, l] of p.userData.navLights.entries()) {
      l.material.opacity = 0.35 + 0.65 * Math.abs(Math.sin(t * 2.6 + p.userData.phase + j));
    }
  }
  for (const b of blinkers) {
    b.material.opacity = Math.pow(Math.max(Math.sin(t * 1.6 + b.userData.strobe), 0), 10);
  }
  for (const c of cars) {
    c.angle += c.speed * dt;
    c.car.position.set(Math.cos(c.angle) * c.r, c.y, Math.sin(c.angle) * c.r);
    c.car.rotation.y = -c.angle + (c.speed > 0 ? 0 : Math.PI);
  }
  for (const r of rotors) r.rotation.y += dt * 28;
  for (const r of tailRotors) r.rotation.x += dt * 34;
  for (const f of spinners) f.rotation.z += dt * 46;
  for (const w of wheels) w.rotation.z += dt * 0.16;
  for (const b of buoys) {
    b.position.z = wrapZ(b.userData.baseOffset, travel);
    b.position.y = Math.sin(t * 1.3 + b.userData.phase) * 0.06;
    b.rotation.x = Math.sin(t * 1.1 + b.userData.phase) * 0.08;
  }
  for (const cc of coastCars) {
    cc.car.position.z = ((cc.phase + t * cc.speed * cc.dir) % cc.D + cc.D) % cc.D - cc.D / 2;
    cc.car.rotation.y = cc.dir > 0 ? 0 : Math.PI;
  }
  for (const b of beamRotors) b.rotation.y += dt * 0.6;
  for (const bc of bridgeCars) {
    const dx = Math.cos(t * bc.speed + bc.phase);
    bc.car.position.x = Math.sin(t * bc.speed + bc.phase) * 42;
    bc.car.rotation.y = dx >= 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  for (const bird of birds) {
    bird.group.position.z = wrapZ(bird.baseOffset, travel * 0.85);
    bird.group.position.y += Math.sin(t * 0.7 + bird.phase) * 0.008;
    for (const w of bird.sprites) {
      w.scale.y = w.userData.baseScale * (0.55 + Math.abs(Math.sin(t * 9 + w.userData.flapPhase)) * 0.6);
    }
  }
  for (const f of flameSprites) {
    f.material.opacity = 0.5 + Math.random() * 0.35 + Math.sin(t * 14 + f.userData.phase) * 0.1;
  }
  for (const f of foamSprites) {
    f.material.opacity = 0.18 + Math.abs(Math.sin(t * 1.1 + f.userData.phase)) * 0.22;
  }
  if (waterShimmer) {
    waterShimmer.map.offset.x = t * 0.011;
    waterShimmer.map.offset.y = t * 0.007;
    waterShimmerB.map.offset.x = -t * 0.008;
    waterShimmerB.map.offset.y = t * 0.012;
  }
  if (waveMesh) {
    // three crossing swell trains, drifting with the flight direction
    const wp = waveMesh.geometry.attributes.position.array;
    const drift = travel * 0.12;
    for (let i = 0; i < wp.length; i += 3) {
      const x = waveBase[i];
      const z = waveBase[i + 2] + drift % 34;
      wp[i + 1] =
        Math.sin(x * 0.16 + t * 0.9) * 0.065 +
        Math.sin(z * 0.21 - t * 0.65) * 0.055 +
        Math.sin((x + z) * 0.09 + t * 0.42) * 0.045;
    }
    waveMesh.geometry.attributes.position.needsUpdate = true;
    waveMesh.geometry.computeVertexNormals();
  }
  for (const sh of cloudShadows) {
    sh.position.z = wrapZ(sh.userData.baseOffset, travel * 0.55);
    sh.position.x += Math.sin(t * 0.03 + sh.userData.baseOffset) * 0.004;
  }
  // checkpoint rings: hover on the flight line, pulse as you punch through
  for (const ring of rings) {
    const u = ring.userData;
    const z = wrapZ(u.baseOffset, travel);
    ring.position.z = z;
    ring.position.y += (ourPlane.position.y - ring.position.y) * 0.02;
    u.torus.rotation.z += dt * 0.6;
    if (u.lastZ < ourPlane.position.z && z >= ourPlane.position.z && z < 20) {
      u.pulse = 1;
      if (Math.abs(state.scrollVel) > 0.02) audio.bell(Math.floor(t) % 6);
    }
    u.lastZ = z;
    if (u.pulse > 0) {
      u.pulse = Math.max(u.pulse - dt * 1.6, 0);
      const k = 1 + (1 - u.pulse) * 1.4;
      u.torus.scale.setScalar(k);
      u.torus.material.opacity = 0.75 * u.pulse;
      u.glow.material.opacity = 0.5 * u.pulse;
      if (u.pulse === 0) {
        u.torus.scale.setScalar(1);
        u.torus.material.opacity = 0.75;
        u.glow.material.opacity = 0.5;
      }
    }
  }

  glintA.material.opacity = 0.16 + 0.06 * Math.sin(t * 1.4);
  glintB.material.opacity = 0.16 + 0.06 * Math.sin(t * 1.7 + 1.4);
  if (starsA) {
    starsA.material.opacity = 0.5 + 0.25 * Math.sin(t * 1.1);
    starsB.material.opacity = 0.5 + 0.25 * Math.sin(t * 1.7 + 2.2);
  }
  if (airDust) {
    const dp = airDust.geometry.attributes.position.array;
    for (let i = 0; i < airDustBase.length; i++) {
      dp[i * 3 + 2] = (30 - WORLD_LEN) + mod(airDustBase[i] + travel * 1.15, WORLD_LEN);
    }
    airDust.geometry.attributes.position.needsUpdate = true;
  }

  // ── our aircraft
  const targetX = state.mouseLerp.x * 3.4;
  ourPlane.position.x += (targetX - ourPlane.position.x) * 0.09;
  ourPlane.position.y = Math.max(
    state.alt + Math.sin(t * 0.85) * 0.22 - state.mouseLerp.y * 0.9, 1.7
  );
  const bank = THREE.MathUtils.clamp(
    -(targetX - ourPlane.position.x) * 0.35 - state.mouseLerp.x * 0.3 - state.scrollVel * 0.7,
    -0.6, 0.6
  );
  ourPlane.rotation.z += (bank - ourPlane.rotation.z) * 0.08;
  // nose follows the climb: dive on the way down, flare on the way up
  const pitchTarget = THREE.MathUtils.clamp(climbRate * 5.5, -0.42, 0.35)
    + THREE.MathUtils.clamp(state.scrollVel * 0.6, -0.08, 0.1);
  ourPlane.rotation.x += (pitchTarget - ourPlane.rotation.x) * 0.06;
  // control surfaces answer the stick: ailerons vs bank, elevators vs
  // pitch, rudder vs yaw — small motions that make the airframe read alive
  const ctrl = ourPlane.userData.ctrl;
  if (ctrl) {
    const ail = THREE.MathUtils.clamp(bank * 1.5, -0.5, 0.5);
    ctrl.ailL.rotation.x += (ail - ctrl.ailL.rotation.x) * 0.2;
    ctrl.ailR.rotation.x += (-ail - ctrl.ailR.rotation.x) * 0.2;
    const ele = THREE.MathUtils.clamp(-pitchTarget * 1.3, -0.4, 0.4);
    for (const e of ctrl.elevs) e.rotation.x += (ele - e.rotation.x) * 0.15;
    ctrl.rud.rotation.y += (state.mouseLerp.x * 0.45 - ctrl.rud.rotation.y) * 0.1;
  }
  // light turbulence: the airframe never sits perfectly still
  ourPlane.rotation.y = -state.mouseLerp.x * 0.12
    + Math.sin(t * 1.7) * 0.008 + Math.sin(t * 3.3) * 0.005;
  for (const [j, l] of ourPlane.userData.navLights.entries()) {
    l.material.opacity = 0.4 + 0.6 * Math.abs(Math.sin(t * 2.8 + j * 1.3));
  }
  const trailOp = 0.08 + Math.min(Math.abs(state.scrollVel) * 3.2 + Math.abs(climbRate) * 2, 0.45);
  for (const m of trailMats) m.opacity = trailOp;

  // live world reflections on the hull: refresh the cube probe every third
  // frame, swapping the Reflector for a flat proxy during the render so it
  // doesn't re-render six extra times per update
  if (planeCubeCam && ++cubeFrame % 3 === 0) {
    ourPlane.visible = false;
    if (waterMirror) { waterMirror.visible = false; envWaterProxy.visible = true; }
    planeCubeCam.position.copy(ourPlane.position);
    planeCubeCam.update(renderer, scene);
    if (waterMirror) { waterMirror.visible = true; envWaterProxy.visible = false; }
    ourPlane.visible = true;
  }
  // contact shadow: slides along the sun line, tightens as the plane drops
  if (planeBlob) {
    const h = ourPlane.position.y;
    planeBlob.position.set(ourPlane.position.x - h * 0.5, 0.09, ourPlane.position.z + h * 0.44);
    const bs = 0.55 + h * 0.075;
    planeBlob.scale.set(bs, bs, 1);
    planeBlob.material.opacity = THREE.MathUtils.clamp(0.5 - h * 0.018, 0.05, 0.34);
  }
  // float spray when we drag the deck
  const lowT = THREE.MathUtils.clamp((3.2 - ourPlane.position.y) / 1.5, 0, 1);
  for (const s2 of sprays) {
    s2.sp.position.set(
      ourPlane.position.x + s2.sx * 0.34,
      0.22 + Math.random() * 0.12,
      ourPlane.position.z + 1.15 + Math.random() * 0.5
    );
    s2.sp.material.opacity = lowT * (0.3 + Math.random() * 0.3);
  }

  // ── chase camera rides the arc with the plane
  camera.position.x += (ourPlane.position.x * 0.72 - camera.position.x) * 0.05;
  camera.position.y += (ourPlane.position.y + 2.2 - camera.position.y) * 0.045;
  const lookY = ourPlane.position.y * 0.8 - 0.6;
  camera.lookAt(ourPlane.position.x * 0.85, lookY, -40);
  camera.rotation.z += ourPlane.rotation.z * 0.14;
  // speed shake: a whisper of buffet as the throttle opens
  const buffet = Math.min(Math.abs(state.scrollVel), 0.4);
  camera.rotation.x += Math.sin(t * 47) * 0.0008 * buffet;
  camera.rotation.z += Math.sin(t * 39 + 2) * 0.0007 * buffet;
  // FOV widens slightly with throttle — the classic speed cue, dialed gentle
  if (state.entered) {
    const targetFov = 58 + Math.min(Math.abs(state.scrollVel) * 24, 4);
    if (Math.abs(camera.fov - targetFov) > 0.04) {
      camera.fov += (targetFov - camera.fov) * 0.08;
      camera.updateProjectionMatrix();
    }
  }

  // bloom stays constant: no throttle-driven pulsing over the text
  if (gradePass) gradePass.uniforms.uTime.value = t;
  audio.setScrollEnergy(state.scrollVel);
  state.scrollVel *= 0.92;

  renderer.domElement.style.opacity = 1 - Math.min(state.scroll * 1.4, 0.18);

  if (composer) composer.render();
  else renderer.render(scene, camera);
}

window.addEventListener("pointermove", (e) => {
  state.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  state.mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
});

/* ════════════════════════════════════════════
   6 · SMOOTH SCROLL + CHOREOGRAPHY
   ════════════════════════════════════════════ */
let lenis = null;
function initScroll() {
  if (!prefersReducedMotion && typeof Lenis !== "undefined") {
    // longer glide: the page eases out like a throttle, not a race
    lenis = new Lenis({ duration: 1.75, smoothWheel: true });
    lenis.on("scroll", (e) => {
      ScrollTrigger.update();
      state.scrollVel = e.velocity * 0.007;
    });
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  ScrollTrigger.create({
    trigger: document.body,
    start: "top top",
    end: "bottom bottom",
    onUpdate: (self) => { state.scroll = self.progress; },
  });

  document.querySelectorAll("[data-split]").forEach((el) => splitChars(el));
  document.querySelectorAll("[data-split-words]").forEach((el) => splitWords(el));

  gsap.to(".hero .w-inner", {
    y: 0, duration: 1.15, stagger: 0.05, delay: 0.75, ease: "power4.out",
  });
  gsap.utils.toArray(".hero .reveal-line").forEach((el, i) => {
    gsap.fromTo(el, { y: 26, opacity: 0 }, {
      y: 0, opacity: 1, duration: 1, delay: 1.35 + i * 0.15, ease: "power3.out",
    });
  });

  gsap.utils.toArray(".section-title").forEach((el) => {
    gsap.to(el.querySelectorAll(".char"), {
      y: 0, opacity: 1, duration: 0.85, stagger: 0.028, ease: "power4.out",
      scrollTrigger: { trigger: el, start: "top 85%" },
    });
  });
  gsap.utils.toArray(".contact-title .w-inner").forEach((el, i) => {
    gsap.to(el, {
      y: 0, duration: 1, delay: i * 0.05, ease: "power4.out",
      scrollTrigger: { trigger: ".contact-title", start: "top 85%" },
    });
  });

  const aboutText = document.querySelector("[data-words]");
  if (aboutText) {
    const words = aboutText.textContent.trim().split(/\s+/);
    aboutText.innerHTML = words
      .map((w) => `<span class="word-inner">${w}</span>`)
      .join(" ");
    gsap.fromTo(aboutText.querySelectorAll(".word-inner"),
      { opacity: 0.1, y: 10 },
      {
        opacity: 1, y: 0, stagger: 0.02, ease: "none",
        scrollTrigger: { trigger: aboutText, start: "top 82%", end: "bottom 55%", scrub: 0.6 },
      });
  }

  gsap.utils.toArray(".job, .skill-block, .edu-row, .achievement, .stat, .about-photo, .fact").forEach((el) => {
    gsap.fromTo(el, { y: 44, opacity: 0 }, {
      y: 0, opacity: 1, duration: 0.9, ease: "power3.out",
      scrollTrigger: { trigger: el, start: "top 90%" },
    });
  });
  gsap.utils.toArray(".contact-kicker, .contact-email, .contact-links, .contact-meta").forEach((el) => {
    gsap.fromTo(el, { y: 26, opacity: 0 }, {
      y: 0, opacity: 1, duration: 0.9, ease: "power3.out",
      scrollTrigger: { trigger: el, start: "top 94%" },
    });
  });

  gsap.utils.toArray("[data-count]").forEach((el) => {
    const target = parseFloat(el.dataset.count);
    const decimals = parseInt(el.dataset.decimals || "0", 10);
    const obj = { v: 0 };
    gsap.to(obj, {
      v: target, duration: 1.8, ease: "power2.out",
      scrollTrigger: { trigger: el, start: "top 88%" },
      onUpdate: () => { el.textContent = obj.v.toFixed(decimals); },
    });
  });

  if (window.innerWidth > 900) {
    const track = document.getElementById("projectsTrack");
    const pin = document.getElementById("projectsPin");
    const getDist = () => track.scrollWidth - window.innerWidth + 120;
    gsap.to(track, {
      x: () => -getDist(),
      ease: "none",
      scrollTrigger: {
        trigger: pin,
        start: "top top",
        end: () => "+=" + getDist(),
        pin: true,
        scrub: 1,
        invalidateOnRefresh: true,
      },
    });
  }

  gsap.utils.toArray(".marquee").forEach((mq) => {
    const inner = mq.querySelector(".marquee-inner");
    inner.innerHTML = inner.innerHTML.repeat(4);
    const speed = parseFloat(mq.dataset.speed || "1");
    gsap.to(inner, {
      xPercent: -25 * Math.sign(speed) || -25,
      ease: "none",
      scrollTrigger: { trigger: mq, start: "top bottom", end: "bottom top", scrub: 1.5 * Math.abs(speed) },
    });
  });

  // the flight has a story: each sector is a checkpoint with a log line
  const STORY = {
    "01 — TAKEOFF": "WHEELS UP OUT OF THE MARINA. EIGHT CHECKPOINTS TO LANDING.",
    "02 — ABOUT": "FIRST FLYBY: THE PILOT. FOUR YEARS OF SYSTEMS BELOW.",
    "03 — TELEMETRY": "INSTRUMENTS GREEN. THE NUMBERS HOLD UP.",
    "04 — FLIGHT LOG": "LOW PASS OVER THE WORK. PAYPAL TO DUCK CREEK.",
    "05 — ARTIFACTS": "CARGO CHECK: FOUR SHIPPED PRODUCTS, THREE LIVE DOMAINS.",
    "06 — STACK": "TOOLKIT INSPECTION AT CRUISING SPEED.",
    "07 — TRAINING": "OVER THE OLD TRAINING GROUNDS. THREE DEGREES DOWN THERE.",
    "08 — LANDING": "FINAL APPROACH. SEND THE EMAIL, BRING HER HOME.",
  };
  const toast = document.getElementById("toast");
  const toastText = document.getElementById("toastText");
  let toastTween = null;
  const showToast = (sector) => {
    const line = STORY[sector];
    if (!line || !toast) return;
    toastText.textContent = `CHECKPOINT ${sector} · ${line}`;
    if (toastTween) toastTween.kill();
    toastTween = gsap.timeline()
      .to(toast, { opacity: 1, y: 12, duration: 0.4, ease: "power2.out" })
      .to(toast, { opacity: 0, y: 0, duration: 0.5, ease: "power2.in" }, "+=2.6");
  };

  let bellStep = 0;
  gsap.utils.toArray("[data-sector]").forEach((sec) => {
    ScrollTrigger.create({
      trigger: sec,
      start: "top 55%",
      onEnter: () => {
        document.getElementById("hudSection").textContent = sec.dataset.sector;
        audio.bell(bellStep++);
        showToast(sec.dataset.sector);
      },
      onEnterBack: () => {
        document.getElementById("hudSection").textContent = sec.dataset.sector;
        audio.bell(bellStep--);
      },
    });
  });
}

function splitChars(el) {
  el.setAttribute("aria-label", el.textContent.trim());
  const out = [];
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push(node.textContent
        .split("")
        .map((c) => (/\s/.test(c) ? " " : `<span class="char" aria-hidden="true">${c}</span>`))
        .join(""));
    } else {
      out.push(node.outerHTML);
    }
  });
  el.innerHTML = out.join("");
}

function splitWords(el) {
  el.setAttribute("aria-label", el.textContent.trim());
  const wrap = (text) => text
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `<span class="w-mask"><span class="w-inner">${w}</span></span>`)
    .join(" ");
  const out = [];
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) out.push(wrap(node.textContent));
    else if (node.tagName === "EM") out.push(`<em>${wrap(node.textContent)}</em>`);
    else if (node.tagName === "BR") out.push("<br/>");
    else out.push(node.outerHTML);
  });
  el.innerHTML = out.join(" ");
}

/* ════════════════════════════════════════════
   7 · CURSOR, MAGNETIC, SCRAMBLE, TILT
   ════════════════════════════════════════════ */
function initCursor() {
  if (isTouch || prefersReducedMotion) return;
  const cursor = document.getElementById("cursor");
  const dot = document.getElementById("cursorDot");
  let cx = 0, cy = 0, tx = 0, ty = 0;
  window.addEventListener("pointermove", (e) => {
    tx = e.clientX; ty = e.clientY;
    dot.style.left = tx + "px";
    dot.style.top = ty + "px";
  });
  (function loop() {
    cx += (tx - cx) * 0.15;
    cy += (ty - cy) * 0.15;
    cursor.style.left = cx + "px";
    cursor.style.top = cy + "px";
    requestAnimationFrame(loop);
  })();
  document.querySelectorAll("a, button, [data-tilt]").forEach((el) => {
    el.addEventListener("pointerenter", () => cursor.classList.add("is-hover"));
    el.addEventListener("pointerleave", () => cursor.classList.remove("is-hover"));
  });
}

function initMagnetic() {
  if (isTouch || prefersReducedMotion) return;
  document.querySelectorAll("[data-magnetic]").forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2;
      const y = e.clientY - r.top - r.height / 2;
      gsap.to(el, { x: x * 0.22, y: y * 0.22, duration: 0.4, ease: "power3.out" });
    });
    el.addEventListener("pointerleave", () => {
      gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: "elastic.out(1, 0.4)" });
    });
  });
}

const GLYPHS = "!<>-_\\/[]{}=+*^?#";
function initScramble() {
  document.querySelectorAll("[data-scramble]").forEach((el) => {
    const original = el.textContent.trim();
    let frame = null;
    el.addEventListener("pointerenter", () => {
      let i = 0;
      clearInterval(frame);
      frame = setInterval(() => {
        el.textContent = original
          .split("")
          .map((c, idx) => {
            if (idx < i) return original[idx];
            if (c === " ") return " ";
            return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          })
          .join("");
        i += original.length / 12;
        if (i >= original.length) {
          clearInterval(frame);
          el.textContent = original;
        }
      }, 32);
    });
  });
}

function initTilt() {
  if (isTouch || prefersReducedMotion) return;
  document.querySelectorAll("[data-tilt]").forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      gsap.to(el, {
        rotateY: x * 8, rotateX: -y * 8,
        transformPerspective: 900, duration: 0.5, ease: "power2.out",
      });
    });
    el.addEventListener("pointerleave", () => {
      gsap.to(el, { rotateY: 0, rotateX: 0, duration: 0.8, ease: "elastic.out(1, 0.5)" });
    });
  });
}

/* ════════════════════════════════════════════
   8 · HUD READOUTS — flight instruments
   ════════════════════════════════════════════ */
function initHUD() {
  const hudTravel = document.getElementById("hudTravel");
  const hudSpd = document.getElementById("hudSpd");
  const hudDepth = document.getElementById("hudDepth");
  const hudClock = document.getElementById("hudClock");
  setInterval(() => {
    const alt = state.alt * 118;                      // the arc reads on the gauge
    const spd = 168 + Math.min(Math.abs(state.scrollVel) * 2400, 320);
    hudTravel.textContent = `ALT ${String(Math.round(alt)).padStart(4, "0")} FT`;
    hudSpd.textContent = `SPD ${String(Math.round(spd)).padStart(3, "0")} KT`;
    hudDepth.textContent = String(Math.round(state.scroll * 9999)).padStart(4, "0");
    hudClock.textContent = new Date().toLocaleTimeString("en-US", { hour12: false });
  }, 90);
}

/* ════════════════════════════════════════════
   9 · PRELOADER → ENTER SEQUENCE
   ════════════════════════════════════════════ */
function initPreloader() {
  const count = document.getElementById("preloaderCount");
  const bar = document.getElementById("preloaderBar");
  const preloader = document.getElementById("preloader");
  const overlay = document.getElementById("enterOverlay");
  const obj = { v: 0 };
  gsap.to(obj, {
    v: 100, duration: 1.7, ease: "power2.inOut",
    onUpdate: () => {
      count.textContent = String(Math.round(obj.v)).padStart(2, "0");
      bar.style.width = obj.v + "%";
    },
    onComplete: () => {
      gsap.to(preloader, {
        opacity: 0, duration: 0.6, ease: "power2.inOut",
        onComplete: () => {
          preloader.remove();
          overlay.hidden = false;
          gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.6 });
        },
      });
    },
  });

  const enter = async (withSound) => {
    if (state.entered) return;
    state.entered = true;
    if (withSound) { await audio.start(); setAudioUI(true); }
    gsap.to(overlay, {
      opacity: 0, duration: 0.9, ease: "power2.inOut",
      onComplete: () => overlay.remove(),
    });
    if (webglOK) {
      gsap.fromTo(camera, { fov: 76 }, {
        fov: 58, duration: 2.6, ease: "power3.out",
        onUpdate: () => camera.updateProjectionMatrix(),
      });
    }
  };
  document.getElementById("enterBtn").addEventListener("click", () => enter(true));
  document.getElementById("enterSilent").addEventListener("click", () => enter(false));
  // direct links / automated checks can skip the gate
  if (new URLSearchParams(location.search).has("autoenter")) enter(false);
}

/* ════════════════════════════════════════════
   BOOT
   ════════════════════════════════════════════ */
if (!prefersReducedMotion) {
  initScene();
  tick();
} else {
  document.getElementById("webglFallback").hidden = false;
}
initScroll();
initCursor();
initMagnetic();
initScramble();
initTilt();
initHUD();
initPreloader();

console.log(
  "%cMANAN SHAH — PORTFOLIO\n%cYou flew from the clouds to the water and back. Every model is procedural. View source.",
  "color:#ffab70;font-size:15px;font-weight:bold",
  "color:#bcbacb"
);
