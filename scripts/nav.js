(function () {
  // Offline indicator
  var banner = document.createElement('div');
  banner.className = 'offline-banner';
  banner.textContent = "You're offline — showing cached data";
  document.body.insertBefore(banner, document.body.firstChild);
  function updateStatus() {
    banner.classList.toggle('is-visible', !navigator.onLine);
  }
  window.addEventListener('offline', updateStatus);
  window.addEventListener('online', updateStatus);
  updateStatus();

  // Bottom navigation
  var inPages = location.pathname.includes('/pages/');
  var root = inPages ? '../' : '';
  var path = location.pathname;

  function svg(inner) {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  }

  var items = [
    {
      href: root + 'pages/tracks.html',
      label: 'Tracks',
      icon: svg('<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>'),
      active: path.endsWith('tracks.html')
    },
    {
      href: root + 'index.html',
      label: 'Home',
      icon: svg('<polyline points="2 9 12 2 22 9"/><rect x="2" y="9" width="20" height="13"/><line x1="2" y1="13" x2="22" y2="13"/><line x1="2" y1="17" x2="22" y2="17"/>'),
      active: path.endsWith('/') || path.endsWith('index.html')
    },
    {
      href: root + 'pages/trivia.html',
      label: 'Trivia',
      icon: svg('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
      active: path.endsWith('trivia.html')
    }
  ];

  var links = items.map(function (item) {
    return '<a href="' + item.href + '" class="bottom-nav__item' + (item.active ? ' is-active' : '') + '"' + (item.active ? ' aria-current="page"' : '') + '>' + item.icon + '<span>' + item.label + '</span></a>';
  }).join('');

  document.currentScript.insertAdjacentHTML('beforebegin',
    '<nav class="bottom-nav" aria-label="Main navigation">' + links + '</nav>'
  );
})();
