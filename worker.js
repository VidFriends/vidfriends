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

function loginPage() {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Login</title>
    <link rel="icon" type="image/svg+xml" href="https://assets.zem.systems/favicon/favicon.svg">
    <link rel="icon" type="image/png" sizes="96x96" href="https://assets.zem.systems/favicon/favicon-96x96.png">
    <link rel="shortcut icon" href="https://assets.zem.systems/favicon/favicon.ico">
    <link rel="apple-touch-icon" href="https://assets.zem.systems/favicon/apple-touch-icon.png">
    <link rel="manifest" href="/site.webmanifest">
    <script>
      function showPassword() {
        document.getElementById('password-form').style.display = 'block';
      }
      function togglePasskeyLogin() {
        var f = document.getElementById('passkey-login-form');
        f.style.display = 'block';
        var inp = document.getElementById('login-passkey-username');
        if (inp) inp.focus();
      }
      function b64urlToBuf(b64url){
        var b64 = b64url.replace(/-/g,'+').replace(/_/g,'/');
        var pad = '='.repeat((4 - b64.length % 4) % 4);
        var str = atob(b64 + pad);
        var bytes = new Uint8Array(str.length);
        for (var i=0;i<str.length;i++) bytes[i] = str.charCodeAt(i);
        return bytes.buffer;
      }
      function bufToB64url(buf){
        var bytes = new Uint8Array(buf);
        var bin=''; for (var i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      }
      async function loginPasskeyLocal(username){
        try {
          var init = { method: 'POST', headers: {} };
          if (username) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify({ username: username }); }
          var res = await fetch('/webauthn/login/options', init);
          if (!res.ok) { alert('Failed to start passkey login'); return; }
          var options = await res.json();
          options.challenge = b64urlToBuf(options.challenge);
          if (Array.isArray(options.allowCredentials)) {
            options.allowCredentials = options.allowCredentials.map(function(c){ return { type: c.type, id: b64urlToBuf(c.id), transports: c.transports }; });
          }
          var cred = await navigator.credentials.get({ publicKey: options });
          var data = {
            id: cred.id,
            type: cred.type,
            rawId: bufToB64url(cred.rawId),
            response: {
              clientDataJSON: bufToB64url(cred.response.clientDataJSON),
              authenticatorData: bufToB64url(cred.response.authenticatorData),
              signature: bufToB64url(cred.response.signature),
              userHandle: cred.response.userHandle ? bufToB64url(cred.response.userHandle) : null,
            }
          };
          var vr = await fetch('/webauthn/login/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
          if (vr.ok) { location.href = '/'; } else { alert('Passkey login failed'); }
        } catch (e) { alert('Passkey get() failed'); }
      }
      function startPasskeyLogin(ev) {
        ev.preventDefault();
        var u = (document.getElementById('login-passkey-username').value || '').trim();
        var fn = window.passkeyLogin || loginPasskeyLocal;
        fn(u || null);
        return false;
      }
    </script>
    <script type="module">
      function b64urlToBuf(b64url){
        const b64 = b64url.replace(/-/g,'+').replace(/_/g,'/');
        const pad = '='.repeat((4 - b64.length % 4) % 4);
        const str = atob(b64 + pad);
        const bytes = new Uint8Array(str.length);
        for (let i=0;i<str.length;i++) bytes[i] = str.charCodeAt(i);
        return bytes.buffer;
      }
      function bufToB64url(buf){
        const bytes = new Uint8Array(buf);
        let bin=''; for (let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      }
      window.passkeyLogin = async function passkeyLogin(username){
        const init = { method: 'POST', headers: {} };
        if (username) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify({ username }); }
        const res = await fetch('/webauthn/login/options', init);
        if (!res.ok) { alert('Failed to start passkey login'); return; }
        const options = await res.json();
        options.challenge = b64urlToBuf(options.challenge);
        if (Array.isArray(options.allowCredentials)) {
          options.allowCredentials = options.allowCredentials.map(function(c){ return { type: c.type, id: b64urlToBuf(c.id), transports: c.transports }; });
        }
        let cred;
        try { cred = await navigator.credentials.get({ publicKey: options }); }
        catch (e) { alert('Passkey get() failed'); return; }
        const data = {
          id: cred.id,
          type: cred.type,
          rawId: bufToB64url(cred.rawId),
          response: {
            clientDataJSON: bufToB64url(cred.response.clientDataJSON),
            authenticatorData: bufToB64url(cred.response.authenticatorData),
            signature: bufToB64url(cred.response.signature),
            userHandle: cred.response.userHandle ? bufToB64url(cred.response.userHandle) : null,
          }
        };
        const vr = await fetch('/webauthn/login/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        if (vr.ok) { location.href = '/'; } else { alert('Passkey login failed'); }
      }
    </script>
  </head>
  <body>
    <h1>Login</h1>
    <button type="button" onclick="togglePasskeyLogin()">passkey</button>
    <button>social</button>
    <button type="button" id="password-btn" onclick="showPassword()">password</button>
    <button>phone</button>
    <form id="password-form" method="POST" style="display:none;">
      <input name="username" placeholder="username" required />
      <input name="password" type="password" placeholder="password" required />
      <button type="submit">log in</button>
    </form>
    <form id="passkey-login-form" onsubmit="return startPasskeyLogin(event)" style="display:none; margin-top:8px;">
      <input id="login-passkey-username" placeholder="username (optional)" />
      <button type="submit">Use Passkey</button>
    </form>
    <p><a href="/signup">Go to sign up</a></p>
  </body>
</html>`;
}

function signupPage() {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Sign Up</title>
    <link rel="icon" type="image/svg+xml" href="https://assets.zem.systems/favicon/favicon.svg">
    <link rel="icon" type="image/png" sizes="96x96" href="https://assets.zem.systems/favicon/favicon-96x96.png">
    <link rel="shortcut icon" href="https://assets.zem.systems/favicon/favicon.ico">
    <link rel="apple-touch-icon" href="https://assets.zem.systems/favicon/apple-touch-icon.png">
    <link rel="manifest" href="/site.webmanifest">
    <script>
      function showPassword() {
        document.getElementById('password-form').style.display = 'block';
      }
      function showPasskey() {
        document.getElementById('passkey-form').style.display = 'block';
        document.getElementById('pk-username').focus();
      }
      function b64urlToBuf(b64url){
        var b64 = b64url.replace(/-/g,'+').replace(/_/g,'/');
        var pad = '='.repeat((4 - b64.length % 4) % 4);
        var str = atob(b64 + pad);
        var bytes = new Uint8Array(str.length);
        for (var i=0;i<str.length;i++) bytes[i] = str.charCodeAt(i);
        return bytes.buffer;
      }
      function bufToB64url(buf){
        var bytes = new Uint8Array(buf);
        var bin=''; for (var i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      }
      async function registerPasskeyLocal(ev){
        ev.preventDefault();
        var username = (document.getElementById('pk-username').value||'').trim();
        if (!username) { alert('Enter a username'); return false; }
        var res = await fetch('/webauthn/register/options', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: username }) });
        if (!res.ok) { alert('Failed to start registration'); return false; }
        var options = await res.json();
        options.challenge = b64urlToBuf(options.challenge);
        options.user.id = b64urlToBuf(options.user.id);
        if (Array.isArray(options.excludeCredentials)) {
          options.excludeCredentials = options.excludeCredentials.map(function(c){ return { type: c.type, id: b64urlToBuf(c.id), transports: c.transports }; });
        }
        try {
          var cred = await navigator.credentials.create({ publicKey: options });
          var data = {
            id: cred.id,
            type: cred.type,
            rawId: bufToB64url(cred.rawId),
            response: {
              clientDataJSON: bufToB64url(cred.response.clientDataJSON),
              attestationObject: bufToB64url(cred.response.attestationObject),
            },
            username: username,
          };
          var vr = await fetch('/webauthn/register/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
          if (vr.ok) { location.href = '/'; } else { alert('Registration failed'); }
        } catch (e) { alert('Passkey create() failed'); }
        return false;
      }
    </script>
    <script type="module"></script>
  </head>
  <body>
    <h1>Sign Up</h1>
    <button type="button" onclick="showPasskey()">passkey</button>
    <button>social</button>
    <button type="button" id="password-btn" onclick="showPassword()">password</button>
    <button>phone</button>
    <form id="password-form" method="POST" style="display:none;">
      <input name="username" placeholder="username" required />
      <input name="password" type="password" placeholder="password" required />
      <button type="submit">sign up</button>
    </form>
    <form id="passkey-form" onsubmit="return registerPasskeyLocal(event)" style="display:none; margin-top:8px;">
      <input id="pk-username" placeholder="username" required />
      <button type="submit">Register with Passkey</button>
    </form>
    <p><a href="/login">Go to login</a></p>
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

function youtubeEmbedHTML(url, linkId) {
  try {
    const u = new URL(url);
    let vid = null;
    if (u.hostname.includes('youtu.be')) {
      vid = u.pathname.slice(1);
    } else if (u.hostname.includes('youtube.com')) {
      if (u.pathname.startsWith('/watch')) vid = u.searchParams.get('v');
      else if (u.pathname.startsWith('/shorts/')) vid = u.pathname.split('/')[2];
      else if (u.pathname.startsWith('/embed/')) vid = u.pathname.split('/')[2];
    }
    if (!vid) return null;
    const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(vid)}?enablejsapi=1&rel=0`;
    return `<iframe class="yt-embed" data-link-id="${escapeHtml(linkId)}" width="360" height="203" src="${src}" title="YouTube video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
  } catch (_) {
    return null;
  }
}

function tiktokEmbedHTML(url, linkId) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host.includes('tiktok.com')) {
      // Pattern: /@username/video/VIDEO_ID
      const parts = u.pathname.split('/').filter(Boolean);
      const idx = parts.findIndex((p) => p === 'video');
      if (idx !== -1 && parts[idx + 1]) {
        const videoId = parts[idx + 1];
        const cite = url;
        return `<blockquote class="tiktok-embed" cite="${escapeHtml(cite)}" data-video-id="${escapeHtml(videoId)}" style="max-width: 360px; min-width: 225px;" data-link-id="${escapeHtml(linkId)}"><section></section></blockquote>`;
      }
    }
    return null;
  } catch (_) {
    return null;
  }
}

function renderVideoHTML(link) {
  const yt = youtubeEmbedHTML(link.url, link.id);
  if (yt) return yt;
  const tt = tiktokEmbedHTML(link.url, link.id);
  if (tt) return tt;
  return `<a href="/links/open?id=${escapeHtml(link.id)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.url)}</a>`;
}

function homePage(username, opts = {}) {
  const { outgoing = [], incoming = [], approved = [], inbox = [], sent = [] } = opts;
  const hasPending = incoming.length > 0 || outgoing.some((o) => o.status === 'pending');
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Home</title>
    <link rel="icon" type="image/svg+xml" href="https://assets.zem.systems/favicon/favicon.svg">
    <link rel="icon" type="image/png" sizes="96x96" href="https://assets.zem.systems/favicon/favicon-96x96.png">
    <link rel="shortcut icon" href="https://assets.zem.systems/favicon/favicon.ico">
    <link rel="apple-touch-icon" href="https://assets.zem.systems/favicon/apple-touch-icon.png">
    <link rel="manifest" href="/site.webmanifest">
    <script>
      function toggleAddFriend() {
        var f = document.getElementById('add-friend-form');
        f.style.display = f.style.display === 'none' ? 'block' : 'none';
        if (f.style.display === 'block') document.getElementById('friend_username').focus();
      }
      // YouTube embed play tracking -> POST /links/watched
      var ytPlayers = [];
      function onYouTubeIframeAPIReady() {
        var iframes = document.querySelectorAll('iframe.yt-embed');
        for (var i = 0; i < iframes.length; i++) {
          (function(fr){
            var linkId = fr.getAttribute('data-link-id');
            var p = new YT.Player(fr, {
              events: {
                onStateChange: function(e){
                  if (e.data === 1 && fr.getAttribute('data-played') !== '1') {
                    fr.setAttribute('data-played','1');
                    var fd = new FormData();
                    fd.append('link_id', linkId);
                    fetch('/links/watched', { method: 'POST', body: fd, credentials: 'same-origin' });
                  }
                }
              }
            });
            ytPlayers.push(p);
          })(iframes[i]);
        }
      }
      (function(){
        var tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        var first = document.getElementsByTagName('script')[0];
        first.parentNode.insertBefore(tag, first);
        window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;
      })();

      // Convert YouTube links in inbox to embeds
      document.addEventListener('DOMContentLoaded', function(){
        var anchors = document.querySelectorAll('section ul li a[href^="/links/open?id="]');
        for (var i=0;i<anchors.length;i++){
          var a = anchors[i];
          var linkId = (new URL(a.getAttribute('href'), window.location.origin)).searchParams.get('id');
          var urlText = a.textContent || '';
          try{
            var u = new URL(urlText);
            var host = u.hostname || '';
            var vid = null;
            if (host.indexOf('youtu.be') !== -1) { vid = u.pathname.slice(1); }
            else if (host.indexOf('youtube.com') !== -1) {
              if (u.pathname.indexOf('/watch') === 0) vid = u.searchParams.get('v');
              else if (u.pathname.indexOf('/shorts/') === 0) vid = u.pathname.split('/')[2];
              else if (u.pathname.indexOf('/embed/') === 0) vid = u.pathname.split('/')[2];
            }
            if (vid) {
              var iframe = document.createElement('iframe');
              iframe.className = 'yt-embed';
              iframe.setAttribute('data-link-id', linkId);
              iframe.width = '360';
              iframe.height = '203';
              iframe.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(vid) + '?enablejsapi=1&rel=0';
              iframe.title = 'YouTube video';
              iframe.frameBorder = '0';
              iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
              iframe.allowFullscreen = true;
              a.insertAdjacentElement('afterend', iframe);
            }
          }catch(e){}
        }

        // Ensure TikTok embed.js is present
        var ttScript = document.querySelector('script[src^="https://www.tiktok.com/embed.js"]');
        if (!ttScript) {
          ttScript = document.createElement('script');
          ttScript.src = 'https://www.tiktok.com/embed.js';
          ttScript.async = true;
          document.head.appendChild(ttScript);
        }

        // Convert TikTok links to embed blockquotes if possible
        var tiktokAnchors = document.querySelectorAll('section ul li a[href^="/links/open?id="]');
        for (var j=0;j<tiktokAnchors.length;j++){
          var ta = tiktokAnchors[j];
          var linkId2 = (new URL(ta.getAttribute('href'), window.location.origin)).searchParams.get('id');
          var urlText2 = ta.textContent || '';
          try{
            var u2 = new URL(urlText2);
            if (u2.hostname.indexOf('tiktok.com') !== -1 && u2.pathname.indexOf('/video/') !== -1) {
              var parts = u2.pathname.split('/').filter(Boolean);
              var idx = parts.indexOf('video');
              if (idx !== -1 && parts[idx+1]){
                var videoId2 = parts[idx+1];
                var bq = document.createElement('blockquote');
                bq.className = 'tiktok-embed';
                bq.setAttribute('cite', urlText2);
                bq.setAttribute('data-video-id', videoId2);
                bq.setAttribute('data-link-id', linkId2);
                bq.style.maxWidth = '360px';
                bq.style.minWidth = '225px';
                var sec = document.createElement('section');
                bq.appendChild(sec);
                ta.insertAdjacentElement('afterend', bq);
              }
            }
          }catch(e){}
        }
      });
    </script>
  </head>
  <body>
    <h1>Home</h1>
    <p>Logged in as <strong>${escapeHtml(username)}</strong></p>
    <nav style="margin: 8px 0;">
      <a href="/saved"><button type="button">Saved</button></a>
      <a href="/history"><button type="button">History</button></a>
    </nav>
    <button type="button" onclick="toggleAddFriend()">Add Friend</button>
    <form id="add-friend-form" method="POST" action="/friends/add" style="display:none;margin-top:8px;">
      <input id="friend_username" name="friend_username" placeholder="friend's username" required />
      <button type="submit">Add</button>
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
    <section>
      <h2>Videos Shared With You</h2>
      <ul>
        ${inbox
          .map(
            (v) => `
          <li>
            <a href="/links/open?id=${escapeHtml(v.id)}" target="_blank" rel="noopener noreferrer">${escapeHtml(v.url)}</a>
            — from <strong>${escapeHtml(v.sender_username)}</strong>
            <form method="POST" action="/links/react" style="display:inline; margin-left:8px;">
              <input type="hidden" name="link_id" value="${escapeHtml(v.id)}" />
              <button type="submit" name="reaction" value="❤️" title="Heart">❤️</button>
            </form>
            <form method="POST" action="/links/react" style="display:inline; margin-left:4px;">
              <input type="hidden" name="link_id" value="${escapeHtml(v.id)}" />
              <button type="submit" name="reaction" value="👍" title="Thumbs up">👍</button>
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
      <button type="submit">logout</button>
    </form>
  </body>
</html>`;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (req.method === 'GET' && url.pathname === '/login') {
      return new Response(loginPage(), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' },
      });
    }

    // Favicon and manifest endpoints
    if (req.method === 'GET' && url.pathname === '/favicon.ico') {
      return Response.redirect('https://assets.zem.systems/favicon/favicon.ico', 302);
    }
    if (req.method === 'GET' && url.pathname === '/favicon.svg') {
      return Response.redirect('https://assets.zem.systems/favicon/favicon.svg', 302);
    }
    if (req.method === 'GET' && url.pathname === '/apple-touch-icon.png') {
      return Response.redirect('https://assets.zem.systems/favicon/apple-touch-icon.png', 302);
    }
    if (req.method === 'GET' && url.pathname === '/favicon-96x96.png') {
      return Response.redirect('https://assets.zem.systems/favicon/favicon-96x96.png', 302);
    }
    if (req.method === 'GET' && url.pathname === '/site.webmanifest') {
      const manifest = {
        name: 'vidshare',
        short_name: 'vidshare',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#000000',
        icons: [
          { src: 'https://assets.zem.systems/favicon/web-app-manifest-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'https://assets.zem.systems/favicon/web-app-manifest-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      };
      return new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/manifest+json' } });
    }

    if (req.method === 'POST' && url.pathname === '/login') {
      return handleLogin(req, env);
    }

    if (req.method === 'GET' && url.pathname === '/signup') {
      return new Response(signupPage(), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' },
      });
    }

    if (req.method === 'POST' && url.pathname === '/signup') {
      return handleSignup(req, env);
    }

    if (req.method === 'GET' && url.pathname === '/') {
      return handleHome(req, env);
    }

    if (req.method === 'GET' && url.pathname === '/saved') {
      return handleSaved(req, env);
    }

    if (req.method === 'GET' && url.pathname === '/history') {
      return handleHistory(req, env);
    }

    if (req.method === 'POST' && url.pathname === '/logout') {
      return handleLogout(req, env);
    }

    if (req.method === 'POST' && url.pathname === '/auth/refresh') {
      return handleRefresh(req, env);
    }

    if (req.method === 'POST' && url.pathname === '/webauthn/register/options') {
      return webauthnRegisterOptions(req, env);
    }
    if (req.method === 'POST' && url.pathname === '/webauthn/register/verify') {
      return webauthnRegisterVerify(req, env);
    }
    if (req.method === 'POST' && url.pathname === '/webauthn/login/options') {
      return webauthnLoginOptions(req, env);
    }
    if (req.method === 'POST' && url.pathname === '/webauthn/login/verify') {
      return webauthnLoginVerify(req, env);
    }

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
      return handleLinkSend(req, env);
    }

    if (req.method === 'POST' && url.pathname === '/links/react') {
      return handleLinkReact(req, env);
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

  const headers = new Headers({ Location: '/' });
  headers.append('Set-Cookie', cookie('session', sessionId, { httpOnly: true, sameSite: 'Lax', path: '/' }));
  headers.append('Set-Cookie', cookie('jwt', jwt, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 15 * 60 }));
  headers.append('Set-Cookie', cookie('refresh', refreshToken, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 60 * 24 * 60 * 60 }));
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
  const headers = new Headers({ Location: '/' });
  headers.append('Set-Cookie', cookie('session', sessionId, { httpOnly: true, sameSite: 'Lax', path: '/' }));
  headers.append('Set-Cookie', cookie('jwt', jwt, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 15 * 60 }));
  headers.append('Set-Cookie', cookie('refresh', refreshToken, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 60 * 24 * 60 * 60 }));
  return new Response(null, { status: 302, headers });
}

async function handleHome(req, env) {
  // Prefer JWT; only fall back to DB when claim missing
  const jwtToken = getCookie(req, 'jwt');
  if (jwtToken) {
    try {
      const payload = await verifyJWT(jwtToken, env);
      const nameFromJwt = payload && payload.username;
      const idFromJwt = payload && payload.sub;
      if (nameFromJwt && idFromJwt && env && env.vidshare) {
        const lists = await fetchFriendLists(env, idFromJwt);
        const inbox = await fetchInboxLinks(env, idFromJwt);
        const sent = await fetchSentLinks(env, idFromJwt);
        return new Response(homePage(nameFromJwt, { ...lists, inbox, sent }), {
          headers: { 'Content-Type': 'text/html;charset=UTF-8' },
        });
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
          return new Response(homePage(row.username, { ...lists, inbox, sent }), {
            headers: { 'Content-Type': 'text/html;charset=UTF-8' },
          });
        }
      }
    } catch (_) {
      // Invalid/expired JWT: do not fall back per request
    }
  }
  return new Response(null, { status: 302, headers: { Location: '/login' } });
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
    <meta charset="UTF-8" />
    <title>Saved</title>
    <link rel="icon" type="image/svg+xml" href="https://assets.zem.systems/favicon/favicon.svg">
    <link rel="icon" type="image/png" sizes="96x96" href="https://assets.zem.systems/favicon/favicon-96x96.png">
    <link rel="shortcut icon" href="https://assets.zem.systems/favicon/favicon.ico">
    <link rel="apple-touch-icon" href="https://assets.zem.systems/favicon/apple-touch-icon.png">
    <link rel="manifest" href="/site.webmanifest">
    <script>
      var ytPlayers = [];
      function onYouTubeIframeAPIReady() {
        var iframes = document.querySelectorAll('iframe.yt-embed');
        for (var i = 0; i < iframes.length; i++) {
          (function(fr){
            var linkId = fr.getAttribute('data-link-id');
            var p = new YT.Player(fr, { events: { onStateChange: function(e){ if (e.data === 1 && fr.getAttribute('data-played') !== '1') { fr.setAttribute('data-played','1'); var fd=new FormData(); fd.append('link_id', linkId); fetch('/links/watched', { method: 'POST', body: fd, credentials: 'same-origin' }); } } } });
            ytPlayers.push(p);
          })(iframes[i]);
        }
      }
      (function(){ var s=document.createElement('script'); s.src='https://www.youtube.com/iframe_api'; var f=document.getElementsByTagName('script')[0]; f.parentNode.insertBefore(s,f); window.onYouTubeIframeAPIReady=onYouTubeIframeAPIReady; })();
      (function(){ var t=document.createElement('script'); t.src='https://www.tiktok.com/embed.js'; t.async=true; document.head.appendChild(t); })();
    </script>
  </head>
  <body>
    <h1>Saved</h1>
    <p>Logged in as <strong>${escapeHtml(username)}</strong></p>
    <nav style="margin:8px 0;">
      <a href="/"><button type="button">Home</button></a>
      <a href="/history"><button type="button">History</button></a>
    </nav>
    <ul>
      ${list.map(v => `
        <li>
          ${youtubeEmbedHTML(v.url, v.id) || tiktokEmbedHTML(v.url, v.id) || `<a href="/links/open?id=${escapeHtml(v.id)}" target="_blank" rel="noopener noreferrer">${escapeHtml(v.url)}</a>`}
          - from <strong>${escapeHtml(v.sender_username)}</strong>
          ${v.reaction ? ` - Your reaction: ${escapeHtml(v.reaction)}` : ''}
        </li>`).join('')}
    </ul>
  </body>
</html>`;
}

function historyPage(username, list) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>History</title>
    <link rel="icon" type="image/svg+xml" href="https://assets.zem.systems/favicon/favicon.svg">
    <link rel="icon" type="image/png" sizes="96x96" href="https://assets.zem.systems/favicon/favicon-96x96.png">
    <link rel="shortcut icon" href="https://assets.zem.systems/favicon/favicon.ico">
    <link rel="apple-touch-icon" href="https://assets.zem.systems/favicon/apple-touch-icon.png">
    <link rel="manifest" href="/site.webmanifest">
    <script>
      var ytPlayers = [];
      function onYouTubeIframeAPIReady() {
        var iframes = document.querySelectorAll('iframe.yt-embed');
        for (var i = 0; i < iframes.length; i++) {
          (function(fr){
            var linkId = fr.getAttribute('data-link-id');
            var p = new YT.Player(fr, { events: { onStateChange: function(e){ if (e.data === 1 && fr.getAttribute('data-played') !== '1') { fr.setAttribute('data-played','1'); var fd=new FormData(); fd.append('link_id', linkId); fetch('/links/watched', { method: 'POST', body: fd, credentials: 'same-origin' }); } } } });
            ytPlayers.push(p);
          })(iframes[i]);
        }
      }
      (function(){ var s=document.createElement('script'); s.src='https://www.youtube.com/iframe_api'; var f=document.getElementsByTagName('script')[0]; f.parentNode.insertBefore(s,f); window.onYouTubeIframeAPIReady=onYouTubeIframeAPIReady; })();
      (function(){ var t=document.createElement('script'); t.src='https://www.tiktok.com/embed.js'; t.async=true; document.head.appendChild(t); })();
    </script>
  </head>
  <body>
    <h1>History</h1>
    <p>Logged in as <strong>${escapeHtml(username)}</strong></p>
    <nav style="margin:8px 0;">
      <a href="/"><button type="button">Home</button></a>
      <a href="/saved"><button type="button">Saved</button></a>
    </nav>
    <ul>
      ${list.map(v => `
        <li>
          ${youtubeEmbedHTML(v.url, v.id) || tiktokEmbedHTML(v.url, v.id) || `<a href="/links/open?id=${escapeHtml(v.id)}" target="_blank" rel="noopener noreferrer">${escapeHtml(v.url)}</a>`}
          - from <strong>${escapeHtml(v.sender_username)}</strong>
          ${v.reaction ? ` - Your reaction: ${escapeHtml(v.reaction)}` : ''}
        </li>`).join('')}
    </ul>
  </body>
</html>`;
}

async function handleSaved(req, env) {
  const me = await getAuthUser(req, env);
  if (!me || !env || !env.vidshare) return new Response(null, { status: 302, headers: { Location: '/login' } });
  const list = await fetchSavedLinks(env, me.userId);
  return new Response(savedPage(me.username || '', list), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

async function handleHistory(req, env) {
  const me = await getAuthUser(req, env);
  if (!me || !env || !env.vidshare) return new Response(null, { status: 302, headers: { Location: '/login' } });
  const list = await fetchHistoryLinks(env, me.userId);
  return new Response(historyPage(me.username || '', list), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
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

async function handleLinkSend(req, env) {
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
  await env.vidshare
    .prepare('INSERT INTO links (id, url, sender_id, recipient_id, created_at, watched, saved) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
    .bind(crypto.randomUUID(), videoUrl, me.userId, recipientId, now, 0, 0)
    .run();
  return new Response(null, { status: 302, headers: { Location: '/' } });
}

async function handleLinkReact(req, env) {
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

// ========== WebAuthn routes ==========
function getRpIdFromUrl(reqUrl) {
  try { return new URL(reqUrl).hostname; } catch { return null; }
}

function makeChallenge(bytes=32) {
  const b = new Uint8Array(bytes); crypto.getRandomValues(b); return base64url(b);
}

async function webauthnRegisterOptions(req, env) {
  const { username } = await req.json();
  if (!username) return new Response('Bad request', { status: 400 });
  // Ensure username is not taken
  const existing = await env.vidshare
    .prepare('SELECT id FROM users WHERE lower(username) = lower(?1)')
    .bind(username)
    .first();
  if (existing) return new Response('Username taken', { status: 409 });
  const rpId = getRpIdFromUrl(req.url);
  const challenge = makeChallenge();
  const userId = base64url(crypto.getRandomValues(new Uint8Array(16)));
  const options = {
    challenge,
    rp: { id: rpId, name: 'vidshare' },
    user: { id: userId, name: username, displayName: username },
    pubKeyCredParams: [ { type: 'public-key', alg: -7 }, { type: 'public-key', alg: -8 } ],
    timeout: 60000,
    attestation: 'none',
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  };
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', cookie('wa_reg_chal', challenge, { httpOnly: true, sameSite: 'Lax', path: '/' }));
  headers.append('Set-Cookie', cookie('wa_reg_user', encodeURIComponent(username), { httpOnly: true, sameSite: 'Lax', path: '/' }));
  return new Response(JSON.stringify(options), { headers });
}

async function webauthnRegisterVerify(req, env) {
  const body = await req.json();
  const regChal = getCookie(req, 'wa_reg_chal');
  const cookieUser = getCookie(req, 'wa_reg_user');
  const claimedUsername = body.username || (cookieUser ? decodeURIComponent(cookieUser) : null);
  if (!regChal || !claimedUsername) return new Response('Challenge missing', { status: 400 });
  const clientData = base64urlToUint8(body.response.clientDataJSON);
  const client = JSON.parse(new TextDecoder().decode(clientData));
  if (client.type !== 'webauthn.create') return new Response('Bad type', { status: 400 });
  const chalFromClient = atob(client.challenge.replace(/-/g,'+').replace(/_/g,'/'));
  const chalRaw = atob(regChal.replace(/-/g,'+').replace(/_/g,'/'));
  if (chalFromClient !== chalRaw) return new Response('Bad challenge', { status: 400 });
  // Parse attestationObject
  const att = base64urlToUint8(body.response.attestationObject);
  const attObj = cborDecode(att);
  const authData = attObj['authData'];
  const parsed = parseAuthData(authData);
  const rpId = getRpIdFromUrl(req.url);
  const rpHash = await sha256Bytes(new TextEncoder().encode(rpId));
  if (!parsed.rpIdHash || base64url(parsed.rpIdHash) !== base64url(rpHash)) return new Response('RP mismatch', { status: 400 });
  if (!hasUserPresent(parsed.flags)) return new Response('UP required', { status: 400 });
  if (!parsed.credId || !parsed.coseKey) return new Response('No credential', { status: 400 });
  const jwk = coseToJwk(parsed.coseKey);
  const credIdB64 = base64url(parsed.credId);

  // Create user and credential
  const now = Math.floor(Date.now()/1000);
  const userId = crypto.randomUUID();
  const credId = crypto.randomUUID();
  await env.vidshare
    .prepare('INSERT INTO users (id, username, created_at, last_login) VALUES (?1, ?2, ?3, ?4)')
    .bind(userId, claimedUsername, now, now)
    .run();
  await env.vidshare
    .prepare('INSERT INTO credentials (id, user_id, type, identifier, external_id, public_key, sign_count, created_at, last_used) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)')
    .bind(credId, userId, 'passkey', claimedUsername, credIdB64, JSON.stringify(jwk), parsed.signCount||0, now, now)
    .run();

  // Create session + cookies
  const sessionId = crypto.randomUUID();
  const ua = req.headers.get('User-Agent') || '';
  const expiresAt = now + 60 * 24 * 60 * 60;
  const refreshToken = randomTokenB64(32);
  const refreshHash = await sha256B64(refreshToken);
  const jwt = await createJWT({ sub: userId, username: claimedUsername, iat: now, exp: now + 15*60 }, env);
  await env.vidshare
    .prepare('INSERT INTO sessions (id, user_id, refresh_hash, created_at, expires_at, user_agent, last_rotated_at, rotation_count) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)')
    .bind(sessionId, userId, refreshHash, now, expiresAt, ua, now, 0)
    .run();
  const headers = new Headers({ Location: '/' });
  headers.append('Set-Cookie', cookie('session', sessionId, { httpOnly: true, sameSite: 'Lax', path: '/' }));
  headers.append('Set-Cookie', cookie('jwt', jwt, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 15*60 }));
  headers.append('Set-Cookie', cookie('refresh', refreshToken, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 60*24*60*60 }));
  headers.append('Set-Cookie', cookie('wa_reg_chal', '', { httpOnly:true, path:'/', maxAge:0 }));
  headers.append('Set-Cookie', cookie('wa_reg_user', '', { httpOnly:true, path:'/', maxAge:0 }));
  return new Response(null, { status: 302, headers });
}

async function webauthnLoginOptions(req, env) {
  const rpId = getRpIdFromUrl(req.url);
  const challenge = makeChallenge();
  let options = {
    challenge,
    rpId,
    timeout: 60000,
    userVerification: 'preferred',
    // allow resident/discoverable creds by omitting allowCredentials
  };
  try {
    if (req.headers.get('Content-Type') && req.headers.get('Content-Type').includes('application/json')) {
      const body = await req.json();
      const username = body && typeof body.username === 'string' ? body.username.trim() : '';
      if (username) {
        const creds = await env.vidshare
          .prepare('SELECT c.external_id FROM credentials c JOIN users u ON u.id = c.user_id WHERE c.type = ?1 AND lower(u.username) = lower(?2)')
          .bind('passkey', username)
          .all();
        const arr = (creds.results || creds || []).map((r) => ({ type: 'public-key', id: r.external_id, transports: ['internal'] }));
        if (arr.length) options.allowCredentials = arr;
      }
    }
  } catch (_) {}
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', cookie('wa_auth_chal', challenge, { httpOnly: true, sameSite: 'Lax', path: '/' }));
  return new Response(JSON.stringify(options), { headers });
}

async function webauthnLoginVerify(req, env) {
  const chal = getCookie(req, 'wa_auth_chal');
  if (!chal) return new Response('Challenge missing', { status: 400 });
  const body = await req.json();
  const clientData = base64urlToUint8(body.response.clientDataJSON);
  const client = JSON.parse(new TextDecoder().decode(clientData));
  if (client.type !== 'webauthn.get') return new Response('Bad type', { status: 400 });
  const chalFromClient = atob(client.challenge.replace(/-/g,'+').replace(/_/g,'/'));
  const chalRaw = atob(chal.replace(/-/g,'+').replace(/_/g,'/'));
  if (chalFromClient !== chalRaw) return new Response('Bad challenge', { status: 400 });
  const authData = base64urlToUint8(body.response.authenticatorData);
  const sig = base64urlToUint8(body.response.signature);
  const parsed = parseAuthData(authData);
  const rpId = getRpIdFromUrl(req.url);
  const rpHash = await sha256Bytes(new TextEncoder().encode(rpId));
  if (!parsed.rpIdHash || base64url(parsed.rpIdHash) !== base64url(rpHash)) return new Response('RP mismatch', { status: 400 });
  if (!hasUserPresent(parsed.flags)) return new Response('UP required', { status: 400 });

  // Lookup credential by external_id from body.rawId
  const rawIdB64 = body.rawId; // already b64url from client
  const credRow = await env.vidshare
    .prepare('SELECT credentials.id as cred_id, credentials.user_id, credentials.public_key, credentials.sign_count, users.username FROM credentials JOIN users ON users.id = credentials.user_id WHERE credentials.type = ?1 AND credentials.external_id = ?2')
    .bind('passkey', rawIdB64)
    .first();
  if (!credRow) return new Response('Unknown credential', { status: 404 });
  const jwk = JSON.parse(credRow.public_key);
  const ok = await verifyAssertionSignature(jwk, authData, clientData, sig);
  if (!ok) return new Response('Bad signature', { status: 401 });

  // Update counters and issue session
  const now = Math.floor(Date.now()/1000);
  await env.vidshare
    .prepare('UPDATE credentials SET last_used = ?1, sign_count = ?2 WHERE id = ?3')
    .bind(now, parsed.signCount || credRow.sign_count, credRow.cred_id)
    .run();
  await env.vidshare
    .prepare('UPDATE users SET last_login = ?1 WHERE id = ?2')
    .bind(now, credRow.user_id)
    .run();

  const sessionId = crypto.randomUUID();
  const ua = req.headers.get('User-Agent') || '';
  const expiresAt = now + 60 * 24 * 60 * 60;
  const refreshToken = randomTokenB64(32);
  const refreshHash = await sha256B64(refreshToken);
  const jwt = await createJWT({ sub: credRow.user_id, username: credRow.username, iat: now, exp: now + 15*60 }, env);
  await env.vidshare
    .prepare('INSERT INTO sessions (id, user_id, refresh_hash, created_at, expires_at, user_agent, last_rotated_at, rotation_count) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)')
    .bind(sessionId, credRow.user_id, refreshHash, now, expiresAt, ua, now, 0)
    .run();
  const headers = new Headers({ Location: '/' });
  headers.append('Set-Cookie', cookie('session', sessionId, { httpOnly: true, sameSite: 'Lax', path: '/' }));
  headers.append('Set-Cookie', cookie('jwt', jwt, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 15*60 }));
  headers.append('Set-Cookie', cookie('refresh', refreshToken, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 60*24*60*60 }));
  headers.append('Set-Cookie', cookie('wa_auth_chal', '', { httpOnly:true, path:'/', maxAge:0 }));
  return new Response(null, { status: 302, headers });
}

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
  const headers = new Headers();
  headers.append('Set-Cookie', cookie('jwt', jwt, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 15 * 60 }));
  headers.append('Set-Cookie', cookie('refresh', newRefreshToken, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 60 * 24 * 60 * 60 }));
  return new Response(null, { status: 204, headers });
}

// ========== WebAuthn helpers ==========
function b64url(bytes) {
  return base64url(bytes);
}

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
    return { kty: 'EC', crv: 'P-256', x: base64url(x), y: base64url(y), ext: true };
  }
  if (kty === 1 && (alg === -8)) { // OKP Ed25519
    const x = cose['-2'];
    return { kty: 'OKP', crv: 'Ed25519', x: base64url(x), ext: true };
  }
  throw new Error('Unsupported COSE key');
}

function hasUserPresent(flags){ return (flags & 0x01) !== 0; }
function hasUserVerified(flags){ return (flags & 0x04) !== 0; }

async function importPublicKeyFromJwk(jwk) {
  if (jwk.kty === 'EC' && jwk.crv === 'P-256') {
    return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  }
  if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519') {
    return crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['verify']);
  }
  throw new Error('Unsupported key');
}

async function verifyAssertionSignature(jwk, authenticatorDataBytes, clientDataJSONBytes, signatureBytes) {
  const clientHash = await sha256Bytes(clientDataJSONBytes);
  const toVerify = new Uint8Array(authenticatorDataBytes.length + clientHash.length);
  toVerify.set(authenticatorDataBytes, 0);
  toVerify.set(clientHash, authenticatorDataBytes.length);
  const key = await importPublicKeyFromJwk(jwk);
  if (jwk.kty === 'EC') {
    return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signatureBytes, toVerify);
  }
  if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519') {
    return crypto.subtle.verify('Ed25519', key, signatureBytes, toVerify);
  }
  return false;
}
