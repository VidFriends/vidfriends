import { baseHead } from './base.js';

export function welcomePage() {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    ${baseHead('Welcome - VidFriends')}
    <style>
      .page{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
      .auth{width:100%;max-width:420px}
      .auth h1{margin-bottom:8px}
      .actions{display:flex;flex-direction:column;gap:8px;margin-top:12px}
    </style>
  </head>
  <body>
    <div class="page">
      <div class="auth">
        <h1>Welcome</h1>
        <form class="card" onsubmit="return false;">
          <label>Username</label>
          <input id="username" name="username" autocomplete="username" required />
          <div class="actions">
            <button type="button" id="btn-register-passkey">Register Passkey</button>
            <button type="button" class="secondary" id="btn-passkey-login">Log in with Passkey</button>
            <button type="button" class="secondary" id="btn-code-login">One-time code login</button>
          </div>
        </form>
      </div>
    </div>
    <script>
      (function(){
        function b64urlToBuf(b64){ b64=b64.replace(/-/g,'+').replace(/_/g,'/'); var pad='='.repeat((4 - (b64.length % 4)) % 4); var bin=atob(b64+pad); var out=new Uint8Array(bin.length); for (var i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i); return out.buffer; }
        function bufToB64url(buf){ var bytes = new Uint8Array(buf), bin=''; for (var i=0;i<bytes.length;i++) bin+=String.fromCharCode(bytes[i]); return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }

        async function registerPasskey(){
          try{
            var uname = (document.getElementById('username')||{}).value || '';
            var ro = await fetch('/passkeys/register/options', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify({ username: uname || null }) });
            if (!ro.ok) throw new Error('options');
            var o = await ro.json();
            o.challenge = b64urlToBuf(o.challenge);
            if (o.user && o.user.id) o.user.id = b64urlToBuf(o.user.id);
            if (uname) o.user.name = uname;
            var cred = await navigator.credentials.create({ publicKey: o });
            var payload = {
              id: cred.id,
              type: cred.type,
              rawId: bufToB64url(cred.rawId),
              response: {
                attestationObject: bufToB64url(cred.response.attestationObject),
                clientDataJSON: bufToB64url(cred.response.clientDataJSON)
              }
            };
            var v = await fetch('/passkeys/register/verify', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify(payload) });
            if (v.ok) { window.location.href = '/'; return; }
            alert('Passkey registration failed');
          }catch(e){ console.error(e); alert('Passkey registration failed'); }
        }

        async function signInWithPasskey(){
          try{
            var uname = (document.getElementById('username')||{}).value || '';
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

        function codeLogin(){
          // Placeholder: navigate or prompt for code; backend not implemented here
          window.location.href = '/login/code';
        }

        var regBtn = document.getElementById('btn-register-passkey');
        if (regBtn) regBtn.addEventListener('click', registerPasskey);
        var loginBtn = document.getElementById('btn-passkey-login');
        if (loginBtn) loginBtn.addEventListener('click', signInWithPasskey);
        var codeBtn = document.getElementById('btn-code-login');
        if (codeBtn) codeBtn.addEventListener('click', codeLogin);
      })();
    </script>
  </body>
</html>`;
}
