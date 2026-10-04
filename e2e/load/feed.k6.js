// NFR-PERF-01: API p95 ≤ 300 ms for non-media endpoints at 50 concurrent users (M5-T7).
// Each VU is one seeded member doing what the app does: open the feed, poll the unread count,
// open a share and its conversation, report playback progress, glance at inbox/sent/friends, and
// occasionally reply. Run with seed.mjs output mounted at /data/load.json.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

const BASE = (__ENV.BASE_URL || 'https://localhost:8443') + '/api/v1';
const users = new SharedArray('users', () => JSON.parse(open('/data/load.json')).users);

export const options = {
  insecureSkipTLSVerify: true,
  scenarios: {
    members: {
      executor: 'constant-vus',
      vus: 50,
      duration: __ENV.DURATION || '3m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<300'],
    // Per-endpoint p95, so the summary shows each route.
    'http_req_duration{name:GET /feed}': ['p(95)<300'],
    'http_req_duration{name:GET /notifications/unread-count}': ['p(95)<300'],
    'http_req_duration{name:GET /shares/{id}}': ['p(95)<300'],
    'http_req_duration{name:GET /shares/{id}/media}': ['p(95)<300'],
    'http_req_duration{name:GET /shares/{id}/replies}': ['p(95)<300'],
    'http_req_duration{name:POST /shares/{id}/progress}': ['p(95)<300'],
    'http_req_duration{name:GET /inbox}': ['p(95)<300'],
    'http_req_duration{name:GET /sent}': ['p(95)<300'],
    'http_req_duration{name:GET /friends}': ['p(95)<300'],
    'http_req_duration{name:GET /history}': ['p(95)<300'],
    'http_req_duration{name:POST /shares/{id}/replies}': ['p(95)<300'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export default function () {
  const me = users[(__VU - 1) % users.length];
  const params = (name) => ({
    headers: { authorization: `Bearer ${me.token}`, 'content-type': 'application/json' },
    tags: { name },
  });
  const share = me.shareIds[Math.floor(Math.random() * me.shareIds.length)];
  const ok = (res) => check(res, { '2xx': (r) => r.status >= 200 && r.status < 300 });

  ok(http.get(`${BASE}/feed?limit=20`, params('GET /feed')));
  ok(http.get(`${BASE}/notifications/unread-count`, params('GET /notifications/unread-count')));
  sleep(1);
  ok(http.get(`${BASE}/shares/${share}`, params('GET /shares/{id}')));
  ok(http.get(`${BASE}/shares/${share}/media`, params('GET /shares/{id}/media')));
  ok(http.get(`${BASE}/shares/${share}/replies`, params('GET /shares/{id}/replies')));
  ok(
    http.post(
      `${BASE}/shares/${share}/progress`,
      JSON.stringify({ position_ms: 4000 + Math.floor(Math.random() * 4000), duration_ms: 12000 }),
      params('POST /shares/{id}/progress'),
    ),
  );
  sleep(1);
  const r = Math.random();
  if (r < 0.3) ok(http.get(`${BASE}/inbox`, params('GET /inbox')));
  else if (r < 0.5) ok(http.get(`${BASE}/sent`, params('GET /sent')));
  else if (r < 0.65) ok(http.get(`${BASE}/friends`, params('GET /friends')));
  else if (r < 0.75) ok(http.get(`${BASE}/history`, params('GET /history')));
  else if (r < 0.8)
    ok(
      http.post(
        `${BASE}/shares/${share}/replies`,
        JSON.stringify({ body: 'load test reply' }),
        params('POST /shares/{id}/replies'),
      ),
    );
  sleep(1);
}
