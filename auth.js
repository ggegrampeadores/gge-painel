(function(){
  var SB="https://opceujqpqyvxsatzdarg.supabase.co";
  var SK="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wY2V1anFwcXl2eHNhdHpkYXJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NzIwMDEsImV4cCI6MjA4OTA0ODAwMX0.XKhgaNBJF8xiHiGEWEs8HL1dq5KFJpo2_RQckjsY9kc";
  var OWNER_KEY="gge2026";

  function getParam(k){var u=new URLSearchParams(window.location.search);return u.get(k);}

  function showGate(){
    document.body.innerHTML="";
    document.body.style.cssText="background:#0f1117;color:#e4e4e7;font-family:Inter,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;";
    var d=document.createElement("div");
    d.style.cssText="text-align:center;background:#1a1d27;border:1px solid #2a2d3a;border-radius:14px;padding:40px 48px;max-width:400px;";
    d.innerHTML='<div style="font-size:32px;margin-bottom:16px;">&#128274;</div><h2 style="margin-bottom:8px;">Acesso Restrito</h2><p style="color:#8b8fa3;font-size:14px;margin-bottom:24px;">Este painel requer autorização para acesso.</p><input id="authInput" type="password" placeholder="Digite a chave de acesso" style="width:100%;padding:12px;background:#0f1117;border:1px solid #2a2d3a;color:#e4e4e7;border-radius:8px;font-size:14px;margin-bottom:12px;outline:none;"><button id="authBtn" style="width:100%;padding:12px;background:#6366f1;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Entrar</button><p id="authErr" style="color:#ef4444;font-size:13px;margin-top:12px;display:none;">Chave inválida ou expirada</p>';
    document.body.appendChild(d);
    var inp=document.getElementById("authInput");
    var btn=document.getElementById("authBtn");
    var err=document.getElementById("authErr");
    btn.onclick=function(){tryAuth(inp.value.trim(),err);};
    inp.onkeydown=function(e){if(e.key==="Enter")tryAuth(inp.value.trim(),err);};
    inp.focus();
  }

  async function tryAuth(val,errEl){
    if(!val)return;
    if(val===OWNER_KEY){
      sessionStorage.setItem("gge_auth","owner");
      window.location.reload();
      return;
    }
    try{
      var r=await fetch(SB+"/rest/v1/access_tokens?token=eq."+encodeURIComponent(val)+"&ativo=eq.true&select=id,expira_em",{
        headers:{"apikey":SK,"Authorization":"Bearer "+SK}
      });
      var data=await r.json();
      if(data.length>0){
        var exp=new Date(data[0].expira_em);
        if(exp>new Date()){
          sessionStorage.setItem("gge_auth","token:"+val);
          fetch(SB+"/rest/v1/access_tokens?id=eq."+data[0].id,{
            method:"PATCH",headers:{"apikey":SK,"Authorization":"Bearer "+SK,"Content-Type":"application/json"},
            body:JSON.stringify({usado_em:new Date().toISOString()})
          });
          window.location.reload();
          return;
        }
      }
    }catch(e){}
    errEl.style.display="block";
  }

  async function checkAuth(){
    var s=sessionStorage.getItem("gge_auth");
    if(s==="owner")return true;
    if(s&&s.startsWith("token:")){
      var tk=s.substring(6);
      try{
        var r=await fetch(SB+"/rest/v1/access_tokens?token=eq."+encodeURIComponent(tk)+"&ativo=eq.true&select=expira_em",{
          headers:{"apikey":SK,"Authorization":"Bearer "+SK}
        });
        var data=await r.json();
        if(data.length>0&&new Date(data[0].expira_em)>new Date())return true;
      }catch(e){}
      sessionStorage.removeItem("gge_auth");
    }
    var urlToken=getParam("token");
    if(urlToken){
      try{
        var r2=await fetch(SB+"/rest/v1/access_tokens?token=eq."+encodeURIComponent(urlToken)+"&ativo=eq.true&select=id,expira_em",{
          headers:{"apikey":SK,"Authorization":"Bearer "+SK}
        });
        var data2=await r2.json();
        if(data2.length>0&&new Date(data2[0].expira_em)>new Date()){
          sessionStorage.setItem("gge_auth","token:"+urlToken);
          fetch(SB+"/rest/v1/access_tokens?id=eq."+data2[0].id,{
            method:"PATCH",headers:{"apikey":SK,"Authorization":"Bearer "+SK,"Content-Type":"application/json"},
            body:JSON.stringify({usado_em:new Date().toISOString()})
          });
          return true;
        }
      }catch(e){}
    }
    return false;
  }

  var origDisplay=document.body.style.display;
  document.body.style.display="none";
  checkAuth().then(function(ok){
    if(ok){document.body.style.display=origDisplay||"";}
    else{showGate();}
  });
})();