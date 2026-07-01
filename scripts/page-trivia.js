/* Trivia page: questions grouped by tag, answers expand inline. */

import { fetchJSON } from './data.js';
import { initShell, el, escapeHtml } from './ui.js';

const TAG_LABELS = {
  motorsport: 'Motorsport',
  nautical: 'Sailing & Nautical'
};

const TAG_ORDER = ['motorsport', 'nautical'];

function titleize(tag) {
  return String(tag || 'Other')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, m => m.toUpperCase());
}

function triviaItem(item) {
  const details = el('details', 'trivia-item');
  details.innerHTML = `
    <summary>${escapeHtml(item.question || 'Untitled question')}</summary>
    <p class="trivia-item__answer">${escapeHtml(item.answer || 'No answer provided.')}</p>
  `;
  return details;
}

async function main() {
  initShell('more');
  const root = document.getElementById('trivia-root');
  try {
    const items = await fetchJSON('trivia.json');
    root.innerHTML = '';
    if (!Array.isArray(items) || !items.length) {
      root.appendChild(el('div', 'empty', 'No trivia yet.'));
      return;
    }

    const grouped = new Map();
    items.forEach(item => {
      const tag = String(item.tag || 'other').trim().toLowerCase();
      if (!grouped.has(tag)) grouped.set(tag, []);
      grouped.get(tag).push(item);
    });

    const tags = [...grouped.keys()].sort((a, b) => {
      const ai = TAG_ORDER.indexOf(a); const bi = TAG_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.localeCompare(b);
    });

    tags.forEach(tag => {
      const group = el('section', 'trivia-group');
      group.appendChild(el('h2', 'section-title', escapeHtml(TAG_LABELS[tag] || titleize(tag))));
      grouped.get(tag).forEach(item => group.appendChild(triviaItem(item)));
      root.appendChild(group);
    });
  } catch (err) {
    console.error(err);
    root.innerHTML = '<div class="empty">Unable to load trivia right now.</div>';
  }
}

main();
