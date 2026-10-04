# ADR-0011: Notifications: database-first in-app inbox, Web Push (VAPID), Expo Push; polling instead of realtime

- **Status:** Accepted; "polling instead of realtime" superseded by [ADR-0019](0019-realtime-invalidation-over-sse.md) (polling stays as the fallback); item 4 superseded for ntfy and Gotify by [ADR-0020](0020-ntfy-and-gotify-push-channels.md)
- **Date:** 2026-10-03
- **Decided by:** Claude under delegation

## Context

- 2025 Worker: payload-less Web Push plus a pull-based notification inbox. This worked, but its VAPID key was committed to git.
- 2026 backend: four push providers (ntfy, Gotify, FCM, APNs) plus a WebSocket hub. **None of them ever delivered anything** ([backend audit §7.6](../legacy/audits/2026-backend.md)).
- Self-hosting means fewer moving parts is better.

## Decision

1. Every event writes a row to `notifications`. That table is the source of truth for the in-app list and the unread badge.
2. A `notify.dispatch` job fans each notification out to the user's push targets, according to their preferences (BR-NOT-2..4).
   - **Web Push** (`web-push` library, VAPID). The key pair is generated per instance at first start and stored in the database (private key encrypted with `APP_SECRET`), or supplied by env. Payloads are minimal (BR-NOT-3).
   - **Expo Push** (M6) for iOS and Android, via `expo-server-sdk`. This is the accepted SaaS exception (BC-6). Operators who refuse it can disable mobile push. The in-app list still works.
3. **No WebSocket or SSE in v1.** Clients poll unread counts (refetch on focus plus an interval of at most 60 s) and rely on push for timeliness (FR-NOTIF-05).
4. ntfy, Gotify and UnifiedPush are deferred. The dispatcher has a `PushChannel` interface, so they can be added later without schema churn (add a `push_targets.kind` value).

## Alternatives considered

- **Own APNs and FCM credentials per instance.** Each operator would need an Apple and Google developer setup. Impractical for self-hosters. Expo relays through the publisher's credentials.
- **WebSocket realtime from day one.** Adds stateful connections, proxy configuration, and scaling concerns for little user value at this scale. The legacy implementation was dead on arrival.

## Consequences

- The mobile app build is tied to an Expo project. Self-built forks need their own Expo or EAS setup to receive push.
- Push delivery depends on the third-party push services, so the in-app list remains authoritative.
