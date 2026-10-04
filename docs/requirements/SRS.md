# SRS: Software Requirements Specification

- **Status:** Draft v1. This is the **canonical requirements list.** Every other document cites these IDs and does not restate them.
- **Owns:** uniquely identified, verifiable functional (`FR-*`) and non-functional (`NFR-*`) requirements, external interfaces, and the traceability matrix.
- **Behaviour details:** [FRD](FRD.md) (`WF-*`, `BR-*`). **Capabilities:** [PRD](PRD.md) (`CAP-*`). **Business outcomes:** [BRD](BRD.md) (`BO-*`).

## Conventions

- **Priority:** M = Must (v1), S = Should, C = Could.
- **Milestone:** delivery milestone in the [roadmap](../ROADMAP.md).
- **Verification:**
  - **E2E**: Playwright web flow (and, in M6, Maestro mobile flow) against the production-like compose stack.
  - **API**: HTTP integration test against a real PostgreSQL database and S3-compatible storage.
  - **Unit**: unit test.
  - **Runbook**: an operator procedure executed and recorded.
  - **Audit**: a review or tool check (axe, threat checklist).
- **Verification status:** none of these tests exist yet. The repository holds documentation only (2026-10-03). Every "Verification" entry below is *planned*. When a test lands, record its path in the roadmap's milestone checklist.
- **Requirement status** is tracked in the [roadmap](../ROADMAP.md), not here.

## 1. Functional requirements

### 1.1 Instance and pairing (FR-PAIR)

| ID | Requirement | Pri | Source | Design | MS | Verification |
|---|---|---|---|---|---|---|
| FR-PAIR-01 | `GET /api/v1/instance` returns, without authentication, the instance name, signup mode, server version, API major version, and whether setup is complete. | M | CAP-01, WF-PAIR-1 | LLD §3 | M1 | API |
| FR-PAIR-02 | The web client is served by the instance at `/`, and calls the API on the same origin. | M | WF-PAIR-4 | HLD §3 | M1 | E2E |
| FR-PAIR-03 | The mobile app connects to an instance via QR scan or a pasted join or instance URL (no default instance, ADR-0014). It accepts only `https://` URLs (ADR-0018; the device's loopback address excepted, WF-PAIR-3), validates the instance with FR-PAIR-01 before saving it, and reapplies the saved URL on every launch. | M | WF-PAIR-1..3, L-16 | ADR-0013, ADR-0018 | M6; https-only M7 | Unit, E2E (mobile) |
| FR-PAIR-04 | Join URLs `https://<host>/join/<code>` open the web registration screen with the code prefilled. The mobile app accepts the same URL via in-app scan or paste. There are no Universal or App Links (ADR-0014). | M | BR-INV-4 | ADR-0013, ADR-0014 | M1 (web), M6 (in-app) | E2E |

### 1.2 Authentication and accounts (FR-AUTH, FR-ACCT)

| ID | Requirement | Pri | Source | Design | MS | Verification |
|---|---|---|---|---|---|---|
| FR-AUTH-01 | When no admin exists, the server generates and logs a one-time setup token, and `/setup` lets its holder create the first admin, with a passkey, and name the instance. | M | WF-AUTH-1 | ADR-0018, LLD §5 | M1; passkey M7 | API, E2E |
| FR-AUTH-02 | Registration requires a valid invite in `invite_only` mode, consumes invites atomically, applies `auto_friend`, and creates the account with a passkey. | M | WF-AUTH-2, BR-INV-1..2 | ADR-0018, LLD §2 | M1; passkey M7 | API (incl. concurrent-consume test), E2E |
| FR-AUTH-03 | Accounts authenticate only with passkeys (WebAuthn discoverable credentials, user verification required; relying party = the `PUBLIC_URL` host). There are no passwords. Usernames follow BR-ACCT-1. A member can hold several named passkeys and cannot remove the last one. | M | BR-ACCT-1, BR-ACCT-2 | ADR-0018 | M7 | Unit, API, E2E |
| FR-AUTH-04 | Signing in with a passkey creates a server-side session: an httpOnly cookie for web, a bearer token for mobile (obtained through the browser hand-off of ADR-0018 with a single-use, PKCE-bound code). Logout revokes the session. "Log out everywhere" revokes all of the user's sessions. | M | WF-AUTH-3 | ADR-0008, ADR-0018 | M1; passkey M7 | API, E2E |
| FR-AUTH-05 | Sessions follow the lifetimes in BR-SES-1, are revoked per BR-SES-2, and each request re-validates the session and account status (BR-SES-3). | M | BR-SES-1..3 | ADR-0008 | M1 | API |
| FR-AUTH-06 | Suspended accounts cannot authenticate, and any existing session is rejected on its next request. | M | BR-ADM-2 | ADR-0008 | M1 (enforcement), M5 (UI) | API |
| FR-ACCT-01 | Members can edit their display name and avatar (BR-ACCT-3). | M | WF-ACCT-1 | LLD §3 | M2 | API, E2E |
| FR-ACCT-02 | Members can add, rename and remove passkeys. Removing one needs a fresh passkey confirmation, revokes the sessions it created, and is refused for the last passkey. | M | WF-ACCT-2 | ADR-0018, LLD §3 | M7 | API, E2E |
| FR-ACCT-03 | Members can delete their account after a fresh passkey confirmation, with the effects of WF-ACCT-3, including media garbage-collection eligibility. | M | WF-ACCT-3 | LLD §2 | M5; passkey confirmation M7 | API, E2E |
| FR-ACCT-04 | Members can list their active sessions and revoke one. | S | BR-SES-2 | LLD §3 | M5 | API |
| FR-ACCT-05 | Members can request an export of their own data as a ZIP (WF-ACCT-4): profile, friends, requests and blocks, shares sent and received with notes, reactions and conversations, videos they added, their security log and avatar, and optionally the media files of videos they added. The archive is downloadable for 7 days. | S | WF-ACCT-4, BO-5, CAP-18 | LLD §2–3 | M7 | API, E2E |

### 1.3 Invites (FR-INV)

| ID | Requirement | Pri | Source | Design | MS | Verification |
|---|---|---|---|---|---|---|
| FR-INV-01 | Admins, and members when `members_can_invite` is on, can create invites with `max_uses`, expiry and `auto_friend`. The plaintext code is returned once, and stored hashed. | M | BR-INV-1,3,5 | LLD §2 | M1 | API |
| FR-INV-02 | Invite creators and admins can list and revoke invites. | M | BR-INV-3 | LLD §3 | M1 | API |
| FR-INV-03 | The UI shows the join URL and a QR code for each new invite. | M | BR-INV-4 | ADR-0013 | M1 | E2E |

### 1.4 Friends (FR-FRND)

| ID | Requirement | Pri | Source | Design | MS | Verification |
|---|---|---|---|---|---|---|
| FR-FRND-01 | User search behaves as in BR-FRND-8. | M | BR-FRND-8 | LLD §3 | M2 | API |
| FR-FRND-02 | Request, accept, decline, cancel and remove follow the state machine in FRD §4, including auto-accept of mutual requests and the decline cooldown. | M | BR-FRND-1..4 | LLD §2 | M2 | API (state-transition table test), E2E |
| FR-FRND-03 | Block and unblock follow BR-FRND-5..6, including deleting shares between the pair and excluding the blocked user from search. | M | BR-FRND-5..6 | LLD §2 | M2 | API |
| FR-FRND-04 | Friend-request rate limit: 30 per 24 h per user. | M | BR-FRND-7 | TDD §3 | M2 | API |
| FR-FRND-05 | Members can see lists of friends, incoming requests, outgoing requests and blocked users. | M | CAP-03 | LLD §3 | M2 | API, E2E |
| FR-FRND-06 | Members can keep named groups of friends and pick a group when sending, to send one video to all its members at once (each still gets their own share). | S | BR-GRP-1..3 | ADR-0010 | M7 | API, E2E |

### 1.5 Videos and media (FR-VID)

| ID | Requirement | Pri | Source | Design | MS | Verification |
|---|---|---|---|---|---|---|
| FR-VID-01 | Adding a link validates it against BR-MED-1, including the SSRF rules, before any network fetch. | M | BR-MED-1, L-09 | LLD §4 | M3 | Unit (URL table), API |
| FR-VID-02 | Link fetches run as durable background jobs with the limits and retries of BR-MED-2..3, ending in `ready`, `link_only` or `failed`. | M | WF-VID-1, BR-MED-2..3 | ADR-0009, LLD §4 | M3 | API (fake-extractor fixture), plus one opt-in live smoke test |
| FR-VID-03 | Uploads are checked for size and quota before bytes are accepted, content-sniffed, hashed, and processed asynchronously. | M | WF-VID-2 | LLD §4 | M3 | API |
| FR-VID-04 | Processing extracts duration and dimensions, stores a thumbnail, and remuxes or transcodes to H.264/AAC MP4 with faststart only when the source is not already browser-playable. | M | BR-MED-8 | TDD §2 | M3 | API (fixture media) |
| FR-VID-05 | Media and thumbnails are served only via short-lived signed URLs issued after the BR-SHR-6 check, and support HTTP Range requests. | M | BR-MED-7 | ADR-0009 | M3 | API (Range test), E2E seek |
| FR-VID-06 | Retention purge follows BR-MED-5. It runs daily and can be triggered by an admin. | M | BR-MED-5 | LLD §4 | M5 | API (time-travel test) |
| FR-VID-07 | Per-user quota and instance storage cap are enforced (BR-MED-2, BR-MED-6). | M | BR-MED-2,6 | LLD §4 | M3 | API |
| FR-VID-08 | Exact dedup by normalised URL or SHA-256 reuses media only (BR-MED-4), and the feed shows "also sent by" (BR-FEED-7). | C | BR-MED-4, CAP-13 | LLD §4 | M4 | API |
| FR-VID-09 | When `link_download_enabled = false`, links become `link_only` and no media is downloaded. | M | BR-MED-9, BRD OQ-1 | ADR-0009 | M3 | API |
| FR-VID-10 | With `MEDIA_DEDUP=perceptual`, a newly processed Video that shows the same clip as an earlier ready one reuses its stored file without merging anything else, is not charged for it, and the file is kept while any Video uses it (BR-MED-4..6). | S | BR-MED-4, ADR-0022 | LLD §2, §4 | M7 | Unit (hash maths), API (fixture media) |

### 1.6 Sharing (FR-SHR)

| ID | Requirement | Pri | Source | Design | MS | Verification |
|---|---|---|---|---|---|---|
| FR-SHR-01 | Send creates one share per allowed recipient, atomically and idempotently, with per-recipient results (WF-SHR-1). | M | WF-SHR-1 | LLD §2–3 | M4 | API |
| FR-SHR-02 | Sending is allowed only to accepted, non-blocked friends, and only for Videos the sender added or received. | M | WF-SHR-1 | LLD §2 | M4 | API (authorization matrix) |
| FR-SHR-03 | Shares to a not-yet-playable Video are delivered and notified when the Video becomes `ready` or `link_only`. | M | WF-SHR-1 | LLD §4 | M4 | API |
| FR-SHR-04 | Senders can unsend while the share is unwatched (WF-SHR-2). | S | WF-SHR-2 | LLD §3 | M4 | API |
| FR-SHR-05 | The Sent view shows per-recipient state (BR-SHR-4, BR-FEED-5). | M | BR-SHR-4 | LLD §3 | M4 | E2E |

### 1.7 Feed and viewing (FR-FEED)

| ID | Requirement | Pri | Source | Design | MS | Verification |
|---|---|---|---|---|---|---|
| FR-FEED-01 | The feed's content and ordering follow BR-FEED-1, with keyset pagination (BR-FEED-6). | M | BR-FEED-1,6 | LLD §3 | M4 | API |
| FR-FEED-02 | The Inbox, Saved and History views follow BR-FEED-2..4. | M | BR-FEED-2..4 | LLD §3 | M4 | API, E2E |
| FR-FEED-03 | The watched threshold and progress reporting follow BR-SHR-3. | M | BR-SHR-3 | LLD §3 | M4 | E2E (clock-controlled) |
| FR-FEED-04 | Recipients can save, unsave, hide and unhide a share. | M | BR-SHR-2 | LLD §3 | M4 | API |
| FR-FEED-05 | The vertical player follows the FRD §7 playback UX rules: active-only playback, preload of the next item, muted autoplay with unmute, and reduced-motion handling. | M | FRD §7 | TDD §4 | M4 | E2E, Audit |
| FR-FEED-06 | Link-only and expired Videos render as a card with title, thumbnail (if any) and "Open original". | M | BR-MED-3,5 | TDD §4 | M4 | E2E |
| FR-FEED-07 | Members can keep named collections of videos they received, add a share to one or more collections from its page (which also saves it), and view, rename and delete their collections. | S | BR-COL-1..3 | LLD §2, §3 | M7 | API, E2E |

### 1.8 Engagement (FR-ENG)

| ID | Requirement | Pri | Source | Design | MS | Verification |
|---|---|---|---|---|---|---|
| FR-ENG-01 | The recipient can set, replace and clear one reaction from the fixed set. | M | BR-ENG-2 | LLD §3 | M4 | API, E2E |
| FR-ENG-02 | Both participants can post and delete replies under BR-ENG-3..4. Only the participants can read the conversation. | M | BR-ENG-1,3,4 | LLD §3 | M4 | API (authorization matrix), E2E |

### 1.9 Notifications (FR-NOTIF)

| ID | Requirement | Pri | Source | Design | MS | Verification |
|---|---|---|---|---|---|---|
| FR-NOTIF-01 | In-app notifications for the BR-NOT-1 types, with an unread count, a mark-read action, and the retention in BR-NOT-5. | M | BR-NOT-1,2,5 | ADR-0011 | M4 | API, E2E |
| FR-NOTIF-02 | Web Push (VAPID) subscription and delivery, honouring the per-type preferences, the privacy rules of BR-NOT-3, the coalescing of BR-NOT-4, and the cleanup of BR-NOT-6. | S | BR-NOT-2..4,6 | ADR-0011 | M4 | API (push-service mock), Runbook (real browser) |
| FR-NOTIF-03 | Mobile push via Expo Push, using the same rules. | M | BR-NOT-* | ADR-0011 | M6 | Runbook (device) |
| FR-NOTIF-04 | Per-type, per-channel notification preferences. | M | BR-NOT-2 | LLD §3 | M4 | API |
| FR-NOTIF-07 | Members can add ntfy and Gotify push targets (URL, token, private previews), list, test and remove them. Deliveries follow BR-NOT-2..4 and BR-NOT-8; tokens are encrypted at rest and never returned; sends reach only public addresses over https unless the operator lists the host in `PUSH_PRIVATE_HOSTS`. | S | BR-NOT-8 | ADR-0020 | M7 | API, E2E |
| FR-NOTIF-05 | Clients refresh unread counts and the feed by polling (focus refetch plus an interval of at most 60 s). Polling remains the fallback when the realtime stream (FR-NOTIF-06) is unavailable. | M | CAP-19 | ADR-0011 | M4 | E2E |
| FR-NOTIF-06 | Open web tabs and the foreground app receive realtime invalidation events (`GET /events`, server-sent events) and refresh the affected data within 5 s† of a notification being created or read on another device. Events carry types and ids only (BR-NOT-7); a revoked session or suspended account ends the stream within 30 s. | S | CAP-19, BR-NOT-7 | ADR-0019 | M7 | API, E2E |

### 1.10 Administration (FR-ADM)

| ID | Requirement | Pri | Source | Design | MS | Verification |
|---|---|---|---|---|---|---|
| FR-ADM-01 | User management per WF-ADM-1, including last-admin protection. | M | WF-ADM-1 | LLD §3 | M5 | API, E2E |
| FR-ADM-02 | Instance settings per WF-ADM-3, validated and audited. | M | WF-ADM-3 | LLD §2 | M5 (UI); M3 (media settings via config/API) | API |
| FR-ADM-03 | Recovery links per WF-ADM-4: an admin creates a single-use 24 h link that lets a member register a new passkey, which removes their other passkeys and sessions. The operator can print one for any member, including an admin, with the server's `recovery-link` command. | M | WF-ADM-4 | ADR-0018, LLD §5 | M5; passkeys M7 | API, E2E |
| FR-ADM-04 | Storage overview and manual retention run per WF-ADM-5. | M | WF-ADM-5 | LLD §3 | M5 | API |
| FR-ADM-05 | Audit log per WF-ADM-6. Admin APIs never expose conversation content or notes (BR-ADM-1). | M | WF-ADM-6, BR-ADM-1 | LLD §2 | M1 (writes), M5 (UI) | API |

### 1.11 Client platforms (FR-PWA, FR-MOB)

| ID | Requirement | Pri | Source | Design | MS | Verification |
|---|---|---|---|---|---|---|
| FR-PWA-01 | The web app is installable: it has a manifest with real icons, and its service worker uses the app shell as the navigation fallback (never an offline page for online deep links). | S | CAP-12 | TDD §4 | M4 | E2E, Audit (Lighthouse installability) |
| FR-PWA-02 | Android Web Share Target: sharing a URL to the installed PWA opens Send with the URL prefilled. | S | CAP-12 | TDD §4 | M4 | Runbook (Android device) |
| FR-MOB-01 | iOS and Android apps (Expo) implement pairing, auth, feed, inbox, saved, history, sent, send, friends, reactions and replies, and notifications, using the same API. | M | CAP-11 | ADR-0004 | M6 | E2E (Maestro) |
| FR-MOB-02 | An OS share sheet extension or intent receives a URL (and, on Android, a video file) and opens Send. | M | CAP-11 | ADR-0004 | M6 | Runbook (device), E2E where automatable |
| FR-MOB-03 | Session tokens are stored only in the iOS Keychain or Android Keystore-backed storage (expo-secure-store). | M | L-13 | ADR-0008 | M6 | Audit |
| FR-MOB-04 | The app can download a share's ready video for offline playback, lists downloads with their size against a member-chosen cap, plays them without a connection, and removes them under BR-OFF-3/4. | S | BR-OFF-1..4 | – | M7 | Unit, E2E (mobile) |

## 2. Non-functional requirements

Numbers marked † are **proposed targets** chosen under delegation for a small (≤ 50 users per instance) deployment. They are not contractual. Revisit them after the M5 alpha measurements.

### Security and privacy (NFR-SEC, NFR-PRIV)

| ID | Requirement | Pri | MS | Verification |
|---|---|---|---|---|
| NFR-SEC-01 | **Object-level authorization:** every endpoint that takes a resource id enforces the visibility rules (BR-GEN-3, BR-SHR-6, BR-ENG-1). An automated authorization-matrix test exercises every route against owner, other-participant, friend-not-participant, stranger, blocked user, suspended user and anonymous callers. | M | M1 (harness), each MS | API |
| NFR-SEC-02 | No passwords are stored (ADR-0018). Passkey public keys and counters are stored per credential; WebAuthn challenges are single-use and expire within 5 minutes. Session tokens, invite codes, recovery tokens and mobile hand-off codes are stored only as SHA-256 hashes. In production the server requires an `https://` `PUBLIC_URL` with a domain name (`localhost` excepted). | M | M1; passkeys M7 | Unit, API, Audit |
| NFR-SEC-03 | The server refuses to start in production mode if any required secret is missing, matches a known default, or is too short ([L-06](../legacy/AUDIT.md#4-lessons-referenced-by-id-from-the-design-docs)). | M | M1 | Unit |
| NFR-SEC-04 | Web: session cookie is `HttpOnly; Secure; SameSite=Lax`. CSRF protection uses Origin checks plus a double-submit token on unsafe methods. Strict CSP (no inline script). Standard security headers. | M | M1 | API, Audit |
| NFR-SEC-05 | Outbound fetches (yt-dlp, metadata, web push) go only to allowlisted or public addresses. Private and reserved IP ranges are blocked after DNS resolution, user input is never passed as CLI options (`--` separator), and processes run with a timeout and an output size cap. | M | M3 | Unit, API |
| NFR-SEC-06 | Rate limits: auth endpoints ≤ 10/min per IP and per username; general authenticated traffic ≤ 300/min per user†. The client IP comes from trusted-proxy configuration only ([L-20](../legacy/AUDIT.md#4-lessons-referenced-by-id-from-the-design-docs)). | M | M1 | API |
| NFR-SEC-07 | Dependency and container scanning in CI. Builds fail on critical vulnerabilities that have a fix available. | M | M1 | CI |
| NFR-SEC-08 | Uploaded media and avatars are content-sniffed and re-encoded or remuxed before they are served. User-supplied filenames are never used in storage keys. | M | M3 | API |
| NFR-PRIV-01 | No third-party analytics, trackers, fonts or CDNs in clients. All assets are self-served. | M | M1 | Audit |
| NFR-PRIV-02 | Logs never contain passwords, tokens, invite codes, push endpoints, notes or replies. Usernames are logged only as user ids. | M | M1 | Unit (log redaction test), Audit |
| NFR-PRIV-03 | Personal data collected is limited to username, display name, avatar, passkey public keys with their names, and activity data needed for features. No email, phone number or password in v1. | M | M1 | Audit |

### Reliability and data (NFR-REL, NFR-DATA)

| ID | Requirement | Pri | MS | Verification |
|---|---|---|---|---|
| NFR-REL-01 | Background jobs are durable (PostgreSQL-backed). They survive restarts, retry with backoff, and are idempotent, so running a job twice has no extra effect ([L-05](../legacy/AUDIT.md#4-lessons-referenced-by-id-from-the-design-docs)). | M | M3 | API (kill-and-restart test) |
| NFR-REL-02 | Graceful shutdown: the server stops accepting work, finishes in-flight requests (≤ 15 s), and releases job leases. | M | M1 | API |
| NFR-REL-03 | Database migrations are forward-only, versioned, never edited after merge, and applied by an explicit migrate step before the server starts ([L-14](../legacy/AUDIT.md#4-lessons-referenced-by-id-from-the-design-docs)). | M | M1 | CI check |
| NFR-REL-04 | Backup and restore of the database **and** object storage is documented and tested. Proposed targets: RPO ≤ 24 h†, RTO ≤ 2 h†. | M | M5 | Runbook (restore drill) |
| NFR-REL-05 | Orphaned objects (stored without a database row) are found and removed by a weekly sweeper. | M | M5 | API |
| NFR-DATA-01 | Account deletion removes personal data per WF-ACCT-3 within 24 h, including object storage. | M | M5 | API |

### Performance and capacity (NFR-PERF)

| ID | Requirement | Pri | MS | Verification |
|---|---|---|---|---|
| NFR-PERF-01 | API p95 latency ≤ 300 ms† for non-media endpoints at 50 concurrent users on a 2 vCPU / 4 GB host. | S | M5 | Load test (k6) |
| NFR-PERF-02 | Feed time-to-first-frame ≤ 2 s† on a 4G-class connection for ready media (preload next item). | S | M4 | E2E (throttled), Audit |
| NFR-PERF-03 | Worker concurrency is bounded (default 2 fetch and 1 transcode jobs†), so the API stays responsive while jobs run. | M | M3 | Load test |
| NFR-PERF-04 | The web initial JS bundle is ≤ 250 kB gzip† for the authenticated shell. | S | M4 | CI (size check) |

### Operability (NFR-OPS)

| ID | Requirement | Pri | MS | Verification |
|---|---|---|---|---|
| NFR-OPS-01 | One-command production deploy with Docker Compose: reverse proxy with automatic TLS, server, worker, PostgreSQL, S3-compatible storage. Ports are bound to localhost except the proxy. | M | M5 | Runbook (fresh VM) |
| NFR-OPS-02 | Configuration via environment variables, validated at startup with clear errors. All settings are documented in one generated reference. | M | M1 | Unit |
| NFR-OPS-03 | Structured JSON logs with request id. `/healthz` (liveness) and `/readyz` (database, storage and queue reachable). Prometheus `/metrics` on an internal port. | M | M1 (logs, health), M5 (metrics) | API |
| NFR-OPS-04 | Versioned releases: container images published to GHCR on tags, with SBOMs. Upgrade and rollback procedure documented. | M | M5 | Runbook |
| NFR-OPS-05 | yt-dlp updates independently of the server release, because the worker image pins yt-dlp and a scheduled CI job opens version-bump PRs. | M | M3 | CI |

### Accessibility, usability, compatibility (NFR-A11Y, NFR-COMPAT)

| ID | Requirement | Pri | MS | Verification |
|---|---|---|---|---|
| NFR-A11Y-01 | The web app meets WCAG 2.2 AA on core screens. All controls are keyboard-operable, dialogs trap focus, status changes are announced, and video controls have accessible names. | M | M4 | Audit (axe in E2E plus manual screen-reader pass) |
| NFR-A11Y-02 | The mobile apps support VoiceOver and TalkBack labels, Dynamic Type / font scaling, and reduced motion. | M | M6 | Audit |
| NFR-COMPAT-01 | Web supports the latest two versions of Chrome, Edge, Firefox and Safari (macOS and iOS). | M | M4 | E2E (Playwright projects) |
| NFR-COMPAT-02 | Mobile supports iOS 17+ and Android 10+ (API 29)†. | M | M6 | Audit |
| NFR-I18N-01 | All UI strings are externalised from day one. The web app and the mobile app are available in English and Spanish (M7); the language follows the browser or phone, and a member can pick one in Settings (stored on that device). A test keeps every catalog complete, with the same placeholders. The signed-in client records the language in use on the member's account (`users.language`), and the server writes push titles (Web Push, Expo, ntfy, Gotify) in it. Dates and relative times use locale-aware formatting. | M | M1; Spanish M7 | Audit, Unit |

### Maintainability (NFR-MAINT)

| ID | Requirement | Pri | MS | Verification |
|---|---|---|---|---|
| NFR-MAINT-01 | Single contract source: Zod schemas in `packages/contracts` generate the OpenAPI document. Clients use typed bindings from the same package, and CI fails if the committed OpenAPI differs from the generated one ([ADR-0006](../adr/0006-api-contract-first.md)). | M | M1 | CI |
| NFR-MAINT-02 | CI on every PR: typecheck, lint, unit, API integration, web E2E, build of all apps and images. `main` is protected and requires green CI ([L-03](../legacy/AUDIT.md#4-lessons-referenced-by-id-from-the-design-docs)). | M | M1 | CI |
| NFR-MAINT-03 | A milestone is complete only when its E2E acceptance specs pass in CI ([L-04](../legacy/AUDIT.md#4-lessons-referenced-by-id-from-the-design-docs)). | M | all | Roadmap review |

## 3. External interfaces

| Interface | Direction | Spec |
|---|---|---|
| HTTP JSON API `/api/v1` | Clients → server | [LLD §3](../design/LLD.md#3-http-api-contract), plus the generated OpenAPI from M1 |
| Web Push (VAPID, RFC 8030/8292) | Server → browser push services | [ADR-0011](../adr/0011-notifications.md) |
| Expo Push API | Server → Expo → APNs/FCM | [ADR-0011](../adr/0011-notifications.md) (M6) |
| yt-dlp CLI, ffmpeg/ffprobe | Worker → local processes → source platforms | [LLD §4](../design/LLD.md#4-media-pipeline) |
| S3 API (SeaweedFS bundled per ADR-0015; Cloudflare R2, AWS S3, Backblaze B2, …) | Server/worker → object storage | [ADR-0009](../adr/0009-media-ingestion-and-storage.md) |
| PostgreSQL 16+ | Server/worker → database | [LLD §2](../design/LLD.md#2-data-model) |

## 4. Traceability summary

The tables above are the trace matrix: each row links a requirement to its PRD capability or FRD rule, its design section, its milestone and its verification. BRD outcomes map to capabilities in [PRD §3](PRD.md#3-capabilities-and-priority). Coverage check at the time of writing (2026-10-03):

| Milestone | Must requirements delivered |
|---|---|
| M1 | FR-PAIR-01,02,04(web); FR-AUTH-01..06; FR-ACCT-02; FR-INV-01..03; FR-ADM-05 (writes); NFR-SEC-01 (harness),02,03,04,06,07; NFR-PRIV-*; NFR-REL-02,03; NFR-OPS-02,03(logs/health); NFR-I18N-01; NFR-MAINT-01,02 |
| M2 | FR-ACCT-01; FR-FRND-01..05 |
| M3 | FR-VID-01..05,07,09; NFR-SEC-05,08; NFR-REL-01; NFR-PERF-03; NFR-OPS-05 |
| M4 | FR-SHR-01..03,05; FR-FEED-01..06; FR-ENG-01..02; FR-NOTIF-01,04,05; NFR-A11Y-01; NFR-COMPAT-01 |
| M5 | FR-ACCT-03; FR-VID-06; FR-ADM-01..05 (UI); NFR-REL-04,05; NFR-DATA-01; NFR-OPS-01,03(metrics),04 |
| M6 | FR-PAIR-03,04(in-app); FR-NOTIF-03; FR-MOB-01..03; NFR-A11Y-02; NFR-COMPAT-02 |
| M7 | Passkey-only sign-in (ADR-0018): FR-AUTH-01..04, FR-ACCT-02,03, FR-ADM-03, FR-PAIR-03 (https-only), NFR-SEC-02 change their mechanism; FR-ACCT-05 (S) data export; FR-NOTIF-06 (S) realtime updates (ADR-0019); FR-NOTIF-07 (S) ntfy and Gotify push (ADR-0020); FR-MOB-04 (S) offline downloads; NFR-I18N-01 Spanish; FR-FRND-06 (S) groups of friends; FR-FEED-07 (S) collections; FR-VID-10 (S) perceptual dedup |

Every Must requirement appears in exactly one delivery milestone (or is split explicitly by layer); the M7 row lists requirements whose mechanism M7 replaced. NFR-MAINT-03 applies to every milestone.
