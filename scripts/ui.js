/* =============================================================
   UI SHELL + SHARED WIDGETS
   Bottom navigation, offline banner, service-worker registration
   and the small formatting/DOM helpers every page uses.
   ============================================================= */

import {
  parseEventDateTime, isFiniteDate, toLocalDay, hasExplicitTime, today
} from './data.js';

// --- DOM helper --------------------------------------------------------------

export function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// --- Date/time formatting ------------------------------------------------------

const dayShortFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const dayLongFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const dateMedFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const dayMonthFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });

export function fmtDayShort(dt) { return isFiniteDate(dt) ? dayShortFmt.format(dt) : ''; }
export function fmtDayLong(dt) { return isFiniteDate(dt) ? dayLongFmt.format(dt) : ''; }
export function fmtDateMed(dt) { return isFiniteDate(dt) ? dateMedFmt.format(dt) : ''; }
export function fmtTime(dt) { return isFiniteDate(dt) ? timeFmt.format(dt) : ''; }

// "6–8 Mar" or "28 Feb – 1 Mar"; falls back to a plain dash join.
export function fmtRange(startDt, endDt) {
  if (!isFiniteDate(startDt)) return '';
  if (!isFiniteDate(endDt) || toLocalDay(startDt).getTime() === toLocalDay(endDt).getTime()) {
    return fmtDayShort(startDt);
  }
  try {
    return dayMonthFmt.formatRange(startDt, endDt);
  } catch {
    return `${dayMonthFmt.format(startDt)} – ${dayMonthFmt.format(endDt)}`;
  }
}

// Time of a session/race, only when the data actually has one.
export function timeLabel(dateSrc, timeSrc, timeZone) {
  if (!hasExplicitTime(dateSrc, timeSrc)) return null;
  const dt = parseEventDateTime(dateSrc, timeSrc, timeZone);
  return isFiniteDate(dt) ? timeFmt.format(dt) : null;
}

export function dayDiff(fromDay, toDay) {
  return Math.round((toLocalDay(toDay) - toLocalDay(fromDay)) / 86400000);
}

// Relative label for an event range vs today: "Today", "Tomorrow",
// "In 12 days", "In progress", "Finished".
export function relLabel(startDt, endDt, ref = today()) {
  if (!isFiniteDate(startDt)) return '';
  const startDay = toLocalDay(startDt);
  const endDay = isFiniteDate(endDt) ? toLocalDay(endDt) : startDay;
  if (ref >= startDay && ref <= endDay) {
    return startDay.getTime() === endDay.getTime() ? 'Today' : 'In progress';
  }
  if (endDay < ref) return 'Finished';
  const n = dayDiff(ref, startDay);
  if (n === 1) return 'Tomorrow';
  return `In ${n} days`;
}

// --- Session list widget ---------------------------------------------------------

// <ul> of sessions with local times. maxItems trims long rally itineraries.
export function sessionListEl(sessions, timeZone, maxItems = Infinity) {
  const ul = el('ul', 'session-list');
  const shown = sessions.slice(0, maxItems);
  shown.forEach(s => {
    const t = timeLabel(s.datetime_utc || s.date, s.time, timeZone);
    const li = el('li', null,
      `<span class="session-list__name">${escapeHtml(s.name)}</span>` +
      (t ? `<span class="session-list__time">${t}</span>` : ''));
    ul.appendChild(li);
  });
  if (sessions.length > shown.length) {
    ul.appendChild(el('li', 'session-list__more', `+ ${sessions.length - shown.length} more`));
  }
  return ul;
}

// --- Theme (vintage default / modern) ----------------------------------------

// A tiny inline script in each page's <head> applies the saved theme before
// first paint; this module owns the rest (persistence, theme-color metas).
const THEME_KEY = 'rc-theme';

const THEME_COLORS = {
  vintage: { light: '#fdfcf8', dark: '#1d1c19' },
  modern: { light: '#ffffff', dark: '#101013' }
};

export function savedTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === 'modern' ? 'modern' : 'vintage';
  } catch {
    return 'vintage';
  }
}

export function applyTheme(theme, { save = false } = {}) {
  document.documentElement.dataset.theme = theme;
  const colors = THEME_COLORS[theme] || THEME_COLORS.vintage;
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
    const scheme = (meta.media || '').includes('dark') ? 'dark' : 'light';
    meta.setAttribute('content', colors[scheme]);
  });
  if (save) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch { /* storage unavailable (private mode) — theme still applies */ }
  }
}

// --- App shell -------------------------------------------------------------------

const NAV_ITEMS = [
  {
    id: 'calendars', label: 'Calendars', href: 'calendars.html',
    icon: '<rect x="3" y="4" width="18" height="17" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'
  },
  {
    id: 'home', label: 'Pit box', href: 'index.html',
    icon: '<path d="M3 21V8.5L12 3l9 5.5V21"/><path d="M6.5 21v-8.5h11V21"/><line x1="6.5" y1="15.5" x2="17.5" y2="15.5"/><line x1="6.5" y1="18.25" x2="17.5" y2="18.25"/>'
  },
  {
    id: 'more', label: 'More', href: 'more.html',
    icon: '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>'
  }
];

function svgIcon(inner) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

// Back buttons: prefer real browser history so the user returns to the page
// they actually came from (home, calendars, ...); the link's href stays as
// fallback for deep links (PWA shortcuts, direct URLs, new tabs).
function initSmartBack() {
  document.querySelectorAll('.page-head__back').forEach(link => {
    link.addEventListener('click', e => {
      let sameOrigin = false;
      try {
        sameOrigin = Boolean(document.referrer) &&
          new URL(document.referrer).origin === location.origin;
      } catch { /* malformed referrer → use fallback href */ }
      if (sameOrigin && history.length > 1) {
        e.preventDefault();
        history.back();
      }
    });
  });
}

// Injects offline banner + bottom nav and registers the service worker.
// `active` is one of 'home' | 'calendars' | 'more'.
export function initShell(active) {
  applyTheme(savedTheme());
  initSmartBack();
  const banner = el('div', 'offline-banner', "You're offline — showing cached data");
  document.body.prepend(banner);
  const updateStatus = () => banner.classList.toggle('is-visible', !navigator.onLine);
  window.addEventListener('offline', updateStatus);
  window.addEventListener('online', updateStatus);
  updateStatus();

  const nav = el('nav', 'bottom-nav');
  nav.setAttribute('aria-label', 'Main navigation');
  nav.innerHTML = NAV_ITEMS.map(item => {
    const isActive = item.id === active;
    return `<a href="${item.href}" class="bottom-nav__item${isActive ? ' is-active' : ''}"` +
      (isActive ? ' aria-current="page"' : '') + '>' +
      svgIcon(item.icon) + `<span>${item.label}</span></a>`;
  }).join('');
  document.body.appendChild(nav);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
  }
}
