import { baseHead, escapeHtml } from './base.js';

export function scrollPage(username, list) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    ${baseHead('Scroll - VidFriends')}
    <style>
      body{background:#000}
      .scroll-item .react-menu{left:50%;top:50%;right:auto;bottom:auto;transform:translate(-50%,-50%)}
      .fab{display:none!important}
      .fab-rail{position:fixed;right:16px;bottom:16px;width:56px;background:var(--muted);border:1px solid #202a3b;border-radius:28px;box-shadow:0 6px 16px rgba(0,0,0,0.45);display:flex;flex-direction:column;align-items:center;gap:8px;padding:8px 0;z-index:40}
      .fab-rail button,.fab-rail a{width:40px;height:40px;border-radius:20px;display:flex;align-items:center;justify-content:center;background:transparent;color:var(--text);border:0;cursor:pointer;text-decoration:none;font-size:20px;position:relative}
      .fab-rail a.home{font-size:18px}
      .fab-react-panel{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.25);z-index:41}
      .fab-react-panel .panel-box{background:rgba(18,24,38,0.96);border:1px solid #202a3b;border-radius:12px;padding:12px;width:90vw;max-width:640px}
      .fab-react-panel textarea.react-input{width:100%;min-height:36vh;background:var(--surface);border:1px solid #2a3446;color:var(--text);border-radius:10px;padding:12px;resize:vertical}
      .fab-react-panel .row{display:flex;gap:8px;justify-content:flex-end;margin-top:8px}
      .fab-rail button.active{background:#ffffff;color:inherit}
      .scroll-item .react-menu [data-react],
      .scroll-item .react-menu [data-react-send],
      .scroll-item .react-menu .react-input{display:none!important}
    </style>
    <script>
      document.addEventListener('DOMContentLoaded', function(){
        // Normalize any placeholder emoji to proper values
        try {
          var hb = document.querySelectorAll('.react-menu button[title="Heart"]');
          for (var ii=0; ii<hb.length; ii++) { hb[ii].textContent='\u2764\uFE0F'; hb[ii].setAttribute('data-react','\u2764\uFE0F'); }
          var lb = document.querySelectorAll('.react-menu button[title="Thumbs up"]');
          for (var jj=0; jj<lb.length; jj++) { lb[jj].textContent='\uD83D\uDC4D'; lb[jj].setAttribute('data-react','\uD83D\uDC4D'); }
          var fab = document.querySelector('a.fab'); if (fab) fab.textContent='\uD83C\uDFE0';
        } catch (_) {}
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

        // Inject vertical reaction rail and panel
        try {
          var oldFab = document.querySelector('a.fab');
          if (oldFab) { oldFab.style.display = 'none'; }
          var rail = document.createElement('div');
          rail.className = 'fab-rail';
          rail.setAttribute('aria-label','Reactions and Home');
          var HEART = "\\u2764\\uFE0F";
          var LIKE = "\\uD83D\\uDC4D";
          var TEXTICON = "\\uD83D\\uDCAC";
          var PLAY = "\\u25B6\\uFE0F";
          var PAUSE = "\\u23F8\\uFE0F";
          var HOME = "\\uD83C\\uDFE0";
          rail.innerHTML = '<button class="btn-heart" title="Heart">A�A�A,A?A,A\u000fA�A_A,A,A,A?</button>'+
                           '<button class="btn-like" title="Thumbs up">A�A�A.A,A��,�EoA,A?</button>'+
                           '<button class="btn-text" title="Text reaction">A�A�A.A,A��,��,�A,A�</button>'+
                           '<button class="btn-play" title="Play/Pause">A�A�A��,��?oA,A\u0014A�A_A,A,A,A?</button>'+
                           '<a href="/" class="home" aria-label="Home">A�A�A.A,A,A?A,A�</a>';
          document.body.appendChild(rail);
          // Rebuild rail content programmatically to ensure correct emoji rendering
          (function(){
            // Emoji constants as UTF-16 escapes
            var HEART = "\\u2764\\uFE0F";
            var LIKE = "\\uD83D\\uDC4D";
            var TEXTICON = "\\uD83D\\uDCAC";
            var PLAY = "\\u25B6\\uFE0F";
            var HOME = "\\uD83C\\uDFE0";
            rail.innerHTML = '';
            function mk(tag, cls, title, text){ var el = document.createElement(tag); if (cls) el.className=cls; if (title) el.title=title; if (text!=null) el.textContent=text; return el; }
            rail.appendChild(mk('button','btn-heart','Heart',HEART));
            rail.appendChild(mk('button','btn-like','Thumbs up',LIKE));
            rail.appendChild(mk('button','btn-text','Text reaction',TEXTICON));
            rail.appendChild(mk('button','btn-play','Play/Pause',PLAY));
            var h = mk('a','home','Home',HOME); h.href='/'; rail.appendChild(h);
          })();
          var panel = document.createElement('div');
          panel.className = 'fab-react-panel';
          panel.innerHTML = '<div class="panel-box">'+
                              '<textarea class="react-input" placeholder="Add reaction"></textarea>'+
                              '<div class="row">'+
                                '<button class="react-send" data-react-send>A��,�?oA\u000f</button>'+
                              '</div>'+
                            '</div>';
          document.body.appendChild(panel);
          // Rebuild panel content programmatically to avoid encoding issues
          (function(){
            panel.innerHTML = '';
            var box = document.createElement('div'); box.className='panel-box';
            var ta = document.createElement('textarea'); ta.className='react-input'; ta.placeholder='Add reaction';
            var row = document.createElement('div'); row.className='row';
            var send = document.createElement('button'); send.className='react-send'; send.setAttribute('data-react-send',''); send.textContent = "\\uD83D\\uDCE4"; // A��,�?oA\u000f
            row.appendChild(send); box.appendChild(ta); box.appendChild(row); panel.appendChild(box);
          })();

          function getActiveItem(){
            var items = document.querySelectorAll('.scroll-item');
            var midY = window.innerHeight / 2;
            var best = null; var bestDist = Infinity;
            for (var i=0;i<items.length;i++){
              var r = items[i].getBoundingClientRect();
              var center = r.top + r.height/2;
              var dist = Math.abs(center - midY);
              if (dist < bestDist) { bestDist = dist; best = items[i]; }
            }
            return best;
          }
          var reactionMap = Object.create(null);
          function setActiveReactionFor(linkId, val){ reactionMap[linkId] = val; updateHighlights(); }
          function updateHighlights(){
            try{
              var item = getActiveItem(); if (!item) return;
              var linkId = item.getAttribute('data-link-id');
              var val = reactionMap[linkId] || '';
              [heartBtn, likeBtn, textBtn].forEach(function(b){ if(b){ b.classList.remove('active'); }});
              if (val === HEART && heartBtn) heartBtn.classList.add('active');
              else if (val === LIKE && likeBtn) likeBtn.classList.add('active');
              else if (val === 'text' && textBtn) textBtn.classList.add('active');
            }catch(e){}
          }
          function sendReaction(val){
            var item = getActiveItem(); if (!item) return;
            var linkId = item.getAttribute('data-link-id');
            var fd = new FormData(); fd.append('link_id', linkId); fd.append('reaction', val);
            fetch('/links/react', { method:'POST', body: fd, credentials:'same-origin' }).then(function(){ setActiveReactionFor(linkId, val); }).catch(function(){});
          }
          var likeBtn = rail.querySelector('.btn-like');
          var heartBtn = rail.querySelector('.btn-heart');
          var textBtn = rail.querySelector('.btn-text');
          var playBtn = rail.querySelector('.btn-play');
          var panelInput = panel.querySelector('.react-input');
          var panelSend = panel.querySelector('[data-react-send]');
          if (likeBtn) likeBtn.addEventListener('click', function(){ sendReaction(LIKE); });
          if (heartBtn) heartBtn.addEventListener('click', function(){ sendReaction(HEART); });
          if (textBtn) textBtn.addEventListener('click', function(){ panel.style.display = panel.style.display==='block'?'none':'block'; if (panel.style.display==='block' && panelInput) panelInput.focus(); });
          if (panelSend) panelSend.addEventListener('click', function(){
            var item = getActiveItem(); if (!item) return;
            var text = (panelInput.value||'').trim(); if (!text) return;
            var linkId = item.getAttribute('data-link-id');
            var fd = new FormData(); fd.append('link_id', linkId); fd.append('reaction_text', text);
            fetch('/links/react', { method:'POST', body: fd, credentials:'same-origin' }).then(function(){ panelInput.value=''; panel.style.display='none'; setActiveReactionFor(linkId, 'text'); }).catch(function(){});
          });
          function getActiveVideo(){ var it = getActiveItem(); return it ? it.querySelector('video') : null; }
          function updatePlayIcon(){ try{ if (!playBtn) return; var v = getActiveVideo(); playBtn.textContent = (v && !v.paused) ? PAUSE : PLAY; }catch(e){} }
          if (playBtn) playBtn.addEventListener('click', function(){ var v = getActiveVideo(); if (!v) return; if (v.paused) { v.play().catch(function(){}); } else { v.pause(); } updatePlayIcon(); });
          document.addEventListener('click', function(e){
            var inPanel = e.target.closest('.fab-react-panel');
            var inBtn = e.target.closest('.fab-rail .btn-text');
            if (!inPanel && !inBtn) panel.style.display='none';
          });
          // keep UI in sync with current item and playback
          var feedEl = document.querySelector('.scroll-feed');
          function syncUI(){ updatePlayIcon(); updateHighlights(); }
          if (feedEl) feedEl.addEventListener('scroll', function(){ syncUI(); });
          // Also reflect native play/pause events
          var vidsAll = document.querySelectorAll('video.asset-video');
          for (var vi=0; vi<vidsAll.length; vi++){
            vidsAll[vi].addEventListener('play', syncUI);
            vidsAll[vi].addEventListener('pause', syncUI);
          }
          syncUI();
        } catch (e) {}
      });
    </script>
  </head>
  <body>
    <div class="scroll-feed">
      ${list.map(v => `
        <div class=\"scroll-item\" data-link-id=\"${escapeHtml(v.id)}\" data-reaction=\"${escapeHtml(v.reaction || '')}\">\n          <video class=\"asset-video\" data-link-id=\"${escapeHtml(v.id)}\" playsinline preload=\\"none\\" poster=\\"https://assets.vidfriends.app/thumbnails/${escapeHtml(v.id)}.webp\\">\n            <source src=\"https://assets.vidfriends.app/videos/${escapeHtml(v.id)}.mp4\" type=\"video/mp4\">\n          </video>\n          <div class=\"react-backdrop\"></div>\n          <div class=\"react-menu\">\n            <div>\n              <button data-react=\"??\" title=\"Thumbs up\">??</button>
              <button data-react=\"??\" title=\"Heart\">??</button>
            </div>
            <div class=\"row\" style=\"margin-top:8px\">\n              <input class=\"react-input\" placeholder=\"Add reaction\" />\n              <button data-react-send>Send</button>\n            </div>
            <div class=\"row\" style=\"margin-top:8px\">\n              <button class=\"secondary\" data-save=\"${v.saved ? '0' : '1'}\">${v.saved ? 'Unsave' : 'Save'}</button>
              <a class=\"btn secondary\" href=\"https://assets.vidfriends.app/videos/${escapeHtml(v.id)}.mp4\" download target=\"_blank\" rel=\"noopener noreferrer\">Download</a>
            </div>
          </div>\n        </div>
      `).join('')}
    </div>
    <!-- Bottom nav removed; floating action button added -->
    <a href="/" class="fab" aria-label="Home">🏠</a>
  </body>
</html>`;
}
