const TAG_LABELS = {
  featured: 'Featured',
  motorsport: 'Motorsport',
  nautical: 'Sailing & Nautical'
};

const TAG_ORDER = ['featured', 'motorsport', 'nautical'];

function normalizeTag(tag) {
  return String(tag || '').trim().toLowerCase();
}

function titleizeTag(tag) {
  return String(tag || 'Other')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function buildCard(item) {
  const card = document.createElement('div');
  card.className = 'trivia-card';

  const question = document.createElement('p');
  question.className = 'trivia-question';
  question.textContent = item.question || 'Untitled question';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'view-details-btn';
  button.textContent = 'View answer';
  button.addEventListener('click', () => {
    const { openModal, getModalBody } = ensureModal();
    const body = getModalBody();

    const q = document.createElement('h4');
    q.textContent = item.question || 'Answer';

    const a = document.createElement('p');
    a.className = 'trivia-answer';
    a.textContent = item.answer || 'No answer provided.';

    body.appendChild(q);
    body.appendChild(a);
    openModal();
  });

  card.appendChild(question);
  card.appendChild(button);
  return card;
}

function buildSection(tag, items) {
  const section = document.createElement('section');
  section.className = 'section tag-section trivia-section';
  section.id = `section-${tag || 'misc'}`;

  const container = document.createElement('div');
  container.className = 'center-container';

  const heading = document.createElement('h2');
  heading.textContent = TAG_LABELS[tag] || titleizeTag(tag);

  const grid = document.createElement('div');
  grid.className = 'series-grid trivia-grid';
  items.forEach((item) => grid.appendChild(buildCard(item)));

  container.appendChild(heading);
  container.appendChild(grid);
  section.appendChild(container);
  return section;
}

function groupByTag(items) {
  const map = new Map();
  items.forEach((item) => {
    const tag = normalizeTag(item.tag) || 'other';
    if (!map.has(tag)) {
      map.set(tag, []);
    }
    map.get(tag).push(item);
  });
  return map;
}

fetch('../trivia.json')
  .then((response) => response.json())
  .then((items) => {
    const root = document.getElementById('trivia-root');
    if (!root) return;

    if (!Array.isArray(items) || items.length === 0) {
      root.textContent = 'No trivia yet.';
      return;
    }

    root.textContent = '';
    const grouped = groupByTag(items);
    const usedTags = Array.from(grouped.keys());
    const orderedTags = [
      ...TAG_ORDER.filter((tag) => grouped.has(tag)),
      ...usedTags.filter((tag) => !TAG_ORDER.includes(tag)).sort()
    ];

    orderedTags.forEach((tag) => {
      root.appendChild(buildSection(tag, grouped.get(tag)));
    });
  })
  .catch(() => {
    const root = document.getElementById('trivia-root');
    if (root) {
      root.textContent = 'Unable to load trivia right now.';
    }
  });
