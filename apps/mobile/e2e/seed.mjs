// Seeds the mobile E2E stack (http://localhost:8880; the emulator reaches it through
// `adb reverse`) and prints Maestro environment variables. An emulator browser cannot run a
// passkey ceremony, so the seed creates the accounts with software passkeys (test-utils) and
// keeps a bearer session for each; Maestro uses it to mint hand-off codes for the app, which an
// E2E build exchanges with the fixed verifier E2E_HANDOFF_VERIFIER (WF-AUTH-5, ADR-0018).
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { SoftAuthenticator } from '../../../packages/test-utils/dist/authenticator.js';

const BASE = process.env.SEED_BASE ?? 'http://localhost:8880';
const VERIFIER = process.env.E2E_HANDOFF_VERIFIER;
if (!VERIFIER || !/^[A-Za-z0-9._~-]{43,128}$/.test(VERIFIER)) {
  throw new Error('set E2E_HANDOFF_VERIFIER (43+ base64url characters)');
}
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');

/** A cookie session like a browser's, with the CSRF header and Origin (SDD §2). */
class Client {
  cookies = new Map();
  async call(method, path, body) {
    const csrf = this.cookies.get('vf_csrf');
    const res = await fetch(`${BASE}/api/v1${path}`, {
      method,
      headers: {
        origin: BASE,
        cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
    return text ? JSON.parse(text) : undefined;
  }

  /** A bearer session for the app, through the same hand-off the browser page uses. */
  async bearerToken() {
    const { code } = await this.call('POST', '/auth/mobile/code', { code_challenge: CHALLENGE });
    const { token } = await new Client().call('POST', '/auth/mobile/token', {
      code,
      code_verifier: VERIFIER,
    });
    return token;
  }
}

const passkey = () => new SoftAuthenticator(new URL(BASE).origin, { counter: false });

const logs = execFileSync('node', ['e2e/scripts/stack.mjs', 'logs', 'server'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
});
const setupToken = /setup token: ([A-Za-z0-9_-]+)/.exec(logs)?.[1];
if (!setupToken) throw new Error('no setup token in the server log');

const admin = new Client();
const adminKey = passkey();
const setup = await admin.call('POST', '/setup/options', {
  setup_token: setupToken,
  instance_name: 'Mobile E2E',
  username: 'alex',
  display_name: 'Alex',
});
await admin.call('POST', '/setup', {
  ceremony_id: setup.ceremony_id,
  credential: adminKey.create(setup.options),
});

// Mia joins through Alex's auto-friend invite.
const miaInvite = await admin.call('POST', '/invites', { auto_friend: true, max_uses: 1 });
const mia = new Client();
const miaKey = passkey();
const join = await mia.call('POST', '/auth/register/options', {
  username: 'mia',
  display_name: 'Mia',
  invite_code: miaInvite.code,
});
await mia.call('POST', '/auth/register', {
  ceremony_id: join.ceremony_id,
  credential: miaKey.create(join.options),
});

// The link the app pairs with; its join screen hands over to the browser.
const invite = await admin.call('POST', '/invites', { auto_friend: true, max_uses: 1 });
process.stdout.write(
  [
    `SERVER_URL=${BASE}`,
    `JOIN_URL=${invite.join_url}`,
    `HANDOFF_CHALLENGE=${CHALLENGE}`,
    `MIA_TOKEN=${await mia.bearerToken()}`,
    `ADMIN_TOKEN=${await admin.bearerToken()}`,
    '',
  ].join('\n'),
);
