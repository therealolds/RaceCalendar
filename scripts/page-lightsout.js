/* Lights Out: F1 start-lights reaction game.
   Five columns light up one per second; after a random hold (0–5 s)
   they all go out and the stopwatch runs until the player taps. */

import { initShell, el } from './ui.js';

const COLS = 5;
const ROWS = 4;
const STEP_MS = 900;                 // per-column light-up cadence
const BEST_KEY = 'rc-lightsout-best';

const stage = document.getElementById('stage');
const gantry = document.getElementById('gantry');
const clockEl = document.getElementById('clock');
const msgEl = document.getElementById('msg');
const bestEl = document.getElementById('best');

let phase = 'idle';   // idle | wait (lights sequence + hold) | go | done
let timers = [];
let raf = 0;
let t0 = 0;

// --- Gantry ----------------------------------------------------------------

const cols = Array.from({ length: COLS }, () => {
  const col = el('div', 'lights-col');
  for (let r = 0; r < ROWS; r++) col.appendChild(el('span', 'lights-lamp'));
  gantry.appendChild(col);
  return col;
});

function setLit(n) {
  cols.forEach((col, i) => col.classList.toggle('is-on', i < n));
}

function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
  cancelAnimationFrame(raf);
}

// --- Rounds ----------------------------------------------------------------

function showBest() {
  const best = Number(localStorage.getItem(BEST_KEY));
  if (best > 0) {
    bestEl.hidden = false;
    bestEl.textContent = `♛ Personal best: ${(best / 1000).toFixed(3)} s`;
  }
}

function start() {
  clearTimers();
  phase = 'wait';
  stage.classList.remove('is-go', 'is-jump');
  setLit(0);
  clockEl.textContent = '0.000';
  msgEl.textContent = 'Wait for lights out…';

  for (let i = 1; i <= COLS; i++) {
    timers.push(setTimeout(() => setLit(i), STEP_MS * i));
  }
  // all lit → hold a random 0–5 s, then lights out
  timers.push(setTimeout(() => {
    timers.push(setTimeout(go, Math.random() * 5000));
  }, STEP_MS * COLS));
}

function go() {
  phase = 'go';
  setLit(0);
  stage.classList.add('is-go');
  msgEl.textContent = 'GO!';
  t0 = performance.now();
  const tick = () => {
    clockEl.textContent = ((performance.now() - t0) / 1000).toFixed(3);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

function verdict(ms) {
  if (ms < 200) return 'Pole position reflexes!';
  if (ms < 260) return 'Podium material.';
  if (ms < 330) return 'Solid club racer.';
  if (ms < 450) return 'Sunday driver.';
  return 'Still warming the tyres…';
}

function finish() {
  const ms = performance.now() - t0;
  clearTimers();
  phase = 'done';
  clockEl.textContent = (ms / 1000).toFixed(3);

  const best = Number(localStorage.getItem(BEST_KEY)) || Infinity;
  let line = verdict(ms);
  if (ms < best) {
    localStorage.setItem(BEST_KEY, String(Math.round(ms)));
    line = '★ New personal best!';
  }
  msgEl.textContent = `${line} Tap to go again.`;
  showBest();
}

function jumpStart() {
  clearTimers();
  phase = 'done';
  stage.classList.add('is-jump');
  clockEl.textContent = '—';
  msgEl.textContent = 'Jump start! Drive-through penalty — tap to retry.';
}

// --- Input -----------------------------------------------------------------

// pointerdown (not click) so the tap registers with minimum latency
function tap() {
  if (phase === 'go') finish();
  else if (phase === 'wait') jumpStart();
  else start();
}

stage.addEventListener('pointerdown', tap);
stage.addEventListener('keydown', e => {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    tap();
  }
});

initShell('more');
showBest();
