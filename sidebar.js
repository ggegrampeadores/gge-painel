// sidebar.js — Menu compartilhado do Controle Total GGE
// Importar: <script src="sidebar.js" defer></script>

(function() {
  // Lucide-style SVG icons (18x18, stroke)
  var icons = {
    dashboard: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
    margem: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>',
    precificacao: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
    'preco-mktp': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
    saude: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
    avaliacao: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  };

  var pages = [
    { href: '/',             key: 'dashboard',     label: 'Dashboard' },
    { href: '/margem',       key: 'margem',        label: 'Margem' },
    { href: '/precificacao', key: 'precificacao',  label: 'Precifica\u00E7\u00E3o' },
    { href: '/preco-mktp',   key: 'preco-mktp',    label: 'Pre\u00E7o MKTP' },
    { href: '/saude',        key: 'saude',         label: 'Sa\u00FAde' },
    { href: '/avaliacao',    key: 'avaliacao',     label: 'Avalia\u00E7\u00E3o' },
  ];

  var path = window.location.pathname.replace(/\\.html$/, '').replace(/\\/$/, '') || '/';

  function isActive(href) {
    if (href === '/') return path === '/' || path === '' || path === '/index';
    return path === href;
  }

  // CSS
  if (!document.querySelector('#sidebar-shared-styles')) {
    var style = document.createElement('style');
    style.id = 'sidebar-shared-styles';
    style.textContent = [
      '.sidebar { position:fixed;left:0;top:0;height:100vh;width:48px;background-color:#0a0e14;border-right:1px solid #2a2d3a;padding:20px 0;transition:width .3s ease;z-index:1000;overflow-y:auto;overflow-x:hidden }',
      '.sidebar:hover { width:250px }',
      '.sidebar-header { display:flex;align-items:center;padding:0 12px;margin-bottom:30px;min-height:40px }',
      '.sidebar-logo { display:flex;flex-direction:column;gap:4px }',
      '.sidebar-logo-text { font-weight:700;font-size:20px;color:#58a6ff }',
      '.sidebar-logo-sub { font-size:10px;color:#8b949e;line-height:1 }',
      '.sidebar:not(:hover) .sidebar-logo-sub { display:none }',
      '.sidebar-nav { display:flex;flex-direction:column;gap:4px;padding:0 8px }',
      '.nav-item { display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:6px;color:#8b949e;text-decoration:none;cursor:pointer;transition:all .2s;white-space:nowrap;font-size:13px;font-weight:500 }',
      '.nav-item:hover { background-color:#161b22;color:#c9d1d9 }',
      '.nav-item.active { background-color:rgba(88,166,255,.12);color:#58a6ff }',
      '.nav-item-icon { display:flex;align-items:center;justify-content:center;min-width:20px }',
      '.nav-item-icon svg { flex-shrink:0 }',
      '.sidebar:not(:hover) .nav-item-label { display:none }',
      '.main-with-sidebar { margin-left:48px;min-height:100vh }',
    ].join('\n');
    document.head.appendChild(style);
  }

  // HTML
  var navHtml = '';
  for (var i = 0; i < pages.length; i++) {
    var p = pages[i];
    var cls = isActive(p.href) ? ' active' : '';
    navHtml += '<a href="' + p.href + '" class="nav-item' + cls + '" data-page="' + p.key + '">' +
      '<span class="nav-item-icon">' + icons[p.key] + '</span>' +
      '<span class="nav-item-label">' + p.label + '</span></a>';
  }

  var html = '<div class="sidebar" id="sidebar">' +
    '<div class="sidebar-header"><div class="sidebar-logo">' +
    '<span class="sidebar-logo-text">GGE</span>' +
    '<span class="sidebar-logo-sub">Controle Total</span>' +
    '</div></div>' +
    '<nav class="sidebar-nav">' + navHtml + '</nav></div>';

  var el = document.getElementById('sidebar-container');
  if (el) { el.innerHTML = html; }
  else { document.body.insertAdjacentHTML('afterbegin', html); }
})();
