// Parse race date/time as local track time (IANA timezone) and return a UTC Date.
const rcTimeZoneCache = new Map();

function getTimeZoneOffsetMs(timeZone, date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = dtf.formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - date.getTime();
}

function parseUtcOffsetMinutes(timeZone) {
  const match = String(timeZone || '').match(/^UTC([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes);
}

function makeDateInTimeZone(y, m, d, hh, mm, timeZone) {
  const utcGuess = new Date(Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0));
  let offset = getTimeZoneOffsetMs(timeZone, utcGuess);
  let corrected = new Date(utcGuess.getTime() - offset);
  const offset2 = getTimeZoneOffsetMs(timeZone, corrected);
  if (offset2 !== offset) {
    corrected = new Date(utcGuess.getTime() - offset2);
  }
  return corrected;
}

function parseEventDateTime(dateStr, timeStr, timeZone) {
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

function getCalendarBasePath(calendarFile) {
  const match = String(calendarFile || '').match(/^(\.\.\/)+/);
  return match ? match[0] : '';
}

function extractTrackTimeZone(track) {
  const loc = (track && track.location) || {};
  return loc.timezoneIana || loc.timezone || null;
}

async function preloadTrackTimezones(data, basePath) {
  const ids = [...new Set((data.races || []).map(r => r.idtrack).filter(Boolean))];
  const timezones = new Map();
  await Promise.all(ids.map(async id => {
    if (rcTimeZoneCache.has(id)) {
      timezones.set(id, rcTimeZoneCache.get(id));
      return;
    }
    try {
      const res = await fetch(`${basePath}tracks/${id}.json`);
      const track = await res.json();
      const tz = extractTrackTimeZone(track);
      rcTimeZoneCache.set(id, tz);
      timezones.set(id, tz);
    } catch {
      rcTimeZoneCache.set(id, null);
      timezones.set(id, null);
    }
  }));
  return timezones;
}

function isFiniteDate(dt) {
  return dt instanceof Date && isFinite(dt);
}

function toLocalDay(dt) {
  const d = new Date(dt);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getSessions(race) {
  return (race.additionalInfo && race.additionalInfo.sessions) || [];
}

function isMultiDayRace(race, series) {
  return Boolean((series && series.multiDay) || race.startDate || race.starDate);
}

function getRaceRange(race, series, timeZone) {
  const multiDay = isMultiDayRace(race, series);
  const sessions = getSessions(race);
  const sessionDts = sessions
    .map(s => parseEventDateTime(s.datetime_utc || s.date, s.time, timeZone))
    .filter(isFinite);

  let startDt = null;
  let endDt = null;

  if (race.startDate || race.starDate) {
    startDt = parseEventDateTime(race.startDate || race.starDate, race.time, timeZone);
  }
  if (race.date) {
    endDt = parseEventDateTime(race.date, race.time, timeZone);
  }

  if (multiDay) {
    if (!isFiniteDate(startDt) && sessionDts.length) {
      startDt = new Date(Math.min(...sessionDts.map(d => d.getTime())));
    }
    if (!isFiniteDate(endDt) && sessionDts.length) {
      endDt = new Date(Math.max(...sessionDts.map(d => d.getTime())));
    }
  }

  if (!isFiniteDate(startDt)) {
    const dateSrc = race.datetime_utc || race.date;
    startDt = parseEventDateTime(dateSrc, race.time, timeZone);
  }
  if (!isFiniteDate(endDt)) {
    endDt = startDt;
  }

  return { startDt, endDt, multiDay };
}

function getSessionsForDay(race, targetDay, timeZone) {
  const sessions = getSessions(race);
  const target = toLocalDay(targetDay);
  return sessions.filter(s => {
    const sdt = parseEventDateTime(s.datetime_utc || s.date, s.time, timeZone);
    if (!isFinite(sdt)) return false;
    const sDay = toLocalDay(sdt);
    return sDay.getTime() === target.getTime();
  });
}

function pickDisplaySession(sessions) {
  if (!sessions.length) return null;
  return sessions.find(s => (s.time && String(s.time).trim() !== "") || String(s.datetime_utc || "").includes("T")) || sessions[0];
}

function buildDisplayInfoForDay(race, targetDay, timeZone) {
  const sessionsToday = getSessionsForDay(race, targetDay, timeZone);
  const displaySession = pickDisplaySession(sessionsToday);
  const displayDateSrc = displaySession ? (displaySession.datetime_utc || displaySession.date) : formatDateKey(targetDay);
  const displayTimeSrc = displaySession ? displaySession.time : "";
  return {
    sessionsToday,
    displayDateSrc,
    displayTimeSrc,
    displayDateTime: parseEventDateTime(displayDateSrc, displayTimeSrc, timeZone)
  };
}

// === LOAD TODAY'S RACES (for main page) ===
// Accepts either an array of series objects (preferred) or an array of JSON paths
function loadTodayRaces(items, showDetails = false) {
  const todayContainer = document.getElementById("today-races");
  todayContainer.innerHTML = "Loading...";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Normalize input to retain series metadata when available
  const sources = items.map(it =>
    typeof it === 'string'
      ? { series: null, json: it }
      : { series: it, json: it.json }
  );

  Promise.allSettled(
    sources.map(async src => {
      const data = await fetch(src.json).then(res => res.json());
      const basePath = getCalendarBasePath(src.json);
      const timezones = await preloadTrackTimezones(data, basePath);
      return { src, data, timezones };
    })
  )
    .then(settled => {
      const fulfilled = settled.filter(s => s.status === 'fulfilled').map(s => s.value);
      const rejected = settled.filter(s => s.status === 'rejected');

      if (fulfilled.length === 0) {
        todayContainer.innerHTML = "<p>Error loading today's races.</p>";
        return;
      }

      const todayRaces = [];

      fulfilled.forEach(({ src, data, timezones }) => {
        const championship = data.championship;
        (data.races || []).forEach(race => {
          const timeZone = timezones.get(race.idtrack) || null;
          const range = getRaceRange(race, src.series, timeZone);
          const startDay = toLocalDay(range.startDt);
          const endDay = toLocalDay(range.endDt);

          if (range.multiDay) {
            if (today >= startDay && today <= endDay) {
              const display = buildDisplayInfoForDay(race, today, timeZone);
              todayRaces.push({ series: src.series, championship, race, display, timeZone });
            }
            return;
          }

          const dt = parseEventDateTime(race.datetime_utc || race.date, race.time, timeZone);
          const eventDay = toLocalDay(dt);
          if (isFinite(dt) && eventDay.getTime() === today.getTime()) {
            todayRaces.push({ series: src.series, championship, race, timeZone });
          }
        });
      });

      todayContainer.innerHTML = "";

      if (todayRaces.length === 0) {
        todayContainer.innerHTML = "<p>No racing today :(</p>";
        if (rejected.length) {
          console.warn("Some calendars failed to load", rejected);
        }
        return;
      }

      // For each today race, render a tile styled like series cards
      todayRaces.forEach(({ series, championship, race, display, timeZone }) => {
        const renderOptions = display ? {
          sessionItems: display.sessionsToday,
          displayDateSrc: display.displayDateSrc,
          displayTimeSrc: display.displayTimeSrc,
          displayDateTime: display.displayDateTime,
          timeZone
        } : undefined;
        if (series) {
          const tile = document.createElement('section');
          tile.className = `section tile ${series.bgClass}`;
          tile.innerHTML = `
            <div class="center-container">
              <h2>
                <a href="${series.site}" target="_blank" rel="noopener noreferrer">
                  ${series.name}
                </a>
              </h2>
              <a href="${series.page}" class="logo-panel">
                <img src="${series.logo}" alt="${series.name} logo" loading="lazy">
              </a>
              <div class="next-race next-race--overlay"></div>
            </div>
          `;
          const nextContainer = tile.querySelector('.next-race');
          renderRaceCard(nextContainer, championship, race, "Race Today!", showDetails, renderOptions || { timeZone });
          todayContainer.appendChild(tile);
        } else {
          // Fallback: if no series metadata, render simple card
          renderRaceCard(todayContainer, championship, race, "Race Today!", showDetails, renderOptions || { timeZone });
        }
      });
    })
    .catch(err => {
      console.error("Error loading today's races:", err);
      todayContainer.innerHTML = "<p>Error loading today's races.</p>";
    });
}

// === LOAD THIS WEEK'S RACES (for main page) ===
function loadWeekRaces(items, showDetails = false) {
  const weekContainer = document.getElementById("week-races");
  if (!weekContainer) return;
  weekContainer.innerHTML = "Loading...";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(today);
  const weekdayIndex = (startOfWeek.getDay() + 6) % 7; // convert Sunday=0 to Monday=0
  startOfWeek.setDate(startOfWeek.getDate() - weekdayIndex);
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  const sources = items.map(it =>
    typeof it === 'string'
      ? { series: null, json: it }
      : { series: it, json: it.json }
  );

  const labelFormatter = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });

  Promise.allSettled(
    sources.map(async src => {
      const data = await fetch(src.json).then(res => res.json());
      const basePath = getCalendarBasePath(src.json);
      const timezones = await preloadTrackTimezones(data, basePath);
      return { src, data, timezones };
    })
  )
    .then(settled => {
      const fulfilled = settled.filter(s => s.status === 'fulfilled').map(s => s.value);
      const rejected = settled.filter(s => s.status === 'rejected');

      if (fulfilled.length === 0) {
        weekContainer.innerHTML = "<p>Error loading this week's races.</p>";
        return;
      }

      const weekRaces = [];

      fulfilled.forEach(({ src, data, timezones }) => {
        const championship = data.championship;
        (data.races || []).forEach(race => {
          const timeZone = timezones.get(race.idtrack) || null;
          const range = getRaceRange(race, src.series, timeZone);
          const startDay = toLocalDay(range.startDt);
          const endDay = toLocalDay(range.endDt);

          if (range.multiDay) {
            const overlapsWeek = !(endDay < startOfWeek || startDay > endOfWeek);
            if (!overlapsWeek) return;

            const sessions = getSessions(race);
            const sessionsInWeek = sessions.filter(s => {
              const sdt = parseEventDateTime(s.datetime_utc || s.date, s.time, timeZone);
              return isFinite(sdt) && sdt >= startOfWeek && sdt <= endOfWeek;
            });

            const clampDay = new Date(Math.max(startDay.getTime(), startOfWeek.getTime()));
            clampDay.setHours(0, 0, 0, 0);
            const displayDateSrc = sessionsInWeek.length
              ? (sessionsInWeek[0].datetime_utc || sessionsInWeek[0].date)
              : formatDateKey(clampDay);
            const displayTimeSrc = sessionsInWeek.length ? sessionsInWeek[0].time : "";
            const displayDateTime = parseEventDateTime(displayDateSrc, displayTimeSrc, timeZone);

            weekRaces.push({
              series: src.series,
              championship,
              race,
              dt: displayDateTime,
              display: {
                sessionsToday: [],
                displayDateSrc,
                displayTimeSrc,
                displayDateTime,
                timeZone,
                sessionModalSessions: sessionsInWeek,
                sessionModalLabel: "View Stages"
              }
            });
            return;
          }

          const dt = parseEventDateTime(race.datetime_utc || race.date, race.time, timeZone);
          if (!isFinite(dt)) return;
          if (dt >= startOfWeek && dt <= endOfWeek) {
            weekRaces.push({ series: src.series, championship, race, dt, timeZone });
          }
        });
      });

      weekContainer.innerHTML = "";

      if (weekRaces.length === 0) {
        weekContainer.innerHTML = "<p>No racing this week :(</p>";
        if (rejected.length) {
          console.warn("Some calendars failed to load", rejected);
        }
        return;
      }

      weekRaces.sort((a, b) => a.dt - b.dt);

      weekRaces.forEach(({ series, championship, race, dt, display, timeZone }) => {
        const label = `This Week - ${labelFormatter.format(dt)}`;
        const renderOptions = display ? {
          sessionItems: display.sessionsToday,
          displayDateSrc: display.displayDateSrc,
          displayTimeSrc: display.displayTimeSrc,
          displayDateTime: display.displayDateTime,
          timeZone: display.timeZone || timeZone,
          sessionModalSessions: display.sessionModalSessions,
          sessionModalLabel: display.sessionModalLabel
        } : undefined;
        if (series) {
          const tile = document.createElement('section');
          tile.className = `section tile ${series.bgClass}`;
          tile.innerHTML = `
            <div class="center-container">
              <h2>
                <a href="${series.site}" target="_blank" rel="noopener noreferrer">
                  ${series.name}
                </a>
              </h2>
              <a href="${series.page}" class="logo-panel">
                <img src="${series.logo}" alt="${series.name} logo" loading="lazy">
              </a>
              <div class="next-race next-race--overlay"></div>
            </div>
          `;
          const nextContainer = tile.querySelector('.next-race');
          renderRaceCard(nextContainer, championship, race, label, showDetails, renderOptions || { timeZone });
          weekContainer.appendChild(tile);
        } else {
          renderRaceCard(weekContainer, championship, race, label, showDetails, renderOptions || { timeZone });
        }
      });
    })
    .catch(err => {
      console.error("Error loading this week's races:", err);
      weekContainer.innerHTML = "<p>Error loading this week's races.</p>";
    });
}

// === LOAD NEXT RACE (for main page) ===
function loadNextRace(calendarFile, containerId, showDetails = false, seriesMeta = null) {
  const container = document.getElementById(containerId);
  container.textContent = "Loading next race...";

  fetch(calendarFile)
    .then(res => res.json())
    .then(async data => {
      const basePath = getCalendarBasePath(calendarFile);
      const timezones = await preloadTrackTimezones(data, basePath);
      const now = new Date();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const entries = (data.races || [])
        .map(r => {
          const timeZone = timezones.get(r.idtrack) || null;
          const range = getRaceRange(r, seriesMeta, timeZone);
          return { r, range, startDt: range.startDt, endDt: range.endDt, timeZone };
        })
        .filter(x => isFiniteDate(x.startDt))
        .sort((a, b) => a.startDt - b.startDt);

      // Prefer a race that is TODAY (local), even if already started
      const todayEntry = entries.find(x => {
        const startDay = toLocalDay(x.range.startDt);
        const endDay = toLocalDay(x.range.endDt);
        return today >= startDay && today <= endDay;
      });

      // Otherwise, take the next upcoming race
      const nextUpcoming = entries.find(x => x.startDt >= now);

      const chosen = todayEntry || nextUpcoming;

      container.textContent = "";

      if (chosen) {
        const label = todayEntry ? "Race Today!" : "Next Race";
        const renderOptions = todayEntry && chosen.range.multiDay
          ? buildDisplayInfoForDay(chosen.r, today, chosen.timeZone)
          : undefined;
        const options = renderOptions ? {
          sessionItems: renderOptions.sessionsToday,
          displayDateSrc: renderOptions.displayDateSrc,
          displayTimeSrc: renderOptions.displayTimeSrc,
          displayDateTime: renderOptions.displayDateTime,
          timeZone: chosen.timeZone
        } : { timeZone: chosen.timeZone };
        renderRaceCard(
          container,
          data.championship,
          chosen.r,
          label,
          showDetails,
          options
        );
      } else {
        container.textContent = "Season finished!";
      }
    })
    .catch(err => {
      console.error("Error loading next race:", err);
      container.textContent = "Error loading next race.";
    });
}

// === LOAD FULL CALENDAR (for pages like f1.html) ===
function loadFullCalendar(calendarFile, containerId, showDetails = true, options = {}) {
  const container = document.getElementById(containerId);
  container.textContent = "Loading races...";

  fetch(calendarFile)
    .then(res => res.json())
    .then(async data => {
      const basePath = getCalendarBasePath(calendarFile);
      const timezones = await preloadTrackTimezones(data, basePath);
      container.textContent = "";
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const seriesMeta = options.series || options;

      // --- Sort all races by UTC timestamp ---
      const sortedRaces = [...data.races].sort((a, b) => {
        const ar = getRaceRange(a, seriesMeta, timezones.get(a.idtrack) || null);
        const br = getRaceRange(b, seriesMeta, timezones.get(b.idtrack) || null);
        return ar.startDt - br.startDt;
      });

      const pastRaces = [];
      const todayRaces = [];
      const futureRaces = [];

      sortedRaces.forEach(race => {
        const timeZone = timezones.get(race.idtrack) || null;
        const range = getRaceRange(race, seriesMeta, timeZone);
        const startDay = toLocalDay(range.startDt);
        const endDay = toLocalDay(range.endDt);

        if (today >= startDay && today <= endDay) {
          const display = range.multiDay ? buildDisplayInfoForDay(race, today, timeZone) : null;
          todayRaces.push({ race, display, timeZone });
        } else if (endDay < today) {
          pastRaces.push({ race, timeZone });
        } else {
          futureRaces.push({ race, timeZone });
        }
      });

      // --- Accordion for past races (chronological order) ---
      if (pastRaces.length > 0) {
        const pastAccordion = createAccordion("Past Races", pastRaces, data.championship, showDetails, "Completed Race");
        container.appendChild(pastAccordion);
      }

      // --- Today's race ---
      if (todayRaces.length > 0) {
        todayRaces.forEach(({ race, display, timeZone }) => {
          const renderOptions = display ? {
            sessionItems: display.sessionsToday,
            displayDateSrc: display.displayDateSrc,
            displayTimeSrc: display.displayTimeSrc,
            displayDateTime: display.displayDateTime,
            timeZone
          } : { timeZone };
          renderRaceCard(container, data.championship, race, "Race Today!", showDetails, renderOptions);
        });
      } else {
        const noToday = document.createElement("p");
        noToday.textContent = "No racing today :(";
        noToday.style.textAlign = "center";
        container.appendChild(noToday);
      }

      // --- Accordion for future races (still chronological) ---
      if (futureRaces.length > 0) {
        const futureAccordion = createAccordion("Future Races", futureRaces, data.championship, showDetails, "Upcoming Race");
        container.appendChild(futureAccordion);
      }
    })
    .catch(err => {
      console.error("Error loading full calendar:", err);
      container.textContent = "Error loading calendar.";
    });
}

// === Helper: Create an Accordion (ASCII-safe icons) ===
function createAccordion(titleText, raceList, championship, showDetails, labelText) {
  const accordion = document.createElement("div");
  accordion.className = "accordion";

  const header = document.createElement("button");
  header.className = "accordion-header";
  header.textContent = `${titleText} v`;

  const panel = document.createElement("div");
  panel.className = "accordion-panel";
  panel.style.display = "none";

  header.addEventListener("click", () => {
    const isOpen = panel.style.display === "block";
    panel.style.display = isOpen ? "none" : "block";
    header.textContent = isOpen ? `${titleText} >` : `${titleText} v`;
  });

  raceList.forEach(item => {
    const race = item.race || item;
    const timeZone = item.timeZone || null;
    renderRaceCard(panel, championship, race, labelText, showDetails, { timeZone });
  });

  accordion.appendChild(header);
  accordion.appendChild(panel);
  return accordion;
}
