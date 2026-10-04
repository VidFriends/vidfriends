# SDD: Software Design

- **Status:** Draft v1
- **Owns:** how the subsystems collaborate: the server's internal module structure, shared design patterns, the authorization model, asynchronous work semantics, client architecture, and how the design satisfies the requirements.
- **Component definitions:** [HLD](HLD.md). **Engineering choices:** [TDD](TDD.md). **Schemas and contracts:** [LLD](LLD.md).

## 1. Server module structure (`apps/server`)

```
src/
  main.ts                 # reads ROLE (api|worker|all), boots
  config/                 # env schema (Zod), secret checks (NFR-SEC-03)
  http/                   # Hono app, middleware chain, route registration from contracts
  modules/
    instance/  auth/  accounts/  invites/  friends/
    videos/    shares/  feed/    engagement/  notifications/
    admin/     audit/
  jobs/                   # pg-boss registration; one file per job type
  infra/                  # db (drizzle), storage (S3), media (yt-dlp/ffmpeg runners), push channels, clock, ids
  db/schema/*.ts  migrations/*.sql
```

**Module pattern.** Each module exposes:

| File | Role |
|---|---|
| `routes.ts` | Binds contract routes to handlers. Thin: parse, call the service, map errors. |
| `service.ts` | Business rules (the BR-* items). Pure functions over repositories plus an injected `Clock` and `Ids`. |
| `repo.ts` | Drizzle queries. Every query that returns member-visible data takes `viewerId` and enforces visibility in SQL (see §3). |
| `policy.ts` | Authorization predicates, reused by the services and the authz-matrix tests. |
| `errors.ts` | Typed domain errors that map to stable API error codes. |

**Dependency rule.** Dependencies point one way: `routes → service → (repo, policy, infra ports)`. Modules may call other modules' **services**, never their repositories. Cycles are forbidden; ESLint `import/no-cycle` enforces this.

## 2. Request pipeline

```
Caddy → Hono:
  requestId → logger(pino, redaction) → securityHeaders → rateLimit(ip)
  → session (cookie|bearer → sessions JOIN users; sets ctx.viewer or anonymous)
  → csrf (cookie-auth unsafe methods) → rateLimit(user) → zod validate (contracts)
  → handler → response schema check (dev/test only) → error mapper
```

- **Error mapper:** domain errors become `{"error":{"code","message","details"}}` with the right status. Unknown errors become 500 `internal_error`, with no internal detail in the body (lesson: leaked database and yt-dlp errors).
- **Middleware rule ([L-08](../legacy/AUDIT.md#4-lessons-referenced-by-id-from-the-design-docs)):** no middleware replaces Node's response object. Hono's Context API avoids the legacy Hijacker problem, and route tests always go through the full app.

## 3. Authorization model

Three layers, all server-side:

1. **Authentication gate.** Each route declares `auth: public | member | admin` in its contract. The session middleware and a route guard enforce it. Account status is re-checked on every request (FR-AUTH-05/06).
2. **Relationship policy** (`friends/policy.ts`):
   - `canSendTo(viewer, user)`: accepted friendship, not blocked in either direction, target active.
   - `canSee(viewer, user)` for search and profile cards: no block by the target.
3. **Object visibility in SQL.** Every repository read that returns shares, videos, conversations or media keys includes the participant predicate:
   - Shares: `(s.sender_id = :viewer OR s.recipient_id = :viewer)`.
   - Videos: `EXISTS share(viewer participant, video) OR v.added_by = :viewer`.

   A missing row becomes **404** (BR-GEN-3). Admin routes never join the conversation tables (BR-ADM-1).

**Verification.** `packages/test-utils/authz-matrix.ts` enumerates every contract route that takes an id. It builds a fixture world (owner, recipient, friend-not-participant, stranger, blocked user, suspended user, admin, anonymous) and asserts the expected status for each persona (NFR-SEC-01). A new route with an id parameter fails CI until it is added to the matrix.

## 4. Asynchronous work

| Job | Trigger | Concurrency† | Idempotency key / guard | Retries | Requirements |
|---|---|---|---|---|---|
| `video.fetch` | A link is added (new video) | 2 | `video_id`; no-op if the video is not `queued`/`fetching` | 3 (1 m, 5 m, 30 m), then `link_only` | FR-VID-02 |
| `video.process` | Fetch done / upload completed | 1 | `video_id`; no-op if already `ready` | 2, then `failed` | FR-VID-03/04 |
| `video.finalize` (inline at end of process) | Video becomes ready or link-only | – | Updates only shares with `delivered_at IS NULL` | – | FR-SHR-03 |
| `notify.dispatch` | Notification inserted | 4 | `notification_id` plus `push_target_id` sent-log | 5 (exponential) | FR-NOTIF-02/03 |
| `retention.purge` | Cron daily 03:30 local, plus manual | singleton | Recomputes eligibility at run time | – | FR-VID-06 |
| `storage.sweep` | Cron weekly | singleton | Lists bucket prefixes against the DB | – | NFR-REL-05 |
| `session.cleanup` | Cron hourly | singleton | Deletes expired rows | – | BR-SES-1 |
| `account.purge_media` | Account deleted | 1 | `user_id` | 5 | FR-ACCT-03 |

† Proposed defaults, configurable by env.

**Job rules:**
- Every handler is idempotent and checks current state before acting.
- Side effects follow the order: storage put, then database commit. Storage deletes happen after the database commit.
- Orphans from crashes are caught by `storage.sweep`.
- Jobs are enqueued **in the same transaction** as the state change that causes them. pg-boss supports transactional `send` via the shared connection. This "transactional outbox" avoids lost jobs.

## 5. Client architecture (web and mobile)

```
packages/api-client
  client.ts        # fetch wrapper: baseUrl, credentials (cookie|bearer), CSRF header, error decoding into typed ApiError
  hooks/*.ts       # TanStack Query: queries keyed by ['feed', cursor], ['share', id], mutations with optimistic updates + rollback
apps/web
  routes/          # TanStack Router file routes: /, /inbox, /saved, /history, /sent, /send, /friends, /notifications, /settings, /admin/*, /join/$code, /setup, /login
  features/<area>/ # components per area; shadcn/ui primitives in components/ui
  player/          # vertical feed player (single <video> per active slot, preload next)
  i18n/            # message catalogs (NFR-I18N-01)
apps/mobile (M6)
  app/             # expo-router screens mirroring web areas; pairing + share-intent entry
```

**Client patterns:**
- **Session expiry ([L-17](../legacy/AUDIT.md#4-lessons-referenced-by-id-from-the-design-docs)):** a single global handler. Any 401 from a member route clears the query cache and routes to login. There is no token refresh to coordinate (sessions slide, [ADR-0008](../adr/0008-authentication-sessions.md)).
- **Optimistic updates** only for reactions, save/hide and friend actions, always with rollback and a toast on failure. Never fabricate server data ([L-11](../legacy/AUDIT.md#4-lessons-referenced-by-id-from-the-design-docs)).
- **Polling:** unread notifications and feed head refetch on window focus and every 60 s (FR-NOTIF-05).
- **Media URLs** expire. The player refetches `/shares/{id}/media` when the URL is within 60 s of expiry or a 403 occurs.

## 6. How the design satisfies the key requirements

| Requirement theme | Design element |
|---|---|
| Contract integrity (NFR-MAINT-01) | One Zod source; routes registered from contracts; generated OpenAPI checked in CI |
| Privacy of social graph and content (BR-SHR-6, BR-ENG-1, NFR-SEC-01) | Share-centric model ([ADR-0010](../adr/0010-share-centric-social-model.md)); SQL-level participant predicates; authz matrix |
| Immediate revocation (FR-AUTH-05/06) | Database-backed sessions checked per request ([ADR-0008](../adr/0008-authentication-sessions.md)) |
| Durable media pipeline (NFR-REL-01) | pg-boss jobs with transactional enqueue and idempotent handlers |
| Safe fetching (NFR-SEC-05) | Validation in `videos/service` plus guarded runners in `infra/media` |
| Self-hostable, low cost (BO-4) | Five containers (or fewer); Postgres doubles as the queue; MinIO optional |
| Accessibility (NFR-A11Y-*) | Radix primitives, jsx-a11y lint, axe checks in E2E, a11y review per milestone |
