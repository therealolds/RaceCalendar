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

// roadside dressing: spectators' clothes and farmhouse walls
const CROWD_COLORS = ['#7a4a3a', '#44548a', '#8a8060', '#57683f', '#a8683a', '#6f4a66'];
const HOUSE_WALLS = ['#d8c49a', '#c9a87a', '#e0d3ae', '#b98d6b'];

// --- Day-night cycle ----------------------------------------------------------
// An 8 km loop: midday at 0, sunset at 2, night at 4, dawn at 6, midday
// again at 8. Each look holds for its 2 km band and blends into the next
// over the last 600 m, so the shift lands right on the kilometre marks.

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mixC = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c, k = 1) => `rgb(${(c[0] * k) | 0},${(c[1] * k) | 0},${(c[2] * k) | 0})`;
const cssA = (c, k, a) => `rgba(${(c[0] * k) | 0},${(c[1] * k) | 0},${(c[2] * k) | 0},${a})`;

const SKY_KEYS = [
  { // midday: blue sky, full visibility
    skyTop: hex('#4a80c4'), skyBot: hex('#a9c9e0'), haze: hex('#9fb8c8'),
    grassA: hex('#3f6b33'), grassB: hex('#375f2c'), tarmac: hex('#6f6a5c'),
    kerbA: hex('#c62f1e'), kerbB: hex('#e8e2cf'),
    stars: 0, night: 0, view: Z_MAX
  },
  { // sunset: red tones, the light going
    skyTop: hex('#54284a'), skyBot: hex('#e06a34'), haze: hex('#c25c2c'),
    grassA: hex('#4a4522'), grassB: hex('#403a1c'), tarmac: hex('#57503f'),
    kerbA: hex('#b03a20'), kerbB: hex('#d8b98c'),
    stars: 0.12, night: 0, view: 2500
  },
  { // night: black, moon and stars, headlights only
    skyTop: hex('#0c0b07'), skyBot: hex('#262010'), haze: hex('#12100a'),
    grassA: hex('#1b190c'), grassB: hex('#151708'), tarmac: hex('#453f32'),
    kerbA: hex('#c62f1e'), kerbB: hex('#e8e2cf'),
    stars: 1, night: 1, view: 780
  },
  { // dawn: the sun creeping back up
    skyTop: hex('#2f3554'), skyBot: hex('#d4885c'), haze: hex('#b87a5a'),
    grassA: hex('#324a28'), grassB: hex('#2b4022'), tarmac: hex('#5d5648'),
    kerbA: hex('#b84a30'), kerbB: hex('#e3c8a8'),
    stars: 0.18, night: 0, view: 2500
  }
];

function palette(km) {
  const b = (km % 8) / 2;                     // band position in [0, 4)
  const i = Math.floor(b);
  const f = b - i;
  let t = f < 0.7 ? 0 : (f - 0.7) / 0.3;      // blend over the band's last 600 m
  t = t * t * (3 - 2 * t);
  const A = SKY_KEYS[i], B = SKY_KEYS[(i + 1) % 4];
  const out = {};
  for (const k in A) {
    out[k] = Array.isArray(A[k]) ? mixC(A[k], B[k], t) : A[k] + (B[k] - A[k]) * t;
  }
  return out;
}

// sun position on its arc: elevation is 1 at midday, 0 on the horizon at
// sunset (2 km) and dawn (6 km), below it through the night; azimuth runs
// east to west, so it rises on the right and sets on the left
function sunPos(km) {
  const a = Math.PI * (km % 8) / 4;
  return { el: Math.cos(a), az: Math.sin(a) };  // az: -1 at dawn, +1 at sunset
}

// how far the headlights carry at night, world px
const headlightAt = z => clamp((560 - z) / 440, 0, 1);

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
let skyDist = 0;          // metres on the day-night clock (see step)
let carX = 0, carVX = 0;  // world lateral position / velocity
let roadHalf = 80;
let traffic = [];         // { w: world position px, lane: -1|0|1, v: px/s, color }
let spills = [];          // { w, lane } — static oil patches on the tarmac
let scenery = [];         // trees, houses, crowds along the verges
let slipT = 0;            // seconds of slide left after hitting oil
let nextSpawnS = 0;
let nextSceneryS = 0;

const OIL_SHARE = 0.15;   // this share of hazard spawns is oil instead of a car

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

// lateral world position of a lane-bound hazard (car or oil spill)
function laneX(t) {
  return centerAt(Math.round(t.w / ROW)) + t.lane * 0.45 * roadHalf;
}

function spawnHazard() {
  const w = s + Z_MAX + 100;                 // just beyond the haze
  const lane = [-1, 0, 1][Math.floor(Math.random() * 3)];
  if (Math.random() < OIL_SHARE) {
    spills.push({ kind: 'oil', w, lane });
    return;
  }
  traffic.push({
    kind: 'car', w, lane,
    v: speed * (0.5 + Math.random() * 0.2),  // slower — you do the passing
    color: TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)]
  });
}

// lateral world position of a scenery item: pinned to the verge, so it
// follows the road's curves at a fixed offset past the kerb
function sceneryX(d) {
  return centerAt(Math.round(d.w / ROW)) + d.side * (roadHalf + d.off);
}

function spawnSceneryAt(w) {
  const r = Math.random();
  const d = { w, side: Math.random() < 0.5 ? -1 : 1 };
  if (r < 0.5) {
    d.kind = 'tree';
    d.round = Math.random() < 0.35;          // umbrella pine, else cypress
    d.off = 30 + Math.random() * 80;
    d.h = 0.8 + Math.random() * 0.5;
  } else if (r < 0.77) {
    d.kind = 'crowd';
    d.off = 24 + Math.random() * 18;         // packed right up to the kerb
    d.figs = Array.from({ length: 6 + Math.floor(Math.random() * 4) }, (_, i) => ({
      dx: i * 13 + Math.random() * 6 - 3,
      h: 17 + Math.random() * 6,
      color: CROWD_COLORS[Math.floor(Math.random() * CROWD_COLORS.length)],
      flag: Math.random() < 0.3,
      ph: Math.random() * Math.PI * 2
    }));
  } else {
    d.kind = 'house';
    d.off = 80 + Math.random() * 90;
    d.wall = HOUSE_WALLS[Math.floor(Math.random() * HOUSE_WALLS.length)];
    d.tower = Math.random() < 0.18;          // the village campanile
    d.flip = Math.random() < 0.5;
  }
  scenery.push(d);
}

function step(dt) {
  runT += dt;
  speed = 200 + Math.min(runT * 1.8, 280);   // gentle ramp, tops out at ~155 s
  s += speed * dt;
  dist += speed * dt * M_PER_PX;
  // the sky runs on the old, faster ramp so sunset/night/dawn still land
  // at the same moments of a run even though the car accelerates slower
  skyDist += (200 + Math.min(runT * 3.5, 280)) * dt * M_PER_PX;
  ensureRows();

  // on oil there is no steering and almost no grip — the car just slides
  const dir = slipT > 0 ? 0 : (steerR ? 1 : 0) - (steerL ? 1 : 0);
  carVX += dir * 1050 * dt;
  carVX *= Math.exp(-(slipT > 0 ? 0.4 : 3) * dt);
  slipT = Math.max(0, slipT - dt);
  carX = clamp(carX + carVX * dt, 14, W - 14);

  const carIdx = Math.floor((s + CAR_AHEAD) / ROW);
  if (Math.abs(carX - centerAt(carIdx)) > roadHalf - 15) {
    crash(slipT > 0 ? 'oil' : 'road');
    return;
  }

  // hazards: spawn, advance, cull, collide
  if (s >= nextSpawnS) {
    spawnHazard();
    const gap = 1500 - Math.min(runT * 9, 800);
    nextSpawnS = s + gap * (0.8 + Math.random() * 0.5);
  }
  if (s >= nextSceneryS) {
    spawnSceneryAt(s + Z_MAX + 120);
    nextSceneryS = s + 100 + Math.random() * 240;
  }
  for (const t of traffic) t.w += t.v * dt;
  traffic = traffic.filter(t => t.w > s - 60);
  spills = spills.filter(o => o.w > s - 60);
  scenery = scenery.filter(d => d.w > s - 80);
  for (const t of traffic) {
    if (Math.abs(t.w - (s + CAR_AHEAD)) < 32 && Math.abs(carX - laneX(t)) < 24) {
      crash('traffic');
      return;
    }
  }
  if (slipT <= 0) {
    for (const o of spills) {
      if (Math.abs(o.w - (s + CAR_AHEAD)) < 18 && Math.abs(carX - laneX(o)) < 22) {
        slipT = 1.4;
        // shoved toward the nearer verge, so the slide carries you off
        carVX = (carX >= centerAt(carIdx) ? 1 : -1) * 340;
        break;
      }
    }
  }
}

// --- Rendering ------------------------------------------------------------------

function drawSky(hy, pal, sun) {
  const { el, az } = sun;
  const g = ctx.createLinearGradient(0, 0, 0, hy);
  g.addColorStop(0, css(pal.skyTop));
  g.addColorStop(1, css(pal.skyBot));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, hy);

  if (pal.stars > 0.02) {
    ctx.fillStyle = `rgba(232, 226, 207, ${(0.8 * pal.stars).toFixed(3)})`;
    for (const st of stars) ctx.fillRect(st.x, st.y, st.r, st.r);
  }

  // the sun, arcing east to west across the sky; anything below the
  // horizon line is painted over by the road
  if (el > -0.22) {
    const low = 1 - clamp(el, 0, 1);         // 1 when sitting on the horizon
    const x = W * (0.5 - 0.34 * az);         // rises right, sets left
    const y = hy * (1 - 0.78 * el);
    const r = 13 + 9 * low;
    const c = mixC(hex('#ffedb0'), hex('#e8531f'), low);
    ctx.fillStyle = cssA(c, 1, 0.25);        // soft glow
    ctx.beginPath();
    ctx.arc(x, y, r * 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = css(c);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // the moon over the hills, night only
  if (pal.night > 0.02) {
    ctx.globalAlpha = pal.night;
    ctx.fillStyle = '#e8e2cf';
    ctx.beginPath();
    ctx.arc(W * 0.78, hy * 0.42, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d5cdb4';
    ctx.beginPath();
    ctx.arc(W * 0.78 - 4, hy * 0.42 - 3, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// roadside tree: a slim cypress, or an umbrella pine when d.round
function drawTree(d, x, y, sc) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sc * d.h, sc * d.h);
  if (d.round) {
    ctx.fillStyle = '#5a4326';
    ctx.fillRect(-2.5, -28, 5, 28);
    ctx.fillStyle = '#3d5a2b';
    ctx.beginPath();
    ctx.ellipse(0, -36, 26, 13, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#5a4326';
    ctx.fillRect(-2, -6, 4, 6);
    ctx.fillStyle = '#2b452a';
    ctx.beginPath();
    ctx.ellipse(0, -52, 10, 46, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// rural farmhouse — ochre walls, terracotta roof, sometimes a campanile
function drawHouse(d, x, y, sc, nightAmt) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sc * (d.flip ? -1 : 1), sc);
  if (d.tower) {
    ctx.fillStyle = d.wall;
    ctx.fillRect(34, -110, 24, 58);
    ctx.fillStyle = '#42341f';
    ctx.fillRect(40, -104, 12, 15);          // open bell arch
    ctx.fillStyle = '#9e4426';
    ctx.beginPath();
    ctx.moveTo(31, -110);
    ctx.lineTo(46, -124);
    ctx.lineTo(61, -110);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = d.wall;
  ctx.fillRect(-55, -52, 110, 52);
  ctx.fillStyle = '#9e4426';
  ctx.beginPath();
  ctx.moveTo(-62, -52);
  ctx.lineTo(0, -84);
  ctx.lineTo(62, -52);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#42341f';
  ctx.fillRect(-9, -24, 18, 24);             // door
  // windows: dark by day, lamplit after dusk (kept bright through the
  // night dimming — ctx.restore() puts the caller's alpha back)
  if (nightAmt > 0.35) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255, 209, 106, 0.95)';
  }
  ctx.fillRect(-40, -42, 13, 13);
  ctx.fillRect(27, -42, 13, 13);
  ctx.restore();
}

// spectators bobbing behind a low barrier, a few waving the tricolore
function drawCrowd(d, x, y, sc) {
  const w = d.figs.length * 13;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sc, sc);
  ctx.translate(-w / 2, 0);
  for (const g of d.figs) {
    const bob = Math.sin(runT * 7 + g.ph) * 2.2;
    ctx.fillStyle = g.color;
    ctx.fillRect(g.dx - 4.5, -g.h + bob, 9, g.h - 5);
    ctx.fillStyle = '#dfb28a';
    ctx.beginPath();
    ctx.arc(g.dx, -g.h - 4 + bob, 4.4, 0, Math.PI * 2);
    ctx.fill();
    if (g.flag) {
      ctx.fillStyle = '#8a7a5a';
      ctx.fillRect(g.dx + 5, -g.h - 16 + bob, 1.6, 13);
      ctx.fillStyle = '#2e6b47';
      ctx.fillRect(g.dx + 6.6, -g.h - 16 + bob, 3.4, 6.5);
      ctx.fillStyle = '#e8e2cf';
      ctx.fillRect(g.dx + 10, -g.h - 16 + bob, 3.4, 6.5);
      ctx.fillStyle = '#c62f1e';
      ctx.fillRect(g.dx + 13.4, -g.h - 16 + bob, 3.4, 6.5);
    }
  }
  // the barrier rail in front of them
  ctx.fillStyle = '#b9b4a6';
  ctx.fillRect(-6, -9, w + 12, 3);
  ctx.fillStyle = '#8a8274';
  ctx.fillRect(-6, -6, 3, 6);
  ctx.fillRect(w + 3, -6, 3, 6);
  ctx.restore();
}

// an oil spill lying flat on the tarmac, foreshortened into an ellipse
function drawSpill(x, y, sc) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sc, sc);
  ctx.fillStyle = 'rgba(14, 12, 10, 0.92)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 34, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();                            // lobes for an irregular edge
  ctx.ellipse(-18, -3, 13, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(17, 3, 12, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // petrol sheen
  ctx.fillStyle = 'rgba(110, 120, 165, 0.35)';
  ctx.beginPath();
  ctx.ellipse(-5, -2, 13, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// rear view of a 50s racer, base size = the player's car (sc = 1);
// tail is how brightly the taillights burn (0 by day, 1 at night)
function drawRearCar(x, y, sc, color, lean = 0, tail = 0) {
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
  // taillights burn at full strength even when the body has faded
  // into the dark (ctx.restore() puts the caller's alpha back)
  if (tail > 0.02) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(255, 84, 40, ${(0.9 * tail).toFixed(3)})`;
    ctx.fillRect(-26, -6, 8, 5);
    ctx.fillRect(18, -6, 8, 5);
  }
  ctx.restore();
}

function drawFrame() {
  const hy = horizonY();
  const km = skyDist / 1000;
  const pal = palette(km);
  const nightAmt = pal.night;
  drawSky(hy, pal, sunPos(km));

  // haze band where the road melts into the distance — at night the
  // shorter view distance makes this the wall of darkness ahead
  ctx.fillStyle = css(pal.haze);
  const fMin = Z_NEAR / (pal.view + Z_NEAR);
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

    // at night only the headlight pool is lit; beyond it the road fades out
    const k = nightAmt > 0.02
      ? 1 - nightAmt * (1 - (0.12 + 0.88 * headlightAt(z)))
      : 1;

    // grass, in alternating bands for the sense of speed
    ctx.fillStyle = css((Math.floor(worldS / 90) & 1) ? pal.grassA : pal.grassB, k);
    ctx.fillRect(0, y, W, 1);
    // tarmac
    ctx.fillStyle = css(pal.tarmac, k);
    ctx.fillRect(xC - half, y, half * 2, 1);
    // kerbs, alternating red / cream
    const kerbW = Math.max(1.5, 9 * scale);
    ctx.fillStyle = css((Math.floor(worldS / 45) & 1) ? pal.kerbA : pal.kerbB, k);
    ctx.fillRect(xC - half - kerbW, y, kerbW, 1);
    ctx.fillRect(xC + half, y, kerbW, 1);
    // centreline dashes
    if (worldS % 70 < 35) {
      ctx.fillStyle = cssA(pal.kerbB, k, 0.6);
      const cw = Math.max(1.5, 5 * scale);
      ctx.fillRect(xC - cw / 2, y, cw, 1);
    }
  }

  // scenery, spills and traffic in one far-to-near painter's pass, so a
  // near tree occludes a distant car; at night everything emerges from
  // the dark together, taillights and lit windows first
  const items = [...scenery, ...spills, ...traffic].sort((a, b) => b.w - a.w);
  for (const it of items) {
    const z = it.w - s - CAR_AHEAD;
    if (z < 25 || z > pal.view) continue;
    const f = Z_NEAR / (z + Z_NEAR);
    const y = hy + f * (H - hy);
    const wx = it.kind === 'car' || it.kind === 'oil' ? laneX(it) : sceneryX(it);
    const x = W / 2 + (wx - carX) * f * LS;
    if (nightAmt > 0.02) {
      ctx.globalAlpha = 1 - nightAmt * (1 - (0.16 + 0.84 * headlightAt(z)));
    }
    if (it.kind === 'car') drawRearCar(x, y, f, it.color, 0, nightAmt);
    else if (it.kind === 'oil') drawSpill(x, y, f);
    else if (it.kind === 'tree') drawTree(it, x, y, f);
    else if (it.kind === 'house') drawHouse(it, x, y, f, nightAmt);
    else drawCrowd(it, x, y, f);
    ctx.globalAlpha = 1;
  }

  // our car: fishtailing wildly on oil, otherwise leaning into the steering
  const lean = slipT > 0
    ? Math.sin(slipT * 18) * 0.35
    : clamp(carVX * 0.0004, -0.18, 0.18);
  drawRearCar(W / 2, H - 58, 1, '#c62f1e', lean, nightAmt);
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
  s = 0; runT = 0; dist = 0; skyDist = 0;
  speed = 200;
  rows = []; baseIdx = 0;
  genCenter = W / 2; genHeading = 0;
  curv = 0; targetCurv = 0; curvRun = 600;   // opening straight
  carX = W / 2; carVX = 0;
  traffic = []; spills = []; slipT = 0;
  nextSpawnS = 1600;
  steerL = false; steerR = false;
  ensureRows();
  // dress the opening stretch so the start line isn't an empty plain
  scenery = []; nextSceneryS = 0;
  for (let w = 400; w < Z_MAX + 100; w += 100 + Math.random() * 240) {
    spawnSceneryAt(w);
  }
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
    : reason === 'oil'
      ? '💥 Slipped on the oil!'
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
  // iOS: holding the button counts as a long press otherwise
  btn.addEventListener('contextmenu', e => e.preventDefault());
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
