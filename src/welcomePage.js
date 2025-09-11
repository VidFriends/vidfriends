import { baseHead } from './base.js';

export function welcomePage(mode = 'signup') {
  const initialMode = mode === 'login' ? 'login' : 'signup';
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    ${baseHead('Welcome - VidFriends')}
    <style>
      .hero{padding-bottom:140px}
      .auth-sheet{position:fixed;left:0;right:0;bottom:0;background:var(--surface);border-top:1px solid #202a3b;border-top-left-radius:16px;border-top-right-radius:16px;box-shadow:0 -10px 30px rgba(0,0,0,0.35);padding:10px 12px 12px;z-index:30}
      .auth-tabs{display:flex;gap:8px;margin:4px 4px 10px}
      .auth-tabs button{flex:1;background:var(--muted);color:var(--text)}
      .auth-tabs button.active{background:var(--primary);color:#0a0d12}
      .auth-viewport{overflow:hidden;border:1px solid #202a3b;border-radius:12px;background:var(--surface)}
      .auth-slider{display:flex;width:200%;transition:transform 260ms ease}
      .auth-panel{width:50%;padding:14px}
      .spacer{height:env(safe-area-inset-bottom)}
    </style>
  </head>
  <body>
    <div class="container hero">
      <h1>Welcome to VidFriends</h1>
      <p style="color:var(--sub);margin-bottom:16px;">Share and watch videos with friends.</p>
    </div>
    <div class="auth-sheet" data-mode="${initialMode}">
      <div class="auth-tabs">
        <button type="button" data-mode="signup">Sign Up</button>
        <button type="button" data-mode="login" class="secondary">Log In</button>
      </div>
      <div class="auth-viewport">
        <div class="auth-slider" id="auth-slider">
          <div class="auth-panel" id="panel-signup">
            <form class="card" method="POST" action="/signup">
              <label>Username</label>
              <input name="username" autocomplete="username" required />
              <label>Password</label>
              <input name="password" type="password" autocomplete="new-password" required />
              <div style="margin-top:12px" class="row">
                <button type="submit">Create Account</button>
              </div>
            </form>
          </div>
          <div class="auth-panel" id="panel-login">
            <form class="card" method="POST" action="/login">
              <label>Username</label>
              <input name="username" autocomplete="username" required />
              <label>Password</label>
              <input name="password" type="password" autocomplete="current-password" required />
              <div style="margin-top:12px" class="row">
                <button type="submit">Sign In</button>
                <button type="button" class="secondary" id="btn-passkey-login">Use Passkey</button>
              </div>
            </form>
          </div>
        </div>
      </div>
      <div class="spacer"></div>
    </div>
    <script>
      (function(){
        var sheet = document.querySelector('.auth-sheet');
        var slider = document.getElementById('auth-slider');
        var tabBtns = document.querySelectorAll('.auth-tabs [data-mode]');
        function setMode(m){
          sheet.setAttribute('data-mode', m);
          for (var i=0;i<tabBtns.length;i++){
            tabBtns[i].classList.toggle('active', tabBtns[i].getAttribute('data-mode')===m);
          }
          if (m==='login'){ slider.style.transform='translateX(-50%)'; }
          else { slider.style.transform='translateX(0)'; }
        }
        for (var i=0;i<tabBtns.length;i++){
          tabBtns[i].addEventListener('click', function(){ setMode(this.getAttribute('data-mode')); });
        }
        // Initialize from server-provided mode
        setMode('${initialMode}');

        // Passkey sign-in
        function b64urlToBuf(b64){ b64=b64.replace(/-/g,'+').replace(/_/g,'/'); var pad='='.repeat((4 - (b64.length % 4)) % 4); var bin=atob(b64+pad); var out=new Uint8Array(bin.length); for (var i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i); return out.buffer; }
        function bufToB64url(buf){ var bytes = new Uint8Array(buf), bin=''; for (var i=0;i<bytes.length;i++) bin+=String.fromCharCode(bytes[i]); return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
        async function signInWithPasskey(){
          try{
            var uname = (document.querySelector('#panel-login input[name="username"]')||{}).value || '';
            var r = await fetch('/passkeys/auth/options', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify({ username: uname || null }) });
            if (!r.ok) throw new Error('options');
            var o = await r.json();
            o.challenge = b64urlToBuf(o.challenge);
            if (o.allowCredentials){ for (var i=0;i<o.allowCredentials.length;i++){ o.allowCredentials[i].id = b64urlToBuf(o.allowCredentials[i].id); } }
            var cred = await navigator.credentials.get({ publicKey: o });
            var payload = {
              id: cred.id,
              type: cred.type,
              rawId: bufToB64url(cred.rawId),
              response: {
                authenticatorData: bufToB64url(cred.response.authenticatorData),
                clientDataJSON: bufToB64url(cred.response.clientDataJSON),
                signature: bufToB64url(cred.response.signature),
                userHandle: cred.response.userHandle ? bufToB64url(cred.response.userHandle) : null
              }
            };
            var v = await fetch('/passkeys/auth/verify', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify(payload) });
            if (v.ok) { window.location.href = '/'; return; }
            alert('Passkey sign-in failed');
          }catch(e){ console.error(e); alert('Passkey sign-in failed'); }
        }
        var btn = document.getElementById('btn-passkey-login');
        if (btn) btn.addEventListener('click', signInWithPasskey);
      })();
    </script>
  </body>
</html>`;
}

