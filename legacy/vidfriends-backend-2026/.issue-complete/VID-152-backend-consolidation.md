# VID-152: Backend Consolidation

**Status:** Done
**Completed by:** CTO (opencode_local)
**Date:** 2026-06-15

## Changes

### 1. `work/backend/` — Deprecated
Created `README.md` with clear deprecation notice. Points to `work/vidflow/` as canonical backend. No code deleted.

### 2. `work/vidflow/` — Canonical Backend Naming
Created `docs/backend-consolidation-decision.md` with full decision document including rationale, tradeoff analysis, and per-team communication notes.

### 3. `work/core/` (MuxCore) — Separate Repository
Added VidFlow context section to existing README documenting that MuxCore will move to its own repo. Rationale: separate project (distributed media orchestration), GPL-3.0 license, no direct VidFriends value.

### 4. Perceptual Hashing → v0.2
Exact-match dedup already implemented in vidflow (hash detector, duplicate handler, migration 000014). Fuzzy hashing deferred to v0.2.

### 5. Engineering Communication
Documented in decision doc:
- Web: already targeting port 8080 (confirmed in vite.config.ts)
- Android: uses dynamic base URL via interceptor — no code change needed
- iOS: `APIConfig.swift` default updated from port 3100 → 8080 (applied in this run)

### 6. iOS Default Port Fix
`VidFlow/ios/Sources/VidFlow/Networking/APIConfig.swift` — Changed default base URL from `http://localhost:3100` to `http://localhost:8080` to match canonical vidflow backend.

## Success Criteria Met
- [x] `work/backend/` has clear deprecation notice
- [x] Decision document exists naming `work/vidflow/` as canonical
- [x] All teams know which backend to target (documented with per-team actions)
- [x] No new features added to deprecated/duplicate backends

## Files Touched
- `work/backend/README.md` (new — deprecation notice)
- `work/vidflow/docs/backend-consolidation-decision.md` (new — decision document)
- `work/core/README.md` (appended VidFlow context section)
- `VidFlow/ios/Sources/VidFlow/Networking/APIConfig.swift` (fixed default port 3100 → 8080)

## Remaining Follow-up
- `work/core/` repo separation (non-urgent, no dependency for v0.1)
