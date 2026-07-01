/* Tracks page: every track referenced by any calendar, with search + filters.
   The list is derived from the calendars, so it maintains itself. */

import { loadSeriesList, fetchJSON, loadTrack } from './data.js';
import { initShell, el, escapeHtml } from './ui.js';

const KNOWN_GROUPS = ['F1', 'MotoGP', 'WRC', 'WEC'];

const state = { tracks: [], group: 'All', query: '' };

const grid = document.getElementById('track-grid');
const chipsEl = document.getElementById('track-chips');
const searchEl = document.getElementById('track-search');

function groupOf(id) {
  const suffix = String(id).split('.').pop();
  return KNOWN_GROUPS.includes(suffix) ? suffix : 'Other';
}

function trackCard(t) {
  const loc = t.location || {};
  const card = el('article', 'track-card');
  const img = t.image
    ? `<img class="track-card__img" src="${t.image}" alt="${escapeHtml(t.name)} layout" loading="lazy">`
    : '<div class="track-card__img track-card__img--empty">No image</div>';
  const stats = [
    t.length_km ? `<span><b>${t.length_km}</b> km</span>` : null,
    t.turns ? `<span><b>${t.turns}</b> turns</span>` : null,
    t.lap_record ? `<span>Record <b>${escapeHtml(t.lap_record)}</b></span>` : null
  ].filter(Boolean).join('');
  card.innerHTML = `
    ${img}
    <div class="track-card__name">${escapeHtml(t.name || 'Unnamed track')}</div>
    <div class="track-card__loc">${escapeHtml([loc.city, loc.country].filter(Boolean).join(', ')) || '&nbsp;'}</div>
    ${stats ? `<div class="track-card__stats">${stats}</div>` : ''}
  `;
  return card;
}

function matches(t) {
  if (state.group !== 'All' && t._group !== state.group) return false;
  if (!state.query) return true;
  const loc = t.location || {};
  const haystack = `${t.name || ''} ${loc.city || ''} ${loc.country || ''}`.toLowerCase();
  return haystack.includes(state.query);
}

function render() {
  grid.innerHTML = '';
  const shown = state.tracks.filter(matches);
  if (!shown.length) {
    grid.appendChild(el('div', 'empty', 'No tracks match.'));
    return;
  }
  shown.forEach(t => grid.appendChild(trackCard(t)));
}

function renderChips(groups) {
  chipsEl.innerHTML = '';
  ['All', ...groups].forEach(g => {
    const chip = el('button', 'chip' + (g === state.group ? ' is-active' : ''), escapeHtml(g));
    chip.type = 'button';
    chip.addEventListener('click', () => {
      state.group = g;
      [...chipsEl.children].forEach(c => c.classList.toggle('is-active', c === chip));
      render();
    });
    chipsEl.appendChild(chip);
  });
}

async function main() {
  initShell('more');
  try {
    const seriesList = await loadSeriesList();
    const settled = await Promise.allSettled(seriesList.map(s => fetchJSON(s.calendar)));
    const ids = new Set();
    settled
      .filter(r => r.status === 'fulfilled')
      .forEach(r => (r.value.races || []).forEach(race => {
        if (race.idtrack && String(race.idtrack).trim() !== '') ids.add(race.idtrack);
      }));

    const tracks = (await Promise.all([...ids].map(async id => {
      const t = await loadTrack(id);
      return t ? { ...t, _group: groupOf(id) } : null;
    }))).filter(Boolean);

    tracks.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    state.tracks = tracks;

    const groups = [...new Set(tracks.map(t => t._group))]
      .sort((a, b) => KNOWN_GROUPS.indexOf(a) - KNOWN_GROUPS.indexOf(b));
    renderChips(groups);
    render();
  } catch (err) {
    console.error(err);
    grid.innerHTML = '<div class="empty">Could not load tracks.</div>';
  }
}

searchEl.addEventListener('input', () => {
  state.query = searchEl.value.trim().toLowerCase();
  render();
});

main();
