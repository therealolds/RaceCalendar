/* Series detail page (series.html?id=...): hero, next race, full season. */

import {
  getSeries, loadSeriesCalendar, loadTrack, nextRaceEntry,
  getRaceRange, getSessions, getSessionsForDay, parseEventDateTime,
  isFiniteDate, toLocalDay, dateKey, today
} from './data.js';
import {
  initShell, el, escapeHtml, sessionListEl,
  fmtDayShort, fmtRange, timeLabel, relLabel
} from './ui.js';

const root = document.getElementById('series-root');
const heroSlot = document.getElementById('hero-slot');

// --- Building blocks -------------------------------------------------------------

function heroEl(series, cal) {
  const hero = el('section', 'hero');
  hero.style.setProperty('--sa', series.accent || 'var(--accent)');
  if (series.background) {
    hero.style.backgroundImage = `url('${series.background}')`;
  } else {
    hero.classList.add('hero--nobg');
  }
  const meta = [cal.year ? `Season ${cal.year}` : null, `${cal.races.length} event${cal.races.length === 1 ? '' : 's'}`]
    .filter(Boolean).join(' · ');
  hero.innerHTML = `
    <div class="wrap hero__content">
      <img class="hero__logo" src="${series.logo}" alt="">
      <div class="hero__text">
        <h1>${escapeHtml(series.name)}</h1>
        <div class="hero__meta">${meta}</div>
      </div>
      ${series.site ? `<a class="hero__site" href="${series.site}" target="_blank" rel="noopener noreferrer">Official site ↗</a>` : ''}
    </div>
  `;
  return hero;
}

// Sessions grouped by day: <div class=schedule> with day headers.
function scheduleEl(race, timeZone) {
  const sessions = getSessions(race);
  const box = el('div', 'schedule');
  if (!sessions.length) {
    box.appendChild(el('p', 'muted', 'No detailed schedule available.'));
    return box;
  }
  const byDay = new Map();
  sessions.forEach(s => {
    const dt = parseEventDateTime(s.datetime_utc || s.date, s.time, timeZone);
    const key = isFiniteDate(dt) ? dateKey(toLocalDay(dt)) : 'tbd';
    if (!byDay.has(key)) byDay.set(key, { dt, items: [] });
    byDay.get(key).items.push(s);
  });
  [...byDay.entries()]
    .sort((a, b) => (a[1].dt?.getTime() || 0) - (b[1].dt?.getTime() || 0))
    .forEach(([key, group]) => {
      box.appendChild(el('div', 'schedule__day',
        key === 'tbd' ? 'Date TBD' : fmtDayShort(group.dt)));
      box.appendChild(sessionListEl(group.items, timeZone));
    });
  return box;
}

function trackPanelEl(track) {
  if (!track) return null;
  const loc = track.location || {};
  const stats = [
    track.length_km ? `<b>${track.length_km} km</b>` : null,
    track.turns ? `${track.turns} turns` : null,
    track.lap_record ? `Lap record: ${escapeHtml(track.lap_record)}` : null
  ].filter(Boolean).join(' · ');
  const panel = el('div', 'track-panel');
  panel.innerHTML = `
    ${track.image ? `<img class="track-panel__img" src="${track.image}" alt="${escapeHtml(track.name)} layout" loading="lazy">` : ''}
    <div class="track-panel__meta">
      <strong>${escapeHtml(track.name || 'Track')}</strong>
      <p>${escapeHtml([loc.city, loc.country].filter(Boolean).join(', '))}</p>
      ${stats ? `<p>${stats}</p>` : ''}
    </div>
  `;
  return panel;
}

function raceDateLine(race, range, timeZone) {
  const raceTime = timeLabel(race.datetime_utc || race.date, race.time, timeZone);
  const span = fmtRange(range.startDt, range.endDt);
  return raceTime ? `${span} · Race ${raceTime}` : span;
}

// --- Highlighted "next race" card ---------------------------------------------------

async function nextUpEl(cal, next) {
  const { race, range, timeZone, isToday } = next;
  const card = el('section', 'next-up');
  card.style.setProperty('--sa', cal.series.accent || 'var(--accent)');

  const label = isToday ? (range.multiDay ? 'In progress' : 'Race today!') : 'Up next';
  const rel = relLabel(range.startDt, range.endDt);
  card.innerHTML = `
    <div class="next-up__head">
      <span class="badge badge--accent">${label}</span>
      ${!isToday && rel ? `<span class="badge">${rel}</span>` : ''}
    </div>
    <div class="next-up__name">${escapeHtml(race.name)}</div>
    <div class="next-up__date">${raceDateLine(race, range, timeZone)}</div>
  `;

  if (isToday) {
    const todaySessions = getSessionsForDay(race, today(), timeZone);
    if (todaySessions.length) {
      card.appendChild(el('div', 'schedule__day', 'Today'));
      card.appendChild(sessionListEl(todaySessions, timeZone));
    }
  }

  const sessions = getSessions(race);
  if (sessions.length) {
    const fold = el('details', 'fold');
    fold.innerHTML = `<summary>Full schedule · ${sessions.length} session${sessions.length === 1 ? '' : 's'}</summary>`;
    fold.appendChild(scheduleEl(race, timeZone));
    card.appendChild(fold);
  }

  const panel = trackPanelEl(await loadTrack(race.idtrack));
  if (panel) card.appendChild(panel);

  return card;
}

// --- Expandable season rows -----------------------------------------------------------

function raceRowEl(cal, race, timeZone, { past = false, isNext = false } = {}) {
  const range = getRaceRange(race, cal.series, timeZone);
  const row = el('div', 'race-row' + (past ? ' is-past' : '') + (isNext ? ' is-next' : ''));
  row.style.setProperty('--sa', cal.series.accent || 'var(--accent)');

  const head = el('button', 'race-row__head');
  head.setAttribute('aria-expanded', 'false');
  head.innerHTML = `
    <span class="race-row__date">${fmtRange(range.startDt, range.endDt)}</span>
    <span class="race-row__name">${escapeHtml(race.name)}</span>
    <svg class="race-row__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
  `;
  row.appendChild(head);

  const body = el('div', 'race-row__body');
  body.hidden = true;
  row.appendChild(body);

  let built = false;
  head.addEventListener('click', async () => {
    const open = body.hidden;
    body.hidden = !open;
    head.setAttribute('aria-expanded', String(open));
    if (open && !built) {
      built = true;
      const raceTime = timeLabel(race.datetime_utc || race.date, race.time, timeZone);
      if (raceTime) {
        body.appendChild(el('p', 'muted', `Race at ${raceTime} (your time)`));
      }
      body.appendChild(scheduleEl(race, timeZone));
      const panel = trackPanelEl(await loadTrack(race.idtrack));
      if (panel) body.appendChild(panel);
    }
  });

  return row;
}

// --- Boot -------------------------------------------------------------------------------

async function main() {
  const id = new URLSearchParams(location.search).get('id');
  const series = id ? await getSeries(id).catch(() => null) : null;

  if (!series) {
    initShell('calendars');
    root.innerHTML = `<div class="empty"><span class="empty__emoji">🤔</span>
      Unknown series.<br><a href="calendars.html">Back to calendars</a></div>`;
    return;
  }

  initShell('calendars');
  document.title = `${series.name} — RaceCalendar`;
  document.getElementById('page-title').textContent = series.name;

  let cal;
  try {
    cal = await loadSeriesCalendar(series);
  } catch (err) {
    console.error(err);
    root.innerHTML = '<div class="empty">Could not load this calendar.</div>';
    return;
  }

  heroSlot.appendChild(heroEl(series, cal));
  root.innerHTML = '';

  // Sort races chronologically and split past / rest
  const nowDay = today();
  const entries = cal.races
    .map(race => {
      const timeZone = cal.timezones.get(race.idtrack) || null;
      return { race, timeZone, range: getRaceRange(race, series, timeZone) };
    })
    .sort((a, b) => a.range.startDt - b.range.startDt);

  const pastEntries = entries.filter(e => toLocalDay(e.range.endDt) < nowDay);
  const restEntries = entries.filter(e => !pastEntries.includes(e));

  // Highlight card
  const next = nextRaceEntry(cal);
  if (next) {
    root.appendChild(await nextUpEl(cal, next));
  } else if (entries.length) {
    root.appendChild(el('div', 'empty', '<span class="empty__emoji">🏁</span>Season finished — see you next year!'));
  } else {
    root.appendChild(el('div', 'empty', 'No events in this calendar yet.'));
  }

  // Season list
  if (entries.length) {
    const season = el('section', 'season');
    season.appendChild(el('h2', 'section-title', cal.year ? `Season ${cal.year}` : 'Season'));
    const list = el('div', 'season-list');

    if (pastEntries.length) {
      const fold = el('details', 'past-fold');
      fold.innerHTML = `<summary>Past events · ${pastEntries.length}</summary>`;
      pastEntries.forEach(e => fold.appendChild(raceRowEl(cal, e.race, e.timeZone, { past: true })));
      list.appendChild(fold);
    }

    restEntries.forEach(e => {
      const isNext = Boolean(next && e.race === next.race);
      list.appendChild(raceRowEl(cal, e.race, e.timeZone, { isNext }));
    });

    season.appendChild(list);
    root.appendChild(season);
  }

  root.appendChild(el('footer', 'page-footer', 'All times are shown in your local timezone.'));
}

main();
