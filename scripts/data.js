/* =============================================================
   DATA LAYER
   Fetching + caching of series/calendars/tracks and all the
   date/timezone logic. No DOM code in here.

   Data contract (see README):
   - series.json          → list of series (id, name, calendar, ...)
   - calendars/<id>.json  → { championship, year, races: [...] }
   - tracks/<id>.json     → { id, name, location: { timezone }, ... }
   ============================================================= */

// --- Generic fetch with in-memory cache ---------------------------------

const jsonCache = new Map();

export function fetchJSON(url) {
  if (!jsonCache.has(url)) {
    jsonCache.set(url, fetch(url).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      return r.json();
    }));
  }
  return jsonCache.get(url);
}

export function loadSeriesList() {
  return fetchJSON('series.json');
}

export async function getSeries(id) {
  const list = await loadSeriesList();
  return list.find(s => s.id === id) || null;
}

// --- Tracks --------------------------------------------------------------

const trackCache = new Map();

export function loadTrack(id) {
  if (!id || String(id).trim() === '') return Promise.resolve(null);
  if (!trackCache.has(id)) {
    trackCache.set(id, fetchJSON(`tracks/${id}.json`).catch(() => null));
  }
  return trackCache.get(id);
}

export function extractTrackTimeZone(track) {
  const loc = (track && track.location) || {};
  return loc.timezoneIana || loc.timezone || null;
}

// --- Timezone-aware date parsing ------------------------------------------
// Calendar times are written in the track's local timezone; we convert them
// to real instants so the browser can display them in the user's timezone.

function getTimeZoneOffsetMs(timeZone, date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  const parts = dtf.formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second)
  );
  return asUtc - date.getTime();
}

function parseUtcOffsetMinutes(timeZone) {
  const match = String(timeZone || '').match(/^UTC([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2] || 0) * 60 + Number(match[3] || 0));
}

function makeDateInTimeZone(y, m, d, hh, mm, timeZone) {
  const utcGuess = new Date(Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0));
  const offset = getTimeZoneOffsetMs(timeZone, utcGuess);
  let corrected = new Date(utcGuess.getTime() - offset);
  const offset2 = getTimeZoneOffsetMs(timeZone, corrected);
  if (offset2 !== offset) {
    corrected = new Date(utcGuess.getTime() - offset2);
  }
  return corrected;
}

export function parseEventDateTime(dateStr, timeStr, timeZone) {
  if (!dateStr) return new Date(NaN);
  if (String(dateStr).includes('T')) {
    return new Date(dateStr);
  }
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const [hh, mm] = String(timeStr || '00:00').split(':').map(Number);
  if (timeZone) {
    const offsetMinutes = parseUtcOffsetMinutes(timeZone);
    if (offsetMinutes !== null) {
      return new Date(Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0) - offsetMinutes * 60000);
    }
    if (String(timeZone).includes('/')) {
      return makeDateInTimeZone(y, m, d, hh, mm, timeZone);
    }
  }
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0));
}

// --- Small date helpers ----------------------------------------------------

export function isFiniteDate(dt) {
  return dt instanceof Date && isFinite(dt);
}

export function toLocalDay(dt) {
  const d = new Date(dt);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function sameDay(a, b) {
  return toLocalDay(a).getTime() === toLocalDay(b).getTime();
}

export function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// --- Race helpers ----------------------------------------------------------

export function getSessions(race) {
  return (race.additionalInfo && race.additionalInfo.sessions) || [];
}

export function hasExplicitTime(dateSrc, timeSrc) {
  if (timeSrc && String(timeSrc).trim() !== '') return true;
  return String(dateSrc || '').includes('T');
}

export function raceMainDateTime(race, timeZone) {
  return parseEventDateTime(race.datetime_utc || race.date, race.time, timeZone);
}

function isMultiDayRace(race, series) {
  return Boolean((series && series.multiDay) || race.startDate);
}

// Start/end instants of an event. Multi-day events (rallies, Dakar) use
// startDate→date; otherwise the range grows to cover all listed sessions
// so that practice/qualifying days count as part of the event.
export function getRaceRange(race, series, timeZone) {
  const multiDay = isMultiDayRace(race, series);
  const sessionDts = getSessions(race)
    .map(s => parseEventDateTime(s.datetime_utc || s.date, s.time, timeZone))
    .filter(isFiniteDate);

  let startDt = null;
  let endDt = null;

  if (race.startDate) {
    startDt = parseEventDateTime(race.startDate, race.time, timeZone);
  }
  if (race.date) {
    endDt = parseEventDateTime(race.date, race.time, timeZone);
  }

  if (sessionDts.length) {
    const minS = new Date(Math.min(...sessionDts.map(d => d.getTime())));
    const maxS = new Date(Math.max(...sessionDts.map(d => d.getTime())));
    if (!isFiniteDate(startDt) || minS < startDt) startDt = minS;
    if (!isFiniteDate(endDt) || maxS > endDt) endDt = maxS;
  }

  if (!isFiniteDate(startDt)) {
    startDt = raceMainDateTime(race, timeZone);
  }
  if (!isFiniteDate(endDt)) {
    endDt = startDt;
  }

  return { startDt, endDt, multiDay };
}

export function getSessionsForDay(race, targetDay, timeZone) {
  const target = toLocalDay(targetDay);
  return getSessions(race).filter(s => {
    const sdt = parseEventDateTime(s.datetime_utc || s.date, s.time, timeZone);
    return isFiniteDate(sdt) && toLocalDay(sdt).getTime() === target.getTime();
  });
}

// Is this race "on" for a given local day? Returns what is happening.
export function activeOnDay(race, series, timeZone, day) {
  const range = getRaceRange(race, series, timeZone);
  const target = toLocalDay(day);
  const startDay = toLocalDay(range.startDt);
  const endDay = toLocalDay(range.endDt);

  const inRange = isFiniteDate(range.startDt) && target >= startDay && target <= endDay;
  const sessions = getSessionsForDay(race, target, timeZone);
  const raceDt = raceMainDateTime(race, timeZone);
  const isRaceDay = isFiniteDate(raceDt) && sameDay(raceDt, target);

  const active = inRange || isRaceDay || sessions.length > 0;

  // Sort key: earliest timed session of the day, else the race time,
  // else end of day (untimed stages sink to the bottom).
  let sortKey = target.getTime() + 24 * 3600 * 1000;
  const timed = sessions
    .map(s => parseEventDateTime(s.datetime_utc || s.date, s.time, timeZone))
    .filter(isFiniteDate);
  if (timed.length) {
    sortKey = Math.min(...timed.map(d => d.getTime()));
  } else if (isRaceDay && isFiniteDate(raceDt)) {
    sortKey = raceDt.getTime();
  }

  return { active, sessions, isRaceDay, multiDay: range.multiDay, range, sortKey };
}

// --- Calendar loading --------------------------------------------------------

// Loads a series' calendar and pre-resolves the timezone of every referenced
// track. Returns { series, championship, year, races, timezones }.
export async function loadSeriesCalendar(series) {
  const data = await fetchJSON(series.calendar);
  const ids = [...new Set((data.races || []).map(r => r.idtrack).filter(Boolean))];
  const timezones = new Map();
  await Promise.all(ids.map(async id => {
    const track = await loadTrack(id);
    timezones.set(id, extractTrackTimeZone(track));
  }));
  return {
    series,
    championship: data.championship || series.name,
    year: data.year || null,
    races: data.races || [],
    timezones
  };
}

export async function loadAllCalendars(seriesList) {
  const settled = await Promise.allSettled(seriesList.map(loadSeriesCalendar));
  settled
    .filter(s => s.status === 'rejected')
    .forEach(s => console.warn('Calendar failed to load:', s.reason));
  return settled.filter(s => s.status === 'fulfilled').map(s => s.value);
}

// --- "Next race" for a series -----------------------------------------------
// Prefers an event running today (even if already started), otherwise the
// next upcoming one. Returns { race, range, timeZone, isToday } or null.
export function nextRaceEntry(cal, now = new Date()) {
  const nowDay = toLocalDay(now);
  const entries = (cal.races || [])
    .map(r => {
      const timeZone = cal.timezones.get(r.idtrack) || null;
      const range = getRaceRange(r, cal.series, timeZone);
      return { race: r, range, timeZone };
    })
    .filter(x => isFiniteDate(x.range.startDt))
    .sort((a, b) => a.range.startDt - b.range.startDt);

  const todayEntry = entries.find(x =>
    nowDay >= toLocalDay(x.range.startDt) && nowDay <= toLocalDay(x.range.endDt));
  const upcoming = entries.find(x => x.range.startDt >= now);

  const chosen = todayEntry || upcoming;
  return chosen ? { ...chosen, isToday: Boolean(todayEntry) } : null;
}
