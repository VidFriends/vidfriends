function getCookie(req, name) {
  const cookie = req.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp('(^|;)\\s*' + name + '=([^;]+)'));
  return match ? match.pop() : null;
}

function bufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBuffer(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  const hash = new Uint8Array(derivedBits);
  return `${bufferToBase64(salt)}:${bufferToBase64(hash)}`;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

async function verifyPassword(password, stored) {
  const [saltB64, hashB64] = stored.split(':');
  if (!saltB64 || !hashB64) return false;
  const salt = base64ToBuffer(saltB64);
  const hash = base64ToBuffer(hashB64);
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    hash.length * 8
  );
  const derived = new Uint8Array(derivedBits);
  return timingSafeEqual(hash, derived);
}

function baseHead(title) {
  const styles = `:root{--bg:#0b0f17;--surface:#121826;--muted:#1a2333;--text:#e6edf3;--sub:#a5b1c2;--primary:#6aa1ff;--accent:#19c37d;--danger:#ff5c5c;}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
.container{max-width:720px;margin:0 auto;padding:16px 16px 84px}
h1,h2,h3{margin:0 0 12px 0;font-weight:650}
nav{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
.fab{position:fixed;right:16px;bottom:16px;width:60px;height:60px;border-radius:50%;background:#0e1524;border:1px solid #202a3b;display:flex;align-items:center;justify-content:center;color:#fff;text-decoration:none;font-size:24px;box-shadow:0 6px 24px rgba(0,0,0,0.35);z-index:30}
.tabs{display:flex;gap:0;border-bottom:1px solid #202a3b;margin:8px 0 12px}
.tabs a{flex:1;text-align:center;padding:10px 12px;color:var(--sub);text-decoration:none;border:1px solid #202a3b;border-bottom:none;border-top-left-radius:12px;border-top-right-radius:12px;background:var(--surface)}
.tabs a.active{background:var(--muted);color:var(--text);font-weight:650}
button,.btn{appearance:none;border:0;border-radius:10px;padding:10px 14px;background:var(--primary);color:#0a0d12;font-weight:600;cursor:pointer}
button.secondary{background:var(--muted);color:var(--text)}
button.danger{background:var(--danger);color:#0a0d12}
input,select{width:100%;max-width:100%;background:var(--surface);border:1px solid #2a3446;color:var(--text);border-radius:10px;padding:10px}
label{display:block;font-size:14px;color:var(--sub);margin:8px 0 4px}
form.card{background:var(--surface);border:1px solid #202a3b;border-radius:12px;padding:16px}
section{background:var(--surface);border:1px solid #202a3b;border-radius:12px;padding:16px;margin-top:16px}
ul{list-style:none;padding:0;margin:0}
li{padding:12px;border:1px solid #202a3b;border-radius:10px;background:var(--muted);margin:10px 0}
a{color:var(--primary);text-decoration:none}
a:hover{text-decoration:underline}
video{width:100%;height:auto;border-radius:10px;background:#000}
.scroll-feed{scroll-snap-type:y mandatory;height:100vh;overflow-y:auto;padding-bottom:84px;margin:0}
.scroll-item{scroll-snap-align:start;position:relative;height:100vh}
.scroll-item video{width:100%;height:100%;object-fit:cover;border-radius:0}
.react-menu{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(18,24,38,0.96);border:1px solid #202a3b;border-radius:12px;padding:12px;display:none;z-index:3;min-width:240px}
.react-menu button{margin:4px 6px 0 0}
.react-backdrop{display:none;position:absolute;inset:0;background:rgba(0,0,0,0.25);z-index:2;border-radius:0}
.play-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:1}
.play-btn{width:74px;height:74px;border-radius:50%;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;color:#fff;font-size:30px;box-shadow:0 2px 12px rgba(0,0,0,0.4)}
.row{display:flex;gap:8px;flex-wrap:wrap}
.row > *{flex:1 1 160px}
@media (min-width:480px){.row > *{flex:1}}
@media (max-width:480px){body{font-size:15px}}
`;
  return `
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#0b0f17" />
    <title>${escapeHtml(title)}</title>
    <link rel="icon" type="image/svg+xml" href="https://assets.vidfriends.app/favicon/favicon.svg">
    <link rel="icon" type="image/png" sizes="96x96" href="https://assets.vidfriends.app/favicon/favicon-96x96.png">
    <link rel="shortcut icon" href="https://assets.vidfriends.app/favicon/favicon.ico">
    <link rel="apple-touch-icon" href="https://assets.vidfriends.app/favicon/apple-touch-icon.png">
    <link rel="manifest" href="/site.webmanifest">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <style>${styles}</style>
    <script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}</script>
  `;
}

function loginPage() {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    ${baseHead('Login - VidFriends')}
  </head>
  <body>
    <div class="container">
      <h1>Login</h1>
      <form class="card" method="POST" action="/login">
        <label>Username</label>
        <input name="username" autocomplete="username" required />
        <label>Password</label>
        <input name="password" type="password" autocomplete="current-password" required />
        <div style="margin-top:12px" class="row">
          <button type="submit">Sign In</button>
          <a class="btn secondary" href="/signup">Create an account</a>
        </div>
      </form>
    </div>
  </body>
 </html>`;
}

function signupPage() {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    ${baseHead('Sign Up — VidFriends')}
  </head>
  <body>
    <div class="container">
      <h1>Sign Up</h1>
      <form class="card" method="POST" action="/signup">
        <label>Username</label>
        <input name="username" autocomplete="username" required />
        <label>Password</label>
        <input name="password" type="password" autocomplete="new-password" required />
        <div style="margin-top:12px" class="row">
          <button type="submit">Create Account</button>
          <a class="btn secondary" href="/login">Back to login</a>
        </div>
      </form>
    </div>
  </body>
 </html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}



function homePage(username, opts = {}) {
  const { outgoing = [], incoming = [], approved = [], inbox = [], sent = [] } = opts;
  const hasPending = incoming.length > 0 || outgoing.some((o) => o.status === 'pending');
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    ${baseHead('VidFriends')}
    <script>
      function toggleAddFriend() {
        var f = document.getElementById('add-friend-form');
        f.style.display = f.style.display === 'none' ? 'block' : 'none';
        if (f.style.display === 'block') document.getElementById('friend_username').focus();
      }
      async function registerPush() {
        try {
          if (!('serviceWorker' in navigator)) return;
          var reg = await navigator.serviceWorker.ready;
          var r = await fetch('/push/vapid');
          var j = await r.json();
          if (!j || !j.publicKey) return;
          var b64 = j.publicKey;
          function b64ToBytes(b64){ b64=b64.replace(/-/g,'+').replace(/_/g,'/'); var pad='='.repeat((4 - (b64.length % 4)) % 4); var bin=atob(b64+pad); var out=new Uint8Array(bin.length); for (var i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i); return out; }
          var sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(b64) });
          await fetch('/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub) });
        } catch (e) {}
      }
      async function ensureNotifications() {
        try {
          if (!('Notification' in window)) return;
          if (Notification.permission === 'granted') { await registerPush(); return; }
          if (Notification.permission === 'default') {
            var perm = await Notification.requestPermission();
            if (perm === 'granted') { await registerPush(); }
          }
        } catch (e) {}
      }
      document.addEventListener('DOMContentLoaded', function(){
        ensureNotifications();
        var vids = document.querySelectorAll('video.asset-video');
        for (var k = 0; k < vids.length; k++) {
          (function(v){
            var linkId = v.getAttribute('data-link-id');
            v.addEventListener('play', function(){
              if (v.getAttribute('data-played') !== '1') {
                v.setAttribute('data-played','1');
                var fd = new FormData();
                fd.append('link_id', linkId);
                fetch('/links/watched', { method: 'POST', body: fd, credentials: 'same-origin' });
              }
            });
          })(vids[k]);
        }

        // no scroll feed behavior on home screen
      });
    </script>
  </head>
  <body>
    <div class="container">
      <h1>VidFriends</h1>
      <p>Logged in as <strong>${escapeHtml(username)}</strong></p>
      <nav>
        <a href="/saved"><button type="button" class="secondary">Saved</button></a>
        <a href="/history"><button type="button" class="secondary">History</button></a>
      </nav>
      <nav class="tabs">
        <a href="/?tab=home" class="${activeTab==='home'?'active':''}">Home</a>
        <a href="/?tab=scroll" class="${activeTab==='scroll'?'active':''}">Scroll</a>
      </nav>
      <button type="button" class="secondary" onclick="toggleAddFriend()">Add Friend</button>
      <form class="card" id="add-friend-form" method="POST" action="/friends/add" style="display:none;margin-top:8px;">
        <label>Friend's username</label>
        <input id="friend_username" name="friend_username" placeholder="friend's username" required />
        <div style="margin-top:8px"><button type="submit">Add</button></div>
      </form>

    ${approved.length ? `
    <section style="margin-top:16px;">
      <h2>Send a Video</h2>
      <form method="POST" action="/links/send">
        <input name="video_url" placeholder="https://example.com/video" style="min-width:300px;" required />
        <select name="recipient_id" required>
          <option value="">Select friend…</option>
          ${approved
            .map((f) => `<option value="${escapeHtml(f.user_id)}">${escapeHtml(f.username)}</option>`) 
            .join('')}
        </select>
        <button type="submit">Send</button>
      </form>
    </section>
    ` : ''}

    ${activeTab==='scroll' ? `
    <section>
      <h2>Scroll</h2>
      <div class="scroll-feed">
        ${inbox.map(v => `
          <div class="scroll-item" data-link-id="${escapeHtml(v.id)}">
            <div class="react-backdrop"></div>
            <video class="asset-video" data-link-id="${escapeHtml(v.id)}" autoplay muted playsinline preload="metadata">
              <source src="https://assets.vidfriends.app/videos/${escapeHtml(v.id)}.mp4" type="video/mp4">
            </video>
            <div class="react-menu">
              <button data-react="??" title="Heart">??</button>
              <button data-react="??" title="Thumbs up">??</button>
            </div>
            <div style="color:var(--sub);margin-top:6px">from <strong>${escapeHtml(v.sender_username)}</strong>${v.reaction ? ` — Your reaction: ${escapeHtml(v.reaction)}` : ''}</div>
          </div>
        `).join('')}
      </div>
    </section>
    ` : ''}

    ${hasPending ? `
    <section>
      <h2>Friend Requests</h2>
      ${incoming.length ? `
      <h3>Incoming</h3>
      <ul>
        ${incoming
          .map(
            (r) => `
          <li>
            <strong>${escapeHtml(r.username)}</strong>
            <form method="POST" action="/friends/respond" style="display:inline; margin-left:8px;">
              <input type="hidden" name="other_user_id" value="${escapeHtml(r.user_id)}" />
              <button name="action" value="accept">Accept</button>
              <button name="action" value="decline">Decline</button>
            </form>
          </li>`
          )
          .join('')}
      </ul>` : ''}
      ${outgoing.some((o) => o.status === 'pending') ? `
      <h3>Outgoing</h3>
      <ul>
        ${outgoing.filter((r)=> r.status === 'pending')
          .map(
            (r) => `
          <li>
            <strong>${escapeHtml(r.username)}</strong> — pending
          </li>`
          )
          .join('')}
      </ul>` : ''}
    </section>
    ` : ''}

    ${outgoing.some((o) => o.status === 'declined') ? `
    <section>
      <h2>Recent Responses</h2>
      <ul>
        ${outgoing.filter((r)=> r.status === 'declined')
          .map((r) => `
            <li><strong>${escapeHtml(r.username)}</strong> — declined</li>
          `).join('')}
      </ul>
    </section>
    ` : ''}

    ${inbox.length ? `
    <section style="display:none">
      <h2>Videos Shared With You</h2>
      <ul>
        ${inbox
          .map(
            (v) => `
          <li>
            <video class="asset-video" data-link-id="${escapeHtml(v.id)}" width="360" height="203" controls preload="metadata">
              <source src="https://assets.vidfriends.app/videos/${escapeHtml(v.id)}.mp4" type="video/mp4">
              Your browser does not support the video tag.
            </video>
            - from <strong>${escapeHtml(v.sender_username)}</strong>
            <form method="POST" action="/links/react" style="display:inline; margin-left:8px;">
              <input type="hidden" name="link_id" value="${escapeHtml(v.id)}" />
              <button type="submit" name="reaction" value="??" title="Heart">??</button>
            </form>
            <form method="POST" action="/links/react" style="display:inline; margin-left:4px;">
              <input type="hidden" name="link_id" value="${escapeHtml(v.id)}" />
              <button type="submit" name="reaction" value="??" title="Thumbs up">??</button>
            </form>
            <form method="POST" action="/links/react" style="display:inline; margin-left:8px;">
              <input type="hidden" name="link_id" value="${escapeHtml(v.id)}" />
              <input name="reaction_text" placeholder="Add reaction" />
              <button type="submit">Send</button>
            </form>
            ${v.reaction ? ` - Your reaction: ${escapeHtml(v.reaction)}` : ''}
            <form method="POST" action="/links/save" style="display:inline; margin-left:8px;">
              <input type="hidden" name="link_id" value="${escapeHtml(v.id)}" />
              <input type="hidden" name="set" value="${v.saved ? '0' : '1'}" />
              <button>${v.saved ? 'Unsave' : 'Save'}</button>
            </form>
          </li>`
          )
          .join('')}
      </ul>
    </section>
    ` : ''}

    ${sent.length ? `
    <section>
      <h2>Videos You Sent</h2>
      <ul>
        ${sent
          .map(
            (s) => `
          <li>
            <a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.url)}</a>
            — to <strong>${escapeHtml(s.recipient_username)}</strong>
            — Watched: ${s.watched ? 'Yes' : 'No'}
            — Reaction: ${s.reaction ? escapeHtml(s.reaction) : '-'}
            <form method="POST" action="/links/unsend" style="display:inline; margin-left:8px;">
              <input type="hidden" name="link_id" value="${escapeHtml(s.id)}" />
              <button>Unsend</button>
            </form>
          </li>`
          )
          .join('')}
      </ul>
    </section>
    ` : ''}

    ${approved.length ? `
    <section>
      <h2>Friends</h2>
      <ul>
        ${approved
          .map(
            (f) => `
          <li>
            <strong>${escapeHtml(f.username)}</strong>
            <form method="POST" action="/friends/block" style="display:inline; margin-left:8px;">
              <input type="hidden" name="other_user_id" value="${escapeHtml(f.user_id)}" />
              <button>Block</button>
            </form>
            <form method="POST" action="/friends/remove" style="display:inline; margin-left:4px;">
              <input type="hidden" name="other_user_id" value="${escapeHtml(f.user_id)}" />
              <button>Remove</button>
            </form>
          </li>`
          )
          .join('')}
      </ul>
    </section>
    ` : ''}

    <form method="POST" action="/logout">
      <button type="submit" class="secondary">Logout</button>
    </form>
    </div>
    <a href="/scroll" class="fab" aria-label="Inbox">??</a>
  </body>
</html>`;
}

function welcomePage() {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    ${baseHead('Welcome — VidFriends')}
  </head>
  <body>
    <div class="container">
      <h1>Welcome to VidFriends</h1>
      <p style="color:var(--sub);margin-bottom:16px;">Share and watch videos with friends.</p>
      <nav>
        <a href="/signup"><button>Sign Up</button></a>
        <a href="/login"><button class="secondary">Log In</button></a>
      </nav>
    </div>
  </body>
</html>`;
}

function scrollPage(username, list) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    ${baseHead('Scroll - VidFriends')}
    <style>
      body{background:#000}
    </style>
    <script>
      document.addEventListener('DOMContentLoaded', function(){
        // Replace placeholder labels with emoji for compatibility in all encodings
        try {
          var ups = document.querySelectorAll('.react-menu button[title="Thumbs up"]');
          for (var i0=0;i0<ups.length;i0++){ ups[i0].textContent='\uD83D\uDC4D'; ups[i0].setAttribute('data-react','\uD83D\uDC4D'); }
          var hearts = document.querySelectorAll('.react-menu button[title="Heart"]');
          for (var j0=0;j0<hearts.length;j0++){ hearts[j0].textContent='\u2764\uFE0F'; hearts[j0].setAttribute('data-react','\u2764\uFE0F'); }
        } catch(_){}
        var items = document.querySelectorAll('.scroll-item');
        for (var i=0;i<items.length;i++){
          (function(item){
            var v = item.querySelector('video');
            var overlay = item.querySelector('.play-overlay');
            var menu = item.querySelector('.react-menu');
            var backdrop = item.querySelector('.react-backdrop');
            var lastTap = 0; var singleTimer = null;
            function showOverlay(show){ if (!overlay) return; overlay.style.display = show ? 'flex' : 'none'; }
            function openMenu(){ if (menu) menu.style.display='block'; if (backdrop) backdrop.style.display='block'; }
            function closeMenu(){ if (menu) menu.style.display='none'; if (backdrop) backdrop.style.display='none'; }
            function togglePlay(){ if (!v) return; if (v.paused) { v.play().catch(function(){}); } else { v.pause(); } }
            if (v){
              v.addEventListener('play', function(){
                showOverlay(false);
                var linkId = v.getAttribute('data-link-id');
                if (linkId && v.getAttribute('data-played') !== '1'){
                  v.setAttribute('data-played','1');
                  var fd=new FormData(); fd.append('link_id', linkId);
                  fetch('/links/watched', { method:'POST', body: fd, credentials:'same-origin' });
                }
              });
              v.addEventListener('pause', function(){ showOverlay(true); });
              v.addEventListener('click', function(){
                var now = Date.now();
                if (now - lastTap < 300) {
                  clearTimeout(singleTimer); lastTap = 0; openMenu();
                } else {
                  lastTap = now;
                  clearTimeout(singleTimer);
                  singleTimer = setTimeout(togglePlay, 275);
                }
              });
            }
            if (backdrop){ backdrop.addEventListener('click', closeMenu); }
            // Reactions
            item.addEventListener('click', function(e){
              var btn = e.target.closest('[data-react]');
              if (!btn) return;
              var linkId = item.getAttribute('data-link-id');
              var val = btn.getAttribute('data-react');
              var fd = new FormData(); fd.append('link_id', linkId); fd.append('reaction', val);
              fetch('/links/react', { method:'POST', body: fd, credentials:'same-origin' }).then(function(){ closeMenu(); });
            });
            item.addEventListener('click', function(e){
              var sbtn = e.target.closest('[data-react-send]');
              if (!sbtn) return;
              var linkId = item.getAttribute('data-link-id');
              var input = item.querySelector('.react-input');
              var text = input && input.value ? input.value.trim() : '';
              if (!text) return;
              var fd = new FormData(); fd.append('link_id', linkId); fd.append('reaction_text', text);
              fetch('/links/react', { method:'POST', body: fd, credentials:'same-origin' }).then(function(){ input.value=''; closeMenu(); });
            });
            item.addEventListener('click', function(e){
              var sv = e.target.closest('[data-save]');
              if (!sv) return;
              var linkId = item.getAttribute('data-link-id');
              var setv = sv.getAttribute('data-save');
              var fd = new FormData(); fd.append('link_id', linkId); fd.append('set', setv);
              fetch('/links/save', { method:'POST', body: fd, credentials:'same-origin' }).then(function(){ closeMenu(); });
            });
          })(items[i]);
        }
      });
    </script>
  </head>
  <body>
    <div class="scroll-feed">
      ${list.map(v => `
        <div class=\"scroll-item\" data-link-id=\"${escapeHtml(v.id)}\">\n          <video class=\"asset-video\" data-link-id=\"${escapeHtml(v.id)}\" playsinline preload=\"metadata\">\n            <source src=\"https://assets.vidfriends.app/videos/${escapeHtml(v.id)}.mp4\" type=\"video/mp4\">\n          </video>\n          <div class=\"play-overlay\"><div class=\"play-btn\">&#9658;</div></div>\n          <div class=\"react-backdrop\"></div>\n          <div class=\"react-menu\">\n            <div>\n              <button data-react=\"??\" title=\"Thumbs up\">??</button>
              <button data-react=\"??\" title=\"Heart\">??</button>
            </div>
            <div class=\"row\" style=\"margin-top:8px\">\n              <input class=\"react-input\" placeholder=\"Add reaction\" />\n              <button data-react-send>Send</button>\n            </div>
            <div class=\"row\" style=\"margin-top:8px\">\n              <button class=\"secondary\" data-save=\"${v.saved ? '0' : '1'}\">${v.saved ? 'Unsave' : 'Save'}</button>
              <a class=\"btn secondary\" href=\"https://assets.vidfriends.app/videos/${escapeHtml(v.id)}.mp4\" download target=\"_blank\" rel=\"noopener noreferrer\">Download</a>
            </div>
          </div>\n        </div>
      `).join('')}
    </div>
    <a href="/" class="fab" aria-label="Home">??</a>
  </body>
</html>`;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    function applySecurityHeaders(headers) {
      try {
        // Avoid unsupported Privacy Sandbox features to silence console warnings
        headers.set('Permissions-Policy', 'accelerometer=(), autoplay=(), camera=(), encrypted-media=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()');
        // Light, broadly compatible security headers
        headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
        headers.set('X-Content-Type-Options', 'nosniff');
      } catch (_) {}
      return headers;
    }

    if (req.method === 'GET' && url.pathname === '/welcome') {
      const headers = applySecurityHeaders(new Headers({ 'Content-Type': 'text/html;charset=UTF-8' }));
      return new Response(welcomePage(), { headers });
    }

    if (req.method === 'GET' && url.pathname === '/login') {
      const headers = applySecurityHeaders(new Headers({ 'Content-Type': 'text/html;charset=UTF-8' }));
      return new Response(loginPage(), { headers });
    }

    // Favicon and manifest endpoints
    if (req.method === 'GET' && url.pathname === '/favicon.ico') {
      return Response.redirect('https://assets.vidfriends.app/favicon/favicon.ico', 302);
    }
    if (req.method === 'GET' && url.pathname === '/favicon.svg') {
      return Response.redirect('https://assets.vidfriends.app/favicon/favicon.svg', 302);
    }
    if (req.method === 'GET' && url.pathname === '/apple-touch-icon.png') {
      return Response.redirect('https://assets.vidfriends.app/favicon/apple-touch-icon.png', 302);
    }
    if (req.method === 'GET' && url.pathname === '/favicon-96x96.png') {
      return Response.redirect('https://assets.vidfriends.app/favicon/favicon-96x96.png', 302);
    }
    if (req.method === 'GET' && url.pathname === '/site.webmanifest') {
      const manifest = {
        name: 'VidFriends',
        short_name: 'VidFriends',
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0b0f17',
        theme_color: '#0b0f17',
        description: 'Share and watch videos with friends',
        icons: [
          { src: 'https://assets.vidfriends.app/favicon/web-app-manifest-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'https://assets.vidfriends.app/favicon/web-app-manifest-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
        screenshots: [
          { src: 'https://assets.vidfriends.app/pwa/screenshot-1.png', sizes: '1080x1920', type: 'image/png', form_factor: 'narrow' }
        ]
      };
      return new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/manifest+json' } });
    }

    // Minimal service worker to enable installability & light caching
    if (req.method === 'GET' && url.pathname === '/sw.js') {
      const sw = `self.addEventListener('install', (e)=>{self.skipWaiting(); e.waitUntil(caches.open('vf-v1').then(c=>c.addAll(['/','/saved','/history','/scroll'])))});
self.addEventListener('activate', (e)=>{clients.claim()});
self.addEventListener('fetch', (event)=>{
  const req = event.request;
  const url = new URL(req.url);
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(()=>caches.match('/')));
    return;
  }
  if (url.hostname === 'assets.vidfriends.app' && !url.pathname.startsWith('/videos/')) {
    event.respondWith(caches.open('vf-asset').then(async (cache)=>{const cached=await cache.match(req); const resp=fetch(req).then(r=>{cache.put(req,r.clone()).catch(()=>{}); return r}); return cached||resp;}));
  }
});
self.addEventListener('push', (event)=>{
  event.waitUntil((async ()=>{
    try{
      const r = await fetch('/push/inbox', { credentials: 'include' });
      if (!r.ok) return;
      const list = await r.json();
      for (const n of list) {
        await self.registration.showNotification(n.title||'VidFriends', { body: n.body||'', data: n.data||{}, icon: 'https://assets.vidfriends.app/favicon/android-chrome-192x192.png', badge: 'https://assets.vidfriends.app/favicon/android-chrome-192x192.png' });
      }
    }catch(e){}
  })());
});
self.addEventListener('notificationclick', (event)=>{
  event.notification.close();
  const data = event.notification && event.notification.data || {};
  const url = data && data.type === 'new_video' && data.link_id ? '/?open='+encodeURIComponent(data.link_id) : '/';
  event.waitUntil(clients.matchAll({ type:'window', includeUncontrolled:true }).then((cl)=>{
    for (const c of cl) { if ('focus' in c) { c.navigate(url); return c.focus(); } }
    if (clients.openWindow) return clients.openWindow(url);
  }));
});`;
      return new Response(sw, { headers: { 'Content-Type': 'application/javascript' } });
    }

    if (req.method === 'POST' && url.pathname === '/login') {
      return handleLogin(req, env);
    }

    if (req.method === 'GET' && url.pathname === '/signup') {
      const headers = applySecurityHeaders(new Headers({ 'Content-Type': 'text/html;charset=UTF-8' }));
      return new Response(signupPage(), { headers });
    }

    if (req.method === 'POST' && url.pathname === '/signup') {
      return handleSignup(req, env);
    }

    if (req.method === 'GET' && url.pathname === '/') {
      return handleHome(req, env);
    }

    if (req.method === 'GET' && url.pathname === '/scroll') {
      return handleScroll(req, env);
    }

    if (req.method === 'GET' && url.pathname === '/saved') {
      return handleSaved(req, env);
    }

    if (req.method === 'GET' && url.pathname === '/history') {
      return handleHistory(req, env);
    }

    // Push notification endpoints
    if (req.method === 'GET' && url.pathname === '/push/vapid') {
      const pk = env.VAPID_PUBLIC_KEY || '';
      if (!pk) return new Response(JSON.stringify({ error: 'vapid not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify({ publicKey: pk }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (req.method === 'POST' && url.pathname === '/push/subscribe') {
      return handlePushSubscribe(req, env);
    }
    if (req.method === 'GET' && url.pathname === '/push/inbox') {
      return handlePushInbox(req, env);
    }

    if (req.method === 'POST' && url.pathname === '/logout') {
      return handleLogout(req, env);
    }

    if (req.method === 'POST' && url.pathname === '/auth/refresh') {
      return handleRefresh(req, env);
    }

    // Passkey routes removed

    if (req.method === 'GET' && url.pathname === '/links/open') {
      return handleLinkOpen(req, env);
    }

    if (req.method === 'POST' && url.pathname === '/share') {
      // expecting JSON body: { sender, recipient, url }
      const { sender, recipient, url: sharedUrl } = await req.json();

      if (!sender || !recipient || !sharedUrl) {
        return new Response(
          JSON.stringify({ error: 'sender, recipient and url are required' }),
          { status: 400 }
        );
      }

      try {
        await env.vidshare
          .prepare('INSERT INTO links (sender_id, recipient_id, url) VALUES (?1, ?2, ?3)')
          .bind(sender, recipient, sharedUrl)
          .run();

        return new Response(JSON.stringify({ success: true }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: 'database error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    if (req.method === 'POST' && url.pathname === '/links/send') {
      return handleLinkSend(req, env, ctx);
    }

    if (req.method === 'POST' && url.pathname === '/links/react') {
      return handleLinkReact(req, env, ctx);
    }
    if (req.method === 'POST' && url.pathname === '/links/unsend') {
      return handleLinkUnsend(req, env);
    }
    if (req.method === 'POST' && url.pathname === '/links/save') {
      return handleLinkSave(req, env);
    }
    if (req.method === 'POST' && url.pathname === '/links/watched') {
      return handleLinkWatched(req, env);
    }

    if (req.method === 'POST' && url.pathname === '/friends/add') {
      return handleFriendAdd(req, env);
    }
    if (req.method === 'POST' && url.pathname === '/friends/respond') {
      return handleFriendRespond(req, env);
    }
    if (req.method === 'POST' && url.pathname === '/friends/remove') {
      return handleFriendRemove(req, env);
    }
    if (req.method === 'POST' && url.pathname === '/friends/block') {
      return handleFriendBlock(req, env);
    }

    return new Response('Not Found', { status: 404 });
  },
};

async function handleSignup(req, env) {
  const form = await req.formData();
  const username = form.get('username');
  const password = form.get('password');
  if (!username || !password) {
    return new Response('Invalid input', { status: 400 });
  }
  // Ensure username is not taken (case-insensitive)
  const existing = await env.vidshare
    .prepare('SELECT id FROM users WHERE lower(username) = lower(?1)')
    .bind(username)
    .first();
  if (existing) return new Response('Username taken', { status: 409 });
  const now = Math.floor(Date.now() / 1000);
  const userId = crypto.randomUUID();
  const credId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const hash = await hashPassword(password);
  const ua = req.headers.get('User-Agent') || '';
  const expiresAt = now + 60 * 24 * 60 * 60; // 60 days
  const refreshToken = randomTokenB64(32);
  const refreshHash = await sha256B64(refreshToken);
  const jwt = await createJWT({ sub: userId, username, iat: now, exp: now + 15 * 60 }, env);

  await env.vidshare
    .prepare('INSERT INTO users (id, username, created_at, last_login) VALUES (?1, ?2, ?3, ?4)')
    .bind(userId, username, now, now)
    .run();

  await env.vidshare
    .prepare(
      'INSERT INTO credentials (id, user_id, type, identifier, secret_hash, created_at, last_used) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
    )
    .bind(credId, userId, 'username_pw', username, hash, now, now)
    .run();

  await env.vidshare
    .prepare(
      'INSERT INTO sessions (id, user_id, refresh_hash, created_at, expires_at, user_agent, last_rotated_at, rotation_count) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)'
    )
    .bind(sessionId, userId, refreshHash, now, expiresAt, ua, now, 0)
    .run();

  const isHttps = (new URL(req.url)).protocol === 'https:';
  const headers = new Headers({ Location: '/' });
  headers.append('Set-Cookie', cookie('session', sessionId, { httpOnly: true, sameSite: 'Lax', path: '/', secure: isHttps }));
  headers.append('Set-Cookie', cookie('jwt', jwt, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 15 * 60, secure: isHttps }));
  headers.append('Set-Cookie', cookie('refresh', refreshToken, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 60 * 24 * 60 * 60, secure: isHttps }));
  return new Response(null, { status: 302, headers });
}

async function handleLogin(req, env) {
  if (!env || !env.vidshare) {
    return new Response('Database unavailable', { status: 500 });
  }
  const form = await req.formData();
  const username = form.get('username');
  const password = form.get('password');
  if (!username || !password) {
    return new Response('Invalid input', { status: 400 });
  }
  const cred = await env.vidshare
    .prepare(
      'SELECT credentials.id as cred_id, credentials.secret_hash, users.id as user_id, users.username as username FROM credentials JOIN users ON credentials.user_id = users.id WHERE credentials.type = ?1 AND credentials.identifier = ?2'
    )
    .bind('username_pw', username)
    .first();
  if (!cred || !(await verifyPassword(password, cred.secret_hash))) {
    return new Response('Unauthorized', { status: 401 });
  }
  const now = Math.floor(Date.now() / 1000);
  await env.vidshare
    .prepare('UPDATE credentials SET last_used = ?1 WHERE id = ?2')
    .bind(now, cred.cred_id)
    .run();
  await env.vidshare
    .prepare('UPDATE users SET last_login = ?1 WHERE id = ?2')
    .bind(now, cred.user_id)
    .run();
  const sessionId = crypto.randomUUID();
  const ua = req.headers.get('User-Agent') || '';
  const expiresAt = now + 60 * 24 * 60 * 60; // 60 days
  const refreshToken = randomTokenB64(32);
  const refreshHash = await sha256B64(refreshToken);
  const jwt = await createJWT({ sub: cred.user_id, username: cred.username, iat: now, exp: now + 15 * 60 }, env);
  await env.vidshare
    .prepare(
      'INSERT INTO sessions (id, user_id, refresh_hash, created_at, expires_at, user_agent, last_rotated_at, rotation_count) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)'
    )
    .bind(sessionId, cred.user_id, refreshHash, now, expiresAt, ua, now, 0)
    .run();
  const isHttps = (new URL(req.url)).protocol === 'https:';
  const headers = new Headers({ Location: '/' });
  headers.append('Set-Cookie', cookie('session', sessionId, { httpOnly: true, sameSite: 'Lax', path: '/', secure: isHttps }));
  headers.append('Set-Cookie', cookie('jwt', jwt, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 15 * 60, secure: isHttps }));
  headers.append('Set-Cookie', cookie('refresh', refreshToken, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 60 * 24 * 60 * 60, secure: isHttps }));
  return new Response(null, { status: 302, headers });
}

async function handleHome(req, env) {
  // Prefer JWT; only fall back to DB when claim missing
  const jwtToken = getCookie(req, 'jwt');
  const u = new URL(req.url);
  if (jwtToken) {
    try {
      const payload = await verifyJWT(jwtToken, env);
      const nameFromJwt = payload && payload.username;
      const idFromJwt = payload && payload.sub;
      if (nameFromJwt && idFromJwt && env && env.vidshare) {
        const lists = await fetchFriendLists(env, idFromJwt);
        const inbox = await fetchInboxLinks(env, idFromJwt);
        const sent = await fetchSentLinks(env, idFromJwt);
        const headers = new Headers({ 'Content-Type': 'text/html;charset=UTF-8' });
        try { headers.set('Permissions-Policy', 'accelerometer=(), autoplay=(), camera=(), encrypted-media=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()'); headers.set('Referrer-Policy', 'strict-origin-when-cross-origin'); headers.set('X-Content-Type-Options', 'nosniff'); } catch(_){}
        return new Response(homePage(nameFromJwt, { ...lists, inbox, sent }), { headers });
      }
      // Missing username or sub claim: fall back to DB via session cookie
      const sessionId = getCookie(req, 'session');
      if (sessionId && env && env.vidshare) {
        const row = await env.vidshare
          .prepare('SELECT users.id as user_id, users.username FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.id = ?1')
          .bind(sessionId)
          .first();
        if (row && row.username && row.user_id) {
          const lists = await fetchFriendLists(env, row.user_id);
          const inbox = await fetchInboxLinks(env, row.user_id);
          const sent = await fetchSentLinks(env, row.user_id);
          const headers = new Headers({ 'Content-Type': 'text/html;charset=UTF-8' });
          try { headers.set('Permissions-Policy', 'accelerometer=(), autoplay=(), camera=(), encrypted-media=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()'); headers.set('Referrer-Policy', 'strict-origin-when-cross-origin'); headers.set('X-Content-Type-Options', 'nosniff'); } catch(_){}
          return new Response(homePage(row.username, { ...lists, inbox, sent }), { headers });
        }
      }
    } catch (_) {
      // Invalid/expired JWT: fall back via session cookie
      const sessionId = getCookie(req, 'session');
      if (sessionId && env && env.vidshare) {
        const row = await env.vidshare
          .prepare('SELECT users.id as user_id, users.username FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.id = ?1')
          .bind(sessionId)
          .first();
        if (row && row.username && row.user_id) {
          const lists = await fetchFriendLists(env, row.user_id);
          const inbox = await fetchInboxLinks(env, row.user_id);
          const sent = await fetchSentLinks(env, row.user_id);
          const headers = new Headers({ 'Content-Type': 'text/html;charset=UTF-8' });
          try { headers.set('Permissions-Policy', 'accelerometer=(), autoplay=(), camera=(), encrypted-media=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()'); headers.set('Referrer-Policy', 'strict-origin-when-cross-origin'); headers.set('X-Content-Type-Options', 'nosniff'); } catch(_){}
          return new Response(homePage(row.username, { ...lists, inbox, sent }), { headers });
        }
      }
    }
  }
  // Not signed in -> redirect to /welcome
  return new Response(null, { status: 302, headers: { Location: '/welcome' } });
}

async function fetchFriendLists(env, meId) {
  // Incoming pending where I am the receiver
  const incoming = await env.vidshare
    .prepare(
      'SELECT u.id as user_id, u.username FROM friendships f JOIN users u ON u.id = f.initiating_user WHERE f.receiving_user = ?1 AND f.status = ?2'
    )
    .bind(meId, 'pending')
    .all()
    .then((r) => r.results || r);

  // Outgoing pending/declined where I am the initiator
  const outgoing = await env.vidshare
    .prepare(
      'SELECT u.id as user_id, u.username, f.status FROM friendships f JOIN users u ON u.id = f.receiving_user WHERE f.initiating_user = ?1 AND (f.status = ?2 OR f.status = ?3)'
    )
    .bind(meId, 'pending', 'declined')
    .all()
    .then((r) => r.results || r);

  // Approved: union of both directions where accepted
  const approvedInit = await env.vidshare
    .prepare(
      'SELECT u.id as user_id, u.username FROM friendships f JOIN users u ON u.id = f.receiving_user WHERE f.initiating_user = ?1 AND f.status = ?2'
    )
    .bind(meId, 'accepted')
    .all()
    .then((r) => r.results || r);
  const approvedRecv = await env.vidshare
    .prepare(
      'SELECT u.id as user_id, u.username FROM friendships f JOIN users u ON u.id = f.initiating_user WHERE f.receiving_user = ?1 AND f.status = ?2'
    )
    .bind(meId, 'accepted')
    .all()
    .then((r) => r.results || r);

  const approved = [...approvedInit, ...approvedRecv];
  return { incoming, outgoing, approved };
}

async function fetchInboxLinks(env, meId) {
  const now = Math.floor(Date.now() / 1000);
  const rows = await env.vidshare
    .prepare(
      'SELECT l.id, l.url, l.created_at, l.saved, l.watched, l.reaction, l.watched_at, u.username as sender_username FROM links l JOIN users u ON u.id = l.sender_id WHERE l.recipient_id = ?1 AND (l.saved = 1 OR l.watched = 0 OR (l.watched = 1 AND l.watched_at IS NOT NULL AND l.watched_at >= ?2 - 172800)) ORDER BY l.created_at ASC LIMIT 50'
    )
    .bind(meId, now)
    .all()
    .then((r) => r.results || r);
  return rows;
}

async function fetchSentLinks(env, meId) {
  const rows = await env.vidshare
    .prepare(
      'SELECT l.id, l.url, l.created_at, l.watched, l.reaction, u.username as recipient_username FROM links l JOIN users u ON u.id = l.recipient_id WHERE l.sender_id = ?1 ORDER BY l.created_at DESC LIMIT 50'
    )
    .bind(meId)
    .all()
    .then((r) => r.results || r);
  return rows;
}

async function fetchSavedLinks(env, meId) {
  const rows = await env.vidshare
    .prepare(
      'SELECT l.id, l.url, l.created_at, l.reaction, u.username as sender_username FROM links l JOIN users u ON u.id = l.sender_id WHERE l.recipient_id = ?1 AND l.saved = 1 ORDER BY l.created_at DESC LIMIT 100'
    )
    .bind(meId)
    .all()
    .then((r) => r.results || r);
  return rows;
}

async function fetchHistoryLinks(env, meId) {
  const now = Math.floor(Date.now() / 1000);
  const rows = await env.vidshare
    .prepare(
      'SELECT l.id, l.url, l.watched_at, l.reaction, u.username as sender_username FROM links l JOIN users u ON u.id = l.sender_id WHERE l.recipient_id = ?1 AND l.saved = 0 AND l.watched = 1 AND l.watched_at IS NOT NULL AND l.watched_at < ?2 - 172800 ORDER BY l.watched_at DESC LIMIT 100'
    )
    .bind(meId, now)
    .all()
    .then((r) => r.results || r);
  return rows;
}

async function handleLogout(req, env) {
  const sessionId = getCookie(req, 'session');
  const refreshToken = getCookie(req, 'refresh');
  if (sessionId) {
    await env.vidshare
      .prepare('DELETE FROM sessions WHERE id = ?1')
      .bind(sessionId)
      .run();
  } else if (refreshToken) {
    const refreshHash = await sha256B64(refreshToken);
    await env.vidshare
      .prepare('DELETE FROM sessions WHERE refresh_hash = ?1')
      .bind(refreshHash)
      .run();
  }
  const headers = new Headers({ Location: '/login' });
  headers.append('Set-Cookie', cookie('session', '', { path: '/', httpOnly: true, maxAge: 0 }));
  headers.append('Set-Cookie', cookie('jwt', '', { path: '/', httpOnly: true, maxAge: 0 }));
  headers.append('Set-Cookie', cookie('refresh', '', { path: '/', httpOnly: true, maxAge: 0 }));
  return new Response(null, { status: 302, headers });
}

function savedPage(username, list) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    ${baseHead('Saved — VidFriends')}
    <script>
      document.addEventListener('DOMContentLoaded', function(){
        var vids = document.querySelectorAll('video.asset-video');
        for (var k = 0; k < vids.length; k++) {
          (function(v){
            var linkId = v.getAttribute('data-link-id');
            v.addEventListener('play', function(){
              if (v.getAttribute('data-played') !== '1') {
                v.setAttribute('data-played','1');
                var fd = new FormData();
                fd.append('link_id', linkId);
                fetch('/links/watched', { method: 'POST', body: fd, credentials: 'same-origin' });
              }
            });
          })(vids[k]);
        }
      });
    </script>
  </head>
  <body>
    <div class="container">
      <h1>Saved</h1>
      <p>Logged in as <strong>${escapeHtml(username)}</strong></p>
      <nav>
        <a href="/"><button type="button" class="secondary">Home</button></a>
        <a href="/history"><button type="button" class="secondary">History</button></a>
      </nav>
      <ul>
        ${list.map(v => `
          <li>
            <video class=\"asset-video\" data-link-id=\"${escapeHtml(v.id)}\" width=\"360\" height=\"203\" controls preload=\"metadata\">
              <source src=\"https://assets.vidfriends.app/videos/${escapeHtml(v.id)}.mp4\" type=\"video/mp4\">
              Your browser does not support the video tag.
            </video>
            - from <strong>${escapeHtml(v.sender_username)}</strong>
            ${v.reaction ? ` - Your reaction: ${escapeHtml(v.reaction)}` : ''}
          </li>`).join('')}
      </ul>
    </div>
  </body>
</html>`;
}

function historyPage(username, list) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    ${baseHead('History — VidFriends')}
    <script>
      document.addEventListener('DOMContentLoaded', function(){
        var vids = document.querySelectorAll('video.asset-video');
        for (var k = 0; k < vids.length; k++) {
          (function(v){
            var linkId = v.getAttribute('data-link-id');
            v.addEventListener('play', function(){
              if (v.getAttribute('data-played') !== '1') {
                v.setAttribute('data-played','1');
                var fd = new FormData();
                fd.append('link_id', linkId);
                fetch('/links/watched', { method: 'POST', body: fd, credentials: 'same-origin' });
              }
            });
          })(vids[k]);
        }
      });
    </script>
  </head>
  <body>
    <div class="container">
      <h1>History</h1>
      <p>Logged in as <strong>${escapeHtml(username)}</strong></p>
      <nav>
        <a href="/"><button type="button" class="secondary">Home</button></a>
        <a href="/saved"><button type="button" class="secondary">Saved</button></a>
      </nav>
      <ul>
        ${list.map(v => `
          <li>
            <video class=\"asset-video\" data-link-id=\"${escapeHtml(v.id)}\" width=\"360\" height=\"203\" controls preload=\"metadata\">
              <source src=\"https://assets.vidfriends.app/videos/${escapeHtml(v.id)}.mp4\" type=\"video/mp4\">
              Your browser does not support the video tag.
            </video>
            - from <strong>${escapeHtml(v.sender_username)}</strong>
            ${v.reaction ? ` - Your reaction: ${escapeHtml(v.reaction)}` : ''}
          </li>`).join('')}
      </ul>
    </div>
  </body>
</html>`;
}

async function handleSaved(req, env) {
  const me = await getAuthUser(req, env);
  if (!me || !env || !env.vidshare) return new Response(null, { status: 302, headers: { Location: '/login' } });
  const list = await fetchSavedLinks(env, me.userId);
  const headers = new Headers({ 'Content-Type': 'text/html;charset=UTF-8' });
  try { headers.set('Permissions-Policy', 'accelerometer=(), autoplay=(), camera=(), encrypted-media=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()'); headers.set('Referrer-Policy', 'strict-origin-when-cross-origin'); headers.set('X-Content-Type-Options', 'nosniff'); } catch(_){}
  return new Response(savedPage(me.username || '', list), { headers });
}

async function handleHistory(req, env) {
  const me = await getAuthUser(req, env);
  if (!me || !env || !env.vidshare) return new Response(null, { status: 302, headers: { Location: '/login' } });
  const list = await fetchHistoryLinks(env, me.userId);
  const headers = new Headers({ 'Content-Type': 'text/html;charset=UTF-8' });
  try { headers.set('Permissions-Policy', 'accelerometer=(), autoplay=(), camera=(), encrypted-media=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()'); headers.set('Referrer-Policy', 'strict-origin-when-cross-origin'); headers.set('X-Content-Type-Options', 'nosniff'); } catch(_){}
  return new Response(historyPage(me.username || '', list), { headers });
}

async function getAuthUser(req, env) {
  // Prefer JWT claims
  try {
    const token = getCookie(req, 'jwt');
    if (token) {
      const p = await verifyJWT(token, env);
      if (p && p.sub) return { userId: p.sub, username: p.username };
    }
  } catch (_) {}
  // Fallback via session cookie -> DB lookup
  try {
    const sessionId = getCookie(req, 'session');
    if (sessionId && env && env.vidshare) {
      const row = await env.vidshare
        .prepare('SELECT users.id as user_id, users.username FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.id = ?1')
        .bind(sessionId)
        .first();
      if (row && row.user_id) return { userId: row.user_id, username: row.username };
    }
  } catch (_) {}
  return null;
}

async function handleScroll(req, env) {
  const me = await getAuthUser(req, env);
  if (!me || !env || !env.vidshare) return new Response(null, { status: 302, headers: { Location: '/login' } });
  const list = await fetchInboxLinks(env, me.userId);
  const headers = new Headers({ 'Content-Type': 'text/html;charset=UTF-8' });
  try { headers.set('Permissions-Policy', 'accelerometer=(), autoplay=(), camera=(), encrypted-media=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()'); headers.set('Referrer-Policy', 'strict-origin-when-cross-origin'); headers.set('X-Content-Type-Options', 'nosniff'); } catch(_){}
  return new Response(scrollPage(me.username || '', list), { headers });
}

// Push notifications
async function ensurePushTables(env) {
  await env.vidshare.prepare(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    endpoint TEXT,
    p256dh TEXT,
    auth TEXT,
    created_at INTEGER
  )`).run();
  await env.vidshare.prepare(`CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    title TEXT,
    body TEXT,
    data TEXT,
    delivered INTEGER,
    created_at INTEGER
  )`).run();
}

async function handlePushSubscribe(req, env) {
  if (!env || !env.vidshare) return new Response('Database unavailable', { status: 500 });
  const me = await getAuthUser(req, env);
  if (!me) return new Response('Unauthorized', { status: 401 });
  await ensurePushTables(env);
  const sub = await req.json();
  const ep = sub && sub.endpoint;
  const keys = sub && sub.keys || {};
  if (!ep || !keys.p256dh || !keys.auth) return new Response('Bad request', { status: 400 });
  const now = Math.floor(Date.now() / 1000);
  // Upsert by endpoint
  const existing = await env.vidshare.prepare('SELECT id FROM push_subscriptions WHERE endpoint = ?1').bind(ep).first();
  const id = existing ? existing.id : crypto.randomUUID();
  if (existing) {
    await env.vidshare
      .prepare('UPDATE push_subscriptions SET user_id = ?1, p256dh = ?2, auth = ?3, created_at = ?4 WHERE id = ?5')
      .bind(me.userId, keys.p256dh, keys.auth, now, id)
      .run();
  } else {
    await env.vidshare
      .prepare('INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
      .bind(id, me.userId, ep, keys.p256dh, keys.auth, now)
      .run();
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
}

async function handlePushInbox(req, env) {
  if (!env || !env.vidshare) return new Response('Database unavailable', { status: 500 });
  const me = await getAuthUser(req, env);
  if (!me) return new Response('Unauthorized', { status: 401 });
  await ensurePushTables(env);
  const rows = await env.vidshare
    .prepare('SELECT id, title, body, data, created_at FROM notifications WHERE user_id = ?1 AND delivered = 0 ORDER BY created_at ASC')
    .bind(me.userId)
    .all()
    .then(r => r.results || r);
  const ids = rows.map(r => r.id);
  for (const nid of ids) {
    await env.vidshare
      .prepare('UPDATE notifications SET delivered = 1 WHERE id = ?1')
      .bind(nid)
      .run();
  }
  return new Response(JSON.stringify(rows.map(r => ({ id: r.id, title: r.title, body: r.body, data: r.data && JSON.parse(r.data) }))), { headers: { 'Content-Type': 'application/json' } });
}

async function createNotification(env, userId, { title, body, data }) {
  await ensurePushTables(env);
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const dataStr = data ? JSON.stringify(data) : null;
  await env.vidshare
    .prepare('INSERT INTO notifications (id, user_id, title, body, data, delivered, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
    .bind(id, userId, title || '', body || '', dataStr, 0, now)
    .run();
  return id;
}

function uint8ToB64url(bytes) { return base64url(bytes); }
function b64urlToUint8(str) { return base64urlToUint8(str); }

async function jwsEs256(input, jwk) {
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sigDer = await crypto.subtle.sign({ name: 'ECDSA', hash: { name: 'SHA-256' } }, key, new TextEncoder().encode(input));
  const sigBytes = new Uint8Array(sigDer);
  function derInts(sigBytes) {
    try {
      let p = 0;
      if (sigBytes[p++] !== 0x30) return null;
      let len = sigBytes[p++];
      if (len & 0x80) { const n = len & 0x7f; len = 0; for (let i=0;i<n;i++) len = (len << 8) | sigBytes[p++]; }
      if (sigBytes[p++] !== 0x02) return null;
      let rLen = sigBytes[p++]; if (rLen & 0x80) { const n = rLen & 0x7f; rLen = 0; for (let i=0;i<n;i++) rLen = (rLen<<8)|sigBytes[p++]; }
      const r = sigBytes.slice(p, p + rLen); p += rLen;
      if (sigBytes[p++] !== 0x02) return null;
      let sLen = sigBytes[p++]; if (sLen & 0x80) { const n = sLen & 0x7f; sLen = 0; for (let i=0;i<n;i++) sLen = (sLen<<8)|sigBytes[p++]; }
      const s = sigBytes.slice(p, p + sLen);
      return { r, s };
    } catch (_) { return null; }
  }
  const ints = derInts(sigBytes) || { r: new Uint8Array(0), s: new Uint8Array(0) };
  function leftPad32(b) { const out = new Uint8Array(32); out.set(b.slice(Math.max(0, b.length-32)), 32 - Math.min(32, b.length)); return out; }
  const rPad = leftPad32(ints.r);
  const sPad = leftPad32(ints.s);
  const raw = new Uint8Array(64);
  raw.set(rPad, 0); raw.set(sPad, 32);
  return uint8ToB64url(raw);
}

async function sendPushToUser(env, userId) {
  if (!(env && env.vidshare)) return false;
  await ensurePushTables(env);
  const subs = await env.vidshare
    .prepare('SELECT id, endpoint FROM push_subscriptions WHERE user_id = ?1')
    .bind(userId)
    .all()
    .then(r => r.results || r);
  if (!subs.length) return false;
  const pubB64 = env.VAPID_PUBLIC_KEY || '';
  const privB64 = env.VAPID_PRIVATE_KEY || '';
  if (!pubB64 || !privB64) return false;
  const pub = b64urlToUint8(pubB64);
  const d = b64urlToUint8(privB64);
  if (!(pub && pub.length === 65 && d && d.length === 32)) return false;
  const x = pub.slice(1, 33);
  const y = pub.slice(33);
  const jwk = { kty: 'EC', crv: 'P-256', d: base64url(d), x: base64url(x), y: base64url(y) };
  let delivered = false;
  for (const s of subs) {
    try {
      const endpoint = s.endpoint;
      const u = new URL(endpoint);
      const aud = `${u.protocol}//${u.host}`;
      const now = Math.floor(Date.now() / 1000);
      const header = { alg: 'ES256', typ: 'JWT' };
      const payload = { aud, exp: now + 12 * 60 * 60, sub: env.VAPID_SUBJECT || 'mailto:support@vidfriends.app' };
      const enc = (obj) => base64url(utf8ToUint8(JSON.stringify(obj)));
      const unsigned = `${enc(header)}.${enc(payload)}`;
      const signature = await jwsEs256(unsigned, jwk);
      const jwt = `${unsigned}.${signature}`;
      const headers = new Headers();
      headers.set('Authorization', `WebPush ${jwt}`);
      headers.set('Crypto-Key', `p256ecdsa=${pubB64}`);
      headers.set('TTL', '60');
      const r = await fetch(endpoint, { method: 'POST', headers, body: '' });
      if (r.status === 404 || r.status === 410) {
        await env.vidshare.prepare('DELETE FROM push_subscriptions WHERE id = ?1').bind(s.id).run();
      } else if (r.ok || r.status === 201 || r.status === 202 || r.status === 204) {
        delivered = true;
      }
    } catch (_) {}
  }
  return delivered;
}

async function handleFriendAdd(req, env) {
  if (!env || !env.vidshare) return new Response('Database unavailable', { status: 500 });
  const me = await getAuthUser(req, env);
  if (!me) return new Response('Unauthorized', { status: 401 });
  const form = await req.formData();
  const targetName = (form.get('friend_username') || '').toString().trim();
  if (!targetName) return new Response('Missing username', { status: 400 });
  if (me.username && targetName.toLowerCase() === me.username.toLowerCase()) {
    return new Response('Cannot add yourself', { status: 400 });
  }
  const target = await env.vidshare
    .prepare('SELECT id, username FROM users WHERE lower(username) = lower(?1)')
    .bind(targetName)
    .first();
  if (!target) return new Response('User not found', { status: 404 });
  if (target.id === me.userId) return new Response('Cannot add yourself', { status: 400 });
  const exists = await env.vidshare
    .prepare(
      'SELECT id, status FROM friendships WHERE (initiating_user = ?1 AND receiving_user = ?2) OR (initiating_user = ?2 AND receiving_user = ?1)'
    )
    .bind(me.userId, target.id)
    .first();
  const now = Math.floor(Date.now() / 1000);
  if (exists) {
    // If previously declined/blocked, do not re-open automatically
    return new Response('Friendship already exists', { status: 400 });
  }
  await env.vidshare
    .prepare(
      'INSERT INTO friendships (id, initiating_user, receiving_user, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)'
    )
    .bind(crypto.randomUUID(), me.userId, target.id, 'pending', now, now)
    .run();
  return new Response(null, { status: 302, headers: { Location: '/' } });
}

async function handleFriendRespond(req, env) {
  if (!env || !env.vidshare) return new Response('Database unavailable', { status: 500 });
  const me = await getAuthUser(req, env);
  if (!me) return new Response('Unauthorized', { status: 401 });
  const form = await req.formData();
  const otherId = form.get('other_user_id');
  const action = (form.get('action') || '').toString();
  if (!otherId || !action) return new Response('Bad request', { status: 400 });
  const fr = await env.vidshare
    .prepare(
      'SELECT id, status FROM friendships WHERE initiating_user = ?1 AND receiving_user = ?2'
    )
    .bind(otherId, me.userId)
    .first();
  if (!fr || fr.status !== 'pending') return new Response('Not found', { status: 404 });
  const now = Math.floor(Date.now() / 1000);
  let newStatus = action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : null;
  if (!newStatus) return new Response('Bad action', { status: 400 });
  await env.vidshare
    .prepare('UPDATE friendships SET status = ?1, updated_at = ?2 WHERE id = ?3')
    .bind(newStatus, now, fr.id)
    .run();
  return new Response(null, { status: 302, headers: { Location: '/' } });
}

async function handleFriendRemove(req, env) {
  if (!env || !env.vidshare) return new Response('Database unavailable', { status: 500 });
  const me = await getAuthUser(req, env);
  if (!me) return new Response('Unauthorized', { status: 401 });
  const form = await req.formData();
  const otherId = form.get('other_user_id');
  if (!otherId) return new Response('Bad request', { status: 400 });
  const row = await env.vidshare
    .prepare(
      'SELECT id FROM friendships WHERE status = ?1 AND ((initiating_user = ?2 AND receiving_user = ?3) OR (initiating_user = ?3 AND receiving_user = ?2))'
    )
    .bind('accepted', me.userId, otherId)
    .first();
  if (!row) return new Response('Not found', { status: 404 });
  await env.vidshare
    .prepare('DELETE FROM friendships WHERE id = ?1')
    .bind(row.id)
    .run();
  return new Response(null, { status: 302, headers: { Location: '/' } });
}

async function handleFriendBlock(req, env) {
  if (!env || !env.vidshare) return new Response('Database unavailable', { status: 500 });
  const me = await getAuthUser(req, env);
  if (!me) return new Response('Unauthorized', { status: 401 });
  const form = await req.formData();
  const otherId = form.get('other_user_id');
  if (!otherId) return new Response('Bad request', { status: 400 });
  const now = Math.floor(Date.now() / 1000);
  const row = await env.vidshare
    .prepare(
      'SELECT id FROM friendships WHERE ((initiating_user = ?1 AND receiving_user = ?2) OR (initiating_user = ?2 AND receiving_user = ?1))'
    )
    .bind(me.userId, otherId)
    .first();
  if (row) {
    await env.vidshare
      .prepare('UPDATE friendships SET status = ?1, blocked_by = ?2, updated_at = ?3 WHERE id = ?4')
      .bind('blocked', me.userId, now, row.id)
      .run();
  } else {
    await env.vidshare
      .prepare(
        'INSERT INTO friendships (id, initiating_user, receiving_user, status, blocked_by, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
      )
      .bind(crypto.randomUUID(), me.userId, otherId, 'blocked', me.userId, now, now)
      .run();
  }
  return new Response(null, { status: 302, headers: { Location: '/' } });
}

function isLikelyValidUrl(url) {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  const re = /^https?:\/\/[\w.-]+(?:\/[\S]*)?$/i;
  if (!re.test(trimmed)) return false;
  try {
    const u = new URL(trimmed);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

async function handleLinkSend(req, env, ctx) {
  if (!env || !env.vidshare) return new Response('Database unavailable', { status: 500 });
  const me = await getAuthUser(req, env);
  if (!me) return new Response('Unauthorized', { status: 401 });
  const form = await req.formData();
  const videoUrl = (form.get('video_url') || '').toString().trim();
  const recipientId = (form.get('recipient_id') || '').toString().trim();
  if (!videoUrl || !recipientId) return new Response('Bad request', { status: 400 });
  if (!isLikelyValidUrl(videoUrl)) return new Response('Invalid URL', { status: 400 });
  if (recipientId === me.userId) return new Response('Cannot send to yourself', { status: 400 });
  // Ensure recipient exists
  const recipient = await env.vidshare
    .prepare('SELECT id FROM users WHERE id = ?1')
    .bind(recipientId)
    .first();
  if (!recipient) return new Response('User not found', { status: 404 });
  // Ensure accepted friendship in either direction
  const friendship = await env.vidshare
    .prepare(
      'SELECT id FROM friendships WHERE status = ?1 AND ((initiating_user = ?2 AND receiving_user = ?3) OR (initiating_user = ?3 AND receiving_user = ?2))'
    )
    .bind('accepted', me.userId, recipientId)
    .first();
  if (!friendship) return new Response('Not friends', { status: 403 });
  const now = Math.floor(Date.now() / 1000);
  const linkId = crypto.randomUUID();
  await env.vidshare
    .prepare('INSERT INTO links (id, url, sender_id, recipient_id, created_at, watched, saved) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
    .bind(linkId, videoUrl, me.userId, recipientId, now, 0, 0)
    .run();

  // Kick off background download to assets service
  try {
    const apiUrl = (env && env.DOWNLOAD_API_URL) || 'https://api-request.zem.systems/download';
    const payload = { url: videoUrl, filename: `${linkId}.mp4` };
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    try { if (!resp.ok) console.log('[download-api] non-200', resp.status); } catch (_) {}
  } catch (e) {
    try { console.log('[download-api] error', e && (e.stack || e.message || e.toString())); } catch (_) {}
  }

  // Background: poll asset availability and notify recipient when ready
  try {
    const senderRow = await env.vidshare
      .prepare('SELECT username FROM users WHERE id = ?1')
      .bind(me.userId)
      .first();
    const senderName = (senderRow && senderRow.username) || 'Someone';
    const assetUrl = `https://assets.vidfriends.app/videos/${linkId}.mp4`;
    const doPoll = async () => {
      const maxTries = 8; // ~24s total
      for (let i=0;i<maxTries;i++){
        try {
          const r = await fetch(assetUrl, { method: 'HEAD', cf: { cacheTtl: 0 } });
          if (r.status === 200) {
            await createNotification(env, recipientId, {
              title: 'New video received',
              body: `From ${senderName}`,
              data: { type: 'new_video', link_id: linkId }
            });
            await sendPushToUser(env, recipientId);
            return;
          }
        } catch (_) {}
        await new Promise(res => setTimeout(res, 3000));
      }
    };
    if (ctx && ctx.waitUntil) ctx.waitUntil(doPoll()); else doPoll();
  } catch (_) {}
  return new Response(null, { status: 302, headers: { Location: '/' } });
}

async function handleLinkReact(req, env, ctx) {
  if (!env || !env.vidshare) return new Response('Database unavailable', { status: 500 });
  const me = await getAuthUser(req, env);
  if (!me) return new Response('Unauthorized', { status: 401 });
  const form = await req.formData();
  const linkId = (form.get('link_id') || '').toString();
  const emoji = form.get('reaction');
  const text = form.get('reaction_text');
  const value = (emoji && emoji.toString()) || (text && text.toString().trim()) || '';
  if (!linkId || !value) return new Response('Bad request', { status: 400 });
  const row = await env.vidshare
    .prepare('SELECT id, recipient_id FROM links WHERE id = ?1')
    .bind(linkId)
    .first();
  if (!row || row.recipient_id !== me.userId) return new Response('Forbidden', { status: 403 });
  await env.vidshare
    .prepare('UPDATE links SET reaction = ?1 WHERE id = ?2')
    .bind(value, linkId)
    .run();
  // Notify sender about reaction
  try {
    const row2 = await env.vidshare
      .prepare('SELECT sender_id FROM links WHERE id = ?1')
      .bind(linkId)
      .first();
    if (row2 && row2.sender_id) {
      await createNotification(env, row2.sender_id, {
        title: 'Reaction received',
        body: 'Your shared video got a reaction',
        data: { type: 'reaction', link_id: linkId }
      });
      const work = sendPushToUser(env, row2.sender_id);
      if (ctx && ctx.waitUntil) ctx.waitUntil(work); else await work;
    }
  } catch (_) {}
  return new Response(null, { status: 302, headers: { Location: '/' } });
}

async function handleLinkUnsend(req, env) {
  if (!env || !env.vidshare) return new Response('Database unavailable', { status: 500 });
  const me = await getAuthUser(req, env);
  if (!me) return new Response('Unauthorized', { status: 401 });
  const form = await req.formData();
  const linkId = (form.get('link_id') || '').toString();
  if (!linkId) return new Response('Bad request', { status: 400 });
  await env.vidshare
    .prepare('DELETE FROM links WHERE id = ?1 AND sender_id = ?2')
    .bind(linkId, me.userId)
    .run();
  return new Response(null, { status: 302, headers: { Location: '/' } });
}

async function handleLinkOpen(req, env) {
  if (!env || !env.vidshare) return new Response('Database unavailable', { status: 500 });
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return new Response('Bad request', { status: 400 });
  const row = await env.vidshare
    .prepare('SELECT url, recipient_id FROM links WHERE id = ?1')
    .bind(id)
    .first();
  if (!row) return new Response('Not found', { status: 404 });
  try {
    const me = await getAuthUser(req, env);
    if (me && me.userId === row.recipient_id) {
      const now = Math.floor(Date.now() / 1000);
      try {
        await env.vidshare
          .prepare('UPDATE links SET watched = 1, watched_at = ?1 WHERE id = ?2')
          .bind(now, id)
          .run();
      } catch (_) {
        await env.vidshare
          .prepare('UPDATE links SET watched = 1 WHERE id = ?1')
          .bind(id)
          .run();
      }
    }
  } catch (_) {}
  return new Response(null, { status: 302, headers: { Location: row.url } });
}

async function handleLinkSave(req, env) {
  if (!env || !env.vidshare) return new Response('Database unavailable', { status: 500 });
  const me = await getAuthUser(req, env);
  if (!me) return new Response('Unauthorized', { status: 401 });
  const form = await req.formData();
  const linkId = (form.get('link_id') || '').toString();
  const setVal = form.get('set');
  if (!linkId) return new Response('Bad request', { status: 400 });
  let newVal = null;
  if (setVal === '1' || setVal === '0') newVal = setVal === '1' ? 1 : 0;
  if (newVal === null) {
    // toggle
    const row = await env.vidshare
      .prepare('SELECT saved FROM links WHERE id = ?1 AND recipient_id = ?2')
      .bind(linkId, me.userId)
      .first();
    if (!row) return new Response('Not found', { status: 404 });
    newVal = row.saved ? 0 : 1;
  }
  await env.vidshare
    .prepare('UPDATE links SET saved = ?1 WHERE id = ?2 AND recipient_id = ?3')
    .bind(newVal, linkId, me.userId)
    .run();
  return new Response(null, { status: 302, headers: { Location: '/' } });
}

async function handleLinkWatched(req, env) {
  if (!env || !env.vidshare) return new Response('Database unavailable', { status: 500 });
  const me = await getAuthUser(req, env);
  if (!me) return new Response('Unauthorized', { status: 401 });
  const form = await req.formData();
  const linkId = (form.get('link_id') || '').toString();
  if (!linkId) return new Response('Bad request', { status: 400 });
  const now = Math.floor(Date.now() / 1000);
  try {
    await env.vidshare
      .prepare('UPDATE links SET watched = 1, watched_at = ?1 WHERE id = ?2 AND recipient_id = ?3')
      .bind(now, linkId, me.userId)
      .run();
  } catch (e) {
    // Fallback if watched_at column missing
    await env.vidshare
      .prepare('UPDATE links SET watched = 1 WHERE id = ?1 AND recipient_id = ?2')
      .bind(linkId, me.userId)
      .run();
  }
  return new Response(null, { status: 204 });
}

// Passkey routes removed

function cookie(name, value, opts = {}) {
  const parts = [`${name}=${value}`];
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.path) parts.push(`Path=${opts.path}`);
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  return parts.join('; ');
}

function randomTokenB64(byteLen = 32) {
  const bytes = new Uint8Array(byteLen);
  crypto.getRandomValues(bytes);
  return bufferToBase64(bytes);
}

async function sha256B64(str) {
  const data = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bufferToBase64(new Uint8Array(digest));
}

function base64url(input) {
  return btoa(String.fromCharCode(...input))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function utf8ToUint8(str) {
  return new TextEncoder().encode(str);
}

async function createJWT(payload, env) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const enc = (obj) => base64url(utf8ToUint8(JSON.stringify(obj)));
  const unsigned = `${enc(header)}.${enc(payload)}`;
  const keyData = utf8ToUint8(env.JWT_SECRET || 'dev-secret');
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, utf8ToUint8(unsigned));
  const signature = base64url(new Uint8Array(sig));
  return `${unsigned}.${signature}`;
}

function base64urlToUint8(str) {
  // convert base64url -> base64
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(str.length / 4) * 4, '=');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function verifyJWT(token, env) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('bad token');
  const [h, p, s] = parts;
  const header = JSON.parse(new TextDecoder().decode(base64urlToUint8(h)));
  if (header.alg !== 'HS256') throw new Error('alg');
  const keyData = utf8ToUint8(env.JWT_SECRET || 'dev-secret');
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('HMAC', key, base64urlToUint8(s), utf8ToUint8(`${h}.${p}`));
  if (!valid) throw new Error('sig');
  const payload = JSON.parse(new TextDecoder().decode(base64urlToUint8(p)));
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error('exp');
  return payload;
}

async function handleRefresh(req, env) {
  const refreshToken = getCookie(req, 'refresh');
  if (!refreshToken) return new Response('Unauthorized', { status: 401 });
  const now = Math.floor(Date.now() / 1000);
  const refreshHash = await sha256B64(refreshToken);
  const session = await env.vidshare
    .prepare('SELECT id, user_id, expires_at, rotation_count FROM sessions WHERE refresh_hash = ?1')
    .bind(refreshHash)
    .first();
  if (!session) return new Response('Unauthorized', { status: 401 });
  if (session.expires_at && session.expires_at < now) {
    // expired session
    await env.vidshare
      .prepare('DELETE FROM sessions WHERE id = ?1')
      .bind(session.id)
      .run();
    return new Response('Unauthorized', { status: 401 });
  }
  const newRefreshToken = randomTokenB64(32);
  const newRefreshHash = await sha256B64(newRefreshToken);
  const newExpires = now + 60 * 24 * 60 * 60; // extend 60 days
  await env.vidshare
    .prepare('UPDATE sessions SET refresh_hash = ?1, last_rotated_at = ?2, rotation_count = ?3, expires_at = ?4 WHERE id = ?5')
    .bind(newRefreshHash, now, (session.rotation_count || 0) + 1, newExpires, session.id)
    .run();
  // Try to include username in refreshed JWT
  let usernameForJwt = undefined;
  try {
    const row = await env.vidshare
      .prepare('SELECT username FROM users WHERE id = ?1')
      .bind(session.user_id)
      .first();
    if (row && row.username) usernameForJwt = row.username;
  } catch (_) {}
  const jwt = await createJWT({ sub: session.user_id, username: usernameForJwt, iat: now, exp: now + 15 * 60 }, env);
  const isHttps = (new URL(req.url)).protocol === 'https:';
  const headers = new Headers();
  headers.append('Set-Cookie', cookie('jwt', jwt, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 15 * 60, secure: isHttps }));
  headers.append('Set-Cookie', cookie('refresh', newRefreshToken, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 60 * 24 * 60 * 60, secure: isHttps }));
  return new Response(null, { status: 204, headers });
}

// ========== WebAuthn helpers ==========
function b64url(bytes) {
  return base64url(bytes);
}

function hexPreview(bytes, max = 16) {
  try {
    const len = Math.min(max, bytes.length || 0);
    let out = '';
    for (let i = 0; i < len; i++) {
      const b = bytes[i].toString(16).padStart(2, '0');
      out += b + (i + 1 < len ? '' : '');
    }
    return out;
  } catch (_) { return ''; }
}

function jsonPreview(value) {
  const seen = new WeakSet();
  function replacer(_key, val) {
    try {
      if (val instanceof Uint8Array) return { type: 'Uint8Array', len: val.length, hex: hexPreview(val, 32) };
      if (typeof val === 'string' && val.length > 256) return val.slice(0, 256) + '...';
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) return '[Circular]';
        seen.add(val);
      }
      return val;
    } catch (_) { return '[Unserializable]'; }
  }
  try { return JSON.stringify(value, replacer); } catch (_) { return '"[JSON error]"'; }
}

function logj(tag, obj) { try { console.log(tag + ' ' + jsonPreview(obj)); } catch (_) { try { console.log(tag); } catch(__) {} } }

async function sha256Bytes(bytes) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dig = await crypto.subtle.digest('SHA-256', buf);
  return new Uint8Array(dig);
}

function cborDecode(data) {
  let pos = 0;
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const td = new TextDecoder();
  function readUint(addl) {
    if (addl < 24) return addl;
    if (addl === 24) return dv.getUint8(pos++);
    if (addl === 25) { const v = dv.getUint16(pos); pos += 2; return v; }
    if (addl === 26) { const v = dv.getUint32(pos); pos += 4; return v; }
    throw new Error('CBOR int too large');
  }
  function decodeItem() {
    const ib = dv.getUint8(pos++);
    const mt = ib >> 5;
    const addl = ib & 31;
    if (mt === 0) return readUint(addl);
    if (mt === 1) return -1 - readUint(addl);
    if (mt === 2) { const len = readUint(addl); const v = data.subarray(pos, pos+len); pos += len; return v; }
    if (mt === 3) { const len = readUint(addl); const v = td.decode(data.subarray(pos, pos+len)); pos += len; return v; }
    if (mt === 4) { const len = readUint(addl); const arr = []; for (let i=0;i<len;i++) arr.push(decodeItem()); return arr; }
    if (mt === 5) { const len = readUint(addl); const obj = {}; for (let i=0;i<len;i++){ const k = decodeItem(); const v = decodeItem(); obj[typeof k === 'string' ? k : String(k)] = v; } return obj; }
    if (mt === 6) { /* tag */ decodeItem(); return decodeItem(); }
    if (mt === 7) { if (addl === 20) return false; if (addl===21) return true; if (addl===22) return null; if (addl===23) return undefined; throw new Error('CBOR simple'); }
    throw new Error('CBOR mt');
  }
  return decodeItem();
}

function parseAuthData(buf) {
  let off = 0;
  const rpIdHash = buf.slice(off, off+32); off += 32;
  const flags = buf[off++];
  const signCount = (buf[off]<<24) | (buf[off+1]<<16) | (buf[off+2]<<8) | buf[off+3]; off += 4;
  const AT = (flags & 0x40) !== 0;
  let aaguid=null, credId=null, coseKey=null;
  if (AT) {
    aaguid = buf.slice(off, off+16); off += 16;
    const idLen = (buf[off]<<8) | buf[off+1]; off += 2;
    credId = buf.slice(off, off+idLen); off += idLen;
    const rest = buf.slice(off);
    const cose = cborDecode(rest);
    coseKey = cose;
  }
  return { rpIdHash, flags, signCount, aaguid, credId, coseKey };
}

function coseToJwk(cose) {
  const kty = cose['1'];
  const alg = cose['3'];
  if (kty === 2 && alg === -7) { // EC2 P-256 ES256
    const x = cose['-2'];
    const y = cose['-3'];
    const jwk = { kty: 'EC', crv: 'P-256', x: base64url(x), y: base64url(y), ext: true };
    try { console.log('[webauthn] coseToJwk: EC2/ES256'); } catch(_){}
    return jwk;
  }
  if (kty === 1 && (alg === -8)) { // OKP Ed25519
    const x = cose['-2'];
    const jwk = { kty: 'OKP', crv: 'Ed25519', x: base64url(x), ext: true };
    try { console.log('[webauthn] coseToJwk: OKP/Ed25519'); } catch(_){}
    return jwk;
  }
  if (kty === 3 && (alg === -257)) { // RSA RS256
    const n = cose['-1'];
    const e = cose['-2'];
    const jwk = { kty: 'RSA', n: base64url(n), e: base64url(e), ext: true };
    try { console.log('[webauthn] coseToJwk: RSA/RS256'); } catch(_){}
    return jwk;
  }
  throw new Error('Unsupported COSE key');
}

function hasUserPresent(flags){ return (flags & 0x01) !== 0; }
function hasUserVerified(flags){ return (flags & 0x04) !== 0; }

async function importPublicKeyFromJwk(jwk) {
  if (jwk.kty === 'EC' && jwk.crv === 'P-256') {
    try { console.log('[webauthn] importKey EC P-256'); } catch(_){}
    return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  }
  if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519') {
    try { console.log('[webauthn] importKey OKP Ed25519'); } catch(_){}
    return crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['verify']);
  }
  if (jwk.kty === 'RSA' && jwk.n && jwk.e) {
    try { console.log('[webauthn] importKey RSA RS256'); } catch(_){}
    return crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  }
  throw new Error('Unsupported key');
}

function derWriteLen(len) {
  if (len < 128) return Uint8Array.from([len]);
  const bytes = [];
  while (len > 0) { bytes.unshift(len & 0xff); len >>= 8; }
  return Uint8Array.from([0x80 | bytes.length, ...bytes]);
}

function derSeq(contents) {
  const len = contents.length;
  const hdr = Uint8Array.from([0x30]);
  const l = derWriteLen(len);
  const out = new Uint8Array(1 + l.length + len);
  out.set(hdr, 0);
  out.set(l, 1);
  out.set(contents, 1 + l.length);
  return out;
}

function derBitString(bytes) {
  const hdr = Uint8Array.from([0x03]);
  const body = Uint8Array.from([0x00, ...bytes]); // 0 unused bits + data
  const l = derWriteLen(body.length);
  const out = new Uint8Array(1 + l.length + body.length);
  out.set(hdr, 0);
  out.set(l, 1);
  out.set(body, 1 + l.length);
  return out;
}

function ecP256JwkToSpki(jwk) {
  // Build SPKI for EC P-256 public key from x/y
  const x = base64urlToUint8(jwk.x);
  const y = base64urlToUint8(jwk.y);
  const uncompressed = Uint8Array.from([0x04, ...x, ...y]);
  // ecPublicKey OID: 1.2.840.10045.2.1 -> 06 07 2A 86 48 CE 3D 02 01
  const oidEcPub = Uint8Array.from([0x06, 0x07, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x02, 0x01]);
  // prime256v1 OID: 1.2.840.10045.3.1.7 -> 06 08 2A 86 48 CE 3D 03 01 07
  const oidP256  = Uint8Array.from([0x06, 0x08, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x03, 0x01, 0x07]);
  const algId = derSeq(new Uint8Array([...oidEcPub, ...oidP256]));
  const pub = derBitString(uncompressed);
  const spki = derSeq(new Uint8Array([...algId, ...pub]));
  return spki;
}

async function verifyAssertionSignature(jwk, authenticatorDataBytes, clientDataJSONBytes, signatureBytes) {
  const clientHash = await sha256Bytes(clientDataJSONBytes);
  const toVerify = new Uint8Array(authenticatorDataBytes.length + clientHash.length);
  toVerify.set(authenticatorDataBytes, 0);
  toVerify.set(clientHash, authenticatorDataBytes.length);
  const key = await importPublicKeyFromJwk(jwk);
  try { console.log('[webauthn] verify(sig): prepared buffers', { authLen: authenticatorDataBytes.length, clientHash: hexPreview(clientHash, 16), toVerifyLen: toVerify.length, toVerifyHead: hexPreview(toVerify, 16) }); } catch(_){}
  if (jwk.kty === 'EC') {
    // Some authenticators return raw r|s (64 bytes) instead of DER. Convert if needed.
    let sig = signatureBytes;
    logj('[webauthn] verify: sig preview', { len: sig.length, der: sig[0] === 0x30, head: hexPreview(sig, 32) });
    function derInts(sigBytes) {
      try {
        let p = 0;
        if (sigBytes[p++] !== 0x30) return null;
        let len = sigBytes[p++];
        if (len & 0x80) { const n = len & 0x7f; len = 0; for (let i=0;i<n;i++) len = (len << 8) | sigBytes[p++]; }
        if (sigBytes[p++] !== 0x02) return null;
        let rLen = sigBytes[p++]; if (rLen & 0x80) { const n = rLen & 0x7f; rLen = 0; for (let i=0;i<n;i++) rLen = (rLen<<8)|sigBytes[p++]; }
        const r = sigBytes.slice(p, p + rLen); p += rLen;
        if (sigBytes[p++] !== 0x02) return null;
        let sLen = sigBytes[p++]; if (sLen & 0x80) { const n = sLen & 0x7f; sLen = 0; for (let i=0;i<n;i++) sLen = (sLen<<8)|sigBytes[p++]; }
        const s = sigBytes.slice(p, p + sLen);
        return { r, s };
      } catch (_) { return null; }
    }
    const preInts = (sig && sig[0] === 0x30) ? derInts(sig) : null;
    if (preInts) logj('[webauthn] verify: DER ints (pre)', { r: hexPreview(preInts.r, 40), s: hexPreview(preInts.s, 40), rLen: preInts.r.length, sLen: preInts.s.length });
    if (sig && sig.length === 65 && sig[0] === 0x00) {
      // Occasionally signatures include a leading 0x00; strip it
      sig = sig.slice(1);
      logj('[webauthn] verify: stripped leading 0x00 from signature', { len: sig.length });
    }
    if (!(sig && sig.length > 0 && sig[0] === 0x30)) {
      // Attempt raw(64) -> DER conversion
      if (sig && sig.length === 64) {
        const r = sig.slice(0, 32);
        const s = sig.slice(32);
        function trimInt(buf) {
          let i = 0;
          while (i < buf.length - 1 && buf[i] === 0x00) i++;
          let v = buf.slice(i);
          // If high bit set, prepend 0x00
          if (v[0] & 0x80) v = Uint8Array.from([0x00, ...v]);
          return v;
        }
        const rT = trimInt(r);
        const sT = trimInt(s);
        // Build DER with short-form length (safe because total < 128 for P-256)
        const seqLen = 2 + rT.length + 2 + sT.length;
        const der = new Uint8Array(2 + seqLen);
        let o = 0;
        der[o++] = 0x30; // SEQUENCE
        der[o++] = seqLen; // length (short form)
        der[o++] = 0x02; // INTEGER
        der[o++] = rT.length;
        der.set(rT, o); o += rT.length;
        der[o++] = 0x02; // INTEGER
        der[o++] = sT.length;
        der.set(sT, o); o += sT.length;
        sig = der;
        logj('[webauthn] verify: converted raw r|s to DER', { len: sig.length, head: hexPreview(sig, 32) });
      }
    }
    const postInts = (sig && sig[0] === 0x30) ? derInts(sig) : null;
    if (postInts) logj('[webauthn] verify: DER ints (post)', { r: hexPreview(postInts.r, 40), s: hexPreview(postInts.s, 40), rLen: postInts.r.length, sLen: postInts.s.length });
    // Use spec-compliant hash identifier object for maximum compatibility
    let ok = await crypto.subtle.verify({ name: 'ECDSA', hash: { name: 'SHA-256' } }, key, sig, toVerify);
    logj('[webauthn] verify: ECDSA result', { ok });
    if (!ok && sig && sig[0] === 0x30) {
      // Try to normalize DER by parsing and re-encoding r/s
      try {
        let p = 0;
        if (sig[p++] !== 0x30) throw new Error('DER: no SEQ');
        function readLen() {
          let len = sig[p++];
          if (len & 0x80) {
            const n = len & 0x7f;
            if (n === 0 || n > 2) throw new Error('DER: len too long');
            len = 0;
            for (let i = 0; i < n; i++) { len = (len << 8) | sig[p++]; }
          }
          return len;
        }
        const seqLen = readLen();
        if (sig[p++] !== 0x02) throw new Error('DER: no INT r');
        const rLen = readLen();
        const r = sig.slice(p, p + rLen); p += rLen;
        if (sig[p++] !== 0x02) throw new Error('DER: no INT s');
        const sLen = readLen();
        const s = sig.slice(p, p + sLen);
        function trimInt2(buf) {
          let i = 0;
          while (i < buf.length - 1 && buf[i] === 0x00) i++;
          let v = buf.slice(i);
          if (v[0] & 0x80) v = Uint8Array.from([0x00, ...v]);
          return v;
        }
        const rT = trimInt2(r);
        const sT = trimInt2(s);
        logj('[webauthn] verify: ECDSA normalize parts', { r: hexPreview(r, 40), s: hexPreview(s, 40), rT: hexPreview(rT, 40), sT: hexPreview(sT, 40) });
        const nSeqLen = 2 + rT.length + 2 + sT.length;
        const der2 = new Uint8Array(2 + nSeqLen);
        let o2 = 0;
        der2[o2++] = 0x30;
        der2[o2++] = nSeqLen; // short-form length is safe here
        der2[o2++] = 0x02;
        der2[o2++] = rT.length;
        der2.set(rT, o2); o2 += rT.length;
        der2[o2++] = 0x02;
        der2[o2++] = sT.length;
        der2.set(sT, o2);
        const ok2 = await crypto.subtle.verify({ name: 'ECDSA', hash: { name: 'SHA-256' } }, key, der2, toVerify);
        logj('[webauthn] verify: ECDSA normalized result', { ok: ok2 });
        return ok2;
      } catch (e) {
        logj('[webauthn] verify: ECDSA normalize error', { err: (e && (e.stack || e.message || e)) });
      }
    }
    if (!ok) {
      // Fallback: import as SPKI and verify again (some runtimes have JWK quirks)
      try {
        const spki = ecP256JwkToSpki(jwk);
        const key2 = await crypto.subtle.importKey('spki', spki, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
        const ok3 = await crypto.subtle.verify({ name: 'ECDSA', hash: { name: 'SHA-256' } }, key2, sig, toVerify);
        logj('[webauthn] verify: ECDSA SPKI fallback result', { ok: ok3 });
        if (ok3) return true;
      } catch (e) {
        logj('[webauthn] verify: ECDSA SPKI fallback error', { err: (e && (e.stack || e.message || e)) });
      }
    }
    return ok;
  }
  if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519') {
    try { console.log('[webauthn] verify: Ed25519'); } catch(_){}
    return crypto.subtle.verify('Ed25519', key, signatureBytes, toVerify);
  }
  if (jwk.kty === 'RSA') {
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signatureBytes, toVerify);
    try { console.log('[webauthn] verify: RS256 result', ok); } catch(_){}
    return ok;
  }
  return false;
}


