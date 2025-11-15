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
          const dt = parseUtcDateTime(race.datetime_utc || race.date, race.time);
          const eventDay = new Date(dt);
          eventDay.setHours(0, 0, 0, 0);
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
      todayRaces.forEach(({ series, championship, race }) => {
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
          renderRaceCard(nextContainer, championship, race, "Race Today!", showDetails);
          todayContainer.appendChild(tile);
        } else {
          // Fallback: if no series metadata, render simple card
          renderRaceCard(todayContainer, championship, race, "Race Today!", showDetails);
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
          const dt = parseUtcDateTime(race.datetime_utc || race.date, race.time);
          if (!isFinite(dt)) return;
          if (dt >= startOfWeek && dt <= endOfWeek) {
            weekRaces.push({ series: src.series, championship, race, dt });
          }
        });
      });

      weekContainer.innerHTML = "";

      if (weekRaces.length === 0) {
        weekContainer.innerHTML = "<p>No races scheduled for this week.</p>";
        if (rejected.length) {
          console.warn("Some calendars failed to load", rejected);
        }
        return;
      }

      weekRaces.sort((a, b) => a.dt - b.dt);

      weekRaces.forEach(({ series, championship, race, dt }) => {
        const label = `This Week - ${labelFormatter.format(dt)}`;
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
          renderRaceCard(nextContainer, championship, race, label, showDetails);
          weekContainer.appendChild(tile);
        } else {
          renderRaceCard(weekContainer, championship, race, label, showDetails);
        }
      });
    })
    .catch(err => {
      console.error("Error loading this week's races:", err);
      weekContainer.innerHTML = "<p>Error loading this week's races.</p>";
    });
}

// === LOAD NEXT RACE (for main page) ===
function loadNextRace(calendarFile, containerId, showDetails = false) {
  const container = document.getElementById(containerId);
  container.textContent = "Loading next race...";

  fetch(calendarFile)
    .then(res => res.json())
    .then(data => {
      const now = new Date();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const entries = (data.races || [])
        .map(r => ({ r, dt: parseUtcDateTime(r.datetime_utc || r.date, r.time) }))
        .filter(x => isFinite(x.dt))
        .sort((a, b) => a.dt - b.dt);

      // Prefer a race that is TODAY (local), even if already started
      const todayEntry = entries.find(x => {
        const d = new Date(x.dt);
        d.setHours(0, 0, 0, 0);
        return d.getTime() === today.getTime();
      });

      // Otherwise, take the next upcoming race
      const nextUpcoming = entries.find(x => x.dt >= now);

      const chosen = todayEntry || nextUpcoming;

      container.textContent = "";

      if (chosen) {
        const label = todayEntry ? "Race Today!" : "Next Race";
        renderRaceCard(container, data.championship, chosen.r, label, showDetails);
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
function loadFullCalendar(calendarFile, containerId, showDetails = true) {
  const container = document.getElementById(containerId);
  container.textContent = "Loading races...";

  fetch(calendarFile)
    .then(res => res.json())
    .then(data => {
      container.textContent = "";
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // --- Sort all races by UTC timestamp ---
      const sortedRaces = [...data.races].sort((a, b) =>
        parseUtcDateTime(a.datetime_utc || a.date, a.time) - parseUtcDateTime(b.datetime_utc || b.date, b.time)
      );

      const pastRaces = [];
      const todayRaces = [];
      const futureRaces = [];

      sortedRaces.forEach(race => {
        const dt = parseUtcDateTime(race.datetime_utc || race.date, race.time);
        const eventDay = new Date(dt);
        eventDay.setHours(0, 0, 0, 0);

        if (eventDay.getTime() === today.getTime()) todayRaces.push(race);
        else if (eventDay < today) pastRaces.push(race);
        else futureRaces.push(race);
      });

      // --- Accordion for past races (chronological order) ---
      if (pastRaces.length > 0) {
        const pastAccordion = createAccordion("Past Races", pastRaces, data.championship, showDetails, "Completed Race");
        container.appendChild(pastAccordion);
      }

      // --- Today's race ---
      if (todayRaces.length > 0) {
        todayRaces.forEach(race => {
          renderRaceCard(container, data.championship, race, "Race Today!", showDetails);
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
