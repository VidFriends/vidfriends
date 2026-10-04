# ADR-0019: Realtime updates: server-sent invalidation hints over Postgres LISTEN/NOTIFY

- **Status:** Accepted
- **Date:** 2026-10-04
- **Decided by:** Owner scheduled realtime updates (multiple-choice answer, 2026-10-04: CAP-19
  next). Mechanism: Claude under delegation.
- **Supersedes:** the "polling instead of realtime" part of [ADR-0011](0011-notifications.md).
  The in-app inbox, push channels and the polling fallback stay as decided there.

## Context

- Clients refresh the unread badge, the feed and conversations by polling every 15–60 s
  (FR-NOTIF-05). A reply or a new video can take up to a minute to show in an open tab or app.
- The 2026 backend's WebSocket hub never delivered anything ([backend audit §7.6](../legacy/audits/2026-backend.md)):
  it duplicated state, needed its own auth path and was untested. Self-hosting favours few moving
  parts (BC-2).
- Every notification is already written by one function, `notify()`, inside the transaction of
  the event (ADR-0011). Notifications are created by both processes: the API (shares, replies,
  friends) and the worker (jobs).
- The API and the worker are separate processes and may run as several API containers. They share
  only PostgreSQL.

## Decision

1. **Transport: server-sent events.** `GET /api/v1/events` (member, cookie or bearer) is a
   `text/event-stream`. The web app uses `EventSource` (same origin, cookie); the app uses a
   streaming `fetch` with its bearer token while it is in the foreground. No WebSocket.
2. **Payload: invalidation hints, never content.** An event names what changed, with ids only:
   `notification` (with its type and share id) and `notifications_read`. Clients refetch through
   the normal API, so authorization, response schemas and redaction stay in one place
   (BR-NOT-3 applies to events as it does to push).
3. **Fan-out: Postgres `LISTEN/NOTIFY`.** `notify()` and `markRead()` call
   `pg_notify('vf_events', {user, event})` in the same transaction, so an event is sent only if
   the change commits, and from whichever process made it. Each API process holds one dedicated
   `LISTEN` connection and forwards events to that user's open streams. No new service.
4. **Session checks.** The stream is authenticated like any request. Every 25 s the server
   sends a heartbeat comment and re-checks the session; a revoked or expired session or a
   suspended account ends the stream. Streams also end after 30 minutes and on shutdown; clients
   reconnect.
5. **Limits.** At most 5 open streams per member (more get 429 `rate_limited`). The stream
   counts as one request against the per-user rate limit.
6. **Polling stays as the fallback.** Clients keep their focus refetch and intervals
   (FR-NOTIF-05), so a broken stream or a proxy that buffers it only costs latency.

## Alternatives considered

| Option | Why not |
|---|---|
| WebSocket hub | Bidirectional is not needed; needs its own auth and upgrade handling through the proxy; the legacy hub failed. |
| Event payloads with content | Duplicates every response's authorization and redaction in a second path; stale or leaked content risk. |
| Redis or NATS for fan-out | A new service for ≤ 50 users per instance; Postgres already does it transactionally. |
| Shorter polling intervals | More load for every idle client, still seconds of delay. |

## Consequences

- One long-lived connection per open tab or foreground app, plus one `LISTEN` connection per API
  process. Well within the default PostgreSQL connection limit.
- `pg_notify` payloads are tiny (ids and a type), far below the 8000-byte limit.
- The reverse proxy must not buffer `text/event-stream` (Caddy flushes it); the E2E suite checks
  it through the production proxy.
- Notifications created by the worker reach open clients only through the API process's `LISTEN`
  connection; if it drops, the hub reconnects and clients keep polling meanwhile.

## Revisit when

- Clients need live state that is not tied to a notification (for example presence or typing),
  or an instance outgrows a single PostgreSQL.
