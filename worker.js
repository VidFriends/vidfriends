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
    <script>
      function showPassword() {
        document.getElementById('password-form').style.display = 'block';
      }
    </script>
  </head>
  <body>
    <h1>Login</h1>
    <button>passkey</button>
    <button>social</button>
    <button id="password-btn" onclick="showPassword()">password</button>
    <button>phone</button>
    <form id="password-form" method="POST" style="display:none;">
      <input name="username" placeholder="username" required />
      <input name="password" type="password" placeholder="password" required />
      <button type="submit">log in</button>
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
    <script>
      function showPassword() {
        document.getElementById('password-form').style.display = 'block';
      }
    </script>
  </head>
  <body>
    <h1>Sign Up</h1>
    <button>passkey</button>
    <button>social</button>
    <button id="password-btn" onclick="showPassword()">password</button>
    <button>phone</button>
    <form id="password-form" method="POST" style="display:none;">
      <input name="username" placeholder="username" required />
      <input name="password" type="password" placeholder="password" required />
      <button type="submit">sign up</button>
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

function homePage(username) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Home</title>
  </head>
  <body>
    <h1>Home</h1>
    <p>Logged in as <strong>${escapeHtml(username)}</strong></p>
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

    if (req.method === 'POST' && url.pathname === '/logout') {
      return handleLogout(req, env);
    }

    if (req.method === 'POST' && url.pathname === '/auth/refresh') {
      return handleRefresh(req, env);
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
      if (payload && payload.username) {
        return new Response(homePage(payload.username), {
          headers: { 'Content-Type': 'text/html;charset=UTF-8' },
        });
      }
      // Missing username claim: fall back to DB via session cookie
      const sessionId = getCookie(req, 'session');
      if (sessionId && env && env.vidshare) {
        const row = await env.vidshare
          .prepare('SELECT users.username FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.id = ?1')
          .bind(sessionId)
          .first();
        if (row && row.username) {
          return new Response(homePage(row.username), {
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
