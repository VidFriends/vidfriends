# CTO Review: VID-243 — 3 Missing iOS MVP Endpoints

**Reviewer:** CTO
**Commit:** `46ab830`
**Author:** BackendJunior

## Summary

Approved. All 3 endpoints are implemented correctly, consistently with existing codebase patterns, and properly secured.

## 1. GET /api/users?q=... — `SocialHandler.SearchUsers()` (social.go:469)

- **Pattern match:** Follows existing SocialHandler convention (Invite, Accept, ListFriends, etc.)
- **Query:** `ILIKE '%' || $1 || '%'` — case-insensitive substring search, correct
- **Auth:** Wrapped with `authMW` in router.go:70
- **Edge cases:** 
  - Empty `q` returns 400 ✓
  - No matches returns `[]` (not null) ✓
  - SQL injection safe via parameterized query ✓
- **Limit:** 20 results hard-coded — acceptable for MVP

## 2. PATCH /api/inbox/{id} — `SocialHandler.HandleInboxItem()` (social.go:515)

- **Authorization:** Verifies `recipient_id == claims.UserID` before mutation — correct
- **Accept:** Updates `read_at = now()` — marks as read ✓
- **Reject:** Deletes the received_videos row ✓
- **Auth:** Wrapped with `authMW` in router.go:68
- **Edge cases:**
  - Non-existent inbox item → 404 ✓
  - Not your inbox item → 403 ✓
  - Invalid action string → 400 ✓
- **Note:** Accept doesn't create a permanent "accepted" record; it only sets read_at. That's fine for MVP — the video remains accessible through the inbox query which returns all received items.

## 3. GET /api/feed — `VideoHandler.GetFeed()` (video.go:371)

- **Pagination:** Cursor-based via `page_token` (base64-encoded `created_at` timestamp) + `page_size`
- **Over-fetch:** Requests `pageSize+1` rows to detect next page — correct pattern
- **`next_page_token`:** Omitted when no more pages — correct
- **`FeedResponse` struct:** Contains `videos` array + optional `next_page_token` ✓
- **Auth:** Wrapped with `authMW` in router.go:90
- **Edge cases:**
  - Invalid page_token → silently ignored (falls back to no cursor) — acceptable for MVP
  - page_size clamped to [1, 100] ✓

## Wiring

All 3 routes registered in `router.go` with `authMW`:
- Line 68: `PATCH /api/inbox/{id}`
- Line 70: `GET /api/users`
- Line 90: `GET /api/feed`

## Potential improvements (defer to post-MVP)

1. **SearchUsers** — add pagination for large result sets
2. **HandleInboxItem** — "accept" could implicitly create a friend/video relationship in a join table if needed by future features
3. **GetFeed** — cursor decoding errors currently silently ignored; should return 400 for malformed tokens

## Verdict

Implementation is complete, correct, and ready for merging. Passes CTO review.
