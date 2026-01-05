// Parse JSON date/time as UTC and compare in local time where needed
function parseUtcDateTime(dateStr, timeStr) {
  if (!dateStr) return new Date(NaN);
  if (String(dateStr).includes('T')) {
    return new Date(dateStr);
  }
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const [hh, mm] = String(timeStr || '00:00').split(':').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0));
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

function getRaceRange(race, series) {
  const multiDay = isMultiDayRace(race, series);
  const sessions = getSessions(race);
  const sessionDts = sessions
    .map(s => parseUtcDateTime(s.datetime_utc || s.date, s.time))
    .filter(isFinite);

  let startDt = null;
  let endDt = null;

  if (race.startDate || race.starDate) {
    startDt = parseUtcDateTime(race.startDate || race.starDate, race.time);
  }
  if (race.date) {
    endDt = parseUtcDateTime(race.date, race.time);
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
    startDt = parseUtcDateTime(dateSrc, race.time);
  }
  if (!isFiniteDate(endDt)) {
    endDt = startDt;
  }

  return { startDt, endDt, multiDay };
}

function getSessionsForDay(race, targetDay) {
  const sessions = getSessions(race);
  const target = toLocalDay(targetDay);
  return sessions.filter(s => {
    const sdt = parseUtcDateTime(s.datetime_utc || s.date, s.time);
    if (!isFinite(sdt)) return false;
    const sDay = toLocalDay(sdt);
    return sDay.getTime() === target.getTime();
  });
}

function pickDisplaySession(sessions) {
  if (!sessions.length) return null;
  return sessions.find(s => (s.time && String(s.time).trim() !== "") || String(s.datetime_utc || "").includes("T")) || sessions[0];
}

function buildDisplayInfoForDay(race, targetDay) {
  const sessionsToday = getSessionsForDay(race, targetDay);
  const displaySession = pickDisplaySession(sessionsToday);
  const displayDateSrc = displaySession ? (displaySession.datetime_utc || displaySession.date) : formatDateKey(targetDay);
  const displayTimeSrc = displaySession ? displaySession.time : "";
  return {
    sessionsToday,
    displayDateSrc,
    displayTimeSrc,
    displayDateTime: parseUtcDateTime(displayDateSrc, displayTimeSrc)
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
    sources.map(src =>
      fetch(src.json)
        .then(res => res.json())
        .then(data => ({ src, data }))
    )
  )
    .then(settled => {
      const fulfilled = settled.filter(s => s.status === 'fulfilled').map(s => s.value);
      const rejected = settled.filter(s => s.status === 'rejected');

      if (fulfilled.length === 0) {
        todayContainer.innerHTML = "<p>Error loading today's races.</p>";
        return;
      }

      const todayRaces = [];

      fulfilled.forEach(({ src, data }) => {
        const championship = data.championship;
        (data.races || []).forEach(race => {
          const range = getRaceRange(race, src.series);
          const startDay = toLocalDay(range.startDt);
          const endDay = toLocalDay(range.endDt);

          if (range.multiDay) {
            if (today >= startDay && today <= endDay) {
              const display = buildDisplayInfoForDay(race, today);
              todayRaces.push({ series: src.series, championship, race, display });
            }
            return;
          }

          const dt = parseUtcDateTime(race.datetime_utc || race.date, race.time);
          const eventDay = toLocalDay(dt);
          if (isFinite(dt) && eventDay.getTime() === today.getTime()) {
            todayRaces.push({ series: src.series, championship, race });
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
      todayRaces.forEach(({ series, championship, race, display }) => {
        const renderOptions = display ? {
          sessionItems: display.sessionsToday,
          displayDateSrc: display.displayDateSrc,
          displayTimeSrc: display.displayTimeSrc,
          displayDateTime: display.displayDateTime
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
          renderRaceCard(nextContainer, championship, race, "Race Today!", showDetails, renderOptions);
          todayContainer.appendChild(tile);
        } else {
          // Fallback: if no series metadata, render simple card
          renderRaceCard(todayContainer, championship, race, "Race Today!", showDetails, renderOptions);
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
    sources.map(src =>
      fetch(src.json)
        .then(res => res.json())
        .then(data => ({ src, data }))
    )
  )
    .then(settled => {
      const fulfilled = settled.filter(s => s.status === 'fulfilled').map(s => s.value);
      const rejected = settled.filter(s => s.status === 'rejected');

      if (fulfilled.length === 0) {
        weekContainer.innerHTML = "<p>Error loading this week's races.</p>";
        return;
      }

      const weekRaces = [];

      fulfilled.forEach(({ src, data }) => {
        const championship = data.championship;
        (data.races || []).forEach(race => {
          const range = getRaceRange(race, src.series);
          const startDay = toLocalDay(range.startDt);
          const endDay = toLocalDay(range.endDt);

          if (range.multiDay) {
            const overlapsWeek = !(endDay < startOfWeek || startDay > endOfWeek);
            if (!overlapsWeek) return;

            const sessions = getSessions(race);
            const sessionsInWeek = sessions.filter(s => {
              const sdt = parseUtcDateTime(s.datetime_utc || s.date, s.time);
              return isFinite(sdt) && sdt >= startOfWeek && sdt <= endOfWeek;
            });

            const clampDay = new Date(Math.max(startDay.getTime(), startOfWeek.getTime()));
            clampDay.setHours(0, 0, 0, 0);
            const displayDateSrc = sessionsInWeek.length
              ? (sessionsInWeek[0].datetime_utc || sessionsInWeek[0].date)
              : formatDateKey(clampDay);
            const displayTimeSrc = sessionsInWeek.length ? sessionsInWeek[0].time : "";
            const displayDateTime = parseUtcDateTime(displayDateSrc, displayTimeSrc);

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
                sessionModalSessions: sessionsInWeek,
                sessionModalLabel: "View Stages"
              }
            });
            return;
          }

          const dt = parseUtcDateTime(race.datetime_utc || race.date, race.time);
          if (!isFinite(dt)) return;
          if (dt >= startOfWeek && dt <= endOfWeek) {
            weekRaces.push({ series: src.series, championship, race, dt });
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

      weekRaces.forEach(({ series, championship, race, dt, display }) => {
        const label = `This Week - ${labelFormatter.format(dt)}`;
        const renderOptions = display ? {
          sessionItems: display.sessionsToday,
          displayDateSrc: display.displayDateSrc,
          displayTimeSrc: display.displayTimeSrc,
          displayDateTime: display.displayDateTime,
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
          renderRaceCard(nextContainer, championship, race, label, showDetails, renderOptions);
          weekContainer.appendChild(tile);
        } else {
          renderRaceCard(weekContainer, championship, race, label, showDetails, renderOptions);
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
    .then(data => {
      const now = new Date();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const entries = (data.races || [])
        .map(r => {
          const range = getRaceRange(r, seriesMeta);
          return { r, range, startDt: range.startDt, endDt: range.endDt };
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
          ? buildDisplayInfoForDay(chosen.r, today)
          : undefined;
        renderRaceCard(
          container,
          data.championship,
          chosen.r,
          label,
          showDetails,
          renderOptions && {
            sessionItems: renderOptions.sessionsToday,
            displayDateSrc: renderOptions.displayDateSrc,
            displayTimeSrc: renderOptions.displayTimeSrc,
            displayDateTime: renderOptions.displayDateTime
          }
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
    .then(data => {
      container.textContent = "";
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const seriesMeta = options.series || options;

      // --- Sort all races by UTC timestamp ---
      const sortedRaces = [...data.races].sort((a, b) => {
        const ar = getRaceRange(a, seriesMeta);
        const br = getRaceRange(b, seriesMeta);
        return ar.startDt - br.startDt;
      });

      const pastRaces = [];
      const todayRaces = [];
      const futureRaces = [];

      sortedRaces.forEach(race => {
        const range = getRaceRange(race, seriesMeta);
        const startDay = toLocalDay(range.startDt);
        const endDay = toLocalDay(range.endDt);

        if (today >= startDay && today <= endDay) {
          const display = range.multiDay ? buildDisplayInfoForDay(race, today) : null;
          todayRaces.push({ race, display });
        } else if (endDay < today) {
          pastRaces.push(race);
        } else {
          futureRaces.push(race);
        }
      });

      // --- Accordion for past races (chronological order) ---
      if (pastRaces.length > 0) {
        const pastAccordion = createAccordion("Past Races", pastRaces, data.championship, showDetails, "Completed Race");
        container.appendChild(pastAccordion);
      }

      // --- Today's race ---
      if (todayRaces.length > 0) {
        todayRaces.forEach(({ race, display }) => {
          const renderOptions = display ? {
            sessionItems: display.sessionsToday,
            displayDateSrc: display.displayDateSrc,
            displayTimeSrc: display.displayTimeSrc,
            displayDateTime: display.displayDateTime
          } : undefined;
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

  raceList.forEach(race => {
    renderRaceCard(panel, championship, race, labelText, showDetails);
  });

  accordion.appendChild(header);
  accordion.appendChild(panel);
  return accordion;
}
