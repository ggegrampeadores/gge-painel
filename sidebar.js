// =====================================================================
// GGE CASH — Sidebar lateral compartilhado
// =====================================================================

(function() {
  var path = window.location.pathname || '';
  var arquivoAtual = path.split('/').pop().replace('.html', '');
  if (!arquivoAtual || arquivoAtual === '') arquivoAtual = 'index';

  var items = [
    { id: 'index',         label: 'Dashboard',     href: 'index.html',         icon: '▤' },
    { id: 'caixa',         label: 'Caixa Semanal', href: 'caixa.html',         icon: '▥' },
    { id: 'saldos',        label: 'Saldos',        href: 'saldos.html',        icon: '◎' },
    { id: 'metas',         label: 'Metas',         href: 'metas.html',         icon: '○' },
    { id: 'decisoes',      label: 'Decisões',      href: 'decisoes.html',      icon: '★' },
    { id: 'pagamentos',    label: 'Pagamentos',    href: 'pagamentos.html',    icon: '⇄' },
    { id: 'extras',        label: 'Extras',        href: 'extras.html',        icon: '±' },
    { id: 'pendencias',    label: 'Pendencias',    href: 'pendencias.html',    icon: '⚠' },
    { id: 'investimentos', label: 'Investimentos', href: 'investimentos.html', icon: '▲' },
    { id: 'alavancas',     label: 'Alavancas',     href: 'alavancas.html',     icon: '≡' },
    { id: 'categorias',    label: 'Categorias',    href: 'categorias.html',    icon: '▦' },
    { id: 'mapeamento',    label: 'Mapeamento',    href: 'mapeamento.html',    icon: '⇆' }
  ];

  var css = ''
    + '#cash-sidebar { position:fixed; top:0; left:0; height:100vh; width:48px; '
    + 'background:#161b22; border-right:1px solid #30363d; z-index:100; '
    + 'transition: width .18s ease; overflow:hidden; }'
    + '#cash-sidebar:hover { width:180px; }'
    + '#cash-sidebar .brand { color:#58a6ff; font-weight:700; font-size:11px; '
    + 'padding:14px 12px; border-bottom:1px solid #30363d; letter-spacing:.5px; '
    + 'white-space:nowrap; }'
    + '#cash-sidebar .brand .full { display:none; }'
    + '#cash-sidebar:hover .brand .short { display:none; }'
    + '#cash-sidebar:hover .brand .full { display:inline; }'
    + '#cash-sidebar a { display:flex; align-items:center; gap:12px; '
    + 'color:#c9d1d9; text-decoration:none; padding:10px 14px; '
    + 'font-size:13px; white-space:nowrap; border-left:3px solid transparent; }'
    + '#cash-sidebar a .icon { font-size:16px; width:20px; text-align:center; }'
    + '#cash-sidebar a:hover { background:#1f2630; color:#e6edf3; }'
    + '#cash-sidebar a.active { background:#1f2630; color:#58a6ff; '
    + 'border-left-color:#58a6ff; }'
    + '#cash-sidebar .label { opacity:0; transition: opacity .18s ease; }'
    + '#cash-sidebar:hover .label { opacity:1; }';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var html = '<aside id="cash-sidebar">';
  html += '<div class="brand"><span class="short">GC</span><span class="full">GGE CASH</span></div>';
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var active = (it.id === arquivoAtual) ? ' class="active"' : '';
    html += '<a href="' + it.href + '"' + active + '>'
         +  '<span class="icon">' + it.icon + '</span>'
         +  '<span class="label">' + it.label + '</span>'
         +  '</a>';
  }
  html += '</aside>';

  var container = document.getElementById('sidebar-container');
  if (container) {
    container.innerHTML = html;
  } else {
    var div = document.createElement('div');
    div.innerHTML = html;
    document.body.insertBefore(div.firstChild, document.body.firstChild);
  }
})();
