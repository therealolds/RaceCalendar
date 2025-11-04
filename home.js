(function () {
  const tags = [...new Set(window.SERIES.map(s => s.tag))];

  function createSeriesCard(series) {
    const section = document.createElement('section');
    section.className = `section tile ${series.bgClass}`;
    section.innerHTML = `
      <div class="center-container">
        <h2>
          <a href="${series.site}" target="_blank" rel="noopener noreferrer">
            ${series.name}
          </a>
        </h2>
        <a href="${series.page}" class="logo-panel">
          <img src="${series.logo}" alt="${series.name} logo" loading="lazy">
        </a>
        <div class="next-race next-race--overlay" id="next-${series.id}">Loading next race...</div>
      </div>
    `;
    return section;
  }

  function renderHome() {
    const allSeries = window.SERIES;
    loadTodayRaces(allSeries, false);

    tags.forEach(tag => {
      const grid = document.getElementById(`grid-${tag}`);
      if (!grid) return;

      window.SERIES.filter(s => s.tag === tag).forEach(series => {
        const card = createSeriesCard(series);
        grid.appendChild(card);
        loadNextRace(series.json, `next-${series.id}`, false);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderHome);
  } else {
    renderHome();
  }
})();
