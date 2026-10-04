# M5-T7 load test and security review — 2026-10-04

Roadmap task **M5-T7**: k6 at 50 VUs (NFR-PERF-01), threat-model review against
[TDD §5](../design/TDD.md#5-security-engineering), dependency audit. Every finding below is
either fixed in the same change or accepted in
[ADR-0016](../adr/0016-accepted-residual-security-risks-v0-1.md).

## 1. Load test (NFR-PERF-01)

**Requirement:** API p95 ≤ 300 ms for non-media endpoints at 50 concurrent users on a 2 vCPU /
4 GB host.

**Setup.** Production compose stack (`deploy/compose.yml` + the E2E overlay with the fake
yt-dlp), images built from this branch. The `server` and `postgres` containers were capped with
`docker update --cpus 1 --memory 2g` each (2 vCPU / 4 GB between them); Caddy, SeaweedFS, the
worker and k6 ran on the remaining cores of a 4-core sandbox. Assumption: this approximates the
reference host, because those two containers do all the work for non-media endpoints.
`RATE_LIMIT_IP_PER_MINUTE` was raised for the run because every virtual user shares one source IP
(the limiter itself is covered by `apps/server/test/http.test.ts`).

**Data** (`e2e/load/seed.mjs`): 50 members, each friends with 10 others; 5 ready videos;
every member sent every video to all friends (2,500 shares, 50 in each feed); one reply per
member.

**Workload** (`e2e/load/feed.k6.js`, 50 constant VUs, 3 minutes, each VU one member with a bearer
token): feed, unread count, share detail, signed media URLs, conversation, playback progress,
then one of inbox / sent / friends / history / post a reply, with 1 s think time between steps.

**Result:** all thresholds passed; 20,026 requests, 0 failures.

| Endpoint | p95 |
|---|---|
| all requests | **20.9 ms** (median 8.3 ms, p99 105.9 ms, max 387 ms) |
| `GET /feed` | 21.4 ms |
| `GET /notifications/unread-count` | 11.8 ms |
| `GET /shares/{id}` | 21.3 ms |
| `GET /shares/{id}/media` | 19.8 ms |
| `GET /shares/{id}/replies` | 24.5 ms |
| `POST /shares/{id}/progress` | 27.5 ms |
| `POST /shares/{id}/replies` | 23.6 ms |
| `GET /inbox` | 14.1 ms |
| `GET /sent` | 14.9 ms |
| `GET /friends` | 11.1 ms |
| `GET /history` | 15.3 ms |

Resource use after the run: server 134 MiB, Postgres 84 MiB, worker 68 MiB.

**Reproduce:** start the E2E stack, claim it (`setup.spec.ts`), then
`NODE_TLS_REJECT_UNAUTHORIZED=0 node e2e/load/seed.mjs` and
`docker run --rm --network host -v $PWD/e2e/load:/scripts:ro -v $PWD/e2e/.stack/load.json:/data/load.json:ro grafana/k6:1.3.0 run /scripts/feed.k6.js`.

## 2. Threat-model review (TDD §5)

| Threat | Mitigation in place | Evidence | Verdict |
|---|---|---|---|
| Session theft / token forgery | Opaque random tokens, SHA-256 at rest; HttpOnly Secure SameSite=Lax cookie; bearer only for mobile | `auth.test.ts`: "stores only token hashes", "sets an HttpOnly Secure SameSite=Lax session cookie…", "returns a bearer token only to mobile clients" | OK |
| Brute-force login | 10/min per IP and per username; argon2id (OWASP parameters); identical error for unknown user and wrong password | `auth.test.ts` "limits login attempts…", "same generic error…"; `passwords.test.ts` | OK |
| CSRF | SameSite=Lax + Origin check + HMAC session-bound token; bearer exempt | `auth.test.ts` CSRF cases (missing token, cross-origin, missing Origin, bearer exempt) | OK |
| Malicious media vs ffmpeg | Worker read-only, `cap_drop: ALL`, `no-new-privileges`, 1 GB memory, size/duration caps, content sniffing, transcode | `media.test.ts` "sniffs content…", "marks a corrupt file as failed", limits cases; `deploy/compose.yml` | OK |
| Admin abuse (repudiation) | Append-only audit log (DB trigger) with filters, 365-day retention | `admin.test.ts` audit cases; migration 0000 trigger; `maintenance.test.ts` | OK |
| IDOR on shares, videos, conversations | Participant predicates in SQL; every id-bearing route in the authorization matrix (8 personas) | `authz-matrix.test.ts` | OK |
| Enumeration (search, invite preview) | ≥ 2 characters, 20 results, block- and suspension-aware; preview rate-limited and minimal | `friends.test.ts` search cases; `invites.test.ts` preview cases | OK |
| Leaks via push, logs, errors | Private previews by default, minimal payloads; pino redaction; route pattern logged instead of paths; generic 500s; no access log in Caddy | `notifications.test.ts`, `logger.test.ts`, `http.test.ts` | OK |
| DoS via fetches/transcodes | Bounded worker concurrency, quotas, instance cap, per-user and per-IP limits | `media.test.ts` quota cases, `http.test.ts` per-IP limit, load test above | OK |
| Stale role / suspended user | Role and status read on every request; sessions revoked on suspension, demotion, password change | `auth.test.ts` "re-reads the role…", suspension cases; E2E `admin.spec.ts` | OK |
| SSRF via submitted link | Allowlist, all resolved addresses must be public (DNS rebinding), short links resolved through allowlisted hops only, URL after `--` | `url.test.ts` (40+ cases, rebinding), `media.test.ts` argv check | OK |
| SSRF via yt-dlp redirects | See F-1 and ADR-0016 | — | Fixed in part; rest accepted |
| Operator reads all data | Disclosure (M5-T8) | — | Accepted (ADR-0016) |

## 3. Findings

| ID | Finding | Severity | Resolution |
|---|---|---|---|
| F-1 | SeaweedFS master (9333), volume (8080) and filer (8888) APIs, which are unauthenticated, were reachable from the worker and server containers. Combined with a redirect followed by yt-dlp, the filer could have served any stored video. | High (needs an open redirect on an allowlisted site) | **Fixed:** `weed server -ip=127.0.0.1 -ip.bind=127.0.0.1 -s3.ip.bind=0.0.0.0`; only the S3 gateway (SigV4) is on the network. Verified from the worker: 9333/8080/8888 refuse connections, 8333 answers 403 unauthenticated; full E2E suite and the restore drill pass. |
| F-2 | No way to confine yt-dlp's own requests (TDD named an "optional egress proxy" that did not exist). | Medium | **Fixed:** `FETCH_PROXY_URL` passed as `--proxy` to every yt-dlp call (`media.test.ts` asserts it). Default remains unproxied (ADR-0016). |
| F-3 | Runtime images carried npm (bundled `tar`, `undici`, `brace-expansion`, `ip-address`, `http-cache-semantics`: 8 high, 11 medium CVEs) and pip's vendored `urllib3`, `msgpack`, `setuptools` (4 high, 2 medium). None is used at runtime. | Medium | **Fixed:** npm, npx and corepack removed from both runtime images; pip uninstalled from the yt-dlp venv after install. Trivy now reports 0 vulnerabilities at any severity for both images. |
| F-4 | Third-party images used floating tags, contrary to TDD §5. | Low | **Fixed:** Caddy, Postgres, SeaweedFS, Prometheus, Grafana and the Node base image pinned by digest; Dependabot `docker-compose` ecosystem added. |
| F-5 | `pnpm audit`: esbuild ≤ 0.24.2 (GHSA-67mh-4wv8-2f99, moderate) via `drizzle-kit` → `@esbuild-kit/core-utils`. Dev-only (migration generation), not in images. | Low | **Fixed:** pnpm override to esbuild 0.28.2; `drizzle-kit generate` still works; `pnpm audit` reports no known vulnerabilities. |
| F-6 | `pg_restore --clean` cannot drop pg-boss's partitioned tables, so restores failed (found in the M5-T5 drill). | Medium (availability) | **Fixed:** `restore.sh` recreates the database; CI runs the drill. |

## 4. Dependency audit

- `pnpm audit` (all severities): **0** after F-5.
- Trivy 0.75.0 on `vidfriends-server` and `vidfriends-worker` (all severities): **0** after F-3.
- CI keeps blocking on fixable critical vulnerabilities (Trivy) and critical advisories in production dependencies
  (`pnpm audit --audit-level critical --prod`); Dependabot proposes npm, Actions, Dockerfile and compose
  updates weekly; the yt-dlp pin is bumped by its own workflow.
