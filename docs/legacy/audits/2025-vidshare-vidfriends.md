# Legacy Code Audit: `zemdregon/vidshare` and `zemdregon/vidfriends`

Audit date: 2026-10-03. Auditor: read-only review of the two git clones under `C:\Users\ai\Documents\claude\vidfriends-merge\src\`. Neither repo was modified.

Paths are repo-relative unless stated. "HEAD" means `main` at the time of audit:
- vidshare HEAD = `b2cdd34` (2025-09-24), 87 commits.
- vidfriends HEAD = `37af78d` (2025-09-26), 153 commits.

Status labels used in the feature inventories:
- **impl+tested**: code exists and at least one automated test exercises it.
- **impl-untested**: code exists, but no automated test covers it.
- **broken**: code exists but cannot work end to end as wired (reason given).
- **stubbed**: there is a placeholder or no-op.
- **planned-only**: a doc or the UI mentions it, but no backend code exists.

The doc writer should know about three bodies of code:
1. **vidshare legacy (Cloudflare Worker era)**: commits `b165c42`..`8df7d4d`, 2025-09-07 to about 2025-09-24. This code was **deleted** in `340e9c0`, but it is the most feature-rich product and the best statement of intent. I extracted it from git history (`git show 8df7d4d:worker.js` and so on).
2. **vidshare current (Go + React)**: one-shot rewrite in `340e9c0` (2025-09-24), merged as PR #2.
3. **vidfriends**: a separate repo started 2025-09-24. It was built almost entirely by Codex agent PRs (#1 to #77) that worked through `TODO.md` and `ROADMAP_TODO.md`.

---

## 0. Unmerged branches check

| Repo | Remote branch | Unique commits vs `main` | Verdict |
|---|---|---|---|
| vidshare | `origin/codex/add-basic-login-page-to-worker.js` | **0** (`git log main..branch` is empty; merged as PR #1 at `f32ad00`) | No unique work. |
| vidfriends | `origin/codex/complete-next-item-in-roadmap_todo.md` | **0** (merged) | No unique work. |
| vidfriends | 18 `origin/dependabot/*` branches | Dependency bumps only (aws-sdk, cockroach-go, uuid, vite 7.1.12, react-router 7.9.4, testing-library, actions/*) | Ignored as instructed. |

**Conclusion:** neither repo has unmerged feature work. In vidshare, the only "hidden" work is the deleted Worker implementation in history (section A).

---

# PART A: vidshare

## A.1 Product intent

### Legacy statement (deleted README at `8df7d4d:README.md`)
This is the clearest product vision across both repos:
- > "vidfriends.app is a pwa that has logins for users, and builds users an fyp that only contains videos sent from friends"
- It can process videos from "tiktok, facebook reels, instagram reels, youtube shorts, etc."
- It is designed "with minimal server load in mind". Initially it embedded videos client-side, with a future plan for "server side compute to extract videos rather than embedding them".
- "users can react to videos and send replies, and get notified when new videos are sent to them."
- **Privacy goal:** "privacy focused, storing little to no data on users, allowing flexible login types such as username/password and social logins to choose the level of privacy."
- **Cost/infra goal:** run everything on the Cloudflare free tier, and expand to paid tiers if needed. "no ads, but may eventually charge a subscription". "will probably move to native app before this happens."
- Domain: `vidfriends.app`. Assets were served from `assets.vidfriends.app`.

### Current statement (`README.md` at HEAD)
- "a containerised full-stack application for sharing short-form videos with friends". Go + PostgreSQL + `yt-dlp` for metadata, with a React + TypeScript frontend.
- The README feature list: registration and session auth; mutual friends; share videos with notes and get a personalised feed; `yt-dlp` metadata; Docker Compose.
- License claimed: MIT (`README.md` "License" section). **No LICENSE file exists in the repo.**
- No goals, non-goals, roadmap or TODO documents exist at HEAD.

### Commit narrative
- 2025-09-07/08: initial commit, then Cloudflare bindings docs and `d1-database-layout.txt`.
- 2025-09-09: `worker.js`, PBKDF2 hashing (PR #1, Codex), "Send Video" UI, reactions, a `watched_at` column, TikTok embeds, then about 25 "working on passkey" commits, R2 bucket, and "switch to password authentication" (`7041e52`).
- 2025-09-10 onward: server secret store, embed removal ("removed embed remenance" `84157c3`, after which videos were downloaded to R2 instead), VAPID push notifications, welcome screen, scroll ("FYP") UI overhauls, thumbnails, and splitting `worker.js` into `src/*.js` modules. The last legacy commits are "working on errors" and "working on passkeys" (`8df7d4d`, `a271148`).
- 2025-09-24: `340e9c0` "Rebuild VidShare as containerized Go + React stack" (Codex PR #2). It deleted every Worker file. The new stack covers a much smaller feature set.

## A.2 Feature inventory

### A.2.1 Current Go + React stack (HEAD)

There are **no automated tests in the repo** (`find -name "*_test.go"` finds nothing, and the frontend has no test runner). The README still claims "Go unit tests: `cd backend && go test ./...`". Every feature below is therefore impl-untested at best.

| Capability | Status | Evidence |
|---|---|---|
| Sign up (username + password) | impl-untested | `backend/internal/handlers/handlers.go` `handleSignup`; `frontend/src/App.tsx` `handleSignup` |
| Login, which sets a session cookie | impl-untested | `handleLogin`, `setSessionCookie` |
| Logout | impl-untested | `handleLogout` |
| Current user (`/api/me`) | impl-untested | `handleMe` |
| Add friend by username (instant, mutual, no consent) | impl-untested | `handleAddFriend`, which calls `UpsertFriendship` in both directions |
| List friends | impl-untested | `handleListFriends`, `db.ListFriends` |
| Share a URL to one or more recipient usernames with a note | impl-untested | `handleShare` |
| `yt-dlp` metadata lookup (title, description, duration, thumbnail) | impl-untested | `backend/internal/yt/client.go` `Fetch` |
| Per-user video quota (default 500) | impl-untested | `config.MaxVideoPerUser` (env `MAX_VIDEOS_PER_USER`) and the check in `handleShare` |
| Inbox feed of shares received | impl-untested | `handleFeed`, `db.ListSharesForUser` |
| Playback | **not in-app**: a "Watch video" link opens the original URL | `App.tsx` feed `<a href={item.video?.url}>` |
| Health check | impl-untested | `GET /healthz` |
| Reactions, comments, saved, history, notifications, unfriend, block, passkeys | **absent**. These existed only in the legacy Worker. | n/a |

### A.2.2 Legacy Cloudflare Worker (deleted; `8df7d4d:worker.js` plus `src/*.js`)

This code was implemented but never tested. It ran on Cloudflare Workers with a D1 database and R2 storage. I list it because it is the richest prior art for the product.

| Capability | Status in history | Evidence (`8df7d4d:` paths) |
|---|---|---|
| Username/password signup and login with PBKDF2 hashing | implemented | `worker.js` `handleSignup`, `handleLogin`, `hashPassword` |
| Short-lived JWT (15 min, HS256) plus rotating refresh token (60 days) plus session row | implemented | `createJWT`, `handleRefresh` |
| Passkeys (WebAuthn register/login, with a hand-written CBOR/COSE parser) | implemented, but the final commits say it was still being debugged | `handlePasskeyRegisterOptions/Verify`, `handlePasskeyAuthOptions/Verify`, `cborDecode`, `coseToJwk`; `src/welcomePage.js` |
| One-time code login | **stub**: the button navigates to `/login/code`, which has no route | `src/welcomePage.js` `codeLogin()` |
| Friend requests: pending, then accepted or declined; also remove and block | implemented | `handleFriendAdd`, `handleFriendRespond`, `handleFriendRemove`, `handleFriendBlock` |
| Send a video link to one accepted friend | implemented | `handleLinkSend` |
| Server-side download of the video to R2 through an external download API | implemented | `handleLinkSend` POSTs to `DOWNLOAD_API_URL` (`https://api-request.zem.systems/download`) with `{url, filename: <linkId>.mp4}`. Playback then uses `https://assets.vidfriends.app/videos/<linkId>.mp4`. |
| Thumbnail posters | implemented (in the UI) | `src/scrollPage.js` poster `https://assets.vidfriends.app/thumbnails/<id>.webp` |
| Full-screen vertical "scroll" FYP of received videos | implemented | `handleScroll`, `src/scrollPage.js` (play/pause FAB, reaction panel) |
| Reactions (one emoji **or** free-text reply per link, by the recipient) | implemented | `handleLinkReact` writes `links.reaction` and notifies the sender |
| Unsend (sender deletes a link) | implemented | `handleLinkUnsend` |
| Save/unsave (recipient) | implemented | `handleLinkSave` |
| Watched tracking (`watched`, `watched_at`) | implemented | `handleLinkWatched`, `handleLinkOpen` |
| Inbox retention rule | implemented | `fetchInboxLinks`: inbox shows links that are saved, OR unwatched, OR watched within the last 48 h (172800 s), oldest first, limit 50 |
| History page (watched more than 48 h ago and not saved) | implemented | `fetchHistoryLinks`, `historyPage` |
| Saved page | implemented | `fetchSavedLinks`, `savedPage` |
| "Videos you sent" list showing watched state and reaction | implemented | `fetchSentLinks`, `src/homePage.js` |
| Web Push notifications (VAPID) when a video is ready and when a reaction arrives | implemented | `handlePushSubscribe`, `sendPushToUser`, `createNotification`; the `/sw.js` service worker fetches `/push/inbox` on each push |
| PWA (manifest plus offline navigation fallback) | implemented | `/site.webmanifest`, `/sw.js` in `worker.js` |
| Download a video file | implemented | `<a download>` on the scroll page |
| Social logins (Apple ID, Discord, GitHub), email+password, phone SMS | **planned-only** | The `credentials.type` enum in `d1-database-layout.txt`. No code. |
| Avatars | planned-only | `users.avatar_url` in the D1 layout. No upload code. |
| Embeds (TikTok, etc.) | removed | Added in `2ec917a`, removed in `84157c3`. |

## A.3 Domain and data model

### A.3.1 Current: `backend/migrations/001_init.sql` (PostgreSQL 15)

**`users`**
- `id SERIAL PK`
- `username TEXT NOT NULL UNIQUE` (case-sensitive)
- `password_hash TEXT NOT NULL` (bcrypt)
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

**`sessions`**
- `id SERIAL PK`
- `user_id INTEGER NOT NULL FK→users ON DELETE CASCADE`
- `token TEXT NOT NULL UNIQUE` (raw bearer token stored in plaintext)
- `expires_at TIMESTAMPTZ NOT NULL`
- `created_at`
- Index `idx_sessions_token`, which is redundant with the UNIQUE constraint.

**`videos`**
- `id SERIAL PK`
- `owner_id INTEGER NOT NULL FK→users CASCADE`
- `url TEXT NOT NULL`
- `title TEXT NOT NULL`
- `thumbnail_url TEXT` (nullable)
- `duration_seconds INTEGER NOT NULL DEFAULT 0`
- `description TEXT` (nullable)
- `created_at`
- Index `idx_video_owner`.
- No uniqueness: **every share creates a new `videos` row**, even for the same URL.

**`video_shares`**
- `id SERIAL PK`
- `video_id FK→videos CASCADE`
- `sender_id FK→users CASCADE`
- `target_id FK→users CASCADE`
- `note TEXT` (nullable)
- `created_at`
- Index `idx_video_shares_target`.

**`friendships`**
- `(user_id, friend_id)` composite PK, both FK→users CASCADE
- `created_at`
- Directed rows. Mutuality comes from inserting both directions (`handlers.go` `handleAddFriend`).
- No status column and no self-check. Signup deliberately inserts a **self-friendship** (`handleSignup`: "Auto-add self to friend list for convenience").

Other model notes:
- Go models are in `backend/internal/models/models.go`: `User`, `Session`, `Video`, `Share`. `Share` embeds `*Video` and `*User` for feed responses.
- **Migrations:** `backend/internal/db/migrate.go` `RunMigrations` re-executes **every** `.sql` file on every startup, inside one transaction. It has no version table and relies entirely on `IF NOT EXISTS`. Any non-idempotent future migration would break startup.

### A.3.2 Legacy: Cloudflare D1 (SQLite), from `8df7d4d:d1-database-layout.txt` and `worker.js`

**`users`**
- `id` (TEXT UUID)
- `username`
- `avatar_url`
- `created_at`, `last_login` (epoch seconds)
- Username uniqueness was checked case-insensitively in code (`lower(username)`).

**`credentials`**
- Columns: `id`, `user_id`, `type`, `identifier`, `external_id`, `secret_hash`, `public_key` (blob; code stores a JWK JSON string), `sign_count`, `created_at`, `last_used`.
- `type` is one of `username_pw|email_pw|phone_sms|passkey|appleid|discord|github`.
- `external_id` holds the passkey credential ID or a social `sub`.
- `secret_hash` holds a PBKDF2 hash for password types.
- This is a good multi-credential identity design.

**`sessions`**
- Columns: `id`, `user_id`, `refresh_hash` (SHA-256 of the refresh token, base64), `created_at`, `expires_at` (+60 d), `user_agent`, `last_rotated_at`, `rotation_count`.

**`friendships`**
- Columns: `id`, `initiating_user`, `receiving_user`, `status`, `blocked_by`, `created_at`, `updated_at`.
- `status` is one of `pending|accepted|declined|blocked`.

**`links`** (one row per sender→recipient share)
- Columns: `id`, `url`, `sender_id`, `recipient_id`, `created_at`, `watched` (0/1), `saved` (0/1), `reaction` (an emoji or a text message), `title`, `thumbnail_url`, `watched_at`.

**`push_subscriptions`** (created lazily by `ensurePushTables`)
- Columns: `id`, `user_id`, `endpoint`, `p256dh`, `auth`, `created_at`.

**`notifications`** (created lazily)
- Columns: `id`, `user_id`, `title`, `body`, `data` (JSON), `delivered` (0/1), `created_at`.

## A.4 API surface

### A.4.1 Current Go API (`backend/internal/handlers/handlers.go` `Router`, chi v5)

**Conventions:**
- Bodies are JSON, read through `decodeJSON`: 1 MiB limit with **`DisallowUnknownFields`**.
- Errors use the shape `{"error": "<message>"}`, built by `respondError`. Raw internal error strings, including DB and `yt-dlp` errors, are returned to clients.
- Auth is the cookie `vidshare_session`, checked by the `requireAuth` middleware.

| Method | Path | Auth | Request | Success | Errors |
|---|---|---|---|---|---|
| GET | `/healthz` | none | none | `200` with text `ok` | none |
| POST | `/api/signup` | none | `{username, password}` | `201 {user:{id,username,createdAt}}`. Does **not** log in. | 400 bad JSON or empty fields; 409 "username already exists" (detected by matching the string `"duplicate key"`); 500 |
| POST | `/api/login` | none | `{username, password}` | `200 {user}` plus a `Set-Cookie` for a 30-day session | 400; 401 "invalid credentials" |
| POST | `/api/logout` | cookie (optional) | none | `204`. Deletes the session row and clears the cookie. | none |
| GET | `/api/me` | cookie | none | `200 {user}` | 401 "missing session" or "session expired"; 500 |
| GET | `/api/friends` | cookie | none | `200 {friends:[{id,username,createdAt}]}`, ordered by username. Includes **self**. | 401; 500 |
| POST | `/api/friends` | cookie | `{username}` | `200 {friend:{...}}`. Creates a mutual friendship immediately. | 400; 404 "user not found"; 500 |
| GET | `/api/feed` | cookie | none | `200 {shares:[{id,note,createdAt,senderId,targetId,video:{id,ownerId,url,title,thumbnail,duration,description,createdAt},sender:{id,username}}]}`, newest first, **no pagination** | 401; 500 |
| POST | `/api/share` | cookie | `{url, recipients:[username], note}` | `201 {video, shares:[...]}` | 400 when the url is empty or there are no recipients; 429 "video quota exceeded"; 502 for any `yt-dlp` failure (the raw error is returned); 404 "recipient X not found" (returned **after** the video row is already created and earlier recipients already received shares, so the result is partial); 500 |

Other API notes:
- **CORS:** `cors.Handler` with `AllowedOrigins = ALLOW_ORIGINS` and `AllowOriginFunc = len(allowed)==0`. In go-chi/cors, a non-nil `AllowOriginFunc` takes precedence over the list. The result is: when `ALLOW_ORIGINS` is set, **no origin is allowed**; when it is unset, **every origin is allowed with credentials**. (I reasoned this from the library's semantics and did not run it.) In the default compose setup the frontend is served same-origin through `/api` in dev, so the bug is masked in dev only.
- Allowed methods are GET, POST and OPTIONS. There are no PUT, PATCH or DELETE endpoints, so nothing can be unfriended or deleted.

### A.4.2 Legacy Worker routes (`8df7d4d:worker.js`, `export default.fetch`)

The Worker returned HTML pages (server-rendered template strings) and used form POSTs that redirect with 302. JSON is used only for the passkey and push endpoints.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/`, `/scroll`, `/saved`, `/history` | JWT cookie, falling back to the session cookie | HTML pages. `/` has a `?tab=` parameter. Anonymous users get the welcome page. |
| GET | `/login`, `/signup` | none | Welcome page (passkey-first UI) |
| POST | `/login`, `/signup` | none | Form fields `username`, `password`. Returns 302 to `/` and sets the `session`, `jwt` and `refresh` cookies. |
| POST | `/logout` | cookie | Deletes the session |
| POST | `/auth/refresh` | `refresh` cookie | Rotates the refresh token and reissues the JWT. Returns 204. |
| POST | `/passkeys/register/options`, `/passkeys/register/verify`, `/passkeys/auth/options`, `/passkeys/auth/verify` | mixed | WebAuthn. Challenges are kept in short-lived httpOnly cookies (`pkc_reg`, `pkc_auth`, 300 s). |
| GET | `/push/vapid` | none | `{publicKey}` |
| POST | `/push/subscribe` | auth | Body is a browser PushSubscription. Upserts by endpoint. |
| GET | `/push/inbox` | auth | Returns undelivered notifications and marks them delivered |
| POST | `/friends/add` | auth | Field `friend_username`. Creates a pending request. Rejects self and rejects any existing row, including declined or blocked ones. |
| POST | `/friends/respond` | auth | Fields `other_user_id`, `action=accept\|decline`. Only the receiver of a pending request can act. |
| POST | `/friends/remove` | auth | Deletes an accepted friendship |
| POST | `/friends/block` | auth | Sets `status=blocked` and `blocked_by`, or inserts a blocked row |
| POST | `/links/send` | auth | Fields `video_url`, `recipient_id`. Requires an http(s) URL, not self, and an **accepted** friendship. Starts the external download and a notification poll. |
| POST | `/links/react` | auth (recipient only) | Field `reaction` (emoji) or `reaction_text`. Notifies the sender. |
| POST | `/links/unsend` | auth (sender) | Deletes the link |
| POST | `/links/save` | auth (recipient) | Field `set=1\|0`, or omit it to toggle |
| POST | `/links/watched` | auth (recipient) | Returns 204 |
| GET | `/links/open?id=` | optional | Marks the link watched when the caller is the recipient, then 302-redirects to the original URL |
| POST | `/share` | **NONE** | JSON `{sender, recipient, url}` inserted directly into `links`. **Unauthenticated impersonation hole**: anyone could send links as anyone. |
| GET | `/site.webmanifest`, `/sw.js`, favicons | none | PWA assets. Favicons redirect to `assets.vidfriends.app`. |

## A.5 Auth, session, security and privacy

### Current stack
- **Password hashing:** bcrypt at `DefaultCost` (`backend/internal/auth/password.go`). There is no password policy or minimum length.
- **Sessions:**
  - A 32-byte random token is base64url-encoded (`util.RandomToken`) and stored **in plaintext** in `sessions.token`.
  - Sessions last 30 days and do not slide.
  - The cookie is `vidshare_session`: `HttpOnly`, `SameSite=Lax`, `Path=/`, **no `Secure` flag**.
  - Expired sessions are rejected but never deleted, and there is no cleanup job.
- **`SESSION_SECRET` is required by `config.Load` but never used** for signing or anything else.
- **CSRF:** there is no token and the code relies only on SameSite=Lax. Because all mutations are JSON POSTs and the frontend is same-origin, the risk is moderate. Combined with the CORS bug above (any origin allowed with credentials when `ALLOW_ORIGINS` is empty), credentialed cross-site requests become possible.
- **Rate limiting:** none, either on login or on `/api/share`, which spawns `yt-dlp` processes.
- **Username enumeration:** signup returns 409 for taken names, and add-friend returns 404 for unknown names.
- **`yt-dlp` invocation** (`backend/internal/yt/client.go`):
  - The user-supplied URL is passed as a positional argument with no `--` separator and no scheme validation. A URL beginning with `-` would be parsed as a yt-dlp option, which is an argument-injection risk; `--exec` is particularly dangerous.
  - Arbitrary URLs mean SSRF via yt-dlp.
  - `cmd.Env` is set to only `PYTHONIOENCODING`, so PATH and HOME are cleared for the child process.
- **Privacy:** the only PII is the username. Friend lists and share notes are visible only to participants, but anyone can add anyone as a friend without consent and then push content into that person's feed. **Sharing to a username also auto-creates a mutual friendship** (`handleShare` calls `UpsertFriendship` for each recipient), so any user can friend and spam any other user.

### Legacy Worker
- **PBKDF2-SHA256** with 100k iterations and a 16-byte salt, stored as `salt:hash`, with a timing-safe compare (`hashPassword`, `verifyPassword`).
- **Access JWT:** HS256 with a 15-minute expiry, signed with `env.JWT_SECRET`, **falling back to the literal `'dev-secret'`** (`createJWT`, `verifyJWT`).
- **Refresh token:** 60 days, stored as a SHA-256 hash, and rotated on each refresh with `rotation_count`. This is a good pattern.
- **Weaknesses:**
  - The `session` cookie value is the session UUID itself, and `getAuthUser` accepts it as a fallback **without checking `expires_at`**. It is a non-expiring bearer credential.
  - No cookie had `Secure`.
  - There was no CSRF protection on form POSTs.
  - The `/share` endpoint was unauthenticated.
  - Passkey verification did not check the UP/UV flags or that the signCount increases.
  - `rpId` and origin were derived from the request URL.
- **Security headers** (`applySecurityHeaders`): `Permissions-Policy` (most features disabled), `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`.
- **Secrets hygiene:** `wrangler.toml` in history (`8df7d4d:wrangler.toml`) contains `VAPID_PUBLIC_KEY`, **`VAPID_PRIVATE_KEY`** and `VAPID_SUBJECT` as plain `[vars]`, plus the D1 database ID and the secrets-store ID. **The VAPID private key is committed in git history and should be treated as compromised.** I did not reproduce the values here.

## A.6 Video handling

**Current stack:**
- **Ingestion:** the user pastes a URL. `yt-dlp --skip-download --no-warnings --dump-json <url>` runs **synchronously in the request**, with a 25 s timeout inside a 30 s request context; the HTTP server `WriteTimeout` is 30 s (`cmd/server/main.go`). There is no download, no storage and no processing.
- **Metadata stored:** title, description, `thumbnail_url` (a hotlinked provider URL) and `duration_seconds` (rounded). The thumbnail is hotlinked in the feed `<img>`.
- **Playback:** an external link to the original URL.
- **Docker:** `backend/Dockerfile` downloads the **latest** yt-dlp release binary with curl at build time. It is unpinned and has no checksum.

**Legacy Worker:**
- After a link is stored, the Worker POSTs `{url, filename}` to an **external download service** (`DOWNLOAD_API_URL`, `api-request.zem.systems`). That service is not in either repo.
- The service is expected to write `videos/<linkId>.mp4` (and `thumbnails/<linkId>.webp`) to the R2 bucket `vidshare`, which is served from `assets.vidfriends.app`.
- The Worker then polls with `HEAD` 8 times, 3 s apart (about 24 s), using `ctx.waitUntil`. When the asset exists it creates a notification and sends a push.
- Playback is an in-app `<video>` (autoplay muted playsinline) from R2. The service worker caches non-video assets.

## A.7 Social model and business rules

**Current stack:**
- Friendship is an instant, symmetric, consent-free relationship that cannot be removed. It is created by `POST /api/friends` or implicitly by sharing.
- Self-friendship is created at signup.
- A share is one URL to N recipients identified by username. One `videos` row is created per share call, plus one `video_shares` row per recipient.
- There is no requirement that recipients are friends, because friendship is auto-created.
- The quota is 500 `videos` rows per owner. The count-then-insert is not atomic.
- The feed lists only shares **targeted at me** (an inbox), not a friends' activity feed.
- There are no reactions, comments, likes, read state or deletion.

**Legacy Worker** (richest rule set):
- **Friend request state machine:**
  - none → `pending` (initiator)
  - `pending` → `accepted` | `declined` (receiver only)
  - `accepted` → deleted (either party, "remove")
  - any → `blocked` (either party; `blocked_by` is recorded)
  - A declined or blocked pair cannot be re-requested ("Friendship already exists").
  - Self-requests are rejected.
  - Usernames are matched case-insensitively.
- **Sending** requires an accepted friendship and an http(s) URL, and sending to self is rejected. Sends go to one recipient per action.
- **Link lifecycle:**
  - unwatched → watched (on open or `watched`)
  - The recipient can save or unsave.
  - The recipient can set one reaction (emoji or text). Reacting again overwrites it.
  - The sender can unsend, which hard-deletes the link.
- **Visibility windows:**
  - Inbox = saved OR unwatched OR watched less than 48 h ago.
  - History = watched more than 48 h ago and not saved.
  - Saved = saved.
- **Notifications:**
  - "New video received" goes to the recipient once the asset is available.
  - "Reaction received" goes to the sender.
  - Delivery uses a payload-less Web Push. The service worker then pulls `/push/inbox`.

## A.8 Architecture and stack

**Current stack:**
- **Backend:** Go 1.22 with chi v5, go-chi/cors, pgx v5 (pgxpool) and `golang.org/x/crypto/bcrypt` (`backend/go.mod`, module `github.com/TheMinecraftGuyGuru/vidshare/backend`).
  - Layout: `cmd/server`, `internal/{auth,config,db,handlers,models,util,yt}`.
  - Graceful shutdown on SIGINT/SIGTERM.
- **DB:** PostgreSQL 15 (`docker-compose.yml` `postgres:15-alpine`).
- **Frontend:** React 18 with Vite 5 (`@vitejs/plugin-react-swc`) and TypeScript.
  - It is a single component, `frontend/src/App.tsx`, with no router and no state library. The API client is `frontend/src/api.ts`.
  - It is styled with a dark theme in `frontend/src/styles.css`.
- **Environment variables** (`backend/internal/config/config.go`):

  | Variable | Required/default |
  |---|---|
  | `DATABASE_URL` | required |
  | `SESSION_SECRET` | required but unused |
  | `LISTEN_ADDRESS` | `:8080` |
  | `ALLOW_ORIGINS` | comma-separated list |
  | `YT_EXECUTABLE` | `yt-dlp` |
  | `MAX_VIDEOS_PER_USER` | 500 |
  | `VITE_API_BASE` | frontend; default `/` |

- **Deploy:** `docker-compose.yml` defines `db`, `backend` (port 8080) and `frontend` (nginx, 5173→80). `backend/Dockerfile` (golang:1.22 → debian-slim plus yt-dlp) and `frontend/Dockerfile` (node 20 → nginx 1.25).
  - **Compose wiring gap:** the nginx container uses the default config with **no `/api` proxy**, and `VITE_API_BASE` is not set at build time. The built SPA therefore calls `http://localhost:5173/api/...`, which nginx answers with 404. The containerised stack cannot work as shipped; only the Vite dev server proxies `/api` (`frontend/vite.config.ts`).
- **CI:** none. There is no `.github` directory.

**Legacy stack:**
- Cloudflare Worker (`wrangler.toml`, compatibility date 2025-09-09).
- D1 binding `vidshare`, R2 binding `assets` (bucket `vidshare`) and a Secrets Store binding `serverpass`.
- Server-rendered HTML from template-literal modules: `src/base.js`, `homePage.js`, `scrollPage.js`, `welcomePage.js`.
- An inline PWA manifest and service worker.

## A.9 Tests

- The current stack has **no tests at all**.
- Both Go backends **compile** (`go build ./...` succeeded under Go 1.27 on this machine; I did not run frontend builds).
- The legacy Worker had no tests.

## A.10 Planning docs

| Doc | Status claimed | Assessment |
|---|---|---|
| `README.md` (HEAD) | Describes the Go/React stack | Mostly accurate. It is wrong about Go unit tests (none exist) and the MIT license (no file). It implies compose works, but the frontend cannot reach the API (A.8). |
| `8df7d4d:README.md` (deleted) | Product vision plus Cloudflare Pages deploy steps | **Superseded** by the rewrite, but it is the best statement of intent. Its deploy steps (`npm run build`, `public/service-worker.js`) refer to files that never existed in the repo, so they were stale even then. |
| `8df7d4d:d1-database-layout.txt` (deleted) | "CHATGPT DO NOT EDIT" reference schema | Superseded. It lists credential types that were never implemented. |
| `3c6f286:web-crypto.md` (deleted in `a6fe2ec`) | A copy of the Cloudflare Web Crypto docs | Reference material only. |

There are no TODO or roadmap files and no unchecked items.

## A.11 Good ideas and pitfalls (vidshare)

**Good ideas to carry forward (mostly from the legacy Worker):**
1. **Multi-credential identity table** (`credentials` with `type`/`identifier`/`external_id`/`secret_hash`/`public_key`/`sign_count`). It cleanly supports password, passkey and social login per user, which serves the "choose your privacy level" goal.
2. **Short JWT plus hashed, rotating refresh token, with a session row that records UA, rotation count and last rotation.**
3. **Friend request state machine** with `declined` and `blocked` plus `blocked_by`, a send-only-to-accepted-friends rule, and case-insensitive usernames.
4. **Per-recipient link record** that carries watched, `watched_at`, saved and reaction. It enables the inbox/history/saved views and the **48-hour watched retention window**.
5. **Server-side download to object storage, keyed by share ID, with an in-app vertical FYP player** and thumbnails. This avoids flaky third-party embeds.
6. **Payload-less Web Push plus a pull-based notification inbox.** This is simple and avoids implementing payload encryption.
7. PWA install (manifest plus service worker) for a mobile-first experience.
8. Current stack: a per-user video quota, and a `{"error": ...}` JSON error convention.

**Pitfalls and bugs to record as lessons:**
1. A committed VAPID **private key** in `wrangler.toml` history, and a JWT secret fallback of `'dev-secret'`.
2. The unauthenticated legacy `POST /share`, which trusts a `sender` from the body.
3. A session cookie that equals the DB session ID and is accepted without an expiry check.
4. Consent-free friendship, plus friendship implicitly created by sharing (current stack). This is a spam vector.
5. The inverted CORS configuration (`AllowOriginFunc` overrides `AllowedOrigins`).
6. yt-dlp argument injection and SSRF; a synchronous yt-dlp call in the request path; an unpinned yt-dlp download in the Dockerfile.
7. Migrations re-run on every boot with no version table.
8. Plaintext session tokens in the DB, no `Secure` cookie flag, and a required-but-unused `SESSION_SECRET`.
9. A partial-failure share: the video is created and some shares are written before a 404 on a later recipient. There is no transaction.
10. Error responses leak raw DB and yt-dlp errors.
11. The duplicate-key check is a string match (`strings.Contains(err.Error(), "duplicate key")`).
12. Frontend: in `App.tsx`, `event.currentTarget.reset()` is called in `finally` after an `await`. React nulls `currentTarget` after dispatch, so this is likely to throw a TypeError.
13. Compose ships a frontend with no API proxy.
14. Scanning nullable `thumbnail_url`, `description` and `note` into Go `string` will fail if a NULL is ever stored. It does not happen today because inserts always pass `""`.

---

# PART B: vidfriends

## B.1 Product intent

- **README.md:** "a full-stack video sharing platform with a Go backend, PostgreSQL persistence, and a React + TypeScript frontend". It describes itself as a **prototype**: "many endpoints are scaffolds, the frontend relies on mock data…".
- **README "Feature set" section, added in `2e628d3`** (2025-09-25) and later removed in `221a50a`:
  - "For You Page-style video feed that surfaces shared clips in an immersive, swipeable stream"
  - "Responsive, dark-themed UI optimized for both desktop and mobile"
  - Roadmap: richer metadata, reactions, personalization, **co-watching sessions and friend recommendations**.
- **`ROADMAP_TODO.md`:** "Roadmap to a Working VidFriends Release… from today's prototype to a fully functional MVP".
- **`docs/MANUAL_TEST_PLAN.md`** describes the intended MVP journeys:
  - signup with email verification ("if configured")
  - login
  - friend invite by email or username, then accept
  - share with "notes/tags" to **selected friends** as recipients, with a "processing → available" state
  - an invitee notification or badge, then playback
- **Target users:** friends sharing videos privately (implicit; it was renamed from VidShare in `299da77` "Rename docs to VidFriends").
- **Non-goals stated:** none explicitly. `docs/API_REFERENCE.md` "Known gaps" lists OAuth/social login, MFA and device management as not implemented.
- **License:** Apache-2.0 (`LICENSE`).
- **Process:** almost every commit is a Codex PR titled "complete next TODO item". The docs therefore describe the to-do process heavily, and their claims often run ahead of what was verified.

## B.2 Feature inventory

**Systemic finding: the backend has no authorization at all.** The access token is a random string (`auth.Manager.Issue` → `randomToken`) that is **never persisted or verified anywhere**. Every friends and videos endpoint takes the acting user's ID from the request body or query string (`requesterId`, `ownerId`, `?user=`).

**Systemic finding: the frontend and backend contracts don't match, so the UI cannot work against the real backend.** The tests mock the API, so they hide this. Details in B.12.

| Capability | Status | Evidence |
|---|---|---|
| Sign up (email + password, 8–72 chars, valid email, lowercased) | impl+tested (handler, with mocks; repo integration test) | `backend/internal/handlers/auth.go` `SignUp`; `auth_test.go` `TestAuthHandlerSignUp*` |
| Login | impl+tested | `AuthHandler.Login`; `TestAuthHandlerLogin*` |
| Refresh token rotation | impl+tested | `auth.Manager.Refresh`; `session_manager_test.go`, `TestAuthHandlerRefresh*` |
| Access-token authentication of API calls | **absent**. The frontend sends `Authorization: Bearer` (`AppStateProvider.tsx` `getJSON`/`postJSON`), and the backend ignores it. | `handlers/*.go` |
| Logout or token revocation endpoint | **absent** (`Manager.Revoke` exists but has no route). The frontend `signOut` only clears localStorage. | `auth/session_manager.go`, `AppStateProvider.tsx` `signOut` |
| Password reset | **stubbed**: always returns 202 with a generic message; no token or email | `AuthHandler.RequestPasswordReset`; the API_REFERENCE says "🚧 Placeholder" |
| Display name | **frontend-only**. It is collected at signup but never sent or stored; the display name is derived from the email local part. | `SignupPage.tsx`, `AppStateProvider.tsx` `deriveDisplayName` |
| Rate limiting (per IP, in-memory) | impl+tested (the limiter has no direct test; handler tests cover the 429 path) | `middleware/rate_limiter.go` `NewIPRateLimiter`; `handlers/routes.go`. Auth: 10/min, burst 5. Invite: 5/min, burst 3. Refresh and password-reset share the auth limiter. Respond, list, videos and feed are **unlimited**. |
| Send friend invite (by user UUIDs) | impl+tested at the API level; **no UI exists to send invites** | `FriendHandler.Invite`; `friends_test.go`. The frontend has no invite form (`FriendListManager.tsx` only shows pending invites and connections). |
| List friend requests | impl+tested | `FriendHandler.List`, `PostgresFriendRepository.ListForUser` |
| Accept or block an invite | impl+tested. "Decline" in the UI maps to `block`. Any caller can change any request. | `FriendHandler.Respond`; `AppStateProvider.tsx` `respondToInvite` |
| Unfriend | planned-only (a reducer action `remove-friend` exists, but there is no API and no UI) | `appReducer` |
| Friend presence (online/away/offline) | **fake**: assigned round-robin in the frontend | `loadFriendsFromApi` `statusCycle` |
| Mutual-friend counts | fake (always 0) | `loadFriendsFromApi` |
| Share a video URL (metadata lookup, then store) | impl+tested at the handler and repo level; broken end to end (B.12) | `VideoHandler.Create`; `videos_test.go`; `ShareVideoForm.tsx` |
| Share to specific recipients, or a note/tags | **planned-only**. The schema has no recipient concept: a share is broadcast to all accepted friends through the feed. | `migrations/0001_init.sql` `video_shares`; `MANUAL_TEST_PLAN.md` |
| "Optional title override" on share | **frontend-only**. It is used for the optimistic entry and fallback title, and never sent to the backend. | `ShareVideoForm.tsx`, `shareVideo` |
| yt-dlp metadata lookup with an in-memory TTL cache | impl+tested | `videos/ytdlp.go` `Lookup`, `videos/cache.go`; `ytdlp_test.go`, `cache_test.go` |
| Background download to S3/MinIO | impl+tested (unit tests with stubs; untested against real MinIO) | `videos/ingestor.go` `AssetIngestor`, `storage/s3.go`; `ingestor_test.go`, `TestYTDLPProviderFetchDownloadsVideo` |
| Asset status (`pending`/`ready`/`failed`) | impl+tested (repo integration) | `MarkAssetReady`, `MarkAssetFailed`; `TestPostgresVideoRepository_UpdateAssetStatusTransitions` |
| Feed (own shares plus accepted friends' shares, newest 100) | impl+tested | `PostgresVideoRepository.ListFeed`; `TestPostgresVideoRepository_ListFeed*` |
| In-app playback of stored assets | **absent**. The frontend ignores `AssetURL`/`AssetStatus`, and the cards link to the original URL. | `VideoFeedPanel.tsx` `VideoFeedCard` |
| FYP/swipeable feed | planned-only (removed README section). The UI is a card list. | `VideoFeedPanel.tsx` |
| Reactions (like/love/wow/laugh) | **frontend-only** local state with no persistence | `appReducer` `react-to-video`, `VideoFeedPanel.tsx` |
| Feed filters (All, Recent 48h, Trending ≥10 reactions, From Online Friends, tags) | frontend-only, built on fake data. Tags come from keyword regexes on the title. | `VideoFeedPanel.tsx`, `deriveTagsFromTitle` |
| Duration and view count | **fake**: random numbers | `generateDurationForShare`, `generateViewCount` |
| Fallback thumbnails | fake (Unsplash "seed" URLs) | `generateThumbnailForTitle` |
| Notifications | planned-only | `MANUAL_TEST_PLAN.md` |
| Email verification, MFA, OAuth | planned-only | `API_REFERENCE.md` "Known gaps"; `MANUAL_TEST_PLAN.md` |
| Toasts and error boundary | impl+tested (ToastProvider) | `components/ToastProvider.tsx`, `components/ErrorBoundary.tsx`; `ToastProvider.test.tsx` |
| Session persistence plus proactive refresh (60 s before access expiry) | impl+tested with mocked API; broken against the real API (B.12) | `AppStateProvider.tsx` `refreshSession`, `REFRESH_LEEWAY_MS`; `AuthFlows.test.tsx` |
| Route guards | absent. `/dashboard` renders for anonymous users. | `routes/AppRouter.tsx` |
| Structured logging, request IDs and "spans" | impl-untested | `middleware/request_logger.go`, `logging/span.go` |
| Migration CLI (`migrate up`/`status`) and seed CLI | impl-untested. `down` returns "not supported yet". | `internal/app/app.go` `runMigrations`, `runSeed` |
| Mock mode (`VITE_USE_MOCKS`) | **does not exist in code**. It is documented in 4 places. | `grep VITE_USE_MOCKS frontend/src` finds nothing |
| Load testing, production config, beta | planned-only (unchecked roadmap items) | `ROADMAP_TODO.md` |

## B.3 Domain and data model (PostgreSQL; migrations in `backend/migrations/`)

### `0001_init.sql`

**`users`**
- `id UUID PK` (generated in the app with `uuid.NewString`)
- `email TEXT NOT NULL UNIQUE`
- `password_hash TEXT NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

**`friend_requests`**
- `id UUID PK`
- `requester_id UUID NOT NULL FK→users ON DELETE CASCADE`
- `receiver_id UUID NOT NULL FK→users ON DELETE CASCADE`
- `status TEXT NOT NULL`
- `created_at`
- `responded_at TIMESTAMPTZ NULL`

**`video_shares`**
- `id UUID PK`
- `owner_id UUID NOT NULL FK→users CASCADE`
- `url TEXT NOT NULL`
- `title TEXT`, `description TEXT`, `thumbnail TEXT` (all nullable)
- `created_at`

### `0002_friend_request_constraints.sql`
- `friend_requests_status_check`: `status IN ('pending','accepted','blocked')`. There is **no `declined`**.
- `friend_requests_unique_pair UNIQUE (requester_id, receiver_id)`.
- Indexes `friend_requests_receiver_idx` and `friend_requests_requester_idx`.

### `0003_sessions.sql`

**`sessions`**
- `refresh_token TEXT PK` (**plaintext token as the key**)
- `user_id UUID NOT NULL FK→users CASCADE`
- `expires_at TIMESTAMPTZ NOT NULL`
- `created_at`
- Index `sessions_user_id_idx`.

### `0004_schema_refinements.sql`
- A plpgsql trigger function `set_updated_at_timestamp()` and trigger `users_set_updated_at` (BEFORE UPDATE).
- `friend_requests_no_self CHECK (requester_id <> receiver_id)`.
- A direction-independent uniqueness index `friend_requests_any_pair_idx` on `(LEAST(requester_id, receiver_id), GREATEST(...))`.
- Index `friend_requests_created_at_idx`.
- Index `sessions_expires_at_idx` (for a cleanup job that does not exist).
- `video_shares_url_check CHECK (url ~ '^https?://')`.
- **`video_shares_owner_url_idx UNIQUE (owner_id, url)`**: a user can share a given URL only once, and a second attempt returns 409.
- Indexes `video_shares_created_at_idx` and `video_shares_owner_created_at_idx`.

### `0005_video_asset_ingestion.sql`
- `video_shares` gains:
  - `asset_url TEXT NOT NULL DEFAULT ''`
  - `asset_status TEXT NOT NULL DEFAULT 'pending'` (no CHECK constraint; values come from `models.AssetStatus*`: pending/ready/failed)
  - `asset_size BIGINT NOT NULL DEFAULT 0`

### Migration tracking and seed data
- **Tracking table:** `schema_migrations(version TEXT PK, applied_at TIMESTAMPTZ)`, created by `app.runMigrations`.
- **Seeds:** `backend/seeds/dev_seed.sql` inserts:
  - users alice, bob and carol `@example.com` with fixed UUIDs `1111…`, `2222…`, `3333…`, all sharing one bcrypt hash. The docs say the password is `password`; I did not verify this.
  - alice↔bob accepted, and bob→carol pending.
  - 2 shares. One is "ready" with a fake MinIO URL. The other is pending with **`thumbnail` NULL**.

### Go models and relationships
- Go models are in `backend/internal/models/models.go`: `User`, `FriendRequest`, `VideoShare`, `SessionTokens`. They have **no JSON tags**, so the API emits PascalCase field names.
- **Relationships:**
  - A friendship is an `accepted` friend_request, in either direction.
  - A "block" is just a status on the same row.
  - A share belongs to its owner and is visible to the owner plus accepted friends. **There is no per-recipient share table and no reactions or comments table.**

## B.4 API surface (`backend/internal/handlers/routes.go`, `net/http.ServeMux`)

**Conventions that apply to every route:**
- There is no path-method routing. Each handler checks `r.Method` itself and returns a bare `405` with no body otherwise.
- Bodies are JSON with no size limit (`json.NewDecoder(r.Body)`), and unknown fields are allowed.
- Errors use the shape `{"error":"..."}` (`respondJSON`).
- **There is no CORS middleware**, so a browser on `:5173` calling `:8080` directly is blocked, and Vite has no proxy configured. See B.12.
- **Auth: none on any route.**
- Responses from `/api/v1/videos*` and `/api/v1/friends*` use the PascalCase Go field names: `ID`, `OwnerID`, `URL`, `Title`, `Description`, `Thumbnail`, `CreatedAt`, `AssetURL`, `AssetStatus`, `AssetSize`, `Requester`, `Receiver`, `Status`, `RespondedAt`.

| Method | Path | Request | Success | Errors |
|---|---|---|---|---|
| GET | `/healthz` | none | `200 {"status":"ok"}` (no dependency checks) | 405 |
| POST | `/api/v1/auth/signup` | `{email, password}` | `201 {"tokens":{"AccessToken","AccessExpiresAt","RefreshToken","RefreshExpiresAt"}}`. Access TTL is 15 min and refresh TTL is 24 h (`app/deps.go`). **The user ID is not returned.** | 400 invalid body, missing fields, invalid email, password length; 409 "account already exists"; 429; 500 |
| POST | `/api/v1/auth/login` | `{email, password}` | `200 {"tokens":{...}}` (no user object or ID) | 400; 401 "invalid credentials"; 429; 500 |
| POST | `/api/v1/auth/refresh` | `{refreshToken}` (≤512 chars) | `200 {"tokens":{...}}`. The old token is deleted and a new pair issued. | 400; 401 "unable to refresh session"; 429; 500 |
| POST | `/api/v1/auth/password-reset` | `{email}` | `202 {"status":"If an account exists…"}` | 400; 429; 500 |
| GET | `/api/v1/friends?user=<uuid>` | none | `200 {"requests":[FriendRequest...]}` (both directions, newest first) | 400 missing user; 500 (including a non-UUID input, which is a DB error) |
| POST | `/api/v1/friends/invite` | `{requesterId, receiverId}` (UUIDs) | `201 {"request":{ID,Requester,Receiver,Status:"pending",CreatedAt,RespondedAt:null}}` | 400 missing, self, or invalid UUID; 404 user not found (FK violation 23503); 409 duplicate (either direction); 429; 500 |
| POST | `/api/v1/friends/respond` | `{requestId, action:"accept"\|"block"}` | `200 {"requestId","status"}` | 400; 404; 500. There is no ownership or state check, so accepted→blocked→accepted all work, and the caller can be anyone. |
| POST | `/api/v1/videos` | `{ownerId, url}` | `201 {"share":{VideoShare with AssetStatus:"pending"}}`, then the asset is enqueued | 400 missing fields or invalid URL (`url.ParseRequestURI`, which accepts any scheme); 502 metadata failure; 500 provider unavailable; 409 duplicate owner+url; 500 |
| GET | `/api/v1/videos/feed?user=<uuid>` | none | `200 {"entries":[VideoShare...]}` (limit 100, no pagination) | 400; 500 |

**Docs vs code:**
- `docs/API_REFERENCE.md` shows camelCase `accessToken`/`refreshToken`/`expiresAt`, which do not match the code.
- It says "downloads are currently skipped" and "Object storage uploads are stubbed". Both are outdated; ingestion is implemented.
- It says "Rate limiting… not configured". This is outdated.

## B.5 Auth, session, security and privacy

- **Password hashing:** bcrypt DefaultCost (`handlers/auth.go`). Passwords must be 8–72 chars (the 72 limit matches bcrypt's), enforced at both signup and login.
- **Tokens** (`auth/session_manager.go`):
  - Both tokens are opaque 32-byte base64url strings.
  - Only the refresh token is stored (`sessions`, **in plaintext**).
  - The access token is **never stored or checked**, so it is decorative.
  - Refresh does delete-then-issue (rotation) with no reuse detection, and it is not transactional.
  - Expired rows are deleted lazily.
  - The **docs say the access token is a JWT** (`API_REFERENCE.md` "Access tokens are short-lived JWTs"). It is not.
  - `SESSION_SECRET` is documented and placed in every env template but is **never read** (`config/config.go` has no such field).
- **Client token storage:** `localStorage` key `vidfriends.session` (`AppStateProvider.tsx` `persistSession`). This exposes tokens to XSS; there are no cookies.
- **CSRF:** not applicable (bearer, not cookies). But since there is no auth at all, anyone can act as anyone by supplying UUIDs.
- **Rate limiting:**
  - Per-IP token buckets (`x/time/rate`), in memory and lost on restart.
  - The key is the **first `X-Forwarded-For` value, trusted unconditionally** (`handlers/ratelimit.go` `clientIP`), so a client can spoof its IP to bypass the limits.
  - Garbage collection is O(n) on every request.
- **Enumeration:** signup's 409 reveals registered emails. Password reset is correctly generic.
- **Logging and privacy:**
  - Emails are logged on many warn paths (`auth.go`: "login missing credentials", "signup existing account", and others).
  - `respondJSON` logs full response payloads for 4xx/5xx.
  - `RequestLogger` logs `remote_addr`.
  - Request and trace IDs are taken from client-supplied `X-Request-ID`/`X-Trace-ID` headers.
  - Every handler emits an extra "span completed" log line.
- **SSRF and abuse:**
  - yt-dlp fetches any URL that passes `url.ParseRequestURI`, so `file:`, `ftp:` and internal hosts reach yt-dlp. The DB `^https?://` check runs only **after** the lookup.
  - Arguments are passed after flags with no `--`, but `ParseRequestURI` rejects strings starting with `-`.
  - The ingestor downloads **unbounded** media: no `-f` format limit, no `--max-filesize`, and output goes to the process working directory.
  - Objects are uploaded with `ACL: public-read` (`storage/s3.go`), and the bucket is made anonymous-download by compose (`createbuckets`). Every video is public to anyone who has its URL.
- **HTTP server:** `ReadHeaderTimeout` is 5 s and **`WriteTimeout` is 10 s** (`httpserver/server.go`), but the yt-dlp metadata timeout defaults to 30 s. Slow lookups will have their responses cut off.
- **Panic recovery:** `RequestLogger` recovers and returns 500.

## B.6 Video handling

1. **Ingest:** `POST /api/v1/videos` with a URL. `CachingProvider.Lookup` (15-minute TTL, in-memory map that never evicts) calls `YTDLPProvider.Lookup`, which runs `yt-dlp --dump-single-json --no-warnings --no-playlist --skip-download <url>` **synchronously**. Only `title`, `description` and `thumbnail` are kept.
2. **Persist:** a `video_shares` row is created with `asset_status='pending'`.
3. **Background job** (`videos/ingestor.go`):
   - An in-process buffered channel (QueueSize 32) feeds 2 worker goroutines (`app/deps.go`).
   - Each job runs yt-dlp **again** without `--skip-download`. It reads `requested_downloads[].filepath`, opens the file, uploads it via `prefixedStorage` to the key `<shareID>/<filename>`, and deletes the local file.
   - The job ends with `MarkAssetReady(location, size)` or `MarkAssetFailed`.
   - The job timeout is max(2×yt-dlp timeout, 2 min).
4. **Storage** (`storage/s3.go`):
   - AWS SDK v2 multipart uploader (5 MiB parts), path-style addressing and a custom endpoint for MinIO.
   - Credentials come from the default AWS chain; compose maps `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` to the MinIO root credentials.
   - The returned public URL is `VIDFRIENDS_S3_PUBLIC_BASE_URL/<key>`.
5. **Playback:** **not implemented**. The frontend never reads `AssetURL`.
6. **Durability gaps:**
   - The queue is in memory, so jobs are lost on restart and shares stay `pending` forever.
   - `Shutdown` cancels the context and the workers return immediately, so queued jobs are dropped even though the comment says "waits… to drain".
   - `Enqueue` blocks the HTTP request when the queue is full.
   - There is no retry and no thumbnail persistence; the thumbnail is hotlinked.
7. **Runtime image gaps:**
   - `deploy/docker/backend.Dockerfile` produces an Alpine image **without yt-dlp or python**, so metadata and ingestion fail in the published image.
   - Compose mounts a yt-dlp binary copied from `ghcr.io/yt-dlp/yt-dlp:2023.11.14` into a `golang:1.22` container. That binary's runtime needs (python and so on) are unverified, and the volume mount over `/usr/local/bin` may shadow tools.

## B.7 Social model and business rules (as implemented)

- **Friend request:**
  - `pending` is created by `invite`. Self-invites are rejected in both the handler and the DB. Duplicates in either direction return 409.
  - `respond` sets `accepted` or `blocked` and stamps `responded_at`.
  - There is no `declined` state; the UI's "Decline" sends `block`.
  - There is no unfriend, no re-request after a block (the unique pair blocks it), no check that the responder is the receiver, and no transition validation.
- **Friendship** means `status='accepted'` in either direction (`ListFeed` CTE `accepted_friends`).
- **Share:** a user posts a URL once (unique `owner_id+url`). It goes to all accepted friends through the feed. There are no recipients, notes, visibility controls, deletion or editing.
- **Feed:** own and friends' shares, newest first, limit 100.
- **Blocking:** has no effect beyond removing the pair from the feed, because blocked rows are simply not "accepted".

## B.8 Architecture and stack

### Backend
- Go (`go.mod`: **go 1.24.0, toolchain go1.24.3**), module `github.com/vidfriends/backend`.
- Dependencies: pgx v5.7.6 (pgxpool), google/uuid, `x/crypto/bcrypt`, `x/time/rate`, AWS SDK v2 (S3 and manager), and `cockroachdb/cockroach-go/v2` (**test-only**: `testserver`).
- Standard-library `net/http` ServeMux and `log/slog` JSON logging.
- Layout:
  - `cmd/vidfriends/main.go` dispatches to `internal/app.Run` with the subcommands `serve | migrate [up|status|down] | seed <name>`.
  - `internal/{app,auth,config,db,handlers,httpserver,logging,middleware,models,repositories,storage,videos}`.
- Dependency injection through interfaces is a clean design: `handlers/interfaces.go`, plus `handlers.Dependencies` built in `app/deps.go`.
- **`serve` does not run migrations.** Docs say it does (STARTUP §4.2, backend README, root README "SQL migrations executed automatically").

### Database
- **PostgreSQL** (compose `postgres:15`).
- **CockroachDB is used only by the repository integration tests** (`repositories/postgres_integration_test.go` `testserver.NewTestServer()`, which downloads a Cockroach binary at test time). The production target is Postgres; Cockroach is a test harness choice. Note the SQL dialect differences (plpgsql trigger, regex CHECK) between the two.

### Queues and jobs
- Only the in-process `AssetIngestor` (above). There is no external queue and no scheduler (for example, nothing cleans up sessions).

### Frontend
- React 18.3, react-router-dom 7, Vite 5, TypeScript strict, Vitest 3 with jsdom and Testing Library, ESLint 8 and Prettier, pnpm.
- Structure:
  - `src/main.tsx`: ToastProvider wraps AppStateProvider, which wraps BrowserRouter.
  - `routes/AppRouter.tsx`: `/`, `/dashboard`, `/login`, `/signup`, `/forgot-password`, `*`.
  - `layouts/` (AppLayout sidebar, AuthLayout).
  - `pages/` and `pages/components/` (FriendListManager, ShareVideoForm, VideoFeedPanel).
  - `state/AppStateProvider.tsx`: a 1,072-line context plus reducer that contains the API client, session handling and fake-data generators.
- Inline styles throughout, plus `styles/global.css`.
- Duplicate `index.html` and `public/index.html` (identical). Vite copies `public/` into `dist/`, which risks clobbering the built `index.html`. I did not verify this.

### Configuration and env vars
Backend variables actually read by `internal/config/config.go`:

| Variable | Default |
|---|---|
| `VIDFRIENDS_PORT` | 8080 |
| `VIDFRIENDS_DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/vidfriends?sslmode=disable` |
| `VIDFRIENDS_MIGRATIONS` | `migrations` |
| `VIDFRIENDS_SEEDS` | `seeds` |
| `VIDFRIENDS_LOG_LEVEL` | `info` (**unused**: the logger is never level-filtered) |
| `VIDFRIENDS_YTDLP_PATH` | `yt-dlp` |
| `VIDFRIENDS_YTDLP_TIMEOUT` | 30s |
| `VIDFRIENDS_METADATA_CACHE_TTL` | 15m |
| `VIDFRIENDS_S3_ENDPOINT` | `http://localhost:9000` |
| `VIDFRIENDS_S3_BUCKET` | `vidfriends` |
| `VIDFRIENDS_S3_REGION` | `us-east-1` |
| `VIDFRIENDS_S3_PUBLIC_BASE_URL` | `http://localhost:9000/vidfriends` |

- Plus the implicit AWS SDK variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`).
- Documented but unused or wrong: `SESSION_SECRET`, `DATABASE_URL`/`YT_DLP_PATH` (the STARTUP.md names; the backend needs the `VIDFRIENDS_` prefix), `VITE_USE_MOCKS`, `VITE_USE_MOCK_DATA`.
- Frontend: `VITE_API_BASE_URL` (default `''`, meaning same origin).
- Templates live in `configs/*.env.example`. `backend/.env.example`, `frontend/.env.example` and `deploy/.env.example` are **symlinks** to them, which break on Windows checkouts without symlink support (the files contain the link text).

### Deploy
- **`deploy/docker-compose.yml`** has these services:
  - `db` (postgres:15, healthcheck)
  - `minio` (`RELEASE.2024-01-13…`, 9000/9001)
  - `createbuckets` (`mc mb` plus `mc anonymous set download`)
  - `yt-dlp` (copies the binary into the volume `yt-dlp-bin`)
  - `backend` (`golang:1.22` running `go run ./cmd/vidfriends serve` with the source mounted; env from `../backend/.env`)
  - `frontend` (`node:20` running `pnpm dev`; env from `../frontend/.env`; `VITE_API_BASE_URL=http://backend:8080`)
- **Compose problems:**
  - `golang:1.22` against a `go 1.24` module only works through GOTOOLCHAIN auto-download.
  - `http://backend:8080` cannot be resolved by the host browser.
  - The `../frontend/.env` env_file must exist, but the docs say to create `.env.local`.
  - `VIDFRIENDS_PORT=${BACKEND_PORT}` while the published container port is fixed at `8080`, so they mismatch if the port is changed.
  - Migrations are never run, except in the onboarding override.
- **`deploy/docker-compose.onboarding.yml`:** builds `deploy/docker/onboarding-assets.Dockerfile` (python:3.12-alpine with `pip install yt-dlp==2023.11.14`). It exports the binary, migrations and seeds to volumes, and a `db-seed` job applies them with `psql`. This bypasses `schema_migrations`, so a later `migrate up` would re-apply and fail.
- **Images:**
  - `deploy/docker/backend.Dockerfile`: golang:1.23-alpine → alpine:3.20, non-root user, `ENTRYPOINT vidfriends serve`, no yt-dlp.
  - `deploy/docker/frontend.Dockerfile`: node:20-alpine with pnpm → nginx:1.27 with SPA fallback (`frontend.nginx.conf`, no `/api` proxy). It uses `COPY --exclude=...` placed **after** the destination, under `# syntax=docker/dockerfile:1.6`. `--exclude` requires the 1.7-labs syntax, so **this build likely fails** (unverified).
- **CI** (`.github/workflows/ci.yml`, on PR and push to main, `ubuntu-latest`):
  - Jobs: Go tests plus `go vet`, frontend `pnpm vitest run`, lint (`scripts/lint.sh`: gofmt plus eslint), and `tsc --noEmit`.
  - `actions/setup-node` with `cache: 'pnpm'` runs **before** pnpm is installed (corepack is enabled later), which normally fails ("Unable to locate executable file: pnpm").
  - The Go test job will try to download CockroachDB for the integration tests.
- **CD** (`.github/workflows/container-build.yml`): on push to main, release or manual dispatch. **Self-hosted runner.** QEMU plus Buildx builds multi-arch amd64/arm64 images and pushes `ghcr.io/<owner>/<repo>-{backend,frontend}` with branch, tag, sha and `staging` tags.
- `.github/dependabot.yml`: weekly updates for actions, gomod and npm.
- **Makefile:** targets `test`, `lint`, `backend-*` and `frontend-*`. The `backend-migrate-status` and `backend-seed` recipes are **indented with spaces, not tabs**, which makes make fail with "missing separator". `backend-migrate-down` calls an unsupported command.
- `scripts/prepare_workstation.sh`: checks Go ≥1.21 and Node ≥18 and copies the env templates.

## B.9 Tests

### Backend
About 2,245 lines in 10 files.

| File | Coverage |
|---|---|
| `handlers/auth_test.go` | Signup, login and refresh success and failures; validation; conflicts; storage failures; rate limiting; password-reset paths. Uses in-memory fakes. |
| `handlers/friends_test.go` | Invite, list and respond, including validation, conflict, not-found and rate-limit cases |
| `handlers/videos_test.go` | Create (success, metadata error, conflict, missing deps, validation, provider unavailable, store failure) and feed |
| `handlers/health_test.go` | Health endpoint |
| `auth/session_manager_test.go` | Issue, refresh and rotation; validation; expiry |
| `videos/{ytdlp,cache,ingestor}_test.go` | The command runner is stubbed. Covers metadata parsing, the download-and-persist path, cache TTL and ingestor success/failure. |
| `app/deps_test.go` | Dependency wiring |
| `repositories/postgres_integration_test.go` | Real SQL against a **CockroachDB testserver**: user CRUD, friend requests, sessions, the feed (including inbound accepted friends) and asset status transitions. `TestMain` calls `os.Exit(1)` if Cockroach cannot start, which fails the whole package offline. |

**Runnability (quick check on this machine, Go 1.27, Windows):**
- `go build ./...` succeeds.
- `go test` passes for `handlers`, `auth` and `app`.
- `videos` **fails `TestAssetIngestorSuccess`** on Windows: the fixture builds JSON containing a raw Windows path with unescaped backslashes (`ingestor_test.go` `fmt.Sprintf(...\"filepath\":\"%s\"...)`). It probably passes on Linux.
- The test stubs also append to slices from worker goroutines without synchronisation, so `-race` would flag them.
- I did not run the repository integration tests (they need the Cockroach download).

### Frontend
Vitest plus Testing Library; 8 test files.

| File | Coverage |
|---|---|
| `ToastProvider.test.tsx` | Render, dismiss, auto-clear |
| `AuthFlows.test.tsx` | Sign-in redirect, API error, signup welcome, password reset |
| `AuthForms.test.tsx` | Form submission and errors |
| `FriendListManager.test.tsx` | Optimistic accept and rollback, search |
| `HomePage.test.tsx` | Headline |
| `ShareVideoForm.test.tsx` | Sign-in prompt, progress, success, error |
| `VideoFeedPanel.test.tsx` | Filters, reaction callback, empty state |
| `state/__tests__/appReducer.test.ts` | Invites, optimistic share, rollback, reaction toggling |

**The tests mock `fetch` with camelCase `tokens.accessToken`** (`AuthFlows.test.tsx`), which hides the backend's PascalCase contract. I did not run them; that would need `pnpm install`.

### Manual
`docs/MANUAL_TEST_PLAN.md` describes flows (verification, recipients, notifications, processing state) that the code does not implement.

## B.10 Planning docs

| Doc | Claimed status | Assessment |
|---|---|---|
| `README.md` | "prototype". Status table: Auth "⏳ In progress… placeholder session storage"; Friends "frontend still serves mock friend data"; Feed "not yet backed by the database… UI renders mock feed entries"; Ingestion "❌ Not ready… downloads are skipped"; Documentation "✅ Updated". | **Stale and contradictory.** Postgres sessions, DB-backed friends and feed, and ingestion were all implemented later (PRs #48–#68). The project-structure section lists a top-level `migrations/` directory, which does not exist (it is `backend/migrations/`). It also says migrations run on startup, which is false. |
| `TODO.md` | All items checked `[x]` (Infrastructure, Backend, Frontend, Documentation) | Overstated. "Instantiate concrete service dependencies…" is done. "Align friend invitation mutation URLs… optimistic rollbacks" is partly done (respond only; there is no invite UI). "Replace mock data… Provide a mock layer that can be toggled" is not done: there is no toggle. "Remove or revise claims about integrated auth/friendship/video features" was done, then overtaken by later work. **No unchecked items.** |
| `ROADMAP_TODO.md` | Backend stabilization, frontend integration and cross-cutting all `[x]`; **Launch readiness unchecked** | The checked items are overstated in places: "Replace AppStateProvider mock toggles with real API calls" is broken by the contract mismatch; "Add rate limiting and input validation" was done partially. **Unchecked items:** (1) production-ready configuration templates (secrets management, TLS, MinIO/S3 credentials); (2) load testing of the feed and share endpoints; (3) onboarding documentation for early adopters (known limitations, troubleshooting); (4) a bug bash or friends-and-family beta. |
| `docs/FIRST_STEPS.md` | A contributor checklist, all unchecked (it is a per-person checklist, not project status) | Partly stale: "Down migrations are not supported yet" is correct. It mentions "mock service layer" (nonexistent) and "Configure branch protection rules" (unknown). Unchecked items: read the docs; run `prepare_workstation.sh`; start Postgres; migrate; serve; pnpm dev; test flows; compose workflow; provision a CI runner with Buildx/QEMU; publish images; multi-arch builds; agree on coding standards; branch protection; groom issues and roadmap. Several of these are actually done in the repo (compose, CI, multi-arch, coding standards). |
| `docs/STARTUP.md` | Setup guide with "known limitations" | **Contradictory:** it says migrations run on startup; "yt-dlp downloads are not yet persisted"; Vite "proxies API requests" (there is no proxy); `DATABASE_URL`/`YT_DLP_PATH` names (wrong prefix); "Metadata lookups fall back to mock data if the binary is missing" (false, it returns 500); `VITE_USE_MOCKS` (nonexistent); "migrate status" (works); compose "MinIO and yt-dlp are not yet hooked into an ingestion workflow" (outdated); a layout listing top-level `migrations/` and "k8s manifests" (neither exists). |
| `docs/API_REFERENCE.md` | Endpoint table | Partly stale: token field names, "JWT", "downloads are currently skipped", "Rate limiting… not configured" and "Object storage uploads are stubbed" are all wrong now. The payload shapes for invite, respond and share are correct. It does not mention that no endpoint checks auth. |
| `docs/ENVIRONMENT_VARIABLES.md` | Central env catalog | Mostly accurate for the backend `VIDFRIENDS_*` variables. It lists `SESSION_SECRET` (unused), `VITE_USE_MOCKS` (nonexistent), and compose `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY`/`MINIO_BUCKET`, while the compose file actually uses `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`/`VIDFRIENDS_S3_BUCKET`. It says S3 is "Not yet fully wired up" (outdated). |
| `docs/CONTRIBUTOR_GUIDE.md` | Workflow guide | Mentions `migrate down 1` (unsupported) and "Vite/Jest" (Vitest). It also says seeds use the password `password`. |
| `docs/CODING_STANDARDS.md` | Style guide | Says the project "targets Go 1.21" while `go.mod` declares 1.24. Otherwise fine. |
| `docs/MANUAL_TEST_PLAN.md` | MVP acceptance flows | Aspirational. It describes email/OTP verification, invites by email or username, recipients, notes and tags, a processing→available badge, notifications and playback, none of which are implemented end to end. |
| `deploy/README.md` | Compose docs | Says the backend serves "websocket upgrades" (none exist), that "the dev server proxies `/api`" (false), and that MinIO stores "videos and thumbnails" (thumbnails are not stored). Says migrations "need to be run manually" (correct). |
| `configs/README.md`, `backend/README.md`, `frontend/README.md` | Component READMEs | `frontend/README.md` mentions a `tests/` directory that does not exist (tests are in `src/**/__tests__`). `backend/README.md` is mostly correct. |

## B.11 Good ideas and pitfalls (vidfriends)

**Good ideas to carry forward:**
1. **Interface-based dependency injection** (`handlers/interfaces.go`, `handlers.Dependencies`). It made handler unit tests easy.
2. **A versioned migration runner** with a `schema_migrations` table, serializable transactions, and retry on 40001/40P01/55P03 (`app.runMigrations`, `applyMigrationWithRetry`).
3. **Schema hygiene:**
   - a direction-independent friend-pair unique index (`LEAST/GREATEST`)
   - a no-self CHECK
   - a URL scheme CHECK
   - `updated_at` maintained by a trigger
   - feed indexes on `(owner_id, created_at DESC)`
4. **Asset lifecycle columns** (`asset_status` pending/ready/failed, `asset_url`, `asset_size`) and an object key namespaced by share ID.
5. **Separating metadata lookup (synchronous, cached) from media download (asynchronous worker)** is the right shape. It needs a durable queue.
6. **Refresh token rotation**, plus a frontend single-flight refresh 60 s before expiry (`refreshPromiseRef`).
7. **Optimistic UI with rollback** for shares and invite responses, plus toasts and an error boundary.
8. **Structured slog JSON logs** with request and trace IDs, echoed back in `X-Request-ID`/`X-Trace-ID` headers.
9. Input validation patterns: email parsing, the bcrypt 72-byte limit, refresh token length caps, UUID validation.
10. Infrastructure: a MinIO-based local S3, multi-arch GHCR images with a rolling `staging` tag, Dependabot, an onboarding compose override with seed data.
11. Product UI ideas worth keeping as backlog: feed filters (recent, trending, by topic), emoji reactions (like/love/wow/laugh), and friend search.

**Pitfalls, bugs and security issues to record as lessons:**
1. **No authorization anywhere.** The access token is never validated, and the acting user comes from client-supplied IDs. This is the single biggest flaw.
2. **Contract drift between frontend and backend:**
   - PascalCase response fields (no JSON tags) versus a camelCase frontend.
   - The login and signup responses don't return a user ID, so the frontend substitutes the **email as the user ID** (`signIn`/`signUp` in `AppStateProvider.tsx`). Every `?user=`/`ownerId` call then fails as non-UUID input to a UUID column, causing 500s.
   - Mocked tests hid all of this.
   - Lesson: generate a shared schema (OpenAPI or similar) and add contract or E2E tests.
3. **The frontend renders fabricated data** (random durations and view counts, fake presence, fake thumbnails, fake tags, local-only reactions) as if it were real.
4. **No CORS middleware and no Vite proxy**, so a browser at `:5173` cannot call `:8080`.
5. **Docs claim things the code doesn't do:** migrations on startup, JWT, mock mode, a Vite proxy, websockets, k8s, `SESSION_SECRET`. The AI-agent workflow checked items off without end-to-end verification. Lesson: define "done" as passing an E2E flow.
6. **Migration files contain their own `BEGIN;`/`COMMIT;`** while the runner wraps each one in a transaction. The inner `COMMIT` ends the outer transaction early, so the `schema_migrations` insert and the retry logic are no longer atomic with the DDL.
7. **The ingestion queue is in memory and non-durable.** Shutdown drops queued jobs, and nothing recovers or retries orphaned `pending` rows. yt-dlp runs twice per share. Downloads are unbounded (no size or format limits) and land in the working directory.
8. A **10 s server WriteTimeout against a 30 s yt-dlp timeout**, with synchronous metadata lookup in the request.
9. **SSRF:** yt-dlp is called before the http(s) scheme is enforced. **Public-read** objects and an anonymous bucket.
10. **Refresh tokens are stored in plaintext**, and client tokens live in `localStorage`. There is no reuse detection, logout endpoint or session cleanup.
11. **The rate limiter trusts `X-Forwarded-For`.** Its state is in memory per instance.
12. `ListFeed` scans nullable `title`/`description`/`thumbnail` into `string`. A NULL (as in seed share `dddd…`, whose `thumbnail` is NULL) makes pgx fail the scan, so **any feed that includes that seed share returns 500**. This follows from pgx semantics; I did not run it. Lesson: use NOT NULL with defaults, or nullable scan types.
13. Friend respond has no actor or state checks; "decline" equals "block"; there is no unfriend; and a blocked pair can never re-friend.
14. Shares have no recipients, so the product cannot express "send this to Sam" (the core legacy behaviour).
15. Build and deploy breakages:
    - Makefile tabs.
    - CI pnpm cache ordering.
    - Dockerfile `COPY --exclude` with syntax 1.6.
    - A runtime image without yt-dlp.
    - Compose: Go 1.22 against a 1.24 module, and `VITE_API_BASE_URL=http://backend:8080` unusable from the browser.
    - Symlinked `.env.example` files.
    - Integration tests that need a Cockroach download, while production uses Postgres.
16. Logging PII (emails) and full error payloads. A per-handler "span completed" log line roughly doubles log volume.

---

# PART C: Cross-repo comparison

## C.1 Lineage

```
vidshare (legacy, Cloudflare Worker + D1 + R2, 2025-09-07..24)
   │  ── richest product: passkeys, friend requests, FYP scroll, reactions,
   │     save/history, push notifications, server-side video download to R2
   ├──► vidshare (Go + React rewrite, 340e9c0, 2025-09-24)  ── minimal, cookie sessions
   └──► vidfriends (new repo 2025-09-24.., renamed from "VidShare" docs in 299da77)
          ── Codex-driven, heavier infra (MinIO, CI, GHCR), weaker product semantics
```

Both rewrites happened on the same day (2025-09-24). They share Go, pgx, React, Vite and yt-dlp, but they diverge in identity, friendship and share modelling.

## C.2 Side-by-side

| Concern | vidshare legacy (Worker) | vidshare current | vidfriends |
|---|---|---|---|
| Identity key | username (case-insensitive); UUID IDs | username (case-sensitive); SERIAL IDs | email; UUID IDs |
| Credentials | multi-credential table (password, passkey; social planned) | bcrypt in `users` | bcrypt in `users` |
| Password hash | PBKDF2-SHA256, 100k iterations | bcrypt | bcrypt (8–72 chars) |
| Session | JWT 15 min (HS256) plus hashed rotating refresh 60 d, in cookies | opaque 30-day token in an HttpOnly cookie, checked on every request | opaque access (unchecked) plus plaintext refresh 24 h, in localStorage |
| AuthZ on APIs | yes (except `/share`) | yes (`requireAuth`) | **none** |
| Friendship | request → pending/accepted/declined/blocked; remove; block | instant mutual, no consent, self-friend | request → pending/accepted/blocked; no remove |
| Share model | per-recipient `links` row (1 recipient per send), friends only | one `videos` row plus per-recipient `video_shares` (N usernames), auto-friends recipients | one `video_shares` row per owner+url, broadcast to all friends |
| Per-recipient state | watched, watched_at, saved, reaction | none | none |
| Feed | inbox (unwatched, saved, or watched <48h), FYP vertical scroll | inbox of shares to me | own plus friends' shares, card list with fake enrichment |
| Reactions/replies | one emoji or text per link, sender notified | none | client-only emoji counts |
| Notifications | Web Push (VAPID) plus inbox | none | none |
| Video ingestion | external download API to R2 (`assets.vidfriends.app`) | yt-dlp metadata only (synchronous) | yt-dlp metadata (synchronous, cached) plus async download to S3/MinIO |
| Playback | in-app `<video>` from R2 | external link | external link (asset URL ignored) |
| DB | Cloudflare D1 (SQLite) | Postgres 15 | Postgres 15 (tests on CockroachDB) |
| Migrations | ad-hoc and lazy `CREATE TABLE IF NOT EXISTS` | re-run every file each boot | versioned `schema_migrations` CLI (not run on serve) |
| Frontend | server-rendered HTML strings, PWA | single-component React SPA | React SPA plus router, context/reducer, toasts |
| Tests | none | none | about 45 Go tests and about 20 Vitest cases (mocked) |
| CI/CD | none | none | GH Actions CI plus multi-arch GHCR images |
| Hosting target | Cloudflare free tier | Docker Compose | Docker Compose, GHCR images, self-hosted runner |

## C.3 Contradictions between docs and code (consolidated)

**vidshare:**
1. The README says Go unit tests exist (`go test ./...`). There are none.
2. The README says MIT licensed. There is no LICENSE file.
3. `SESSION_SECRET` is described as "used to sign cookies" (README) and is required by `config.Load`. It is never used.
4. The README implies the Compose stack works. The nginx frontend has no `/api` proxy and `VITE_API_BASE` is unset, so API calls fail.
5. `ALLOW_ORIGINS` is documented as "allowed origins, defaults to `*`". In code, setting it blocks all origins, and leaving it unset allows all origins with credentials.
6. The legacy README describes a Cloudflare Pages build (`npm run build`, `public/service-worker.js`). The repo was a single Worker with no `package.json` and no `public/`.
7. The legacy D1 layout lists email, phone, Apple, Discord and GitHub credential types and avatars. None were implemented.

**vidfriends:**
1. The README status table says the frontend uses mock data, the feed isn't DB-backed and ingestion is not ready. All three are implemented now. Conversely, `TODO.md`/`ROADMAP_TODO.md` mark the frontend integration done, but it cannot work against the real API.
2. "Migrations executed automatically on service startup" (README, backend README, STARTUP §4.2). `serve` never runs migrations.
3. "Access tokens are short-lived JWTs" (API_REFERENCE). They are random strings that are never verified.
4. "Downloads are currently skipped" and "Object storage uploads are stubbed" (API_REFERENCE, STARTUP, ENVIRONMENT_VARIABLES, deploy README). The `AssetIngestor` with S3 upload is implemented.
5. "Rate limiting… not configured" (API_REFERENCE). Rate limiting is implemented on auth and invite.
6. Token response fields are camelCase in the docs and frontend, and PascalCase from the backend.
7. `VITE_USE_MOCKS` mock layer (STARTUP, ENVIRONMENT_VARIABLES, FIRST_STEPS, TODO). This flag does not exist in the code.
8. "The dev server proxies `/api` requests" (STARTUP, deploy README). `vite.config.ts` has no proxy, and the backend has no CORS.
9. "Metadata lookups fall back to mock data if the binary is missing" (STARTUP). The code returns 502 or 500.
10. Env names in STARTUP (`DATABASE_URL`, `YT_DLP_PATH`) versus code (`VIDFRIENDS_DATABASE_URL`, `VIDFRIENDS_YTDLP_PATH`). ENVIRONMENT_VARIABLES lists compose `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY`/`MINIO_BUCKET`, while compose uses `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`/`VIDFRIENDS_S3_BUCKET`.
11. `migrate down 1` (CONTRIBUTOR_GUIDE, Makefile). The code returns "down migrations are not supported yet".
12. Repo layout mentions a top-level `migrations/`, k8s manifests and `backend/pkg/` (STARTUP, README). None exist.
13. The backend serves "websocket upgrades" (deploy README). It has no websockets.
14. MANUAL_TEST_PLAN describes recipients, notes and tags, notifications, verification, processing badges and playback. None exist end to end.
15. CODING_STANDARDS says Go 1.21. `go.mod` says go 1.24.0.
16. The frontend README mentions a `tests/` directory. Tests live in `src/**/__tests__`.
17. The commit "Use self-hosted runners for CI" (`5a1f215`). `ci.yml` uses `ubuntu-latest`; only `container-build.yml` is self-hosted.
18. The UI label "Decline" sends the backend action `block`.

## C.4 Recommendations for the greenfield doc writer

- **Treat the legacy vidshare Worker as the product spec baseline.** Treat vidfriends as the infrastructure and engineering-practice baseline. The current vidshare Go/React code adds little beyond a minimal cookie-session pattern and the per-user quota idea.
- **Product decisions the docs must settle explicitly:**
  1. Is a share sent to specific friends (legacy and vidshare) or broadcast to all friends (vidfriends)? The legacy per-recipient model enables watched, saved and reaction state and the 48-hour inbox rules.
  2. Is the identity key a username (privacy-friendly; legacy intent) or an email?
  3. Authentication methods: passkeys plus password, and optionally social logins through a multi-credential table.
  4. Media: download and host (needs a durable job queue, size/format limits, private storage with signed URLs, and a copyright/ToS stance) or embed/link out.
  5. Notifications: Web Push plus an in-app inbox.
  6. Friend state machine: include `declined` separately from `blocked`, add unfriend, and define whether a decline can be re-requested.
  7. Hosting target and cost constraints (the legacy "Cloudflare free tier, no ads" goal versus the Docker/S3 stack).
- **Non-negotiable lessons:**
  - Server-side authorization derived from the session, never from client IDs.
  - A single API contract source (OpenAPI or shared types) plus E2E tests.
  - No fabricated UI data.
  - Hashed tokens at rest and `Secure` cookies (or a deliberate token-storage decision).
  - A durable ingestion queue.
  - SSRF-safe URL validation before any fetch.
  - Rotate any committed secrets (the legacy VAPID key).
  - "Done" means verified end to end, not just checked off.
