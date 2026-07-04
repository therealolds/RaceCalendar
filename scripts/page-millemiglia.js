/* Mille Miglia: endless open-road driver, seen from behind the wheel.
   Pseudo-3D "OutRun style" rendering: the road model is a flat list of
   centreline samples; every screen scanline below the horizon is
   projected to a forward distance and drawn as a 1px strip, so curves
   ahead bend away naturally. Simulation stays in flat world space. */

import { initShell } from './ui.js';

const BEST_KEY = 'rc-mille-best';

const ROW = 4;            // road sample spacing, world px
const M_PER_PX = 0.17;    // world scale for the km / km-h readouts

// projection
const HORIZON_F = 0.38;   // horizon height as a fraction of the canvas
const Z_NEAR = 130;       // perspective constant
const Z_MAX = 2800;       // draw distance, world px
const LS = 2.2;           // lateral screen scale at the bumper
const CAR_AHEAD = 30;     // the car sits this far ahead of the camera

// period liveries for the traffic
const TRAFFIC_COLORS = ['#2f5a9e', '#2e6b47', '#d9a441', '#b9b4a6', '#e8e2cf'];

const canvas = document.getElementById('road');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlaySub = document.getElementById('overlay-sub');
const btnL = document.getElementById('steer-left');
const btnR = document.getElementById('steer-right');
const odoEl = document.getElementById('odo');
let needleEl = null;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

let W = 0, H = 0;
let phase = 'ready';      // ready | run | crash
let steerL = false, steerR = false;
let raf = 0, lastT = 0;
let stars = [];

// run state
let s = 0;                // camera world position, px
let speed = 0;            // px/s
let runT = 0;             // seconds since green light
let dist = 0;             // metres
let carX = 0, carVX = 0;  // world lateral position / velocity
let roadHalf = 80;
let traffic = [];         // { w: world position px, lane: -1|0|1, v: px/s, color }
let nextSpawnS = 0;

const horizonY = () => Math.round(H * HORIZON_F);

// --- Road generation ---------------------------------------------------------

let rows = [], baseIdx = 0;
let genCenter = 0, genHeading = 0, curv = 0, targetCurv = 0, curvRun = 0;

function pushRow() {
  curvRun -= ROW;
  if (curvRun <= 0) {
    curvRun = 250 + Math.random() * 850;
    targetCurv = Math.random() < 0.25 ? 0 : (Math.random() * 2 - 1) * 0.0016;
  }
  curv += (targetCurv - curv) * 0.04;
  // gentle pull toward the middle so the road never wanders too far
  const pull = (W / 2 - genCenter) * 0.000004;
  genHeading = clamp(genHeading + (curv + pull) * ROW, -0.55, 0.55);
  genCenter += genHeading * ROW;
  const minC = roadHalf * 0.75, maxC = W - roadHalf * 0.75;
  if (genCenter < minC) { genCenter = minC; genHeading = Math.max(genHeading, 0); }
  if (genCenter > maxC) { genCenter = maxC; genHeading = Math.min(genHeading, 0); }
  rows.push(genCenter);
}

function ensureRows() {
  const needed = Math.floor((s + Z_MAX + CAR_AHEAD) / ROW) + 8;
  while (baseIdx + rows.length <= needed) pushRow();
  const drop = Math.floor(s / ROW) - baseIdx - 20;
  if (drop > 400) { rows.splice(0, drop); baseIdx += drop; }
}

const centerAt = idx => rows[clamp(idx - baseIdx, 0, rows.length - 1)];

// --- Simulation ---------------------------------------------------------------

function trafficX(t) {
  return centerAt(Math.round(t.w / ROW)) + t.lane * 0.45 * roadHalf;
}

function spawnTraffic() {
  traffic.push({
    w: s + Z_MAX + 100,                      // just beyond the haze
    lane: [-1, 0, 1][Math.floor(Math.random() * 3)],
    v: speed * (0.5 + Math.random() * 0.2),  // slower — you do the passing
    color: TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)]
  });
}

function step(dt) {
  runT += dt;
  speed = 200 + Math.min(runT * 3.5, 280);   // ramps up over ~80 s
  s += speed * dt;
  dist += speed * dt * M_PER_PX;
  ensureRows();

  const dir = (steerR ? 1 : 0) - (steerL ? 1 : 0);
  carVX += dir * 1050 * dt;
  carVX *= Math.exp(-3 * dt);                // grip: lateral speed settles
  carX = clamp(carX + carVX * dt, 14, W - 14);

  const carIdx = Math.floor((s + CAR_AHEAD) / ROW);
  if (Math.abs(carX - centerAt(carIdx)) > roadHalf - 15) {
    crash('road');
    return;
  }

  // traffic: spawn, advance, cull, collide
  if (s >= nextSpawnS) {
    spawnTraffic();
    const gap = 1500 - Math.min(runT * 9, 800);
    nextSpawnS = s + gap * (0.8 + Math.random() * 0.5);
  }
  for (const t of traffic) t.w += t.v * dt;
  traffic = traffic.filter(t => t.w > s - 60);
  for (const t of traffic) {
    if (Math.abs(t.w - (s + CAR_AHEAD)) < 55 && Math.abs(carX - trafficX(t)) < 30) {
      crash('traffic');
      return;
    }
  }
}

// --- Rendering ------------------------------------------------------------------

function drawSky(hy) {
  const g = ctx.createLinearGradient(0, 0, 0, hy);
  g.addColorStop(0, '#0c0b07');
  g.addColorStop(1, '#262010');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, hy);

  ctx.fillStyle = 'rgba(232, 226, 207, 0.8)';
  for (const st of stars) ctx.fillRect(st.x, st.y, st.r, st.r);

  // the moon over the hills
  ctx.fillStyle = '#e8e2cf';
  ctx.beginPath();
  ctx.arc(W * 0.78, hy * 0.42, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d5cdb4';
  ctx.beginPath();
  ctx.arc(W * 0.78 - 4, hy * 0.42 - 3, 3.5, 0, Math.PI * 2);
  ctx.fill();
}

// rear view of a 50s racer, base size = the player's car (sc = 1)
function drawRearCar(x, y, sc, color, lean = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(lean);
  ctx.scale(sc, sc);
  // rear wheels
  ctx.fillStyle = '#181510';
  ctx.fillRect(-40, -8, 13, 26);
  ctx.fillRect(27, -8, 13, 26);
  // tail
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-30, 18);
  ctx.lineTo(-32, -2);
  ctx.quadraticCurveTo(-32, -12, -20, -14);
  ctx.lineTo(20, -14);
  ctx.quadraticCurveTo(32, -12, 32, -2);
  ctx.lineTo(30, 18);
  ctx.quadraticCurveTo(0, 23, -30, 18);
  ctx.fill();
  // tail roundel
  ctx.fillStyle = color === '#e8e2cf' ? '#c62f1e' : '#e8e2cf';
  ctx.beginPath();
  ctx.arc(0, 3, 7, 0, Math.PI * 2);
  ctx.fill();
  // driver: gold helmet, dark visor strip
  ctx.fillStyle = '#d9a441';
  ctx.beginPath();
  ctx.arc(0, -17, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#14110b';
  ctx.fillRect(-5, -19, 10, 2.5);
  ctx.restore();
}

function drawFrame() {
  const hy = horizonY();
  drawSky(hy);

  // haze band where the road melts into the distance
  ctx.fillStyle = '#181608';
  const fMin = Z_NEAR / (Z_MAX + Z_NEAR);
  const yStart = hy + Math.ceil(fMin * (H - hy));
  ctx.fillRect(0, hy, W, yStart - hy);

  // road, scanline by scanline (near scanlines at the bottom)
  for (let y = yStart; y <= H; y++) {
    const f = (y - hy) / (H - hy);           // (0, 1]
    const z = Z_NEAR / f - Z_NEAR;           // forward distance
    const worldS = s + CAR_AHEAD + z;
    const center = centerAt(Math.floor(worldS / ROW));
    const scale = f * LS;
    const xC = W / 2 + (center - carX) * scale;
    const half = roadHalf * scale;

    // grass, in alternating bands for the sense of speed
    ctx.fillStyle = (Math.floor(worldS / 90) & 1) ? '#1b190c' : '#151708';
    ctx.fillRect(0, y, W, 1);
    // tarmac
    ctx.fillStyle = '#453f32';
    ctx.fillRect(xC - half, y, half * 2, 1);
    // kerbs, alternating red / cream
    const kerbW = Math.max(1.5, 9 * scale);
    ctx.fillStyle = (Math.floor(worldS / 45) & 1) ? '#c62f1e' : '#e8e2cf';
    ctx.fillRect(xC - half - kerbW, y, kerbW, 1);
    ctx.fillRect(xC + half, y, kerbW, 1);
    // centreline dashes
    if (worldS % 70 < 35) {
      ctx.fillStyle = 'rgba(232, 226, 207, 0.6)';
      const cw = Math.max(1.5, 5 * scale);
      ctx.fillRect(xC - cw / 2, y, cw, 1);
    }
  }

  // traffic, far to near
  const sorted = [...traffic].sort((a, b) => b.w - a.w);
  for (const t of sorted) {
    const z = t.w - s - CAR_AHEAD;
    if (z < 25 || z > Z_MAX) continue;
    const f = Z_NEAR / (z + Z_NEAR);
    const y = hy + f * (H - hy);
    const x = W / 2 + (trafficX(t) - carX) * f * LS;
    drawRearCar(x, y, f, t.color);
  }

  // our car, leaning into the steering
  drawRearCar(W / 2, H - 58, 1, '#c62f1e', clamp(carVX * 0.0004, -0.18, 0.18));
}

// --- Dashboard ------------------------------------------------------------------

function buildSpeedo() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.getElementById('speedo');
  const put = (name, attrs, text) => {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (text) n.textContent = text;
    svg.appendChild(n);
    return n;
  };
  put('circle', { cx: 50, cy: 46, r: 40, fill: '#ece5cf', stroke: '#9c7c2e', 'stroke-width': 3 });
  for (let v = 0; v <= 300; v += 15) {
    const a = (-120 + (v / 300) * 240) * Math.PI / 180;
    const major = v % 60 === 0;
    const r1 = major ? 30 : 33;
    put('line', {
      x1: 50 + r1 * Math.sin(a), y1: 46 - r1 * Math.cos(a),
      x2: 50 + 36 * Math.sin(a), y2: 46 - 36 * Math.cos(a),
      stroke: '#211d14', 'stroke-width': major ? 2 : 1
    });
    if (major) {
      put('text', {
        x: 50 + 23 * Math.sin(a), y: 46 - 23 * Math.cos(a) + 2.6,
        'text-anchor': 'middle', 'font-size': 7.5,
        'font-family': 'Georgia, serif', fill: '#211d14'
      }, String(v));
    }
  }
  put('text', {
    x: 50, y: 68, 'text-anchor': 'middle', 'font-size': 6,
    'font-style': 'italic', 'font-family': 'Georgia, serif', fill: '#6e6753'
  }, 'km/h');
  needleEl = put('line', {
    x1: 50, y1: 46, x2: 50, y2: 15,
    stroke: '#c62f1e', 'stroke-width': 2.5, 'stroke-linecap': 'round'
  });
  put('circle', { cx: 50, cy: 46, r: 3.4, fill: '#9c7c2e' });
}

function updateDash() {
  const kmh = phase === 'run' ? clamp(speed * M_PER_PX * 3.6, 0, 300) : 0;
  needleEl.setAttribute('transform', `rotate(${-120 + (kmh / 300) * 240} 50 46)`);
  odoEl.textContent = (dist / 1000).toFixed(1).padStart(6, '0');
}

// --- Game flow ---------------------------------------------------------------

function reset() {
  cancelAnimationFrame(raf);
  phase = 'ready';
  s = 0; runT = 0; dist = 0;
  speed = 200;
  rows = []; baseIdx = 0;
  genCenter = W / 2; genHeading = 0;
  curv = 0; targetCurv = 0; curvRun = 600;   // opening straight
  carX = W / 2; carVX = 0;
  traffic = []; nextSpawnS = 1600;
  steerL = false; steerR = false;
  ensureRows();
  drawFrame();
  updateDash();
  const best = Number(localStorage.getItem(BEST_KEY)) || 0;
  overlayTitle.textContent = 'Mille Miglia';
  overlaySub.textContent =
    (best ? `Personal best: ${(best / 1000).toFixed(1)} km · ` : '') + 'Tap to drive';
  overlay.hidden = false;
}

function crash(reason) {
  phase = 'crash';
  cancelAnimationFrame(raf);
  const best = Number(localStorage.getItem(BEST_KEY)) || 0;
  const newBest = dist > best;
  if (newBest) localStorage.setItem(BEST_KEY, String(Math.round(dist)));
  overlayTitle.textContent = reason === 'traffic'
    ? '💥 Into a backmarker!'
    : '💥 Off the road!';
  overlaySub.textContent = `${(dist / 1000).toFixed(1)} km` +
    (newBest ? ' — ★ new personal best!' : '') + ' · Tap to drive again';
  updateDash();
  overlay.hidden = false;
}

function frame(t) {
  const dt = Math.min((t - lastT) / 1000, 0.05);
  lastT = t;
  step(dt);
  if (phase === 'run') {     // step() may have crashed us
    drawFrame();
    updateDash();
    raf = requestAnimationFrame(frame);
  }
}

function start() {
  reset();
  phase = 'run';
  overlay.hidden = true;
  lastT = performance.now();
  raf = requestAnimationFrame(frame);
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  W = Math.round(rect.width);
  H = Math.round(rect.height);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  roadHalf = clamp(W * 0.22, 64, 100);
  stars = Array.from({ length: 36 }, () => ({
    x: Math.random() * W,
    y: Math.random() * horizonY() * 0.9,
    r: Math.random() < 0.2 ? 1.4 : 0.8
  }));
  reset();
}

// --- Input --------------------------------------------------------------------

function bindSteer(btn, set) {
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    try { btn.setPointerCapture(e.pointerId); } catch { /* stale pointer */ }
    if (phase !== 'run') start();
    set(true);
  });
  ['pointerup', 'pointercancel'].forEach(ev =>
    btn.addEventListener(ev, () => set(false)));
}

bindSteer(btnL, v => { steerL = v; });
bindSteer(btnR, v => { steerR = v; });

overlay.addEventListener('pointerdown', e => {
  e.preventDefault();
  start();
});

window.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft') { steerL = true; e.preventDefault(); }
  else if (e.key === 'ArrowRight') { steerR = true; e.preventDefault(); }
  else if ((e.key === ' ' || e.key === 'Enter') && phase !== 'run') start();
});
window.addEventListener('keyup', e => {
  if (e.key === 'ArrowLeft') steerL = false;
  if (e.key === 'ArrowRight') steerR = false;
});

// orientation change / resize restarts the run cleanly
window.addEventListener('resize', resize);

initShell('more');
buildSpeedo();
resize();
