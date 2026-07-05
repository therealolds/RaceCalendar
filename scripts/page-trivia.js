/* Trivia page: one button per category deals a random question; pressing
   again (or tapping the card) reveals the answer, then deals the next. */

import { fetchJSON } from './data.js';
import { initShell, el, escapeHtml } from './ui.js';

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

function categorySection(tag, items) {
  const group = el('section', 'trivia-group');
  group.appendChild(el('h2', 'section-title', escapeHtml(TAG_LABELS[tag] || titleize(tag))));

  const btn = el('button', 'trivia-draw', 'Draw a question');
  btn.type = 'button';
  const card = el('details', 'trivia-item');
  card.hidden = true;

  let lastId = null;
  const draw = () => {
    let pick;
    do {
      pick = items[Math.floor(Math.random() * items.length)];
    } while (items.length > 1 && pick.id === lastId);
    lastId = pick.id;
    card.open = false;
    card.innerHTML = `
      <summary>${escapeHtml(pick.question || 'Untitled question')}</summary>
      <p class="trivia-item__answer">${escapeHtml(pick.answer || 'No answer provided.')}</p>
    `;
    card.hidden = false;
    btn.textContent = 'Check the answer';
  };

  btn.addEventListener('click', () => {
    if (card.hidden || card.open) draw();
    else card.open = true;              // toggle listener updates the label
  });
  // keep the button label honest when the card itself is tapped
  card.addEventListener('toggle', () => {
    btn.textContent = card.open ? 'Another question' : 'Check the answer';
  });

  group.appendChild(btn);
  group.appendChild(card);
  return group;
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
      root.appendChild(categorySection(tag, grouped.get(tag)));
    });
  } catch (err) {
    console.error(err);
    root.innerHTML = '<div class="empty">Unable to load trivia right now.</div>';
  }
}

main();
