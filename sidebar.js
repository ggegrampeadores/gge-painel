// sidebar.js - Menu compartilhado do Controle Total GGE
// Importar: <script src="sidebar.js" defer></script>

(function() {
  var svgIcon = function(path, extra) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + path + (extra || '') + '</svg>';
  };

  var icons = {
    dashboard:    svgIcon('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
    margem:       svgIcon('<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>'),
    tabelavd:     svgIcon('<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>'),
    precomktp:    svgIcon('<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>'),
    catalogo:     svgIcon('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
    dashcatalogo: svgIcon('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>'),
    catalogoitem: svgIcon('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M8 7h8"/><path d="M8 11h6"/>'),
    automacao:    svgIcon('<path d="M12 2v4"/><path d="M12 18v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="m16.24 16.24 2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="m16.24 4.76 2.83-2.83"/><circle cx="12" cy="12" r="4"/>'),
    reputacao:    svgIcon('<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>'),
    ads:          svgIcon('<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>'),
    realinha:     svgIcon('<path d="M2 12h5l3-9 4 18 3-9h5"/>'),
    saude:        svgIcon('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'),
    chevron:      svgIcon('<polyline points="6 9 12 15 18 9"/>')
  };

  // Menu na ordem definitiva do Neco
  // Catálogo tem sub-menu: Dashboard, Catálogo, Automação
  var pages = [
    { href: '/',                     icon: icons.dashboard, label: 'Dashboard',      key: 'dashboard' },
    { href: '/margem',               icon: icons.margem,    label: 'Margem',         key: 'margem' },
    { href: '/precificacao',         icon: icons.tabelavd,  label: 'Tabela VD',      key: 'precificacao' },
    { href: '/preco-mktp',           icon: icons.precomktp, label: 'Preço MKTP',key: 'preco-mktp' },
    {
      icon: icons.catalogo, label: 'Catálogo', key: 'catalogo-group',
      children: [
        { href: '/catalogo-dash', icon: icons.dashcatalogo, label: 'Dashboard',            key: 'catalogo-dash' },
        { href: '/catalogo',      icon: icons.catalogoitem, label: 'Catálogo',   key: 'catalogo' },
        { href: '/automacao',     icon: icons.automacao,    label: 'Automação', key: 'automacao' }
      ]
    },
    { href: '/reputacao',            icon: icons.reputacao,  label: 'Reputação', key: 'reputacao' },
    { href: '/ads',                  icon: icons.ads,       label: 'ADs',            key: 'ads' },
    { href: '/realinhamento-precos', icon: icons.realinha,  label: 'Realinhamento',  key: 'realinhamento' },
    { href: '/saude',                icon: icons.saude,     label: 'Saúde',     key: 'saude' }
  ];

  var path = window.location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';

  function isActive(href) {
    if (href === '/') return path === '/' || path === '' || path === '/index';
    return path === href;
  }

  function isGroupActive(children) {
    for (var i = 0; i < children.length; i++) {
      if (isActive(children[i].href)) return true;
    }
    return false;
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
      '.nav-item { display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:6px;color:#8b949e;text-decoration:none;cursor:pointer;transition:all .2s;white-space:nowrap;font-size:14px;font-weight:500 }',
      '.nav-item:hover { background-color:#161b22;color:#c9d1d9 }',
      '.nav-item.active { background-color:#1a3a5c;color:#58a6ff }',
      '.nav-item-icon { display:flex;align-items:center;justify-content:center;min-width:20px }',
      '.nav-item-icon svg { flex-shrink:0 }',
      '.sidebar:not(:hover) .nav-item-label { display:none }',
      '.sidebar:not(:hover) .nav-group-chevron { display:none }',
      '.sidebar:not(:hover) .nav-sub-items { display:none }',
      '.nav-group-header { display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:6px;color:#8b949e;cursor:pointer;transition:all .2s;white-space:nowrap;font-size:14px;font-weight:500 }',
      '.nav-group-header:hover { background-color:#161b22;color:#c9d1d9 }',
      '.nav-group-header.group-active { color:#58a6ff }',
      '.nav-group-chevron { margin-left:auto;transition:transform .2s;opacity:.5 }',
      '.nav-group-chevron.open { transform:rotate(180deg) }',
      '.nav-sub-items { overflow:hidden;transition:max-height .25s ease }',
      '.nav-sub-items .nav-item { padding:8px 12px 8px 44px;font-size:13px }',
      '.main-with-sidebar { margin-left:48px;min-height:100vh }'
    ].join('\n');
    document.head.appendChild(style);
  }

  // Build HTML
  var navHtml = '';
  for (var i = 0; i < pages.length; i++) {
    var p = pages[i];
    if (p.children) {
      var groupActive = isGroupActive(p.children);
      var openClass = groupActive ? ' open' : '';
      navHtml += '<div class="nav-group" data-group="' + p.key + '">';
      navHtml += '<div class="nav-group-header' + (groupActive ? ' group-active' : '') + '" onclick="var g=this.parentElement;g.classList.toggle(\'expanded\');this.querySelector(\'.nav-group-chevron\').classList.toggle(\'open\');var sub=g.querySelector(\'.nav-sub-items\');sub.style.maxHeight=g.classList.contains(\'expanded\')?\'200px\':\'0\'">';
      navHtml += '<span class="nav-item-icon">' + p.icon + '</span>';
      navHtml += '<span class="nav-item-label">' + p.label + '</span>';
      navHtml += '<span class="nav-group-chevron' + openClass + '">' + icons.chevron + '</span>';
      navHtml += '</div>';
      var subStyle = groupActive ? 'max-height:200px' : 'max-height:0';
      navHtml += '<div class="nav-sub-items" style="' + subStyle + '">';
      for (var j = 0; j < p.children.length; j++) {
        var c = p.children[j];
        var cls = isActive(c.href) ? ' active' : '';
        navHtml += '<a href="' + c.href + '" class="nav-item' + cls + '" data-page="' + c.key + '">';
        navHtml += '<span class="nav-item-label">' + c.label + '</span></a>';
      }
      navHtml += '</div></div>';
    } else {
      var cls = isActive(p.href) ? ' active' : '';
      navHtml += '<a href="' + p.href + '" class="nav-item' + cls + '" data-page="' + p.key + '">';
      navHtml += '<span class="nav-item-icon">' + p.icon + '</span>';
      navHtml += '<span class="nav-item-label">' + p.label + '</span></a>';
    }
  }

  // Toggle expanded groups on hover
  var expandScript = '<script>' +
    'document.addEventListener("DOMContentLoaded",function(){' +
    'var sb=document.getElementById("sidebar");if(!sb)return;' +
    'var groups=sb.querySelectorAll(".nav-group");' +
    'sb.addEventListener("mouseenter",function(){groups.forEach(function(g){' +
    'if(g.classList.contains("expanded")||g.querySelector(".nav-item.active")){' +
    'g.querySelector(".nav-sub-items").style.maxHeight="200px"}})});' +
    'sb.addEventListener("mouseleave",function(){groups.forEach(function(g){' +
    'if(!g.querySelector(".nav-item.active")){g.querySelector(".nav-sub-items").style.maxHeight="0"}})})' +
    '});<\/script>';

  var html = '<div class="sidebar" id="sidebar">' +
    '<div class="sidebar-header"><div class="sidebar-logo">' +
    '<span class="sidebar-logo-text">GGE</span>' +
    '<span class="sidebar-logo-sub">Controle Total</span>' +
    '</div></div>' +
    '<nav class="sidebar-nav">' + navHtml + '</nav></div>' + expandScript;

  var el = document.getElementById('sidebar-container');
  if (el) { el.innerHTML = html; }
  else { document.body.insertAdjacentHTML('afterbegin', html); }
})();
