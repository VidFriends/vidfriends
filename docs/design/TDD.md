# TDD: Technical Design

- **Status:** Draft v1. *TDD here means Technical Design Document, not test-driven development.*
- **Owns:** the concrete technical approach: engineering choices and trade-offs, cross-cutting technical concerns (security engineering, deployment and operations, testing strategy), implementation strategy, and migration considerations.
- **Architecture-level decisions** are in the [ADRs](../adr/). This document records how to carry them out.

## 1. Implementation strategy

1. **Walking skeleton first (M1).** Build the thinnest end-to-end slice through every layer before widening:
   - contracts → server → database → web
   - CI, compose and E2E
   - authentication, invites and the authorization-matrix harness
2. **Vertical slices per milestone.** Each feature lands with its contract, migration, service, UI, API tests, authz-matrix entries and E2E spec in the **same PR series**.
3. **Definition of done** for every task:
   - Code is reachable from navigation.
   - The tests listed in the task pass in CI.
   - Docs and roadmap status are updated ([AGENTS.md](../../AGENTS.md)).
4. **No stubs in `main`.** A feature that isn't wired end to end stays behind a feature flag or stays out ([L-11](../legacy/AUDIT.md#4-lessons-referenced-by-id-from-the-design-docs)).

## 2. Media engineering

| Topic | Choice | Rationale / trade-off |
|---|---|---|
| Extractor | yt-dlp pinned in the worker image, invoked via `execFile` (no shell) with `--` before the URL | Best platform coverage. Frequent releases are needed, so a scheduled bump job runs (NFR-OPS-05). |
| Format selector | `-f "bv*[vcodec^=avc1][height<=1080]+ba[acodec^=mp4a]/b[ext=mp4][height<=1080]/bv*[height<=1080]+ba/b"` plus `--merge-output-format mp4` | Prefers directly playable H.264/AAC and avoids transcoding in most cases |
| Limits | `--max-filesize ${max_media_bytes}`; wall clock 10 min†; temp directory quota; duration check via `--match-filter "duration <= N"` | Bounded resources (BR-MED-2) |
| Normalisation | ffprobe → if codecs and container are browser-safe, then `ffmpeg -c copy -movflags +faststart`; else `libx264 -preset veryfast -crf 23 -vf scale='min(1080,iw)':-2` + AAC 128 k | CPU cost only when needed |
| Thumbnail | `ffmpeg -ss <10%> -frames:v 1` → WebP 720 px wide | Never hotlink provider thumbnails (privacy, durability) |
| Hash | SHA-256 streamed while uploading to storage | Exact dedup (BR-MED-4) |
| Temp storage | Docker volume `/work` (disk, not tmpfs). Per-job directory removed in `finally`. | Legacy 64 MB tmpfs and leaked files |
| Sandbox | Worker container: non-root, read-only root filesystem except `/work` and `/tmp`, `cap_drop: ALL`, `no-new-privileges`, memory limit 1 GiB† | Contains extractor or ffmpeg exploits (TB-4) |
| Egress | App-level: resolve the host and reject private, loopback, link-local and CGNAT ranges before invoking yt-dlp. Optional network-level egress proxy documented for hardened installs. | yt-dlp follows redirects internally, so app-level checks are best-effort. Documented as a residual risk (§5). |

## 3. Server engineering

- **IDs:** UUIDv7, generated in the app. Time-ordered values help keyset pagination and index locality.
- **Time:** an injected `Clock`. Tests use a controllable clock, for example for retention and session expiry.
- **Config:** `config/env.ts` defines a Zod schema over `process.env`. It fails fast with an aggregated error message (NFR-OPS-02). Durations use explicit units (`SESSION_IDLE_DAYS=30`), never bare integers ([L-07](../legacy/AUDIT.md#4-lessons-referenced-by-id-from-the-design-docs)). A generated `deploy/ENV.md` documents every key.
- **Instance settings vs env:**
  - Env holds infrastructure: URLs, secrets, ports, concurrency.
  - The `instance_settings` table holds product policy that admins can change at runtime (FRD WF-ADM-3). The env can seed defaults on first boot only.
- **Rate limiting:** a token bucket in PostgreSQL (`rate_limits` table, upsert per key per window) or in memory per process.
  - **Decision:** in memory, because there is one API process at target scale. The interface is ready for a Postgres-backed store if replicas are added.
  - Keys: `ip:<client_ip>`, `user:<id>`, `login:<username>`.
  - The client IP is derived from `X-Forwarded-For` **only** when the peer is in `TRUSTED_PROXIES` (default: the compose network CIDR) ([L-20](../legacy/AUDIT.md#4-lessons-referenced-by-id-from-the-design-docs)).
- **Static web hosting:** the built SPA is copied into the server image. Hono serves `/assets/*` with immutable caching and falls back to `index.html` for client routes, excluding `/api/*`.
- **DB access:** Drizzle query builder. Raw SQL is allowed for feed queries, which must be reviewed with `EXPLAIN` on seeded data. Every nullable column maps to `T | null` types ([L-15](../legacy/AUDIT.md#4-lessons-referenced-by-id-from-the-design-docs)).
- **Migrations:** `drizzle-kit generate`. The SQL is reviewed and committed, and `migrate` runs as a one-shot compose service before `server` and `worker` start. CI fails if any already-merged migration file changes (checksum list) ([L-14](../legacy/AUDIT.md#4-lessons-referenced-by-id-from-the-design-docs)).

## 4. Client engineering

### Web (C-WEB)

- **Player:** a feed of N virtual slots with at most 3 `<video>` elements mounted (prev, active, next).
  - `IntersectionObserver` selects the active slot.
  - Only the active slot plays.
  - `preload="auto"` on next, `preload="metadata"` on prev.
  - Progress is reported every 5 s and on pause or visibility change (`navigator.sendBeacon` fallback).
  - Keyboard: ↑/↓ or j/k to navigate, Space to play/pause, m to mute.
  - Captions are not available from sources in v1.
- **Autoplay:** muted autoplay is permitted by browsers. The unmute state is kept in session storage after the first user gesture.
- **PWA:** `vite-plugin-pwa` (injectManifest).
  - The navigation fallback is `index.html`, with `/api/*` and `/media-store/*` denylisted (legacy bug).
  - Real icons (192, 512, maskable).
  - `share_target` for Android: `GET /send?url=…&text=…`. Many apps put the URL in `text`, so the client extracts the first URL from either field.
  - The service worker also handles `push` and `notificationclick`.
- **Styling:** Tailwind with shadcn/ui tokens. Supports both light and dark themes via `prefers-color-scheme`, plus a manual toggle.
- **Forms:** React Hook Form and Zod resolvers using contract schemas.
- **Errors:** route-level error boundaries. Toasts use `aria-live`.

### Mobile (C-MOB, M6)

| Concern | Choice |
|---|---|
| Framework | Expo SDK (current at M6 start) with development builds (EAS), expo-router, TypeScript |
| Player | `expo-video` with a vertical `FlashList` that mounts at most 3 players |
| Share intake | `expo-share-intent` (or the current maintained equivalent) config plugin: iOS share extension and Android `ACTION_SEND` for `text/plain` URLs and `video/*` |
| Token storage | `expo-secure-store` (FR-MOB-03) |
| Pairing | `expo-camera` barcode scanning, plus paste. The base URL is stored in secure storage and applied at startup (WF-PAIR-2). |
| Cleartext | The Android `usesCleartextTraffic` config plugin is enabled. The app allows `http://` only to private-range hosts with a warning (WF-PAIR-3). iOS ATS uses `NSAllowsLocalNetworking`. |
| Push | `expo-notifications`. The token is registered via `POST /api/v1/push-targets` with `{kind:"expo"}`. |
| Release | EAS Build and Submit. The internal-testing tracks are TestFlight and the Play internal track. |
| Required plist strings | Camera (QR scanning and recording, if added), Photo Library, Microphone if recording ships. All are set before the first TestFlight build (legacy rejection risk). |

## 5. Security engineering

**Threat model (STRIDE summary).** Requirement IDs are in brackets.

| Threat | Example | Mitigation |
|---|---|---|
| Spoofing | Session theft or token forgery | Opaque random tokens, hashed at rest; HttpOnly cookie; secure-store on mobile; no JWT secrets to leak [NFR-SEC-02, ADR-0008] |
| Spoofing | Brute-force login | Per-IP and per-username limits; argon2id cost [NFR-SEC-06] |
| Tampering | CSRF on cookie auth | SameSite=Lax + Origin check + double-submit token [NFR-SEC-04] |
| Tampering | Malicious media exploiting ffmpeg | Sandboxed worker, size and time caps, pinned ffmpeg, re-encode on doubt [NFR-SEC-08] |
| Repudiation | Admin abuse | Append-only audit log [FR-ADM-05] |
| Information disclosure | IDOR on shares, videos, conversations | SQL participant predicates + authz matrix [NFR-SEC-01] |
| Information disclosure | Enumeration via search or invite preview | Min 2 characters, 20 results, block-aware; invite preview rate-limited and minimal [BR-FRND-8] |
| Information disclosure | Leaks via push, logs or errors | Minimal push payloads, log redaction, generic 500s [BR-NOT-3, NFR-PRIV-02] |
| Denial of service | Expensive fetches or transcodes | Bounded worker concurrency, quotas, rate limits [NFR-PERF-03, BR-MED-2] |
| Elevation of privilege | Stale role, suspended user | Role and status read from the DB on every request; sessions revoked on change [FR-AUTH-05/06] |
| SSRF | Link to internal services | Allowlist + private-IP block + `--` [NFR-SEC-05] |

**Residual risks (accepted, revisit at M5):**
- yt-dlp redirect-following can reach hosts outside the allowlist. Mitigation: the optional egress proxy.
- The operator can read all data. Mitigation: disclosed to users.

**Secrets:**

| Secret | Handling |
|---|---|
| `APP_SECRET` | 32+ bytes, used for HMAC/CSRF and for encrypting the VAPID private key at rest |
| Database password | Required at startup; known defaults refused (NFR-SEC-03) |
| S3 keys | Required at startup; known defaults refused (NFR-SEC-03) |
| VAPID key pair | Generated per instance |

`deploy/.env.example` contains no working values. The compose file **never** inlines secrets ([L-06](../legacy/AUDIT.md#4-lessons-referenced-by-id-from-the-design-docs)).

**Supply chain:**
- Lockfiles committed. `pnpm audit` and Trivy (blocking on fixable criticals) in CI.
- Images pinned by digest in the release compose file.
- SBOMs generated (NFR-SEC-07, NFR-OPS-04).

## 6. Deployment and operations

**Environments:**

| Env | Purpose | How |
|---|---|---|
| dev | Local development | `pnpm dev` (Vite + tsx watch) against `deploy/compose.dev.yml` (Postgres, SeaweedFS) |
| ci | Automated tests | Same compose services in GitHub Actions. Playwright runs against the built server image. |
| staging (proposed) | Pre-release smoke | The owner's VM, deployed from `main` |
| production | Self-hosted private instances (no public instance, ADR-0014) | `deploy/compose.yml` + `.env` |

**Production compose:**
- Services: `caddy`, `migrate` (one-shot), `server` (ROLE=api), `worker`, `postgres`, `seaweedfs` ([ADR-0015](../adr/0015-bundled-object-store-seaweedfs.md)). The server creates the bucket on first start, so no init container is needed.
- Volumes: `pgdata`, `s3data`, `work`, `caddy_data`, `caddy_config`.
- Caddy routes:
  - `{$DOMAIN}` → `server:8080`
  - `{$DOMAIN}/media-store/*` → `seaweedfs:8333`, **without** rewriting the path and with `Host` preserved. The bucket is named `media-store` and `S3_PUBLIC_ENDPOINT=PUBLIC_URL`, so path-style presigned URLs validate (SigV4 signs the path; ADR-0015).
- Health checks gate startup order.

**Observability:**
- pino JSON logs to stdout with a request id. Docker log rotation (10 MB × 5).
- `/healthz` and `/readyz` (NFR-OPS-03).
- `/metrics` on the internal port 9464: HTTP latency histograms, job counts and durations by type and state, queue depth, storage bytes.
- An optional `deploy/compose.monitoring.yml` (Prometheus + Grafana dashboard JSON) is provided at M5.

**Backup and restore (NFR-REL-04):**
- Nightly `pg_dump -Fc`, retaining 14 daily and 8 weekly copies.
- Object storage via an S3 sync tool (for example `rclone sync` or `aws s3 sync`) to a second disk or remote S3.
- A documented restore drill executed at M5.
- Proposed targets: RPO 24 h, RTO 2 h.

**Release and upgrade:**
- A tag `vX.Y.Z` triggers a GHCR image build (multi-arch amd64/arm64) and publishes SBOMs.
- Upgrade: `docker compose pull && docker compose up -d`. `migrate` runs first. Migrations are backward-compatible for one minor version (expand/contract), so a rollback means redeploying the previous image without a down-migration.
- Breaking API changes follow [ADR-0006](../adr/0006-api-contract-first.md).

## 7. Testing and verification strategy

| Layer | Tool | Scope | Gate |
|---|---|---|---|
| Static | `tsc`, ESLint (incl. jsx-a11y, import/no-cycle), Prettier | All packages | PR |
| Unit | Vitest | Services (BR-* rules with a fake clock), URL validator table, config validation, log redaction | PR |
| Contract | Vitest | Generated OpenAPI up to date; every route registered; responses validate | PR |
| API integration | Vitest + real Postgres and SeaweedFS S3 (compose or CI services) | Every FR via HTTP against the full Hono app; state-machine tables; **authz matrix**; job idempotency with kill/restart | PR |
| Media | Vitest with fixture files and a fake `yt-dlp` script (deterministic) | Fetch, process and link_only paths, limits | PR. A live opt-in yt-dlp smoke test runs nightly (non-blocking, alerts). |
| E2E web | Playwright (Chromium, Firefox, WebKit) + axe | Journeys J-1..J-8; seeded by API helpers; served by the production image | PR (Chromium), nightly (all) |
| E2E mobile | Maestro on EAS or emulator builds | J-2..J-5 (M6) | Pre-release |
| Load | k6 | Feed, send and media URL issuance at 50 virtual users (NFR-PERF-01) | Pre-release (M5+) |
| Runbook | Human or agent with a checklist | Fresh-VM deploy, restore drill, real push on devices | Milestone exit |

**Seed data:** `pnpm seed:demo` creates an instance with an admin, three members, friendships, and fixture videos. E2E never relies on network access to source platforms.

## 8. Migration considerations

- **No data migration.** No legacy deployment holds production data worth keeping: none ever worked end to end ([AUDIT](../legacy/AUDIT.md)). Any legacy servers should be decommissioned (roadmap M0-T3).
- **Concepts reused deliberately:**
  - transactional invite consumption
  - hashed rotating tokens (now opaque sessions)
  - the 48 h inbox window
  - `SKIP LOCKED` queues (via pg-boss)
  - the platform allowlist
  - `keep_forever`, now expressed as `saved` pinning media
  - the admin audit log
  - QR pairing
  - streamed uploads (now presigned)
- **Concepts dropped:**
  - the global feed
  - public per-video comments and likes
  - pHash cross-user merge
  - playlist OAuth import
  - ntfy and Gotify (deferred)
  - WebSockets (deferred)
  - email identity
- **Package and bundle IDs (M6):** `io.github.vidfriends.mobile` is proposed, because there is no project domain (ADR-0014). It avoids the legacy `com.vidfriends.app` and `com.vidflow.app` collisions with previously built test apps.

## 9. Key trade-offs

| Trade-off | Chosen | Cost accepted |
|---|---|---|
| DB session lookup per request vs stateless JWT | DB lookup | ~1 indexed query per request |
| Polling vs realtime | Polling + push | Up to 60 s staleness in open tabs |
| Presigned URLs vs proxied streaming | Presigned | The bundled store must be reachable via the public proxy path (ADR-0015) |
| One language (TS) vs Go performance | TS | Higher memory per process; acceptable at target scale |
| Download and host vs embed | Download (switchable) | Legal exposure (BRD OQ-1), storage cost |
