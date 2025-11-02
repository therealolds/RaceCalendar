(function () {
  const tags = [...new Set(window.SERIES.map(s => s.tag))];

  function createSeriesCard(series, key = null) {
    const nextId = `next-${key || series.id}`;
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
        <div class="next-race next-race--overlay" id="${nextId}">Loading next race...</div>
      </div>
    `;
    return { section, nextId };
  }

  function renderHome() {
    const allSeries = window.SERIES;
    loadTodayRaces(allSeries, false);

    // Render Featured section (if any)
    const featuredSection = document.getElementById('section-featured');
    const featuredGrid = document.getElementById('grid-featured');
    if (featuredGrid) {
      const featured = allSeries.filter(s => s.featured);
      if (featured.length === 0) {
        if (featuredSection) featuredSection.style.display = 'none';
      } else {
        featured.forEach(series => {
          const { section, nextId } = createSeriesCard(series, `featured-${series.id}`);
          featuredGrid.appendChild(section);
          loadNextRace(series.json, nextId, false);
        });
      }
    }

    // Render tag groups
    tags.forEach(tag => {
      const grid = document.getElementById(`grid-${tag}`);
      if (!grid) return;

      window.SERIES.filter(s => s.tag === tag).forEach(series => {
        const { section, nextId } = createSeriesCard(series);
        grid.appendChild(section);
        loadNextRace(series.json, nextId, false);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderHome);
  } else {
    renderHome();
  }
})();
