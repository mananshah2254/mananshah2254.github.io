/* ═══════════════════════════════════════════════════════════
   MANAN SHAH — PORTFOLIO · THE WORLD
   A bay at golden hour, flown third-person. Physically based
   sky (Preetham scattering), a reflective ocean shader with a
   procedurally generated normal map, image-based lighting baked
   from that same sky, and a coastline of statically batched
   geometry. Scroll is the throttle and the descent: you start
   high over the channel and land at dusk by the contact section.

   Every model and texture is procedural. Zero asset downloads.

   This module is loaded lazily by site.js AFTER the page content
   is on screen. Nothing on the page waits for it.
   ═══════════════════════════════════════════════════════════ */

import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { Water } from "three/addons/objects/Water.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/* shared with site.js: it writes recede/finale, we write alt/spd */
const flight = (window.__flight = window.__flight || {});

const LOW_PERF = window.innerWidth < 900 || (navigator.hardwareConcurrency || 8) <= 4;

const ALT_HI = 15;    // cruising altitude over the hero
const ALT_LO = 5.4;   // final approach by the contact section
const SUN_ELEV = 3.3; // degrees above the horizon at golden hour
const SUN_AZ = 176.4;   // 180 = dead ahead; a little to starboard
const EXPOSURE = 0.48;
const FOG_GOLD = new THREE.Color(0xc2a59b);
const FOG_DUSK = new THREE.Color(0x3b3a5c);

const state = {
  scroll: 0,        // smoothed page progress 0..1
  scrollVel: 0,
  travel: 0,
  alt: ALT_HI,
  dusk: -1,
  mouse: { x: 0, y: 0 },
  mouseLerp: { x: 0, y: 0 },
};

/* ════════════════════════════════════════════
   2 · WORLD CONSTANTS + HELPERS
   ════════════════════════════════════════════ */
const CAM_Z = 10;
const WORLD_LEN = 720;
const CHUNKS = 12;
const SPACING = WORLD_LEN / CHUNKS;

let renderer, scene, camera;
let islands = [], clouds = [], traffic = [], blinkers = [];
let boats = [], balloons = [], cars = [], rotors = [];
let birds = [], bridgeCars = [], tailRotors = [], beamRotors = [], flameSprites = [];
let spinners = [];
let wheels = [], buoys = [], coastCars = [];
let sprays = [], jets = [];
let ANISO = 1;
let ourPlane, trailMats = [];

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

/* ── facades ──
   One tile is 16 bays by 16 floors. Three canvases per style: colour,
   lit-window emissive, and a roughness/metalness map so the glass is a
   mirror for the baked sky while the masonry between it stays matte.
   That per-pixel split is what makes a box read as a building. */
const FACADE_CELLS = 16;
const BAY = 0.4;      // world units per window bay
const FLOOR = 0.37;   // world units per storey
function makeFacade(style, seed) {
  const N = 256, C = N / FACADE_CELLS;
  const mk = () => {
    const c = document.createElement("canvas");
    c.width = c.height = N;
    return [c, c.getContext("2d")];
  };
  const [cc, col] = mk(), [ec, emi] = mk(), [oc, orm] = mk();
  let s = seed;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const P = {
    // wall, glass rgb, window inset (x, y, w, h) inside a 16px cell
    glass:    { wall: "#4f5a66", glass: [58, 78, 98],  win: [1, 2, 14, 13] },
    concrete: { wall: "#93897c", glass: [52, 64, 80],  win: [3, 4, 10, 9] },
    brick:    { wall: "#6e4d40", glass: [46, 54, 66],  win: [5, 4, 7, 10] },
    ribbon:   { wall: "#a9a59c", glass: [54, 72, 92],  win: [0, 5, 16, 7] },
  }[style];
  col.fillStyle = P.wall;
  col.fillRect(0, 0, N, N);
  emi.fillStyle = "#000";
  emi.fillRect(0, 0, N, N);
  // roughness lives in G, metalness in B
  orm.fillStyle = "rgb(0,225,0)";
  orm.fillRect(0, 0, N, N);
  // weathering: soft vertical streaks so walls are not one flat fill
  for (let i = 0; i < 70; i++) {
    col.fillStyle = r() < 0.5 ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.045)";
    col.fillRect(r() * N, 0, 1 + r() * 3, N);
  }
  const [wx, wy, ww, wh] = P.win;
  for (let fy = 0; fy < FACADE_CELLS; fy++) {
    for (let fx = 0; fx < FACADE_CELLS; fx++) {
      const x = fx * C + wx, y = fy * C + wy;
      const b = 0.75 + r() * 0.5; // every pane catches a little more or less sky
      col.fillStyle = `rgb(${P.glass.map((v) => Math.round(v * b)).join(",")})`;
      col.fillRect(x, y, ww, wh);
      orm.fillStyle = `rgb(0,${Math.round(18 + r() * 34)},235)`;
      orm.fillRect(x, y, ww, wh);
      // blinds half drawn on some panes
      if (r() < 0.22) {
        col.fillStyle = "rgba(210,205,190,0.32)";
        col.fillRect(x, y, ww, wh * (0.3 + r() * 0.4));
      }
      const lit = r();
      if (lit < 0.07) {
        const warm = r() < 0.78;
        const k = 0.55 + r() * 0.45;
        emi.fillStyle = warm
          ? `rgb(${Math.round(255 * k)},${Math.round(196 * k)},${Math.round(120 * k)})`
          : `rgb(${Math.round(200 * k)},${Math.round(222 * k)},${Math.round(255 * k)})`;
        emi.fillRect(x, y, ww, wh);
      }
    }
    // spandrel shadow line under each floor
    col.fillStyle = "rgba(0,0,0,0.16)";
    col.fillRect(0, fy * C + wy + wh, N, 1);
  }
  if (style === "glass") {
    // curtain wall: bright aluminium mullions over the glass
    col.fillStyle = "rgba(196,202,210,0.75)";
    orm.fillStyle = "rgb(0,120,160)";
    for (let fx = 0; fx <= FACADE_CELLS; fx++) {
      col.fillRect(fx * C - 0.5, 0, 1, N);
      orm.fillRect(fx * C - 0.5, 0, 1, N);
    }
  }
  const tex = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = ANISO;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: tex(cc, true), emissiveMap: tex(ec, true), orm: tex(oc, false) };
}

/* four facades and no lid: the roof is a separate matte cap so the window
   texture never wraps over the top. UVs are in whole bays and storeys, so
   every tower in the world shares one window scale. */
function towerWalls(w, h, d, rand = rnd) {
  const box = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const pos = box.attributes.position.array;
  const nor = box.attributes.normal.array;
  const uv = box.attributes.uv.array;
  const faces = [0, 1, 4, 5]; // +x, -x, +z, -z
  const P = new Float32Array(72), Nn = new Float32Array(72), U = new Float32Array(48);
  const ou = Math.floor(rand() * FACADE_CELLS) / FACADE_CELLS;
  const ov = Math.floor(rand() * FACADE_CELLS) / FACADE_CELLS;
  const floors = Math.max(1, Math.round(h / FLOOR)) / FACADE_CELLS;
  faces.forEach((f, i) => {
    P.set(pos.subarray(f * 18, f * 18 + 18), i * 18);
    Nn.set(nor.subarray(f * 18, f * 18 + 18), i * 18);
    const bays = Math.max(1, Math.round((f < 2 ? d : w) / BAY)) / FACADE_CELLS;
    for (let k = 0; k < 6; k++) {
      U[(i * 6 + k) * 2] = uv[(f * 6 + k) * 2] * bays + ou;
      U[(i * 6 + k) * 2 + 1] = uv[(f * 6 + k) * 2 + 1] * floors + ov;
    }
  });
  box.dispose();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(P, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(Nn, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(U, 2));
  return geo;
}
function towerRoof(w, d, y) {
  const geo = new THREE.PlaneGeometry(w, d).toNonIndexed();
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y, 0);
  return geo;
}

/* ── static batching ──
   The old world drew every tree, building and lamp as its own mesh: about
   1,900 draw calls per pass, and the water needs two passes. This walks a
   finished model, bakes each still mesh into its parent's space and merges
   them per material, and folds the still glow sprites into one point cloud.
   Anything flagged `userData.dynamic` (rotors, cars, control surfaces) is
   left alone, along with transparent surfaces that need depth sorting. */
function bake(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const lamps = [];
  const drop = [];
  const m4 = new THREE.Matrix4();
  const v3 = new THREE.Vector3();
  const push = (mat, geo) => {
    if (!buckets.has(mat)) buckets.set(mat, []);
    buckets.get(mat).push(geo);
  };
  const slice = (geo, start, count) => {
    const out = new THREE.BufferGeometry();
    for (const k of ["position", "normal", "uv"]) {
      const a = geo.attributes[k];
      out.setAttribute(k, new THREE.BufferAttribute(
        a.array.slice(start * a.itemSize, (start + count) * a.itemSize), a.itemSize
      ));
    }
    return out;
  };
  const visit = (o) => {
    if (o !== root && o.userData.dynamic) return;
    if (o.isMesh) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (!mats.some((m) => m.transparent || m.vertexColors)) {
        m4.multiplyMatrices(inv, o.matrixWorld);
        const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        const n = geo.attributes.position.count;
        if (!geo.attributes.normal) geo.computeVertexNormals();
        if (!geo.attributes.uv) {
          geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
        }
        for (const k of Object.keys(geo.attributes)) {
          if (k !== "position" && k !== "normal" && k !== "uv") geo.deleteAttribute(k);
        }
        geo.applyMatrix4(m4);
        if (m4.determinant() < 0) {
          // a mirrored parent flips the winding: swap two corners per triangle
          for (const k of ["position", "normal", "uv"]) {
            const a = geo.attributes[k], sz = a.itemSize, arr = a.array;
            for (let i = 0; i < n; i += 3) {
              for (let c = 0; c < sz; c++) {
                const tmp = arr[(i + 1) * sz + c];
                arr[(i + 1) * sz + c] = arr[(i + 2) * sz + c];
                arr[(i + 2) * sz + c] = tmp;
              }
            }
          }
        }
        if (mats.length > 1 && geo.groups.length) {
          for (const gr of geo.groups) push(mats[gr.materialIndex], slice(geo, gr.start, gr.count));
          geo.dispose();
        } else {
          geo.clearGroups();
          push(mats[0], geo);
        }
        drop.push(o);
      }
    } else if (o.isSprite && o.userData.strobe === undefined && o.userData.phase === undefined) {
      o.getWorldPosition(v3).applyMatrix4(inv);
      lamps.push(v3.x, v3.y, v3.z);
      drop.push(o);
    }
    for (const c of o.children) visit(c);
  };
  visit(root);
  for (const o of drop) {
    o.removeFromParent();
    if (o.isMesh) o.geometry.dispose();
  }
  for (const [mat, geos] of buckets) {
    const merged = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
    if (geos.length > 1) geos.forEach((g) => g.dispose());
    root.add(new THREE.Mesh(merged, mat));
  }
  if (lamps.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(lamps), 3));
    root.add(new THREE.Points(geo, MAT.lampPoints));
  }
  return root;
}

/* ── ocean normals ──
   A tileable normal map built from a few dozen sine swells with integer
   wave numbers (so it wraps exactly). Separable sin/cos tables keep the
   whole 256 x 256 bake to a few milliseconds, and it replaces the 250 KB
   JPEG the stock three.js ocean ships with. */
function makeWaterNormals(size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const img = g.createImageData(size, size);
  let s = 90210;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const dx = new Float32Array(size * size), dy = new Float32Array(size * size);
  const cu = new Float32Array(size), su = new Float32Array(size);
  const cv = new Float32Array(size), sv = new Float32Array(size);
  const TAU = Math.PI * 2;
  for (let w = 0; w < 44; w++) {
    const k = 2 + Math.floor(Math.pow(r(), 1.5) * 30);
    const ang = (r() - 0.5) * 2.7 + (r() < 0.5 ? 0 : Math.PI);
    const kx = Math.round(Math.cos(ang) * k), ky = Math.round(Math.sin(ang) * k);
    if (!kx && !ky) continue;
    const amp = 1 / Math.pow(Math.hypot(kx, ky), 0.92);
    const ph = r() * TAU;
    for (let i = 0; i < size; i++) {
      const a = (TAU * kx * i) / size, b = (TAU * ky * i) / size + ph;
      cu[i] = Math.cos(a); su[i] = Math.sin(a);
      cv[i] = Math.cos(b); sv[i] = Math.sin(b);
    }
    for (let y = 0, p = 0; y < size; y++) {
      for (let x = 0; x < size; x++, p++) {
        const co = cu[x] * cv[y] - su[x] * sv[y]; // cos(a + b)
        dx[p] += amp * kx * co;
        dy[p] += amp * ky * co;
      }
    }
  }
  const str = 0.05;
  for (let p = 0, q = 0; p < size * size; p++, q += 4) {
    const nx = -dx[p] * str, ny = -dy[p] * str;
    const inv = 1 / Math.hypot(nx, ny, 1);
    img.data[q] = (nx * inv * 0.5 + 0.5) * 255;
    img.data[q + 1] = (ny * inv * 0.5 + 0.5) * 255;
    img.data[q + 2] = (inv * 0.5 + 0.5) * 255;
    img.data[q + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/* ── clouds ──
   Value-noise fbm shaped into a long flat bank: sunlit amber along the
   base where the low sun hits it, cool mauve up top. */
function makeCloudTexture(seed) {
  const W = 256, H = 96;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  const img = g.createImageData(W, H);
  const hash = (x, y) => {
    const h = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return h - Math.floor(h);
  };
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), cc = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (cc - a) * v + (a - b - cc + d) * u * v;
  };
  for (let y = 0, q = 0; y < H; y++) {
    for (let x = 0; x < W; x++, q += 4) {
      let n = 0, amp = 0.5, f = 1;
      for (let o = 0; o < 5; o++) {
        n += noise((x / W) * 3.2 * f, (y / H) * 3.4 * f) * amp;
        amp *= 0.5; f *= 2.05;
      }
      const ex = Math.sin((x / W) * Math.PI), ey = Math.sin((y / H) * Math.PI);
      const mask = Math.pow(ex, 0.8) * Math.pow(ey, 1.4);
      const a = THREE.MathUtils.smoothstep(n * mask, 0.2, 0.52);
      const low = y / H; // 0 top, 1 base
      img.data[q] = 168 + low * 87;
      img.data[q + 1] = 138 + low * 72;
      img.data[q + 2] = 158 - low * 30;
      img.data[q + 3] = a * 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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

/* ── materials: PBR, lit by a low sun and the baked sky ── */
const MAT = {};
function initMaterials() {
  const mkWall = (style, seed, tint) => {
    const f = makeFacade(style, seed);
    return new THREE.MeshStandardMaterial({
      color: tint, map: f.map,
      emissive: 0xffffff, emissiveMap: f.emissiveMap, emissiveIntensity: 0.9,
      roughnessMap: f.orm, metalnessMap: f.orm, roughness: 1, metalness: 1,
    });
  };
  MAT.walls = [
    mkWall("glass", 7919, 0xffffff),
    mkWall("concrete", 104729, 0xffffff),
    mkWall("brick", 15485863, 0xffffff),
    mkWall("ribbon", 32452843, 0xffffff),
  ];
  const ground = (base, light, dark, seed) => {
    const t = makeGroundTexture(base, light, dark, seed);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  MAT.grass = new THREE.MeshStandardMaterial({
    map: ground("#3f5a37", "#5f7a48", "#2c4229", 4241), roughness: 0.96,
  });
  MAT.shore = new THREE.MeshStandardMaterial({
    map: ground("#b3a183", "#cdbd9d", "#8f7f66", 7333), roughness: 1,
  });
  // waterfront signage: a little self-lit, so it carries into dusk
  const sign = (c) => new THREE.MeshStandardMaterial({
    color: 0x1a1a1e, emissive: c, emissiveIntensity: 1.6, roughness: 0.6,
  });
  MAT.neonPink = sign(0xff6fa0);
  MAT.neonCyan = sign(0x58e0d8);
  MAT.neonRed = sign(0xff5a48);
  MAT.neonBlue = sign(0x6f9cff);
  MAT.storefront = new THREE.MeshStandardMaterial({
    color: 0x2a2018, emissive: 0xffb469, emissiveIntensity: 1.1, roughness: 0.7,
  });
  MAT.palmTrunk = new THREE.MeshStandardMaterial({ color: 0x4d3c2c, roughness: 1 });
  MAT.frond = new THREE.MeshStandardMaterial({ color: 0x3a5e36, roughness: 0.9, side: THREE.DoubleSide });
  MAT.intake = new THREE.MeshStandardMaterial({ color: 0x0e1018, roughness: 0.3, metalness: 0.9 });
  MAT.canopy = new THREE.MeshStandardMaterial({
    color: 0x24303f, transparent: true, opacity: 0.72, roughness: 0.08, metalness: 0.85,
  });
  MAT.canopy.userData.env = 1.5;
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
  MAT.paint = [0x9c3b2e, 0x2f558f, 0xb9772e, 0x2f7d6c, 0xb9b9bd, 0xd8d5cc].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.25 })
  );
  MAT.fan = new THREE.MeshBasicMaterial({ map: makeFanTexture(), transparent: true });
  MAT.rock = new THREE.MeshStandardMaterial({ color: 0x6a655f, roughness: 0.92, flatShading: true });
  MAT.trunk = new THREE.MeshStandardMaterial({ color: 0x3f3024, roughness: 1 });
  MAT.leaf = new THREE.MeshStandardMaterial({ color: 0x2f5233, roughness: 0.95 });
  MAT.leafDark = new THREE.MeshStandardMaterial({ color: 0x22402a, roughness: 0.95 });
  MAT.wallA = MAT.walls[0];
  MAT.wallB = MAT.walls[1];
  MAT.roof = new THREE.MeshStandardMaterial({ color: 0x4c4e55, roughness: 0.9 });
  MAT.concrete = new THREE.MeshStandardMaterial({ color: 0x8d8c88, roughness: 0.85 });
  MAT.asphalt = new THREE.MeshStandardMaterial({ color: 0x2b2c31, roughness: 0.92 });
  MAT.tower = new THREE.MeshStandardMaterial({ color: 0xcfc8ba, roughness: 0.6 });
  MAT.towerTop = new THREE.MeshStandardMaterial({ color: 0x9a3a34, roughness: 0.6 });
  // the bridge: international orange, a nod to the one outside the window
  MAT.bridge = new THREE.MeshStandardMaterial({ color: 0xa63a26, roughness: 0.62, metalness: 0.2 });
  MAT.fuselage = new THREE.MeshStandardMaterial({ color: 0xe8e9ee, roughness: 0.22, metalness: 0.7 });
  // the hero hull: baked livery + rivet bump over polished aluminium
  const fusTex = makeFuselageTexture();
  fusTex.anisotropy = ANISO;
  fusTex.colorSpace = THREE.SRGBColorSpace;
  const fusBump = makeFuselageBump();
  fusBump.anisotropy = ANISO;
  MAT.hull = new THREE.MeshStandardMaterial({
    map: fusTex, bumpMap: fusBump, bumpScale: 0.02,
    roughness: 0.24, metalness: 0.5,
  });
  MAT.wingA = new THREE.MeshStandardMaterial({ color: 0xe8703a, roughness: 0.36, metalness: 0.35 });
  MAT.wingB = new THREE.MeshStandardMaterial({ color: 0x3f55c8, roughness: 0.38, metalness: 0.4 });
  MAT.wingC = new THREE.MeshStandardMaterial({ color: 0x2e8f78, roughness: 0.38, metalness: 0.4 });
  MAT.glassC = new THREE.MeshStandardMaterial({ color: 0x161c33, roughness: 0.15, metalness: 0.8 });
  MAT.carBody = new THREE.MeshStandardMaterial({ color: 0x2a2a3e, roughness: 0.4, metalness: 0.6 });
  MAT.tank = new THREE.MeshStandardMaterial({ color: 0x6f6a72, roughness: 0.6, metalness: 0.3 });
  MAT.ridge = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97 });
  MAT.beam = new THREE.MeshBasicMaterial({ map: makeBeamTexture(), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  MAT.bird = new THREE.SpriteMaterial({ map: makeBirdTexture(), transparent: true, opacity: 0.7, depthWrite: false });
  const glow = (r, g, b) => new THREE.SpriteMaterial({
    map: makeRadialSprite([[0, `rgba(${r},${g},${b},1)`], [0.4, `rgba(${r},${g},${b},0.45)`], [1, `rgba(${r},${g},${b},0)`]], 64),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  MAT.lightRed = glow(255, 96, 84);
  MAT.lightGreen = glow(110, 255, 150);
  MAT.lightAmber = glow(255, 196, 124);
  MAT.lightWhite = glow(244, 244, 255);
  // every still street lamp and porch light in a model becomes one of these
  MAT.lampPoints = new THREE.PointsMaterial({
    map: MAT.lightAmber.map, color: 0xffc98a, size: 0.85, sizeAttenuation: true,
    transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  // everything the baked sky lights, so dusk can turn it down in one loop
  MAT.pbr = [];
  const seen = new Set();
  const collect = (m) => {
    if (m && m.isMeshStandardMaterial && !seen.has(m)) { seen.add(m); MAT.pbr.push(m); }
  };
  for (const v of Object.values(MAT)) Array.isArray(v) ? v.forEach(collect) : collect(v);
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
  propG.userData.dynamic = true;
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
    ail.userData.dynamic = true;
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
  rud.userData.dynamic = true;
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
    el.userData.dynamic = true;
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
  for (const l of g.userData.navLights) l.userData.dynamic = true;
  g.userData.ctrl = ctrl;
  return bake(g);
}

function makeBuilding(h, w, d, wall) {
  const b = new THREE.Group();
  const setback = h > 9 && rnd() < 0.45;
  const stack = (bw, bh, bd, y0) => {
    const walls = new THREE.Mesh(towerWalls(bw, bh, bd), wall);
    walls.position.y = y0 + bh / 2;
    b.add(walls, new THREE.Mesh(towerRoof(bw, bd, y0 + bh), MAT.roof));
  };
  if (setback) {
    stack(w, h * 0.62, d, 0);
    stack(w * 0.62, h * 0.38, d * 0.62, h * 0.62);
  } else {
    stack(w, h, d, 0);
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
  h.userData.dynamic = true;
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
    // ring road with moving cars
    const roadR = radius * 0.8;
    const road = new THREE.Mesh(new THREE.RingGeometry(roadR - 0.7, roadR + 0.7, 40), MAT.asphalt);
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
      car.userData.dynamic = true;
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
    beamPivot.userData.dynamic = true;
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

  return bake(g);
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
  wheel.userData.dynamic = true;
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

  // building rows: waterfront mid-rise, low-rise behind, tall downtown last
  const buckets = [[], [], [], []];
  const roofs = [];
  const neon = { pink: [], cyan: [], red: [], blue: [] };
  const storefronts = [];
  const rows = LOW_PERF ? 3 : 4;
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
      const bz = z + (cr() - 0.5) * 2;
      const geo = towerWalls(w, h, d, cr);
      geo.translate(bx, 2.4 + h / 2, bz);
      // tall towers lean glass, the low blocks lean masonry
      const style = h > 10 ? (cr() < 0.6 ? 0 : 3) : Math.floor(cr() * 4);
      buckets[style].push(geo);
      const roof = towerRoof(w, d, 2.4 + h);
      roof.translate(bx, 0, bz);
      roofs.push(roof);
      if (!LOW_PERF && row === 0) {
        const face = bx - side * (w / 2 + 0.05);
        // a lit crown, or a vertical sign running down the facade
        if (cr() < 0.2) {
          const strip = new THREE.BoxGeometry(0.07, 0.07, d * 0.85);
          strip.translate(face, 2.4 + h - 0.3, bz);
          (cr() < 0.5 ? neon.pink : neon.cyan).push(strip);
        } else if (cr() < 0.22) {
          const sign = new THREE.BoxGeometry(0.08, Math.min(h * 0.6, 2.6), 0.08);
          sign.translate(face, 2.4 + h * 0.55, bz);
          (cr() < 0.5 ? neon.red : neon.blue).push(sign);
        }
        // storefront glow strip at street level
        if (cr() < 0.6) {
          const shop = new THREE.BoxGeometry(0.06, 0.4, d * 0.8);
          shop.translate(face, 2.7, bz);
          storefronts.push(shop);
        }
      }
    }
  }
  buckets.forEach((geos, i) => {
    if (geos.length) g.add(new THREE.Mesh(mergeGeometries(geos), MAT.walls[i]));
  });
  if (roofs.length) g.add(new THREE.Mesh(mergeGeometries(roofs), MAT.roof));
  if (neon.pink.length) g.add(new THREE.Mesh(mergeGeometries(neon.pink), MAT.neonPink));
  if (neon.cyan.length) g.add(new THREE.Mesh(mergeGeometries(neon.cyan), MAT.neonCyan));
  if (neon.red.length) g.add(new THREE.Mesh(mergeGeometries(neon.red), MAT.neonRed));
  if (neon.blue.length) g.add(new THREE.Mesh(mergeGeometries(neon.blue), MAT.neonBlue));
  if (storefronts.length) g.add(new THREE.Mesh(mergeGeometries(storefronts), MAT.storefront));

  // palms along the beach, shore lights, a boulevard with traffic
  for (let i = 0; i < (LOW_PERF ? 4 : 7); i++) {
    const palm = makePalm(1.5 + cr() * 0.8);
    palm.position.set(side * (60 + cr() * 2.5), 0.7, -D / 2 + 6 + i * (D / 7) + cr() * 8);
    palm.rotation.y = cr() * Math.PI * 2;
    palm.scale.x *= side; // lean toward the water on both shores
    g.add(palm);
  }
  for (let i = 0; i < 10; i++) {
    const lamp = new THREE.Sprite(MAT.lightAmber);
    lamp.position.set(side * 61.8, 3.1, -D / 2 + 5 + i * (D / 10) + cr() * 5);
    g.add(lamp);
  }
  if (!LOW_PERF) {
    for (let i = 0; i < 4; i++) {
      const umb = makeUmbrella();
      umb.position.set(side * (57 + cr() * 2), 0.7, -D / 2 + 12 + i * (D / 4) + cr() * 12);
      g.add(umb);
    }
  }
  const road = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, D), MAT.asphalt);
  road.position.set(side * 63.2, 2.44, 0);
  g.add(road);
  for (let i = 0; i < 3; i++) {
    const car = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.58), MAT.paint[Math.floor(cr() * 6)]);
    car.position.set(side * (62.7 + (i % 2)), 2.55, 0);
    car.userData.dynamic = true;
    g.add(car);
    coastCars.push({ car, D, speed: 3 + cr() * 2.5, phase: cr() * D, dir: i % 2 === 0 ? 1 : -1 });
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
  return bake(g);
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
    [0.0, 0x2e3d2c], [0.28, 0x414a35], [0.52, 0x5b5146],
    [0.74, 0x7d7068], [0.9, 0xb9a79c], [1.0, 0xe9dccf],
  ].map(([p, c]) => [p, new THREE.Color(c)]);
  const hazeCol = FOG_GOLD;
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

/* suspension bridge closing the mouth of the bay: fly under it low, over
   it high. The deck runs shore to shore. */
function makeBridge() {
  const g = new THREE.Group();
  const deckY = 6.5, HALF = 58, TOWER_X = 21, TOP = 21;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, 0.45, 3.2), MAT.bridge);
  deck.position.y = deckY;
  const roadway = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, 0.05, 2.5), MAT.asphalt);
  roadway.position.y = deckY + 0.25;
  // stiffening truss under the deck
  const truss = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, 0.55, 0.16), MAT.bridge);
  truss.position.set(0, deckY - 0.48, 1.45);
  const truss2 = truss.clone();
  truss2.position.z = -1.45;
  g.add(deck, roadway, truss, truss2);
  // towers: twin legs with stacked portal braces
  for (const tx of [-TOWER_X, TOWER_X]) {
    for (const tz of [-1.4, 1.4]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1, TOP, 0.9), MAT.bridge);
      leg.position.set(tx, TOP / 2, tz);
      g.add(leg);
    }
    for (const by of [deckY + 3.4, deckY + 7.6, deckY + 11.4, TOP - 0.5]) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 2.6), MAT.bridge);
      brace.position.set(tx, by, 0);
      g.add(brace);
    }
    const warn = new THREE.Sprite(MAT.lightRed.clone());
    warn.position.set(tx, TOP + 0.5, 0);
    warn.scale.setScalar(0.6);
    warn.userData.strobe = rnd() * Math.PI * 2;
    blinkers.push(warn);
    g.add(warn);
  }
  // main cables: tower-to-tower sag + anchor runs down to the shores,
  // with vertical suspenders dropping to the deck
  const hang = [];
  for (const cz of [-1.4, 1.4]) {
    const spans = [
      new THREE.QuadraticBezierCurve3(new THREE.Vector3(-TOWER_X, TOP, cz), new THREE.Vector3(0, deckY - 5.2, cz), new THREE.Vector3(TOWER_X, TOP, cz)),
      new THREE.QuadraticBezierCurve3(new THREE.Vector3(-HALF, deckY + 0.4, cz), new THREE.Vector3(-HALF * 0.62, deckY + 2.2, cz), new THREE.Vector3(-TOWER_X, TOP, cz)),
      new THREE.QuadraticBezierCurve3(new THREE.Vector3(TOWER_X, TOP, cz), new THREE.Vector3(HALF * 0.62, deckY + 2.2, cz), new THREE.Vector3(HALF, deckY + 0.4, cz)),
    ];
    for (const curve of spans) {
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.09, 6), MAT.bridge));
      const n = Math.round(curve.getLength() / 2.1);
      for (let i = 1; i < n; i++) {
        const p = curve.getPoint(i / n);
        const len = p.y - deckY;
        if (len < 0.5) continue;
        const rod = new THREE.CylinderGeometry(0.022, 0.022, len, 4);
        rod.translate(p.x, deckY + len / 2, cz);
        hang.push(rod);
      }
    }
  }
  g.add(new THREE.Mesh(mergeGeometries(hang), MAT.bridge));
  // deck lights
  for (let x = -HALF + 4; x <= HALF - 4; x += 5) {
    const s = new THREE.Sprite(MAT.lightAmber);
    s.position.set(x, deckY + 0.8, x % 2 ? 1.5 : -1.5);
    g.add(s);
  }
  // traffic crossing the span, back and forth
  const laneCount = LOW_PERF ? 2 : 4;
  for (let i = 0; i < laneCount; i++) {
    const car = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.5), MAT.carBody);
    body.position.y = 0.1;
    const head = new THREE.Sprite(MAT.lightWhite.clone());
    head.position.set(0, 0.1, -0.32); head.scale.setScalar(0.28);
    const tail = new THREE.Sprite(MAT.lightRed.clone());
    tail.position.set(0, 0.1, 0.32); tail.scale.setScalar(0.2);
    car.add(body, head, tail);
    const lane = i % 2 === 0 ? 0.7 : -0.7;
    car.position.set(0, deckY + 0.34, lane);
    car.userData.dynamic = true;
    g.add(car);
    bridgeCars.push({ car, z: lane, phase: rnd() * Math.PI * 2, speed: 0.1 + rnd() * 0.05, dir: lane > 0 ? 1 : -1 });
  }
  return bake(g);
}

/* ════════════════════════════════════════════
   4 · SCENE
   ════════════════════════════════════════════ */
let sky = null, water = null, sunLight = null, hemi = null, stars = null, sunDisc = null, sunHalo = null;
const sunDir = new THREE.Vector3();
const SUN_GOLD = new THREE.Color(0xffc27d);
const SUN_EMBER = new THREE.Color(0x6b2a1c);
const HEMI_GOLD = new THREE.Color(0xb9c4e0);
const HEMI_DUSK = new THREE.Color(0x6f7fc2);
const CLOUD_GOLD = new THREE.Color(0xffffff);
const CLOUD_DUSK = new THREE.Color(0x6b5a78);
let mirrorParked = false;

/* Golden hour to dusk. d = 0 is the hero, d = 1 is the landing. Only the
   cheap things move: uniforms, light levels, fog. The baked environment
   map stays put and is simply turned down. */
function applyDusk(d) {
  if (Math.abs(d - state.dusk) < 0.004) return;
  state.dusk = d;
  const elev = THREE.MathUtils.lerp(SUN_ELEV, -0.9, d);
  sunDir.setFromSphericalCoords(
    1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(SUN_AZ)
  );
  sky.material.uniforms.sunPosition.value.copy(sunDir);
  const wu = water.material.uniforms;
  wu.sunDirection.value.copy(sunDir).normalize();
  wu.sunColor.value.lerpColors(SUN_GOLD, SUN_EMBER, d);
  sunLight.position.copy(sunDir).multiplyScalar(300);
  // the visible sun: a hot core and a wide halo, both sinking with it
  sunDisc.position.copy(sunDir).multiplyScalar(1150);
  sunHalo.position.copy(sunDisc.position);
  const glow = Math.max(1 - d * 1.5, 0);
  sunDisc.material.opacity = glow;
  sunHalo.material.opacity = 0.55 * Math.max(1 - d * 0.75, 0);
  sunLight.intensity = THREE.MathUtils.lerp(3.2, 0, Math.min(d * 1.25, 1));
  hemi.intensity = THREE.MathUtils.lerp(1.25, 0.7, d);
  hemi.color.lerpColors(HEMI_GOLD, HEMI_DUSK, d);
  scene.fog.color.lerpColors(FOG_GOLD, FOG_DUSK, d);
  renderer.toneMappingExposure = THREE.MathUtils.lerp(EXPOSURE, EXPOSURE * 1.15, d);
  const lit = THREE.MathUtils.lerp(0.55, 3.2, d);
  for (const m of MAT.walls) m.emissiveIntensity = lit;
  const env = THREE.MathUtils.lerp(1, 0.32, d);
  for (const m of MAT.pbr) m.envMapIntensity = env * (m.userData.env || 1);
  MAT.lampPoints.opacity = THREE.MathUtils.lerp(0.5, 1, d);
  if (stars) stars.material.opacity = d * d * 0.85;
  for (const cl of clouds) {
    cl.material.color.lerpColors(CLOUD_GOLD, CLOUD_DUSK, d);
  }
}

function initScene() {
  const canvas = document.getElementById("scene");
  try {
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: false, powerPreference: "high-performance",
    });
  } catch (e) {
    return false;
  }
  ANISO = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, LOW_PERF ? 1.25 : 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSURE;

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(FOG_GOLD.getHex(), 110, 900);
  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.3, 1400);
  camera.position.set(0, state.alt + 2.2, CAM_Z);
  frameCamera();

  initMaterials();

  // ── sky: real atmospheric scattering, so the gradient, the sun disc and
  //    the glow around it all come from one physical model
  sky = new Sky();
  sky.scale.setScalar(6000);
  const su = sky.material.uniforms;
  su.turbidity.value = 6;
  su.rayleigh.value = 2.2;
  su.mieCoefficient.value = 0.014;
  su.mieDirectionalG.value = 0.86;
  scene.add(sky);

  // ── ocean: planar reflection distorted by a normal map, fresnel, sun
  //    glitter. One low-resolution mirror pass replaces the old stack of
  //    reflector + wave mesh + shimmer layers + shadow catcher.
  const res = LOW_PERF ? 256 : 512;
  water = new Water(new THREE.PlaneGeometry(4000, 4000), {
    textureWidth: res,
    textureHeight: res,
    waterNormals: makeWaterNormals(256),
    sunDirection: new THREE.Vector3(0, 1, 0),
    sunColor: SUN_GOLD.getHex(),
    waterColor: 0x0a2b36,
    distortionScale: 0.8,
    fog: true,
  });
  water.rotation.x = -Math.PI / 2;
  const wm = water.material;
  wm.uniforms.size.value = 5;
  // HDR mirror: the sky near the sun is far brighter than 1.0, and an
  // 8-bit target clips it into a dull reflection
  wm.uniforms.mirrorSampler.value.type = THREE.HalfFloatType;
  // the world is a treadmill, so the water has to slide with it
  wm.uniforms.flow = { value: new THREE.Vector2() };
  wm.fragmentShader = wm.fragmentShader
    .replace("uniform float size;", "uniform float size;\n\t\t\t\tuniform vec2 flow;")
    .replace("getNoise( worldPosition.xz * size )", "getNoise( ( worldPosition.xz + flow ) * size )");
  // park the mirror pass while the world sits dimmed behind the content
  const mirrorPass = water.onBeforeRender;
  water.onBeforeRender = function (...args) {
    if (!mirrorParked) mirrorPass.apply(this, args);
  };
  scene.add(water);

  // ── lights: a low warm sun and a cool sky fill
  hemi = new THREE.HemisphereLight(HEMI_GOLD.getHex(), 0x4a4038, 1.25);
  sunLight = new THREE.DirectionalLight(0xffbf85, 3.2);
  scene.add(hemi, sunLight);

  // ── the sun itself. The scattering model lights the sky around it but
  //    extinguishes the disc this close to the horizon, so draw it.
  {
    const mk = (stops, scale, rgb) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeRadialSprite(stops, 256), transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, fog: false,
      }));
      sp.material.color.setRGB(...rgb);
      sp.scale.setScalar(scale);
      scene.add(sp);
      return sp;
    };
    sunDisc = mk([[0, "rgba(255,255,255,1)"], [0.16, "rgba(255,244,214,1)"], [0.22, "rgba(255,214,150,0.5)"], [0.5, "rgba(255,170,100,0.12)"], [1, "rgba(255,150,90,0)"]], 150, [7, 5.2, 3.2]);
    sunHalo = mk([[0, "rgba(255,190,130,0.9)"], [0.3, "rgba(255,160,100,0.35)"], [1, "rgba(255,140,90,0)"]], 760, [1.5, 1.05, 0.7]);
  }

  // ── a handful of first stars, only visible once the sun is down
  if (!LOW_PERF) {
    const N = 520;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const az = rnd() * Math.PI * 2;
      const el = 0.3 + Math.pow(rnd(), 1.3) * 1.2;
      pos[i * 3] = Math.cos(el) * Math.cos(az) * 1100;
      pos[i * 3 + 1] = Math.sin(el) * 1100;
      pos[i * 3 + 2] = Math.cos(el) * Math.sin(az) * 1100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    stars = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xe9ecff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0,
      depthWrite: false, fog: false,
    }));
    stars.layers.set(1); // sky only: keep them out of the water mirror
    camera.layers.enable(1);
    scene.add(stars);
  }


  // ── cloud bank: lit from below by the low sun, pinned to the far sky
  {
    const texes = [makeCloudTexture(11), makeCloudTexture(29), makeCloudTexture(47)];
    const N = LOW_PERF ? 7 : 13;
    for (let i = 0; i < N; i++) {
      const az = THREE.MathUtils.degToRad(-78 + (i / (N - 1)) * 156 + (rnd() - 0.5) * 9);
      const R = 620 + rnd() * 260;
      const w = 260 + rnd() * 300;
      const cl = new THREE.Sprite(new THREE.SpriteMaterial({
        map: texes[i % 3], transparent: true, depthWrite: false, fog: false,
        opacity: 0.62 + rnd() * 0.3,
      }));
      cl.position.set(Math.sin(az) * R, 62 + rnd() * 150, -Math.cos(az) * R);
      cl.scale.set(w, w * (0.11 + rnd() * 0.08), 1);
      cl.userData.drift = 0.25 + rnd() * 0.5;
      cl.userData.x0 = cl.position.x;
      clouds.push(cl);
      scene.add(cl);
    }
  }
  applyDusk(0);

  // ── image-based lighting baked from the same sky, so glass, paint and
  //    aluminium all reflect the actual sunset instead of a flat specular
  {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const envSky = new Sky();
    envSky.scale.setScalar(1000);
    for (const k of ["turbidity", "rayleigh", "mieCoefficient", "mieDirectionalG"]) {
      envSky.material.uniforms[k].value = su[k].value;
    }
    envSky.material.uniforms.sunPosition.value.copy(sunDir);
    envScene.add(envSky);
    // a dark sea below the horizon, or every downward-facing surface would
    // glow with reflected sky
    const envSea = new THREE.Mesh(
      new THREE.CircleGeometry(900, 24),
      new THREE.MeshBasicMaterial({ color: 0x10202a })
    );
    envSea.rotation.x = -Math.PI / 2;
    envSea.position.y = -4;
    envScene.add(envSea);
    scene.environment = pmrem.fromScene(envScene, 0.035, 1, 2000).texture;
    pmrem.dispose();
    envSky.material.dispose();
  }


  // ── headlands and ranges: displaced-heightfield ridges ringing the bay,
  //    with the mouth left open so the sun sets over clear water
  const open = (ang, half) => {
    const a = Math.atan2(Math.sin(ang - 0.06), Math.cos(ang - 0.06)); // centre on the sun
    return Math.abs(a) < half;
  };
  for (const [x, z, h, w] of [[-205, -250, 44, 250], [228, -262, 50, 240]]) {
    const ridge = makeRidge(w, 64, h, 11.3 + x * 0.01, 0);
    ridge.position.set(x, -1.5, z);
    scene.add(ridge);
  }
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + 0.35;
    if (open(ang, 0.75)) continue;
    const R = 330 + rnd() * 40;
    const ridge = makeRidge(340, 80, 58 + rnd() * 22, 40 + i * 13.1, 0);
    ridge.position.set(Math.sin(ang) * R, -2, 10 - Math.cos(ang) * R);
    ridge.rotation.y = -ang;
    scene.add(ridge);
  }
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2;
    if (open(ang, 0.9)) continue;
    const R = 430;
    const ridge = makeRidge(460, 90, 84 + rnd() * 26, 90 + i * 23.7, 0);
    ridge.position.set(Math.sin(ang) * R, -3, 10 - Math.cos(ang) * R);
    ridge.rotation.y = -ang;
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
  bridge.userData.baseOffset = 548; // ahead of the hero, framing the sunset
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
  for (const side of [-1, 1]) {
    for (let ci = 0; ci < 3; ci++) {
      const D2 = WORLD_LEN / 3;
      const chunk = new THREE.Group();
      let s2 = 5501 + ci * 131 + (side > 0 ? 17 : 0);
      const fr = () => (s2 = (s2 * 16807) % 2147483647) / 2147483647;
      const buckets = [[], [], [], []];
      const roofs = [];
      for (let z = -D2 / 2 + 6; z < D2 / 2 - 6; z += LOW_PERF ? 14 : 8) {
        if (fr() < 0.2) continue;
        const h = 10 + fr() * 24;
        const w = 3.5 + fr() * 4, d = 3.5 + fr() * 3;
        const bx = side * (150 + fr() * 60), bz = z + (fr() - 0.5) * 3;
        const geo = towerWalls(w, h, d, fr);
        geo.translate(bx, h / 2, bz);
        buckets[fr() < 0.55 ? 0 : Math.floor(fr() * 4)].push(geo);
        const roof = towerRoof(w, d, h);
        roof.translate(bx, 0, bz);
        roofs.push(roof);
      }
      buckets.forEach((geos, i) => {
        if (geos.length) chunk.add(new THREE.Mesh(mergeGeometries(geos), MAT.walls[i]));
      });
      if (roofs.length) chunk.add(new THREE.Mesh(mergeGeometries(roofs), MAT.roof));
      chunk.userData.baseOffset = ci * D2;
      islands.push(chunk);
      scene.add(chunk);
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
    bake(islet);
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

  // our aircraft
  ourPlane = makeAircraft(MAT.wingA);
  ourPlane.scale.setScalar(0.75);
  ourPlane.position.set(0, state.alt, -2.2);
  scene.add(ourPlane);
  const trailTex = makeTrailTexture();
  for (const side of [-1, 1]) {
    const trail = new THREE.Mesh(
      new THREE.PlaneGeometry(0.07, 5.5),
      new THREE.MeshBasicMaterial({ map: trailTex, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    trail.rotation.x = -Math.PI / 2;
    trail.position.set(side * 2.3, 0, 2.9);
    ourPlane.add(trail);
    trailMats.push(trail.material);
  }

  // float spray kicked up when we drag the deck
  for (const sx of [-1, 1]) {
    const sp = new THREE.Sprite(MAT.lightWhite.clone());
    sp.material.opacity = 0;
    sp.scale.set(1.1, 0.65, 1);
    scene.add(sp);
    sprays.push({ sp, sx });
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

  window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    frameCamera();
    pageMax = 0;
  });
  return true;
}

/* On wide screens the copy owns the left of the hero, so the vanishing
   point (and with it the aircraft and the sun) slides right. */
function frameCamera() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  if (w >= 900) camera.setViewOffset(w, h, -w * 0.17, -h * 0.075, w, h);
  else camera.setViewOffset(w, h, 0, h * 0.1, w, h);
  camera.updateProjectionMatrix();
}

/* ════════════════════════════════════════════
   5 · RENDER LOOP
   ════════════════════════════════════════════ */
const clock = new THREE.Clock();
let prevAlt = ALT_HI;
let frameNo = 0;
let pageMax = 0;
let lastY = window.scrollY;
let firstFrame = true;

function tick() {
  requestAnimationFrame(tick);
  if (document.hidden) return;
  frameNo++;

  // scroll is read here, once per frame, and smoothed: the world glides
  // even though the page itself uses plain native scrolling
  if (!pageMax || frameNo % 90 === 0) {
    pageMax = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
  }
  const y = window.scrollY;
  const target = THREE.MathUtils.clamp(y / pageMax, 0, 1);
  state.scroll += (target - state.scroll) * 0.07;
  const instVel = THREE.MathUtils.clamp((y - lastY) * 0.007, -0.6, 0.6);
  lastY = y;
  state.scrollVel += (instVel - state.scrollVel) * 0.12;

  // behind the content sheets the world is a faint texture: render it at
  // a third of the frame rate and skip the mirror pass entirely
  const recede = flight.recede || 0;
  const finale = flight.finale || 0;
  const dimmed = recede > 0.985 && finale < 0.02;
  mirrorParked = dimmed;
  if (dimmed && frameNo % 3) return;

  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  state.mouseLerp.x += (state.mouse.x - state.mouseLerp.x) * 0.085;
  state.mouseLerp.y += (state.mouse.y - state.mouseLerp.y) * 0.085;

  // unhurried cruise: roughly one world loop per page, gentle idle drift
  const travel = state.scroll * WORLD_LEN * 1.05 + t * 1.6;
  state.travel = travel;

  // the descent: high over the channel, down to a low final approach
  const s = state.scroll;
  const ease = s * s * (3 - 2 * s);
  const targetAlt = ALT_HI + (ALT_LO - ALT_HI) * ease;
  state.alt += (targetAlt - state.alt) * 0.035;
  const climbRate = state.alt - prevAlt;
  prevAlt = state.alt;

  applyDusk(finale * finale * (3 - 2 * finale));

  for (const isl of islands) isl.position.z = wrapZ(isl.userData.baseOffset, travel);
  for (const cl of clouds) cl.position.x = cl.userData.x0 + Math.sin(t * 0.01 * cl.userData.drift) * 14;
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
    bc.car.position.x = Math.sin(t * bc.speed + bc.phase) * 52;
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

  // the sea slides under us with the treadmill, and keeps its own slow swell
  const wu = water.material.uniforms;
  wu.time.value = t * 0.42;
  wu.flow.value.set(0, -travel);

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
  // pitch, rudder vs yaw. Small motions that make the airframe read alive
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
  const trailOp = 0.05 + Math.min(Math.abs(state.scrollVel) * 3.2 + Math.abs(climbRate) * 2, 0.4);
  for (const m of trailMats) m.opacity = trailOp;

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
  // a whisper of buffet as the throttle opens
  const buffet = Math.min(Math.abs(state.scrollVel), 0.4);
  camera.rotation.x += Math.sin(t * 47) * 0.0008 * buffet;
  camera.rotation.z += Math.sin(t * 39 + 2) * 0.0007 * buffet;

  // instruments + score, for site.js
  flight.alt = state.alt * 118;
  flight.spd = 168 + Math.min(Math.abs(state.scrollVel) * 2400, 320);
  if (flight.audio) flight.audio.setScrollEnergy(state.scrollVel);

  renderer.render(scene, camera);

  if (firstFrame) {
    firstFrame = false;
    flight.ready = true;
    document.documentElement.classList.add("world-live");
    window.dispatchEvent(new Event("world:ready"));
  }
}

window.addEventListener("pointermove", (e) => {
  state.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  state.mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
}, { passive: true });

/* ════════════════════════════════════════════
   BOOT
   ════════════════════════════════════════════ */
if (initScene()) {
  tick();
} else {
  flight.failed = true;
}

console.log(
  "%cMANAN SHAH · PORTFOLIO\n%cThe bay below is procedural: sky, sea, cities and aircraft are all generated at boot. View source.",
  "color:#ffab70;font-size:15px;font-weight:bold",
  "color:#bcbacb"
);
