/* Preferences page: theme picker (vintage / modern) + favourite competitions. */

import { loadSeriesList, favouriteIds, saveFavouriteIds } from './data.js';
import { initShell, el, escapeHtml, applyTheme, savedTheme, tagLabel } from './ui.js';

// --- Theme ---------------------------------------------------------------

function initThemeSeg() {
  const seg = document.getElementById('theme-seg');
  const buttons = [...seg.querySelectorAll('[data-theme]')];

  const setTheme = theme => {
    seg.dataset.active = String(buttons.findIndex(b => b.dataset.theme === theme));
    buttons.forEach(b => {
      const active = b.dataset.theme === theme;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-pressed', String(active));
    });
  };

  buttons.forEach(b => b.addEventListener('click', () => {
    applyTheme(b.dataset.theme, { save: true });
    setTheme(b.dataset.theme);
  }));
  setTheme(savedTheme());
}

// --- Favourites ------------------------------------------------------------

function favouriteRow(s, favourites) {
  const btn = el('button', 'menu-item fav-item');
  btn.type = 'button';
  btn.innerHTML = `
    <img class="fav-item__logo" src="${s.logo}" alt="" loading="lazy">
    <span class="menu-item__label">${escapeHtml(s.name)}</span>
    <span class="fav-item__star" aria-hidden="true"></span>
  `;
  const star = btn.querySelector('.fav-item__star');
  const sync = () => {
    const on = favourites.has(s.id);
    btn.classList.toggle('is-fav', on);
    btn.setAttribute('aria-pressed', String(on));
    star.textContent = on ? '★' : '☆';
  };
  btn.addEventListener('click', () => {
    favourites.has(s.id) ? favourites.delete(s.id) : favourites.add(s.id);
    saveFavouriteIds(favourites);
    sync();
  });
  sync();
  return btn;
}

async function initFavourites() {
  const root = document.getElementById('fav-list');
  try {
    const seriesList = await loadSeriesList();
    const favourites = favouriteIds(seriesList);

    // One card per category: motorsport first, the rest alphabetically.
    const groups = new Map();
    seriesList.forEach(s => {
      const tag = s.tag || 'other';
      if (!groups.has(tag)) groups.set(tag, []);
      groups.get(tag).push(s);
    });
    const tags = [...groups.keys()].sort((a, b) => {
      if (a === 'motorsport') return -1;
      if (b === 'motorsport') return 1;
      return tagLabel(a).localeCompare(tagLabel(b));
    });

    root.innerHTML = '';
    tags.forEach(tag => {
      root.appendChild(el('h3', 'fav-group-title', escapeHtml(tagLabel(tag))));
      const card = el('div', 'menu-list');
      card.setAttribute('role', 'group');
      card.setAttribute('aria-label', `${tagLabel(tag)} competitions`);
      groups.get(tag).forEach(s => card.appendChild(favouriteRow(s, favourites)));
      root.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    root.innerHTML = '<div class="empty">Could not load competitions. Are you offline?</div>';
  }
}

// --- Boot --------------------------------------------------------------------

initShell('more');
initThemeSeg();
initFavourites();
