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

function homePage() {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Home</title>
  </head>
  <body>
    <h1>Home</h1>
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

    if (req.method === 'POST' && url.pathname === '/share') {
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
    .prepare('INSERT INTO sessions (id, user_id, created_at) VALUES (?1, ?2, ?3)')
    .bind(sessionId, userId, now)
    .run();

  const headers = new Headers({ Location: '/' });
  headers.append('Set-Cookie', `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax`);
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
      'SELECT credentials.id as cred_id, credentials.secret_hash, users.id as user_id FROM credentials JOIN users ON credentials.user_id = users.id WHERE credentials.type = ?1 AND credentials.identifier = ?2'
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
  await env.vidshare
    .prepare('INSERT INTO sessions (id, user_id, created_at) VALUES (?1, ?2, ?3)')
    .bind(sessionId, cred.user_id, now)
    .run();
  const headers = new Headers({ Location: '/' });
  headers.append('Set-Cookie', `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax`);
  return new Response(null, { status: 302, headers });
}

async function handleHome(req, env) {
  const sessionId = getCookie(req, 'session');
  if (!sessionId) {
    return new Response(null, { status: 302, headers: { Location: '/login' } });
  }
  const session = await env.vidshare
    .prepare('SELECT user_id FROM sessions WHERE id = ?1')
    .bind(sessionId)
    .first();
  if (!session) {
    return new Response(null, { status: 302, headers: { Location: '/login' } });
  }
  return new Response(homePage(), {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
}

async function handleLogout(req, env) {
  const sessionId = getCookie(req, 'session');
  if (sessionId) {
    await env.vidshare
      .prepare('DELETE FROM sessions WHERE id = ?1')
      .bind(sessionId)
      .run();
  }
  const headers = new Headers({ Location: '/login' });
  headers.append('Set-Cookie', 'session=; Path=/; HttpOnly; Max-Age=0');
  return new Response(null, { status: 302, headers });
}

