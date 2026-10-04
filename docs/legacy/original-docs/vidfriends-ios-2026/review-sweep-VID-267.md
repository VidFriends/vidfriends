# iOSSenior Review Sweep — VID-267

Reviewed all 8 of iOSJunior's `in_review` items. Full code audit of `Sources/VidFriends/` (57 files, ~6445 lines).

## Review Results

| Issue | Title | Decision | Notes |
|-------|-------|----------|-------|
| [VID-252](/VID/issues/VID-252) | Offline, Unsend, Block & Push Integration | **APPROVED** | Minor: `OfflineService.parseDate()` creates new formatter on every call |
| [VID-253](/VID/issues/VID-253) | Polish Sweep | **APPROVED** | Tech debt: `#warning` for `AVCaptureMovieFileOutput` deprecation |
| [VID-69](/VID/issues/VID-69) | Auth & Feed Screens | **APPROVED** | Clean MVVM, proper DI, comprehensive accessibility |
| [VID-70](/VID/issues/VID-70) | Send Video & Social Features | **APPROVED** | Medium: `ProfileView.unsendVideo()` optimistic update swallows errors silently |
| [VID-110](/VID/issues/VID-110) | Address re-review findings on VID-70 | **APPROVED** | All previous findings resolved |
| [VID-97](/VID/issues/VID-97) | Onboarding: Server URL & QR | **APPROVED** | Pre-reviewed as VID-145, fixes verified |
| [VID-86](/VID/issues/VID-86) | Polish Sweep | **APPROVED** | Same as VID-253 |
| [VID-82](/VID/issues/VID-82) | VID-70 Changes Requested | **APPROVED** | All 3 issues fixed (friend names, banner, currentUser) |

---

## Detailed Findings

### VID-252 — Offline, Unsend, Block & Push Integration
**Files reviewed:** OfflineService, OfflineOperationQueue, DownloadService, PushNotificationService, NetworkMonitorService, SocialModels, BlockedUsersView, UserProfileSheetView, OfflineDownloadsView, ProfileView (unsend/block sections)

**Verdict:** Solid architecture. SwiftData caching layer with actor-based offline operation queue is well-designed. Push notification handling is standard and correct.

**Minor issues:**
- `OfflineService.parseDate()` at line 92 creates a new `ISO8601DateFormatter()` on every call. Should use a cached singleton/lazy `let` formatter.
- `DownloadService.downloadVideo()` uses `URLSession.shared` for downloads — no background URLSession for large videos. Not a blocker now but worth an enhancement issue.
- `NetworkMonitorService` uses `Task { @MainActor in }` inside `NWPathMonitor` handler — OK but could simplify with `.main` queue directly.

### VID-253 / VID-86 — Polish Sweep: Launch Screen, App Icon, Accessibility, Error States
**Files reviewed:** All view files across the app, Assets.xcassets, Info.plist

**Verdict:** Comprehensive accessibility labels on nearly every interactive element. Consistent `ContentUnavailableView` pattern with retry overlays throughout. Error states are handled uniformly.

**Tech debt:**
- `VideoRecorderController.swift:39`: `#warning("AVCaptureMovieFileOutput is deprecated in iOS 16+. Migrate to AVAssetWriter before shipping.")` — Should create a tech debt issue to track this migration.

### VID-69 — Auth & Feed Screens
**Files reviewed:** AuthView, BiometryOptInView, AuthService, BiometryService, KeychainService, FeedView, VideoPlayerView, VideoPlayerController, OnboardingCoordinator

**Verdict:** Clean MVVM with proper service abstraction. `BiometryServiceProtocol` enables testability. Feed has blocked-user filtering. Video player has a 5-second watch threshold before download button appears. Onboarding coordinator manages step transitions cleanly.

### VID-70 — Send Video & Social Features
**Files reviewed:** SendVideoView, VideoRecorderView, VideoRecorderController, FriendPickerView, UploadProgressView, InboxView, CollectionsView, HistoryView, ProfileView, UserProfileSheetView

**Verdict:** Feature-rich implementation with proper SwiftUI patterns. Friend picker supports both search and existing friends list. Inbox has swipe-to-accept/reject. Collections CRUD is complete. Video source supports both picker and recording.

**Medium issue:**
- `ProfileView.unsendVideo()` (line 234-242): Optimistically removes the item from `sentVideos` array before the API response. If `unsendVideo` throws, the error is logged to `self.error` (which shows in the UI's error state) but the item is already gone from the list. The item should either be re-added on error or the removal should wait for API success.

### VID-110 — Address re-review findings on VID-70
**Files reviewed:** All APIClientProtocol methods, APIClient implementations, stub client, tests

**Verdict:** All previous review findings from VID-82 are addressed:
- ✅ `APIClientProtocol`: All required methods exist (blockUser, unblockUser, getBlockedUsers, getPushSettings, updatePushSettings, downloadVideo, unsendVideo)
- ✅ `APIClient`: All methods implemented with proper request/response bodies
- ✅ `StubAPIClient`: All methods stubbed with realistic test data
- ✅ `AuthInterceptor`: Proper 401 handling with refresh token deduplication
- ✅ Tests cover blocking endpoints, unsend, push registration, downloads

### VID-97 — Onboarding: Server URL & QR Connection
**Files reviewed:** ServerSetupView, QRScannerController, OnboardingCoordinator

**Verdict:** Pre-reviewed and approved in [VID-145](/VID/issues/VID-145). The `AVCaptureSession` lifetime fix (strong reference to `captureSession`) and double-dismiss fix (removed UIKit `dismiss()` call) are both present. Connection testing flow is correct.

### VID-82 — VID-70 Changes Requested
**Findings from previous review, all confirmed fixed:**

1. **FriendPickerView hardcoded names** ✅ Fixed — Uses `friend.username ?? friendId` and `friend.displayName` from API response at `FriendPickerView.swift:96-101`
2. **InboxView banner dead code** ✅ Fixed — `showBanner = true` is set in `showBannerForNotification()` at line 139, triggered by `didReceiveForegroundNotification` observer
3. **AppState.currentUser never populated** ✅ Fixed — `currentUser` set in `init()` via `Task { try? await authSvc.fetchCurrentUser(using: apiClient) }` and in `completeAuth()` at line 64

---

## Summary

All 8 items **APPROVED**. Two medium-priority follow-ups identified:

1. [Tech Debt] `#warning` for `AVCaptureMovieFileOutput` deprecation — needs migration to `AVAssetWriter` before production release
2. [Medium] `ProfileView.unsendVideo()` silent error on optimistic removal — item not re-added on failure

No BLOCKER or CRITICAL issues found. Code quality is solid with consistent patterns across the codebase.
