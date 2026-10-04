// Seeds a load-test population on the E2E stack (M5-T7, NFR-PERF-01): 50 members, each friends
// with 10 others, 5 videos, and every member sending every video to all friends (2,500 shares,
// 50 per member), plus replies. Writes bearer tokens and share ids for k6 to `.stack/load.json`.
//   NODE_TLS_REJECT_UNAUTHORIZED=0 node load/seed.mjs   (local stack with Caddy's local CA)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = (process.env.BASE_URL ?? 'https://localhost:8443') + '/api/v1';
const ADMIN = { username: 'alex', password: 'correct-horse-battery-9' };
const PASSWORD = 'tangerine-orbit-42';
const USERS = Number(process.env.LOAD_USERS ?? 50);
const FRIENDS_EACH_SIDE = 5;
const VIDEOS = 5;

async function call(token, method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : undefined;
}

const admin = (await call(null, 'POST', '/auth/login', { ...ADMIN, client: 'mobile' })).token;
const run = Date.now().toString(36);
const users = [];
for (let i = 0; i < USERS; i++) {
  const { code } = await call(admin, 'POST', '/invites', { auto_friend: false });
  const username = `load${run}${i}`;
  const res = await call(null, 'POST', '/auth/register', {
    username,
    password: PASSWORD,
    display_name: `Load ${i}`,
    invite_code: code,
    client: 'mobile',
  });
  users.push({ id: res.user.id, token: res.token, username });
}
console.log(`registered ${users.length} members`);

const friendsOf = (i) =>
  Array.from({ length: FRIENDS_EACH_SIDE }, (_, k) => [
    (i + k + 1) % USERS,
    (i - k - 1 + USERS) % USERS,
  ]).flat();
for (let i = 0; i < USERS; i++) {
  for (let k = 1; k <= FRIENDS_EACH_SIDE; k++) {
    const j = (i + k) % USERS;
    await call(users[i].token, 'POST', '/friends/requests', { user_id: users[j].id });
    await call(users[j].token, 'POST', `/friends/requests/${users[i].id}/accept`);
  }
}
console.log('friendships done');

const urls = Array.from(
  { length: VIDEOS },
  (_, v) => `https://www.youtube.com/watch?v=ok&e2e=load${run}${v}`,
);
async function addAndWait(token, url) {
  const { video } = await call(token, 'POST', '/videos', { url });
  for (let t = 0; t < 240; t++) {
    const { video: v } = await call(token, 'GET', `/videos/${video.id}`);
    if (v.state === 'ready') return v.id;
    if (['failed', 'link_only'].includes(v.state)) throw new Error(`video ${v.state}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('video did not become ready');
}
for (const url of urls) await addAndWait(users[0].token, url);
console.log('videos ready');

for (let i = 0; i < USERS; i++) {
  const recipients = friendsOf(i).map((j) => users[j].id);
  for (const url of urls) {
    const videoId = await addAndWait(users[i].token, url); // deduplicated: already ready
    await call(users[i].token, 'POST', '/shares', {
      video_id: videoId,
      recipient_ids: recipients,
      note: `from ${users[i].username}`,
      idempotency_key: `load-${run}-${i}-${videoId}`,
    });
  }
}
console.log(`shares sent: ${USERS * VIDEOS * FRIENDS_EACH_SIDE * 2}`);

const out = [];
for (const u of users) {
  const feed = await call(u.token, 'GET', '/feed?limit=50');
  const shareIds = feed.items.map((s) => s.id);
  await call(u.token, 'POST', `/shares/${shareIds[0]}/replies`, { body: 'seed reply' });
  out.push({ token: u.token, shareIds });
}
writeFileSync(
  fileURLToPath(new URL('../.stack/load.json', import.meta.url)),
  JSON.stringify({ users: out }),
);
console.log('wrote .stack/load.json');
