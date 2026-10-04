# VidFriends Roadmap (canonical)

> **This is the single authoritative plan** for scope, priorities, dependencies, sequencing and completion criteria ([ADR-0001](adr/0001-record-architecture-decisions.md)). It links to the specifications rather than restating them. If another document disagrees with this one about *what* is planned or *when*, this document wins. Requirement wording belongs to the [SRS](requirements/SRS.md).

- **Last updated:** 2026-10-04
- **Status legend:** ✅ done (with evidence) · 🟡 partial · ⬜ planned · ⛔ blocked · 💤 deferred

## 1. Product summary

**VidFriends is a private "For You" page made only of videos your friends sent you.**
- **Users:** small, trusted circles of friends and family, who join an instance run by someone they trust.
- **Outcomes:** see [BRD §3](requirements/BRD.md#3-business-outcomes) (BO-1..BO-6).
- **Scope and non-goals:** see [PRD §3 and §5](requirements/PRD.md).

**In v1:**
- Invite-only instances
- Consent-based friends
- Adding videos by link or upload, with the server fetching and hosting the media
- Sending to specific friends
- A vertical feed of received videos
- Private reactions and replies
- Notifications
- An admin console
- Web/PWA, then iOS and Android via Expo

**Not in v1:**
- Public or social-network features
- Recommendations
- Federation
- Playlist import
- Collections
- Passkeys and offline downloads (backlog)

## 2. Current state → target state

| | Current (2026-10-03, evidence) | Target (end of M6) |
|---|---|---|
| Code | **None.** All seven legacy repos were consolidated here. Code was removed after the tag `legacy-code-snapshot` ([ADR-0002](adr/0002-consolidate-repos-and-greenfield-reset.md)). | Monorepo per [ADR-0012](adr/0012-monorepo-and-tooling.md) with server, worker, web and mobile apps |
| Working features | None. No legacy attempt worked end to end ([AUDIT §2](legacy/AUDIT.md#2-what-each-attempt-contributes)). | All Must requirements in the SRS verified |
| Specs | This document set (Draft v1) | Maintained alongside code |
| Tests / CI | None | CI gate per NFR-MAINT-02; E2E for J-1..J-8 |
| Deployments | Unknown legacy deployments may exist (see M0-T3) | v1 released as self-hostable software; the owner's private instance runs it; operators have a runbook |

## 3. Constraints, decisions, assumptions, open questions

### 3.1 Confirmed constraints
BC-1..BC-7 in the [BRD](requirements/BRD.md#5-business-constraints): no ads or telemetry, low cost, a private circle, agent-driven delivery, legal care with downloads, self-hostability, app-store accounts.

### 3.2 Decisions

| Decision | Who | Record |
|---|---|---|
| Consolidate all restarts into this repo; remove code; greenfield | **Owner** | [ADR-0002](adr/0002-consolidate-repos-and-greenfield-reset.md) |
| Web stack: React, Vite, TS, Tailwind, shadcn/ui, Radix, TanStack Query and Router | **Owner** | [ADR-0003](adr/0003-web-client-stack.md) |
| Mobile via Expo instead of native apps | **Owner** (accepted Claude's recommendation) | [ADR-0004](adr/0004-mobile-expo.md) |
| Document-set governance | Claude (delegated) | [ADR-0001](adr/0001-record-architecture-decisions.md) |
| Single-tenant, self-hostable, invite-only instances | Claude (delegated); default-instance clause superseded by ADR-0014 | [ADR-0005](adr/0005-instance-model.md) |
| Zod contracts → OpenAPI; snake_case JSON; `/api/v1` | Claude (delegated) | [ADR-0006](adr/0006-api-contract-first.md) |
| Backend: Node + Hono + Postgres + Drizzle + pg-boss; separate worker | Claude (delegated) | [ADR-0007](adr/0007-backend-stack.md) |
| Opaque DB sessions (cookie for web, bearer for mobile) | Claude (delegated) | [ADR-0008](adr/0008-authentication-sessions.md) |
| Download and host media through durable jobs; private S3 with presigned URLs | Claude (delegated); legal risk **accepted by owner** (OQ-1) | [ADR-0009](adr/0009-media-ingestion-and-storage.md) |
| Share-centric model; private conversations; no global feed | Claude (delegated) | [ADR-0010](adr/0010-share-centric-social-model.md) |
| In-app + Web Push + Expo Push; polling, no realtime | Claude (delegated) | [ADR-0011](adr/0011-notifications.md) |
| pnpm + Turborepo monorepo layout | Claude (delegated) | [ADR-0012](adr/0012-monorepo-and-tooling.md) |
| Bundle SeaweedFS instead of MinIO (MinIO images no longer pullable); serve `/media-store/*` unrewritten | Claude (delegated), 2026-10-04 | [ADR-0015](adr/0015-bundled-object-store-seaweedfs.md) |
| HTTPS join links; QR encodes the same URL | Claude (delegated); amended by ADR-0014 | [ADR-0013](adr/0013-instance-pairing-and-join-links.md) |
| Self-host only: no public or default instance, no project domain; licence MIT; name VidFriends | **Owner** (2026-10-03) | [ADR-0014](adr/0014-self-host-only-no-public-instance.md), [BRD §7](requirements/BRD.md#7-open-questions-all-resolved-2026-10-03) |

### 3.3 Assumptions (owner may overturn)

The numbering is kept stable. A-1 (licence) and A-4 (default instance) were resolved by the owner on 2026-10-03 and removed.

- **A-2:** No email is collected; account recovery (lost passkeys) is admin-assisted by a recovery link (BR-ACCT-4, ADR-0018).
- **A-7:** An emulator browser cannot run a passkey ceremony, so the Maestro flows sign in by handing the app a code minted with the seed's software passkey sessions, exchanged through the app's real `vidfriends://auth` path with a verifier that only the E2E build carries; the `/app-auth` page is covered by Playwright. Real-device passkey sign-in on Android and iOS is a manual check (M7-T6).
- **A-3:** Scale is ≤ 50 users per instance. All performance numbers marked † are proposals.
- **A-5:** Expo push relay is acceptable (BC-6 exception).
- **A-6:** The M5 load test capped the `server` and `postgres` containers at 1 vCPU / 2 GB each as a stand-in for the 2 vCPU / 4 GB reference host (NFR-PERF-01); repeat on the alpha VM if it differs.

### 3.4 Open questions
**None open.** The owner resolved OQ-1..OQ-4 on 2026-10-03 ([BRD §7](requirements/BRD.md#7-open-questions-all-resolved-2026-10-03)):
- Download risk accepted for private groups.
- Licence is MIT.
- Name is VidFriends, with no project domain.
- There will be no public server ([ADR-0014](adr/0014-self-host-only-no-public-instance.md)).

### 3.5 Resolved conflicts between legacy sources

| Conflict | Resolution |
|---|---|
| Hosted service (2025) vs self-hosted (2026) | ADR-0005 |
| Broadcast vs per-recipient sends | ADR-0010 |
| Read/unread vs accept/reject inbox | Neither. The Share has watched, saved and hidden state (FRD §6–7). |
| Public likes and comments vs per-share reactions | ADR-0010 |
| Email vs username identity | Username, no email (BR-ACCT-1/4) |
| Go vs TS backend | ADR-0007 |

## 4. Documentation map

| Path | Purpose | Status | Authoritative for |
|---|---|---|---|
| [`AGENTS.md`](../AGENTS.md) | How agents work in this repo | Current | Process rules |
| `docs/ROADMAP.md` (this) | Plan and status | Current | Scope, priority, sequencing, completion |
| [`docs/requirements/BRD.md`](requirements/BRD.md) | Business requirements | Draft v1 | Outcomes BO-*, constraints BC-*, open questions |
| [`docs/requirements/PRD.md`](requirements/PRD.md) | Product requirements | Draft v1 | Personas, capabilities CAP-*, journeys J-*, non-goals |
| [`docs/requirements/FRD.md`](requirements/FRD.md) | Functional behaviour | Draft v1 | Workflows WF-*, rules BR-*, state machines, permissions |
| [`docs/requirements/SRS.md`](requirements/SRS.md) | Canonical requirements | Draft v1 | FR-*/NFR-* text, verification, traceability |
| [`docs/design/HLD.md`](design/HLD.md) | High-level design | Draft v1 | Components C-*, topology, trust boundaries, data flows |
| [`docs/design/SDD.md`](design/SDD.md) | Software design | Draft v1 | Module structure, authorization model, job semantics, client architecture |
| [`docs/design/TDD.md`](design/TDD.md) | Technical design | Draft v1 | Engineering choices, security engineering, deploy/ops, test strategy, migration |
| [`docs/design/LLD.md`](design/LLD.md) | Low-level design | Draft v1 | Schema, API outline, pipeline states, security mechanism parameters |
| [`docs/adr/`](adr/README.md) | Decision records 0001–0015 | Accepted | Architectural decisions |
| [`docs/legacy/AUDIT.md`](legacy/AUDIT.md) | Legacy findings and lessons L-* | Final | History only (not requirements) |
| [`docs/legacy/audits/`](legacy/audits/), [`docs/legacy/original-docs/`](legacy/original-docs/) | Raw audit evidence; verbatim legacy docs | Superseded / historical | Nothing (reference only) |

## 5. Milestones

```mermaid
flowchart LR
  M0[M0 Consolidation & plan] --> M1[M1 Foundations & accounts]
  M1 --> M2[M2 Friends & profiles]
  M1 --> M3[M3 Media pipeline]
  M2 --> M4[M4 Sharing, feed, engagement, notifications<br/>= Web MVP]
  M3 --> M4
  M4 --> M5[M5 Admin, operations, alpha]
  M4 --> M6[M6 Mobile apps]
  M5 --> V1((v1.0))
  M6 --> V1
  V1 --> M7[M7 Post-v1 backlog]
```

M2 and M3 can run in parallel after M1. M5 and M6 can run in parallel after M4. No dates are committed. Sizing is relative: M1 L, M2 S, M3 L, M4 XL, M5 M, M6 L.

**Every milestone exit requires:**
1. All listed tasks are merged.
2. The listed E2E/API specs pass in CI on `main`.
3. The docs are updated (AGENTS.md rules).
4. The authorization matrix covers every new route.
5. The status in this file is updated, with links to the evidence (PRs, test paths).

---

### M0: Consolidation and plan ✅

| Task | Status | Evidence / completion check |
|---|---|---|
| M0-T1 Transfer `vidshare` and `vidfriends` into the `VidFriends` org | ✅ | `gh repo list VidFriends` shows both (2026-10-03) |
| M0-T2 Merge all seven histories into this repo, tag `legacy-code-snapshot`, remove code, write docs | ✅ | Tag `legacy-code-snapshot`; this document set; [ADR-0002](adr/0002-consolidate-repos-and-greenfield-reset.md) |
| M0-T3 **Owner:** decommission any running legacy deployment (2025 Worker, 2026 compose stacks) and never reuse the committed VAPID key ([AUDIT §5](legacy/AUDIT.md#5-security-follow-ups-that-apply-outside-this-repository)) | ✅ | Owner confirmed on 2026-10-04 (multiple-choice answer: "Yes, all shut down") that no legacy service is reachable and the old VAPID key is retired. |
| M0-T4 Archive the six superseded repos (`vidshare`, `vidfriends-backend`, `-web`, `-ios`, `-android`, `VidFriends-iOS-Android`); close the 35 obsolete Dependabot PRs; reduce this repo to the single branch `main` | ✅ | Done 2026-10-03 at the owner's request. `gh repo list VidFriends` shows all six `archived=true`; only `main` remains here. Human-authored PR vidfriends-android#2 was left open in the archive, and its work is tagged `legacy/vidfriends-android-2026/vid-503-fix`. | `gh repo view … --json isArchived` returns true for each |
| M0-T5 Owner answers OQ-1..OQ-4 and reviews provisional decisions | ✅ | BRD §7 answers; ADR-0014; ADR-0005/0009/0013 status lines updated |

### M1: Foundations and accounts 🟡 (all tasks done except M1-T2 merge blocking: owner must enable branch protection)

**Goal:** a walking skeleton. An operator deploys the stack locally, claims the instance, creates an invite, and a friend registers through the join link, logs in and logs out. CI enforces the full quality gate.

**Requirements:**
- FR-PAIR-01, 02, 04 (web); FR-AUTH-01..06; FR-ACCT-02; FR-INV-01..03; FR-ADM-05 (audit writes)
- NFR-SEC-01 (harness), 02, 03, 04, 06, 07; NFR-PRIV-01..03; NFR-REL-02, 03; NFR-OPS-02, 03 (logs and health); NFR-I18N-01; NFR-MAINT-01, 02

**Prerequisites:**
- None technical.
- The owner should enable branch protection on `main` when CI lands (M1-T2).

| Task | Objective | References | Depends on | Completion check |
|---|---|---|---|---|
| M1-T1 Monorepo scaffold | pnpm workspace + Turborepo; `apps/server`, `apps/web`, `packages/{contracts,api-client,config,test-utils}`; shared tsconfig, ESLint (jsx-a11y, import/no-cycle) and Prettier; MIT LICENSE (BRD OQ-2); root README dev instructions | ADR-0012, TDD §1 | – | `pnpm install && pnpm build && pnpm lint && pnpm typecheck` succeed locally and in CI <br>**✅** `pnpm build/lint/typecheck` green in [CI run 183](https://github.com/VidFriends/vidfriends/actions/runs/37182089651) |
| M1-T2 CI pipeline | GitHub Actions on PR and `main`: static, unit, contract, API integration (Postgres + SeaweedFS S3 services, ADR-0015), Playwright (Chromium), Docker build, Trivy (blocking on fixable criticals), migration-immutability check, Dependabot or Renovate config | NFR-MAINT-02, NFR-SEC-07, NFR-REL-03, TDD §7 | T1 | Workflow green on a PR; a deliberately failing test blocks merge <br>**🟡** Workflow green in [CI run 183](https://github.com/VidFriends/vidfriends/actions/runs/37182089651); red runs observed for real failures. Merge blocking needs branch protection on `main`, which no available tool can set (owner action). |
| M1-T3 Contracts and OpenAPI | Error envelope, pagination schema, route-definition helper with `auth` level; `GET /instance`; OpenAPI generation script and CI drift check; typed client in `api-client` | ADR-0006, LLD §3, NFR-MAINT-01 | T1 | `pnpm --filter contracts gen` output is committed; CI fails when it is stale (verified by a test PR) <br>**✅** `packages/contracts/openapi.json` + `gen:check` step in [CI run 183](https://github.com/VidFriends/vidfriends/actions/runs/37182089651) |
| M1-T4 Server skeleton | Env config schema with secret checks; Hono app with the middleware chain from SDD §2 (request id, pino with redaction, security headers and CSP, IP rate limit, error mapper); `/healthz`, `/readyz`; SPA static serving with fallback; `ROLE` entrypoint; graceful shutdown | SDD §1–2, TDD §3, LLD §5, NFR-SEC-03/04/06, NFR-OPS-02/03, NFR-REL-02, NFR-PRIV-02 | T3 | Unit tests: config rejects default and short secrets; log redaction; API test: security headers present, `/readyz` fails when the DB is down <br>**✅** `apps/server/test/{config,logger,http,ip}.test.ts` |
| M1-T5 Database and migrations | Drizzle setup; migrate entrypoint; tables `users`, `sessions`, `invites`, `invite_redemptions`, `relationships` (for auto-friend), `instance_settings`, `audit_log`, `password_resets` | LLD §2, NFR-REL-03 | T4 | `migrate` applies to an empty DB in CI; migration checksum file present <br>**✅** `apps/server/drizzle/` + `CHECKSUMS`; migrate applied in CI |
| M1-T6 Containers and compose | Multi-target Dockerfile (`server`; `worker` stub); `deploy/compose.dev.yml`; `deploy/compose.yml` (caddy, migrate, server, worker, postgres, seaweedfs per ADR-0015) and `.env.example` without working secrets | HLD §3, TDD §6 | T4, T5 | `docker compose -f deploy/compose.yml up` on a clean machine reaches `/readyz` = 200 behind Caddy (local TLS) <br>**✅** `Dockerfile`, `deploy/compose.yml`; stack reaches `/readyz` behind Caddy in [CI run 183](https://github.com/VidFriends/vidfriends/actions/runs/37182089651) |
| M1-T7 Authentication and sessions | Setup bootstrap; register (invite, auto-friend); login and logout (all); session middleware (cookie and bearer, idle and absolute expiry, status and role from DB); CSRF; password change; auth rate limits; audit entries | FRD §2–3, ADR-0008, LLD §3/§5, FR-AUTH-*, FR-ACCT-02 | T5 | API tests per FR-AUTH-01..06 including suspended-user rejection and concurrent invite consumption; unit tests for validation and password denylist <br>**✅** `apps/server/test/auth.test.ts` |
| M1-T8 Invites | Create, list, revoke, preview; hashed codes; `members_can_invite` setting | FR-INV-01..03, BR-INV-* | T7 | API tests; code is returned only once; revoked or expired invites are rejected <br>**✅** `apps/server/test/invites.test.ts` |
| M1-T9 Authorization-matrix harness | `test-utils` fixture world and matrix runner; CI fails for any id-bearing route not in the matrix | SDD §3, NFR-SEC-01 | T7 | Harness covers all M1 routes; meta-test proves an unlisted route fails CI <br>**✅** `packages/test-utils/src/authz-matrix.ts`, `apps/server/test/authz-matrix.test.ts` (meta-test included) |
| M1-T10 Web shell | Vite + TanStack Router/Query + Tailwind + shadcn/ui + i18n catalogs; routes `/setup`, `/login`, `/join/$code`, app layout with nav placeholders (only real routes are linked), `/settings` (password change, logout everywhere), `/invites` (create with join URL and QR, list, revoke); global 401 handling | ADR-0003, SDD §5, TDD §4, FR-PAIR-02/04, FR-INV-03 | T3, T7, T8 | Playwright specs below pass; axe reports no violations on these pages <br>**✅** `apps/web/src/routes/*`; axe-clean in the E2E specs |
| M1-T11 E2E harness and acceptance | Playwright runs against the production image via compose; API-based seed helpers; specs `setup.spec.ts` (J-1: claim instance, create invite) and `join.spec.ts` (J-2: register through join URL, auto-friend relationship exists via API, logout, login) | TDD §7, NFR-MAINT-03 | T6, T10 | Both specs green in CI on `main` <br>**✅** `e2e/tests/setup.spec.ts`, `e2e/tests/join.spec.ts` green in [CI run 183](https://github.com/VidFriends/vidfriends/actions/runs/37182089651) |

**Exit criteria:** every check above passes. A new agent can run `pnpm dev`, then `pnpm test`, then `pnpm e2e` by following the README.

### M2: Friends and profiles ✅

**Goal:** members find each other and manage relationships.
**Requirements:** FR-ACCT-01; FR-FRND-01..05.
**Prerequisites:** M1.

| Task | Objective | References | Completion check |
|---|---|---|---|
| M2-T1 Relationship service | State machine with auto-accept, decline cooldown, block and unblock, rate limit | FRD §4, LLD §2 `relationships` | Table-driven API test covering every transition and every forbidden transition <br>**✅** `apps/server/test/friends.test.ts` (26-row transition table) |
| M2-T2 Search and lists | `GET /users`, friends, requests (in and out), blocks | BR-FRND-8 | API tests, including block-aware exclusion; authz matrix updated <br>**✅** `apps/server/test/friends.test.ts` (search, lists) |
| M2-T3 Object storage foundation | S3 client, presigned PUT/GET helpers, key scheme, SeaweedFS in the CI services | ADR-0009, ADR-0015, LLD §4 | API test: presign round-trip against SeaweedFS <br>**✅** `apps/server/test/storage.test.ts` |
| M2-T4 Profile and avatar | Display name edit; avatar upload (presigned, re-encoded to 256 px WebP by an inline server step or a simple job) | FR-ACCT-01, BR-ACCT-3, NFR-SEC-08 | API test rejects a non-image disguised as an image <br>**✅** `apps/server/test/profile.test.ts` |
| M2-T5 Friends UI | `/friends` (search, requests, friends, blocked) with optimistic actions and rollback | SDD §5, NFR-A11Y-01 | Playwright `friends.spec.ts`: request → accept → remove → block → unblock across two users <br>**✅** `e2e/tests/friends.spec.ts` green in [CI run 183](https://github.com/VidFriends/vidfriends/actions/runs/37182089651) |

**Exit:** M2-T5 spec green; FR-FRND state-machine test green.

### M3: Media pipeline 🟡 (M3-T7 dispatch check pending merge)

**Goal:** a member adds a video by link or upload and it becomes playable (or link-only) through durable jobs.
**Requirements:** FR-VID-01..05, 07, 09; NFR-SEC-05, 08; NFR-REL-01; NFR-PERF-03; NFR-OPS-05.
**Prerequisites:** M1, plus M2-T3 (storage). M3 can start with T1–T3 in parallel with M2.

| Task | Objective | References | Completion check |
|---|---|---|---|
| M3-T1 Job runtime | pg-boss setup, worker entrypoint, transactional enqueue helper, job conventions (idempotency, logging, metrics hooks) | SDD §4, ADR-0007 | Kill-and-restart API test: an enqueued job completes exactly once after a worker restart <br>**✅** `apps/server/test/jobs.test.ts` |
| M3-T2 URL validation and normalisation | Allowlist, SSRF guard (DNS + private ranges), normalisation rules, short-link resolution | BR-MED-1, LLD §4, NFR-SEC-05 | Unit test table of ≥ 40 URLs (valid, invalid, SSRF, tracking params) <br>**✅** `apps/server/test/url.test.ts` (52 URLs) |
| M3-T3 `video.fetch` | yt-dlp runner (execFile, `--`, caps, temp directory cleanup), retries, link_only fallback, `link_download_enabled` | FR-VID-02, 09, TDD §2 | API tests using a **fake yt-dlp script** fixture covering success, oversize, timeout, failure → link_only; temp dir empty after each <br>**✅** `apps/server/test/media.test.ts` (fake yt-dlp) |
| M3-T4 `video.process` | ffprobe, remux or transcode, thumbnail, upload renditions, storage accounting | FR-VID-04, LLD §4 | Fixture media tests: H.264 MP4 (remux), HEVC MOV (transcode), corrupt file (failed) <br>**✅** `apps/server/test/media.test.ts` (H.264 remux, HEVC transcode, corrupt) |
| M3-T5 Uploads | Presigned (multipart) upload, complete, sniff, hash, dedup | FR-VID-03, BR-MED-4 | API tests: quota exceeded rejected before upload; duplicate hash reuses the video <br>**✅** `apps/server/test/media.test.ts` (quota, dedup, sniffing, multipart) |
| M3-T6 Media access | `GET /videos/{id}`, media URL issuance with visibility rule (added_by only until M4), Range support verified through Caddy | FR-VID-05, BR-SHR-6 | API test performs a Range GET via the presigned URL through the proxy and gets 206 <br>**✅** `apps/server/test/media.test.ts` (206 via presigned URL); through Caddy in `e2e/tests/add-video.spec.ts` |
| M3-T7 Worker image and yt-dlp bump | Worker target with pinned yt-dlp and ffmpeg, sandbox settings; scheduled workflow opening bump PRs; nightly opt-in live smoke test | NFR-OPS-05, TDD §2 | Image builds in CI; the bump workflow opens a PR on manual dispatch <br>**🟡** Worker image builds with pinned yt-dlp in [CI run 183](https://github.com/VidFriends/vidfriends/actions/runs/37182089651). `yt-dlp-bump.yml` dispatched on `main` ([run](https://github.com/VidFriends/vidfriends/actions/runs/37187694825)): it found the pin current, so no PR was due; the PR-opening path runs on the next yt-dlp release. Nightly live smoke dispatched ([run](https://github.com/VidFriends/vidfriends/actions/runs/37187693463)). |
| M3-T8 Minimal UI | `/send` step 1: paste link or upload with progress, show processing state and preview player | PRD J-3 | Playwright `add-video.spec.ts`: fixture link becomes ready and plays; seeking works <br>**✅** `e2e/tests/add-video.spec.ts` green on Chrome in [CI run 183](https://github.com/VidFriends/vidfriends/actions/runs/37182089651) |

**Exit:** all of the above green. No test depends on real source platforms.

### M4: Sharing, feed, engagement, notifications (Web MVP) 🟡 (all built and tested; M4-T6 real-device push/share-target check and the M4-T7 nightly browser matrix are pending)

**Goal:** the core product loop works on the web.
**Requirements:** FR-SHR-01..05; FR-FEED-01..06; FR-ENG-01..02; FR-NOTIF-01, 02(S), 04, 05; FR-PWA-01..02(S); FR-VID-08(C); NFR-A11Y-01; NFR-COMPAT-01; NFR-PERF-02, 04(S).
**Prerequisites:** M2, M3.

| Task | Objective | References | Completion check |
|---|---|---|---|
| M4-T1 Shares | Send (idempotent, per-recipient results), deferred delivery on ready or link-only, unsend | WF-SHR-1/2, LLD §2–4 | API tests including idempotency replay and the authz matrix for share routes <br>**✅** `apps/server/test/shares.test.ts`, `authz-matrix.test.ts` |
| M4-T2 Feed queries | Feed, inbox (48 h), saved, history, sent, keyset pagination, "also sent by" | BR-FEED-*, LLD §2 | API tests with a fake clock; `EXPLAIN` on 10k seeded shares uses the feed index <br>**✅** `apps/server/test/shares.test.ts` ("uses the feed index on 10k seeded shares") |
| M4-T3 Vertical player | 3-slot player, preload, muted autoplay and unmute, keyboard, reduced motion, link-only and expired cards, progress beacons | FRD §7, TDD §4 | Playwright `watch.spec.ts` (clock-controlled watched threshold); axe clean <br>**✅** `e2e/tests/watch.spec.ts` |
| M4-T4 Engagement | Reaction set, replies (rate limit, delete placeholder) | FRD §8 | API and Playwright `conversation.spec.ts` <br>**✅** `apps/server/test/engagement.test.ts`; the conversation flow (react, reply, sender sees both) is covered in `e2e/tests/watch.spec.ts` rather than a separate `conversation.spec.ts` |
| M4-T5 Notifications (in-app) | Notification writes in the same transaction, list, unread count, mark-read, prefs, polling | FRD §9, ADR-0011 | API tests; Playwright badge updates within 60 s <br>**✅** `apps/server/test/notifications.test.ts`; badge assertion in `e2e/tests/watch.spec.ts` |
| M4-T6 Web Push and PWA | VAPID key management, subscription UI, dispatch job with coalescing and gone-cleanup; manifest, icons, SW with correct fallback, share target | FR-NOTIF-02, FR-PWA-01/02 | API test with a push-service mock; runbook checks on Chrome desktop and Android (real push, share target) recorded in the PR <br>**🟡** Push-service mock tests in `apps/server/test/notifications.test.ts`; SW/manifest/share target built and served. Real-device checks need a phone and a public HTTPS instance: folded into M5-T9 (alpha). |
| M4-T7 Web MVP acceptance | Specs J-3..J-6 across Chromium, Firefox and WebKit; bundle-size check | PRD §6 | All green in CI (nightly for the full browser matrix) <br>**🟡** J-3..J-6 green on Chrome in CI; bundle budget enforced (177 kB gzip of 250 kB). `nightly.yml` (Firefox and WebKit) dispatched on `main` after the merge of [PR #112](https://github.com/VidFriends/vidfriends/pull/112): [run](https://github.com/VidFriends/vidfriends/actions/runs/37187693463). |

**Exit:** the web MVP is usable by an invited group on a dev or staging deployment.

### M5: Admin, operations, alpha 🟡 (T1–T5, T7 done; T6/T8 final checks and T9 wait for the alpha, postponed by the owner)

**Goal:** an operator can run the instance safely. The owner's alpha group uses it.
**Requirements:** FR-ACCT-03, 04(S); FR-VID-06; FR-ADM-01..05 (UI); NFR-REL-04, 05; NFR-DATA-01; NFR-OPS-01, 03 (metrics), 04; NFR-PERF-01.
**Prerequisites:** M4. The alpha is a **private** instance run by the owner for their own group. There is no public launch ([ADR-0014](adr/0014-self-host-only-no-public-instance.md)).

| Task | Objective | Completion check |
|---|---|---|
| M5-T1 Admin console | Users, invites, settings, storage, audit log screens and APIs (WF-ADM-*) | Playwright `admin.spec.ts` (suspend → session rejected; last-admin protection; password-reset link) <br>**✅** `e2e/tests/admin.spec.ts`; APIs in `apps/server/test/admin.test.ts` |
| M5-T2 Retention and sweeper | `retention.purge`, `storage.sweep`, `session.cleanup` crons, manual run | API time-travel tests; the sweeper finds a planted orphan <br>**✅** `apps/server/test/maintenance.test.ts` |
| M5-T3 Account deletion | WF-ACCT-3, including media purge | API test verifies no rows or objects remain for the user within the job run <br>**✅** `apps/server/test/admin.test.ts` (account deletion) |
| M5-T4 Ops hardening | Metrics endpoint, optional monitoring compose, log rotation, release workflow (GHCR multi-arch, SBOM), upgrade doc | A tag on a test repo produces images; the upgrade runbook is executed <br>**✅** [v0.1.0-rc.1](https://github.com/VidFriends/vidfriends/releases/tag/v0.1.0-rc.1) published by `release.yml` dispatched on `main` (multi-arch GHCR images, SPDX SBOMs, provenance; [run](https://github.com/VidFriends/vidfriends/actions/runs/37204500580)). Metrics, monitoring overlay, log rotation and the upgrade runbook as before ([RUNBOOK §7](../deploy/RUNBOOK.md#7-records)); the arm64 image build no longer runs Node under QEMU (SIGILL fix). |
| M5-T5 Backup and restore | Scripts and runbook for Postgres and object storage | Restore drill recorded (date, RPO and RTO observed) in `deploy/RUNBOOK.md` <br>**✅** `deploy/backup/`, drill in [RUNBOOK §7](../deploy/RUNBOOK.md#7-records); repeated in CI by `e2e/scripts/restore-drill.sh` |
| M5-T6 Fresh-VM deploy | Runbook from a blank VM to a claimed instance in ≤ 30 min (BO-4) | Executed and timed by someone (or an agent) following only the docs <br>**🟡** Executed by an agent from the docs: 28 s to a claimed instance excluding Docker install and image pulls ([RUNBOOK §7](../deploy/RUNBOOK.md#7-records)). Repeat on a real blank VM with released images during M5-T9. |
| M5-T7 Load and security review | k6 at 50 VUs (NFR-PERF-01); threat-model review against TDD §5; dependency audit | Report committed under `docs/reports/`; issues fixed or accepted in an ADR <br>**✅** [Report](reports/2026-10-04-m5-load-and-security-review.md) (p95 20.9 ms at 50 VUs; findings F-1..F-6 fixed); residual risks accepted in [ADR-0016](adr/0016-accepted-residual-security-risks-v0-1.md) |
| M5-T8 Operator and user guides | Self-hosting guide, privacy disclosure, member help pages | Docs reviewed against the deployed alpha <br>**🟡** [Self-hosting guide](guides/self-hosting.md), in-app `/privacy` and `/help` (`e2e/tests/docs.spec.ts`), [runbook](../deploy/RUNBOOK.md). Reviewed against the E2E deployment; the review against the owner's alpha happens in M5-T9. |
| M5-T9 Alpha release v0.1.0 | Owner's private self-hosted instance live; alpha group onboarded; BO metrics collection plan (manual, privacy-preserving) | Owner sign-off <br>**⏸** Postponed by the owner (multiple-choice answer, 2026-10-04). M4-T6, M5-T6 and M5-T8 checks that depend on it wait with it. |

### M6: Mobile apps (Expo) 🟡 (T1–T4 and T6 done; T5 device checks wait for devices; T7 store builds blocked on accounts; T8 deferred by the owner)

**Goal:** iOS and Android apps with share-sheet intake and push.
**Requirements:** FR-PAIR-03, 04 (app links); FR-NOTIF-03; FR-MOB-01..03; NFR-A11Y-02; NFR-COMPAT-02.
**Prerequisites:** M4 (stable API v1). There is no default instance or domain ([ADR-0014](adr/0014-self-host-only-no-public-instance.md)). Store submission needs the owner's Apple and Google developer accounts (BC-7; owner answer 2026-10-04: none yet, so M6-T7 is ⛔).

| Task | Objective | References | Completion check |
|---|---|---|---|
| M6-T1 Scaffold | `apps/mobile` on Expo SDK 57 (expo-router, TypeScript strict), shared `contracts` and `api-client`, one React version for the monorepo ([ADR-0017](adr/0017-single-react-version-pinned-by-expo.md)), i18n catalogue, lint/typecheck/Jest, Metro bundles in CI | ADR-0004, ADR-0012, TDD §4 | `mobile.yml` checks job green (lint, typecheck, unit tests, Android and iOS bundles) <br>**✅** [PR #116](https://github.com/VidFriends/vidfriends/pull/116); `mobile.yml` checks job green on the merged head ([Mobile run](https://github.com/VidFriends/vidfriends/actions/runs/37202568887)) |
| M6-T2 Pairing | Scan QR (expo-camera) or paste a join/instance link; verify `GET /instance` (API major) before saving; base URL and token in secure storage, applied on launch; plain http only to private IP literals with a warning | WF-PAIR-1..3, FR-PAIR-03, FR-MOB-03 | Unit tests `apps/mobile/src/lib/instance.test.ts`; Maestro `join.yaml` pairs by pasting a join link <br>**✅** [PR #116](https://github.com/VidFriends/vidfriends/pull/116); `apps/mobile/src/lib/instance.test.ts`; Maestro `join.yaml` green ([Mobile run](https://github.com/VidFriends/vidfriends/actions/runs/37202568887)) |
| M6-T3 Auth | Log in, register through the invite (J-2), sign out, switch server only after sign-out, global 401 → sign-in | FR-AUTH-*, WF-PAIR-2, L-17 | Maestro `join.yaml`, `watch.yaml` (sign out, sign in) <br>**✅** [PR #116](https://github.com/VidFriends/vidfriends/pull/116); Maestro `join.yaml` and `watch.yaml` (sign out, sign in) green ([Mobile run](https://github.com/VidFriends/vidfriends/actions/runs/37202568887)) |
| M6-T4 Core screens | Vertical feed (≤ 3 players, muted autoplay, reduced motion, progress beacons, link-only cards), inbox, saved, history, sent, send (link or video upload), friends, share conversation with reactions and replies, notifications with badge | FR-MOB-01, FRD §7–9 | Maestro `send.yaml` (J-3) and `watch.yaml` (J-4/5); unit tests for progress throttling and uploads <br>**✅** [PR #116](https://github.com/VidFriends/vidfriends/pull/116); Maestro `send.yaml`, `watch.yaml` green ([Mobile run](https://github.com/VidFriends/vidfriends/actions/runs/37202568887)); the run found and fixed a Hermes crash (`Intl.RelativeTimeFormat`), now covered by `src/i18n/relative-time.test.ts` |
| M6-T5 Share intent and push | `expo-share-intent` (iOS extension, Android `text/*` and `video/*`) opens Send; Expo push tokens registered as push targets; server Expo push channel with gone-token cleanup; taps open the share | FR-MOB-02, FR-NOTIF-03, ADR-0011, BR-NOT-3/6 | Server unit test `apps/server/test/push-expo.test.ts`; mobile `push-target.test.ts`; device runbook (share from TikTok/YouTube/Instagram, real push) during the alpha <br>**🟡** [PR #116](https://github.com/VidFriends/vidfriends/pull/116): server and mobile unit tests green. The device runbook (share sheet from TikTok/YouTube/Instagram, real push) waits for real devices (postponed alpha, M5-T9) |
| M6-T6 Android E2E and accessibility | Release APK built from the Expo project in CI; stack in its emulator HTTP variant; Maestro flows J-2..J-5 on an Android 14 emulator; accessibility review (labels, roles, font scaling, reduced motion) | NFR-A11Y-02, NFR-COMPAT-02, TDD §7 | `mobile.yml` android-e2e job green; review notes in the PR <br>**✅** [PR #116](https://github.com/VidFriends/vidfriends/pull/116); `mobile.yml` android-e2e green ([Mobile run](https://github.com/VidFriends/vidfriends/actions/runs/37202568887)); accessibility review notes in `apps/mobile/README.md` |
| M6-T7 Store builds | EAS project, signing, TestFlight and Play internal track; iOS build and Maestro on macOS runners | BC-7 | ⛔ Owner: Apple and Google developer accounts |
| M6-T8 Sideloadable Android APK | Owner choice (2026-10-04) while store accounts are missing: the release workflow builds a universal release APK, re-signs it with the project's upload key from repository secrets (never committed), attaches it with its SHA-256 to the GitHub release; [sideload guide](guides/android-sideload.md) and the help page explain installing. iOS waits for M6-T7 | FR-MOB-01, BC-7 | `release.yml` `android` job builds and verifies the APK on the PR; a dispatched release has the `.apk` and `.sha256` assets. **Owner action:** add the four `ANDROID_*` signing secrets (guide); without them the APK is built but not attached <br>**⏸** Deferred by the owner (2026-10-04): releases stay images-only for now; the `android` job still builds and verifies the APK. For trying the app, `mobile.yml` run by hand with *test_apk* uploads a test-signed arm64 APK as a workflow artifact |

**Exit:** Maestro suites green; TestFlight and Play internal builds installed by the alpha group; share-to-send works from TikTok, YouTube and Instagram on both platforms (runbook).

### v1.0
M5 and M6 are complete, and every Must requirement in the SRS has passing verification (PRD §6).

### M7: Post-v1 backlog 🟡 (data export and passkey-only sign-in done; M7-T6 real-device check pending; realtime updates M7-T7..T9 scheduled by the owner)

Each item needs a PRD update and, where architectural, an ADR before work starts. The owner chose data export as the first item (multiple-choice answer, 2026-10-04); PRD CAP-18 and SRS FR-ACCT-05 now describe it.

| Task | Objective | References | Completion check |
|---|---|---|---|
| M7-T1 Data export | A member requests a ZIP of their data (profile, friends, sent and received shares with notes, reactions and conversations, videos added, security log, avatar, optional media under 4 GiB); built by the `account.export` job; signed download for 7 days; one in progress, 3 per day; removed with the account; Settings card on the web | FR-ACCT-05, WF-ACCT-4, LLD §2 `exports`, §3 | `apps/server/test/exports.test.ts`; authz matrix `downloadExport`; Playwright `e2e/tests/export.spec.ts` <br>**✅** [PR #117](https://github.com/VidFriends/vidfriends/pull/117); CI green on the merged head (API tests, authz matrix, Playwright in "Images, Trivy and E2E") |
| M7-T2 Data export on mobile | The same card in the app's Settings; the app fetches the signed link as data (`GET /me/exports/{id}/download-url`, bearer clients cannot follow the redirect) and opens it in the browser | FR-ACCT-05, FR-MOB-01 | Maestro `apps/mobile/e2e/flows/export.yaml` requests an export and sees it ready; authz matrix `getExportUrl` <br>**✅** [PR #117](https://github.com/VidFriends/vidfriends/pull/117); Android Maestro run including `export.yaml` green |
| M7-T3 Passkey-only decision and specs | ADR-0018 (passkeys only, no passwords; supersedes the password parts of ADR-0008): HTTPS on a domain name required, admin recovery link plus a server command for locked-out admins, mobile sign-in by browser hand-off. PRD, SRS (FR-AUTH-01..04, FR-ACCT-02/03, FR-ADM reset link, NFR-SEC-02, FR-PAIR-03), FRD workflows and LLD schema updated | Owner answers 2026-10-04, ADR-0008, ADR-0013 | Docs merged; no requirement still mentions passwords <br>**✅** [PR #121](https://github.com/VidFriends/vidfriends/pull/121): ADR-0018; SRS/FRD/PRD/BRD/LLD updated |
| M7-T4 Passkeys on the server | WebAuthn registration and sign-in (setup, invite registration, sign-in, add/remove passkeys), recovery links (admin route and `recovery-link` server command), password columns and routes removed in a new migration, plain-http `PUBLIC_URL` refused at start | M7-T3 | API tests with a software authenticator; authz matrix for the new id routes <br>**✅** [PR #121](https://github.com/VidFriends/vidfriends/pull/121): `apps/server/test/auth.test.ts`, `admin.test.ts`, authz matrix; "Unit, contract and API tests" green |
| M7-T5 Passkeys on the web | Setup, join, sign-in, recovery, Settings → Passkeys and the app hand-off page (`/app-auth`) | M7-T4 | Playwright: setup, join, sign in, add/rename/remove a passkey, recovery link, app hand-off (sign-in and join). Personas' passkeys are software authenticators answering the page's WebAuthn calls (`e2e/support/passkeys.ts`), so the nightly Firefox/WebKit runs work too <br>**✅** [PR #121](https://github.com/VidFriends/vidfriends/pull/121): `e2e/tests/{setup,join,admin,passkeys,app-auth}.spec.ts` green in "Images, Trivy and E2E" |
| M7-T6 Passkeys on mobile | Sign-in and join through the server's pages in a secure browser sheet that returns a one-time code exchanged for the app session (PKCE); plain-http pairing removed except loopback; Android cleartext only to loopback | M7-T4, M7-T5 | Unit tests for the hand-off and pairing; Maestro suite green with the hand-off sign-in (A-7). **Manual:** sign in on a real Android phone and iPhone against an HTTPS instance <br>**🟡** [PR #121](https://github.com/VidFriends/vidfriends/pull/121): `apps/mobile/src/lib/handoff.test.ts`, `instance.test.ts`; Maestro suite green with the hand-off sign-in. The manual real-device check is pending |
| M7-T7 Realtime on the server | ADR-0019: `GET /events` server-sent events with invalidation hints only (BR-NOT-7); `notify()` and the mark-read paths `pg_notify` in their transaction; one `LISTEN` connection per API process; 5 streams per member; session re-check every 25 s; 30-minute streams; `vidfriends_realtime_streams` gauge | FR-NOTIF-06, ADR-0019, owner answer 2026-10-04 | `apps/server/test/realtime.test.ts`: events for a new share, mark-read, per-member isolation, stream limit, revoked session and suspension end the stream <br>**✅** [PR #122](https://github.com/VidFriends/vidfriends/pull/122): `apps/server/test/realtime.test.ts` green in "Unit, contract and API tests" |
| M7-T8 Realtime on the web | One `EventSource` per signed-in tab; events invalidate the queries named by `routesFor()` (`@vidfriends/api-client/realtime`); polling stays as fallback | M7-T7 | Playwright `e2e/tests/realtime.spec.ts` through the production proxy: badge and inbox update within 5 s and clear when another device reads <br>**✅** [PR #122](https://github.com/VidFriends/vidfriends/pull/122): `e2e/tests/realtime.spec.ts` green in "Images, Trivy and E2E" |
| M7-T9 Realtime on mobile | `expo/fetch` stream while signed in and in the foreground, reconnect with backoff, same invalidation map | M7-T7 | Maestro `watch.yaml`: a reply sent from another device shows in the open conversation within 8 s (it does not poll) <br>**✅** [PR #122](https://github.com/VidFriends/vidfriends/pull/122): Maestro `watch.yaml` live reply green in "Android build and Maestro E2E" |
| M7-T10 ntfy and Gotify on the server | ADR-0020: `ntfy`/`gotify` push target kinds with encrypted tokens (migration `0006_push_channels`), senders through the egress guard (https, public addresses pinned per connection, `PUSH_PRIVATE_HOSTS` for home-network servers), gone on 401/403/404, `GET /push-targets`, `POST /push-targets/{id}/test` (5 per 10 min), 5 targets per member | FR-NOTIF-07, BR-NOT-8, owner answer 2026-10-04 | `apps/server/test/push-servers.test.ts` (delivery with token and click link, private previews, gone, limits, SSRF refusals, guard pinning); authz matrix `testPushTarget` <br>**✅** [PR #123](https://github.com/VidFriends/vidfriends/pull/123): `apps/server/test/push-servers.test.ts` and authz matrix green |
| M7-T11 ntfy and Gotify in Settings (web) | Card to add (URL, token, private previews), test and remove targets; privacy and self-hosting texts | M7-T10 | Playwright `e2e/tests/push-servers.spec.ts` against a fake ntfy service on the compose network <br>**✅** [PR #123](https://github.com/VidFriends/vidfriends/pull/123): `e2e/tests/push-servers.spec.ts` green in "Images, Trivy and E2E" |
| M7-T12 Cloudflare test instance | ADR-0021: one container (app `ROLE=all`, PostgreSQL, SeaweedFS) behind a Worker on `vidfriends.app`, backups to a private R2 bucket every 15 min and on shutdown, restore on start; `deploy/cloudflare/deploy.sh` | Owner answers 2026-10-04 | Local round trip: claim, stop (final backup), fresh container restores; deployed: `/readyz` ok, web app served, `/__backup` refuses unauthenticated requests, `www` redirects. **Owner:** claim with the setup token from the container logs; upload an avatar or video to confirm media through `/media-store` <br>**🟡** [PR #123](https://github.com/VidFriends/vidfriends/pull/123); deployed at https://vidfriends.app (`/readyz` ok). Owner: claim it and upload media to confirm `/media-store` |
| M7-T13 Offline downloads (mobile) | `video.media_bytes` in the API; the app downloads a share's video into private storage (progress, cancel), lists it under More → Downloads with a 1/2/5 GB cap, plays it offline, removes copies whose share is gone (BR-OFF-3) and all copies on sign-out or server change (BR-OFF-4) | FR-MOB-04, BR-OFF-1..4, owner answer 2026-10-04 | Unit `apps/mobile/src/features/offline/plan.test.ts`; API `media.test.ts` (`media_bytes`); Maestro `offline.yaml`: download, airplane mode, play from Downloads <br>**✅** [PR #124](https://github.com/VidFriends/vidfriends/pull/124): unit, API and Maestro `offline.yaml` green in CI |
| M7-T14 Spanish (web and app) | Spanish catalogs for the web app and the mobile app; language from the browser or phone, override in Settings (per device); `lang` on the web document; a parity test keeps keys and placeholders identical | NFR-I18N-01, owner answer 2026-10-04 | `apps/web/src/i18n/catalog.test.ts`, `apps/mobile/src/i18n/catalog.test.ts` green; Playwright `e2e/tests/language.spec.ts` (Spanish browser, switch in Settings, back to following the browser) |
| M7-T15 Push titles in the member's language | `users.language` (migration `0007_user_language`), `PATCH /me {language}` and `SelfUser.language`; web and app report the language in use; Web Push, Expo, ntfy and Gotify titles (and the private-previews and test titles) in English or Spanish | NFR-I18N-01, owner answer 2026-10-04 | `apps/server/test/push-servers.test.ts` (Spanish titles through ntfy); Playwright `language.spec.ts` checks the account records Spanish |
| M7-T16 Groups of friends (group sends) | `friend_groups` and `friend_group_members` (migration `0008_friend_groups`), CRUD API (owner-only, authz matrix), Friends → Groups card on the web, group buttons on Send (web and app) that select the members; one share per recipient as before (ADR-0010) | FR-FRND-06, BR-GRP-1..3, owner answer 2026-10-04 | `apps/server/test/groups.test.ts`; authz matrix `updateFriendGroup`/`deleteFriendGroup`; Playwright `e2e/tests/groups.spec.ts` |

Remaining backlog (not scheduled; passkeys moved to M7-T3..T6, realtime to M7-T7..T9, offline downloads to M7-T13):

| Item | Source |
|---|---|
| Collections (CAP-14) | 2026 web/backend |
| UnifiedPush channel (needs a native connector in the app; ADR-0020) | ADR-0011 |
| Perceptual dedup | 2026 backend, redesigned per L-19 |
| More languages | NFR-I18N-01 |
| Optional egress proxy for a hardened worker | TDD §5 residual risk |

## 6. Risks

| ID | Risk | Likelihood / impact | Mitigation | Trigger to revisit |
|---|---|---|---|---|
| R-1 | Legal or ToS exposure from downloading platform media | M / H | Private instances, retention, `link_download_enabled` switch, risk accepted by owner (OQ-1, 2026-10-03) | Takedown notice or owner legal advice |
| R-2 | yt-dlp breakage when platforms change | H / M | Pinned plus automated bumps (yt-dlp and its EJS solver together), Node as yt-dlp's JS runtime, link_only fallback, nightly live smoke test. 2026-10-04: from GitHub's datacenter network YouTube answers with a bot check and Vimeo requires login and browser impersonation (`curl_cffi`, not in the Alpine worker); the smoke reports these. Self-hosted home connections are usually not bot-checked; verify on the alpha (M5-T9). | Smoke test failing for more than 3 days; alpha members seeing mostly link-only cards |
| R-3 | Another restart through scope drift or unverifiable "done" claims | M / H | This roadmap + AGENTS.md rules + E2E-gated exits (NFR-MAINT-03) | Any milestone closed without linked CI evidence |
| R-4 | Expo share-extension or monorepo friction | M / M | Spike at the start of M6; fall back to native share-extension module | Spike fails |
| R-5 | Mobile push depends on the Expo service | L / M | In-app list is authoritative; operator can disable | Expo policy change |
| R-6 | Storage growth on small hosts | M / M | Quotas, retention, external S3 option | Instance > 80% disk |
| R-7 | Leaked historical secrets (VAPID key, dev JWT) used against old deployments | L / M | M0-T3 | – |
| R-8 | Onboarding friction without a default instance (users must scan or paste) | M / M | In-app QR scanner, join-page "open in app" hint, clear operator docs (ADR-0014) | Alpha feedback |

## 7. Next actionable milestone

**M7: post-v1 backlog.** Data export and passkey-only sign-in are done; realtime updates (M7-T7..T9) are next, chosen by the owner on 2026-10-04.
- **Now (agents):** M7-T14/T15 Spanish and localised push titles, then M7-T16 groups of friends (owner's choices, 2026-10-04); then the next backlog item the owner schedules.
- **Owner:** check passkey sign-in on a real Android phone and iPhone against an HTTPS instance (M7-T6); enable branch protection on `main` (M1-T2); Apple and Google developer accounts for store builds (M6-T7). The alpha (M5-T9) is postponed by the owner.
- **Verification:** each item's completion check in §5, with the CI run or record linked in the task row.

## 8. Change log

| Date | Change |
|---|---|
| 2026-10-04 | M7-T7..T9 realtime updates ✅, merged in [PR #122](https://github.com/VidFriends/vidfriends/pull/122) with CI green, including the Android Maestro suite. |
| 2026-10-04 | Owner answer (multiple choice): next, **group sends**: named groups of friends picked on Send (M7-T16, FR-FRND-06, BR-GRP-1..3); still one share per recipient. |
| 2026-10-04 | Owner answer (multiple choice): next, **push titles in the member's language** (M7-T15). |
| 2026-10-04 | M7-T13 offline downloads ✅, merged in [PR #124](https://github.com/VidFriends/vidfriends/pull/124) with the Android Maestro offline flow green. |
| 2026-10-04 | Owner answer (multiple choice): after offline downloads, a **second language**: Spanish for the web app and the app (M7-T14, NFR-I18N-01). |
| 2026-10-04 | Owner answer (multiple choice): next is **offline downloads** on mobile (CAP-15 → M7-T13, FR-MOB-04, BR-OFF-1..4). M7-T10..T12 merged in [PR #123](https://github.com/VidFriends/vidfriends/pull/123). |
| 2026-10-04 | Owner answers (multiple choice): deploy a **Cloudflare test instance** at `vidfriends.app`, data kept by backups to R2, real link downloads (M7-T12, ADR-0021). |
| 2026-10-04 | Owner answer (multiple choice): after realtime, **more push channels**: ntfy and Gotify (M7-T10/T11, ADR-0020, FR-NOTIF-07); UnifiedPush stays in the backlog. |
| 2026-10-04 | Owner answers (multiple choice): next is **realtime updates** (CAP-19 → M7-T7..T9, ADR-0019, FR-NOTIF-06); build a fresh passkey test APK. |
| 2026-10-04 | M7-T3..T5 ✅ and M7-T6 🟡 (real-device check pending): merged in [PR #121](https://github.com/VidFriends/vidfriends/pull/121) with CI green, including the Android Maestro suite. |
| 2026-10-04 | M7-T3..T6 passkey-only sign-in built: server (WebAuthn, recovery links and command, mobile hand-off codes, migration `0005_passkeys`), web screens, Playwright with software passkeys, mobile browser hand-off with https-only pairing. Mobile E2E moved to `http://localhost` via `adb reverse` (Assumption A-7). |
| 2026-10-04 | Owner answers (multiple choice): next M7 item is **passkey-only sign-in, no passwords** (HTTPS on a domain required; recovery by admin link plus a server command; mobile sign-in by browser hand-off), tasks M7-T3..T6; releases stay without the APK for now (M6-T8 deferred), and the owner gets a test-signed phone APK instead (`mobile.yml` dispatch with *test_apk*). |
| 2026-10-04 | [v0.1.0-rc.1](https://github.com/VidFriends/vidfriends/releases/tag/v0.1.0-rc.1) published (M5-T4 ✅). M7-T1/T2 data export and the M6-T8 sideload APK job merged in [PR #117](https://github.com/VidFriends/vidfriends/pull/117). |
| 2026-10-04 | M6 merged ([PR #116](https://github.com/VidFriends/vidfriends/pull/116)) with the Android Maestro suite green; the emulator run found two app bugs (sign-in navigation race, Hermes `Intl.RelativeTimeFormat` crash) and the arm64 image build moved off QEMU for Node (SIGILL). `v0.1.0-rc.1` dispatched. |
| 2026-10-04 | Owner answers (multiple choice): alpha (M5-T9) postponed; Android ships as a sideloadable APK until store accounts exist (M6-T8 added); M7 starts with data export (CAP-18 → FR-ACCT-05, WF-ACCT-4; M7-T1 web/API, M7-T2 mobile). BRD BO-5 corrected to match NFR-PRIV-03 (no email). |
| 2026-10-04 | PR #112 (M1–M5) merged with CI run 193 green. Owner answer (multiple choice): publish `v0.1.0-rc.1` now. M6 detailed tasks written; mobile app, Expo push channel and Android Maestro workflow in the M6 PR; ADR-0017 (one React version). |
| 2026-10-04 | M4 built and tested (web MVP: shares, feed player, engagement, notifications, Web Push, PWA). M5: admin console, retention/sweeper, account deletion, metrics and monitoring overlay, release workflow, backup/restore with a CI drill, runbook with restore/upgrade/install drills, load test and security review (ADR-0016), privacy disclosure, help and self-hosting guide. Remaining M4/M5 checks need a merged `main`, a tag or the owner's alpha. Assumption A-6 added. |
| 2026-10-04 | Owner answers (multiple choice): agents may merge their own PRs when CI is green; legacy deployments are shut down (M0-T3 ✅, so M0 is complete); agents should enable branch protection on `main`; no Apple or Google developer accounts yet, so M6 store submission is blocked (⛔) and the rest of M6 proceeds. AGENTS.md rule 11: blockers are asked as multiple-choice questions. |
| 2026-10-03 | Owner decisions recorded (OQ-1..4 → ADR-0014, MIT); old repos archived; Dependabot PRs closed; single `main` branch (M0-T4/T5 ✅). |
| 2026-10-03 | Roadmap created during the consolidation of seven legacy repos (M0). No previous authoritative roadmap existed ([AUDIT §2](legacy/AUDIT.md#2-what-each-attempt-contributes)). |
