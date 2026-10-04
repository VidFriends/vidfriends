# VidFriends Backend: Legacy Code Audit

**Repo:** `VidFriends/vidfriends-backend` (local clone `vidfriends-merge/src/VidFriends_vidfriends-backend`)
**Branches:** only `master` (`origin/HEAD -> origin/master`). There are no other remote branches, tags, or stashes, so nothing is left unmerged.
**History:** 11 commits, 2026-06-16 to 2026-06-19. Every commit is authored by "BackendJunior" with `Co-Authored-By: Paperclip <noreply@paperclip.ing>`. This is an AI-agent org; the roles are CTO, BackendSenior, BackendJunior and ProductManager, and the "opencode_local" adapter appears in `.issue-complete/*.md`.
**Audit method:** I read every source file, migration and doc. I ran `go build ./...`, `go vet ./...` (including `-tags=integration`) and `go test ./...` on a scratch copy; all passed. Two key bugs were confirmed by running small probe tests on the scratch copy (marked **[verified]**). Line numbers refer to HEAD `b295904`.

> **Bottom line for the doc writer:** this is a Go + Postgres + S3 backend for small, **self-hosted, invite-only "friends' video servers"**. Most CRUD endpoints for auth, friends, send/inbox, likes, comments and admin exist. However, several headline features are **dead or broken at runtime**:
> - realtime WebSocket
> - push notifications
> - link import (yt-dlp) under default config
> - playlist import
> - collections
> - logout
> - duplicate detection on upload
>
> The integration test suite cannot pass against HEAD. The docs overstate maturity in many places (see §12).

---

## 1. Product intent

### 1.1 What it is
- The tagline is "a unified place to find all of your shortform videos sent by your friends" (`README.md` line 5, `docs/openapi.yaml` `info.description`).
- **Self-hosted by a trusted friend.** `docs/faq.md` says "All data stays on your server (the one the admin runs)… Choose your server admin wisely (typically a trusted friend or family member)." `docs/admin-setup.md` has the audience line "Tech-savvy users comfortable with Docker who will self-host VidFriends".
- **Invite-only by design.** From `docs/faq.md`: "Why do I need an invite code? VidFriends is invite-only by design." Public signup can be turned on with `VIDFRIENDS_ALLOW_PUBLIC_SIGNUP` (`internal/config/config.go:103`, `internal/handler/auth.go:168`).
- **Privacy / no telemetry.** `docs/faq.md` says "VidFriends does not use any third-party analytics, tracking, or telemetry."
- **Open source, AGPL-3.0.** The README says "VidFriends Inc." but `LICENSE` says "Copyright (C) 2026 VidFlow Inc.". This is a naming-drift artifact.
- **Core loop** (`docs/user-guide.md`):
  1. Connect to a server URL, or scan a QR code.
  2. Register with an invite code.
  3. Add a video by uploading a file or pasting a link from YouTube, TikTok, Instagram and similar sites. The server downloads the video itself with yt-dlp.
  4. Send it to a friend with an optional caption.
  5. The friend sees it in their inbox and "For You Page".
  6. Like, comment (threaded), react with an emoji, keep watch history.
- **Non-goals and deferred items stated in the docs:**
  - No password reset ("Contact your server admin", `docs/faq.md`, `docs/user-guide.md`).
  - No self-service data export ("planned for a future release", `docs/faq.md`).
  - No web admin UI (API only; "under development ([VID-157])", `docs/admin-setup.md`).
  - Per-user quota enforcement and scheduled eviction are "under development ([VID-156])" (`docs/faq.md`, `docs/admin-setup.md`).
  - Fuzzy perceptual hashing was "deferred to v0.2" (`docs/backend-consolidation-decision.md` §4). Code contradicts this; see §12.
  - MuxCore (distributed media orchestration) is explicitly out of scope (decision doc §3).

### 1.2 Target users / personas
- **Admin / self-hoster.** Runs Docker Compose, promotes themselves to admin via SQL, issues invite tokens, and manages storage and users (`docs/admin-setup.md`).
- **End users / friends.** Non-technical people who connect to the admin's server URL (`docs/user-guide.md`, audience "Non-technical end users").
- **DevOps / operator.** Audience of `docs/security-checklist.md` and `docs/deployment.md`.

### 1.3 Versioning signals (inconsistent)
- The decision doc says "Feature-complete for v0.1".
- Commit `99b251b` is titled "VID-441: Alpha release prep".
- The user guide, admin setup and deployment docs say "Applies to … v1.0+".
- `docs/openapi.yaml` declares `version: "1.0.0"`.

### 1.4 Recorded decisions (ADR candidates)

| # | Decision | Source | Rationale recorded | Current validity |
|---|---|---|---|---|
| D1 | One canonical backend: the Go/Postgres/S3 service (named `work/vidfriends/` in the decision doc and `work/vidflow/` in the VID-152 completion note). All clients (web, Android, iOS) target it. | `docs/backend-consolidation-decision.md` §1; `.issue-complete/VID-152-backend-consolidation.md` | It directly implements product features and has CI, tests, migrations and docs. Keeping 3 backends meant a high maintenance burden and team confusion. | Valid as intent. Folder naming is contradictory (vidfriends vs vidflow). |
| D2 | Deprecate the TypeScript/Express + SQLite backend (`work/backend/`, port 3100): no new features, code kept for reference. | decision doc §2 | Removes team confusion. | Historical. |
| D3 | MuxCore (`work/core/`, GPL-3.0, gRPC mesh, module system) moves to its own repo and is not absorbed. | decision doc §3, rationale table | Architectural mismatch ("distributed media fabric ≠ VidFriends API"), license friction (GPL vs AGPL), scope. Its phash/dhash/ahash pipeline was kept as a reference for v0.2. | VidFriends code was removed from core in core commit `23eefa9` (`.issue-complete/VID-355-completion.md`). |
| D4 | Exact-match dedup now; perceptual (fuzzy) hashing deferred to v0.2. | decision doc §4 | Scope control. | **Contradicted by code:** pHash is implemented and wired; SHA-256 exact match is not (see §6.5, §12). |
| D5 | Upload/download S3 orphan cleanup is a fire-and-forget goroutine (`DeferCleanup`), not a queue/table. | `.issue-complete/VID-148.md` | Avoid slowing the HTTP response; S3 delete is idempotent; a sweeper "can be layered on later". | Implemented at `internal/storage/s3.go:97` (`DeferCleanup`). No sweeper exists. |
| D6 | `keep_forever` flag exempts a video from eviction; eviction age is configurable; `processing` videos are not evictable. | `.issue-complete/VID-277.md` | Users protect videos; in-flight downloads must not be evicted. | Partially implemented. `processing` is **still evictable** in code (`internal/handler/admin.go:278,320`). |
| D7 | Env var prefix is `VIDFRIENDS_` (not `VIDFLOW_`). | `.issue-complete/VID-277.md` | Naming correction. | Implemented. |
| D8 | Invite-only registration by default; admin creates expiring single-use tokens. | `docs/faq.md`, `docs/admin-setup.md` | Keeps a private server limited to trusted people. | Implemented (see §5). |
| D9 | Feed pagination is cursor-based (`page_token` = base64 `created_at`, over-fetch N+1). Inbox "accept" only sets `read_at`. | `REVIEW-VID-243.md` | MVP simplicity. Deferred: pagination for user search, 400 on malformed cursor, accept creating a durable relationship. | Implemented as described; cursor has a precision bug (§11). |
| D10 | Push notifications use a pluggable provider set (ntfy, Gotify, FCM, APNs) with per-user, per-event opt-in. WebSocket is used for in-app realtime. | `docs/faq.md`, `docs/user-guide.md`, `internal/push/*` | Self-hosted-friendly options (ntfy/Gotify) without forcing cloud dependencies. | Interfaces exist. Sending is never invoked (§7.6). |
| D11 | First admin is created manually via SQL (`UPDATE users SET role='admin'`). | `docs/admin-setup.md` | Not stated. | Implemented; no bootstrap flow. |
| D12 | Self-service account deletion requires password re-entry and is rate-limited to 1 per hour, with S3 cleanup followed by DB cascade. | commit `466b658`, `.issue-complete/VID-355-completion.md` (mislabelled; see §10), `docs/faq.md` | Security-sensitive; "reviewed by CTO before merge". | Implemented. |
| D13 | GitHub App installation tokens instead of long-lived PATs, for "backend agents/systems". | `.env.example`, `internal/github/token.go` | Short-lived credentials. | Agent/dev tooling only. Not used by the product (no import anywhere outside `internal/github`). |

### 1.5 References to other repos, clients and hosting
- **Web client:**
  - Its Vite dev server is at `localhost:5173` (default CORS also allows `:3000`) (`internal/middleware/cors.go:30`).
  - The VID-152 note mentions `vite.config.ts`.
  - Commits `5f5ae7f` and `6c20f24` describe edits to the web repo's `api.ts`: "/videos -> /videos/from-link", "/api/videos -> /api/videos/upload", "/admin/storage/breakdown -> /admin/storage", and storage breakdown as a bare array. These edits are **not in this repo**, which shows the API was shaped reactively to client calls.
  - A web admin UI is referenced as VID-157.
- **iOS:** `VidFlow/ios/Sources/VidFlow/Networking/APIConfig.swift`; the default base URL was changed from `localhost:3100` to `localhost:8080` (VID-152). VID-243 implemented "3 missing iOS MVP endpoints".
- **Android:** uses `DynamicBaseUrlInterceptor`, so the server URL is user-configurable at runtime.
- **Server URL / QR pairing:** in `docs/user-guide.md` ("enter the server URL… If your friend shared a QR code, scan it to connect instantly"). `docs/admin-setup.md` suggests sharing invites as `https://yourserver.com/register?code=…` or as a QR code "from any QR tool". **The backend has no QR or pairing endpoint**; pairing is purely client-side.
- **Hosting signals that conflict with self-hosting-only:**
  - `docs/openapi.yaml` lists a production server `https://api.vidfriends.ai`.
  - Push icon URL `https://vidfriends.ai/icon.png` (`internal/push/manager.go:57`).
  - Go module `vidfriends.ai/backend`.
  - GitHub org `vidfriends/backend` in docs vs actual remote `VidFriends/vidfriends-backend`.
- **Other external references:**
  - "Product-Report.md Section 6" (decision doc).
  - Paperclip tracker at `paperclip.digifender.com` (VID-161).
  - Review sweep doc `/home/paperclip/work/review-sweep-VID-161.md`.
- **Committed binary.** `server` (18 MB ELF, committed in `46ab830`) is a stale build of module `vidflow.ai/backend` with defaults `vidflow-dev-secret…` and `vidflow-videos`, and only about 25 routes. It is evidence of the VidFlow → VidFriends rename and should not be carried forward.
- **Sibling repos** in the merge workspace (not audited here): `VidFriends_vidfriends-web`, `_vidfriends-ios`, `_vidfriends-android`, `_VidFriends-iOS-Android`, `zemdregon_vidfriends`, `zemdregon_vidshare`.

---

## 2. Feature inventory (strict status)

**Legend:**
- **IT** = implemented and tested. The test exists and logically matches the code.
- **IT-broken** = an integration test exists but cannot pass against HEAD (see §9).
- **IU** = implemented, untested.
- **BROKEN** = code exists but fails at runtime.
- **STUB** = placeholder.
- **PLAN** = planned/doc-only.

| Area | Feature | Status | Evidence |
|---|---|---|---|
| Health | `GET /api/health` with DB ping | IT | `internal/handler/health.go`, `TestHealthEndpoint` |
| Auth | Register with invite code (transactional, `FOR UPDATE`) | IT-broken | `auth.go:152-257`. Tests use the password `password123`, which fails the complexity rule. |
| Auth | Public signup toggle | IT-broken (test self-skips when invite-only) | `auth.go:168`, `TestPublicSignup` |
| Auth | Input validation (email regex, username 3-30, password 8-128 with upper/lower/digit) | IU (only short-password case tested) | `auth.go:98-150` |
| Auth | Login (bcrypt) | IT-broken | `auth.go:259-307` |
| Auth | Refresh with rotation (DB-stored SHA-256 hash, delete-then-issue) | IT-broken | `auth.go:310-386` |
| Auth | Logout | **STUB.** Returns `{"status":"ok"}` and revokes nothing. | `auth.go:563-567` |
| Auth | `GET /api/auth/me` | IT-broken | `auth.go:389` |
| Auth | `PUT /api/auth/profile` (display_name, avatar_url) | IU | `auth.go:425` |
| Auth | Self-service account deletion | IT-broken (6 subtests) | `auth.go:470-561` |
| Auth | Password reset / change password / email verification | PLAN (FAQ: "not available yet") | none |
| Auth | User suspension enforcement | **Not implemented.** Status is stored but never checked. | grep: no `status` check in login or middleware |
| Users | Search by username (ILIKE, limit 20) | IU | `social.go:469` |
| Users | Public profile + video count | IU, likely BROKEN (scans `timestamptz` into `string`, unverified) | `social.go:669-699` |
| Users | User's videos list | IU | `social.go:701` |
| Friends | Send request by username | IT-broken | `social.go:37` |
| Friends | Accept / decline | IT-broken (accept only) | `social.go:136` |
| Friends | List friends, list pending incoming | IT-broken | `social.go:203,241` |
| Friends | Block | IT-broken | `social.go:274` |
| Friends | Unblock, unfriend, cancel outgoing request, list outgoing | **Not implemented** | none |
| Sharing | Send own video to a friend with caption | IT-broken | `social.go:323` |
| Sharing | Inbox (paginated limit/offset) | IT-broken | `social.go:409` |
| Sharing | Inbox accept/reject (`PATCH`) | IU | `social.go:515` |
| Sharing | Mark inbox item read | IU | `social.go:572` |
| Sharing | Unsend (only if recipient hasn't watched) | IU | `video.go:1019` |
| Sharing | Reshare a received video / send someone else's video | **Not allowed** (only own videos) | `social.go:364` |
| Feeds | Main feed: all `ready` videos on the server minus watched, cursor pagination | IT-broken (only auth checks) | `video.go:471` |
| Feeds | FYP: received videos minus watched, limit 50 | IT-broken | `social.go:609` |
| Video | Multipart upload to S3 (size limit, per-user quota, instance quota) | IT-broken (helper sends `application/octet-stream`, which the server rejects) | `video.go:88-193` |
| Video | Create from link (yt-dlp) | **BROKEN by default:** download timeout defaults to 1.8 µs **[verified]** | `config.go:98`, `downloader/manager.go:105` |
| Video | Thumbnail generation (ffmpeg at 1 s, 640px; placeholder on failure) | IU; link imports only, never for uploads | `thumbnail/thumbnail.go:17` |
| Video | Detail with counts, liked flag, duplicate/canonical info | IU | `video.go:356` |
| Video | Stream file (proxied through API) | IU (no Range support) | `video.go:431` |
| Video | Delete (owner or admin; hard delete + S3) | IU | `video.go:260` |
| Video | `keep_forever` toggle (owner only) | IU | `video.go:305` |
| Video | Download status (`GET /api/videos/{id}/download`) | IU | `video.go:832` |
| Video | Cancel download | **BROKEN:** reads path value `downloadId`, but the route only has `{id}` | `router.go:81`, `video.go:869` |
| Video | Transcoding / adaptive streaming / duration extraction | **Not implemented.** `duration` is never set. | none |
| Social | Like / unlike / list likers | IU | `video.go:547,566,928` |
| Social | Threaded comments (create, list as tree) | IU | `video.go:584,631` |
| Social | Delete comment | **BROKEN:** reads `{id}` (video id) instead of `{commentId}` | `router.go:108`, `video.go:896` |
| Social | Emoji reactions (one per user per video, upsert) | IU | `video.go:968,1001` |
| History | Mark watched (+progress) / history with filters (q, friend, date range) | IU | `video.go:716,754` |
| Dedup | pHash on upload | **BROKEN:** the context is cancelled as soon as the handler returns | `video.go:182-184` |
| Dedup | pHash on link download | IU (unreachable while downloads are broken) | `cmd/server/main.go:78-103` |
| Dedup | Group + social merge | IU (unit tests cover hashing math only) | `hash/detector.go` |
| Dedup | Get group for video; set canonical | IU | `duplicate.go:66,156` |
| Dedup | Get group by id | dead code (handler `GetGroup` not routed) | `duplicate.go:42` |
| Dedup | Exact SHA-256 dedup | PLAN/schema only (`hashes.algorithm DEFAULT 'sha256'`), never computed | migration 000005 |
| Realtime | WebSocket hub + event payloads | **BROKEN in production:** hub `Run()` is never started, and the `Logging` middleware hides `http.Hijacker`, so upgrades fail **[verified]**. Hub logic is unit tested. | `main.go:64`, `middleware/logging.go:9`, `ws_test.go` |
| Push | Register push target (ntfy, gotify, fcm, apns) + enabled events | IU | `handler/push.go` |
| Push | Send ntfy / Gotify | unit tested, but **never called** by any handler | `push/manager.go:98` (`Notify` unused) |
| Push | FCM / APNs | **STUB.** Always returns "not implemented". | `push/fcm.go`, `push/apns.go` |
| OAuth | YouTube connect (auth URL, callback, code exchange, list playlists, disconnect/revoke) | IU; **insecure state** (§5) | `handler/oauth.go`, `oauth/youtube.go` |
| Import | YouTube playlist import jobs (worker, 3 concurrent, `SKIP LOCKED`) | **BROKEN:** `CreateJob` scans NULL `error_message` into `string`. Even when fixed, items create `processing` videos and never enqueue downloads. | `importer/manager.go:83-101,403-444` |
| Collections | Tables + auto-created collection after import | **Schema only.** No API. The commit message claims "router, handler", which don't exist. | migration 000019, `importer/manager.go:487` |
| Admin | Stats | IT-broken (test expects old field names) | `admin.go:85` |
| Admin | List/filter users | IT-broken | `admin.go:108` |
| Admin | Update role / status / quota | IT-broken | `admin.go:166` |
| Admin | Delete user | IU (no S3 cleanup) | `admin.go:226` |
| Admin | Delete (soft-evict) video | IT-broken | `admin.go:342` |
| Admin | Storage breakdown | IT-broken | `admin.go:248` |
| Admin | Run eviction (age-based, manual) | IT-broken | `admin.go:274` |
| Admin | Invites create/list | IT-broken | `admin.go:389,417` |
| Admin | Activity log query | IT-broken | `admin.go:460`, `middleware/activity.go` |
| Admin | Scheduled eviction; storage-based eviction strategy (`VIDFRIENDS_EVICTION_STRATEGY`) | PLAN (config read, never used) | `config.go:104` |
| Ops | Graceful shutdown, JSON logging, panic recovery, CORS, rate limit | IU (rate limit is effectively per-connection; §5) | `main.go`, `middleware/*` |
| Ops | Migration presence verification at boot | IU | `database/database.go` |
| Ops | Prometheus metrics | PLAN (deployment.md "optional"; no endpoint) | none |
| Dev | GitHub App installation-token client | Unit tested; not product | `internal/github` |

---

## 3. Domain / data model

All tables live in Postgres 16 with `pgcrypto` and `gen_random_uuid()`. Migrations are golang-migrate pairs `NNNNNN_name.{up,down}.sql` in `migrations/`. At boot, `database.VerifyMigrations` checks that 20 tables exist (`internal/database/database.go:12`).

### 3.1 Migrations (exact names)
| # | Name | Effect |
|---|---|---|
| 000001 | `create_users_table` | `users` + pgcrypto |
| 000002 | `create_videos_table` | enum `video_status`, `videos` |
| 000003 | `create_comments_table` | `comments` (self-ref `parent_id`) |
| 000004 | `create_likes_table` | `likes` |
| 000005 | `create_hashes_table` | `hashes` |
| 000006 | `create_watch_history_table` | `watch_history` |
| 000007 | `create_friends_table` | enum `friend_status`, `friends` |
| 000008 | `add_admin_fields` | users: `role`, `status`, `storage_used`, `last_active_at` |
| 000009 | `create_invite_tokens` | `invite_tokens` (edited in place by `5f5ae7f`, an anti-pattern) |
| 000010 | `create_activity_log` | `activity_log` |
| 000011 | `create_received_videos_table` | `received_videos` |
| 000012 | `create_refresh_tokens` | `refresh_tokens` |
| 000013 | `add_video_source_and_downloads` | videos: `source_url`, `source_platform`; `downloads` |
| 000014 | `create_reactions_table` | `reactions` |
| 000015 | `create_push_preferences` | `push_preferences` |
| 000016 | `create_duplicate_groups` | `duplicate_groups`; videos: `duplicate_group_id` |
| 000017 | `add_keep_forever` | videos: `keep_forever` + index |
| 000018 | `add_upload_quota_bytes` | users: `upload_quota_bytes` |
| 000019 | `create_collections_table` | `collections`, `collection_videos` |
| 000020 | `create_oauth_tokens` | `oauth_tokens` |
| 000021 | `create_import_jobs` | `import_jobs`, `import_job_items` |

### 3.2 Entities

**users** (000001 + 000008 + 000018)
- Columns:
  - `id` UUID PK
  - `email` TEXT UNIQUE NOT NULL. Lower-cased on register but **not on login**.
  - `username` TEXT UNIQUE NOT NULL. Case-sensitive uniqueness.
  - `password_hash` TEXT (bcrypt)
  - `display_name` TEXT ''
  - `avatar_url` TEXT ''. Free-form URL; there is no avatar upload.
  - `role` TEXT 'user', values `user` or `admin`. Validated only in the admin handler; no CHECK constraint.
  - `status` TEXT 'active', values `active`, `suspended` or `disabled`. Never enforced.
  - `storage_used` BIGINT 0
  - `last_active_at` TIMESTAMPTZ. **Never written.**
  - `upload_quota_bytes` BIGINT NULL (NULL means unlimited)
  - `created_at`, `updated_at`
- Redundant indexes on `email` and `username` (UNIQUE already indexes them).

**videos** (000002 + 000013 + 000016 + 000017)
- Columns:
  - `id`
  - `user_id` FK users CASCADE (owner/uploader)
  - `title` NOT NULL
  - `description`
  - `file_url`: **full S3 URL** including the endpoint host
  - `thumbnail_url`
  - `duration` INTERVAL. Never populated.
  - `status` `video_status` enum: `processing`, `ready`, `failed`, `deleted`
  - `source_url`, `source_platform` (`youtube`, `tiktok`, `instagram`, `twitter`, `reddit`, `vimeo`, `facebook` or raw host; `downloader/validator.go:34`)
  - `duplicate_group_id` FK `duplicate_groups` SET NULL
  - `keep_forever` BOOL false
  - timestamps
- Indexes: `user_id`, `status`, `created_at DESC`, `duplicate_group_id`, `keep_forever`.
- **There is no visibility/privacy column.** Every video is visible to every authenticated user.

**comments**
- `id`, `user_id` FK CASCADE, `video_id` FK CASCADE, `parent_id` FK comments CASCADE (threading), `body` TEXT (no length limit), timestamps.
- No check that the parent belongs to the same video.

**likes**
- `id`, `user_id`, `video_id` (both CASCADE), `created_at`, `UNIQUE(user_id, video_id)`.

**reactions**
- `id`, `user_id`, `video_id` (CASCADE), `emoji` TEXT (any string, unvalidated), timestamps, `UNIQUE(user_id, video_id)`. One reaction per user per video.

**hashes**
- `id`, `video_id` UNIQUE FK CASCADE, `hash` BYTEA (8-byte little-endian uint64 for pHash), `algorithm` TEXT DEFAULT `'sha256'` (actually written as `phash`/`dhash`/`ahash`), `created_at`. Indexed on `hash`, which is useless for Hamming search.

**duplicate_groups**
- `id`, `canonical_id` UNIQUE FK videos CASCADE, timestamps. Members are the videos whose `duplicate_group_id` points here.

**watch_history**
- `id`, `user_id`, `video_id` (CASCADE), `watched_at`, `progress_seconds` INT, `created_at`. UNIQUE(`user_id`, `video_id`), upserted.

**friends**
- `id`, `requester_id`, `addressee_id` (CASCADE), `status` `friend_status` enum (`pending`, `accepted`, `blocked`), timestamps.
- Constraints: `unique_friendship UNIQUE(requester_id, addressee_id)` (directional; the code checks both directions manually) and `no_self_friend CHECK`.

**received_videos** (a "send"/inbox item)
- `id`, `video_id`, `sender_id`, `recipient_id` (all CASCADE), `caption` TEXT NULL, `read_at` NULL, `created_at`.
- `unique_send UNIQUE(video_id, sender_id, recipient_id)`.
- Indexes: (`recipient_id`, `created_at DESC`), `sender_id`.

**invite_tokens**
- `token` TEXT PK (64 hex chars, 32 random bytes), `used_by` FK users SET NULL, `expires_at` NOT NULL, `created_by` FK users **CASCADE** NOT NULL (deleting an admin deletes their invites), `created_at`.
- Single use, because `used_by` is non-null after use.

**refresh_tokens**
- `id`, `user_id` CASCADE, `token_hash` TEXT UNIQUE (SHA-256 hex of the JWT), `expires_at` (hard-coded `now()+7 days`), `created_at`.
- No device/session metadata. Expired rows are never purged.

**activity_log**
- `id`, `actor_id` SET NULL, `action`, `entity_type`, `entity_id` TEXT, `metadata` JSONB, `ip_address` TEXT (taken from spoofable `X-Forwarded-For`), `created_at`.
- Indexes: `actor_id`, `action`, (`entity_type`, `entity_id`), `created_at DESC`.

**downloads** (link-import job record)
- `id`, `video_id`, `user_id` (CASCADE), `source_url`, `platform`, `status` TEXT (`queued`, `downloading`, `completed`, `failed`, `cancelled`), `error_message` (truncated to 500 chars), `file_path` (local temp path), `file_size`, `started_at`, `completed_at`, timestamps.

**push_preferences**
- `id`, `user_id` UNIQUE CASCADE, `ntfy_topic`, `gotify_url` (never written or used), `gotify_token`, `fcm_token`, `apns_token`, `enabled_events` TEXT[], timestamps.
- One row per user; each provider has its own column.

**collections**
- `id`, `user_id` CASCADE, `name`, `description`, `source_platform`, `source_playlist_id`, `video_count` (denormalized), timestamps.

**collection_videos**
- `id`, `collection_id` CASCADE, `video_id` CASCADE, `added_at`, UNIQUE(`collection_id`, `video_id`).
- No position/order column.

**oauth_tokens**
- `id`, `user_id` CASCADE, `provider`, `access_token` and `refresh_token` stored **in plaintext**, `token_type`, `expires_at`, `scope`, `provider_user_id`, `provider_user_name` (always written as ''), timestamps, UNIQUE(`user_id`, `provider`).

**import_jobs**
- `id`, `user_id` CASCADE, `collection_id` SET NULL, `provider`, `source_playlist_id`, `source_playlist_title`, `source_playlist_url` (unused), `status` (`pending`, `running`, `completed`, `failed`, `cancelled`), counters `total`/`processed`/`failed`/`skipped`, `error_message` NULL, timestamps.

**import_job_items**
- `id`, `job_id` CASCADE, `source_video_id`, `source_title`, `source_url`, `status` (`pending`, `processing`, `completed`, `failed`, `skipped`), `error_message`, `video_id` SET NULL, timestamps.

### 3.3 Relationship summary
```
users 1─* videos 1─* {comments(tree), likes, reactions, watch_history, hashes(0..1), downloads, collection_videos}
users *─* users via friends (directional row, status)
videos ─ received_videos ─ (sender users, recipient users)   [the "send" edge]
duplicate_groups 1─* videos (members); duplicate_groups.canonical_id ─1 videos
users 1─* {refresh_tokens, invite_tokens(created_by), oauth_tokens, import_jobs, collections, push_preferences(0..1), activity_log(actor)}
import_jobs 1─* import_job_items ─0..1 videos;  import_jobs ─0..1 collections
```

### 3.4 Go model drift
- `internal/model/models.go` is partially used.
- `InviteToken.ID` has no column.
- `Video` lacks `KeepForever`.
- Many handlers define their own response structs (`VideoResponse`, `AdminUserInfo`, etc.).

---

## 4. API surface

Everything is registered in `internal/router/router.go` with Go 1.22+ `http.ServeMux` method patterns.

**Global middleware order** (outermost first): `Recovery → Logging → RateLimit → CORS → mux` (`router.go:153-159`).

**Auth:**
- "Bearer" means `Authorization: Bearer <JWT>` checked by `middleware.Auth` (`internal/middleware/auth.go:15`).
- "Admin" additionally requires `claims.Role == "admin"` from the **JWT claim** (`auth.go:42`).

**Errors:**
- Handlers return JSON `{"error": "<msg>"}` (`internal/handler/helpers.go`).
- Middleware writes a JSON body via `http.Error`, so the Content-Type is `text/plain`.
- A recovered panic returns plain text "Internal Server Error".

### 4.1 Public
| Method | Path | Request | Response | Errors |
|---|---|---|---|---|
| GET | `/api/health` | none | `{status:"ok"\|"degraded", database:"ok"\|"error: <raw pg error>"}` | 503 when DB is down (leaks the error text) |
| POST | `/api/auth/register` | `{email, username, password, display_name?, invite_code?}` | 201 `{access_token, refresh_token, expires_in:900}` | 400 (validation joined with "; ", "invite_code is required", "invalid or expired invite code", "invite code already used"), 409 dup email/username, 500 |
| POST | `/api/auth/login` | `{email, password}` | 200 AuthResponse | 400, 401 "invalid email or password" |
| POST | `/api/auth/refresh` | `{refresh_token}` | 200 AuthResponse (rotated) | 400, 401 (invalid / not a refresh token / revoked / user not found) |
| GET | `/api/ws?token=<JWT>` | query token | 101 upgrade | 401. **Broken**, see §4.4 |
| GET | `/api/oauth/callback?provider&code&state[&redirect_uri]` | OAuth redirect | 302 to `/api/oauth/providers` | 400, 502 (leaks upstream body), 500 |

Note: `expires_in` is hard-coded to 900 regardless of `VIDFRIENDS_JWT_EXPIRY` (`auth.go:254`).

### 4.2 Authenticated (Bearer)
**Auth/profile**
- `POST /api/auth/logout` returns `{status:"ok"}` (no-op).
- `GET /api/auth/me` returns the User object: `id, email, username, display_name, avatar_url, role, status, storage_used, last_active_at, created_at, updated_at`. It does not select `upload_quota_bytes`.
- `DELETE /api/auth/me/account`
  - Body: `{password}`.
  - Success: `{success:true}`.
  - Errors: 400 (no body/password), 401 (wrong password), 429 (more than once per hour per user, in-memory), 404.
- `PUT /api/auth/profile`
  - Body: `{display_name?, avatar_url?}`. An empty string means "unchanged", so a field cannot be cleared.
  - Returns the User.

**Push**
- `POST /api/push/register`
  - Body: `{provider: ntfy|gotify|fcm|apns, target, enabled_events?: string[]}`.
  - Returns `{id}`.
  - Upserts the provider column and **overwrites `enabled_events`**.
  - Valid event names (by convention, unvalidated): `video_received`, `friend_request`, `friend_accepted`, `like`, `comment` (`internal/push/interface.go`).

**Videos**
- `POST /api/videos/upload`
  - multipart: `file` (part Content-Type must start with `video/`), `title?` (defaults to filename), `description?`.
  - Returns 201 `{id, status:"ready"}`.
  - Errors: 400, 403 (instance quota / user quota), 413 (> `VIDFRIENDS_MAX_UPLOAD_SIZE`, default 500 MB).
  - Multipart memory is hard-coded at 100 MB (`video.go:92`).
- `POST /api/videos/from-link`
  - Body: `{url, title?, description?}`.
  - Returns 202 `{id, status:"processing", download_id}`.
  - 400 when the host is not in the allowlist.
- `GET /api/videos/{id}` returns VideoResponse: `id, user_id, title, description, file_url, thumbnail_url, duration` (epoch seconds as text), `status, source_url, source_platform, duplicate_group_id, created_at, updated_at, like_count, comment_count, liked, user_name, is_canonical?, canonical_info?{id,title,user_name}`.
  - No ownership or friendship check.
  - Returns `deleted` videos too.
  - **Note:** `like_count`, `comment_count` and `liked` use `omitempty`, so zero values are omitted from the JSON.
- `DELETE /api/videos/{id}`: owner or admin; hard delete plus S3 delete; returns `{status:"deleted"}`.
- `GET /api/videos/{id}/file` streams bytes from S3 through the API.
  - Sends `Accept-Ranges: bytes` but **ignores Range headers**.
  - Only serves `status='ready'`; no ACL.
- `GET /api/videos/{id}/download` returns the latest Download row for (video, caller).
- `DELETE /api/videos/{id}/download` is **broken** (reads `downloadId`).
- `PATCH /api/videos/{id}/keep`: body `{keep_forever: bool}`, owner only; returns `{status:"updated", keep_forever}`.
- `POST /api/videos/{id}/unsend`: `{id}` here is the **received_videos id**, not the video id.
  - Allowed only for the sender, and only if the recipient has no watch_history row for the video.
  - 400 "cannot unsend after recipient has watched the video".

**Social on a video**
- `POST /api/videos/{id}/like` (idempotent) returns `{status:"liked"}`. `DELETE /api/videos/{id}/like` returns `{status:"unliked"}`.
- `GET /api/videos/{id}/likes` returns `[{user_id, username, avatar_url, created_at}]`.
- `GET /api/videos/{id}/comments` returns a tree `[{id, user_id, user_name, body, created_at, replies?[]}]`, ascending.
- `POST /api/videos/{id}/comment` (**singular**)
  - Body: `{body, parent_id?}`.
  - Returns 201 `{id, created_at}`.
  - A nonexistent video yields a 500 from the FK error.
- `DELETE /api/videos/{id}/comments/{commentId}` is **broken** (uses `{id}` as the comment id).
- `POST /api/videos/{id}/react`: body `{emoji}`; upsert; returns `{status:"reacted", emoji}`. `DELETE /api/videos/{id}/react` returns `{status:"removed"}`.
- `POST /api/videos/{id}/watched`: body `{progress_seconds?}`; upsert; returns `{status:"watched"}`.

**Duplicates**
- `GET /api/videos/{id}/duplicates` returns either `{group:null}` or `{id, canonical_id, members:[{id,user_id,user_name,title,thumbnail_url,is_canonical,created_at}], member_count, created_at, updated_at}`. The two shapes are inconsistent.
- `PUT /api/duplicates/{id}/canonical`
  - Body: `{video_id}` (must be a member).
  - Caller must own that video or be an admin.

**Feeds and history**
- `GET /api/feed?page_size=1..100&page_token=` returns `{videos:[VideoResponse-lite], next_page_token?}`. The feed contains every ready video on the server not yet watched by the caller.
- `GET /api/feed/fyp` returns `[VideoResponse-lite]`: up to 50 received, ready, unwatched videos.
- `GET /api/history?q&friend&date_from&date_to&limit&offset` returns `[{id,title,thumbnail_url,user_name,user_id,watched_at,progress_seconds}]`.
  - The `friend` filter is a username ILIKE on the video **owner**, not the sender.
  - Bad dates produce a 500.

**Friends and sharing**
- `POST /api/friends/invite`
  - Body: `{username}`.
  - Returns 201 `{id, username, status:"pending", created_at}`.
  - Errors: 404, 400 (self), 403 (blocked), 409 (already friends / pending).
- `POST /api/friends/accept/{id}`
  - `{id}` is the friend-request id; body `{action:"accept"|"decline"}`.
  - Returns `{status:"accepted"|"declined"}`. Decline deletes the row.
- `GET /api/friends` returns `[{id (friendship id), user_id, username, status, created_at}]`.
- `GET /api/friends/requests` returns incoming pending requests in the same shape.
- `POST /api/friends/block/{id}`: `{id}` is a user id; returns `{status:"blocked"}`.
- `POST /api/send/{id}`
  - `{id}` is the recipient **user id**; body `{video_id, caption?}`.
  - Returns 201 `{id, created_at}`.
  - Errors: 403 (not friends), 404 (video not found or not yours), 409 (already sent).
- `GET /api/inbox?limit&offset` returns `[{id, video_id, title, thumbnail_url, sender_id, sender_name, caption?, read_at?, created_at}]`.
- `PATCH /api/inbox/{id}`: body `{action:"accept"|"reject"}`. Accept sets `read_at`; reject deletes the row.
- `POST /api/inbox/{id}/read` sets `read_at` and returns `{status:"ok"}`.

**Users**
- `GET /api/users?q=` returns `[{id, username, display_name?, avatar_url?}]`, up to 20.
- `GET /api/users/{id}/profile` returns `{user:{id,username,display_name,avatar_url,created_at}, video_count}`.
- `GET /api/users/{id}/videos` returns up to 50 ready videos.

**OAuth / import**
- `GET /api/oauth/providers` returns `{providers:[{name, auth_url, connected, connected_at?}]}`.
- `GET /api/oauth/{provider}/auth-url` returns `{auth_url, provider}`.
- `POST /api/oauth/connect`: body `{provider, code, redirect_uri?}`; returns `{status:"connected", provider}`. This is the mobile/SPA code-exchange path.
- `DELETE /api/oauth/{provider}` revokes at Google and deletes the row.
- `GET /api/oauth/{provider}/playlists` returns `{playlists:[{id,title,description,thumbnail_url,item_count,visibility}], provider}`. There is no token refresh here.
- `POST /api/import`: body `{provider, playlist_id, playlist_title?}`; returns 201 `{job_id, provider, source_playlist_id, source_playlist_title, status}`. **Fails at runtime** (§2).
- `GET /api/import` returns `{jobs:[…]}`. Fields are serialized with Go default names (`ID`, `UserID`, `CollectionID`…) because `importJob` has no json tags.
- `GET /api/import/{jobId}` returns `{job, items}` (owner or admin).
- `POST /api/import/{jobId}/cancel`.

### 4.3 Admin (Bearer + admin claim)
- `GET /api/admin/stats` returns `{total_videos, total_users, total_likes, total_comments, total_storage_bytes, storage_quota_bytes, storage_usage_pct}`.
  - `storage_quota_bytes` is the SUM of per-user quotas, **not** `VIDFRIENDS_MAX_STORAGE_BYTES`.
- `GET /api/admin/users?email&username&role&status` returns `[AdminUserInfo]`, unpaginated.
- `PATCH /api/admin/users/{id}`: body `{role?, status?, upload_quota_bytes?}`. A quota cannot be reset to NULL/unlimited.
- `DELETE /api/admin/users/{id}`: hard delete, **no S3 cleanup**, no self-protection.
- `DELETE /api/admin/videos/{id}`: S3 delete plus `status='deleted'`; returns `{status:"evicted"}`.
- `GET /api/admin/storage` returns a bare array `[{user_id, username, storage_used}]`.
- `POST /api/admin/eviction/run` returns `{status:"eviction_complete", evicted:N}`.
- `GET /api/admin/invites` returns `[{token, used_by?, expires_at, created_by, created_at}]`.
- `POST /api/admin/invites`: body `{expires_at: RFC3339 future}`; returns 201 `{token, expires_at}`.
- `GET /api/admin/activity?action&actor_id&entity_type&entity_id&limit<=100&offset` returns `{entries:[{id,actor_id,actor_email,action,entity_type,entity_id,metadata,ip_address,created_at}], total, limit, offset}`.
- Recorded actions: `admin_update_user`, `admin_delete_user`, `admin_eviction_run`, `admin_create_invite`, `admin_delete_video`.

### 4.4 Realtime (WebSocket)
- **Connection:** `GET /api/ws?token=<JWT>`. The JWT goes in the query string, so it is logged by proxies; Caddy logs URIs. Any token kind is accepted.
- **Origin check:** none (`CheckOrigin` returns true, `ws.go:16`).
- **Server → client message:** `{type, payload}`. Multiple queued messages are newline-joined into one frame (`ws.go:323-327`), so clients must split on `\n`.
- **Event constants** (`ws.go:28-35`): `new_video`, `video_downloaded`, `liked`, `commented`, `friend_request`, `import_progress`, `import_complete`, `import_failed`.
- **Actually emitted:**
  - `download_complete` (`main.go:69`, payload leaks server file paths)
  - `duplicate_detected` (`video.go:1120`)
  - `import_progress` (importer)
  - None of `liked`, `commented`, `friend_request` or `new_video` are ever sent.
- **Client → server:** messages are read and discarded (only rate-limited at 10/s, burst 20; "rooms" field unused).
- **Runtime state:** dead.
  1. `hub.Run()` is never started in `cmd/server/main.go`, so registrations queue in a 256-buffer channel and `SendToUser` finds no clients. Once 256 connections arrive, the handler blocks forever.
  2. `middleware.Logging` wraps `ResponseWriter` in a struct that does not implement `http.Hijacker`, so `upgrader.Upgrade` fails **[verified]**.

### 4.5 Documented in OpenAPI but differing from code
See §12.

---

## 5. Auth, session and security

### 5.1 Mechanisms
- **Passwords:** bcrypt `DefaultCost` (10) (`auth.go:76`). Policy: 8-128 chars, at least one each of upper, lower and digit (`auth.go:119-147`).
- **JWT:** HS256 with a shared secret (`internal/auth/jwt.go`).
  - Claims: `user_id, email, username, role, kind (access|refresh), exp, iat, iss="vidfriends"`.
  - Access TTL `VIDFRIENDS_JWT_EXPIRY`, default 15m. Refresh TTL `VIDFRIENDS_JWT_REFRESH_EXPIRY`, default 168h, but the DB row is hard-coded to 7 days (`auth.go:579`).
- **Refresh tokens** are JWTs whose SHA-256 is stored in `refresh_tokens`.
  - Refresh validates the JWT, checks `kind`, looks up the hash, deletes it, re-reads the user (so role changes apply), and issues a new pair. That is rotation.
  - The flow is not transactional and does not check `RowsAffected`, so concurrent refreshes can both succeed.
  - There is no reuse detection or family revocation.
- **Critical flaws:**
  - `middleware.Auth` and `ServeWS` call `jwt.Validate` but **never check `Kind == access`**. A refresh token works as a 7-day bearer token on every endpoint (`internal/middleware/auth.go:30`, `jwt.go:66`).
  - **Logout is a no-op** (`auth.go:563`). Nothing revokes refresh tokens, and access-token validity is never checked against the DB.
  - **User `status` (suspended/disabled) is never enforced** at login, refresh or middleware, even though `docs/admin-setup.md` says suspended users "Cannot log in".
  - `role` is trusted from the JWT, so a demoted admin keeps admin rights until token expiry. Combined with the refresh-as-access flaw, that can be 7 days.
  - Login does not lowercase the email, but register does, so users who type mixed case cannot log in.
- **Invite tokens:** 32 random bytes as hex, expiring, single use, consumed in a transaction with `SELECT … FOR UPDATE` (`auth.go:184-224`). This is a good pattern to keep.
- **Admin role:** set manually via SQL for the first admin, or via `PATCH /api/admin/users/{id}`. There are only two roles.
- **Rate limiting** (`internal/middleware/ratelimit.go`): an in-memory token bucket, default 10 r/s with burst 20, keyed by `r.RemoteAddr`.
  - Because RateLimit wraps the mux **outside** `Auth`, claims are never in context, so the per-user branch is dead code.
  - `RemoteAddr` includes the ephemeral **port**, so each TCP connection gets a fresh bucket. The limiter is effectively per-connection and trivially bypassed.
  - Behind Caddy, every client shares the proxy's IP. X-Forwarded-For is not used.
  - There is no stricter limit on login/register (no brute-force protection).
  - Other limiters: account deletion is limited to 1 per hour per user (in-memory, lost on restart, set *before* deletion succeeds); WebSocket messages are limited to 10/s per connection (hard-coded).
- **CORS** (`internal/middleware/cors.go`): exact-match allowlist from `VIDFRIENDS_CORS_ORIGINS`, re-read on every request.
  - `Access-Control-Allow-Credentials: true` is sent always.
  - Methods and headers are sent even to disallowed origins.
- **CSRF:** not applicable to Bearer auth (no cookies). The **OAuth flow has CSRF-class flaws** (next item).
- **OAuth state = the plain user id** (`handler/oauth.go:46,200`).
  - The unauthenticated `/api/oauth/callback` saves the exchanged token under `user_id = state` (`oauth.go:100`).
  - An attacker who knows a victim's UUID can therefore bind the attacker's YouTube account to the victim's VidFriends account. User UUIDs are exposed by search, friends, inbox and others.
  - There is no nonce or HMAC on state.
  - OAuth tokens are stored in plaintext.
  - Upstream error bodies are reflected to clients (`"token exchange failed: "+err.Error()`).
  - If `redirect_uri` is omitted it defaults to the provider name, which is a bogus value (`oauth.go:89-91`).
- **Authorization gaps (privacy):**
  - Any authenticated user can read any video's detail, stream the file, list likes/comments, comment, like, react or mark watched by ID. There is no friendship or ownership check.
  - The main feed (`/api/feed`) shows **every** ready video on the server to every user, including users you have blocked.
  - Block does not hide content; it only prevents friend requests and sends.
- **Duplicate merge leaks across users.** `MergeSocial` moves comments and inbox entries from a user's video onto a *different user's* canonical video. Comments made on my upload then appear on a stranger's video, and recipients' inbox items point at a video owned by someone else (`hash/detector.go:155-213`).
- **Information leakage:**
  - `/api/health` returns raw DB errors.
  - The WebSocket `download_complete` payload includes server filesystem paths.
  - The download record exposes `file_path` and yt-dlp stderr.
  - `file_url`/`thumbnail_url` expose the internal S3 endpoint URL, e.g. `http://minio:9000/vidfriends-videos/<uuid>/<name>`.
- **Audit log IP** is taken from the client-supplied `X-Forwarded-For` (`middleware/activity.go:59`), so it is spoofable.
- **Upload validation:**
  - Trusts the client-declared part Content-Type (`video/*`); there is no magic-byte sniffing.
  - The client filename is used inside the S3 object key.
  - The download content type is guessed from the file extension (VID-161 nit N4, still open).
- **yt-dlp SSRF / abuse:**
  - The host allowlist with suffix match (`downloader/validator.go:9`) is a good idea.
  - yt-dlp follows redirects and extractor logic beyond that check.
  - There is no queue limit: each link spawns an unbounded goroutine and process (`downloader/manager.go:76`).
  - There is no per-user rate limit and no storage accounting for link imports.
- **Container / deploy hardening:**
  - Present: non-root `USER vidfriends`, read-only rootfs, `cap_drop ALL`, `no-new-privileges` (prod), 256M memory limit.
  - **Prod compose does not override the dev secrets.** In Compose, `environment:` takes precedence over `env_file:`, and the base `docker-compose.yml` hard-codes `VIDFRIENDS_JWT_SECRET: "vidfriends-dev-secret-do-not-use-in-prod"`, the DB URL with password `vidfriends`, and `POSTGRES_PASSWORD: vidfriends`. `docker-compose.prod.yml` only adds `env_file: .env.production`. A by-the-book prod deploy therefore runs with the public dev JWT secret, which allows trivial token forgery including admin.
  - `migrate` also hard-codes the DB URL.
  - `minio/minio:latest` and `minio/mc:latest` are unpinned.

### 5.2 Privacy and abuse posture (as documented)
- No telemetry (true; no analytics code).
- The admin can see everything (stated honestly in the FAQ).
- Self-service delete: implemented. Self-service export: not implemented.
- There is no content moderation or reporting, no per-user upload rate limit, and no email verification.

### 5.3 Summary of `docs/security-checklist.md` (last reviewed 2026-06-16)
An operator checklist with these sections:
- **AuthN/Z:** strong JWT secret via `openssl rand -base64 32`; 15m expiry; admin-only endpoints; rate limiting 10 r/s, burst 20; bcrypt.
- **Network:** API bound to 127.0.0.1; TLS at Caddy/Nginx/LB; Postgres 5432 and MinIO 9000/9001 not exposed; CORS restricted; firewall 80/443/22 only.
- **Database:** change the default password; `sslmode=require/verify-full`; daily backups; 30-day retention.
- **Container:** non-root; resource limits; no-new-privileges; drop caps except NET_BIND_SERVICE; read-only rootfs with tmpfs `/tmp`; alpine:3.20; HEALTHCHECK.
- **Secrets:** `.env` gitignored; no hard-coded prod secrets in compose; inject via env or Docker secrets; unique per environment.
- **Observability:** health with DB status; structured JSON logs; info/warn level; external uptime monitoring.
- **App:** graceful shutdown; read/write timeouts; rate limiting per user (authed) and per IP (unauthed); parameterized SQL (pgx); panic recovery; no sensitive error details.

Items that are **false against the code:**
- "No secrets hardcoded in docker-compose.yml for production" (they are, and they win over env_file).
- "Rate limiting is enforced per user… and per IP".
- "Sensitive error details are not leaked".
- "Admin endpoints only accessible with admin role" (true, but a role from a forged or stale JWT is still accepted).

---

## 6. Video handling

### 6.1 Ingestion
1. **Direct upload** (`POST /api/videos/upload`, `video.go:88`).
   - The flow: multipart parse → size check → instance quota (sum of `users.storage_used` vs `VIDFRIENDS_MAX_STORAGE_BYTES`) → per-user quota (`upload_quota_bytes`) → stream to S3 → insert video as `ready` → increment `storage_used` → async pHash dedup.
   - There is **no thumbnail, duration or metadata extraction for uploads.**
2. **Link import** (`POST /api/videos/from-link`).
   - URL validation: http/https only, host in `VIDFRIENDS_ALLOWED_PLATFORMS`, which defaults to `youtube.com, youtu.be, tiktok.com, instagram.com, twitter.com, x.com, reddit.com, vimeo.com, facebook.com`. `www.` is stripped and subdomains are allowed.
   - It then inserts a `processing` video and a `queued` download, and starts the yt-dlp goroutine.
   - The yt-dlp invocation (`downloader/manager.go:130-142`): `--no-playlist --print after_move:filepath -o <dir>/<videoID>_%(title).100s_%(id)s.%(ext)s --max-filesize <bytes> --restrict-filenames --no-warnings <url>`.
   - Then: stat the file → mark the download `completed` → ffmpeg thumbnail → upload video and thumbnail to S3 → set the video `ready` → callback (WebSocket notify + pHash dedup).
   - **Default-config failure:** `DownloadTimeout` defaults to `30*60` as a `time.Duration`, which is 1800 **nanoseconds** **[verified: 1.8µs]** (`internal/config/config.go:98`). The first DB update already fails with a deadline error, so the download stays `queued` and the video stays `processing` forever. `failDownload` uses the same dead context, so failures cannot even be recorded.
   - Other problems:
     - Local temp files (video and thumbnail) are never deleted, so `/tmp/vidfriends-downloads` leaks disk.
     - In prod, `/tmp` is a 64 MB tmpfs, so any real video download fails there.
     - The in-memory `jobs` map is lost on restart; there is no resumable queue.
     - The video status is not set to `failed` if the S3 upload fails.
     - `storage_used` is not incremented and quotas are not checked for link imports.
3. **Playlist import** (YouTube OAuth, `internal/importer/manager.go`).
   - A DB-backed queue (`FOR UPDATE SKIP LOCKED`, 5 s poll, 3 concurrent jobs, 30 min timeout) lists playlist items via the YouTube Data API v3 (scope `youtube.readonly`).
   - Per item, it skips if the same `source_url` already exists for the user; otherwise it inserts a `processing` video and marks the item `completed`. **It never calls the downloader**, so imported videos never become ready.
   - At the end it creates a collection with the completed items.
   - Additionally, `CreateJob` and `insertJobItem` scan nullable `error_message` into a Go `string`, which pgx rejects on NULL, so `POST /api/import` returns 500.
   - The `provider` field is not validated; the worker always uses the YouTube provider.

### 6.2 Storage
- S3-compatible object storage via minio-go (`internal/storage/s3.go`). The bucket is ensured at boot with 3 retries.
- Object key: `<uuid>/<original filename>`.
- The DB stores the **full URL** `"<endpoint>/<bucket>/<key>"` (`s3.go:82-94`). `DeleteFile` and `GetFile` strip that prefix, so if the endpoint configuration ever changes, deletes silently no-op (`s3.go:112-116`).
- There are no presigned URLs. Thumbnails and files are not publicly reachable unless the bucket is public, and **there is no API endpoint to fetch a thumbnail**. Clients receive an unusable internal URL.
- Orphan handling: `DeferCleanup` on a DB failure after a successful put (VID-148).
- Deletes are best-effort, ignoring S3 errors. Admin user delete leaves objects orphaned.
- Storage accounting (`users.storage_used`) is only incremented on upload. It is never decremented on delete or eviction, so instance-quota math drifts upward.

### 6.3 Transcoding
None. Files are served as uploaded or downloaded. ffmpeg is installed in the image and used only for thumbnails and pHash frames.

### 6.4 Thumbnails
- `internal/thumbnail/thumbnail.go:17`: `ffmpeg -ss 00:00:01 -vframes 1 -q:v 3 -vf scale=640:-1`.
- On failure it writes a flat dark-gray 640×360 JPEG placeholder.
- Generated only for link imports.

### 6.5 Duplicate detection
- **How it hashes** (`internal/hash/phash.go`):
  - Extracts one frame with ffmpeg (the function is named `extractMidFrame` but actually takes the **first** frame; there is no `-ss`), scaled to 320 px wide.
  - Computes a 64-bit perceptual hash (goimagehash).
  - Compares it by Hamming distance against **all** ready videos on the server with the same algorithm label. This is a full table scan in Go.
  - Threshold: `VIDFRIENDS_DUPLICATE_THRESHOLD`, default 12.
- **Bugs:**
  - If ffmpeg fails, a uniform placeholder frame is hashed. Every undecodable video then gets the same hash, and they are all grouped as duplicates of each other.
  - `vhash.Compute` always uses pHash, while the detector labels rows with `VIDFRIENDS_HASH_TYPE` (`dhash`/`ahash` supported in `hasher.go`). Setting HASH_TYPE produces mislabeled hashes.
  - The closest match is chosen as canonical, not the "earliest uploaded" one claimed by the FAQ.
  - On upload, detection is killed immediately (`defer dupCancel()` runs when the handler returns, `video.go:182-184`).
- **Grouping and merge** (`hash/detector.go`):
  - `CreateOrJoinGroup`: a transaction creates a group with the canonical video or joins the canonical's group.
  - `MergeSocial`: copies likes and reactions to the canonical, **moves** comments and received_videos to the canonical, and leaves the duplicate video in place.
  - A unique-constraint conflict on received_videos aborts the whole merge.
  - `SetCanonical` changes the pointer without re-merging.
  - The FAQ claim "When someone watches a duplicate, they see the canonical version instead" is not implemented; detail only reports `canonical_info`.

### 6.6 Playback
- `GET /api/videos/{id}/file` proxies the full object through the Go server.
- No HTTP Range support, so seeking on iOS/Safari and other players breaks.
- Subject to `WriteTimeout` (default 30 s), which truncates large or slow streams.
- No CDN or presign path.

### 6.7 Metadata
- Title and description come from the user (link imports default to an empty title; playlist imports use the YouTube title).
- `source_url` and `source_platform` are set for links.
- `duration` is never computed.
- yt-dlp metadata (uploader, original caption) is discarded.

### 6.8 Eviction
`POST /api/admin/eviction/run` (`admin.go:274`):
- Selects videos with status in (`ready`, `processing`), older than `VIDFRIENDS_EVICTION_AGE_DAYS` (default 90), not `keep_forever`, and with zero likes and zero comments.
- Deletes their S3 objects, then sets `status='deleted'` using a second, independently evaluated query, which is a race.
- `VIDFRIENDS_EVICTION_STRATEGY` (`age`/`storage`/`both`) and `VIDFRIENDS_MAX_STORAGE_BYTES` are not used by eviction.
- There is no scheduler.

---

## 7. Social model: business rules and state transitions

### 7.1 Friendship (`friends` row, `social.go`)
- **Invite (`username`):**
  - 404 if the user doesn't exist; 400 for self.
  - 403 if the target has blocked the caller.
  - If any row exists in either direction: `accepted` → 409, `pending` → 409, `blocked` → 403.
  - Otherwise inserts `pending` (requester = caller).
- **Accept/decline:** only the addressee, only while `pending`. `accept` → `accepted`; `decline` → **row deleted**, so the requester can re-request.
- **Block (user id):** deletes rows in both directions, then inserts `(blocker → blocked, status 'blocked')`. After that:
  - The blocked user's invite is 403.
  - The blocker's own invite to them hits the "blocked" existing row → 403.
  - There is no unblock.
- **State machine:**
  ```
  none -invite-> pending -accept-> accepted
               pending -decline-> none
  any  -block-> blocked (directional)
  ```
  There are no transitions out of `accepted` (no unfriend) or `blocked` (no unblock).
- **Notifications:** none sent. `FriendRequestNotification` and the push event `friend_request` exist but are unused.

### 7.2 Sending ("send" = `received_videos`)
- **Preconditions:** the recipient is an accepted friend; the video **belongs to the sender** (resharing a received video is not possible); not to self.
- **Unique** per (video, sender, recipient), so a second send gives 409.
- **Recipient actions:** `PATCH` accept (sets `read_at`), reject (deletes), or `POST …/read` (sets `read_at`).
- **Sender action:** unsend (deletes) only if the recipient hasn't watched the video, meaning no watch_history row. An unrelated earlier watch also blocks it.
- **State machine:** `sent(read_at NULL) → read(read_at set)`; from either state, the row can be deleted by reject (recipient) or unsend (sender, pre-watch).
- **Notifications:** none. The push event `video_received` exists but is unused.

### 7.3 Feeds
- **Main feed:** every user's ready videos, newest first, minus what the caller watched. **No friend scoping**; the user guide calls it "all public videos on the server".
- **FYP:** videos sent to me, ready, unwatched, ordered by send time, limit 50. A video sent by multiple friends appears multiple times.
- **"Watched"** means a row exists in watch_history (any progress). Watching hides the video from both feeds.

### 7.4 Engagement
- **Likes:** idempotent set membership.
- **Reactions:** one emoji per user per video, replaceable.
- **Comments:** threaded, unlimited depth, ascending.
  - Only the owner or an admin can delete (but the route is broken).
  - Deleting a parent cascades to its replies.
  - No editing.
- Engagement counts protect videos from eviction (any like or comment). Reactions and sends do not.

### 7.5 Groups / collections
- Collections exist only in schema and are auto-created by import (§6.1).
- There are no friend groups or circles, no shared albums, and no collection CRUD API.

### 7.6 Notifications
- **WebSocket:** dead (§4.4).
- **Push:**
  - `PushManager` is constructed and `POST /api/push/register` stores targets, but `PushManager.Notify` (`push/manager.go:98`) has **no callers**.
  - ntfy and Gotify senders are implemented and unit tested. FCM and APNs are stubs.
  - Push event names (`video_received`, `like`, `comment`, `friend_request`, `friend_accepted`) differ from WebSocket event names (`new_video`, `liked`, `commented`…).
  - Gotify uses one server-wide `VIDFRIENDS_GOTIFY_URL` plus a per-user token; the `gotify_url` column is unused.
  - ntfy publishes JSON to the server-wide `VIDFRIENDS_NTFY_URL` with a user-chosen topic. On public ntfy.sh, topics are world-readable, which is a privacy note.

### 7.7 User discovery
Username substring search across all users on the instance, with UUIDs exposed. Any user's profile and video list is viewable by id.

---

## 8. Architecture, stack, config, deployment

### 8.1 Stack
- **Language and libraries:** Go 1.26 (`go.mod`, module `vidfriends.ai/backend`), standard `net/http` ServeMux, pgx v5 pool (25 max / 5 min connections, `database/database.go:31-35`), minio-go v7, golang-jwt v5, gorilla/websocket, x/crypto bcrypt, goimagehash.
- **Infrastructure:** Postgres 16, MinIO, ffmpeg and yt-dlp installed from the Alpine repo (`Dockerfile`), Caddy 2 for TLS.
- **Shape:** a single process (no separate worker). Background work runs as in-process goroutines: the downloader (per-job goroutine), the import worker (ticker), duplicate detection, and the rate-limiter cleanup.
- **Startup sequence** (`cmd/server/main.go`):
  1. Load config.
  2. Set up slog JSON logging.
  3. Connect the DB pool.
  4. Verify migrations (table existence).
  5. Create the S3 client and ensure the bucket.
  6. Create the JWT manager and WebSocket hub (not run).
  7. Create the duplicate detector and downloader manager with completion callback.
  8. Create the activity logger and push manager.
  9. Build the router (which starts the import worker).
  10. Create `http.Server` with Read/Write timeouts.
  11. Shut down gracefully on SIGINT/SIGTERM. The shutdown does not stop the import worker, downloads or the hub.

### 8.2 Package map
| Package | Contents |
|---|---|
| `internal/config` | Env config |
| `internal/database` | Pool + verify |
| `internal/auth` | JWT |
| `internal/middleware` | auth, admin, CORS, logging, recovery, ratelimit, activity logger |
| `internal/handler` | auth, video, social, admin, duplicate, push, oauth, import, ws, health, helpers |
| `internal/downloader` | yt-dlp manager + URL validator |
| `internal/thumbnail` | ffmpeg thumbnails |
| `internal/hash` | pHash/dHash/aHash + detector |
| `internal/storage` | S3 |
| `internal/push` | Notifiers |
| `internal/oauth` | Provider interface, YouTube, token store |
| `internal/importer` | Playlist import worker |
| `internal/github` | GitHub App tokens (unused by app) |
| `internal/model` | Structs |

### 8.3 Environment variables

All are read in `internal/config/config.go` unless another file is given.

**Server**
| Var | Default | Notes |
|---|---|---|
| `VIDFRIENDS_ADDR` | `:8080` | |
| `VIDFRIENDS_READ_TIMEOUT` | 10s | Go duration or integer seconds |
| `VIDFRIENDS_WRITE_TIMEOUT` | 30s | |
| `VIDFRIENDS_SHUTDOWN_TIMEOUT` | 15s | |
| `VIDFRIENDS_LOG_LEVEL` | `info` | debug/info/warn/error |

**Database and auth**
| Var | Default | Notes |
|---|---|---|
| `VIDFRIENDS_DATABASE_URL` | `postgres://vidfriends:vidfriends@localhost:5432/vidfriends?sslmode=disable` | |
| `VIDFRIENDS_JWT_SECRET` | `vidfriends-dev-secret-do-not-use-in-prod` | **No startup guard against the default** |
| `VIDFRIENDS_JWT_EXPIRY` | 15m | `expires_in` in responses is hard-coded to 900 |
| `VIDFRIENDS_JWT_REFRESH_EXPIRY` | 168h | DB row expiry hard-coded to 7 days |
| `VIDFRIENDS_ALLOW_PUBLIC_SIGNUP` | false | |

**Object storage**
| Var | Default | Notes |
|---|---|---|
| `VIDFRIENDS_S3_ENDPOINT` | `http://localhost:9000` | |
| `VIDFRIENDS_S3_ACCESS_KEY` / `_SECRET_KEY` | `minioadmin` | |
| `VIDFRIENDS_S3_BUCKET` | `vidfriends-videos` | |
| `VIDFRIENDS_S3_REGION` | '' | |
| `VIDFRIENDS_S3_PATH_STYLE` | false | MinIO usually needs true; compose works via DNS lookup fallback |
| `VIDFRIENDS_S3_USE_SSL` | false | |

**Video download (yt-dlp)**
| Var | Default | Notes |
|---|---|---|
| `VIDFRIENDS_YTDLP_PATH` | `yt-dlp` | |
| `VIDFRIENDS_YTDLP_OUTPUT_DIR` | `/tmp/vidfriends-downloads` | Also used as the thumbnail dir |
| `VIDFRIENDS_YTDLP_MAX_FILE_SIZE` | 524288000 | |
| `VIDFRIENDS_YTDLP_DOWNLOAD_TIMEOUT` | **1.8µs (bug)** | Docs say 30m |
| `VIDFRIENDS_ALLOWED_PLATFORMS` | 9 domains | |

**Duplicates, eviction and quotas**
| Var | Default | Notes |
|---|---|---|
| `VIDFRIENDS_DUPLICATE_THRESHOLD` | 12 | |
| `VIDFRIENDS_HASH_TYPE` | `phash` | Mislabels if changed |
| `VIDFRIENDS_EVICTION_STRATEGY` | `age` | Unused |
| `VIDFRIENDS_EVICTION_AGE_DAYS` | 90 | |
| `VIDFRIENDS_MAX_STORAGE_BYTES` | 0 | Instance cap for uploads only |
| `VIDFRIENDS_MAX_UPLOAD_SIZE` | 500 MB | Not in `.env.example` or deployment.md |

**OAuth and GitHub**
| Var | Default | Notes |
|---|---|---|
| `VIDFRIENDS_YOUTUBE_CLIENT_ID` / `_CLIENT_SECRET` | '' | |
| `VIDFRIENDS_YOUTUBE_REDIRECT_URI` | `http://localhost:8080/api/oauth/callback?provider=youtube` | |
| `VIDFRIENDS_GITHUB_APP_ID` / `_PRIVATE_KEY_PATH` / `_INSTALLATION_ID` | '' | Unused |

**Push**
| Var | Default | Notes |
|---|---|---|
| `VIDFRIENDS_NTFY_URL` | '' | |
| `VIDFRIENDS_GOTIFY_URL` | '' | |
| `VIDFRIENDS_FCM_CREDENTIALS_FILE` | '' | Stub |
| `VIDFRIENDS_APNS_KEY_FILE` / `_KEY_ID` / `_TEAM_ID` / `_TOPIC` | '' | Stub |

**Read outside config.go**
| Var | Default | Read in |
|---|---|---|
| `VIDFRIENDS_RATE_LIMIT_RATE` | 10 | `middleware/ratelimit.go` |
| `VIDFRIENDS_RATE_LIMIT_BURST` | 20 | `middleware/ratelimit.go` |
| `VIDFRIENDS_CORS_ORIGINS` | `http://localhost:3000,http://localhost:5173` | `middleware/cors.go` |

**Compose-only**
| Var | Default |
|---|---|
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | `minioadmin` |

### 8.4 Deployment (`docs/deployment.md`, compose files, Makefile)
- **Dev:** `make dev` runs `docker compose up --build --wait`. It brings up postgres:16-alpine (127.0.0.1:5432), migrate/migrate:v4.18.2 (`up`), minio:latest (127.0.0.1:9000/9001), createbuckets (mc), and api (127.0.0.1:8080, 1 CPU / 256M).
  - `docker-compose.override.yml` adds `develop.watch` rebuild rules and mentions `air` (no `.air.toml` exists).
- **Prod:** `make deploy` runs `docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d --wait`.
  - It adds `env_file: .env.production`, hardening, json-file log rotation (10m × 3), and a Caddy service (80/443, Let's Encrypt, `Caddyfile` with hard-coded `vidfriends.example.com`, active health check on `/api/health`, JSON access log at `/data/access.log`).
  - Secrets are not actually overridden (§5.1).
- **Image:** multi-stage `golang:1.26-alpine` (installs unnecessary gcc/musl-dev while building with `CGO_ENABLED=0`) → `alpine:3.20` with `ca-certificates curl ffmpeg yt-dlp python3`.
  - Runs as a non-root user.
  - HEALTHCHECK uses `wget` against `/api/health`.
  - Alpine's yt-dlp package will go stale; yt-dlp needs frequent updates to keep working with platforms.
- **CI** (`.github/workflows/ci.yml`): jobs `lint` (golangci-lint latest, config `.golangci.yml` v2), `test` (`go test -race`), `build`, `docker-build`, `docker-scan` (Trivy HIGH/CRITICAL, `continue-on-error: true` so it never fails), and `integration` (compose up then `go test -tags=integration`).
  - **Triggers are `push: branches: [main]` + `pull_request`, but the repo's branch is `master`.** Pushes to master never run CI.
- **Publish** (`.github/workflows/publish.yml`): builds and pushes to GHCR on `main` or tags `v*` (semver, sha, latest). It also never triggers on `master`.
- **Admin setup:** register normally, then `UPDATE users SET role='admin'` via psql. Create invites via the API and share them as text, a link or a QR code.
- **Backup** (deployment.md): `pg_dump` via compose exec; a cron example at 03:00 with gzip; 30-day `find -mtime +30 -delete` rotation; a volume tarball snapshot of `vidfriends_pgdata`.
  - **There is no MinIO/video backup procedure at all**, only the DB.
- **Observability:**
  - slog JSON to stdout. A request log line has method, path, status and duration, but no request ID (CORS allows an `X-Request-ID` header but it is unused).
  - `/api/health` and Docker/Caddy health checks.
  - Prometheus/Grafana is shown as an optional compose snippet, but there is **no metrics endpoint**.
  - deployment.md suggests external uptime monitoring.
- **Upgrade/rollback:** `git pull origin main` (the branch is master) and rebuild; `migrate down 1` for rollback.
  - Zero-downtime requires Swarm. Multi-instance would also break in-memory state: the WebSocket hub, rate limiter, download jobs and delete-rate map.

---

## 9. Tests

### 9.1 Unit tests (all pass: `go test ./...`)
- `internal/handler/ws_test.go`: WSHub register/unregister, `SendToUser`/`SendToUsers`, counts, Stop, per-connection limiter, and notification constructors plus JSON. These tests call `go hub.Run()` themselves, which hides the production omission.
- `internal/push/push_test.go`: `notificationFromEvent`, `isEventEnabled`, ntfy and Gotify against an `httptest` server (success, error status, default URL, cancelled context), FCM/APNs "not implemented", event constants.
- `internal/hash/phash_test.go`: Hamming distance, IsDuplicate, ComputeFromBytes, byte conversion, different images, `HasherForType`, dHash/aHash, `ComputeWithHasher` (may depend on ffmpeg).
- `internal/github/token_test.go`: JWT signing, installation token exchange success/error, private key parsing.
- **No unit tests** for auth/JWT, middleware (rate limit, CORS, auth), config, handlers, downloader/validator, storage, importer, oauth or detector DB logic.

### 9.2 Integration tests (`test/integration/*.go`, build tag `integration`, run against a live compose stack)
- **Coverage:**
  - Health; migration tables; MinIO bucket and upload.
  - Register (success, no invite, bad invite, duplicate, short password).
  - Public signup (self-skips in invite mode).
  - Login (success, wrong password, unknown user); refresh (valid, reuse, invalid, access-token-as-refresh).
  - Auth middleware (`/api/feed` with valid/missing/invalid token); admin middleware; `/me` (including no `password_hash` leak).
  - Friends flow; send/receive + inbox + FYP; block.
  - Admin: stats, users (filters), update user, storage, activity, delete video, eviction, invites.
  - Delete account (6 cases).
- **Why the suite cannot pass at HEAD:**
  1. Every helper registers with the password `password123`. Since `5f5ae7f` (VID-314) the policy requires an uppercase letter, so `registerUser` fails with 400 in almost every test.
  2. `promoteToAdmin` updates the DB but reuses the old JWT, whose `role` claim is `user`, so admin tests get 403.
  3. `createTestVideo` uses `multipart.CreateFormFile`, which sets `application/octet-stream`, so the upload handler rejects it with 400 ("only video files are accepted").
  4. `TestAdminStats` decodes `total_storage`/`active_users_today`. These are stale field names, so the test only asserts `total_users`.
  5. CI never runs on `master` pushes.
- **Not covered anywhere:**
  - OAuth, import, collections, WebSocket over the real router, push registration.
  - Link download, duplicate detection end-to-end.
  - Comments, likes, reactions, history.
  - Profile update, logout, unsend, keep, streaming.
- `scripts/integration-test.sh` and `make test-integration` wrap compose up, the tests, and compose down.

---

## 10. Planning and review docs: status and open items

| Doc | Summary | Status | Open items |
|---|---|---|---|
| `README.md` | Overview, quick start, endpoint table, env/config pointers, integration tests, AGPL | **Stale/incomplete.** The endpoint table lists about 25 of 60+ routes and omits friends, send, inbox, users, push, oauth, import, duplicates, reactions and logout. The `/api/ws` "Auth Required: No" entry is misleading (a token query param is required). It says "Go 1.22+" for tests vs Go 1.26. The project-structure tree omits many packages. | — |
| `docs/backend-consolidation-decision.md` (2026-06-15, CTO, VID-152) | Canonical backend, archive the TS backend, split MuxCore, defer pHash | **Decided; partly contradicted.** pHash is implemented now, the cited migration number is wrong (`000014_create_duplicate_groups`; actual 000016), and the "Feature-complete for v0.1" claim is overstated. | `work/core` repo separation, done per VID-355 |
| `.issue-complete/VID-148.md` | DeferCleanup for S3 orphans | **Current** (implemented; line refs approximate) | Sweeper job (future) |
| `.issue-complete/VID-152-backend-consolidation.md` | Execution of the consolidation; iOS port fix | **Contradictory naming** (calls the canonical dir `work/vidflow/`; the decision doc says `work/vidfriends/`). Same dedup claim as the decision doc. | `work/core` separation |
| `.issue-complete/VID-161.md` | CTO review of 8 items; fixes C5/C6/H4/H6; BLOCKED by Paperclip API 403 | **Partly superseded.** C4 was fixed by VID-377/VID-469, H5 by VID-347, M6 partially by VID-347 (max upload configurable; multipart memory still hard-coded 100 MB). Cited line numbers are stale. | Still open: **M4** (eviction test on live data), **N4** (extension-based content type), **N5** (writePump without per-message timeout on slow clients), **N6** (WS limiter hard-coded), and creating child issues |
| `.issue-complete/VID-277.md` | Env prefix fix, `keep` endpoint, eviction `keep_forever` + configurable age + "removed processing" | **Contradicted:** `processing` is still in both eviction queries (`admin.go:278,320`). Says "Needs BackendSenior review before merge". | Review; remove `processing` |
| `.issue-complete/VID-355-completion.md` | Audit and removal of VidFriends code from `work/core` (core commit `23eefa9`) | **Current but mis-associated.** Commit `466b658` (VID-356, account deletion) added this file, which concerns VID-355 (core migration). | Paperclip 403 |
| `REVIEW-VID-243.md` | CTO approval of user search, inbox PATCH, feed cursor | **Current** (line refs stale) | Post-MVP: search pagination; accept creates a relationship; 400 on a bad cursor |
| `docs/security-checklist.md` | Operator checklist (§5.3) | **Aspirational;** several items false vs code | All unchecked boxes |
| `docs/deployment.md` | Install, config reference, hardening, backup, monitoring, upgrade, troubleshooting | **Partly stale:** config table missing ~15 vars; download timeout default wrong in code; `git pull origin main`; Prometheus without an endpoint; `docker compose inspect` is not a real command; no S3 backup | — |
| `docs/admin-setup.md` | Self-host walkthrough, first admin, invites, admin API, eviction, statuses, activity log | **Partly stale/contradictory:** stats description ("active users last 24h"); "suspended cannot log in" (not enforced); tracked-actions list omits `admin_delete_video` | VID-156 (quota/scheduled eviction), VID-157 (web admin UI) |
| `docs/user-guide.md` | End-user flows (server URL/QR, register, send, feed/FYP, like/comment/react, friends/block, history, notifications) | **Describes intended UX.** Several flows are backend-broken: notifications, link import, comment delete, unsend semantics. | — |
| `docs/faq.md` | Data ownership, deletion, OSS, dedup, platforms, S3 providers, storage full, notifications, password reset, multi-device, invites, privacy, export | **Partly contradictory:** dedup "earliest is canonical" and "watching a duplicate shows canonical" are not true; notification behavior is unimplemented | VID-156; export (future); password reset (future) |
| `docs/openapi.yaml` (OpenAPI 3.0.3, ~2,700 lines) | Spec of ~50 operations | **Stale/divergent** (§12) | — |

---

## 11. Lessons

### 11.1 Good ideas to carry forward
- **Self-hosted, invite-only friend server** as the core product stance, plus optional public signup for larger instances.
- **Single-use, expiring invite tokens** consumed transactionally with `SELECT … FOR UPDATE` (`auth.go:184-224`). Shareable as text, link (`/register?code=`) or QR. The client-side "server URL + QR" pairing UX.
- **Short-lived access tokens with server-stored, hashed, rotating refresh tokens** (SHA-256 of the token in DB, delete-on-use). Also re-reading the role from the DB on refresh.
- **Password re-confirmation and a rate limit for account deletion**, with S3 cleanup before DB cascade.
- **Link ingestion by allowlisted platform**: domain suffix matching, `--no-playlist`, `--max-filesize`, `--restrict-filenames`, `--print after_move:filepath`, deterministic output template keyed by video id.
- **Separate `downloads` job record** with explicit status lifecycle and error message, exposed to clients for progress.
- **DB-backed work queue using `FOR UPDATE SKIP LOCKED`** with bounded concurrency (importer). Generalize it to all background jobs: downloads, thumbnails, hashing, notifications, eviction.
- **Perceptual-hash dedup** across platforms, with groups, a canonical, and a user-overridable canonical. Keep the concept but redesign merge semantics (no cross-user moves) and scope it.
- **`keep_forever` + engagement-aware, age-based eviction**, with admin-visible storage breakdown, per-user quotas, and an instance cap.
- **Unsend-until-watched** rule; inbox with read receipts; FYP = "sent to me and unwatched".
- **Threaded comments** returned as a server-built tree; one-emoji-per-user reactions; watch progress with history filters.
- **Pluggable push notifiers** (ntfy and Gotify for self-hosters, FCM/APNs for mobile) with per-user event opt-in. Pair with a WebSocket channel for in-app realtime, and unify event names.
- **Admin activity/audit log** with filterable query, actor email join, and JSON metadata.
- **Fire-and-forget S3 orphan cleanup** when the DB write fails after the upload (VID-148), ideally backed by a sweeper.
- **Boot-time migration verification** (fail fast if the schema is missing).
- **Operational posture:** non-root, read-only rootfs, cap-drop, Caddy auto-TLS, localhost-bound ports, JSON logs, health check, GHCR publish, Trivy scan, security checklist, backup-rotation recipe.
- **Cursor-based feed pagination**, but use a composite (`created_at`, `id`) cursor at full precision.

### 11.2 Bugs, security issues and pitfalls (lessons)

**Critical / launch-blocking**
1. Prod compose leaks dev secrets: base `environment:` overrides `env_file:`, so the prod JWT secret is the public default and admin tokens can be forged (`docker-compose.yml` api env; `docker-compose.prod.yml`). There is also no startup check refusing the default secret.
2. A refresh token is accepted as an access token everywhere, because there is no `kind` check (`middleware/auth.go`, `handler/ws.go:360`).
3. Logout is a no-op; there is no server-side session revocation.
4. Suspended/disabled status is never enforced; the role is trusted from a possibly stale JWT.
5. OAuth `state` = raw user id with an unauthenticated callback, enabling account-linking CSRF. OAuth tokens are stored in plaintext.
6. No object-level authorization: any user can read, stream or interact with any video, and the main feed exposes all users' videos. Block does not hide content.
7. Link import is broken by default: `DownloadTimeout` fallback `30*60` is nanoseconds **[verified]**. Lesson: use typed durations (`30*time.Minute`) and test config defaults.
8. WebSocket is dead: hub `Run()` is never called, and the logging middleware's wrapper drops `http.Hijacker` **[verified]**. Lesson: response-writer wrappers must preserve optional interfaces (`Hijacker`, `Flusher`) or use `http.ResponseController`. Wire-level tests must go through the real router.
9. Push `Notify` is never called; FCM/APNs are stubs. The feature looks complete in docs and unit tests but does nothing.
10. Playlist import fails on NULL scan and never downloads items. Collections are schema-only despite the commit claim.

**High**
1. Upload dedup context is cancelled on handler return (`defer dupCancel()` before `go …`).
2. The pHash placeholder on ffmpeg failure makes all failed videos "duplicates" of each other. It also hashes the first frame only and labels hashes with the wrong algorithm when HASH_TYPE changes.
3. `MergeSocial` moves comments and inbox items onto another user's video, a privacy and data-ownership violation. Cascade deletion of the canonical destroys other users' data. Unique-conflict aborts the merge.
4. Rate limiter keyed on `RemoteAddr` (includes port), applied before auth. It is effectively no limit, and there is no login brute-force protection.
5. Route/handler path-param mismatches break `DELETE /api/videos/{id}/download` (`downloadId`) and `DELETE /api/videos/{id}/comments/{commentId}` (`id`). Lesson: route-level tests.
6. Streaming proxies the whole file without Range support, under a 30 s `WriteTimeout`. Uploads are subject to a 10 s `ReadTimeout`, a 100 MB in-memory multipart limit vs a 256 MB container limit, and a 64 MB `/tmp` tmpfs in prod (also the yt-dlp output dir).
7. Thumbnails and files are referenced by internal S3 URLs with no presigning or serving endpoint, so clients cannot display thumbnails.
8. Storage accounting drift: `storage_used` is only incremented on upload, never decremented, and not counted for link imports. Instance quota is a SUM of that drifting value. Admin user delete orphans S3 objects.
9. Eviction still evicts `processing` videos; SELECT and UPDATE are separate queries (race); the strategy config is ignored.
10. Downloads run as unbounded goroutines with an in-memory job map: lost on restart, temp files never deleted, no concurrency cap.

**Medium / low**
1. Login is not case-normalized for email.
2. `expires_in` is hard-coded to 900; the refresh DB expiry is hard-coded to 7 days.
3. Refresh rotation is non-transactional.
4. Feed cursor uses RFC3339 seconds precision and compares a string to timestamptz, so items are skipped or duplicated within the same second. Invalid cursors are silently ignored.
5. `NOT IN (subquery)` and full-table `GROUP BY` count subqueries on every feed request don't scale. Dedup does a full hash table scan in Go per video.
6. `omitempty` on counts and booleans hides zero values (`like_count`, `liked`).
7. Health endpoint leaks DB errors; OAuth reflects upstream errors; the WS payload leaks file paths; the audit IP trusts `X-Forwarded-For`.
8. WS token in the query string ends up in Caddy access logs. `CheckOrigin` always returns true.
9. Activity log can't record actor-less events (an empty string is inserted into the UUID column).
10. Migration 000009 was edited after creation (`5f5ae7f`), which breaks golang-migrate guarantees on existing DBs.
11. Import job JSON has no tags (Go field names leak to the API).
12. Committed stale 18 MB binary `server` (`vidflow.ai/backend`); `.gitignore` ignores `/vidflow-server`, not `/server`.
13. Naming drift: VidFlow vs VidFriends across LICENSE, `.gitignore`, the VID-152 note and the binary.
14. CI/publish target `main` while the repo uses `master`. The Trivy scan is non-blocking.
15. Docs and completion notes claim verification that the code contradicts (e.g. VID-277 "removed processing", VID-441 "collections router, handler"). AI-agent self-reports were not trustworthy evidence; **require executable acceptance tests** in the rebuild.

---

## 12. Contradictions between docs and code

| # | Doc claim | Code reality |
|---|---|---|
| 1 | Decision doc / VID-152: "Exact-match dedup (same URL, same file hash) is already implemented"; pHash "deferred to v0.2" | No SHA-256 or URL dedup on upload or link (only the importer's per-user `source_url` skip). pHash is implemented and wired (`hash/phash.go`, `main.go:78`, `video.go:1069`). The FAQ describes pHash as live. |
| 2 | Decision doc cites `migrations/000014_create_duplicate_groups` | It is `000016_create_duplicate_groups`; 000014 is reactions. |
| 3 | Decision doc: canonical = `work/vidfriends/`; VID-152 note: `work/vidflow/` | Naming drift; LICENSE says "VidFlow Inc.". |
| 4 | FAQ: "earliest uploaded video in the group is canonical"; "When someone watches a duplicate, they see the canonical version instead" | Canonical = closest-hash match; no playback redirection. |
| 5 | FAQ / user guide: notifications for new video, like, comment, friend request via push and WebSocket | Push `Notify` has no callers; the WebSocket hub is never run and upgrades fail; like/comment/friend events are never emitted. |
| 6 | User guide: delete own comments (implied); unsend "only if your friend has not watched it yet" | Comment delete route broken. Unsend is keyed by send id and blocked by *any* watch of that video by the recipient. |
| 7 | Admin setup: suspended "Cannot log in until reinstated"; disabled "Permanently disabled" | Status never checked. |
| 8 | Admin setup: stats return "total videos, storage used, total users, and active users (last 24h)"; OpenAPI `AdminStatsResponse` = `total_videos,total_storage,total_users,active_users_today` | Code returns `total_videos,total_users,total_likes,total_comments,total_storage_bytes,storage_quota_bytes,storage_usage_pct` (`admin.go:32-40`). `last_active_at` is never written, so "active users" is impossible. |
| 9 | Admin setup / FAQ: eviction criteria "older than 90 days, zero likes, zero comments" | Also excludes `keep_forever` and includes `processing`; age is configurable. VID-277 claims `processing` was removed. |
| 10 | Admin setup: tracked actions (update, delete user, eviction, invite) | Also `admin_delete_video`. |
| 11 | Deployment / security docs: rate limiting "per user (authenticated) and per IP" | Always keyed by `RemoteAddr` including the port. |
| 12 | Security checklist: no hard-coded prod secrets; sensitive errors not leaked | Base compose hard-codes secrets that override prod `env_file`; health/OAuth leak errors. |
| 13 | Deployment doc: `VIDFRIENDS_YTDLP_DOWNLOAD_TIMEOUT` default `30m` | Code default is 1.8 µs. |
| 14 | Deployment doc config reference | Missing `S3_REGION`, `S3_PATH_STYLE`, `ALLOW_PUBLIC_SIGNUP`, `EVICTION_*`, `MAX_STORAGE_BYTES`, `MAX_UPLOAD_SIZE`, `HASH_TYPE`, `JWT_REFRESH_EXPIRY` in the example `.env`, `YOUTUBE_*`, `GITHUB_*`. |
| 15 | Deployment doc: Prometheus/Grafana monitoring | No metrics endpoint. |
| 16 | Deployment doc: `git pull origin main`; CI badge and workflows on `main` | Branch is `master`; workflows never trigger on push. |
| 17 | README endpoint table (~25 routes) / project structure | 60+ routes; many packages omitted; `/api/ws` listed as no-auth. |
| 18 | README: integration tests verify the full stack in CI | The suite cannot pass at HEAD (§9.2), and CI doesn't run on master pushes. |
| 19 | OpenAPI `POST /api/videos/{id}/comments` | Router: `POST /api/videos/{id}/comment` (singular). |
| 20 | OpenAPI `DELETE /api/videos/{id}/download` "id = Download ID" | Route param is the video id slot; the handler reads a nonexistent `downloadId`. |
| 21 | OpenAPI omissions | `POST /api/auth/logout`, `PUT /api/auth/profile`, `GET /api/users/{id}/profile`, `GET /api/users/{id}/videos`, all `/api/oauth/*` (6), all `/api/import*` (4). Servers list `https://api.vidfriends.ai` despite the self-host positioning. |
| 22 | OpenAPI WS: server pushes likes, comments, friend requests, new videos, duplicates | Only `download_complete`, `duplicate_detected` and `import_progress` are emitted (and none are delivered). |
| 23 | Commit `99b251b`: "Add collections (migrations 019, router, handler)… import workflow" | No collections handler or routes; import never downloads and fails on create. |
| 24 | Commit `466b658`: FAQ/OpenAPI updated plus `.issue-complete/VID-355-completion.md` | That file documents VID-355 (core migration), not VID-356. |
| 25 | VID-161 / VID-148 line references | Stale after later edits. |
| 26 | FAQ: "Automatic per-user quota enforcement is under development (VID-156)" | Per-user `upload_quota_bytes` *is* enforced for direct uploads (VID-314). Not for link/import. |
| 27 | User guide / admin docs "Applies to v1.0+"; OpenAPI 1.0.0 | Decision doc "v0.1"; commit "Alpha release prep". |
| 28 | `.env.example` comment: GitHub App for "backend agents/systems" | Not used by the server at all (agent tooling). |
| 29 | Docs: "VidFriends Inc." (README); `LICENSE`: "VidFlow Inc." | Legal entity naming inconsistent. |
