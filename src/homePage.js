import { baseHead, escapeHtml } from './base.js';

export function homePage(username, opts = {}, activeTab = 'home') {
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
        // Fix missing emoji in any pre-rendered reaction buttons
        try {
          var heartBtns = document.querySelectorAll('.react-menu button[title="Heart"]');
          for (var i=0;i<heartBtns.length;i++){ heartBtns[i].textContent='??'; heartBtns[i].setAttribute('data-react','??'); }
          var likeBtns = document.querySelectorAll('.react-menu button[title="Thumbs up"]');
          for (var j=0;j<likeBtns.length;j++){ likeBtns[j].textContent='??'; likeBtns[j].setAttribute('data-react','??'); }
          var fab = document.querySelector('a.fab'); if (fab && (!fab.textContent || fab.textContent==='??')) fab.textContent='??';
        } catch (_) {}
        ensureNotifications();
        // Ensure reaction buttons show proper emoji where missing
        try {
          var heartBtns = document.querySelectorAll('.react-menu button[title="Heart"]');
          for (var i=0;i<heartBtns.length;i++){ heartBtns[i].textContent='??'; heartBtns[i].setAttribute('data-react','??'); }
          var likeBtns = document.querySelectorAll('.react-menu button[title="Thumbs up"]');
          for (var j=0;j<likeBtns.length;j++){ likeBtns[j].textContent='??'; likeBtns[j].setAttribute('data-react','??'); }
        } catch (_) {}
        // Clean up friend selector placeholder text on some encodings
        try {
          var friendSel = document.querySelector('select[name="recipient_id"]');
          if (friendSel) {
            var firstOpt = friendSel.querySelector('option');
            if (firstOpt) firstOpt.remove();
            var placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = 'Select a friend';
            friendSel.insertBefore(placeholder, friendSel.firstChild);
          }
        } catch (_) {}
        // Final emoji normalization using Unicode escapes (robust to encoding)
        try {
          var hb = document.querySelectorAll('button[title="Heart"]');
          for (var ii=0; ii<hb.length; ii++) { hb[ii].textContent='\u2764\uFE0F'; hb[ii].setAttribute('data-react','\u2764\uFE0F'); if (hb[ii].name==='reaction') hb[ii].value='\u2764\uFE0F'; }
          var lb = document.querySelectorAll('button[title="Thumbs up"]');
          for (var jj=0; jj<lb.length; jj++) { lb[jj].textContent='\uD83D\uDC4D'; lb[jj].setAttribute('data-react','\uD83D\uDC4D'); if (lb[jj].name==='reaction') lb[jj].value='\uD83D\uDC4D'; }
          var fab2 = document.querySelector('a.fab'); if (fab2) fab2.textContent='\uD83C\uDFE0';
        } catch (_) {}
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

        // Scroll feed behaviour
        try {
          var feed = document.querySelector('.scroll-feed');
          if (feed) {
            var items = feed.querySelectorAll('.scroll-item');
            var io = new IntersectionObserver(function(entries){
              entries.forEach(function(entry){
                var v = entry.target.querySelector('video');
                if (!v) return;
                if (entry.isIntersecting) { v.play().catch(function(){}); }
                else { v.pause(); }
              });
            }, { root: feed, threshold: 0.6 });
            for (var i=0;i<items.length;i++){ io.observe(items[i]); }

            var pressTimer = null;
            feed.addEventListener('pointerdown', function(e){
              var item = e.target.closest('.scroll-item');
              if (!item) return;
              clearTimeout(pressTimer);
              pressTimer = setTimeout(function(){
                var backdrop = item.querySelector('.react-backdrop');
                var menu = item.querySelector('.react-menu');
                if (backdrop) backdrop.style.display = 'block';
                if (menu) menu.style.display = 'block';
              }, 500);
            });
            function closeMenu(item){
              var backdrop = item.querySelector('.react-backdrop');
              var menu = item.querySelector('.react-menu');
              if (backdrop) backdrop.style.display = 'none';
              if (menu) menu.style.display = 'none';
            }
            feed.addEventListener('pointerup', function(e){
              if (pressTimer){
                clearTimeout(pressTimer);
                var item = e.target.closest('.scroll-item');
                if (!item) return;
                var menu = item.querySelector('.react-menu');
                if (menu && menu.style.display === 'block') return; // already opened via long press
                var v = item.querySelector('video');
                if (v) { v.muted = !v.muted; }
              }
            });
            feed.addEventListener('pointercancel', function(){ clearTimeout(pressTimer); });
            feed.addEventListener('click', function(e){
              var back = e.target.closest('.react-backdrop');
              var item = e.target.closest('.scroll-item');
              if (back && item) { closeMenu(item); }
            });
            feed.addEventListener('click', function(e){
              var btn = e.target.closest('[data-react]');
              if (!btn) return;
              var item = e.target.closest('.scroll-item');
              if (!item) return;
              var linkId = item.getAttribute('data-link-id');
              var val = btn.getAttribute('data-react');
              var fd = new FormData(); fd.append('link_id', linkId); fd.append('reaction', val);
              fetch('/links/react', { method: 'POST', body: fd, credentials: 'same-origin' })
                .then(function(){ closeMenu(item); })
                .catch(function(){ closeMenu(item); });
            });
          }
        } catch (e) {}
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
        <button type="button" class="secondary" id="btn-register-passkey" title="Register a passkey">Add Passkey</button>
      </nav>
      <!-- Tabs removed -->
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
          <option value="">Select friendA�A�A��?sA�A,A�</option>
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
            <div style="color:var(--sub);margin-top:6px">from <strong>${escapeHtml(v.sender_username)}</strong>${v.reaction ? ` A�A�A��?sA�A��,�A? Your reaction: ${escapeHtml(v.reaction)}` : ''}</div>
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
            <strong>${escapeHtml(r.username)}</strong> A�A�A��?sA�A��,�A? pending
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
            <li><strong>${escapeHtml(r.username)}</strong> A�A�A��?sA�A��,�A? declined</li>
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
            A�A�A��?sA�A��,�A? to <strong>${escapeHtml(s.recipient_username)}</strong>
            A�A�A��?sA�A��,�A? Watched: ${s.watched ? 'Yes' : 'No'}
            A�A�A��?sA�A��,�A? Reaction: ${s.reaction ? escapeHtml(s.reaction) : '-'}
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
    
    ${activeTab==='scroll' ? `<a href="/" class="fab" aria-label="Home">🏠</a>` : `<a href="/scroll" class="fab" aria-label="Scroll">🎥</a>`}
  </body>
</html>`;
}
    
