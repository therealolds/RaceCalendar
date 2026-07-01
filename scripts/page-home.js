/* Home page: Today / This Week race feed + "Coming up" list. */

import {
  loadSeriesList, loadAllCalendars, nextRaceEntry, activeOnDay,
  toLocalDay, today, isFiniteDate
} from './data.js';
import {
  initShell, el, escapeHtml, sessionListEl,
  fmtDayShort, fmtRange, timeLabel, relLabel
} from './ui.js';

const state = {
  view: 'week',       // 'today' | 'week'
  featuredOnly: true,
  cals: []
};

const listEl = document.getElementById('race-list');
const upNextEl = document.getElementById('up-next');
const rangeLabelEl = document.getElementById('range-label');

// --- Collect what's happening on a given local day -----------------------------

function pool() {
  return state.featuredOnly ? state.cals.filter(c => c.series.featured) : state.cals;
}

function collectDay(day) {
  const out = [];
  for (const cal of pool()) {
    for (const race of cal.races) {
      const timeZone = cal.timezones.get(race.idtrack) || null;
      const info = activeOnDay(race, cal.series, timeZone, day);
      if (!info.active) continue;
      out.push({ cal, race, timeZone, ...info });
    }
  }
  out.sort((a, b) => a.sortKey - b.sortKey);
  return out;
}

// --- Card ----------------------------------------------------------------------

function badgeFor(entry) {
  if (entry.isRaceDay) return '<span class="badge badge--accent">Race day</span>';
  if (entry.multiDay) return '<span class="badge badge--outline">In progress</span>';
  return '<span class="badge">On track</span>';
}

function whenLine(entry) {
  const { race, timeZone, range } = entry;
  const raceTime = timeLabel(race.datetime_utc || race.date, race.time, timeZone);
  const span = fmtRange(range.startDt, range.endDt);
  return raceTime ? `${span} · Race ${raceTime}` : span;
}

function raceCard(entry, { maxSessions = Infinity } = {}) {
  const { cal, race, timeZone, sessions } = entry;
  const s = cal.series;
  const card = el('a', 'race-card');
  card.href = `series.html?id=${encodeURIComponent(s.id)}`;
  card.style.setProperty('--sa', s.accent || 'var(--accent)');
  card.innerHTML = `
    <img class="race-card__logo" src="${s.logo}" alt="" loading="lazy">
    <div class="race-card__body">
      <div class="race-card__top">
        <span class="race-card__series">${escapeHtml(s.shortName || s.name)}</span>
        ${badgeFor(entry)}
      </div>
      <div class="race-card__name">${escapeHtml(race.name)}</div>
      <div class="race-card__when">${whenLine(entry)}</div>
    </div>
  `;
  if (sessions.length) {
    card.querySelector('.race-card__body')
      .appendChild(sessionListEl(sessions, timeZone, maxSessions));
  }
  return card;
}

function emptyState(html) {
  return el('div', 'empty', html);
}

// --- Views ------------------------------------------------------------------------

function renderToday() {
  const day = today();
  rangeLabelEl.textContent = fmtDayShort(day);
  listEl.innerHTML = '';

  const entries = collectDay(day);
  if (!entries.length) {
    listEl.appendChild(emptyState('<span class="empty__emoji">😴</span>No racing today.<br>Check “This Week” or the list below.'));
    return;
  }
  const wrap = el('div', 'race-list');
  entries.forEach(e => wrap.appendChild(raceCard(e)));
  listEl.appendChild(wrap);
}

function renderWeek() {
  const now = today();
  const monday = new Date(now);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  rangeLabelEl.textContent = fmtRange(monday, sunday);

  listEl.innerHTML = '';
  let any = false;

  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    const entries = collectDay(day);
    if (!entries.length) continue;
    any = true;

    const isToday = day.getTime() === now.getTime();
    const group = el('section', 'day-group' + (day < now ? ' is-past' : ''));
    const head = el('h3', 'day-group__head',
      fmtDayShort(day) + (isToday ? ' <span class="badge badge--accent">Today</span>' : ''));
    group.appendChild(head);

    const wrap = el('div', 'race-list');
    entries.forEach(e => wrap.appendChild(raceCard(e, { maxSessions: 4 })));
    group.appendChild(wrap);
    listEl.appendChild(group);
  }

  if (!any) {
    listEl.appendChild(emptyState('<span class="empty__emoji">😴</span>No racing this week.<br>See what’s coming up below.'));
  }
}

function render() {
  state.view === 'today' ? renderToday() : renderWeek();
}

// --- Coming up (next event per series, all series) --------------------------------

function renderUpNext() {
  upNextEl.innerHTML = '';
  const rows = state.cals.map(cal => ({ cal, next: nextRaceEntry(cal) }));

  rows.sort((a, b) => {
    const at = a.next ? a.next.range.startDt.getTime() : Infinity;
    const bt = b.next ? b.next.range.startDt.getTime() : Infinity;
    return at - bt;
  });

  rows.forEach(({ cal, next }) => {
    const s = cal.series;
    const row = el('a', 'up-next');
    row.href = `series.html?id=${encodeURIComponent(s.id)}`;
    row.style.setProperty('--sa', s.accent || 'var(--accent)');

    let raceLine = 'Season finished';
    let dateLine = '';
    let rel = '';
    let live = false;
    if (next) {
      raceLine = escapeHtml(next.race.name);
      dateLine = fmtRange(next.range.startDt, next.range.endDt);
      rel = relLabel(next.range.startDt, next.range.endDt);
      live = next.isToday;
    }

    row.innerHTML = `
      <img class="up-next__logo" src="${s.logo}" alt="" loading="lazy">
      <div class="up-next__body">
        <div class="up-next__series">${escapeHtml(s.shortName || s.name)}</div>
        <div class="up-next__race">${raceLine}</div>
        ${dateLine ? `<div class="up-next__date">${dateLine}</div>` : ''}
      </div>
      ${rel ? `<span class="up-next__rel${live ? ' is-live' : ''}">${rel}</span>` : ''}
    `;
    upNextEl.appendChild(row);
  });

  if (!rows.length) {
    upNextEl.appendChild(emptyState('No calendars available.'));
  }
}

// --- Controls -----------------------------------------------------------------------

function initControls() {
  const seg = document.querySelector('.seg');
  const buttons = [...seg.querySelectorAll('[data-view]')];

  const setView = view => {
    state.view = view;
    seg.dataset.active = String(buttons.findIndex(b => b.dataset.view === view));
    buttons.forEach(b => {
      const active = b.dataset.view === view;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-pressed', String(active));
    });
    render();
  };
  buttons.forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));

  const chip = document.getElementById('featured-chip');
  chip.addEventListener('click', () => {
    state.featuredOnly = !state.featuredOnly;
    chip.classList.toggle('is-active', state.featuredOnly);
    chip.setAttribute('aria-pressed', String(state.featuredOnly));
    render();
  });
}

// --- Boot ---------------------------------------------------------------------------

async function main() {
  initShell('home');
  initControls();
  try {
    const seriesList = await loadSeriesList();
    state.cals = await loadAllCalendars(seriesList);
    render();
    renderUpNext();
  } catch (err) {
    console.error(err);
    listEl.innerHTML = '';
    listEl.appendChild(emptyState('Could not load calendars. Are you offline?'));
    upNextEl.innerHTML = '';
  }
}

main();
