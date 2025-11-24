(function () {
  // Work only with visible series
  const VISIBLE = window.SERIES.filter(s => !s.hide);
  const tags = [...new Set(VISIBLE.map(s => s.tag))];

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
    const allSeries = VISIBLE;
    const featuredSeries = allSeries.filter(s => s.featured);
    const applyFilter = (filter) => {
      const selected = filter === 'all' ? allSeries : featuredSeries;
      loadTodayRaces(selected, false);
      loadWeekRaces(selected, false);
    };

    initRacingViewToggle();
    const hasFilterToggle = initFeaturedFilter(applyFilter);
    if (!hasFilterToggle) {
      applyFilter('featured');
    }

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

      allSeries.filter(s => s.tag === tag).forEach(series => {
        const { section, nextId } = createSeriesCard(series);
        grid.appendChild(section);
        loadNextRace(series.json, nextId, false);
      });
    });
  }

  function initFeaturedFilter(onChange) {
    const filterButtons = document.querySelectorAll('.filter-toggle__btn');
    if (filterButtons.length === 0) return false;

    const setFilter = (filter) => {
      const mode = filter === 'all' ? 'all' : 'featured';
      filterButtons.forEach(btn => {
        const isActive = btn.dataset.filter === mode;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-pressed', String(isActive));
      });
      onChange(mode);
    };

    filterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        setFilter(btn.dataset.filter || 'featured');
      });
    });

    setFilter('featured');
    return true;
  }

  function initRacingViewToggle() {
    const viewToggle = document.querySelector('.view-toggle');
    if (!viewToggle) return;
    const toggleButtons = viewToggle.querySelectorAll('[data-view]');
    if (toggleButtons.length === 0) return;

    const todayContainer = document.getElementById('today-races');
    const weekContainer = document.getElementById('week-races');
    const title = document.getElementById('racing-view-title');

    const titles = {
      today: 'Racing Today',
      week: 'Racing This Week'
    };

    const setView = (view) => {
      const isWeek = view === 'week';
      if (todayContainer) {
        todayContainer.hidden = isWeek;
        todayContainer.setAttribute('aria-hidden', String(isWeek));
      }
      if (weekContainer) {
        weekContainer.hidden = !isWeek;
        weekContainer.setAttribute('aria-hidden', String(!isWeek));
      }
      toggleButtons.forEach(btn => {
        const active = btn.dataset.view === view;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', String(active));
      });
      if (title && titles[view]) {
        title.textContent = titles[view];
      }
    };

    toggleButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view || 'today';
        setView(view);
      });
    });

    const defaultActive = [...toggleButtons].find(btn => btn.classList.contains('is-active') || btn.getAttribute('aria-pressed') === 'true');
    setView((defaultActive && defaultActive.dataset.view) || 'today');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderHome);
  } else {
    renderHome();
  }
})();
