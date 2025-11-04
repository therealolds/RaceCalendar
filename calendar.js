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

  Promise.all(
    sources.map(src =>
      fetch(src.json)
        .then(res => res.json())
        .then(data => ({ src, data }))
    )
  )
    .then(results => {
      const todayRaces = [];

      results.forEach(({ src, data }) => {
        const championship = data.championship;
        data.races.forEach(race => {
          const raceDate = new Date(race.date);
          raceDate.setHours(0, 0, 0, 0);
          if (raceDate.getTime() === today.getTime()) {
            todayRaces.push({ series: src.series, championship, race });
          }
        });
      });

      todayContainer.innerHTML = "";

      if (todayRaces.length === 0) {
        todayContainer.innerHTML = "<p>No races today.</p>";
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

// === LOAD NEXT RACE (for main page) ===
function loadNextRace(calendarFile, containerId, showDetails = false) {
  const container = document.getElementById(containerId);
  container.textContent = "Loading next race...";

  fetch(calendarFile)
    .then(res => res.json())
    .then(data => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const nextRace = data.races.find(race => {
        const raceDate = new Date(race.date);
        raceDate.setHours(0, 0, 0, 0);
        return raceDate >= today;
      });

      container.textContent = "";

      if (nextRace) {
        renderRaceCard(container, data.championship, nextRace, "Next Race", showDetails);
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

      // --- Sort all races by date first ---
      const sortedRaces = [...data.races].sort((a, b) => new Date(a.date) - new Date(b.date));

      const pastRaces = [];
      const todayRaces = [];
      const futureRaces = [];

      sortedRaces.forEach(race => {
        const raceDate = new Date(race.date);
        raceDate.setHours(0, 0, 0, 0);

        if (raceDate.getTime() === today.getTime()) todayRaces.push(race);
        else if (raceDate < today) pastRaces.push(race);
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
        noToday.textContent = "No race today.";
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



// === Helper: Create an Accordion ===
function createAccordion(titleText, raceList, championship, showDetails, labelText) {
  const accordion = document.createElement("div");
  accordion.className = "accordion";

  const header = document.createElement("button");
  header.className = "accordion-header";
  header.textContent = `${titleText} ⯈`;

  const panel = document.createElement("div");
  panel.className = "accordion-panel";
  panel.style.display = "none";

  header.addEventListener("click", () => {
    const isOpen = panel.style.display === "block";
    panel.style.display = isOpen ? "none" : "block";
    header.textContent = isOpen ? `${titleText} ⯈` : `${titleText} ⯆`;
  });

  // Render races inside the accordion
  raceList.forEach(race => {
    renderRaceCard(panel, championship, race, labelText, showDetails);
  });

  accordion.appendChild(header);
  accordion.appendChild(panel);
  return accordion;
}

