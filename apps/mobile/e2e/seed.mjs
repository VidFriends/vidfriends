// Seeds the mobile E2E stack (http://10.0.2.2:8880 for the emulator, reached from the runner as
// localhost:8880) and prints Maestro environment variables: claim the instance and create an
// auto-friend invite whose join link the app opens.
import { execFileSync } from 'node:child_process';
import { request } from 'node:http';

const BASE = process.env.SEED_BASE ?? 'http://localhost:8880';
const HOST = process.env.SEED_HOST ?? '10.0.2.2:8880';
const ADMIN = { username: 'alex', password: 'correct-horse-battery-9' };

/** node:http, because fetch does not let us set the Host header the emulator will send. */
function call(token, method, path, body) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = request(
      `${BASE}/api/v1${path}`,
      {
        method,
        headers: {
          host: HOST,
          ...(payload ? { 'content-type': 'application/json' } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (text += c));
        res.on('end', () =>
          res.statusCode >= 200 && res.statusCode < 300
            ? resolve(text ? JSON.parse(text) : undefined)
            : reject(new Error(`${method} ${path} -> ${res.statusCode} ${text}`)),
        );
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
}

const logs = execFileSync('node', ['e2e/scripts/stack.mjs', 'logs', 'server'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
});
const setupToken = /setup token: ([A-Za-z0-9_-]+)/.exec(logs)?.[1];
if (!setupToken) throw new Error('no setup token in the server log');
const { token } = await call(null, 'POST', '/setup', {
  setup_token: setupToken,
  instance_name: 'Mobile E2E',
  ...ADMIN,
  client: 'mobile',
});
const invite = await call(token, 'POST', '/invites', { auto_friend: true, max_uses: 1 });
// The server builds join links from PUBLIC_URL, i.e. http://10.0.2.2:8880/join/<code>.
process.stdout.write(
  `JOIN_URL=${invite.join_url}\nADMIN_USER=${ADMIN.username}\nADMIN_PASSWORD=${ADMIN.password}\n`,
);
