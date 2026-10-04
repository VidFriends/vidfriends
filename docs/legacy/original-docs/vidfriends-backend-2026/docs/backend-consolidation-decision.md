# Backend Consolidation Decision

**Date:** 2026-06-15
**Author:** CTO
**Issue:** [VID-152](/VID/issues/VID-152)
**Status:** Decided, communicated

---

## Decision

### 1. Canonical Backend: `work/vidfriends/`

**`work/vidfriends/`** is the single canonical VidFriends backend.

- **Stack:** Go 1.26, PostgreSQL 16, S3-compatible storage (MinIO)
- **Status:** Feature-complete for v0.1
- **Why:** Directly implements VidFriends features (auth, video upload, feed, friends, notifications, comments, watch history, admin). Has CI, integration tests, migrations, deployment guide, and security checklist.

All engineering teams (web, Android, iOS) **must target this backend only**.

### 2. Archive: `work/backend/`

The TypeScript/Express + SQLite backend at `work/backend/` is **deprecated**.

- No new features or bug fixes
- Code remains for reference
- See `work/backend/README.md` for details

### 3. MuxCore: `work/core/` → Separate Repository

**`work/core/` (MuxCore) should move to its own repository.**

- **Why separate:** MuxCore is a general-purpose distributed media orchestration platform with its own module system, gRPC mesh, and GPL-3.0 license. It is not a VidFriends backend. Absorbing it into vidfriends would introduce massive architectural complexity, licensing friction, and maintenance burden with no direct benefit to v0.1 delivery.
- **Useful patterns for v0.2:** MuxCore's perceptual hashing pipeline (phash/dhash/ahash with distance-based dedup in `internal/video/`) can serve as a reference implementation when fuzzy duplicate detection is scoped for v0.2.
- **Current state:** Any VidFriends-specific code should be migrated to `work/vidfriends/` before the repository is separated.

### 4. Perceptual Hashing → v0.2

Exact-match dedup (same URL, same file hash) is already implemented in vidfriends via:
- `internal/hash/detector.go` — file hash detection
- `internal/handler/duplicate.go` — duplicate group management
- `migrations/000014_create_duplicate_groups` — database schema

Fuzzy perceptual hashing (phash, cross-platform/social merging) is **deferred to v0.2**.

---

## Rationale

| Option | Assessment |
|--------|-----------|
| Keep 3 backends | ❌ High maintenance burden, team confusion |
| Designate `work/core/` as canonical | ❌ Architecturally misaligned (distributed media fabric ≠ VidFriends API) |
| Designate `work/vidfriends/` as canonical | ✅ Recommended — directly implements product features |
| Absorb `work/core/` into `work/vidfriends/` | ❌ Different license (GPL vs AGPL), different architecture, massive scope increase |
| Move `work/core/` to separate repo | ✅ Clean separation, preserves MuxCore as independent project |
| Archive `work/backend/` | ✅ Required — removes team confusion |

---

## Communication

- **Web lead:** API is at `work/vidfriends/`, port 8080, REST endpoints per README
- **Android lead:** Same API target — `/api/` endpoints documented in vidfriends README. Uses dynamic base URL via `DynamicBaseUrlInterceptor` so no code change needed.
- **iOS lead:** Same API target — `/api/` endpoints documented in vidfriends README. Default base URL in `APIConfig.swift` was updated from `localhost:3100` to `localhost:8080`.
- **ProductManager:** Decision aligns with Product-Report.md Section 6
- **CEO:** Notified via issue [VID-152](/VID/issues/VID-152)
