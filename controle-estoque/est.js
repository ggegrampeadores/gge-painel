// est.js — núcleo compartilhado do Controle de Estoque (fase 1)
// Login por Supabase Auth, permissões por est_usuarios/est_usuarios_funcoes, layout e helpers.
(function () {
  var URL = 'https://opceujqpqyvxsatzdarg.supabase.co';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wY2V1anFwcXl2eHNhdHpkYXJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NzIwMDEsImV4cCI6MjA4OTA0ODAwMX0.XKhgaNBJF8xiHiGEWEs8HL1dq5KFJpo2_RQckjsY9kc';
  // Sessao unica: mesma chave de armazenamento do painel, entao o login de /login.html serve aqui.
  var sb = window.supabase.createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true } });

  var PAGES = [
    { href: 'index',      label: 'Saldos',               func: 'saldos' },
    { href: 'entradas',   label: 'Entradas (NF/manual)', func: 'entrada_nf', alt: 'entrada_manual' },
    { href: 'movimentos', label: 'Movimentos',           func: 'movimentos' },
    { href: 'abertura',   label: 'Abertura',             func: 'abertura' },
    { href: 'config',     label: 'Parâmetros',           func: 'config' },
    { href: 'usuarios',   label: 'Usuários',             func: 'usuarios' }
  ];

  var EST = {
    sb: sb, perm: null, user: null, depositos: null,
    fmt: function (n, d) { if (n === null || n === undefined || isNaN(n)) return '—'; return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d || 0, maximumFractionDigits: d === undefined ? 2 : d }); },
    money: function (n) { return n === null || n === undefined ? '—' : 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
    dt: function (s) { if (!s) return '—'; var d = new Date(s); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); },
    d: function (s) { return s ? new Date(s.length === 10 ? s + 'T12:00:00' : s).toLocaleDateString('pt-BR') : '—'; },
    esc: function (s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); },
    can: function (f, edit) { if (!EST.perm || !EST.perm.ativo) return false; if (EST.perm.papel === 'admin') return true; var x = EST.perm.funcoes && EST.perm.funcoes[f]; return !!(x && x.ver && (!edit || x.editar)); },
    toast: function (msg, kind) {
      var t = document.createElement('div'); t.className = 'est-toast ' + (kind || ''); t.textContent = msg; document.body.appendChild(t);
      setTimeout(function () { t.classList.add('show'); }, 10); setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 300); }, kind === 'err' ? 7000 : 3500);
    },
    confirm: function (title, html, okLabel) {
      return new Promise(function (res) {
        var bg = document.createElement('div'); bg.className = 'est-modal-bg show';
        bg.innerHTML = '<div class="est-modal"><h3>' + EST.esc(title) + '</h3><div class="est-modal-body">' + html + '</div><div class="acts"><button class="sec" data-a="0">Cancelar</button><button data-a="1">' + EST.esc(okLabel || 'Confirmar') + '</button></div></div>';
        bg.addEventListener('click', function (e) { var a = e.target.getAttribute && e.target.getAttribute('data-a'); if (a !== null && a !== undefined) { bg.remove(); res(a === '1'); } if (e.target === bg) { bg.remove(); res(false); } });
        document.body.appendChild(bg);
      });
    },
    rpc: async function (fn, args) { var r = await sb.rpc(fn, args || {}); if (r.error) throw new Error(r.error.message); return r.data; },
    sel: async function (q) { var r = await q; if (r.error) throw new Error(r.error.message); return r.data; },
    loadDepositos: async function () {
      if (EST.depositos) return EST.depositos;
      EST.depositos = await EST.sel(sb.from('est_depositos').select('*').order('ordem'));
      return EST.depositos;
    },
    dep: function (id) { return (EST.depositos || []).find(function (d) { return d.id === id; }) || { id: id, nome: id }; },
    logout: async function () { await sb.auth.signOut(); location.href = 'login'; }
  };
  window.EST = EST;

  // CSS compartilhado
  var css = document.createElement('style');
  css.textContent = [
    '*{box-sizing:border-box;margin:0;padding:0}',
    'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;background:#0d1117;color:#e6edf3;font-size:14px}',
    '.est-top{position:sticky;top:0;z-index:50;display:flex;align-items:center;gap:18px;padding:10px 22px;background:#0a0e14;border-bottom:1px solid #2a2d3a}',
    '.est-top .brand{font-weight:700;color:#58a6ff;text-decoration:none;white-space:nowrap}.est-top .brand small{color:#8b949e;font-weight:500;margin-left:6px}',
    '.est-nav{display:flex;gap:4px;flex-wrap:wrap}.est-nav a{color:#8b949e;text-decoration:none;padding:6px 11px;border-radius:6px;font-weight:500}.est-nav a:hover{background:#161b22;color:#c9d1d9}.est-nav a.active{background:#1a3a5c;color:#58a6ff}',
    '.est-top .who{margin-left:auto;color:#8b949e;font-size:12px;white-space:nowrap}.est-top .who b{color:#c9d1d9}.est-top .who a{color:#58a6ff;margin-left:10px;cursor:pointer}',
    '.est-main{padding:22px 26px;max-width:1700px}',
    'h1{font-size:21px;margin-bottom:3px}.subtitle{color:#8b949e;font-size:13px;margin-bottom:16px}',
    '.card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:14px 16px;margin-bottom:16px;overflow-x:auto}',
    'table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;color:#8b949e;font-weight:600;padding:7px 8px;border-bottom:1px solid #30363d;white-space:nowrap;position:sticky;top:0;background:#161b22}td{padding:6px 8px;border-bottom:1px solid #21262d;white-space:nowrap}tr:hover td{background:#1c2128}',
    '.num{text-align:right;font-variant-numeric:tabular-nums}th.num{text-align:right}.muted{color:#8b949e}.pos{color:#3fb950}.neg{color:#f85149}.warn{color:#d29922}.small{font-size:12px}',
    '.badge{display:inline-block;padding:2px 8px;border-radius:10px;font-weight:700;font-size:11px}.b-verde{background:rgba(63,185,80,.15);color:#3fb950}.b-amarelo{background:rgba(210,153,34,.15);color:#d29922}.b-vermelho{background:rgba(248,81,73,.15);color:#f85149}.b-azul{background:rgba(88,166,255,.15);color:#58a6ff}.b-cinza{background:#21262d;color:#8b949e}',
    'input,select,textarea{background:#0d1117;border:1px solid #30363d;color:#e6edf3;border-radius:6px;padding:7px 10px;font-size:13px;font-family:inherit}input:focus,select:focus,textarea:focus{outline:none;border-color:#58a6ff}',
    'input.cell{width:84px;text-align:right;padding:3px 6px}input.cell.dirty{border-color:#d29922;background:rgba(210,153,34,.08)}',
    '.toolbar{display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap;align-items:center}',
    'button{background:#238636;color:#fff;border:none;border-radius:6px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}button:disabled{opacity:.45;cursor:default}button.sec{background:#21262d;border:1px solid #30363d;color:#c9d1d9}button.danger{background:#b62324}button.sm{padding:4px 9px;font-size:12px}',
    '.seg{display:inline-flex;border:1px solid #30363d;border-radius:6px;overflow:hidden}.seg button{background:#0d1117;color:#8b949e;border-radius:0;padding:6px 12px}.seg button.on{background:#1a3a5c;color:#58a6ff}',
    '.est-modal-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:2000;align-items:center;justify-content:center}.est-modal-bg.show{display:flex}.est-modal{background:#161b22;border:1px solid #30363d;border-radius:10px;padding:22px;width:min(640px,94vw);max-height:90vh;overflow:auto}.est-modal h3{margin-bottom:12px;font-size:16px}.est-modal label{display:block;color:#8b949e;font-size:12px;margin:10px 0 4px}.est-modal input,.est-modal select,.est-modal textarea{width:100%}.est-modal .acts{display:flex;gap:10px;margin-top:18px;justify-content:flex-end}',
    '.est-toast{position:fixed;bottom:22px;right:22px;background:#1a3a5c;color:#e6edf3;padding:10px 16px;border-radius:8px;border:1px solid #58a6ff;opacity:0;transform:translateY(8px);transition:all .25s;z-index:3000;max-width:480px}.est-toast.show{opacity:1;transform:none}.est-toast.err{background:#3d1416;border-color:#f85149}.est-toast.ok{background:#12351c;border-color:#3fb950}',
    '.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:900px){.grid2{grid-template-columns:1fr}}',
    '.kpi{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px}.kpi div{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:10px 14px;min-width:150px}.kpi b{display:block;font-size:20px}.kpi span{color:#8b949e;font-size:12px}',
    '.nota{color:#8b949e;font-size:12px;line-height:1.6}'
  ].join('\n');
  document.head.appendChild(css);

  function page() { var p = location.pathname.replace(/\.html$/, '').replace(/\/$/, ''); var last = p.split('/').pop(); return last === 'controle-estoque' || last === '' ? 'index' : last; }

  // A Vercel serve estas telas em dois endereços: /controle-estoque/ e /controle-estoque.
  // Sem a barra, todo link relativo cai na raiz do site. Por isso os caminhos daqui
  // para dentro são sempre absolutos.
  var BASE = '/controle-estoque/';

  function renderTop() {
    var cur = page();
    var nav = PAGES.filter(function (p) { return EST.can(p.func) || (p.alt && EST.can(p.alt)); })
      .map(function (p) { return '<a href="' + BASE + p.href + '" class="' + (p.href === cur ? 'active' : '') + '">' + p.label + '</a>'; }).join('');
    var top = document.createElement('div'); top.className = 'est-top';
    top.innerHTML = '<a class="brand" href="/">GGE<small>Controle de Estoque</small></a><div class="est-nav">' + nav + '</div>' +
      '<div class="who"><b>' + EST.esc(EST.perm.nome || EST.user.email) + '</b> · ' + EST.esc(EST.perm.papel) + '<a onclick="EST.logout()">sair</a></div>';
    document.body.insertBefore(top, document.body.firstChild);
  }

  // est.js é carregado no <head>, então document.body ainda não existe quando este
  // bloco começa. Sem esperar, a guarda quebrava na primeira linha e a tela abria sem sessão.
  function corpoPronto() {
    return new Promise(function (ok) {
      if (document.body) return ok();
      document.addEventListener('DOMContentLoaded', function () { ok(); }, { once: true });
    });
  }

  EST.ready = (async function () {
    if (page() === 'login') return null;
    await corpoPronto();
    document.body.style.visibility = 'hidden';
    var s = await sb.auth.getSession();
    if (!s.data.session) { location.href = '/login?next=' + encodeURIComponent(BASE + page()); return null; }
    EST.user = s.data.session.user;
    try { EST.perm = await EST.rpc('est_minhas_permissoes'); } catch (e) { EST.perm = { ativo: false }; }
    if (!EST.perm.ativo) {
      document.body.innerHTML = '<div class="est-main"><div class="card"><h1>Sem acesso</h1><p class="muted">O e-mail <b>' + EST.esc(EST.user.email) + '</b> está autenticado, mas não está liberado no Controle de Estoque. Peça a um administrador para cadastrá-lo em Usuários.</p><p style="margin-top:12px"><button class="sec" onclick="EST.logout()">Sair</button></p></div></div>';
      document.body.style.visibility = '';
      return null;
    }
    var pg = PAGES.find(function (p) { return p.href === page(); });
    if (pg && !(EST.can(pg.func) || (pg.alt && EST.can(pg.alt)))) {
      document.body.innerHTML = '<div class="est-main"><div class="card"><h1>Função não liberada</h1><p class="muted">Você não tem acesso a esta tela. <a href="/controle-estoque/index" style="color:#58a6ff">Voltar</a></p></div></div>';
      document.body.style.visibility = ''; return null;
    }
    await EST.loadDepositos();
    renderTop();
    document.body.style.visibility = '';
    return EST.perm;
  })();
})();
