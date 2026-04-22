// sidebar.js — Menu compartilhado do Controle Total GGE
// Importar: <script src="sidebar.js" defer></script>

(function() {
  // SVG icons — estilo Lucide (stroke-based, 20x20, clean)
  var svgIcon = function(path, extra) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + path + (extra || '') + '</svg>';
  };

  var icons = {
    dashboard:    svgIcon('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
    margem:       svgIcon('<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>'),
    precificacao: svgIcon('<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>'),
    'preco-mktp': svgIcon('<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>'),
    saude:        svgIcon('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'),
    avaliacao:    svgIcon('<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>'),
    ads:          svgIcon('<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>'),
  };

  var pages = [
    { href: '/',             icon: icons.dashboard,    label: 'Dashboard',      key: 'dashboard' },
    { href: '/margem',       icon: icons.margem,       label: 'Margem',         key: 'margem' },
    { href: '/precificacao', icon: icons.precificacao, label: 'Tabela VD', key: 'precificacao' },
    { href: '/preco-mktp',   icon: icons['preco-mktp'],label: 'Pre\u00E7o MKTP',     key: 'preco-mktp' },
    { href: '/saude',        icon: icons.saude,        label: 'Sa\u00FAde',          key: 'saude' },
    { href: '/avaliacao',    icon: icons.avaliacao,     label: 'Avalia\u00E7\u00E3o',      key: 'avaliacao' },
    { href: '/ads',          icon: icons.ads,           label: 'ADs',            key: 'ads' },
  ];

  var path = window.location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';

  function isActive(href) {
    if (href === '/') return path === '/' || path === '' || path === '/index';
    return path === href;
  }

  // CSS do sidebar
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
      '.sidebar-nav { display:flex;flex-direction:column;gap:8px;padding:0 8px }',
      '.nav-item { display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:6px;color:#8b949e;text-decoration:none;cursor:pointer;transition:all .2s;white-space:nowrap;font-size:14px;font-weight:500 }',
      '.nav-item:hover { background-color:#161b22;color:#c9d1d9 }',
      '.nav-item.active { background-color:#1a3a5c;color:#58a6ff }',
      '.nav-item-icon { display:flex;align-items:center;justify-content:center;min-width:20px }',
      '.nav-item-icon svg { flex-shrink:0 }',
      '.sidebar:not(:hover) .nav-item-label { display:none }',
      '.main-with-sidebar { margin-left:48px;min-height:100vh }',
    ].join('\n');
    document.head.appendChild(style);
  }

  // HTML do sidebar
  var navHtml = '';
  for (var i = 0; i < pages.length; i++) {
    var p = pages[i];
    var cls = isActive(p.href) ? ' active' : '';
    navHtml += '<a href="' + p.href + '" class="nav-item' + cls + '" data-page="' + p.key + '">' +
      '<span class="nav-item-icon">' + p.icon + '</span>' +
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
