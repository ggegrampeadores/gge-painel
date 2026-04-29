// dados.js — Arquivo compartilhado do Controle Total GGE
// Importar APÓS config.js e supabase-js, ANTES de sidebar.js
// <script src="dados.js"></script>

(function() {
  'use strict';
  window.GGE = window.GGE || {};

  // ═══════════════════════════════════════════
  // 1. SUPABASE CLIENT (singleton)
  // ═══════════════════════════════════════════
  var _sb = null;
  GGE.sb = function() {
    if (!_sb) {
      _sb = window.supabase.createClient(window.GGE_SUPABASE_URL, window.GGE_SUPABASE_KEY);
    }
    return _sb;
  };

  // ═══════════════════════════════════════════
  // 2. FORMATAÇÃO — fonte única de verdade
  // ═══════════════════════════════════════════

  // R$ 1.234,56
  GGE.fmtR = function(n) {
    if (n == null) return '—';
    return 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // R$ 1.235 (sem decimais)
  GGE.fmtR0 = function(n) {
    if (n == null) return '—';
    return 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  // 1.234
  GGE.fmtN = function(n) {
    if (n == null) return '—';
    return Number(n).toLocaleString('pt-BR');
  };

  // 12,3%
  GGE.fmtP = function(n) {
    if (n == null) return '—';
    return Number(n).toFixed(1) + '%';
  };

  // 12,34%
  GGE.fmtP2 = function(n) {
    if (n == null) return '—';
    return Number(n).toFixed(2) + '%';
  };

  // 28/04/2026
  GGE.fmtDate = function(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('pt-BR');
  };

  // 28/04 14:30
  GGE.fmtDateTime = function(d) {
    if (!d) return '—';
    return new Date(d).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  };

  // Variação: ▲ +12,3% ou ▼ -5,2%
  GGE.fmtDelta = function(atual, anterior, opts) {
    opts = opts || {};
    if (anterior == null || anterior === 0) return '—';
    var diff = atual - anterior;
    var pct = (diff / Math.abs(anterior)) * 100;
    var positivo = opts.inverter ? diff < 0 : diff > 0;
    var seta = diff > 0 ? '▲' : diff < 0 ? '▼' : '→';
    var cor = diff === 0 ? 'neutral' : positivo ? 'up' : 'down';
    return { seta: seta, pct: pct, diff: diff, cor: cor, positivo: positivo };
  };

  // ═══════════════════════════════════════════
  // 3. DATE RANGES — timezone-aware (BRL)
  // ═══════════════════════════════════════════

  GGE.hoje = function() {
    // Retorna data de hoje em BRL: "2026-04-28"
    var now = new Date();
    var parts = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    return parts; // formato YYYY-MM-DD
  };

  GGE.getDateRange = function(period) {
    var today = GGE.hoje();
    var todayDate = new Date(today + 'T12:00:00');

    var DAYS = {
      '1d': 1, '3d': 3, '7d': 7, '10d': 10, '14d': 14,
      '15d': 15, '30d': 30, '60d': 60, '90d': 90, '180d': 180, '1a': 365
    };

    if (period === 'mes_atual') {
      return { from: today.slice(0, 7) + '-01', to: today };
    }
    if (period === 'mes_passado') {
      var first = new Date(todayDate.getFullYear(), todayDate.getMonth() - 1, 1);
      var last = new Date(todayDate.getFullYear(), todayDate.getMonth(), 0);
      return {
        from: first.toISOString().slice(0, 10),
        to: last.toISOString().slice(0, 10)
      };
    }

    var d = DAYS[period] || 30;
    var from = new Date(todayDate);
    from.setDate(from.getDate() - d);
    return { from: from.toISOString().slice(0, 10), to: today };
  };

  // Período anterior equivalente (para comparação)
  GGE.getPreviousRange = function(period) {
    var range = GGE.getDateRange(period);
    var fromDate = new Date(range.from + 'T12:00:00');
    var toDate = new Date(range.to + 'T12:00:00');
    var diffMs = toDate - fromDate;
    var diffDays = Math.round(diffMs / 86400000);

    var prevTo = new Date(fromDate);
    prevTo.setDate(prevTo.getDate() - 1);
    var prevFrom = new Date(prevTo);
    prevFrom.setDate(prevFrom.getDate() - diffDays);

    return {
      from: prevFrom.toISOString().slice(0, 10),
      to: prevTo.toISOString().slice(0, 10)
    };
  };

  // ═══════════════════════════════════════════
  // 4. CONTAS — referência
  // ═══════════════════════════════════════════
  GGE.CONTAS = {
    GGE:  { id: 'e761652f-07fa-49d2-a6c7-1b738862ab08', ml_user_id: '312056139',  nome: 'GGE-GRAMPEADORES' },
    GGESP:{ id: '304d2ad4-a3e7-449b-9073-1b7d54cbfa0c', ml_user_id: '2957058495', nome: 'GGESP' },
    TOOW: { id: '8284ee61-87f9-4162-9f1f-542587fbbf53', ml_user_id: '1460889823', nome: 'TOOWCOMERCIAL' }
  };

  // ═══════════════════════════════════════════
  // 5. TAILWIND COLORS (para React pages)
  // ═══════════════════════════════════════════
  GGE.TW_COLORS = {
    'gge-bg':'#0f1117','gge-card':'#1a1d2e','gge-border':'#2a2d3e',
    'gge-text':'#e2e8f0','gge-muted':'#94a3b8','gge-accent':'#6366f1',
    'gge-green':'#22c55e','gge-red':'#ef4444','gge-yellow':'#eab308',
    'gge-orange':'#f97316','gge-cyan':'#22d3ee'
  };

  // ═══════════════════════════════════════════
  // 6. CLASSIFICAÇÃO de margem
  // ═══════════════════════════════════════════
  GGE.CLASSIF_LABEL = {
    critico: 'Crítico', atencao: 'Atenção',
    margem_baixa: 'Margem Baixa', ok: 'Ok', sem_vendas: 'Sem Vendas'
  };
  GGE.CLASSIF_ORDER = { critico: 0, atencao: 1, margem_baixa: 2, ok: 3, sem_vendas: 4 };

  // ═══════════════════════════════════════════
  // 7. FETCH ALL (paginação Supabase)
  // ═══════════════════════════════════════════
  GGE.fetchAll = async function(buildQuery) {
    var PAGE = 1000;
    var allRows = [], from = 0;
    while (true) {
      var result = await buildQuery().range(from, from + PAGE - 1);
      if (result.error) throw result.error;
      if (!result.data || result.data.length === 0) break;
      allRows = allRows.concat(result.data);
      if (result.data.length < PAGE) break;
      from += PAGE;
    }
    return allRows;
  };

  // ═══════════════════════════════════════════
  // 8. AUTH CHECK
  // ═══════════════════════════════════════════
  GGE.checkAuth = function() {
    var auth = sessionStorage.getItem('gge_auth');
    if (!auth || (auth !== 'owner' && auth !== 'gge2026' && !auth.startsWith('token:'))) {
      window.location.href = '/';
      return false;
    }
    return true;
  };

  // ═══════════════════════════════════════════
  // 9. STATUS DE COMPETIÇÃO
  // ═══════════════════════════════════════════
  GGE.STATUS_COMP = {
    winning:             { label: 'Winning',       color: '#22c55e', cssClass: 'text-gge-green' },
    competing:           { label: 'Competing',     color: '#f97316', cssClass: 'text-gge-orange' },
    sharing_first_place: { label: 'Dividindo 1º',  color: '#22d3ee', cssClass: 'text-gge-cyan' },
    not_listed:          { label: 'Não listado',   color: '#ef4444', cssClass: 'text-gge-red' }
  };

  // ═══════════════════════════════════════════
  // 10. HELPER: sbRpc (chamada direta REST)
  // ═══════════════════════════════════════════
  GGE.sbRpc = async function(fnName, params) {
    var url = window.GGE_SUPABASE_URL + '/rest/v1/rpc/' + fnName;
    var resp = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': window.GGE_SUPABASE_KEY,
        'Authorization': 'Bearer ' + window.GGE_SUPABASE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params || {})
    });
    if (!resp.ok) throw new Error('RPC ' + fnName + ' falhou: ' + resp.status);
    return await resp.json();
  };

  // ═══════════════════════════════════════════
  // 11. HELPER: sbQuery (REST query direta)
  // ═══════════════════════════════════════════
  GGE.sbQuery = async function(table, queryString) {
    var url = window.GGE_SUPABASE_URL + '/rest/v1/' + table;
    if (queryString) url += '?' + queryString;
    var resp = await fetch(url, {
      headers: {
        'apikey': window.GGE_SUPABASE_KEY,
        'Authorization': 'Bearer ' + window.GGE_SUPABASE_KEY
      }
    });
    if (!resp.ok) throw new Error('Query ' + table + ' falhou: ' + resp.status);
    return await resp.json();
  };

  console.log('[GGE] dados.js carregado');
})();
