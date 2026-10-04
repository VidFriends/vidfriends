# VidFriends client audit: Web (React) and iOS (SwiftUI)

Audited read-only on 2026-10-03. The repos are clones from mid-2026:

- `src/VidFriends_vidfriends-web`: 4 commits on `master`, 2026-06-17 to 2026-06-19. HEAD is `5809d7c` ("VID-441: Alpha release prep").
- `src/VidFriends_vidfriends-ios`: 1 commit on `master`, `853472d`, 2026-06-19 ("VID-441: Initial commit — VidFriends iOS app scaffold").
- `src/VidFriends_vidfriends-backend`: used only to cross-check the API contract, at HEAD `b295904` (2026-06-19, "VID-478"). Routes are defined in `internal/router/router.go`.

**Unmerged branches.** The web repo has only Dependabot branches: nginx 1.31, node 26, actions checkout/setup-go/setup-node/upload-artifact v7, an npm minor/patch group, and @types/node 26. The iOS repo has no remote branches other than `master`. Neither repo has any non-Dependabot unmerged work.

**Authorship.** Every commit is authored as "CTO" or "VidFriends CTO" with `Co-Authored-By: Paperclip <noreply@paperclip.ing>`. The project was built by an AI-agent org: the review docs name agents "iOSSenior" and "iOSJunior". Tracker IDs: VID-69/70/82/86/97/110/145/252/253/267 (iOS); VID-354 and VID-441 (web).

**Status legend used throughout:**
- **IMPL+TESTED**: implemented, and covered by unit or E2E tests (the tests may never have run; see the caveats).
- **IMPL-UNTESTED**: implemented, with no tests.
- **STUBBED**: UI or code exists but is disabled, unreachable, or never wired up.
- **PLANNED-ONLY**: mentioned in docs, copy or types, with no implementation.

> **Most important finding for the doc writer.** Neither client matches the backend contract at backend HEAD. Login and registration responses differ: the backend returns `{access_token, refresh_token, expires_in}`, but both clients read `{token}`. `/api/auth/me`, `/api/feed`, collections and many iOS paths also differ (see §3). The iOS app also appears unable to compile: a `let` property is mutated, and 24 source files are missing from the `.xcodeproj` (see §B7). Treat both clients as a record of **intended product behavior and UX**, not as a working reference implementation.

---

## Part A — Web (`VidFriends_vidfriends-web`)

### A1. Product intent and recorded decisions

- **`README.md`** describes a "React + TypeScript + Vite frontend for VidFriends, a shortform video sharing platform". The stack is React 19, TS 6, Vite 8, Tailwind 4 and React Router 7. The README covers the Docker image (nginx serving the SPA and proxying `/api/*` to `http://backend:8080`) and CI (lint, typecheck, test, build).
- **`e2e/README.md`** names the backend "Go backend (vidflow)". Prerequisites are port 8080 and `VIDFRIENDS_ALLOW_PUBLIC_SIGNUP=true`. The critical path it records is the clearest statement of the intended core journey:
  `auth → send (link) → watch → like → comment → history → admin toggle`
- **`index.html` / `vite.config.ts`.** Meta description: "VidFriends — share shortform videos with friends". The app is a PWA (`vite-plugin-pwa`, `display: standalone`, theme `#030712`).
- **Commit messages:**
  - `0a275a0`: initial React/Vite app.
  - `13077d0`: Dockerfile, nginx, CI, Vitest.
  - `9aab5d1` (VID-354): 14 test files, plus a "Fix HistoryPage: add aria-label attributes on date inputs".
  - `5809d7c` (VID-441): "Alpha release prep — collections, clean UI, E2E tests". Adds collection detail/index/import pages, EmptyState, LazyImage, Playwright, Dependabot and offline.html.
- **Recorded decisions with rationale.** There are no ADRs or REVIEW docs in the web repo. The only decisions are implicit in UI copy:
  - Eviction is a **soft delete**. `AdminPage.tsx` says: "the video data is retained but marked as deleted and no longer served". The same screen contradicts this (see A7).
  - YouTube import requires Google OAuth and is "coming soon" (`ImportCollectionPage.tsx`).
  - Admin QR codes exist "to share the platform with others" (`AdminPage.tsx`, QR tab). This pairs with the iOS QR server-URL onboarding.

### A2. Routes, screens and user journeys

Routes are defined in `src/App.tsx`. `ProtectedRoute` checks `isReady` then `isAuthenticated`. `PublicRoute` redirects authenticated users to `/`. `AdminRoute` additionally requires `user.role === 'admin'`. Everything except `/`, `/login` and `/register` renders inside `components/Layout.tsx`, which provides the top nav and a mobile hamburger.

| Route | Component | What it does | Status |
|---|---|---|---|
| `/login` | `pages/LoginPage.tsx` | Email and password. On success, navigates to **`/send`**, not `/`. | IMPL+TESTED (`test/pages/LoginPage.test.tsx`, `e2e/specs/auth.spec.ts`) |
| `/register` | `pages/RegisterPage.tsx` | Email, username, optional display name, password. Client-side check that the password is at least 8 characters. Navigates to `/send`. No invite-code field. | IMPL+TESTED (`RegisterPage.test.tsx`, `auth.spec.ts`) |
| `/` | `pages/FeedPage.tsx` | Full-screen vertical "TikTok-style" feed with **For You** (`GET /api/feed/fyp`) and **Discover** (`GET /api/feed`) tabs. Virtualized with `react-window` `List`; each row is one viewport tall, with scroll snapping after 150 ms (`SNAP_DELAY`). The active card autoplays muted and looped. The next video is preloaded with `<link rel=preload as=video>`. If FYP is empty or errors, it falls back to Discover. Has a refresh button. **Not wrapped in `Layout`, so the feed has no navigation bar.** | IMPL+TESTED (`FeedPage.test.tsx`, `FeedIntegration.test.tsx`) |
| `/send` | `pages/SendPage.tsx` | Two-step flow. Step 1 is either "Paste Link" (`POST /api/videos/from-link` with url, title, description) or "Upload File" (drag-and-drop or picker, `accept="video/*"`, XHR multipart to `POST /api/videos/upload` with a progress bar). Step 2, "Share with a friend", uses `FriendPicker` plus an optional caption (max 200), sends `POST /api/send/{recipientUserId}`, and has a "Skip" option. | Link path: IMPL+TESTED (E2E `send.spec.ts`). Upload: only the mode toggle is E2E-tested; no unit test. |
| `/inbox` | `pages/InboxPage.tsx` | Videos friends sent you, split into "New" (unread) and "Watched" sections. Shows an unread count badge and relative timestamps ("5m ago"). "Load more" pagination (limit 20, offset). Clicking an item marks it read (`POST /api/inbox/{id}/read`) and opens `/videos/{video_id}`. | IMPL-UNTESTED (no unit or E2E test) |
| `/history` | `pages/HistoryPage.tsx` | `GET /api/history` in a table (video, from, watched at, progress). Client-side text search on title or user, a date-range filter, and 10-per-page pagination. | IMPL+TESTED (`HistoryPage.test.tsx`, `e2e/specs/history.spec.ts`) |
| `/profile` | `pages/ProfilePage.tsx` | Own profile only: avatar or initials, display name, @username, email, member since. Stat cards for the number of videos, total likes and total comments, computed client-side. Grid of own videos (`GET /api/users/{id}/videos`). **No edit, no friends management, no viewing other users.** | IMPL-UNTESTED (only an indirect E2E assertion that the email shows) |
| `/videos/:id` | `pages/VideoPlayerPage.tsx` | Custom `VideoPlayer`, title, uploader, description, `LikeButton`, `ShareButton` and `CommentSection`. Marks the video watched once 3 s have played. | IMPL+TESTED for the components (`VideoPlayer.test.tsx`, `LikeButton.test.tsx`, `ShareButton.test.tsx`, `CommentSection.test.tsx`). The page itself is E2E-tested (`video.spec.ts`: like, comment, reply). |
| `/collections` | `pages/CollectionsIndexPage.tsx` | Grid of collections with create (inline form), rename (inline, Enter/Escape) and delete (inline confirm). | IMPL+TESTED (`CollectionsIndexPage.test.tsx`; rename and delete themselves untested) |
| `/collections/import` | `pages/ImportCollectionPage.tsx` | "Paste URLs" tab: one URL per line, `POST /api/collections/import/urls`, then a results table (imported/skipped/failed) and "View Collection". If the response has no results, it polls `GET /api/collections/{id}` every 2 s. "From YouTube" tab: a disabled "Connect YouTube" button. | Paste: IMPL+TESTED (`ImportCollectionPage.test.tsx`). YouTube: STUBBED. |
| `/collections/:id` | `pages/CollectionDetailPage.tsx` | Collection name and video count, rename, delete, and a list of videos (filename, duration) with remove buttons. "Add Video" opens a modal listing your own videos (`GET /api/users/{me}/videos`) to pick one. | IMPL+TESTED (`CollectionDetailPage.test.tsx`; add and remove untested) |
| `/admin` | `pages/AdminPage.tsx` | Admin-only. Six tabs (detail in A4). | IMPL+TESTED (`AdminPage.test.tsx`, `e2e/specs/admin.spec.ts`) |
| `*` | n/a | Redirects to `/`. | IMPL+TESTED (`App.test.tsx`) |

**Journeys as implemented:**
1. **Onboard.** Register (public signup) leads to `/send`. There is no onboarding tour and no email verification.
2. **Share.** Paste a link or upload a file, the video is created, pick a friend and add a caption, then send. The friend sees it in their Inbox, which links to the player.
3. **Consume.** The For You / Discover feed autoplays muted cards. Tapping the comment icon opens `/videos/:id`, where the user can like, share (Web Share API or copy link) and comment or reply (one level of threading).
4. **Organize.** Create collections, add your own uploaded videos, or bulk-import URLs into a new collection.
5. **Administer.** Stats, user role/status/quota editing, user deletion, eviction, storage breakdown, audit log, QR codes.

**Missing journeys, with no UI at all:**
- Adding or accepting friends. `FriendPicker` copy says "Add friends from the profile page", but no such feature exists.
- Editing the profile. `api.auth.updateProfile` exists in the client but is unused.
- Viewing another user's profile. `api.users.getProfile` exists but is unused.
- Deleting your own video or comment.
- Logout via the API. Logout is client-side only and does not call the backend's `POST /api/auth/logout`.
- Account deletion. The backend has `DELETE /api/auth/me/account`.
- Admin invites, despite the `admin_create_invite` activity label and a backend `GET/POST /api/admin/invites`.

### A3. API calls, data models, auth, configuration

**HTTP client.** `src/lib/api.ts` uses `request<T>()` over `fetch`. `BASE = '/api'` is a relative path, so the same origin is always used. It sets the `Content-Type: application/json` header. If `localStorage.token` exists it adds `Authorization: Bearer <token>`. When the response is not OK it throws `new Error(body.error || "Request failed: <status>")`. There is no 401 handling, no retry and no refresh. Upload uses a raw `XMLHttpRequest` so it can report progress.

**Endpoints called** (method, path, payload, then the expected response):

| Area | Call | Payload → expected response | Used by |
|---|---|---|---|
| Auth | `POST /api/auth/register` | `{email, username, password, display_name?}` → `{token}` | AuthContext.register |
| | `POST /api/auth/login` | `{email, password}` → `{token}` | AuthContext.login |
| | `POST /api/auth/refresh` | (no body) → `{token}` | **unused** |
| | `GET /api/auth/me` | → `{user: User}` | AuthContext (boot, after login/register) |
| | `PUT /api/auth/profile` | `{display_name?, avatar_url?}` → `{user}` | **unused** |
| Videos | `POST /api/videos/from-link` | `{url?, title?, description?}` → `{id}` | SendPage |
| | `POST /api/videos/upload` | multipart: `file`, `title?`, `description?` → `{id}` | SendPage |
| | `GET /api/feed` | → `Video[]` | FeedPage (Discover, and FYP fallback) |
| | `GET /api/feed/fyp` | → `Video[]` | FeedPage (For You) |
| | `GET /api/videos/{id}` | → `Video` | VideoPlayerPage |
| | `POST /api/videos/{id}/like` | → `{status}` | VideoCard, VideoPlayerPage |
| | `DELETE /api/videos/{id}/like` | → `{status}` | same as like |
| | `GET /api/videos/{id}/comments` | → `Comment[]` | CommentSection |
| | `POST /api/videos/{id}/comment` (singular) | `{body, parent_id: string\|null}` → `{id, created_at}` | CommentSection |
| | `POST /api/videos/{id}/watched` | `{progress_seconds}` → `{status}`. **Always sends 0**, because callers never pass progress. | VideoCard (60% visible), VideoPlayerPage (after 3 s played) |
| History | `GET /api/history` | → `WatchHistoryEntry[]` | HistoryPage |
| Inbox | `GET /api/inbox?limit=20&offset=N` | → `ReceivedVideo[]` | InboxPage |
| | `POST /api/inbox/{id}/read` | → `{status}` | InboxPage |
| Friends | `GET /api/friends` | → `Friend[]` | FriendPicker |
| | `POST /api/send/{recipientUserId}` | `{video_id, caption: string\|null}` → `{id, created_at}` | SendPage |
| Users | `GET /api/users/{id}/profile` | → `{user, video_count}` | **unused** |
| | `GET /api/users/{id}/videos` | → `Video[]` | ProfilePage, CollectionDetail "Add video" modal |
| Collections | `GET /api/collections` | → `{collections: Collection[]}` | CollectionsIndexPage |
| | `GET /api/collections/{id}` | → `{collection}` | CollectionDetailPage, import polling |
| | `POST /api/collections` | `{name}` → `{collection}` | CollectionsIndexPage |
| | `PATCH /api/collections/{id}` | `{name}` → `{collection}` | rename (both pages) |
| | `DELETE /api/collections/{id}` | → void (but `request()` calls `res.json()`, so a 204 would throw) | delete (both pages) |
| | `GET /api/collections/{id}/videos` | → `{videos: CollectionVideo[]}` | CollectionDetailPage |
| | `POST /api/collections/{id}/videos` | **`{videoId}` (camelCase, inconsistent with every other payload)** → void | CollectionDetailPage |
| | `DELETE /api/collections/{id}/videos/{videoId}` | → void | CollectionDetailPage |
| | `POST /api/collections/import/urls` | `{urls: string[]}` → `{collection_id, collection_name?, results: [{url, status: imported\|skipped\|failed, title?, error?}]}` | ImportCollectionPage |
| Admin | `GET /api/admin/stats` | → `{total_videos, total_users, total_likes, total_comments, total_storage_bytes, storage_quota_bytes, storage_usage_pct}` | AdminPage |
| | `GET /api/admin/users` | → `{users: AdminUser[]}` | AdminPage |
| | `PATCH /api/admin/users/{id}` | `{role?, status?, upload_quota_bytes?: number\|null}` → `{user}` | AdminPage |
| | `DELETE /api/admin/users/{id}` | → `{status}` | AdminPage |
| | `GET /api/admin/storage` | → `[{user_id, username, storage_used}]` | AdminPage |
| | `POST /api/admin/eviction/run` | `{strategy, age_days}` or `{strategy:'manual', video_id}` → `{status, evicted}` | AdminPage |
| | `GET /api/admin/activity?limit&offset&action` | → `{entries, total, limit, offset}` | AdminPage |
| (E2E only) | `GET /api/health` | → `{status}` | `e2e/helpers/api.ts`, CI |

**Client data models** (`src/lib/types.ts`):
- `User{id,email,username,role,display_name?,avatar_url?,created_at,updated_at}`
- `Video{id,user_id,title,description?,file_url?,thumbnail_url?,duration?: string,status:'processing'|'ready'|'failed'|'deleted',created_at,updated_at,user_name,like_count,comment_count,liked?}`
- `Comment{id,user_id,user_name,parent_id?,body,created_at}`
- `WatchHistoryEntry{id,title,thumbnail_url?,user_name,watched_at,progress_seconds}`
- `ReceivedVideo{id,video_id,title,thumbnail_url?,sender_id,sender_name,caption?,read_at?,created_at}`
- `Friend{id,user_id,username,status,created_at}`
- `Collection{id,user_id,name,video_count,created_at,updated_at}`
- `CollectionVideo{id,user_id,filename,mimetype,size,duration:number|null,created_at}`. This is a **different shape from `Video`**: it is file-centric.
- Admin types: `AdminStats`, `AdminUser{…,status?,storage_used,upload_quota_bytes|null,last_active_at?}`, `StorageBreakdown`, `EvictionResult`, `ActivityEntry{actor_id?,actor_email?,action,entity_type,entity_id?,metadata?,ip_address?}`, `ActivityLogResponse`, `ImportUrlResult`/`ImportUrlsResponse`.
- `AuthState` in `types.ts` is dead code; it is superseded by `AuthContextValue`.

**Auth and token storage** (`src/context/AuthContext.tsx`):
- A single JWT is stored in `localStorage['token']`.
- On boot, if a token exists it calls `/auth/me`. On failure it removes the token. `isReady` gates routing.
- `isAdmin = user.role === 'admin'`. Logout clears local state only.
- There is no refresh-token handling, no expiry handling, and no cross-tab sync.
- E2E tests inject auth by running `localStorage.setItem('token', …)` via `page.evaluate`.

**Server URL configuration.**
- None at runtime. The API is always same-origin `/api`.
- In development, Vite proxies `/api` to `http://localhost:8080` (`vite.config.ts`).
- In production, nginx proxies `/api/` to the hard-coded upstream `http://backend:8080` (`nginx.conf`). There are no environment variables or `VITE_*` settings.
- **QR:** the Admin "QR Codes" tab (`QRCodeSVG` from `qrcode.react`) renders a QR code of `window.location.origin` (the "Current Server URL"), with presets for the platform URL and `/register`, a custom URL field, SVG download, and copy-to-clipboard. In practice this is the **server-pairing QR for the iOS app**, which scans a server URL during onboarding (§B3), though neither repo documents the link.

### A4. Feature details

- **Playback.**
  - `components/VideoPlayer.tsx` is a custom player built on `<video>`. It has click-to-toggle play/pause, a big play overlay, a progress bar showing buffered and played ranges (`role="slider"` with aria values, click to seek), a time display, and controls that auto-hide after 3 s while playing.
  - There is no volume control, fullscreen, playback rate, captions or keyboard shortcuts.
  - `onProgress` is called on every `timeupdate`.
  - In the feed, `components/VideoCard.tsx` plays the active card muted and looped with `playsInline`, and pauses when it is less than 60% visible. Non-active cards show the thumbnail through `LazyImage` (IntersectionObserver with a 100 px margin) or a `<video preload=none>`. If the video has no `file_url`, a "play" glyph overlays the card.
  - The overlay shows the uploader's avatar initial and name, the title, a 2-line description, a like button with count, and a comment button with count that navigates to the player page.
- **Watch tracking.** `VideoCard` marks a video watched the first time its card is at least 60% visible, even for thumbnail-only cards. `VideoPlayerPage` marks it after 3 s of playback. Both send `progress_seconds: 0`.
- **Sharing.**
  - In-app send to a friend, with a caption, from SendPage.
  - `ShareButton` uses `navigator.share({url: '/videos/:id'})` when available (a relative URL). Otherwise it copies `${origin}/videos/:id` to the clipboard, falling back to `execCommand('copy')`, and shows "Copied!" for 2 s.
- **Collections.** CRUD and add/remove of the user's own videos, plus bulk URL import into a **new** collection. The backend creates the collection, named through `collection_name`. YouTube OAuth import is stubbed.
- **Feeds.** "For You" (`/feed/fyp`) and "Discover" (`/feed`). There is no pagination or infinite scroll on the web: each feed is fetched as a single list.
- **Friends.** The only use is the read-only friend list inside `FriendPicker`. Search starts when the user types; the list is not shown until the user searches.
- **Comments.** One level of threading. Top-level comments are sorted newest first and replies oldest first. Bodies are limited to 500 characters. There is no edit or delete. Reply failures are silently swallowed (`ReplyForm`).
- **Likes.** Toggled with a non-optimistic update: the count changes after the API succeeds. Failures are silent.
- **Notifications.** None. There is no WebSocket use (the backend has `GET /api/ws`) and no push. The only "notification" is the inbox unread badge on the Inbox page; there is no badge in the nav.
- **Admin** (`pages/AdminPage.tsx`, about 790 lines):
  - *Overview:* stat cards for total videos, users, storage and usage %, plus a storage bar that turns yellow above 70% and red above 90%. Likes and comments are fetched but not displayed.
  - *Users:* a table with inline-editable role (user/admin), status (active/suspended/disabled) and upload quota in raw bytes (empty means unlimited), plus delete with inline confirmation.
  - *Storage:* per-user breakdown with share-of-total bars.
  - *Eviction Policy:* bulk eviction by strategy `age` / `least_recently_watched` / `least_liked` / `oldest_watched` with an age threshold in days (default 90), and single-video eviction by UUID.
  - *Activity Log:* audit log with action filters (`admin_update_user`, `admin_delete_user`, `admin_eviction_run`, `admin_delete_video`, `admin_create_invite`), 50 per page, and truncated metadata JSON.
  - *QR Codes:* see A3.

### A5. Stack, build, configuration, deployment, CI, tests

- **Stack** (`package.json`):
  - Runtime dependencies: `react` 19.2, `react-dom`, `react-router-dom` 7.18, `react-window` 2.2, `qrcode.react` 4.2.
  - Dev dependencies: Vite 8, `@vitejs/plugin-react` 6, Tailwind 4 (`@tailwindcss/vite`), `vite-plugin-pwa` 1.3, TypeScript ~6.0, ESLint 10 (flat config with typescript-eslint, react-hooks and react-refresh), Vitest 4, jsdom 29, Testing Library, Playwright 1.61.
  - `tsconfig.app.json` is strict-ish: `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `verbatimModuleSyntax`.
- **Scripts:** `dev`, `build` (`tsc -b && vite build`), `lint`, `typecheck`, `test` (`vitest run`), `test:e2e` / `test:e2e:ui` (Playwright with `e2e/playwright.config.ts`), `preview`.
- **Styling:** Tailwind utility classes inline. The only CSS is `src/index.css` with `@import "tailwindcss"`. There is no design-token layer and no component library.
- **Docker** (`Dockerfile`): two stages. `node:22-alpine` runs `npm ci --ignore-scripts && npm run build`, then `nginx:1.27-alpine` serves `dist`.
- **nginx** (`nginx.conf`):
  - SPA fallback with `try_files … /index.html`.
  - `/api/` is proxied to `http://backend:8080` with WebSocket upgrade headers and X-Forwarded-* headers.
  - gzip is enabled.
  - Missing: `client_max_body_size` (see A7), caching headers, and security headers.
  - `.dockerignore` excludes tests and markdown.
- **PWA** (`vite.config.ts`): `registerType: 'autoUpdate'`, Workbox `navigateFallback: '/offline.html'`, and a manifest. The manifest is duplicated in `public/manifest.webmanifest`. `public/icon-192.png` and `icon-512.png` are **70-byte placeholders**, not real icons.
- **CI** (`.github/workflows/ci.yml`):
  - Job `quality` runs Node 22: `npm ci`, lint, typecheck, test, build.
  - Job `e2e` uses Postgres 16 and MinIO service containers, checks out `vidfriends/backend`, runs `golang-migrate`, creates the bucket with `mc`, builds and runs `./cmd/server`, waits on `/api/health`, builds the web app, runs `npm run preview` (port 4173) and Playwright, uploads the report, and kills the backend. Several defects mean this job very likely never passed (see A7).
- **Dependabot** (`.github/dependabot.yml`): weekly on Mondays at 09:00 America/Chicago for npm (minor and patch grouped, at most 5 PRs), Docker and GitHub Actions.
- **Local E2E stack** (`e2e/docker-compose.e2e.yml`):
  - Services: postgres, minio, minio/mc bucket creation, `backend` built from `../../vidflow`, and a `migrate/migrate:v4.18.2` container mounting `../../vidflow/migrations`.
  - Backend environment variables: `VIDFRIENDS_ADDR`, `_DATABASE_URL`, `_LOG_LEVEL`, `_JWT_SECRET`, `_S3_ENDPOINT/_ACCESS_KEY/_SECRET_KEY/_BUCKET/_USE_SSL`, `_ALLOW_PUBLIC_SIGNUP=true`, `_CORS_ORIGINS`. This is a useful record of the backend's configuration surface.
- **Unit tests** (Vitest + RTL + jsdom; `src/test/setup.ts` polyfills IntersectionObserver). There are 18 files with about 110 cases. Every test mocks `../lib/api` wholesale with `vi.mock`, so none exercise the real HTTP layer.
  - Components: CommentSection (7), FriendPicker (8), Layout (5), LikeButton (4), ShareButton (3), VideoCard (9), VideoPlayer (6).
  - Pages: Admin (9), CollectionDetail (8), CollectionsIndex (7), Feed (9), History (7), ImportCollection (7), Login (6), Register (7).
  - App routing (4) and FeedIntegration (2).
  - **Untested:** SendPage, InboxPage, ProfilePage, VideoPlayerPage, AuthContext error paths, LazyImage, EmptyState.
- **E2E** (Playwright, Chromium only, single worker, 1 retry in CI). Specs:
  - `auth.spec.ts`: register, login, logout, invalid login, redirects.
  - `send.spec.ts`: paste link and send to a friend; upload-mode toggle.
  - `video.spec.ts`: like; comment and reply.
  - `history.spec.ts`: watched video appears; empty state.
  - `admin.spec.ts`: stats, users tab, non-admin blocked, activity tab (no assertion).
  - Setup goes through the real API (`e2e/helpers/api.ts`), with unique users from `helpers/test-users.ts` and fixture `fixtures/auth-fixture.ts`.

### A6. Accessibility, i18n, theming, offline

- **Accessibility, positive:**
  - Most icon buttons have `aria-label`s (like/unlike, share, menu toggle with `aria-expanded`, refresh, delete user, edit quota).
  - Form fields use `<label htmlFor>`.
  - SVG empty-state illustrations are `aria-hidden`.
  - The upload drop zone is `role=button` with `tabIndex=0` and handles Enter/Space.
  - VID-354 added `aria-label`s to the date inputs.
- **Accessibility, negative:**
  - The "Mark as read" control in Inbox is a clickable `<span>` nested inside a `<button>`. That is invalid interactive nesting and not keyboard reachable.
  - The custom seek bar has `role="slider"` but no keyboard support.
  - The collection-detail modal has no `role="dialog"`, focus trap or Escape handling.
  - The collection rename and delete icon buttons rely on `title` only.
  - The feed has no keyboard navigation between cards and no unmute control; videos are always muted.
  - There are no captions.
  - Status messages are not announced (no `aria-live`).
  - Spinners have no accessible name, except two with `role="status"`.
- **i18n:** none. All strings are hard-coded English. Dates use `toLocaleDateString(undefined, …)`, so the format follows the browser locale. The relative times in Inbox ("5m ago") are hand-rolled English.
- **Theming:** the app is **dark-only**: `bg-gray-950` with indigo accents and amber empty-state illustrations. There is no light mode, no `prefers-color-scheme` handling and no tokens. The theme colour is `#030712`.
- **Offline:** a PWA service worker with `public/offline.html` ("You're offline", "Try again" reload). There is no data caching and no offline queue. The `navigateFallback` configuration is very likely buggy (A7).

### A7. Good ideas, bugs, pitfalls and contradictions (web)

**Good ideas to carry forward:**
- The **two-step Send flow**: create the video first (by link or upload), then optionally send it to a friend with a caption. Users can "Skip" to keep the video without sending it.
- The **vertical snap feed**: virtualized list, only the active card plays (muted, looped), next-video preload, and FYP falling back to Discover when FYP is empty.
- **Upload progress** through XHR, and drag-and-drop with a video-MIME filter.
- **Bulk URL import** with per-URL results (imported/skipped/failed plus reason) and "View Collection".
- An **admin console** covering stats, role/status/quota management, storage per user, eviction strategies (age, least recently watched, least liked, oldest watched), a filterable audit log, and **server QR codes for mobile pairing**.
- **Route guards** that wait on `isReady` to avoid a flash of the login page.
- Consistent loading, error-with-retry and empty states, including illustrated `EmptyState`s.
- **E2E conventions**: unique users per test, API-driven setup, UI-driven assertions, and a docker-compose stack documenting the backend environment.
- Dependabot grouping for npm minor and patch updates.

**Bugs and pitfalls (lessons):**
1. **Contract drift with the backend** at backend HEAD `b295904`:
   - Auth endpoints return `{access_token, refresh_token, expires_in}` (`internal/handler/auth.go` `AuthResponse`), but the web client reads `{token}`, so `localStorage.token` becomes `"undefined"`.
   - `/api/auth/me` returns a bare user object, but the web client destructures `{user}`.
   - `/api/feed` returns `{videos, next_page_token}` (`FeedResponse`), but the web client expects an array.
   - **No `/api/collections*` routes exist** in `internal/router/router.go`. The tables exist, and the backend has `/api/import` jobs instead.
   - `POST /api/auth/refresh` requires `{refresh_token}`.
   - Lesson: generate clients from a shared schema (OpenAPI) and contract-test them.
2. **Feed has no navigation.** `/` is outside `Layout`, so from the feed users can only reach video pages. Login and register redirect to `/send`, but `PublicRoute` redirects authenticated users to `/`. These are inconsistent landing pages, and E2E `auth.spec.ts` "redirect authenticated user to send page" expects `/send`, so it would fail.
3. **Watch history is inaccurate.** `progress_seconds` is always 0, and merely scrolling past a card marks it watched (`VideoCard` IntersectionObserver).
4. **PWA `navigateFallback: '/offline.html'`.** Workbox serves the fallback for every navigation that is not precached, so reloading a deep link such as `/videos/123` can show "You're offline" even when online. The fallback should be `index.html`, with offline detection handled separately.
5. **nginx has no `client_max_body_size`.** The default of 1 MB will reject most video uploads proxied through `/api/videos/upload`.
6. **ImportCollectionPage:** `r.title || r.url.length > 60 ? … : r.url` is an operator-precedence bug: the URL is always truncated whenever a title exists. Import polling completes on the first poll, because `video_count !== undefined` is always true.
7. **Admin Storage tab** shows a spinner forever when the breakdown is legitimately empty, because `storageBreakdown.length === 0 && !error` is treated as loading. The eviction and single-evict success/failure colour is chosen by checking whether the message contains "Error" or "Failed".
8. **Destructive actions** (delete user, delete collection) use inline confirms. "Delete collection and all its videos?" on the index page contradicts the detail page's "remove all its videos from the collection".
9. **`request()` always calls `res.json()`**, so DELETE endpoints returning 204 No Content would throw.
10. **`localStorage` JWT** is exposed to XSS. There is no refresh flow and no global 401 handling, so an expired token produces scattered error messages.
11. **Silent failures:** like, reply, inbox mark-read, load-more and friend-list errors are swallowed.
12. **`CollectionVideo` vs `Video`.** Collection rows render `filename` and link to `/videos/{id}`, which assumes the IDs match.
13. **CI E2E job is broken as written:**
    - GitHub `services:` cannot pass MinIO's `server /data` command.
    - `apt-get` runs without `sudo`, and `mc` is not an apt package.
    - `actions/upload-artifact` is given `working-directory`, which is invalid with `uses`, and the path resolves outside `web/`.
    - `kill %1` in a separate step does nothing.
    - The backend is started without `VIDFRIENDS_ALLOW_PUBLIC_SIGNUP`, `JWT_SECRET` or S3 environment variables. The backend defaults public signup to `false` (`internal/config/config.go:103`), so every E2E registration would fail.
    - It checks out `vidfriends/backend`, while compose builds `../../vidflow`.
    - Lesson: run E2E through the same docker-compose used locally.
14. **`e2e/specs/admin.spec.ts`** promotes a freshly registered user to admin by calling `PATCH /api/admin/users/{self}` with that user's own token. This either fails because the backend has `adminMW`, or it reveals privilege escalation. A seeded admin is needed.
15. **`e2e/specs/send.spec.ts`** expects a just-registered stranger to appear in `/api/friends` without any friendship being created.
16. **`auth.spec.ts`** looks for heading `/create account/i`, but the page heading is "Create an account", so the test would fail. `history.spec.ts` expects `video_id` in history entries, but `WatchHistoryEntry` has only `id`.
17. **Placeholder icons** (70-byte PNGs). The Dockerfile pins `nginx:1.27`, while Dependabot proposes 1.31.

**Contradictions between docs and code:**
- The README CI claim ("every push … runs lint, typecheck, tests, and a production build") is true for the `quality` job only. The e2e README claims E2E runs in CI, but the job is non-functional (item 13).
- The e2e README names the backend "vidflow". The CI file uses `vidfriends/backend`. The repository is `vidfriends-backend`.
- `FriendPicker` says "Add friends from the profile page", but the profile has no friend features.
- The eviction description says "soft-delete … data is retained", but the single-eviction help says "Permanently deletes a single video by ID from storage".
- The History empty state says "after you start watching videos sent by friends", but history is populated from any feed card scrolled into view.

---

## Part B — iOS (`VidFriends_vidfriends-ios`)

### B1. Product intent and recorded decisions

- There is **no README**. Intent comes from `REVIEW-VID-145.md`, `review-sweep-VID-267.md`, code and copy.
- **Positioning:** "Connect to your self-hosted server" (`Views/Onboarding/ServerSetupView.swift`). The app is a client for **self-hosted** VidFriends servers, paired by URL or QR.
- **Signup is invite-only on iOS:** "An admin invite code is required to register." (`Views/Onboarding/AuthView.swift`). It uses `POST /api/auth/register` with `invite_code`. This conflicts with the web client's open registration; the backend supports both through `VIDFRIENDS_ALLOW_PUBLIC_SIGNUP`.
- **`REVIEW-VID-145.md`** (2026-06-15, iOSSenior approving iOSJunior's change) fixes `QRScannerController`:
  1. Keep a strong `captureSession` property, because a local session was being deallocated and the preview went black.
  2. Remove the UIKit `dismiss(animated:)` call and let SwiftUI dismiss the sheet, because a double dismiss crashed with `UIViewControllerHierarchyInconsistency`.
  3. Add `viewDidLayoutSubviews` to resize the preview layer.
  4. Guard `canAddOutput`.
  - Rationale recorded: "minimal and targeted, follows existing `VideoRecorderController` conventions".
- **`review-sweep-VID-267.md`** approves 8 items. It records these intents:
  - VID-252: offline caching, unsend, block, push.
  - VID-253 / VID-86: polish (launch screen, app icon, accessibility, error states).
  - VID-69: auth and feed. "Feed has blocked-user filtering", and "Video player has a 5-second watch threshold before download button appears".
  - VID-70 / VID-110 / VID-82: send and social. "Friend picker supports both search and existing friends list. Inbox has swipe-to-accept/reject. Collections CRUD is complete."
  - VID-97: Server URL and QR onboarding.
  - Recorded follow-ups: migrate `AVCaptureMovieFileOutput` to `AVAssetWriter` (tech debt); `ProfileView.unsendVideo()` optimistic removal; cache the `ISO8601DateFormatter` (now done: `OfflineService.dateFormatter`); use a background `URLSession` for downloads; simplify `NWPathMonitor` dispatch.
  - Its summary: "No BLOCKER or CRITICAL issues found." That is contradicted below.

### B2. Screens and user journeys

The app entry is `App/VidFriendsApp.swift`. It injects `AppState`, creates a SwiftData container (`UserModel, VideoModel, FriendModel, CommentModel, DownloadedVideo`), and forwards the APNs device token. `ContentView.swift` shows an onboarding flow when unauthenticated and otherwise a **7-tab `TabView`**: Feed, Send, Inbox, History, Collections, Offline, Profile.

| Screen | File | Behavior | Status |
|---|---|---|---|
| Server setup | `Views/Onboarding/ServerSetupView.swift` | Enter a URL (https:// is prepended if no scheme; `sanitizedURL`). "Test Connection" calls `GET /api/health` and expects `status` of `"ok"` or `"healthy"`. "Scan QR Code" uses an AVFoundation QR scanner that fills the URL field. Then "Continue". The URL is saved to the keychain (`OnboardingCoordinator.didConnect`). | IMPL+TESTED (`ServerSetupTests.swift`: sanitizer and coordinator transitions; the scanner is untested) |
| Auth | `Views/Onboarding/AuthView.swift` (`OnboardingAuthView`) | Segmented Log In / Sign Up. Signup requires username and **invite code**; display name is optional. | IMPL-UNTESTED (only the endpoint and encoding are tested) |
| Biometry opt-in | `Views/Onboarding/BiometryOptInView.swift` | Offers Face ID / Touch ID. On success it sets `UserDefaults["biometry_enabled"]`, then `completeAuth`. | STUBBED: the flag is never read, and there is no biometric unlock at launch. |
| Feed ("FYP") | `Views/Feed/FeedView.swift` → `FYPFeedView.swift`, `FYPVideoCell.swift`, `CommentsView.swift` | Paging vertical `ScrollView` (`.scrollTargetBehavior(.paging)`), cursor pagination that loads more at the second-to-last item, pull to refresh, "You're all caught up!". Videos from blocked users are filtered out. Each cell has an `AVPlayer` that autoplays on appear (with sound) and stops on disappear, plus like, comments sheet and share (`UIActivityViewController` with `file_url` and title). | IMPL-UNTESTED (only the stub feed and `FeedResponse` decoding are tested). **Does not compile** (B7). |
| Comments sheet | `Views/Feed/CommentsView.swift` | List with pull to refresh, post comment (top-level only), appended locally. There is no reply UI, although `parentId` is supported in the API. | IMPL-UNTESTED |
| Send | `Views/Send/SendVideoView.swift`, `FriendPickerView.swift`, `UploadProgressView.swift`, `VideoRecorderView.swift` | Source is either "Choose" (PhotosPicker, videos only) or "Record" (an AVCaptureSession camera and microphone recorder). Then choose a recipient: either your friends list, or a user search (`GET /api/users?q=`) that excludes yourself. Optional "comment". Upload with progress, retry and cancel. Success screen. | IMPL-UNTESTED (stub upload progress test only) |
| Inbox | `Views/Inbox/InboxView.swift` | List of received videos with status `pending` / `accepted` / `rejected`. Swipe right to accept and left to reject (`PATCH /api/inbox/{id}`). A foreground-push **in-app banner** has accept and dismiss. Tapping a row opens `VideoReceiverView`, which plays the video through `VideoPlayerView` (download button after 5 s) and offers Accept / Reject. | IMPL-UNTESTED |
| History | `Views/History/HistoryView.swift` | List with `.searchable` (title or friend), pull to refresh, and a progress bar (`progressSeconds/100`). | IMPL-UNTESTED |
| Collections | `Views/Collections/CollectionsView.swift` | List, "New" (alert with a text field), swipe to delete, and a detail view listing the collection's videos (`VideoWithUser`). There is **no rename, no add or remove video, and no import**. | IMPL-UNTESTED (stub and model tests only) |
| Offline | `Views/OfflineDownloads/OfflineDownloadsView.swift` | SwiftData `@Query` of `DownloadedVideo`s showing size and date. Swipe to delete with confirmation. Local playback with `AVPlayer`. | IMPL+TESTED for the service (`DownloadService` init and size formatting tests); the UI is untested. |
| Profile | `Views/Profile/ProfileView.swift`, `BlockedUsersView.swift` | Profile header with edit display name (alert), "Sent Videos" with swipe to **Unsend** (confirmation, then `POST /api/videos/{id}/unsend`), "Received" list, and Blocked Users (list and unblock). There is **no logout button anywhere in the UI** (`AppState.logout()` is never called from a view). | IMPL-UNTESTED |
| User profile sheet (block/unblock) | `Views/Profile/UserProfileSheetView.swift` | Block and unblock with confirmations. | STUBBED: it is only instantiated in `#Preview`, so the block flow is unreachable. |
| Deep-link / push video detail | `ContentView.swift` `VideoDetailView` | Opened by `onOpenURL` (`<scheme>://video/<id>`) or a tapped push (`aps.video_id` or `aps.data.video_id`). Shows the thumbnail, title and uploader only, with no playback. | STUBBED: no URL scheme is registered in `Info.plist`. |
| Share extension | `Sources/VidFriendsShareExtension/ShareViewController.swift` | System share sheet for one movie. It takes a caption, lets you pick a recipient (an alert to type a username or email, then the first search hit), and uploads, creates and sends. It reads the token and server URL from the shared keychain. | IMPL-UNTESTED (see B7 for keychain and app-group issues) |

**Journeys:**
1. First launch: Server URL (typed or scanned from the **web Admin QR**), then health check, then Log In or Sign Up with an invite code, then the biometry offer, then the main tabs.
2. Send: pick or record a video, pick a friend or searched user, add a comment, then upload (`/api/upload`), create (`/api/videos`) and send (`/api/videos/{id}/send`).
3. Receive: a push arrives (in-app banner when foregrounded). In Inbox the user accepts or rejects, watches, and after 5 s can download for offline.
4. Watch: the paging feed with like, comments and system share.
5. Moderate self: unsend sent videos and unblock users. Blocking is unreachable.

### B3. API calls, models, auth, server URL / QR

**Client:**
- `Networking/APIClient.swift` (an `actor`) with `Networking/Endpoint.swift` (path, method and `requiresAuth` per case) and `APIClientProtocol.swift`.
- `Stubs/StubAPIClient.swift` is a full fake used by tests and previews. It is selectable only through `AppState.setEnvironment(useStub: true)`, which nothing in the UI calls.
- JSON uses `keyDecodingStrategy = .convertFromSnakeCase` and `keyEncodingStrategy = .convertToSnakeCase`, and models also declare explicit snake_case `CodingKeys` (see B7).
- Timeouts are 30 s per request and 60 s per resource.
- Errors map to `APIError`: `invalidURL`, `invalidResponse`, `unauthorized` (401), `notFound` (404), `serverError(code, message from {error})`, `networkError`, `decodingFailed`, `tokenExpired`, `refreshFailed`.

**Endpoints** (paths include `/api`; baseURL is the server root):

| Call | Method and path | Body → expected response |
|---|---|---|
| register | `POST /api/auth/register` | `{email, username, password, display_name?}` → `{token}` |
| registerWithInvite | `POST /api/auth/register` (same path) | `{email, username, password, display_name?, invite_code}` → `{token}` |
| login | `POST /api/auth/login` | `{email, password}` → `{token}` |
| refreshToken | `POST /api/auth/refresh` (bearer = the current, possibly expired, token; no body) | → `{token}` |
| checkHealth | `GET /api/health` (no auth) | → `{status: "ok" \| "healthy"}` |
| getFeed (unused) / getPaginatedFeed | `GET /api/feed[?cursor=…]` | → `[Video]` / `{videos, next_cursor}` (two incompatible shapes for one path) |
| getVideoDetail | `GET /api/videos/{id}` | → `Video` |
| createVideo | **`POST /api/videos`** | `{url?, title?, description?}` → `{id}` |
| like / unlike | `POST` / `DELETE /api/videos/{id}/like` | → `{status}` |
| getComments / postComment | `GET /api/videos/{id}/comments` / `POST /api/videos/{id}/comment` | `{body, parent_id?}` → `{id, created_at}` |
| markWatched | `POST /api/videos/{id}/watched` | `{progress_seconds}`. **Never called from UI.** |
| getHistory | `GET /api/history` | → `[WatchHistoryEntry]` |
| searchUsers | `GET /api/users?q=` | → `{users: [UserSearchResult]}` |
| sendVideo | **`POST /api/videos/{id}/send`** | `{to_user_id}` → `{status}` (no caption) |
| getInbox / updateInboxItem | `GET /api/inbox` / `PATCH /api/inbox/{id}` | `{status: "accepted" \| "rejected"}` |
| getFriends | `GET /api/friends` | → `[Friend{id, requester_id, addressee_id, status, username?, display_name?, …}]` |
| getFriendRequests (unused) | `GET /api/friends/requests` | → `[Friend]` |
| respondToFriendRequest (unused) | **`PATCH /api/friends/{id}`** | `{status: accepted \| rejected}` |
| getCurrentUser | `GET /api/auth/me` | → bare `User` |
| updateProfile | **`PATCH /api/auth/me`** | `{display_name?}` → `User` |
| getCollections / createCollection | `GET` / `POST /api/collections` | → `[Collection]` (bare array) / `Collection` |
| getCollectionVideos | `GET /api/collections/{id}/videos` | → `[VideoWithUser]` |
| add/removeVideoToCollection (unused) | `POST /api/collections/{id}/videos` `{video_id}` / `DELETE /api/collections/{cid}/videos/{vid}` | → `{status}` |
| deleteCollection | `DELETE /api/collections/{id}` | → `{status}` |
| getSentVideos | **`GET /api/videos/sent`** | → `[SentVideo{id, video_id, recipient_id, recipient_name, title, thumbnail_url?, created_at}]` |
| unsendVideo | `POST /api/videos/{id}/unsend` | → `{status}` |
| registerPushToken | `POST /api/push/register` | `{token: hex APNs token, platform: "ios"}` |
| getPushSettings / updatePushSettings (unused in UI) | `GET /api/push/settings` (**update also uses GET with a body**) | `{notifications_enabled, new_video_alerts, friend_request_alerts}` |
| uploadVideo | **`POST /api/upload`** multipart, field `file`, `Content-Type: video/mp4` | → `{url, file_name}` |
| downloadVideo | `GET /api/videos/{id}/download` | → `{url, file_name?}`. The app then GETs `url` directly with `URLSession.shared`. |
| block / unblock | **`POST` / `DELETE /api/users/{id}/block`** | → `{status}` |
| getBlockedUsers | **`GET /api/users/blocked`** | → `[BlockedUser{id, username, display_name?, blocked_at}]` |

**Models:**
- In `Models/`: `User`, `Video`, `VideoWithUser`, `Comment`, `Friend` (requester/addressee shape), `InboxItem{id, video_id, from_user_id, from_user_name, title, thumbnail_url?, status, created_at}`, `Collection{…, video_count?}`, `SentVideo`, `Like`, `WatchHistoryEntry`, `BlockedUser`, `PushSettings`, `VideoDownloadResponse`, `UploadResponse`.
- `Networking/APIResponseTypes.swift` holds `StatusResponse` and `FeedResponse{videos, nextCursor}`.
- SwiftData models: `UserModel`, `VideoModel`, `FriendModel`, `CommentModel`, `DownloadedVideo{@unique videoId, title, fileName, localFileURL, thumbnailURL?, duration?, downloadedAt, fileSize}`.

**Auth and token storage:**
- `Services/KeychainService.swift` uses KeychainAccess with `whenUnlockedThisDeviceOnly`, not synchronizable, service `com.vidfriends.app`. In "app group" mode it uses access group `com.vidfriends.app` and **also mirrors the token and server URL in plaintext into `UserDefaults(suiteName: "group.com.vidfriends.app")`**.
- `AppState` loads the token at launch, which counts as authenticated, and fetches `currentUser`.
- `Networking/AuthInterceptor.swift` (an actor) catches `APIError.unauthorized` and calls `refreshToken()`. On success it saves the token and retries once. On failure it clears the keychain and throws `refreshFailed`. Concurrent 401s during a refresh throw `tokenExpired` instead of waiting.
- `Services/AuthService.swift` holds `currentUser`.
- Biometry is opt-in but never enforced.

**Server URL configuration and QR pairing:**
- `OnboardingCoordinator` persists the URL in the keychain via `KeychainService()` (non-app-group instance) and skips to Auth on later launches if a URL is saved.
- `AppState.setEnvironment(baseURL:)` swaps in a new `APIConfig` and `APIClient` (and re-wires the interceptor and `DownloadService`). It is only called by "Test Connection".
- **`AppState.init` hard-codes `http://localhost:3100`**, while `APIConfig`'s default is `http://localhost:8080`, and the saved server URL is never loaded at launch (B7).
- `Info.plist` sets `NSAllowsLocalNetworking` (HTTP allowed for LAN or self-hosted servers on the local network).
- QR content is expected to be the plain server URL string. That matches the web Admin QR tab, which encodes `window.location.origin`.

### B4. Feature details

- **Playback.**
  - `Views/Common/VideoPlayerController.swift` wraps `AVPlayerViewController` with system controls and `.resizeAspect`.
  - In the feed, playback starts on appear with audio, disables hit testing on the player so the overlay buttons work, and tears down on disappear.
  - `VideoPlayerView` (from Inbox) has a tap-toggled overlay with a close button and a download button that appears after **5 s** (`watchTimeThreshold`), plus downloaded and in-progress indicators.
  - Offline playback uses the local file.
- **Sharing.**
  - In-app send via upload, create and send.
  - System share of the raw `file_url`, not an app link.
  - A share extension for sending from Photos or other apps.
  - An unsend that removes the item from the recipient's inbox, per the copy: "This will remove the video from X's inbox. This action cannot be undone."
- **Inbox semantics differ from web.** iOS uses explicit **accept/reject** (`status` pending/accepted/rejected). Web uses **read/unread** (`read_at`). The backend supports both (`PATCH /api/inbox/{id}` and `POST /api/inbox/{id}/read`) but returns `sender_*` and `read_at` fields, while iOS decodes `from_user_*` and `status`.
- **Collections.** List, create, delete and view only.
- **Feed.** Cursor-paginated, with blocked users filtered client-side (`AppState.blockedUserIds`, loaded at start and after block/unblock). It is named "FYP" but calls `/api/feed`, not `/api/feed/fyp`.
- **Friends.** Read-only list in the picker, plus user search. There is no add-friend or accept-request UI: the API methods exist but are unused.
- **Comments.** Top-level only. Timestamps are shown as raw ISO strings.
- **Likes.** Optimistic toggle in the cell, plus a parent update after the API call (double bookkeeping).
- **Notifications** (`Services/PushNotificationService.swift`):
  - Requests alert, badge and sound permission when authenticated, then registers for remote notifications.
  - The hex token is posted to `/api/push/register`.
  - Foreground notifications are shown as a banner and re-posted as `.didReceiveForegroundNotification`; Inbox turns these into an in-app accept banner.
  - A tap posts `.didTapNotification`, which opens `VideoDetailView`.
  - The expected payload has `video_id` inside `aps` or `aps.data`.
  - Push settings (`PushSettings`) exist in the API only.
- **Blocking.** Model, API and Blocked Users list with unblock exist. The block action is unreachable (B2).
- **Offline:**
  - `Services/DownloadService.swift` (download to `Documents/Downloads` and SwiftData) works end-to-end.
  - `Services/OfflineService.swift` (feed and comment caching, replaying a queued operation list), `Services/OfflineOperationQueue.swift` (an actor persisting operations to `UserDefaults`; operation types: like, unlike, comment, markWatched, inbox update, friend response, block, unblock, unsend) and `Services/NetworkMonitorService.swift` (`NWPathMonitor`) are **all STUBBED**. Nothing enqueues, nothing calls `cacheFeed` or `processPendingOperations`, and nothing reads `isConnected`.
- **Admin screens:** none on iOS.

### B5. Stack, build, configuration, tests

- **Stack:** Swift 5.9 tools, iOS 17+ (`Package.swift`, `platforms: [.iOS(.v17)]`), SwiftUI with the Observation framework (`@Observable`), SwiftData, AVKit/AVFoundation, PhotosUI, LocalAuthentication, Network, UserNotifications. The only dependency is `KeychainAccess` 4.2.2 or later (SPM).
- **Package layout:** library target `VidFriends`, target `VidFriendsShareExtension` (depends on `VidFriends`), and test target `VidFriendsTests`. The tests use the **Swift Testing** framework (`@Test`, `#expect`).
- **Xcode project** (`VidFriends.xcodeproj/project.pbxproj`):
  - Targets `VidFriends` (`com.vidfriends.app`), `VidFriendsShareExtension` (`com.vidfriends.app.share-extension`) and `VidFriendsTests`.
  - Deployment target iOS 17.0. `SWIFT_VERSION = 5.0`.
  - **It references only about 33 of the 57 Swift files and has no KeychainAccess package reference** (B7).
- **Entitlements:** app group `group.com.vidfriends.app`; keychain group `$(AppIdentifierPrefix)com.vidfriends.app`. **There is no `aps-environment` entitlement.**
- **Info.plist:** camera usage text mentions QR scanning only. `remote-notification` background mode. Portrait only. Launch screen colour and image. **There is no `NSMicrophoneUsageDescription`** (the recorder captures audio) and no `CFBundleURLTypes`.
- **Assets:** AccentColor, AppIcon and LaunchScreen sets contain `Contents.json` only. **There are no image files** in the repo.
- **CI:** none. There is no README, no fastlane and no workflow.
- **Tests** (`Sources/VidFriendsTests`, about 110 `@Test`s):
  - `APIClientTests.swift` checks endpoint path and method only.
  - `AuthInterceptorTests.swift` covers retry on 401, refresh failure, passthrough, non-401 errors, and concurrent `tokenExpired`.
  - `ServerSetupTests.swift` covers URL sanitizer, coordinator and `AppState.setEnvironment` cases.
  - `VidFriendsTests.swift` covers model encode/decode, StubAPIClient behaviour, the offline queue, `DownloadService`, `FeedResponse`, and comment request encoding.
  - No UI tests, no snapshot tests, and no real-network or `URLProtocol` tests.
  - `AuthInterceptorTests.swift` and `ServerSetupTests.swift` are not in the Xcode project.

### B6. Accessibility, i18n, theming, offline (iOS)

- **Accessibility:** this is a strength. Almost every control and row has `accessibilityLabel` and `accessibilityHint`. Decorative images are `accessibilityHidden`. Rows use `.accessibilityElement(children: .combine)`. Headers carry `.isHeader`. The like button exposes `accessibilityValue("N likes")`. The "Camera unavailable" label uses Dynamic Type (`adjustsFontForContentSizeCategory`). Shortcomings:
  - Some labels override meaningful content (`ContentUnavailableView` labels duplicate text).
  - Raw ISO dates are read aloud.
  - There is no reduced-motion handling for the autoplay feed.
- **i18n:** `defaultLocalization: "en"` in `Package.swift`, but there are no `.strings` or `.xcstrings` files. Strings are literal English, though SwiftUI `Text("…")` literals are localizable keys by default. Dates are mostly unformatted ISO strings: Inbox "Sent 2026-…", History, Comments, Sent videos.
- **Theming:** system semantic colours (`.secondary`, `.quaternary`, `systemGray6`, `.tint`) give automatic light and dark mode. The accent comes from the `AccentColor` asset (values in JSON). The feed is always black.
- **Offline:** downloads and offline playback work. Caching, the operation queue and connectivity awareness are stubbed (B4). The empty-state copy "Download videos from your feed" is wrong: download is only offered in the Inbox video player.

### B7. Good ideas, bugs, pitfalls and contradictions (iOS)

**Good ideas to carry forward:**
- **Self-hosted pairing:** a server URL with a health-check "Test Connection" before continuing, **QR scan pairing** (with the web Admin QR), the URL persisted, and a scheme auto-prepended.
- **Invite-code registration** for private instances.
- **`Endpoint` enum** centralizing path, method and auth requirements, with a protocol-based API client and a **full `StubAPIClient`** for previews and tests.
- An **actor-based client and auth interceptor** with retry after refresh.
- A **streamed multipart upload** (the file is written to a temp multipart body in 1 MB chunks, then `upload(fromFile:)`) with progress, so large videos are never loaded into memory. Retry and cancel are offered in the UI.
- **Video recording in-app** as well as library picking, and a **Share Extension** for sending from anywhere.
- **Inbox accept/reject**, a foreground-push in-app banner, **unsend** with a confirmation that explains the consequence, **block/unblock** with feed filtering.
- **Offline downloads** gated on a minimum watch time of 5 s, stored with SwiftData metadata, with an Offline tab and local playback.
- An **offline mutation queue** design (persisted operation enum replayed later). It is worth carrying forward as a design, though it was never wired.
- Consistent `ContentUnavailableView` empty and error states with Retry, plus pull-to-refresh everywhere.
- Thorough VoiceOver labelling.

**Bugs and pitfalls (lessons):**
1. **The app cannot compile as committed.**
   - `FYPFeedView.toggleLike` mutates `updated.liked` and `updated.likeCount`, which are declared `let` in `struct Video` (`Models/Video.swift`).
   - The `.xcodeproj` omits 24 files, including all Onboarding, History, Collections, Profile, Offline, `FYPFeedView`, `CommentsView` and the services for offline, download, biometry and network. It also lacks the KeychainAccess package reference.
   - The share extension target uses internal types from the `VidFriends` SPM target (not `public`).
   - There is no CI to catch any of this. The review sweep nonetheless declared "No BLOCKER".
   - Lesson: build and test in CI from day one.
2. **Snake-case decoding bug.** The decoder uses `.convertFromSnakeCase`, and models also declare `CodingKeys` raw values like `"user_id"` and `"file_url"`. With that strategy, JSON keys are converted to camelCase **before** matching, so explicit snake_case keys never match. Required fields such as `user_id` throw `keyNotFound`, and model decoding fails broadly. The model tests in `VidFriendsTests.swift` use the same decoder setup, so they would fail as well; this is further evidence the tests were never run. Lesson: use one strategy, not both.
3. **The server URL is not applied after relaunch.** `AppState.init` always builds the client with `http://localhost:3100` and never calls `keychainService.loadServerURL()`. After the first session, every request goes to localhost. The coordinator also uses a different `KeychainService` instance (no app group) from AppState and the share extension (app group), so the extension may not see the URL. The access group `"com.vidfriends.app"` also lacks the Team ID prefix that KeychainAccess requires.
4. **Token mirrored in plaintext** to app-group `UserDefaults`, which defeats keychain protection.
5. **Refresh is mis-designed.** It sends the expired access token instead of a refresh token (the backend requires `{refresh_token}`). Concurrent requests fail instead of awaiting the in-flight refresh. On refresh failure the keychain is cleared, but `AppState.isAuthenticated` stays true and the UI is never sent back to login. The interceptor holds the client and the client holds the interceptor, a reference cycle.
6. **No logout control** in any view.
7. **Contract drift with the backend** (`internal/router/router.go`), as listed in the table in §3:
   - Wrong paths: `POST /api/videos`, `POST /api/upload`, `POST /api/videos/{id}/send` (backend `POST /api/send/{id}`), `PATCH /api/auth/me` (backend `PUT /api/auth/profile`), `PATCH /api/friends/{id}` (backend `POST /api/friends/accept/{id}`), `/api/users/{id}/block` and `/api/users/blocked` (backend `POST /api/friends/block/{id}` only), `GET /api/videos/sent`, `/api/push/settings`, `/api/collections*`.
   - Pagination: the client uses `cursor` / `next_cursor`, the backend `page_token` / `next_page_token`.
   - Shapes: `Friend` is decoded as requester/addressee but the backend returns `{id, user_id, username, status, created_at}`. `InboxItem` is decoded as `from_user_*` / `status` but the backend returns `sender_*` / `read_at` / `caption`.
   - Auth response: the client expects `{token}`, the backend returns `access_token` / `refresh_token`.
8. **`updatePushSettings` sends a body with GET** (`.pushSettings` has method GET).
9. **Missing `NSMicrophoneUsageDescription`** while recording with an audio input, which crashes on first use. The camera usage string mentions only QR codes. App Store review risk.
10. **Push will not work:** there is no `aps-environment` entitlement. Custom keys are read from inside `aps`, but they are normally top-level.
11. **Deep links:** `onOpenURL` handles `host == "video"`, but no URL scheme or universal link is declared. Web share links (`https://host/videos/:id`) do not open the app. `VideoDetailView` cannot play the video.
12. **PhotosPicker:** `loadTransferable(type: URL.self)` typically returns nil for Photos videos. A `Transferable` with `FileRepresentation` is needed, so picking from the library likely fails silently.
13. **Send "comment" is sent as the video's title**, not as a message. The API has no caption parameter. The web client sends `caption`.
14. **Upload flow is three requests** (upload, create, send) with no idempotency. A failure after upload orphans files, and Retry re-uploads.
15. **Downloads load the whole file into memory** (`URLSession.shared.data(from:)`). There is no background session and no resume. The review flagged this.
16. **Feed:** like state is kept in two places (cell `@State` and the parent array), and the cell state is initialised once so it goes stale. Every cell autoplays with sound on appear.
17. **`SendVideoView` and the "Cancel" buttons call `dismiss()`** from a tab root, which is a no-op. The "Accept" banner hint says "Accepts and downloads the video" but it does not download.
18. **History progress bar** divides seconds by 100, which has no relation to duration.
19. **`AVCaptureMovieFileOutput` deprecation `#warning`** (`VideoRecorderView.swift:39`). The premise appears incorrect: the class is not deprecated as of iOS 17. Verify before acting on it.

**Contradictions between docs and code:**
- The review sweep says "Collections CRUD is complete". In the code there is no rename, and add or remove video is not exposed.
- The review says "`ProfileView.unsendVideo()` optimistically removes before the API response". The current code removes **after** success (`ProfileView.swift` lines 322-331), so the finding was fixed or inaccurate.
- The review says "AuthInterceptor: proper 401 handling with refresh token deduplication". In fact concurrent calls fail with `tokenExpired`, and no refresh token is used.
- The review says "Push notification handling is standard and correct". The entitlement is missing and the payload keys are non-standard.
- The review says "No BLOCKER or CRITICAL issues". There are compile errors, a missing project membership, a decoding failure and no server URL at relaunch.
- The review mentions "Feed has blocked-user filtering". That is true, but blocking itself is unreachable.
- The Offline empty state says "Download videos from your feed". Download exists only in the Inbox player.
- The feed empty state says "Follow friends to see their videos here". There is no follow or friend feature in the UI.

---

## Part C — Comparison and synthesis

### C1. Feature matrix

| Capability | Web | iOS |
|---|---|---|
| Server selection / QR | Fixed same-origin; **generates** the server QR (Admin) | **Enters or scans** a server URL, with health check |
| Signup | Public (email, username, display name, password ≥8) | **Invite code required** |
| Token | localStorage JWT, no refresh | Keychain JWT (+ plaintext app-group mirror), 401 refresh attempt |
| Feed | For You (`/feed/fyp`) + Discover (`/feed`), virtualized, muted autoplay, no pagination | One paged feed (`/feed`, cursor), autoplay with sound, blocked users filtered |
| Player | Custom HTML5 controls page with comments | AVPlayerViewController; download after 5 s |
| Create video | Paste link **or** upload | Upload (library or **record**) only, plus share extension |
| Send to friend | Friend list + caption (`/send/{id}`) | Friend list **or user search**, "comment" sent as title (`/videos/{id}/send`) |
| Inbox model | Read/unread, mark read | Accept/reject, in-app push banner |
| Unsend | — | ✓ (Profile → Sent) |
| Comments | Threaded (1 level), replies | Top level only |
| Likes | ✓ | ✓ |
| History | Table, search, date filter, pagination | List, search, progress bar |
| Collections | CRUD, add/remove own videos, bulk URL import; YouTube stub | List, create, delete, view |
| Friends management | None | None (unused API methods) |
| Block users | — | Unblock only (block UI unreachable) |
| Push / real-time | None | APNs registration and handling (entitlement missing) |
| Offline | PWA offline page (buggy fallback) | Downloads ✓; cache, queue and monitor stubbed |
| Profile | View own and own videos with stats | View, edit display name, sent and received, blocked |
| Admin | Full console (stats, users, storage, eviction, audit, QR) | None |
| Logout | ✓ (client-only) | ✗ (no UI) |
| Theme | Dark only | System light and dark |
| a11y | Partial ARIA | Extensive VoiceOver labels |
| i18n | None | None (en default) |
| CI / tests | CI quality job; Vitest about 110; Playwright 5 specs (CI job broken) | No CI; Swift Testing about 110 (likely never run) |

### C2. Cross-client API inconsistencies (one backend, three dialects)

| Concept | Web | iOS | Backend HEAD (`router.go` / handlers) |
|---|---|---|---|
| Auth response | `{token}` | `{token}` | `{access_token, refresh_token, expires_in}` |
| Me | `GET /auth/me` → `{user}` | `GET /auth/me` → `User` | bare `User` |
| Update profile | `PUT /auth/profile` | `PATCH /auth/me` | `PUT /api/auth/profile` |
| Create from link | `POST /videos/from-link` | `POST /videos` | `POST /api/videos/from-link` |
| Upload | `POST /videos/upload` → `{id}` | `POST /upload` → `{url, file_name}` | `POST /api/videos/upload` → `{id, status, upload_url?, …}` |
| Send | `POST /send/{recipient}` `{video_id, caption}` | `POST /videos/{id}/send` `{to_user_id}` | `POST /api/send/{id}` |
| Feed | `GET /feed` → array; `GET /feed/fyp` | `GET /feed?cursor` → `{videos, next_cursor}` | `/api/feed` → `{videos, next_page_token}` (query `page_token`, `page_size`); `/api/feed/fyp` → array |
| Inbox action | `POST /inbox/{id}/read` | `PATCH /inbox/{id}` `{status}` | both exist |
| Inbox item fields | `sender_id`, `sender_name`, `caption`, `read_at` | `from_user_id`, `from_user_name`, `status` | `sender_*`, `caption`, `read_at` |
| Friend fields | `{id, user_id, username, status}` | `{requester_id, addressee_id, …}` | `{id, user_id, username, status, created_at}` |
| Collections list | `{collections: [...]}` | `[...]` | **no routes** |
| Add to collection | `{videoId}` | `{video_id}` | **no routes** |
| Block | — | `/users/{id}/block`, `/users/blocked` | `POST /api/friends/block/{id}` |
| Friend accept | — | `PATCH /friends/{id}` | `POST /api/friends/accept/{id}`, `POST /api/friends/invite` |
| Logout | local only | local only (no UI) | `POST /api/auth/logout` |
| Real time | — | — | `GET /api/ws` (unused by both) |

Backend capabilities with **no client UI in either app**:
- Friend invite and accept (`/api/friends/invite`, `/accept/{id}`).
- Admin invites (`/api/admin/invites`). iOS signup *requires* an invite, yet nothing can create one.
- Reactions (`/api/videos/{id}/react`).
- Delete comment.
- Keep video (`PATCH /api/videos/{id}/keep`).
- Video likes list.
- Duplicates (`/api/videos/{id}/duplicates`, `/api/duplicates/{id}/canonical`).
- OAuth / YouTube import jobs (`/api/oauth/*`, `/api/import*`).
- Account deletion.
- WebSocket.
- `GET /api/videos/{id}/file` streaming.

### C3. Lessons for the greenfield rebuild

1. **One contract, generated clients.** Define the API in OpenAPI (or similar) and generate the TS and Swift clients. Add contract tests in CI against a real backend container. All three codebases drifted within days, on the same tracker ticket (VID-441).
2. **CI that builds what you ship.** The iOS app never compiled (project file out of sync, `let` mutation). The web E2E job could not start. Make "green CI" a merge gate for every repo, and run E2E with the same compose file used locally.
3. **Decide the product model explicitly and record it in ADRs**, because the two clients currently differ on each of these:
   - Open signup vs invite-only (and who issues invites).
   - Inbox read/unread vs accept/reject.
   - Captions vs titles.
   - Whether the FYP differs from the chronological feed.
   - Soft vs hard eviction.
4. **Auth:** access and refresh token pair. Keep tokens in the Keychain on iOS only, never mirrored to UserDefaults. On the web, prefer httpOnly cookies or at least a refresh flow. Use a single-flight refresh, and route to login on refresh failure. Give users a logout control.
5. **Friends are the core social primitive** and neither client can create a friendship. Treat add, accept and remove as table stakes.
6. **Server pairing:** keep "admin shows QR, mobile scans, health-checks, persists" as the pairing flow. Load the persisted URL at launch, and share it with extensions through a correctly prefixed keychain group.
7. **Media:** stream uploads and downloads (background `URLSession` on iOS). Set the nginx `client_max_body_size`. Make upload, create and send idempotent, or collapse them into one call. Track real watch progress, not "scrolled past".
8. **PWA:** the navigation fallback must be the app shell, with a separate offline page. Add real icons.
9. **Accessibility:** carry over the iOS VoiceOver discipline to the web. Use real buttons rather than clickable spans, keyboard-operable sliders and dialogs, and announce status messages.
10. **i18n and dates:** externalise strings from the start and always format dates; iOS shows raw ISO strings.
11. **Don't ship stubs as features.** The offline queue, network monitor, biometry lock, block action, push settings, deep links and YouTube import all exist as code or copy with no wiring. Track them as backlog items, not as "approved".

### C4. Key file index

- **Web:**
  - `src/App.tsx` (routes and guards), `src/lib/api.ts` (all endpoints), `src/lib/types.ts` (models), `src/context/AuthContext.tsx` (auth).
  - `src/pages/*.tsx`.
  - `src/components/{VideoCard,VideoPlayer,CommentSection,FriendPicker,ShareButton,LikeButton,LazyImage,EmptyState,Layout}.tsx`.
  - `vite.config.ts` (PWA and proxy), `nginx.conf`, `Dockerfile`, `.github/workflows/ci.yml`, `.github/dependabot.yml`.
  - `e2e/**` (Playwright, compose, README), `src/test/**`.
- **iOS:**
  - `Sources/VidFriends/App/{VidFriendsApp,AppState}.swift`, `ContentView.swift`.
  - `Networking/{APIClient,Endpoint,APIClientProtocol,AuthInterceptor,APIConfig,APIError,APIResponseTypes}.swift`.
  - `Models/*.swift`.
  - `Services/{KeychainService,AuthService,BiometryService,DownloadService,OfflineService,OfflineOperationQueue,NetworkMonitorService,PushNotificationService}.swift`.
  - `Views/**`, `Stubs/StubAPIClient.swift`.
  - `Sources/VidFriendsShareExtension/ShareViewController.swift`.
  - `Resources/Info.plist`, `*.entitlements`, `Package.swift`, `VidFriends.xcodeproj/project.pbxproj`.
  - `REVIEW-VID-145.md`, `review-sweep-VID-267.md`, `Sources/VidFriendsTests/*.swift`.
- **Backend cross-check:** `src/VidFriends_vidfriends-backend/internal/router/router.go`; `internal/handler/{auth,video,social}.go` (`AuthResponse`, `FeedResponse`, `FriendResponse`, `ReceivedVideoResponse`, `UploadVideoResponse`, `Me`); `internal/config/config.go:103` (`VIDFRIENDS_ALLOW_PUBLIC_SIGNUP` defaults to false).
