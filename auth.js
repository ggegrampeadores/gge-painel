/* Controle Total GGE — guarda de sessão.
   Sem dependências: lê a sessão que o supabase-js grava no localStorage,
   renova se o token expirou e manda para /login.html quando não há sessão válida.
   Deve ser carregado no <head> de toda página protegida. */
(function () {
  var REF = "opceujqpqyvxsatzdarg";
  var URL_BASE = "https://" + REF + ".supabase.co";
  var ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wY2V1anFwcXl2eHNhdHpkYXJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NzIwMDEsImV4cCI6MjA4OTA0ODAwMX0.XKhgaNBJF8xiHiGEWEs8HL1dq5KFJpo2_RQckjsY9kc";
  var STORE = "sb-" + REF + "-auth-token";

  // A própria tela de login não é protegida.
  if (/\/login\.html?$/.test(location.pathname)) return;

  function lerSessao() {
    try {
      var raw = localStorage.getItem(STORE);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (s && s.currentSession) s = s.currentSession; // formato antigo
      return s && s.access_token ? s : null;
    } catch (e) { return null; }
  }

  function payload(token) {
    try {
      var b = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(decodeURIComponent(escape(atob(b))));
    } catch (e) { return null; }
  }

  function gravar(s) { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) {} }

  function renovar(refresh) {
    return fetch(URL_BASE + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: { "apikey": ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh })
    }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  function paraLogin(extra) {
    var next = encodeURIComponent(location.pathname + location.search);
    location.replace("/login.html?" + (extra ? extra + "&" : "") + "next=" + next);
  }

  // Esconde a página enquanto verifica, para não piscar conteúdo.
  var estilo = document.createElement("style");
  estilo.id = "gge-auth-oculta";
  estilo.textContent = "body{visibility:hidden !important}";
  (document.head || document.documentElement).appendChild(estilo);

  function semAcesso(email) {
    var e = document.getElementById("gge-auth-oculta");
    if (e) e.remove();
    document.body.innerHTML =
      '<div style="font-family:Inter,-apple-system,sans-serif;background:#0f1117;color:#e4e4e7;' +
      'min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;margin:0">' +
      '<div style="max-width:420px;background:#1a1d27;border:1px solid #2a2d3a;border-radius:14px;padding:32px">' +
      '<h1 style="font-size:19px;margin:0 0 10px">Sem acesso ao painel</h1>' +
      '<p style="color:#8b8fa3;font-size:13.5px;line-height:1.5;margin:0 0 20px">O e-mail <b>' +
      String(email || "").replace(/[<>&]/g, "") +
      '</b> está autenticado, mas não está liberado no Controle Total. Peça a liberação a um administrador.</p>' +
      '<button onclick="window.ggeSair()" style="padding:10px 16px;background:#6366f1;color:#fff;border:0;' +
      'border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">Sair</button>' +
      "</div></div>";
  }

  // Estar autenticado não basta: o e-mail precisa constar em public.usuarios (ativo).
  function autorizado(token) {
    return fetch(URL_BASE + "/rest/v1/rpc/gge_autorizado", {
      method: "POST",
      headers: { "apikey": ANON, "Authorization": "Bearer " + token, "Content-Type": "application/json" },
      body: "{}"
    }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  function liberar(sessao) {
    window.GGE_SESSAO = sessao;
    var p = payload(sessao.access_token) || {};
    window.GGE_USUARIO = {
      id: p.sub,
      email: p.email,
      nome: (p.user_metadata && p.user_metadata.nome) || (p.email || "").split("@")[0],
      token: sessao.access_token
    };
    autorizado(sessao.access_token).then(function (ok) {
      // null = não deu para verificar (rede/função fora); não tranca a porta por falha de rede,
      // o RLS continua sendo a defesa real dos dados.
      if (ok === false) { semAcesso(p.email); return; }
      var e = document.getElementById("gge-auth-oculta");
      if (e) e.remove();
      document.dispatchEvent(new CustomEvent("gge:autenticado", { detail: window.GGE_USUARIO }));
    });
  }

  function verificar() {
    var s = lerSessao();
    if (!s) { paraLogin(); return; }

    var p = payload(s.access_token);
    if (!p) { paraLogin(); return; }

    if (p.user_metadata && p.user_metadata.must_change_password) { paraLogin("trocar=1"); return; }

    // margem de 60s para não liberar um token prestes a expirar
    if (p.exp && p.exp * 1000 > Date.now() + 60000) { liberar(s); return; }

    if (!s.refresh_token) { paraLogin(); return; }
    renovar(s.refresh_token).then(function (nova) {
      if (!nova || !nova.access_token) { paraLogin(); return; }
      gravar(nova);
      var np = payload(nova.access_token);
      if (np && np.user_metadata && np.user_metadata.must_change_password) { paraLogin("trocar=1"); return; }
      liberar(nova);
    });
  }

  verificar();

  // Utilitário para as páginas que chamam a API na mão.
  window.ggeAuthHeaders = function () {
    var s = window.GGE_SESSAO || lerSessao();
    var tk = s && s.access_token ? s.access_token : ANON;
    return { "apikey": ANON, "Authorization": "Bearer " + tk };
  };

  // Token do usuário logado (cai na chave anônima se ainda não houver sessão).
  window.ggeToken = function () {
    var s = window.GGE_SESSAO || lerSessao();
    return s && s.access_token ? s.access_token : ANON;
  };

  window.ggeSair = function () {
    try { localStorage.removeItem(STORE); } catch (e) {}
    location.replace("/login.html");
  };
})();
