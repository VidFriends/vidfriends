# PRD: Product Requirements

- **Status:** Draft v1
- **Owns:** personas, product capabilities (`CAP-*`) and their priority, user journeys (`J-*`), scope and non-goals, and product-level acceptance.
- **Traces from:** [BRD](BRD.md) outcomes `BO-*`.
- **Traces to:** [FRD](FRD.md) workflows `WF-*` and [SRS](SRS.md) requirements `FR-*` / `NFR-*`. Where the PRD and SRS appear to differ, the SRS wording governs.

## 1. Personas

| Persona | Description | Key needs |
|---|---|---|
| **Member** ("Sam") | Non-technical friend or family member, mostly on a phone | Send a video in two taps from the app they're in; watch what friends sent; react quickly; never see strangers' content |
| **Sender** (any member in the sending role) | Wants to know the video landed | Seen status, reactions and replies, the ability to unsend a mistake |
| **Operator / Admin** ("Alex") | Tech-comfortable person who runs the instance for their circle | Simple Docker deploy, invite control, storage limits, suspending a user, backups |
| **Contributor agent** | Implements the system from these specs | Unambiguous, testable requirements |

## 2. Product principles

1. **Friends only.** Users only ever see content that someone they accepted sent to them (BC-3).
2. **One feed, zero clutter.** The default screen is the received feed, ordered unwatched first.
3. **Closure for senders.** Senders see delivered, watched, reaction and reply.
4. **Private by construction.** Engagement belongs to the sender↔recipient share conversation, not to a public video page ([ADR-0010](../adr/0010-share-centric-social-model.md)).
5. **Honest UI.** No fabricated counts, durations or presence ([L-11](../legacy/AUDIT.md#4-lessons-referenced-by-id-from-the-design-docs)).
6. **Accessible and mobile-first.** WCAG 2.2 AA on web, plus platform accessibility APIs on mobile.

## 3. Capabilities and priority

MoSCoW priority applies to v1. "v1" means milestones M1–M6 in the [roadmap](../ROADMAP.md).

| ID | Capability | Priority | BO | SRS group | Milestone |
|---|---|---|---|---|---|
| CAP-01 | Instance onboarding: connect to a server by URL or QR, see server name, health-checked | Must | BO-4 | FR-PAIR | M1 (web implicit), M6 (mobile) |
| CAP-02 | Accounts: register with invite, sign in with a passkey, log out, sessions, profile (display name, avatar), manage passkeys, delete account | Must | BO-5 | FR-AUTH, FR-ACCT | M1 |
| CAP-03 | Friends: search by username, request, accept, decline, cancel, remove, block and unblock | Must | BO-1 | FR-FRND | M2 |
| CAP-04 | Add a video by **link** (server fetches metadata and media) or **upload** a file | Must | BO-1 | FR-VID | M3 |
| CAP-05 | **Send** a video to one or more friends with an optional note | Must | BO-1 | FR-SHR | M4 |
| CAP-06 | **Received feed**: full-screen vertical player, unwatched first, watched tracking, save, inbox and history views | Must | BO-2 | FR-FEED | M4 |
| CAP-07 | **React and reply** in the private share conversation | Must | BO-3 | FR-ENG | M4 |
| CAP-08 | **Sent list** with seen status; **unsend** before it's watched | Must (sent/seen), Should (unsend) | BO-3 | FR-SHR | M4 |
| CAP-09 | Notifications: in-app list and badge (Must), Web Push (Should), mobile push (Must with M6) | Must | BO-2, BO-3 | FR-NOTIF | M4, M6 |
| CAP-10 | Admin console: invites (link and QR), users (suspend, role, quota), storage overview, retention settings, audit log | Must | BO-4 | FR-ADM | M1 (bootstrap and invites), M5 (console) |
| CAP-11 | Mobile apps (iOS and Android via Expo), including **share sheet → VidFriends** | Must | BO-1 | FR-MOB | M6 |
| CAP-12 | Installable PWA, plus Android Web Share Target | Should | BO-1 | FR-PWA | M4 |
| CAP-13 | Duplicate awareness: "Sam already sent you this" (same normalised URL or identical file) | Could | BO-2 | FR-VID-08 | M4 |
| CAP-14 | Collections / playlists of saved videos | Should (post-v1; scheduled by the owner 2026-10-04) | BO-2 | FR-FEED-07 | M7 |
| CAP-15 | Offline downloads on mobile | Should (post-v1; scheduled by the owner 2026-10-04) | BO-2 | FR-MOB-04 | M7 |
| CAP-16 | Passkey-only sign-in (no passwords), passkey management, admin recovery link, mobile sign-in by browser hand-off | Must (scheduled by the owner 2026-10-04) | BO-5 | FR-AUTH-01..04, FR-ACCT-02/03, FR-ADM-03 | M7 |
| CAP-17 | Import from YouTube or other playlists via OAuth | Won't | – | – | Not planned |
| CAP-18 | Self-service data export | Should (post-v1; scheduled by the owner 2026-10-04) | BO-5 | FR-ACCT-05 | M7 |
| CAP-19 | Realtime updates (push-to-open-tab) | Should (post-v1; scheduled by the owner 2026-10-04). Polling stays as the fallback. | BO-2 | FR-NOTIF-06 | M7 |
| CAP-20 | ntfy and Gotify push (de-Googled phones, self-hosted push); UnifiedPush later | Should (post-v1; scheduled by the owner 2026-10-04) | BO-5 | FR-NOTIF-07 | M7 |

## 4. User journeys

**J-1 Operator sets up an instance (CAP-10, CAP-01)**
1. Alex deploys with Docker Compose and the runbook.
2. Alex visits the URL and claims the instance with the one-time bootstrap token printed in the server log. Alex becomes admin.
3. Alex creates invites and shares them as a link or QR code.

**J-2 Friend joins (CAP-01, CAP-02, CAP-03)**
1. Sam opens the invite link, or scans the QR in the mobile app (M6).
2. The app shows the instance name and the inviter.
3. Sam picks a username, creates a passkey with their phone's screen lock, and lands in the app.
4. If the invite carries an inviter, Sam and the inviter become friends automatically. This is consent by both: the inviter by creating the invite, Sam by accepting it.

**J-3 Send a video (CAP-04, CAP-05)**
1. Sam copies a TikTok link. On web, Sam pastes it into "Send". On mobile (M6), Sam taps Share → VidFriends.
2. Sam selects friends, adds an optional note, and taps Send. The send happens immediately.
3. The server fetches the media in the background. Recipients are notified when it is playable, or, if the fetch fails, a link-out card is shown instead.

**J-4 Watch (CAP-06, CAP-07)**
1. Jo gets a notification and opens the feed.
2. Unwatched shares play first in a vertical swipe player, starting muted on web per autoplay policy, with a visible unmute control.
3. After the watch threshold, the share counts as watched.
4. Jo taps a reaction or writes a reply. Sam is notified.

**J-5 Sender closure (CAP-08)**
1. Sam opens "Sent" and sees per recipient: delivered, watched (time), reaction, reply count.
2. Sam can unsend a share that the recipient hasn't watched yet.

**J-6 Revisit (CAP-06)**
1. Jo opens Saved to rewatch favourites.
2. History shows everything watched, searchable by sender and title.

**J-7 Moderate (CAP-03, CAP-10)**
1. Jo blocks a member. They can no longer friend-request or send to Jo, and existing shares from them disappear from Jo's feed.
2. Alex suspends a member, which ends their sessions immediately.

**J-8 Leave (CAP-02)**
1. Sam deletes their account after confirming with their passkey.
2. Sam's uploads, shares and engagement are erased per the deletion rules (FRD WF-ACCT-3).

## 5. Non-goals

- Public profiles, followers, global or "discover" feed. The legacy 2026 "main feed of all server videos" is explicitly dropped ([AUDIT §3](../legacy/AUDIT.md#3-product-intent-across-eras-reconciled-in-the-brdprd)).
- Algorithmic recommendations, trending, view counts.
- Public comments on videos. Engagement lives only in share conversations.
- Group chats or DMs without a video.
- Editing or transcoding tools beyond server-side normalisation to a playable format.
- Multi-community hosting in one deployment, and federation.
- Email delivery infrastructure in v1. Recovery after losing every passkey is admin-assisted.
- Passwords: sign-in is passkey-only ([ADR-0018](../adr/0018-passkey-only-sign-in.md)).

## 6. Product-level acceptance (v1)

v1 is accepted when all of these are demonstrated on a fresh production-like deployment by the automated E2E suites and the runbook checks in the [roadmap](../ROADMAP.md):

1. J-1 through J-8 pass end to end on web, and J-2 through J-5 also pass on iOS and Android builds.
2. No user can access a video, share, reaction, reply, or profile detail they are not authorised for. This is covered by the authorization test matrix (NFR-SEC-01).
3. Every Must requirement in the [SRS](SRS.md) has a passing verification.
4. An accessibility audit shows no WCAG 2.2 AA failures on the web core screens (NFR-A11Y-01).
