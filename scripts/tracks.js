const TRACKS_LIST_PATH = "../tracks/tracks.json";

function formatValue(value, suffix) {
  if (value === null || value === undefined || value === "") return "N/A";
  return suffix ? `${value} ${suffix}` : String(value);
}

async function loadTracks() {
  const grid = document.getElementById("tracks-grid");
  if (!grid) return;
  grid.textContent = "Loading tracks...";

  try {
    const listRes = await fetch(TRACKS_LIST_PATH);
    if (!listRes.ok) throw new Error("Track list not found");
    const trackFiles = await listRes.json();

    const results = await Promise.all(trackFiles.map(async (path) => {
      try {
        const res = await fetch(`../${path}`);
        if (!res.ok) throw new Error("Track not found");
        return await res.json();
      } catch {
        return null;
      }
    }));

    const tracks = results.filter(Boolean);
    tracks.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

    grid.textContent = "";

    if (!tracks.length) {
      grid.textContent = "No tracks available.";
      return;
    }

    tracks.forEach((track) => {
      const loc = track.location || {};
      const card = document.createElement("article");
      card.className = "track-tile";

      const imageHtml = track.image
        ? `<img src="../${track.image}" alt="${track.name}" class="track-tile__image" loading="lazy">`
        : `<div class="track-tile__image track-tile__image--empty">No track image</div>`;

      card.innerHTML = `
        ${imageHtml}
        <div class="track-tile__meta">
          <h3>${track.name || "Unnamed track"}</h3>
          <p>${loc.city ? `${loc.city}, ${loc.country || ""}` : (loc.country || "")}</p>
          <p><strong>Length:</strong> ${formatValue(track.length_km, "km")}</p>
          <p><strong>Turns:</strong> ${formatValue(track.turns)}</p>
          <p><strong>Timezone:</strong> ${formatValue(loc.timezone || loc.timezoneIana)}</p>
          <p><strong>Lap Record:</strong> ${formatValue(track.lap_record)}</p>
        </div>
      `;

      grid.appendChild(card);
    });
  } catch (err) {
    console.error("Error loading tracks:", err);
    grid.textContent = "Error loading tracks.";
  }
}

document.addEventListener("DOMContentLoaded", loadTracks);
