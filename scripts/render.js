// === RENDER A RACE BOX ===
// showDetails: true -> used on dedicated pages (e.g. f1.html, wrc.html)
// showDetails: false -> used on main page (index.html)
function renderRaceCard(container, championship, race, labelText, showDetails = false) {
  const raceDate = new Date(race.date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const raceDay = new Date(race.date);
  raceDay.setHours(0, 0, 0, 0);

  // === Main wrapper ===
  const row = document.createElement("div");
  row.className = "race-row";

  // === LEFT: Race Info ===
  const infoDiv = document.createElement("div");
  infoDiv.className = "race-card";
  infoDiv.innerHTML = `
    <h3>${labelText}</h3>
    <p><strong>${championship}</strong></p>
    <p>${race.name}</p>
    <p>${raceDate.toLocaleDateString()}</p>
    <p><strong>Race time:</strong> ${race.time || "TBA"}</p>
  `;
  row.appendChild(infoDiv);

  if (!showDetails) {
    container.appendChild(row);
    return;
  }

  // === VIEW DETAILS button (opens modal to avoid layout shift) ===
  const button = document.createElement("button");
  button.textContent = "View Details";
  button.className = "view-details-btn";
  infoDiv.appendChild(button);

  button.addEventListener("click", () => {
    const { openModal, getModalBody } = ensureModal();
    const body = getModalBody();
    renderRaceDetails(race, body);
    openModal();
  });

  // === TRACK INFO & IMAGE (only if available) ===
  if (showDetails) {
    const trackInfoDiv = document.createElement("div");
    trackInfoDiv.className = "track-card";
    row.appendChild(trackInfoDiv);

    const trackImageDiv = document.createElement("div");
    trackImageDiv.className = "track-image-container";
    row.appendChild(trackImageDiv);

    // If circuit-based (F1, WEC, MotoGP)
    if (race.idtrack && race.idtrack.trim() !== "") {
      fetch(`../tracks/${race.idtrack}.json`)
        .then(res => res.json())
        .then(track => {
          const loc = track.location || {};
          trackInfoDiv.innerHTML = `
            <p><strong>Track:</strong> ${track.name}</p>
            <p>${loc.city ? `${loc.city}, ${loc.country}` : ""}</p>
            <p><strong>Length:</strong> ${track.length_km} km</p>
            <p><strong>Turns:</strong> ${track.turns}</p>
            <p><strong>Timezone:</strong> ${loc.timezone || "N/A"}</p>
            <p><strong>Lap Record:</strong> ${track.lap_record || "N/A"}</p>
          `;
          trackImageDiv.innerHTML = track.image
            ? `<img src="../${track.image}" alt="${track.name}" class="track-image">`
            : `<p><em>No track image available.</em></p>`;
        })
        .catch(() => {
          trackInfoDiv.innerHTML = `<p><em>Track data not found.</em></p>`;
          trackImageDiv.innerHTML = `<p><em>No track image available.</em></p>`;
        });
    } else {
      // Events without a circuit (rally,...)
      trackInfoDiv.innerHTML = `
        <p><strong>Location:</strong> Various locations</p>
        <p><em>This event is without a fixed circuit.</em></p>
      `;
      trackImageDiv.innerHTML = `<p><em>No track image available.</em></p>`;
    }
  }

  container.appendChild(row);
}

function renderRaceDetails(race, container) {
  container.innerHTML = `
    <h4>Weekend Schedule</h4>
    <ul>
      ${race.additionalInfo?.sessions
      ? race.additionalInfo.sessions
        .map(s => `<li><strong>${s.name}</strong> — ${s.date}, ${s.time}</li>`)
        .join("")
      : "<li><em>No detailed sessions available.</em></li>"
    }
    </ul>
  `;
}

// === Lightweight modal to show details without moving layout ===
function ensureModal() {
  let backdrop = document.getElementById('rc-modal');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'rc-modal';
    backdrop.className = 'rc-modal-backdrop';
    backdrop.innerHTML = `
      <div class="rc-modal" role="dialog" aria-modal="true">
        <button class="rc-modal-close" aria-label="Close">×</button>
        <div class="rc-modal-body"></div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const closeBtn = backdrop.querySelector('.rc-modal-close');
    const close = () => backdrop.classList.remove('is-open');
    closeBtn.addEventListener('click', close);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
  }
  return {
    openModal: () => backdrop.classList.add('is-open'),
    getModalBody: () => {
      const body = backdrop.querySelector('.rc-modal-body');
      body.innerHTML = '';
      return body;
    }
  };
}
