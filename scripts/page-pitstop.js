/* Pit Stop: wheel-change time attack.
   A wheel sits at a random spot in the dark garage. Drag the alignment
   ring over it and fire the correct gun: unwind the old wheel, then wind
   the fresh one on as it rolls in. Four tyres against the stopwatch.
   Firing off-centre or grabbing the wrong gun ruins the stop. Amateur
   and pro modes set how much centre error the gun forgives. */

import { initShell } from './ui.js';

const MODE_KEY = 'rc-pitstop-mode';
const TYRES = 4;
const ROLL_V = 950;       // wheel roll-in / roll-out speed, px/s

// gun tolerance as a share of the wheel radius, per difficulty;
// best times are kept per mode — they aren't comparable
const MODES = { amateur: 0.15, pro: 0.05 };

const canvas = document.getElementById('pit');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlaySub = document.getElementById('overlay-sub');
const clockEl = document.getElementById('pit-clock');
const statusEl = document.getElementById('pit-status');
const gunUnwind = document.getElementById('gun-unwind');
const gunWind = document.getElementById('gun-wind');
const modeSeg = document.getElementById('pit-mode');
const modeBtns = [...modeSeg.querySelectorAll('.seg__btn')];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

let W = 0, H = 0;
let R = 70;               // wheel radius, set from the canvas size
let mode = localStorage.getItem(MODE_KEY) === 'pro' ? 'pro' : 'amateur';
let TOL = 10;             // allowed centre error when the gun fires — R * MODES[mode]
let phase = 'ready';      // ready | run | crash | done
let raf = 0, lastT = 0, t0 = 0;
let tyre = 1;
let action = 'unwind';    // what the gun does next: unwind | wind
let wheel = null;         // { x, y, ang, mode: seated|in|out, targetX }
let outline = { x: 0, y: 0 };
let drag = null;          // pointer id + grab offset while dragging the ring
let flashT = 0, flashX = 0, flashY = 0;  // green ring after a clean hit

// --- Wheel placement -----------------------------------------------------------

// a random spot clear of the edges and not already under the ring —
// no free hits
function randomSpot() {
  const m = R + 16;
  for (let i = 0; i < 20; i++) {
    const x = m + Math.random() * (W - 2 * m);
    const y = m + Math.random() * (H - 2 * m);
    if (dist(x, y, outline.x, outline.y) > R * 1.6) return { x, y };
  }
  return { x: W / 2, y: H / 2 };
}

// the next corner's old wheel — already on the car, so it just appears
function seatWheel() {
  const p = randomSpot();
  wheel = { x: p.x, y: p.y, ang: Math.random() * 6, mode: 'seated', targetX: p.x };
}

// the fresh wheel rolls in from the pit wall on the right
function rollInWheel() {
  const p = randomSpot();
  wheel = { x: W + R + 10, y: p.y, ang: 0, mode: 'in', targetX: p.x };
}

// --- Simulation ------------------------------------------------------------------

function step(dt) {
  if (wheel.mode === 'in') {
    wheel.x -= ROLL_V * dt;
    wheel.ang -= ROLL_V * dt / R;         // rolling, not sliding
    if (wheel.x <= wheel.targetX) { wheel.x = wheel.targetX; wheel.mode = 'seated'; }
  } else if (wheel.mode === 'out') {
    wheel.x -= ROLL_V * 1.2 * dt;
    wheel.ang -= ROLL_V * 1.2 * dt / R;
    if (wheel.x < -R - 24) rollInWheel(); // old one gone, fresh one arrives
  }
  flashT = Math.max(0, flashT - dt);
}

// --- Rendering -------------------------------------------------------------------

// vintage wire wheel: dark tyre, bright rim ring, spokes, gold knock-off hub
function drawWheel(w) {
  const { x, y, ang } = w;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(x, y + R * 0.94, R * 0.78, R * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fillStyle = '#262119';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#0c0a07';
  ctx.stroke();
  ctx.beginPath();                        // sidewall ring
  ctx.arc(x, y, R * 0.8, 0, Math.PI * 2);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(232, 226, 207, 0.16)';
  ctx.stroke();
  ctx.beginPath();                        // rim recess
  ctx.arc(x, y, R * 0.6, 0, Math.PI * 2);
  ctx.fillStyle = '#17140e';
  ctx.fill();
  ctx.strokeStyle = '#b9b4a6';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = '#8a8274';            // wire spokes
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = ang + i * Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * R * 0.16, y + Math.sin(a) * R * 0.16);
    ctx.lineTo(x + Math.cos(a) * R * 0.56, y + Math.sin(a) * R * 0.56);
    ctx.stroke();
  }
  ctx.beginPath();                        // knock-off hub
  ctx.arc(x, y, R * 0.15, 0, Math.PI * 2);
  ctx.fillStyle = '#9c7c2e';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, R * 0.06, 0, Math.PI * 2);
  ctx.fillStyle = '#14110b';
  ctx.fill();
}

// the alignment ring: two bare circles, wheel-sized — red once it all went wrong
function drawOutline() {
  ctx.strokeStyle = phase === 'crash' ? '#e03a24' : '#f2ead2';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(outline.x, outline.y, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(outline.x, outline.y, R * 0.21, 0, Math.PI * 2);
  ctx.stroke();
}

function draw() {
  ctx.fillStyle = '#17130d';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(232, 226, 207, 0.09)';  // painted pit-bay marking
  ctx.lineWidth = 2;
  ctx.strokeRect(9, 9, W - 18, H - 18);
  if (wheel && wheel.x > -R - 20 && wheel.x < W + R + 20) drawWheel(wheel);
  if (flashT > 0) {
    ctx.strokeStyle = `rgba(88, 179, 104, ${(flashT / 0.3).toFixed(3)})`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(flashX, flashY, R * 1.06, 0, Math.PI * 2);
    ctx.stroke();
  }
  drawOutline();
}

function hud() {
  statusEl.textContent = `Tyre ${tyre}/${TYRES} — ${action === 'unwind' ? 'old wheel off' : 'new wheel on'}`;
}

function setGunsDisabled(v) {
  gunUnwind.disabled = v;
  gunWind.disabled = v;
}

// --- Game flow -------------------------------------------------------------------

const bestKey = () => `rc-pitstop-best-${mode}`;

function fire(pressed) {
  if (phase !== 'run' || wheel.mode !== 'seated') return;
  if (pressed !== action) {
    fail('wrong');
    return;
  }
  if (dist(wheel.x, wheel.y, outline.x, outline.y) > TOL) {
    fail('miss');
    return;
  }
  flashT = 0.3; flashX = wheel.x; flashY = wheel.y;
  if (action === 'unwind') {
    action = 'wind';
    wheel.mode = 'out';
  } else if (tyre >= TYRES) {
    finish();
  } else {
    tyre += 1;
    action = 'unwind';
    seatWheel();
  }
  hud();
}

function fail(kind) {
  phase = 'crash';
  cancelAnimationFrame(raf);
  draw();                                 // the ring turns red where it missed
  setGunsDisabled(false);
  const secs = ((performance.now() - t0) / 1000).toFixed(2);
  overlayTitle.textContent = kind === 'wrong' ? '💥 Wrong gun!' : '💥 Cross-threaded!';
  overlaySub.textContent = (kind === 'wrong'
    ? (action === 'unwind'
      ? 'You wound down on a wheel that had to come off'
      : 'You unwound the fresh wheel straight back off')
    : `The gun slipped off tyre ${tyre}`) +
    ` — ${secs} s in · Tap to try again`;
  overlay.hidden = false;
}

function verdict(ms) {
  if (ms < 14000) return 'Scuderia-grade crew!';
  if (ms < 20000) return 'Sharp work.';
  if (ms < 28000) return 'Tidy, but the leader is past.';
  return 'The crew finished the espresso first…';
}

function finish() {
  const ms = performance.now() - t0;
  phase = 'done';
  cancelAnimationFrame(raf);
  clockEl.textContent = (ms / 1000).toFixed(2);
  setGunsDisabled(false);
  const best = Number(localStorage.getItem(bestKey())) || Infinity;
  const newBest = ms < best;
  if (newBest) localStorage.setItem(bestKey(), String(Math.round(ms)));
  overlayTitle.textContent = '🏁 Wheels on — send it!';
  overlaySub.textContent = `${(ms / 1000).toFixed(2)} s · ` +
    (newBest ? '★ New personal best!' : verdict(ms)) + ' · Tap for another stop';
  overlay.hidden = false;
}

function reset() {
  cancelAnimationFrame(raf);
  phase = 'ready';
  tyre = 1;
  action = 'unwind';
  outline = { x: W / 2, y: H - R - 26 };
  flashT = 0;
  drag = null;
  seatWheel();
  draw();
  hud();
  clockEl.textContent = '0.00';
  setGunsDisabled(false);
  const best = Number(localStorage.getItem(bestKey())) || 0;
  overlayTitle.textContent = 'Pit Stop';
  overlaySub.textContent = `${mode === 'pro' ? 'Pro' : 'Amateur'} crew · ` +
    (best ? `Personal best: ${(best / 1000).toFixed(2)} s · ` : '') + 'Tap to start the clock';
  overlay.hidden = false;
}

function frame(t) {
  const dt = Math.min((t - lastT) / 1000, 0.05);
  lastT = t;
  step(dt);
  draw();
  clockEl.textContent = ((t - t0) / 1000).toFixed(2);
  setGunsDisabled(wheel.mode !== 'seated');   // no firing at a rolling wheel
  if (phase === 'run') raf = requestAnimationFrame(frame);
}

function start() {
  reset();
  phase = 'run';
  overlay.hidden = true;
  t0 = lastT = performance.now();
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
  R = clamp(Math.min(W, H) * 0.17, 48, 78);
  TOL = R * MODES[mode];
  reset();
}

function setMode(m) {
  mode = m;
  localStorage.setItem(MODE_KEY, m);
  TOL = R * MODES[mode];
  modeSeg.dataset.active = m === 'pro' ? '1' : '0';
  modeBtns.forEach(b => {
    const on = b.dataset.mode === m;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  reset();   // switching difficulty mid-run voids the stop
}

// --- Input -----------------------------------------------------------------------

// grab the ring (a generous grab zone) and drag it; pointer capture keeps
// the drag alive when the finger strays off the canvas
canvas.addEventListener('pointerdown', e => {
  if (phase !== 'run') return;
  e.preventDefault();
  if (dist(e.offsetX, e.offsetY, outline.x, outline.y) <= R * 1.5) {
    drag = { id: e.pointerId, dx: outline.x - e.offsetX, dy: outline.y - e.offsetY };
    try { canvas.setPointerCapture(e.pointerId); } catch { /* stale pointer */ }
  }
});
canvas.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  outline.x = clamp(e.offsetX + drag.dx, 12, W - 12);
  outline.y = clamp(e.offsetY + drag.dy, 12, H - 12);
});
['pointerup', 'pointercancel'].forEach(ev =>
  canvas.addEventListener(ev, () => { drag = null; }));
canvas.addEventListener('contextmenu', e => e.preventDefault());

// two guns — pressing the right one for the moment is part of the job
function bindGun(btn, does) {
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (phase !== 'run') start();
    else fire(does);
  });
  btn.addEventListener('contextmenu', e => e.preventDefault());
}
bindGun(gunUnwind, 'unwind');
bindGun(gunWind, 'wind');

modeBtns.forEach(b => b.addEventListener('click', () => {
  if (b.dataset.mode !== mode) setMode(b.dataset.mode);
}));

overlay.addEventListener('pointerdown', e => {
  e.preventDefault();
  start();
});

// keyboard: arrows nudge the ring (shift for fine moves), Z unwinds,
// X winds, space/enter starts
window.addEventListener('keydown', e => {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    if (phase !== 'run') start();
    return;
  }
  if (phase === 'run' && (e.key === 'z' || e.key === 'Z')) { fire('unwind'); return; }
  if (phase === 'run' && (e.key === 'x' || e.key === 'X')) { fire('wind'); return; }
  if (phase !== 'run' || !e.key.startsWith('Arrow')) return;
  e.preventDefault();
  const px = e.shiftKey ? 2 : 8;
  if (e.key === 'ArrowLeft') outline.x -= px;
  else if (e.key === 'ArrowRight') outline.x += px;
  else if (e.key === 'ArrowUp') outline.y -= px;
  else if (e.key === 'ArrowDown') outline.y += px;
  outline.x = clamp(outline.x, 12, W - 12);
  outline.y = clamp(outline.y, 12, H - 12);
});

// orientation change / resize restarts the stop cleanly
window.addEventListener('resize', resize);

initShell('more');
resize();
setMode(mode);   // paints the saved difficulty onto the toggle
