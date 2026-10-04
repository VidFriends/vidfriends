# VidFriends mobile clients: legacy code audit

**Scope:** two git clones under `C:\Users\ai\Documents\claude\vidfriends-merge\src\`:

| Short name used below | Clone dir | Remote | HEAD | Last commit |
|---|---|---|---|---|
| **COMBO** (iOS + Android monorepo) | `VidFriends_VidFriends-iOS-Android` | `github.com/VidFriends/VidFriends-iOS-Android` | `main` @ `ef30e82` | 2026-06-18 "VID-370: iOS Server URL connection screen and QR code scanning" |
| **DROID2** (standalone Android) | `VidFriends_vidfriends-android` | `github.com/VidFriends/vidfriends-android` | `master` @ `3a4402e` | 2026-06-19 `Revert "VID-503: Fix AuthRepository DataStore conflict + QrScannerView leak"` |

**Method:** I read every tracked source, build, CI and config file in both repos, every commit message (`git log --stat`) and every remote branch. Nothing was built or run (no JDK/Xcode in this audit). Statements like "won't compile" are based on static reading and are flagged with the specific evidence. Paths are repo-relative. For an independent check of the API contract I also grepped the sibling backend clone (`VidFriends_vidfriends-backend` @ `b295904`, 2026-06-19, Go, routes in `internal/router/router.go`). That was a cross-check only. I did not audit the backend.

**Status vocabulary (used strictly):**
- **Implemented + tested**: production code exists, it's wired into navigation, and unit tests exercise it. Tests that only check stubs or endpoint strings don't count.
- **Implemented, untested**: code exists and is reachable, but no meaningful tests.
- **Stubbed / unreachable**: code exists but isn't wired in, is dead, or is a placeholder.
- **Planned-only**: mentioned in docs, commits, routes or model types, with no working code.

Even "implemented + tested" here means *written and unit-tested against mocks*. **Neither repo shows evidence of ever running against the real backend.** The wire contract disagrees with the backend in most places (§4).

---

## 0. Executive summary

1. **Product:** VidFriends (internal working name "VidFlow", renamed 2026-06-17) is a **private, self-hosted, friends-only short-video sharing app**. Users point the app at their own server (manual URL or **QR code**), sign in (sign-up needs an **admin invite code**), and then:
   - send videos (upload a file/recording or share a link) to specific friends;
   - receive them in an **inbox** where they accept or reject;
   - watch them in a TikTok-style vertical feed;
   - like, comment, save to **collections**, download for offline;
   - unsend videos they sent, and block users.
   Push arrives via APNs on iOS. On Android it comes over a **self-hosted WebSocket held open by a foreground service** (no FCM). That fits the self-hosted model.
2. **Self-hosted model: confirmed.**
   - The iOS server-setup copy reads "Connect to your self-hosted server" (`ios/Sources/VidFriends/Views/Onboarding/ServerSetupView.swift:36`).
   - Both Android apps rewrite every request's host from a user-entered server URL (`DynamicBaseUrlInterceptor`).
   - Default dev server is `http://localhost:3100` (COMBO `app/.../di/NetworkModule.kt:55`, `ios/.../App/AppState.swift:27`, DROID2 `network/.../di/NetworkModule.kt:47`).
   - The QR code holds **just the server URL string**. It carries no token, invite or pairing secret.
3. **There are three client codebases with two incompatible API contracts:**
   - COMBO/iOS (SwiftUI) follows a "friends + inbox + send-to-user" contract that is *mostly* aligned with the real backend.
   - COMBO/Android and DROID2 (Kotlin/Compose) share a lineage and a different contract: username login, `access_token`/`refresh_token` with `user_id`, page/limit feed, `caption`/`file_path` fields, no friends/inbox concept. A lot of it doesn't exist on the backend.
4. **Build health is poor in all three.** Static evidence points to compile or build failures in COMBO/Android, COMBO/iOS (both the Xcode project and some Swift code) and DROID2's `:network` tests (details in §1.6, §2.6, §3.5). CI therefore can't have been green on `main`/`master`.
5. **Neither repo supersedes the other.**
   - COMBO is far more feature-complete: iOS has about 18 screens; COMBO/Android adds collections, downloads, notifications, block and history.
   - DROID2 is a later (06-17 to 06-19), smaller re-scaffold of the Android side. It has cleaner module/build hygiene but only Login, Feed (list), Video Detail and Send (unreachable).
   - DROID2 does not carry over COMBO/Android's features. COMBO/Android never received DROID2's DI refactor, migrations or VID-474 work.
   - Treat COMBO/iOS as the best statement of product intent, and COMBO/Android as the best statement of the Android feature set. Read DROID2 for its ARCHITECTURE.md and build conventions.
6. **Unmerged branches (DROID2):**
   - `origin/vid-474/video-detail-screen` points at `af02dab`, which is already on master. It has **no unique work**.
   - `origin/vid-503-fix` holds `b481399`. It is tree-identical to the reverted `abeb85f` and contains the **only unique work**: an atomic `saveAuthSession()` DataStore write and a leak-safe `QrScannerView` (CameraX + ML Kit). Details in §3.7.
   - COMBO has only dependabot branches (version bumps, listed in §2.5).

---

## 1. Product intent and recorded decisions

### 1.1 Sources of intent
- **COMBO has no README or ARCHITECTURE doc.** Intent comes from commit messages (10 commits, authors "iOSSenior" ×7 and "CTO" ×3, all co-authored by "Paperclip"), UI copy, and `.gitignore`. The `.gitignore` excludes agent working documents such as `*_REVIEW_*.md`, `review-*.md` and `*DISPOSITION_*.md`, which tells you a multi-agent review process existed but its documents weren't committed.
- **DROID2 has `ARCHITECTURE.md`** (273 lines, commit `366a1f5`). It covers modules, layers, the API table, navigation, build config and CI.
- The tracker IDs referenced give the epic structure:

| ID | What the commits say |
|---|---|
| VID-69 | Auth & feed screens; BiometryService protocol for testability |
| VID-70 | Send video, friend picker, inbox, push notifications |
| VID-84 | Offline downloads, unsend, block user, push integration |
| VID-86 | Polish sweep: launch screen, app icon, accessibility, error states |
| VID-97 | Onboarding flow: server URL + QR connection |
| VID-252 | Epic "Offline, Unsend, Block & Push Integration" |
| VID-262 / VID-263 | Review feedback (below) |
| VID-267 | Review sweep |
| VID-331 | Cache `ISO8601DateFormatter` in `OfflineService.parseDate()` |
| VID-370 | iOS server URL screen + QR scanning, FYP feed, comments |
| VID-441 | DROID2 CI |
| VID-474 | DROID2 VideoDetailScreen |
| VID-477 | DROID2 DI refactor + LoginScreen |
| VID-503 | DROID2 DataStore/QR leak fix, later reverted |
| VID-478 | Backend logout endpoint (backend repo) |

### 1.2 Product concept (synthesised)
- **Private circle, not public social.**
  - Feed empty state: "Follow friends to see their videos here." (`FYPFeedView.swift:45`)
  - Sign-up needs an "Admin Invite Code" ("An admin invite code is required to register.", `AuthView.swift:67-75`).
  - Block copy: "will not be able to send you videos or see your content" (`UserProfileSheetView.swift:89`).
- **Core loop (iOS):**
  1. Record a video or pick one.
  2. Choose a friend.
  3. Optionally add a comment, which becomes the video title.
  4. Upload, create the video record, then send it to the friend. This is a 3-call pipeline (`SendVideoView.swift:247-271`).
  5. The recipient sees it in the Inbox and accepts or rejects it (`InboxView.swift`).
  6. Videos also appear in a vertical paging "For You" feed (`FYPFeedView.swift`).
- **Core loop (Android, both):**
  - Paste a video **link** (`POST api/videos/send-link`) or upload a file.
  - Watch a feed of videos.
  - Video detail offers like and comments.
  - In COMBO/Android, save to collections, download offline, block, unsend.
  - **Android has no friend/inbox/recipient concept at all.** A "send" there posts to the server with no recipient.
- **Duplicate detection** (COMBO/Android only): `VideoDto.is_duplicate` / `duplicate_of`, an orange "Duplicate" badge that links to the original (`ui/feed/components/DuplicateBadge.kt`, `VideoOverlay.kt:56`). The backend has matching routes (`GET /api/videos/{id}/duplicates`, `PUT /api/duplicates/{id}/canonical`). This is a real product feature: telling a friend "someone already sent you this".
- **Watch-gated download** (iOS): the download button only appears after 5 s of playback (`VideoPlayerView.swift:18`, `watchTimeThreshold`). It was extracted to a named constant per VID-263.
- **Watch history with progress** (iOS `WatchHistoryEntry.progressSeconds`; backend `progress_seconds`).
- **Threaded comments** planned: iOS `Comment.parentId` / `CreateCommentRequest.parentId`. Always sent as `nil`.
- **Biometric quick login** (iOS): an opt-in step after auth. The flag is stored but never enforced (§2.4).

### 1.3 Recorded decisions with rationale
| Decision | Where | Rationale given |
|---|---|---|
| Rename VidFlow → VidFriends (packages `com.vidflow.app` → `com.vidfriends.app`, iOS module) | COMBO `6e24d2f` | None stated. Leftovers remain: notification channel IDs `vidflow_*` (`feature/notifications/.../NotificationChannelType.kt`), `fastlane/Appfile` `package_name "com.vidflow.app"`, author email domain `vidflow.ai`. |
| `videoDownload` endpoint is **GET**, not POST | COMBO `9738fb7` (VID-263) | Marked "CRITICAL: Fix API contract". |
| 5 s watch threshold as a named constant | VID-263 | Review feedback. |
| `setEnvironment` must not depend on `configureOfflineService` ordering | VID-263 | Review feedback (`AppState.swift:74-89` rebuilds `DownloadService` if a context exists). |
| `BiometryService` behind a protocol | `4fd9198` (VID-69) | Testability. |
| Cache `ISO8601DateFormatter` as a static | `46fdeed` (VID-331) | Performance (per-call allocation). |
| Error states show Retry only after the first failure (`hasFailedOnce`) | `3288ef4` (VID-86) | Polish; also fixed "error-not-cleared after successful refresh". |
| Camera session stopped in `deinit` + `viewDidDisappear` | `ef30e82` (VID-370) | Leak avoidance. |
| URL sanitisation: auto-prepend `https://` | VID-370, `ServerSetupView.sanitizedURL` | UX. |
| `checkHealth` errors propagate | VID-370 | Granular connection errors. |
| Streamed multipart upload via temp file, 1 MB chunks | `APIClient.uploadVideo` | Avoid loading the whole video into memory (implicit). |
| DROID2 is "100% native Kotlin, no KMP/NDK/Flutter/RN, zero Java" | `ARCHITECTURE.md` "Status" | Stated as a policy. It **contradicts** DROID2's initial commit message ("Kotlin Multiplatform project with shared, androidApp modules", `7246e5b`). The code is not KMP. |
| Base URL is configured at runtime through DataStore; "no build config variants required" | DROID2 `ARCHITECTURE.md` | The self-hosted model means there's no fixed prod URL. |
| Atomic auth-session write (1 DataStore `edit{}` for 4 fields) | DROID2 VID-503 "M1" | Avoids a partially written session. **Reverted 1 minute later with no stated reason.** |
| QR scanner must release the executor, BarcodeScanner and CameraX on dispose | DROID2 VID-503 "M3" | Leak fix. Reverted. The unfixed leaky version still lives in COMBO `feature/auth/.../QrScannerView.kt`. |
| `AVCaptureMovieFileOutput` must migrate to `AVAssetWriter` "before shipping" | `VideoRecorderView.swift:39` `#warning` | Deprecation (the claim is questionable but recorded). |

---

## 2. COMBO repo (`VidFriends_VidFriends-iOS-Android`)

### 2.1 History and layout
- `b5ef708` (06-14) scaffolded iOS (SPM + Xcode, SwiftData, KeychainAccess, CI) **and** a single-module Android app.
- `4a64bc0` added multi-module Gradle stubs, detekt and fastlane.
- `3288ef4` to `df10fea` built out iOS features.
- `9738fb7` is a review fix that added a full copy under `ios/Sources/VidFriends/` while `VidFlow/` still existed.
- `6e24d2f` did the rename and introduced the bulk of the Android features (collections, downloads, notifications, block, setup, auth). That's 195 files, all in one commit.
- `46fdeed`, then `ef30e82` (VID-370).

Layout:

```
app/                         Android app module (com.vidfriends.app) — nearly all Android code lives here
core/{common,network,ui}/    EMPTY stubs (build.gradle.kts + manifest only)
feature/auth/                Compose AuthScreen, SetupScreen, QrScannerView, UiStates
feature/notifications/       WebSocket push, foreground service, channels, prefs screen
feature/{feed,player,share}/ EMPTY stubs
ios/Package.swift            SPM package (iOS 17, KeychainAccess 4.2.2)
ios/VidFriends.xcodeproj     Xcode project (stale — see 2.6)
ios/Sources/VidFriends/      SwiftUI app
ios/Sources/VidFriendsShareExtension/
ios/Sources/VidFriendsTests/ Swift Testing (@Test) suites
fastlane/, Gemfile, detekt.yml, .github/
```

### 2.2 iOS: screens and journeys

**App shell:**
- `VidFriendsApp.swift` sets up a SwiftData container for `UserModel, VideoModel, FriendModel, CommentModel, DownloadedVideo`.
- `ContentView.swift` shows the onboarding flow when `!appState.isAuthenticated`. Otherwise it shows a **7-tab TabView**: Feed, Send, Inbox, History, Collections, Offline, Profile (`ContentView.swift:61-106`).

| Screen / journey | File(s) | Status | Notes |
|---|---|---|---|
| Server setup (URL entry, Test Connection, QR scan, Continue) | `Views/Onboarding/ServerSetupView.swift` | Implemented + tested (logic) | `sanitizedURL` and coordinator transitions are unit-tested (`ServerSetupTests.swift`). The QR scanner (`QRScannerController`, AVFoundation `.qr`) puts the raw string into the text field. The user still taps Test → Continue. |
| Onboarding coordinator (serverSetup → auth → biometryOptIn) | `Views/Onboarding/OnboardingCoordinator.swift` | Implemented + tested | It skips to `.auth` if a server URL is saved, **but never applies that URL to `AppState`** (bug, §2.7). |
| Login / Sign-up (email+password; sign-up adds username, optional display name, **required invite code**) | `Views/Onboarding/AuthView.swift` (`OnboardingAuthView`) | Implemented, untested | Sign-up always calls `registerWithInvite`. Plain `register` is unused. |
| Biometry opt-in (Face ID / Touch ID) | `BiometryOptInView.swift`, `Services/BiometryService.swift` | Stubbed in effect | It sets `UserDefaults "biometry_enabled"`, which **nothing ever reads**. There's no biometric gate at launch. |
| Feed (vertical paging, autoplay, like, comments sheet, share) | `Views/Feed/FeedView.swift` → `FYPFeedView.swift`, `FYPVideoCell.swift` | Implemented, untested; **likely doesn't compile** | Cursor pagination prefetches at `count-2`, filters blocked users client-side, has pull-to-refresh and an "all caught up" footer. `toggleLike` assigns to `let` properties of `Video` (`FYPFeedView.swift:134-136` vs `Models/Video.swift:17-19`), which is a compile error. Like is also double-applied: the cell toggles optimistically **and** the parent toggles after the API call. Share uses `UIActivityViewController` with the raw `fileURL`. |
| Comments sheet (list, post) | `Views/Feed/CommentsView.swift` | Implemented, untested | Builds the posted comment locally from the `{id, created_at}` response. No delete. No threading UI. |
| Send video (Choose from Photos / Record, pick friend, optional comment, upload with progress, retry) | `Views/Send/SendVideoView.swift`, `FriendPickerView.swift`, `UploadProgressView.swift`, `VideoRecorderView.swift` | Implemented, untested | 3-call pipeline: `uploadVideo` → `createVideo(url,title)` → `sendVideo(id,toUserId)`. "Cancel" during upload only dismisses; it doesn't cancel the task. A recording that fails is just `print`ed. |
| Friend picker (friends list + user search) | `FriendPickerView.swift` | Implemented, untested | Derives the friend's ID from requester/addressee. **No add-friend / friend-request UI** anywhere: `getFriendRequests` and `respondToFriendRequest` are never called. |
| Inbox (list, swipe accept/reject, in-app banner on foreground push, open → VideoReceiverView) | `Views/Inbox/InboxView.swift` | Implemented, untested | Statuses `pending/accepted/rejected`. The banner is fed by `.didReceiveForegroundNotification` and needs `aps.video_id` or `aps.data.video_id`. |
| Video receiver / player (AVPlayerViewController, watch-gated download, Accept in toolbar) | `InboxView.swift` `VideoReceiverView`, `Views/Feed/VideoPlayerView.swift` | Implemented, untested | `VideoPlayerView` is only reached from the Inbox. |
| Deep-linked video detail (shows thumbnail + title only, no playback) | `ContentView.swift` `VideoDetailView` | Implemented (minimal) | Triggered by `onOpenURL` with host `video`, or by a push tap. **No URL scheme is registered** in `Info.plist`, so `onOpenURL` never fires for custom links. |
| History (searchable list, progress bar) | `Views/History/HistoryView.swift` | Implemented, untested | Progress bar is `progressSeconds / 100`, a hard-coded denominator (bug). `markWatched` is **never called** by iOS, so history would only fill from other clients. |
| Collections (list, create via alert, swipe delete, detail list) | `Views/Collections/CollectionsView.swift` | Implemented, untested | **No "add to collection" action anywhere on iOS.** `addVideoToCollection` is unused, so collections can't be populated from iOS. |
| Offline downloads (SwiftData `@Query`, play local file, delete with confirm) | `Views/OfflineDownloads/OfflineDownloadsView.swift`, `Services/DownloadService.swift` | Implemented, partially tested (`DownloadService` init/format only) | Downloads are only started from `VideoPlayerView`, after 5 s, from the Inbox. |
| Profile (user header, edit display name, sent videos with swipe **Unsend** + confirm, received list, blocked users) | `Views/Profile/ProfileView.swift`, `BlockedUsersView.swift` | Implemented, untested | Unsend copy: "This will remove the video from X's inbox. This action cannot be undone." **No logout button anywhere** (`AppState.logout()` has no caller). |
| User profile sheet (block/unblock with confirm) | `Views/Profile/UserProfileSheetView.swift` | **Unreachable** | Never presented except in `#Preview`. On iOS, blocking someone is therefore impossible from the UI; you can only unblock. |
| Share extension (share a movie from another app → caption → "Send To" by username/email search → upload) | `VidFriendsShareExtension/ShareViewController.swift` | Implemented, untested; **broken at runtime** (§2.7) | `SLComposeServiceViewController`. Takes the first search hit as the recipient. If no recipient is chosen, it uploads and creates the video but doesn't send it. Activation: `NSExtensionActivationSupportsMovieWithMaxCount = 1`. |
| Stub/demo mode | `Stubs/StubAPIClient.swift`, `AppState.setEnvironment(useStub:)` | Implemented + tested (heavily) | Full fake data (picsum thumbnails). Nothing in the UI switches to it. |

### 2.3 iOS: networking, API and models

**Client:** `actor APIClient: APIClientProtocol` (`Networking/APIClient.swift`).
- URLSession with 30 s request / 60 s resource timeouts.
- `JSONDecoder.keyDecodingStrategy = .convertFromSnakeCase` and `JSONEncoder.keyEncodingStrategy = .convertToSnakeCase`, **plus** explicit snake_case `CodingKeys` on every model. These conflict (§2.7).
- Errors map to `APIError`: 401 → `.unauthorized`, 404 → `.notFound`, other → `.serverError(code, body.error)`.
- `Endpoint` enum (`Networking/Endpoint.swift`) holds paths, methods and `requiresAuth`.

**Full iOS endpoint inventory (as called):**

| Method | Path | Request body | Expected response | Used by UI? |
|---|---|---|---|---|
| POST | `/api/auth/register` | `{email, username, password, display_name?}` | `{token}` | No (only invite variant) |
| POST | `/api/auth/register` (invite) | `{email, username, password, display_name?, invite_code}` | `{token}` | Yes |
| POST | `/api/auth/login` | `{email, password}` | `{token}` | Yes |
| POST | `/api/auth/refresh` | *(none)*; sends the current Bearer token | `{token}` | Via AuthInterceptor |
| GET | `/api/health` | — | `{status: "ok"\|"healthy"}` | Yes |
| GET | `/api/feed` | — | `[Video]` | No |
| GET | `/api/feed?cursor=…` | — | `{videos:[Video], next_cursor?}` | Yes |
| GET | `/api/videos/{id}` | — | `Video` | Yes |
| POST | `/api/videos` | `{url?, title?, description?}` | `{id}` | Yes (send flow) |
| POST / DELETE | `/api/videos/{id}/like` | — | `{status}` | Yes |
| GET | `/api/videos/{id}/comments` | — | `[Comment]` | Yes |
| POST | `/api/videos/{id}/comment` (singular) | `{body, parent_id?}` | `{id, created_at}` | Yes |
| POST | `/api/videos/{id}/watched` | `{progress_seconds}` | `{status}` | **No** |
| GET | `/api/history` | — | `[WatchHistoryEntry]` | Yes |
| GET | `/api/users?q=` | — | `{users:[{id,username,display_name}]}` | Yes |
| POST | `/api/videos/{id}/send` | `{to_user_id}` | `{status}` | Yes |
| GET | `/api/inbox` | — | `[InboxItem]` | Yes |
| PATCH | `/api/inbox/{id}` | `{status: accepted\|rejected}` | `{status}` | Yes |
| GET | `/api/friends` | — | `[Friend]` | Yes |
| GET | `/api/friends/requests` | — | `[Friend]` | **No** |
| PATCH | `/api/friends/{id}` | `{status: accepted\|rejected}` | `{status}` | **No** |
| GET | `/api/auth/me` | — | `User` | Yes |
| PATCH | `/api/auth/me` | `{display_name}` | `User` | Yes |
| GET / POST | `/api/collections` | POST: `{name}` | `[Collection]` / `Collection` | Yes |
| GET | `/api/collections/{id}` | — | — | No (endpoint defined only) |
| GET / POST | `/api/collections/{id}/videos` | POST: `{video_id}` | `[VideoWithUser]` / `{status}` | GET yes; POST **no** |
| DELETE | `/api/collections/{id}/videos/{videoId}` | — | `{status}` | No |
| DELETE | `/api/collections/{id}` | — | `{status}` | Yes |
| GET | `/api/videos/sent` | — | `[SentVideo]` | Yes |
| POST | `/api/videos/{id}/unsend` | — | `{status}` | Yes |
| POST | `/api/push/register` | `{token: <APNs hex>, platform: "ios"}` | `{status}` | Yes |
| GET | `/api/push/settings` | — | `PushSettings` | No |
| **GET** (bug) | `/api/push/settings` | `{notifications_enabled}` | `{status}` | No. `updatePushSettings` reuses the GET endpoint with a body. |
| POST | `/api/upload` | multipart `file` (`video/mp4`), streamed from a temp file | `{url, file_name}` | Yes |
| GET | `/api/videos/{id}/download` | — | `{url, file_name?}` | Yes |
| POST / DELETE | `/api/users/{id}/block` | — | `{status}` | Unblock only (block UI unreachable) |
| GET | `/api/users/blocked` | — | `[BlockedUser]` | Yes |

**Models** (`Models/*.swift`, Codable; all IDs and dates are `String`):

| Model | Fields |
|---|---|
| `User` | `id, email, username, display_name?, avatar_url?, role, status, storage_used?, last_active_at?, created_at, updated_at` |
| `Video` | `id, user_id, title, description?, file_url?, thumbnail_url?, duration (String!), status, created_at, updated_at, like_count?, comment_count?, liked?, user_name?` |
| `Comment` | `id, user_id, user_name?, video_id?, parent_id?, body, created_at` |
| `Friend` | `id, requester_id, addressee_id, status, username?, display_name?, created_at, updated_at` |
| `InboxItem` | `id, video_id, from_user_id, from_user_name, title, thumbnail_url?, status, created_at` |
| `Collection` | `id, user_id, name, video_count?, created_at, updated_at` |
| `VideoWithUser` | — |
| `SentVideo` | `id, video_id, recipient_id, recipient_name, title, thumbnail_url?, created_at` |
| `WatchHistoryEntry` | `id, title, thumbnail_url?, user_name, watched_at, progress_seconds` |
| `BlockedUser` | — |
| `PushSettings` | `notifications_enabled, new_video_alerts, friend_request_alerts` |
| `Like` | Unused |

SwiftData persistence models: `UserModel`, `VideoModel`, `FriendModel`, `CommentModel`, `DownloadedVideo` (`videoId` unique, `localFileURL`, `fileSize`).

**Auth and token storage:**
- The design uses a single opaque token string (`AuthResponse.token`). There's no separate refresh token.
- `KeychainService(useAppGroup: true)` writes the token to the Keychain (`service "com.vidfriends.app"`, `accessGroup "com.vidfriends.app"`, `.whenUnlockedThisDeviceOnly`, non-synchronizable) **and also in plaintext to the app-group `UserDefaults(suiteName: "group.com.vidfriends.app")`** (`Services/KeychainService.swift:27-30`). That shared copy is there so the share extension can read it. **It defeats the Keychain.**
- The server URL is stored the same way.
- `AuthInterceptor` (actor) catches `.unauthorized`, calls `refreshToken()` once (concurrent refreshes throw `.tokenExpired`), retries the call, and on failure clears the keychain and throws `.refreshFailed`. It **doesn't flip `AppState.isAuthenticated`**, so the UI stays "logged in" with no token.
- On launch, `AppState.init` restores the token from the keychain and sets `isAuthenticated = true` without validating it.

**Server-URL configuration and QR pairing (iOS):**
1. The user types or scans a URL in `ServerSetupView`.
2. `sanitizedURL` trims the input and prepends `https://` if there's no scheme.
3. `appState.setEnvironment(baseURL:)` builds a new `APIClient`.
4. `GET /api/health` runs. On failure it reverts to the previous config.
5. On success, Continue calls `coordinator.didConnect(url)`, which saves the URL in the keychain.
6. The QR payload is used verbatim as the URL text. There's no schema, signature or invite token in it.
7. `Info.plist` has `NSAllowsLocalNetworking = true` (LAN HTTP allowed) and `NSCameraUsageDescription`.

### 2.4 iOS: playback, sharing, feeds, social, push, offline
- **Playback:** AVKit `AVPlayerViewController` wrapped in `Views/Common/VideoPlayerController.swift`.
  - Feed cells create an `AVPlayer(url: fileURL)` `onAppear` and drop it `onDisappear`. No preloading, no looping, no mute control.
  - `file_url` must be an absolute, directly playable URL. **No auth header is attached** to media requests.
- **Sharing:**
  - Outbound: the system share sheet with the raw `file_url` (`FYPVideoCell.shareVideo`).
  - Inbound: the share extension (above).
- **Feed:** cursor-paginated, client-side filtering by `AppState.blockedUserIds` (loaded at app start from `GET /api/users/blocked`).
- **Friends:** list and search only. Friend requests have endpoints but no UI.
- **Comments:** list and post. No delete, no threads.
- **Likes:** toggle with a (double-)optimistic count.
- **Push:**
  - `PushNotificationService` requests `.alert, .badge, .sound` and calls `registerForRemoteNotifications()`.
  - The token upload is hooked to `UIApplication.didRegisterForRemoteNotificationsWithDeviceTokenPublisher` via `.onReceive` in `VidFriendsApp`. **There's no `UIApplicationDelegateAdaptor`.** iOS delivers the device token to the app delegate's `application(_:didRegisterForRemoteNotificationsWithDeviceToken:)`, so this publisher is unlikely to ever fire. As a result **the APNs token is probably never uploaded**.
  - `UIBackgroundModes: remote-notification` is set, but there's no `aps-environment` entitlement in `VidFriends.entitlements`, so APNs registration would fail on device.
  - Foreground pushes show an in-app banner in the Inbox. Taps open `VideoDetailView` as a sheet.
- **Offline:**
  - `NetworkMonitorService` (NWPathMonitor), `OfflineService` (SwiftData cache for feed/comments) and `OfflineOperationQueue` (UserDefaults-persisted queue of like/unlike/comment/markWatched/inbox/friend/block/unblock/unsend ops with replay) are all written.
  - **None of them is ever called from the UI**: no `cacheFeed`, no `enqueue`, no `processPendingOperations` call sites. They're dead code apart from tests.
  - Only explicit downloads (`DownloadService`) work offline. `DownloadService` loads the whole file into memory (`URLSession.shared.data(from:)`) with no auth and no progress.
- **Accessibility:** extensive (VID-86).
  - About 156 `accessibilityLabel` uses.
  - Hints, `.isHeader` traits, `accessibilityHidden` on decorative images, combined row elements, Dynamic Type on the camera-unavailable label.
  - Light/dark launch colour asset.
  - Portrait-only (`UISupportedInterfaceOrientations` = Portrait).
- **Platform constraints:**
  - iOS 17+ (`@Observable`, SwiftData, `ContentUnavailableView`, `containerRelativeFrame`, `scrollTargetBehavior(.paging)`).
  - Swift 5.9 tools, Xcode 16 in CI.
  - Single scene.
  - App group `group.com.vidfriends.app`; keychain group `$(AppIdentifierPrefix)com.vidfriends.app`.
  - Bundle IDs: `com.vidfriends.app`, `.tests`, `.share-extension`.

### 2.5 Android (COMBO): screens, journeys, stack

**Stack** (`gradle/libs.versions.toml`):

| Area | Versions |
|---|---|
| Build | AGP 8.7.3, Kotlin 2.0.21 (compose compiler plugin), compileSdk/targetSdk 35, minSdk 26, JVM 17 |
| UI | Compose BOM 2024.10.01, Material3 1.3.0, Navigation 2.8.4 |
| DI | Hilt 2.51.1 + KSP |
| Network | Retrofit 2.11, OkHttp 4.12, Moshi 1.15.1 |
| Storage | Room 2.6.1, DataStore 1.1.1 |
| Media / camera | Media3 1.4.1, Coil 2.7, CameraX 1.4.1, ML Kit barcode 17.3.0, core-splashscreen |
| Quality / test | detekt 1.23.7; tests: JUnit4, MockK 1.13.13, coroutines-test, Turbine |

Dependabot branches (unmerged): Kotlin 2.4.10, Media3 1.11.0, activity-compose 1.13.0, core-ktx 1.19.0, Hilt group, GitHub actions (setup-java 5, gradle/actions 6, upload-artifact 7, download-artifact 8, stale 10).

**Navigation** (`app/.../navigation/AppNavGraph.kt`, `Screen.kt`):
- Routes: `setup`, `auth`, `feed`, `video/{videoId}`, `downloads`, `notification_preferences`, `history`, `blocked-users`, `collections`, `collection/{collectionId}`. `share` is declared but has no destination.
- Start destination is chosen in `MainActivity` from DataStore. It's buggy (§2.7).
- Deep links arrive as an Intent extra `deep_link` (`video/<id>`, `feed`, `history`, `blocked-users`, `collections`, `notification_preferences`), handled by `navigateToDeepLink`.

| Screen / journey | File(s) | Status | Notes |
|---|---|---|---|
| Server setup (URL field, Connect, QR scan toggle, status cards) | `feature/auth/.../SetupScreen.kt`, `QrScannerView.kt`; `app/.../ui/setup/SetupViewModel.kt` | Implemented; repo tested, VM untested | Asks for the camera permission on entry. Requires the `http(s)://` prefix (no auto-prepend, unlike iOS). QR accepts `TYPE_URL` or `TYPE_TEXT` and connects immediately. **Health check runs before the URL is saved**, so it hits localhost (§2.7). The scanner leaks the executor/scanner and fires repeatedly. |
| Auth (login/sign-up toggle; name, email, password, confirm) | `feature/auth/.../AuthScreen.kt`, `AuthUiState.kt`; `app/.../ui/auth/AuthViewModel.kt` | Implemented; repo tested, VM untested | Login sends **email as `username`** (`AuthViewModel.kt:65`). Sign-up sends `name` as username and `inviteToken = null`. There's **no invite field**, though the backend requires one. |
| Feed (full-height pages ~800dp, autoplay the first visible item, thumbnail otherwise; overlay: like, comments, save, block, download, duplicate badge; header rows "Collections", "Downloads"; pull-to-refresh; infinite scroll) | `ui/feed/FeedScreen.kt`, `FeedViewModel.kt`, `FeedUiState.kt`, `components/*` | Implemented + tested (VM: 11 tests) | It's a `LazyColumn`, not a pager, so there's no snapping. States: Loading, Empty, Error, AllCaughtUp, Success. Optimistic like (no rollback). Block removes all of that user's videos. **Static compile errors** in `FeedScreen.kt` (§2.6). |
| Video detail (full-screen ExoPlayer, custom controls auto-hide after 3 s, seek slider, volume, like, comments panel, save-to-collection dialog, download button, duplicate badge; hides system bars) | `ui/detail/VideoDetailScreen.kt`, `VideoDetailViewModel.kt` | Implemented + tested (VM: 4 tests) | Calls `markWatched` on every open. The comment delete icon shows on every comment (no ownership check), and deletion removes the comment locally even if the API fails. |
| Collections list (FAB create, delete, pull-to-refresh) and detail (2-column grid of thumbnails via Coil, remove) | `ui/collections/*` | Implemented + tested (CollectionsViewModel: 8) | `AddToCollectionDialog` is reachable from Feed and Detail ("Create & Add"). |
| Downloads (storage card, list with status/progress, pause/resume/cancel/delete, Clear All; asks POST_NOTIFICATIONS on Android 13+) | `ui/downloads/*`, `data/download/*`, `data/repository/DownloadRepositoryImpl.kt` | Implemented + tested (VM 9, repo 12, manager 6) | Custom OkHttp downloader with HTTP Range resume, a foreground `dataSync` service, a progress notification, a PENDING queue retried on network-available, and pruning of failed/paused items under 100 MB free. Files go under `getExternalFilesDir(MOVIES)/VidFriends`. |
| History (list, overflow menu "Unsend" with confirm, link to Blocked Users) | `ui/history/*` | Implemented + tested (VM: 9); **reachable only by deep link** | Unsend = `DELETE api/videos/{id}`. The copy reads "The recipient won't be able to view it" even though Android has no recipient concept. |
| Blocked users (list, unblock, pull-to-refresh) | `ui/settings/BlockedUsersScreen.kt`, VM | Implemented + tested (VM 6, repo 6); reachable only from History | — |
| Notification preferences (per-channel switches: Messages, Followers, Likes, Comments, New Videos) | `feature/notifications/ui/*` | Implemented, untested; **deep-link only** | Prefs live in DataStore `notification_preferences`. They filter locally, not on the server. |
| Logout | `AuthRepositoryImpl.logout()` | **No UI** | Unregisters push, stops the service, clears DataStore. |
| Share intent (receive videos from other apps) | `feature/share` module, `Screen.Share` | **Planned-only** | Empty module. No intent filter in the manifest. |
| Player module, feed module, core modules | `feature/player`, `feature/feed`, `core/*` | **Planned-only (empty)** | — |

**Android data layer (COMBO):**
- Single-module "clean-ish" layout inside `:app`: `data/{dto,remote,local,preferences,repository,download}`, `domain/{model,repository}`, `di/`, `ui/`.
- `ApiResult<T>` sealed class. `safeApiCall` turns `Response<T>` into `Result<T>` (`util/NetworkResult.kt`).
- Room `vidfriends.db` v5 (`data/local/AppDatabase.kt`). Tables:
  - `videos`, `comments`, `users`, `cache` (unused), `collections`, `collection_videos`, `downloads`, `history_videos`.
  - Migrations 2→3, 3→4, 4→5 are in the companion object. There's no 1→2, and `videos.is_duplicate/duplicate_of` columns are never migrated in.
  - `exportSchema = true`, but no `schemas/` dir is committed.
- Repositories: Auth, Feed, Video, History, Collection, BlockUser, Download, Setup. Pattern: network first, write-through to Room, fall back to cache on failure.

**COMBO/Android endpoint inventory** (`app/.../data/remote/VidFriendsApi.kt`; relative paths, base `http://localhost:3100/`, host rewritten at runtime):

| Method | Path | Body / query | Response DTO |
|---|---|---|---|
| POST | `api/auth/register` | `{username, email, password, invite_token?}` | `AuthResponseDto {user_id, username, access_token, refresh_token}` |
| POST | `api/auth/login` | `{username, password}` | `AuthResponseDto` |
| POST | `api/auth/refresh` | `{refresh_token}` | `AuthResponseDto` |
| GET / PATCH | `api/users/me` | PATCH `{display_name?, avatar_url?}` | `UserDto {id, username, email, display_name?, avatar_url?, created_at}` |
| GET | `api/feed?page=&limit=10` | — | `{videos:[VideoDto], page, total}` |
| GET | `api/videos/{id}` | — | `VideoDto` |
| POST | `api/videos/send-link` | `{source_url, caption?}` | `VideoDto` |
| POST | `api/videos/upload` | multipart `file` (`video/*`), part `caption` | `VideoDto` |
| POST / DELETE | `api/videos/{id}/like` | — | `Unit` |
| GET / POST | `api/videos/{id}/comments` | POST `{text}` | `[CommentDto]` / `CommentDto {id, video_id, user_id, username, text, created_at}` |
| DELETE | `api/videos/{id}/comments/{commentId}` | — | `Unit` |
| POST | `api/videos/{id}/watch` | — | `Unit` |
| DELETE | `api/videos/{id}` | — | `Unit` (used as "unsend") |
| GET | `api/videos/{id}/status` | — | `{status}` (defined, unused by UI) |
| GET | `api/history?page=&limit=20` | — | `{videos, page, total}` |
| POST / DELETE | `api/users/{userId}/block` | — | `Unit` |
| GET | `api/users/blocked?page=&limit=20` | — | `{users:[{id, username, display_name?, avatar_url?, blocked_at}], page, total}` |
| GET / POST | `api/collections` | POST `{name, description?}` | `[CollectionDto {id, name, description?, video_count, created_at}]` / `CollectionDto` |
| PUT / DELETE | `api/collections/{id}` | PUT `{name?, description?}` | `CollectionDto` / `Unit` |
| GET / POST | `api/collections/{id}/videos` | POST `{video_id}` | `[CollectionVideoDto {id, collection_id, video_id, added_at, video?}]` |
| DELETE | `api/collections/{id}/videos/{videoId}` | — | `Unit` |
| POST | `api/push/register` | `{device_id (random UUID), platform:"android", topic?}` | `{device_id, ws_url?}` |
| POST | `api/push/unregister` | — | `Unit` |
| GET | `api/health` | — | `{status}` |
| WS | `ws_url` from push/register, else `<server with ws/wss scheme>/ws` | Header `Authorization: Bearer` | Messages `{type, title, body, video_id?, user_id?, deep_link?}` |

`VideoDto` (Android) fields: `id, user_id, username, source_url?, file_path, thumbnail_path?, caption?, duration(Long), file_size, mime_type, is_liked, like_count, comment_count, created_at, is_duplicate=false, duplicate_of?`.

**Auth and token storage (COMBO/Android):**
- Access token, refresh token, server URL, user ID, username and device ID live in **plaintext Preferences DataStore** (`user_preferences`; `data/preferences/UserPreferences.kt`). There's no encryption.
- `AuthInterceptor` adds `Bearer` using `runBlocking` on the OkHttp thread.
- `TokenRefreshAuthenticator` refreshes on 401 under a `Mutex` using a separate OkHttpClient, then retries. It **clears all prefs on any failure**, which logs the user out silently with no navigation.
- `HttpLoggingInterceptor.Level.BODY` is always on (`di/NetworkModule.kt:40-42`). It logs tokens and passwords, and it buffers whole response bodies, including video downloads that use the same client.

**Push (Android):**
1. After login/register, `AuthRepositoryImpl.registerForPush` POSTs `/api/push/register`, gets `ws_url`, and has `PushManager` open an OkHttp **WebSocket** with exponential back-off (1 s to 30 s, `Thread.sleep` threads).
2. It then starts `VidFriendsNotificationService`, a `LifecycleService` foreground service of type `dataSync` with a persistent "Connected for notifications" notification and `START_STICKY`.
3. `NotificationManager` collects WS messages and posts them to 5 channels (Messages/high, Followers, Likes, Comments, NewVideos/low) after checking local prefs. A tap opens `MainActivity` with the `deep_link` extra.

The client knows these event types: `new_message, new_follower, new_like, new_comment, new_video`. **"Follower" and "message"** don't exist in any client UI.

### 2.6 COMBO build, CI and tests

**Android CI** (`.github/workflows/android-ci.yml`):
- Jobs on push to `main`, tags `v*`, and PRs: lint, detekt, unit tests (uploads reports), assembleDebug (APK artifact).
- On tags only: assembleRelease, signed from `ANDROID_SIGNING_*` secrets via a base64 keystore. It uploads an APK and AAB (but `bundleRelease` is never run, so the AAB path is empty), then Firebase App Distribution (`wzieba/...@v1`, group `internal-testers`).

**iOS CI** (`ci-ios.yml`):
- macOS-15, Xcode 16. Runs on `ios/**` changes.
- `xcodebuild -resolvePackageDependencies`, build and test against the iPhone 16 Pro simulator with `CODE_SIGNING_ALLOWED=NO`.

**Other tooling:**
- `stale.yml` marks PRs stale after 14 days and closes them after 7 more.
- `dependabot.yml` covers gradle (grouped compose/lifecycle/hilt) and actions, weekly on Monday at 09:00 America/Chicago.
- Fastlane (`fastlane/Fastfile`): lanes `build_release`, `firebase_distribution`, `check`.
- detekt config: `detekt.yml`, 261 lines.

**Why these pipelines couldn't pass (static evidence):**

*Android:*
1. **`gradlew`, `gradlew.bat` and `gradle-wrapper.jar` are git-ignored** (`.gitignore` lines 300-302). CI runs `./gradlew …`, so every job fails immediately.
2. **`:app` doesn't declare dependencies it imports**: Retrofit, Moshi(+codegen KSP), Media3, Coil, okhttp-logging and camera. Only `okhttp` is declared (`app/build.gradle.kts:527-568`), and the feature modules use `implementation`, which isn't transitive. Files that import Retrofit, Moshi, Media3 or Coil (`di/NetworkModule.kt`, `data/remote/VidFriendsApi.kt`, `ui/detail/*`, `ui/feed/components/*`, `ui/collections/CollectionDetailScreen.kt`) can't compile.
3. **Hilt graph errors**: `UserPreferences(private val context: Context)` and `NotificationPrefs(private val context: Context)` have no `@ApplicationContext`, and nothing provides a bare `Context`.
4. **`FeedScreen.kt` uses `Modifier.size` and `Icons.Default.Download` without importing** `foundation.layout.size` / `icons.filled.Download`.
5. **Resources missing**: the manifest references `@mipmap/ic_launcher` but there are no mipmap or drawable resources in the repo, so AAPT link fails.

*iOS:*
1. **`ios/VidFriends.xcodeproj` is stale or hand-written.**
   - Its groups point to `ios/VidFriends/...`, but the sources live in `ios/Sources/VidFriends/...`.
   - It references only about 33 of the ~60 Swift files. Onboarding, Profile, Collections, History, Offline, FYP/Comments/VideoPlayer, Biometry/Download/Offline services, and 2 of the 4 test files are missing.
   - It has **no Swift Package reference for KeychainAccess**.
   - The CI `-scheme VidFriends` has no shared scheme committed.
2. **Swift compile error**: `FYPFeedView.toggleLike` mutates `let` fields of `Video`.
3. **SPM package**: the `VidFriendsShareExtension` target uses `internal` types (`KeychainService`, `APIClient`, `APIConfig`) from the `VidFriends` module, which isn't allowed across modules.

**Tests that exist** (Android COMBO, `app/src/test`, JUnit4 + MockK; 83 test methods):
- Repository tests: Auth 3, BlockUser 6, Download 12, Feed 2, History 2, Setup 2, Video 3.
- Download manager: 6.
- ViewModel tests: Collections 8, VideoDetail 4, Downloads 9, Feed 11, History 9, BlockedUsers 6.
- No UI, instrumentation, Room or migration tests.
- `FeedRepositoryImplTest` and the like-related tests don't catch the `likeCount = -1` bug (§2.7).

**Tests that exist** (iOS, Swift Testing):
- `APIClientTests` (24): endpoint path/method strings.
- `AuthInterceptorTests` (5): refresh/retry/concurrency with a mock client.
- `ServerSetupTests` (15): URL sanitising, coordinator, `setEnvironment`, `APIConfig` defaults.
- `VidFriendsTests` (about 55): StubAPIClient returns, model decode/encode, offline queue enqueue/dequeue, `NetworkMonitor` init, `DownloadService` formatting.
- **The model-decoding tests set `.convertFromSnakeCase` while the models declare snake_case CodingKeys** (e.g. `VidFriendsTests.swift:106-125`). With Foundation's documented behaviour, keys like `user_id` don't match and the tests fail. That's the same defect that would break every real API decode in `APIClient`.

### 2.7 COMBO bugs and pitfalls (lessons)

**iOS**

1. **Snake-case double conversion.** `APIClient` uses `.convertFromSnakeCase` together with explicit `"user_id"`-style CodingKeys (`APIClient.swift:21` vs `Models/*.swift`). Every multi-word field fails to decode. *Lesson:* pick one strategy and contract-test it against real JSON.
2. **Saved server URL is never applied.**
   - `AppState.init` hard-codes `http://localhost:3100` (`AppState.swift:27`).
   - `OnboardingCoordinator.init` reads the saved URL only to skip to `.auth` and never calls `setEnvironment`.
   - After a relaunch, both logged-in sessions and the auth screen talk to localhost.
   - The VID-370 commit message claims "Auto-connect on launch via keychain persistence", which contradicts the code.
3. **Keychain mismatch breaks the share extension.**
   - `OnboardingCoordinator` uses `KeychainService()` (no app group) to save the server URL.
   - `AppState` and the share extension use `KeychainService(useAppGroup: true)`.
   - So the extension can't find the server URL and always shows "Please log in to VidFriends first."
   - Also, the keychain `accessGroup` is passed as `"com.vidfriends.app"` without the team prefix, which likely fails, leaving only the plaintext UserDefaults fallback working.
4. **Token in plaintext app-group UserDefaults** (`KeychainService.saveToken`).
5. **Refresh contract and failure handling.**
   - Refresh sends no refresh token. The backend requires `{refresh_token}`.
   - A failed refresh clears the keychain but leaves `isAuthenticated = true`.
6. **APNs token upload likely never fires** (no app-delegate adaptor, no `aps-environment` entitlement). There's also no deep-link URL scheme registered.
7. **Missing `NSMicrophoneUsageDescription`.** `VideoRecorderController` adds an audio input, so it crashes on first use on device.
8. **Dead features.**
   - `OfflineService` and `OfflineOperationQueue` (never invoked).
   - `NetworkMonitorService` (never read).
   - `UserProfileSheetView` (never presented).
   - Friend-request endpoints.
   - Push settings (and `updatePushSettings` sends a GET with a body).
   - Biometry flag (never enforced).
   - Collections can't be filled from iOS.
   - No logout UI.
9. **History progress bar** divides by a constant 100 s.
10. **QR handling.**
    - `QRScannerController` calls `onScan` for every frame that contains the code.
    - The scan only fills the field; it doesn't auto-validate.
    - The QR payload is an unvalidated URL with no pairing secret.
11. **Downloads load the full file into memory.** There's no auth on media URLs and no resume.
12. **Upload "Cancel" doesn't cancel the network task.**

**Android (COMBO)**

13. **Start destination always resolves to Feed.** `runBlocking { userPreferences.serverUrl } != null` compares a **`Flow` object** to null (`MainActivity.kt:40-41`), so Setup and Auth are never the start screen.
14. **Setup health check runs against the wrong host.** `SetupViewModel.validateAndConnect` calls `healthCheck()` before `setServerUrl()` (`SetupViewModel.kt:52-58`), so `DynamicBaseUrlInterceptor` still has no URL and the request goes to `localhost:3100`. Setup can't succeed on a device.
15. **`DynamicBaseUrlInterceptor` rewrites scheme, host and port of *every* request**, including absolute media/download URLs on other hosts and thumbnails if they're fetched through OkHttp. It also drops any path prefix in the server URL, so `https://host/vidfriends` breaks.
16. **`TokenRefreshAuthenticator` uses the wrong refresh payload and response keys.**
    - It serialises a private `RefreshRequest(refreshToken)` with a reflection-less `Moshi.Builder().build()`, which throws, and the JSON key would be `refreshToken`, not `refresh_token`.
    - It expects `accessToken`, not `access_token`.
    - The exception path clears all prefs, so **any 401 logs the user out silently**.
17. **`likeVideo`/`unlikeVideo` write `like_count = -1` into Room** (`FeedRepositoryImpl.kt:46,57`). The bug is identical in DROID2.
18. **Retrofit `Response<Unit>` + `safeApiCall` treats a null body as failure.** Any 204 No Content from like, delete, block or watch is reported as "Empty response body".
19. **`VideoRepositoryImpl.getVideo` returns the cached row forever** and never refreshes it, so counts and liked state go stale.
20. **Blocking cascade.** The feed passes `video.id` into `blockUser`. The VM then resolves the user correctly, but the API naming is a trap.
21. **Downloads.**
    - They go through the logging client (whole body buffered: OOM risk on large videos).
    - The URL comes from `file_path`, which is a server-relative path, so `Request.Builder().url()` throws.
    - Resume appends even when the server ignores `Range` and returns 200, which corrupts the file.
22. **Upload reads the whole file into a `ByteArray`** (`VideoRepositoryImpl.uploadFile: file.readBytes()`). This also applies to DROID2.
23. **Room migrations are incomplete.** No 1→2, the `videos` duplicate columns are never migrated, and the `downloads` migration declares `DEFAULT 0` for `progress` while the entity has no default. Room's schema validation would fail on upgrade.
24. **Foreground `dataSync` service kept alive permanently for a WebSocket.** Android 14/15 restrict `dataSync` (time limits on 15) and this is policy-hostile for Play. The service is also `START_STICKY` with no token refresh for the socket.
25. **Notifications.** `PendingIntent` request codes and IDs come from `payload.hashCode()`, which can collide. `Class.forName("com.vidfriends.app.MainActivity")` is used from the feature module.
26. **The QR scanner leaks** its executor, ML Kit client and camera binding. It isn't unbound on dispose and has no de-bounce. That is exactly what DROID2's VID-503 fixed, then reverted.
27. **Leftover names.** Notification channel IDs `vidflow_*` and fastlane `package_name "com.vidflow.app"`.
28. **No string resources.** All copy is hard-coded, so there's no i18n.

---

## 3. DROID2 repo (`VidFriends_vidfriends-android`)

### 3.1 History
| Commit | Date | Summary |
|---|---|---|
| `7246e5b` | 06-17 | Initial scaffold; message wrongly says "Kotlin Multiplatform" |
| `db3c8bc` | 06-17 | Gradle wrapper 8.4 **committed** |
| `b3b6154` | 06-17 | `.gitignore` fix |
| `7f8da80` | 06-19 | VID-441 CI |
| `366a1f5` | 06-19 | ARCHITECTURE.md |
| `af02dab` | 06-19 | VID-474 VideoDetailScreen + LoginViewModel; "Fix pre-existing test compilation errors" |
| `55047c9` | 06-19 | VID-477 DI refactor: repo impls moved to `:app`, Room migrations extracted, LoginScreen, schema `4.json` |
| `abeb85f` | 06-19 23:34 | VID-503 |
| `3a4402e` | 06-19 23:35 | Revert VID-503 (no reason recorded) |

Authors: "CTO" (`cto@vidfriends.ai`) + Paperclip. Several files are byte-identical to COMBO/Android after package rename (for example `AuthInterceptor`, `DynamicBaseUrlInterceptor` and `VideoRepositoryImpl`), so **DROID2 was seeded from COMBO's early (pre-rename) Android code**, not written independently.

### 3.2 Modules (per ARCHITECTURE.md; verified)
| Module | Contents |
|---|---|
| `:app` | Application, MainActivity, NavHost, Room DB + DAOs + migrations, repository impls (Feed/History/Video), DI (Database, Repository), screens (Login, Feed, VideoDetail, Send) |
| `:common` | Pure domain models (`Video`, `User`, `Comment`, `AuthModels`, `ApiResult`) + repository interfaces. Depends only on coroutines-core |
| `:network` | Retrofit API, DTOs + mappers, interceptors, `UserPreferences` (DataStore), `AuthRepositoryImpl`, NetworkModule, NetworkMoshiModule, `safeApiCall` |
| `:ui` | `VidFriendsTheme` (M3, purple scheme), `ErrorView`, `LoadingIndicator`, `NavRoutes` |

Stack: AGP 8.2.2, Kotlin 1.9.22, Compose BOM 2024.02.00 (compiler 1.5.10), compile/target SDK 34, minSdk 26, Hilt 2.50, Retrofit 2.9, OkHttp 4.12, Moshi 1.15 (codegen), Room 2.6.1, DataStore 1.0.0, Media3 1.3.1, Navigation 2.7.7, JUnit4, MockK 1.13.9. This is **older** than COMBO.

### 3.3 Screens and journeys
Routes are defined in `ui/.../navigation/NavRoutes.kt`: `feed`, `login`, `register`, `video/{videoId}`, `upload`, `profile`. They're wired in `app/.../VidFriendsNavHost.kt` with start destination `login`.

| Screen | File(s) | Status | Notes |
|---|---|---|---|
| Login (server URL + username + password, show/hide password, error card, "Register" link) | `app/.../ui/auth/LoginScreen.kt`, `LoginViewModel.kt` | Implemented, untested (VM) | Saves the server URL unsanitised before login. Auto-navigates to Feed if a token exists (`isLoggedIn()` = token present, never validated). No QR on master (QR exists only in the `vid-503-fix` branch, with no screen using it). |
| Register | `VidFriendsNavHost.kt` `RegisterScreenPlaceholder` | **Stubbed** ("Registration coming soon") | `RegisterRequest.inviteToken` exists in the domain. |
| Feed (card list: caption, username, like count; infinite scroll; pull-to-refresh; "You've reached the end") | `app/.../ui/feed/FeedScreen.kt`, `FeedViewModel.kt` | Implemented + tested (VM: 9 tests) | **No video playback or thumbnails in the feed.** Pull-to-refresh sets `isLoading`, which swaps the whole list for a spinner. No FAB to Send. |
| Video detail (16:9 ExoPlayer `PlayerView` with standard controls, caption/username/date, like toggle, comments list with delete, comment input) | `app/.../ui/detail/VideoDetailScreen.kt`, `VideoDetailViewModel.kt` | Implemented + tested (VM: 9 tests) | Plays `file_path` or else `source_url` directly. Retry creates a new ExoPlayer without releasing the old one. The player isn't Compose state (fragile recomposition). `markWatched` runs on every open. Optimistic like with no rollback. Delete shows on all comments. |
| Send (segmented URL / File; URL → `send-link`; File picker `video/*` → copies to cache → multipart upload; navigates to detail on success) | `app/.../ui/send/SendScreen.kt`, `SendViewModel.kt` | Implemented, **unreachable** | Route `upload` exists but nothing navigates to it. No recipient selection. |
| Profile | `NavRoutes.PROFILE` | **Planned-only** | No composable. ARCHITECTURE.md lists it as "ProfileScreen". |
| Logout, collections, downloads, notifications, friends, inbox, block, history UI | — | **Not present** | `HistoryRepository` exists; Room tables for collections/downloads/cache exist but are unused. |

### 3.4 API, models, auth, server URL
- **Endpoints** (`network/.../data/remote/VidFriendsApi.kt`) are the same as COMBO/Android's *early* set, and ARCHITECTURE.md's table matches them exactly:

| Method | Path |
|---|---|
| POST | `api/auth/register`, `api/auth/login`, `api/auth/refresh` |
| GET | **`api/auth/me`** (COMBO later changed this to `api/users/me`) |
| GET | `api/feed?page&limit` |
| GET | `api/videos/{id}` |
| POST | `api/videos/send-link`, `api/videos/upload` (multipart) |
| POST / DELETE | `api/videos/{id}/like` |
| GET / POST | `api/videos/{id}/comments` |
| DELETE | `api/videos/{id}/comments/{commentId}` |
| POST | `api/videos/{id}/watch` |
| DELETE | `api/videos/{id}` |
| GET | `api/videos/{id}/status`, `api/history?page&limit`, `api/health` |

- Payloads are the same as COMBO/Android minus `is_duplicate`/`duplicate_of`, `UpdateUser` and push.
- **Auth:**
  - Tokens and user info are stored in plaintext DataStore (`network/.../data/preferences/UserPreferences.kt`).
  - `AuthInterceptor` adds `Bearer` via `runBlocking`.
  - **There's no refresh authenticator.** `AuthRepository.refreshToken()` exists but nothing calls it, so expiry means every call fails with 401 until the user logs out. There's no logout UI either.
  - `ApiErrorInterceptor` throws `ApiException` (an IOException) for non-2xx responses, so `safeApiCall`'s own code mapping is mostly bypassed.
  - Logging is BODY level.
- **Server URL:** entered on the login screen and stored in DataStore. `DynamicBaseUrlInterceptor` rewrites scheme, host and port (same pitfalls as §2.7 #15). The default Retrofit base is `http://localhost:3100/`.
- **Room:** `vidfriends.db` v4, `exportSchema = true` with **`app/schemas/.../4.json` committed**, and explicit `Migrations.kt` 1→2, 2→3, 3→4 (better hygiene than COMBO). Tables: `videos`, `comments`, `cache`, `collections`, `collection_videos`, `downloads`. Only `videos` and `comments` are used.

### 3.5 Build, CI, tests
- **CI** (`.github/workflows/ci.yml`, VID-441): on push to main/master and PRs, JDK 17 Temurin, `gradle/actions/setup-gradle@v4`, `./gradlew assembleDebug`, `./gradlew test`, upload the debug APK (30-day retention). There's no lint step in CI, though ARCHITECTURE documents `./gradlew lint`.
- The **Gradle wrapper is committed** (8.4), which is correct. **But `./gradlew test` will fail.**
  - `network/src/test/.../FeedRepositoryImplTest.kt` imports `com.vidfriends.android.data.local.dao.VideoDao` and constructs `FeedRepositoryImpl`. Both moved to `:app` in VID-477.
  - `:network` doesn't (and can't) depend on `:app`.
  - So the `:network` test source set doesn't compile.
- **Tests:**
  - `app/src/test`: `FeedViewModelTest` (9) and `VideoDetailViewModelTest` (9; mocks `Application`, ExoPlayer creation is swallowed by try/catch).
  - `network/src/test`: `AuthRepositoryImplTest` (2) and `FeedRepositoryImplTest` (2, broken as above).
- No UI or instrumentation tests. ARCHITECTURE.md says so ("No emulator/instrumentation tests").

### 3.6 Accessibility, offline, platform
- **Accessibility:**
  - Minimal. Icons carry `contentDescription` ("Back", "Like/Unlike", "Delete", "Send", "Show/Hide password").
  - Leading field icons are `null`. No semantics grouping.
  - Hard-coded strings (`strings.xml` has only `app_name`).
- **Offline:**
  - Feed, history and comments fall back to whatever is in Room on network failure.
  - The history fallback returns the **entire `videos` table** (feed + history mixed), and `clearHistory()` deletes the entire video cache locally without calling the server.
- **Platform:**
  - Permissions: `INTERNET` and `ACCESS_NETWORK_STATE` only.
  - Edge-to-edge is on; the theme sets the status bar colour.
  - minSdk 26.

### 3.7 Unmerged branches and the revert
- **`origin/vid-474/video-detail-screen`**: tip `af02dab`, which is an ancestor of master. **Fully merged, no unique work.**
- **`origin/vid-503-fix`**: one commit, `b481399`, branched from `55047c9`. Its tree is identical (`94542766…`) to master's `abeb85f`, which was reverted by `3a4402e` one minute later. **This is the only unique, un-landed work in either repo.** It contains:
  1. `UserPreferences.saveAuthSession(access, refresh, userId, username)`: a single `dataStore.edit{}` that replaces the two separate writes in `AuthRepositoryImpl.login/register` (so you can't end up with tokens saved but no user, or the reverse).
  2. `app/.../ui/scanner/QrScannerView.kt`: CameraX Preview + ImageAnalysis (1280×720, KEEP_ONLY_LATEST) feeding ML Kit `BarcodeScanning`, with a `DisposableEffect` that shuts down the executor, closes the scanner and calls `unbindAll()`. Remaining flaws:
     - `onDispose` calls the blocking `cameraProviderFuture.get()` on the main thread.
     - It emits every barcode value on every frame (no de-dupe or format filter).
     - **No screen uses it.**
  3. Dependencies: CameraX 1.3.1 and ML Kit barcode 17.2.0.
  4. Test updates: `coVerify` for suspend calls, `inviteToken = null` in the register test.
- **Why it was reverted:** no rationale is recorded anywhere. A plausible reason is that it landed on master directly instead of through the branch/PR; the branch with identical content was left open. Worth carrying forward as *ideas* (an atomic session write, a lifecycle-safe scanner), not as code.

---

## 4. API contract: what these clients call vs the backend

The backend clone's router (`internal/router/router.go`, backend commit `b295904`) defines these, among others:

- **Auth:** `POST /api/auth/{register,login,refresh,logout}`, `GET /api/auth/me`, `PUT /api/auth/profile`, `DELETE /api/auth/me/account`
- **Feed:** `GET /api/feed`, `GET /api/feed/fyp`
- **Videos:**
  - `GET /api/videos/{id}`, `/file`, `/download` (GET + DELETE), `/likes`, `/duplicates`, `/comments`
  - `POST /api/videos/{id}/{like,react,comment,watched,unsend}`, `DELETE …/like`, `…/react`, `…/comments/{commentId}`
  - `PATCH /api/videos/{id}/keep`
  - `POST /api/videos/upload`, `POST /api/videos/from-link`, `DELETE /api/videos/{id}`
- **Social:**
  - `POST /api/send/{id}`
  - `GET /api/inbox`, `PATCH /api/inbox/{id}`, `POST /api/inbox/{id}/read`
  - `GET /api/friends`, `/api/friends/requests`; `POST /api/friends/{invite,accept/{id},block/{id}}`
  - `GET /api/users`, `/api/users/{id}/profile`, `/api/users/{id}/videos`
  - `GET /api/history`
- **Push / realtime:** `POST /api/push/register`, `GET /api/ws`
- **Other:** `/api/import*`, `/api/oauth/*`, `/api/admin/*`, `PUT /api/duplicates/{id}/canonical`, `GET /api/health`

Backend auth DTOs (`internal/handler/auth.go:52-73`):

| DTO | Fields |
|---|---|
| Register | `{email, username, password, display_name?, invite_code}` |
| Login | `{email, password}` |
| Refresh | `{refresh_token}` |
| Response | `{access_token, refresh_token, expires_in}` |

Feed responses appear to be `{videos, next_page_token}` with `page_size`/`page_token` query params (`internal/handler/video.go:467-496`).

| Client call | iOS | COMBO/Android | DROID2 | Backend has it? |
|---|---|---|---|---|
| Login | `POST /api/auth/login {email,password}` → expects `{token}` | `{username,password}` → expects `{user_id,username,access_token,refresh_token}` | same as COMBO/Android | Path yes. **iOS:** request OK, response mismatched. **Android:** request field wrong (`username` vs `email`), response missing `user_id`/`username`, so Moshi fails on non-null fields. |
| Register | `{…,invite_code}` → `{token}` | `{…,invite_token}` | same | Path yes. iOS request OK, response mismatch. Android key wrong (`invite_token`) and the UI always sends null. |
| Refresh | no body, Bearer | `{refresh_token}` via Retrofit (unused), and camelCase via the authenticator (broken) | `{refresh_token}` (never called) | Yes. Needs `{refresh_token}`. |
| Logout | — | — | — | `POST /api/auth/logout` exists; **no client calls it** |
| Current user | `GET /api/auth/me` | `GET /api/users/me` | `GET /api/auth/me` | `/api/auth/me` yes; `/api/users/me` **no** |
| Update profile | `PATCH /api/auth/me` | `PATCH /api/users/me` | — | **No.** Backend is `PUT /api/auth/profile` |
| Feed | `GET /api/feed?cursor` → `next_cursor` | `?page&limit` → `{page,total}` | same | Path yes; **pagination shape differs for both** |
| Video detail | `GET /api/videos/{id}` | same | same | Yes. Field names: backend `title`/`file_url` (matches iOS), Android expects `caption`/`file_path`/`username`. |
| Create from link | `POST /api/videos {url,title,description}` | `POST api/videos/send-link {source_url,caption}` | same | **Neither.** Backend is `POST /api/videos/from-link` |
| Upload | `POST /api/upload` → `{url,file_name}` | `POST api/videos/upload` (multipart file+caption) | same | Android path yes; iOS path **no** |
| Like / unlike | `POST/DELETE …/like` | same | same | Yes |
| Comments list | `GET …/comments` | same | same | Yes |
| Add comment | `POST …/comment {body,parent_id}` | `POST …/comments {text}` | same | iOS yes; Android **no** (path and field) |
| Delete comment | — | `DELETE …/comments/{cid}` | same | Yes |
| Mark watched | `POST …/watched {progress_seconds}` (never called) | `POST …/watch` | same | iOS path yes; Android **no** |
| Unsend | `POST …/unsend` | `DELETE /api/videos/{id}` | — | iOS yes; Android deletes the video instead |
| Send to friend | `POST /api/videos/{id}/send {to_user_id}` | — | — | **No.** Backend is `POST /api/send/{id}` |
| Sent list | `GET /api/videos/sent` | — | — | **No** |
| Inbox | `GET /api/inbox`, `PATCH /api/inbox/{id} {status}` | — | — | Yes |
| Friends | `GET /api/friends`, `GET /api/friends/requests`, `PATCH /api/friends/{id}` | — | — | First two yes; respond **no** (backend `POST /api/friends/accept/{id}`) |
| User search | `GET /api/users?q=` | — | — | Yes |
| Block / unblock / list | `POST/DELETE /api/users/{id}/block`, `GET /api/users/blocked` | same paths (+page/limit) | — | **No.** Backend is `POST /api/friends/block/{id}` only |
| Collections (CRUD + videos) | `/api/collections…` | `/api/collections…` (+PUT) | — | **No collections routes in backend** |
| Download | `GET /api/videos/{id}/download` → `{url,file_name}` | Downloads `file_path` directly | — | Route yes (response shape unverified) |
| Video status | — | `GET …/status` | same | **No** |
| History | `GET /api/history` | `?page&limit` | same | Yes |
| Push register | `{token, platform:"ios"}` (APNs) | `{device_id, platform:"android", topic}` → `ws_url` | — | Route yes |
| Push unregister / settings | `GET /api/push/settings` | `POST /api/push/unregister` | — | **No** |
| Realtime | — | WebSocket at `ws_url` or `<server>/ws` | — | Backend `GET /api/ws`; the fallback `/ws` path is wrong |
| Health | `GET /api/health` | same | same | Yes |

**Takeaways:**
- The iOS contract is close to the backend's vocabulary (inbox, friends, `watched`, `comment`, `unsend`, `title`/`file_url`, email login, `invite_code`). Its main gaps are the auth response shape, refresh, send, upload, create-from-link, profile update, block and collections.
- The Android contract (both repos) matches poorly. It looks like it was written from an earlier or imagined spec.
- Backend capabilities that **no client uses**:
  - `/api/feed/fyp`, reactions, `/api/videos/{id}/file` (authenticated file streaming)
  - duplicates canonicalisation, `keep`, inbox `read`
  - `friends/invite`, user profiles and user video lists
  - logout, account deletion
  - import jobs, OAuth playlists, admin

---

## 5. Comparison: which repo is newer, overlap, supersession

| Aspect | COMBO | DROID2 |
|---|---|---|
| Last commit | 2026-06-18 | 2026-06-19 (newer by 1 day) |
| First commit | 2026-06-14 | 2026-06-17 |
| Platforms | iOS (SwiftUI) + Android (Compose) | Android only |
| Android package | `com.vidfriends.app` | `com.vidfriends.android` (different app ID; both could be installed side by side) |
| Android screens actually implemented | Setup+QR, Auth (login/sign-up), Feed (vertical autoplay), Detail (custom full-screen player), Collections (list/detail/add dialog), Downloads, History+Unsend, Blocked users, Notification prefs | Login, Feed (text cards), Detail (16:9 player + comments), Send (unreachable) |
| Android features | Downloads w/ resume + FGS, WS push + 5 channels, block, collections, duplicate badge, token-refresh authenticator, deep links | none of these |
| Module design | Feature-module skeleton (`core/*`, `feature/*`) but code piled into `:app`; feature modules mostly empty | Smaller layered modules (`:common` pure domain, `:network`, `:ui`, `:app`), actually populated |
| Build hygiene | Wrapper git-ignored; missing deps/resources; Hilt context errors; compile errors; no committed Room schema | Wrapper committed; deps declared; Room schema + migrations committed; one broken test file |
| Docs | None (commits only) | ARCHITECTURE.md |
| Tests | Android 83 + iOS ~100 (mostly stub/endpoint/model) | 22 |
| Tooling | detekt, fastlane, Firebase App Distribution, dependabot, stale bot, signed release job | Single CI job |

**Overlap:**
- DROID2's Android code is a subset fork of COMBO's early Android code. Some files are identical after the package rename; `FeedViewModel` and `VideoDetail*` were rewritten.
- Both use the same Android API surface, except that COMBO later added collections, block, push and `users/me`, and moved `auth/me` to `users/me`.
- Both carry the same latent bugs: `like_count = -1`, `DynamicBaseUrlInterceptor`, plaintext DataStore tokens, BODY logging, whole-file upload into memory, `Response<Unit>`/204 handling.

**Supersession verdict:**
- **Neither supersedes the other.** DROID2 looks like an attempt (VID-441 to VID-503, under a "CTO" identity) to restart Android as a separate repo with cleaner architecture. It stalled after about 3 feature tickets and ended in a revert.
- COMBO/Android remains the richer Android feature reference. COMBO/iOS is the only iOS code. Note there's also a sibling `VidFriends_vidfriends-ios` clone, which wasn't in scope for this audit.
- For the greenfield docs:
  - Take **features and UX** from COMBO (iOS for the social model: friends, inbox, send, unsend; Android for downloads, collections, duplicates, notification channels).
  - Take **layering and build conventions** from DROID2.
  - Take **the API contract from the backend**, not from either client.

---

## 6. Cross-cutting: accessibility, offline, platform constraints

- **Accessibility:**
  - iOS is strong: a deliberate VID-86 sweep with labels, hints, header traits, combined elements and hidden decorative images.
  - Android is weak in both repos: mostly `contentDescription` on icons, many `null`s (22 in COMBO), white-on-image text without a contrast strategy, hard-coded strings.
  - Neither supports landscape: iOS is portrait-locked, and Android behaviour is unspecified.
- **Offline:**
  - iOS: real offline playback of explicit downloads (SwiftData + Documents/Downloads). A designed but unwired cache and mutation queue.
  - COMBO/Android: Room write-through cache for feed/history/comments/collections, downloads with PENDING queued until connectivity returns, low-storage pruning.
  - DROID2: cache fallback only.
  - None of them queue offline mutations in practice.
- **Platform constraints:**
  - iOS 17+, App Group plus a keychain group shared with the share extension.
  - Android minSdk 26. COMBO targets SDK 35, so the Android 14 foreground-service type rules apply (`dataSync` for downloads and push), as does the POST_NOTIFICATIONS runtime permission on Android 13+ (requested only on the Downloads screen) and `WRITE_EXTERNAL_STORAGE` maxSdk 28.
  - Self-hosted servers are often LAN/HTTP: iOS allows local networking via ATS, while Android has **no `networkSecurityConfig`/`usesCleartextTraffic`**, so cleartext `http://` LAN servers are blocked on API 28+ by default. That's a pitfall for a self-hosted product.

---

## 7. Carry forward vs lessons learned

### 7.1 Good ideas to carry forward
1. **Self-hosted onboarding:**
   - Enter or scan the server URL, then show an explicit "Test Connection" health check with granular errors and a revert on failure (iOS `ServerSetupView`).
   - Sanitise the URL by auto-prepending `https://` (with unit tests).
   - Persist the URL securely and **apply it on launch**.
2. **QR pairing, but upgraded.** The QR should carry a structured payload (server URL plus an optional invite code or pairing token, signed or versioned) instead of a bare URL. Scanning should de-bounce and auto-validate.
3. **Invite-only sign-up** with an admin invite code, matching the backend's `invite_code`.
4. **Friends-only send model:** pick a friend, upload, then send. Recipients get an inbox with accept/reject, senders get **unsend** with a confirmation ("cannot be undone"), and there's a **sent list**.
5. **Duplicate detection UX:** a "Duplicate" badge that links to the original (backend already supports duplicates and canonicalisation).
6. **Watch-gated download** (download offered after N seconds of viewing), **watch progress** in history, and **collections** (with "Create & Add" in one step).
7. **iOS share extension** for "share to VidFriends" from Photos and other apps. Android should add an equivalent `ACTION_SEND` `video/*` intent filter (the `feature/share` module was planned).
8. **Self-hosted push without Google/Apple dependency on Android:** WebSocket push with per-type channels (messages, likes, comments, new videos) and local per-channel toggles. Redesign it around WorkManager, FCM-optional or UnifiedPush rather than a permanent `dataSync` foreground service.
9. **Robust downloads:** Range resume, a pending queue on network-available, storage reporting, low-space pruning, and a progress notification (COMBO `DownloadManager`/`DownloadRepositoryImpl`). They need a dedicated non-logging client and correct 200/206 handling.
10. **Streamed multipart upload** from a temp file with progress (iOS `APIClient.uploadVideo`). Android should copy this instead of `readBytes()`.
11. **A single-flight token refresh**: a mutex or actor plus a one-retry interceptor (iOS `AuthInterceptor`, Android `TokenRefreshAuthenticator`), wired to a global "session expired → re-auth" event.
12. **Stub API client / demo mode** behind the same protocol (`StubAPIClient`) for previews, UI tests and app review.
13. **Error-state pattern:** an explicit empty / error / retry state on every screen, with Retry shown after the first failure; the feed's "all caught up" end state.
14. **Accessibility discipline** at iOS VID-86 level, applied to both platforms.
15. **Atomic session persistence** (`saveAuthSession`) and **lifecycle-safe camera/scanner disposal** (VID-503 ideas).
16. **Module layering** à la DROID2 (`:common` pure domain, `:network`, `:ui`), Room schema export with explicit migrations, and a committed Gradle wrapper.
17. **Release tooling:** a signed release on tags, Firebase App Distribution to `internal-testers`, dependabot groups, detekt.

### 7.2 Bugs and pitfalls to avoid (lessons)
1. **No contract tests against the real backend.** All three clients drifted (paths, methods, field names, auth response, pagination). Generate clients from an OpenAPI spec owned by the backend, or at least add contract/integration tests.
2. **The Swift `.convertFromSnakeCase` plus snake_case `CodingKeys` double conversion** breaks decoding. The tests use the same broken setup, so they "test" the bug.
3. **Server URL lifecycle bugs on both platforms:**
   - iOS never re-applies the saved URL.
   - Android runs the health check before saving the URL.
   - Android checks start-up state by comparing a `Flow` to null.
   - The host-rewriting interceptor clobbers absolute URLs and path prefixes.

   *Lesson:* build the API client from the configured base URL. Don't rewrite hosts in an interceptor.
4. **Token security:** plaintext DataStore on Android, plaintext app-group UserDefaults on iOS, BODY-level HTTP logging in all builds. Use Keychain / EncryptedSharedPreferences (or the Keystore), and log headers only in debug.
5. **A silent logout on refresh failure with no UI transition** (both platforms), plus an Android refresh payload that can't serialise.
6. **Optimistic UI without rollback**, double-applied optimistic likes (iOS), the `like_count = -1` cache corruption, and deleting comments locally on API failure.
7. **Cache-first `getVideo` that never refreshes.** Offline fallbacks that mix tables (DROID2 history fallback). `clearHistory` that is local-only.
8. **Whole-file memory loads** for upload (Android) and download (iOS). The logging interceptor buffering video bodies.
9. **Dead or unreachable code shipped as "done":**
   - iOS offline queue and cache, block sheet, friend requests, push settings, biometry gate, collections "add".
   - Android Send screen (DROID2), History and Notification prefs (deep-link only), logout (no UI), Register placeholder.

   *Lesson:* define "done" as reachable from navigation and covered by a UI test.
10. **Build hygiene failures:**
    - Git-ignored Gradle wrapper.
    - Undeclared dependencies relying on non-transitive `implementation`.
    - A missing launcher icon.
    - A hand-written, stale `.pbxproj` that doesn't match the SPM layout.
    - A cross-module test left behind after a refactor (DROID2).
    - A 195-file mega-commit (COMBO `6e24d2f`).
    - A revert with no rationale.

    *Lesson:* CI must be green before merge. Prefer one source of truth for the iOS project (an SPM-only or generated project, e.g. XcodeGen/Tuist).
11. **Platform policy traps:**
    - Missing `NSMicrophoneUsageDescription`.
    - Missing `aps-environment` and app-delegate token handling.
    - Unregistered URL scheme.
    - Android cleartext block for LAN `http://` servers.
    - Long-lived `dataSync` foreground service for push.
    - POST_NOTIFICATIONS only requested on one screen.
12. **Naming leftovers after the VidFlow → VidFriends rename** (notification channel IDs, fastlane package name). Renames need a grep-and-verify step.
13. **Identity confusion in forms:** Android login labels the field "Email" but sends it as `username`; sign-up maps "Name" to `username`; there's no invite field even though the backend requires it.

---

## 8. Contradictions found (docs, commits and code)
1. DROID2's initial commit says "Kotlin Multiplatform project with shared, androidApp modules". ARCHITECTURE.md says "no KMP", and the code is plain Android.
2. DROID2's ARCHITECTURE.md lists a `profile` → ProfileScreen route and "login/register" screens. Profile doesn't exist and register is a placeholder. It describes `DynamicBaseUrlInterceptor` as handling "staging/production URLs", but it actually holds the user's self-hosted URL.
3. VID-370 claims "Auto-connect on launch via keychain persistence". The code never applies the saved URL to the API client on launch.
4. iOS `APIConfig` defaults to `http://localhost:8080` (and a test asserts this), while `AppState` and both Android apps default to `http://localhost:3100`.
5. COMBO/Android uses `api/users/me`, while DROID2 and iOS use `api/auth/me`. Only `api/auth/me` exists on the backend.
6. "Unsend" means three things:
   - iOS: `POST /videos/{id}/unsend`, which removes the video from the recipient's inbox.
   - Android: `DELETE /videos/{id}`, which deletes the video, with copy claiming "the recipient won't be able to view it" even though Android has no recipients.
   - Backend: has `/unsend`.
7. iOS onboarding requires an invite code for sign-up. Android sign-up sends `inviteToken = null` and has no field, yet the backend requires `invite_code`.
8. The Android notification taxonomy includes "Followers" and "Messages", and the iOS empty state says "Follow friends". There is no follow or messaging feature in any client; the backend models friends, not followers.
9. VID-86 says "Accessibility … to all interactive elements". That's true for iOS only. The Android UI wasn't covered.
10. VID-263 calls the `videoDownload` POST→GET change "CRITICAL", yet the download URL it returns is fetched without auth, and the Android clients bypass this endpoint entirely and download `file_path` directly.
11. The `9738fb7` commit (VID-263) added `ios/Sources/VidFriends/*` while the `VidFlow` copy still existed. For one commit the repo had two parallel iOS source trees; the rename commit then deleted `VidFlow/`.
