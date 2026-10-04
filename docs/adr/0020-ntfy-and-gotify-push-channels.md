# ADR-0020: ntfy and Gotify push channels; UnifiedPush deferred

- **Status:** Accepted
- **Date:** 2026-10-04
- **Decided by:** Owner scheduled more push channels (multiple-choice answer, 2026-10-04).
  Mechanism: Claude under delegation.
- **Supersedes:** item 4 of [ADR-0011](0011-notifications.md) ("ntfy, Gotify and UnifiedPush are
  deferred") for ntfy and Gotify. The rest of ADR-0011 stands.

## Context

- Members get pushes through Web Push (browsers) and Expo Push (the app, relayed by Expo). Some
  self-hosting members avoid Google and Apple push entirely, or use a de-Googled phone. They
  already run, or subscribe to, an ntfy or Gotify server.
- ntfy and Gotify deliver a push with one authenticated HTTP request to a URL the member chooses.
  That URL is user input. Calling it from the server must not let a member reach internal services
  (NFR-SEC-05), and any access token is a credential.
- UnifiedPush delivers to an app through a distributor app on the phone. Using it needs a native
  UnifiedPush connector library in the app, and the app is an Expo build (ADR-0017). Members on
  such phones can already subscribe to ntfy with the ntfy app.

## Decision

1. **Two new push target kinds**, `ntfy` and `gotify`, configured by the member in Settings (web)
   with a URL, an optional (ntfy) or required (Gotify) token, and the private-previews option:
   - **ntfy:** `POST <topic URL>` with headers `Title`, `Click` (the instance link for the
     notification) and `Tags`; `Authorization: Bearer <token>` when set.
   - **Gotify:** `POST <server>/message` with `X-Gotify-Key: <app token>` and
     `{title, message, priority, extras.client::notification.click.url}`.
   Payloads follow BR-NOT-3: a generic title (no sender with private previews) and a link to the
   instance, never notes or reply text.
2. **Tokens are encrypted at rest** with AES-256-GCM under a key derived from `APP_SECRET`, as for
   the VAPID key, and never returned by the API or logged.
3. **Egress guard.** Every send resolves the host and connects only to public addresses, pinning
   the checked address for the connection (no DNS rebinding); `https://` is required. An operator
   who runs ntfy or Gotify on the home network lists those host names in `PUSH_PRIVATE_HOSTS`;
   only they may resolve to private addresses and use plain `http://`.
4. **Gone targets** (BR-NOT-6): ntfy or Gotify answering 401, 403 or 404 (revoked token, removed
   topic or application) deletes the target, as Web Push does for 404/410.
5. **Members see and test their targets:** `GET /push-targets` lists them with a label (the host
   and topic, never the token) and the last success time; `POST /push-targets/{id}/test` sends a
   test push and reports the result (5 per 10 minutes).
6. **UnifiedPush is deferred** until an Expo-compatible connector exists or the app gains a native
   module; members can use the ntfy app with an ntfy target meanwhile.

## Alternatives considered

| Option | Why not |
|---|---|
| Operator-wide ntfy/Gotify only | Members would share one topic or server; per-member targets match how Web Push and Expo targets work. |
| Allow any address, http included | A member could make the server call internal services (SSRF). |
| Plain `fetch` after a DNS check | A second resolution can return a different address (rebinding). |
| UnifiedPush now | Needs native code in the Expo app and per-distributor testing. |

## Consequences

- New column `push_targets.secret` (encrypted) and kind values; the endpoint is unique per
  member for ntfy and Gotify (two members may use the same topic), and globally for Web Push and
  Expo as before.
- A public ntfy topic is readable by anyone who guesses it; the settings screen recommends a
  token or private previews.

## Revisit when

- An Expo-compatible UnifiedPush connector is available, or members ask for Matrix or e-mail
  delivery.
