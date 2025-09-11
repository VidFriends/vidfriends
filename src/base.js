export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function baseHead(title) {
  const styles = `:root{--bg:#0b0f17;--surface:#121826;--muted:#1a2333;--text:#e6edf3;--sub:#a5b1c2;--primary:#6aa1ff;--accent:#19c37d;--danger:#ff5c5c;}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
.container{max-width:720px;margin:0 auto;padding:16px 16px 84px}
h1,h2,h3{margin:0 0 12px 0;font-weight:650}
nav{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
.bottom-nav{position:fixed;left:0;right:0;bottom:0;display:flex;gap:8px;background:var(--surface);border-top:1px solid #202a3b;padding:10px;z-index:20}
.bottom-nav a{flex:1}
.tabs{display:flex;gap:0;border-bottom:1px solid #202a3b;margin:8px 0 12px}
.tabs a{flex:1;text-align:center;padding:10px 12px;color:var(--sub);text-decoration:none;border:1px solid #202a3b;border-bottom:none;border-top-left-radius:12px;border-top-right-radius:12px;background:var(--surface)}
.tabs a.active{background:var(--muted);color:var(--text);font-weight:650}
.fab{position:fixed;right:16px;bottom:16px;width:56px;height:56px;border-radius:50%;background:var(--muted);border:1px solid #202a3b;box-shadow:0 6px 16px rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;color:var(--text);text-decoration:none;font-size:22px;z-index:40}
.fab:hover{filter:brightness(1.05)}
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
.react-menu{position:absolute;inset:auto 12px 12px auto;background:rgba(18,24,38,0.96);border:1px solid #202a3b;border-radius:12px;padding:8px;display:none;z-index:3}
.react-menu button{margin:4px 6px 0 0}
.react-backdrop{display:none;position:absolute;inset:0;background:rgba(0,0,0,0.25);z-index:2;border-radius:10px}
.play-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:1}
.play-btn{width:74px;height:74px;border-radius:50%;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;color:#fff;font-size:30px;box-shadow:0 2px 12px rgba(0,0,0,0.4)}
.row{display:flex;gap:8px;flex-wrap:wrap}
.row > *{flex:1 1 160px}
@media (min-width:480px){.row > *{flex:1}}
@media (max-width:480px){body{font-size:15px}}
`;
  return `
    <meta charset=\"UTF-8\" />
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
    <meta name=\"theme-color\" content=\"#0b0f17\" />
    <title>${escapeHtml(title)}</title>
    <link rel=\"icon\" type=\"image/svg+xml\" href=\"https://assets.vidfriends.app/favicon/favicon.svg\">
    <link rel=\"icon\" type=\"image/png\" sizes=\"96x96\" href=\"https://assets.vidfriends.app/favicon/favicon-96x96.png\">
    <link rel=\"shortcut icon\" href=\"https://assets.vidfriends.app/favicon/favicon.ico\">
    <link rel=\"apple-touch-icon\" href=\"https://assets.vidfriends.app/favicon/apple-touch-icon.png\">
    <link rel=\"manifest\" href=\"/site.webmanifest\">
    <meta name=\"apple-mobile-web-app-capable\" content=\"yes\">
    <meta name=\"apple-mobile-web-app-status-bar-style\" content=\"black-translucent\">
    <style>${styles}</style>
    <script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}</script>
  `;
}

