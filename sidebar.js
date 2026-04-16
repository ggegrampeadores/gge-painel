// sidebar.js — Menu compartilhado do Controle Total GGE
// Importar: <script src="sidebar.js" defer></script>

(function() {
  var pages = [
    { href: '/',             icon: '\uD83D\uDCCA', label: 'Dashboard',      key: 'dashboard' },
    { href: '/margem',       icon: '\uD83D\uDCC8', label: 'Margem',         key: 'margem' },
    { href: '/precificacao', icon: '\uD83C\uDFF7\uFE0F', label: 'Precifica\u00E7\u00E3o', key: 'precificacao' },
    { href: '/preco-mktp',   icon: '\uD83D\uDCB2', label: 'Pre\u00E7o MKTP',     key: 'preco-mktp' },
    { href: '/saude',        icon: '\uD83D\uDCAA', label: 'Sa\u00FAde',          key: 'saude' },
    { href: '/avaliacao',    icon: '\u2B50',        label: 'Avalia\u00E7\u00E3o',      key: 'avaliacao' },
    { href: '/ads',          icon: '\uD83D\uDCE2', label: 'ADs',            key: 'ads' },
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
      '.nav-item { display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:6px;color:#f0c040;text-decoration:none;cursor:pointer;transition:all .2s;white-space:nowrap;font-size:14px;font-weight:bold }',
      '.nav-item:hover { background-color:#161b22 }',
      '.nav-item.active { background-color:#58a6ff;color:#0f1117 }',
      '.nav-item-icon { display:flex;align-items:center;justify-content:center;min-width:20px }',
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
      '<span class="nav-item-icon">' + p.icon + '<\/span>' +
      '<span class="nav-item-label">' + p.label + '<\/span><\/a>';
  }

  var html = '<div class="sidebar" id="sidebar">' +
    '<div class="sidebar-header"><div class="sidebar-logo">' +
    '<span class="sidebar-logo-text">GGE<\/span>' +
    '<span class="sidebar-logo-sub">Controle Total<\/span>' +
    '<\/div><\/div>' +
    '<nav class="sidebar-nav">' + navHtml + '<\/nav><\/div>';

  var el = document.getElementById('sidebar-container');
  if (el) { el.innerHTML = html; }
  else { document.body.insertAdjacentHTML('afterbegin', html); }
})();
