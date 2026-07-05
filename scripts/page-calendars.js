/* Calendars page: all series grouped by category, with their next race. */

import { loadSeriesList, loadSeriesCalendar, nextRaceEntry } from './data.js';
import { initShell, el, escapeHtml, fmtRange, relLabel } from './ui.js';

const TAG_LABELS = {
  motorsport: 'Motorsport',
  nautical: 'Sailing & Nautical',
  cycling: 'Cycling',
  athletic: 'Athletics & Endurance',
  equestrian: 'Equestrian',
  skiing: 'Skiing'
};

const TAG_ORDER = ['motorsport', 'nautical', 'cycling', 'athletic', 'equestrian', 'skiing'];

function titleize(tag) {
  return String(tag || 'Other')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, m => m.toUpperCase());
}

function seriesTile(s) {
  const tile = el('a', 'series-tile');
  tile.href = `series.html?id=${encodeURIComponent(s.id)}`;
  tile.style.setProperty('--sa', s.accent || 'var(--accent)');
  if (s.background) {
    tile.style.backgroundImage = `url('${s.background}')`;
  } else {
    tile.classList.add('series-tile--nobg');
  }
  tile.innerHTML = `
    ${s.featured ? '<span class="series-tile__star" title="Featured">★</span>' : ''}
    <div class="series-tile__content">
      <img class="series-tile__logo" src="${s.logo}" alt="" loading="lazy">
      <div class="series-tile__name">${escapeHtml(s.name)}</div>
      <div class="series-tile__next">Loading next race…</div>
    </div>
  `;

  const nextLine = tile.querySelector('.series-tile__next');
  loadSeriesCalendar(s)
    .then(cal => {
      const next = nextRaceEntry(cal);
      if (!next) {
        nextLine.textContent = 'Season finished';
        return;
      }
      const rel = relLabel(next.range.startDt, next.range.endDt);
      const relText = (rel === 'Today' || rel === 'In progress') ? ` · ${rel}!` : ` · ${rel.toLowerCase()}`;
      nextLine.textContent =
        `Next: ${next.race.name} · ${fmtRange(next.range.startDt, next.range.endDt)}${relText}`;
    })
    .catch(() => { nextLine.textContent = 'Calendar unavailable'; });

  return tile;
}

async function main() {
  initShell('calendars');
  const root = document.getElementById('calendars-root');
  try {
    const seriesList = await loadSeriesList();
    root.innerHTML = '';

    const tags = [...new Set(seriesList.map(s => s.tag || 'other'))];
    tags.sort((a, b) => {
      const ai = TAG_ORDER.indexOf(a); const bi = TAG_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.localeCompare(b);
    });

    tags.forEach(tag => {
      const group = seriesList.filter(s => (s.tag || 'other') === tag);
      if (!group.length) return;
      root.appendChild(el('h2', 'section-title', escapeHtml(TAG_LABELS[tag] || titleize(tag))));
      const grid = el('div', 'tile-grid');
      group.forEach(s => grid.appendChild(seriesTile(s)));
      root.appendChild(grid);
    });
  } catch (err) {
    console.error(err);
    root.innerHTML = '<div class="empty">Could not load series list.</div>';
  }
}

main();
