# BRD: Business Requirements

- **Status:** Draft v1. Owner review pending (see [Open questions](#7-open-questions-all-resolved-2026-10-03)).
- **Owns:** the business problem, outcomes (`BO-*`), stakeholders, business constraints (`BC-*`), and success measures.
- **Does not own:** product capabilities ([PRD](PRD.md)) or detailed requirements ([SRS](SRS.md)).

**Provenance key:**
- **[Owner]** stated by the owner, either in the 2025 owner-written README (`docs/legacy/original-docs/vidshare-2025/worker-era/README.md`) or in this task's instructions.
- **[Legacy]** recurring intent from agent-written legacy docs.
- **[Decision]** decided by Claude under delegation on 2026-10-03.

## 1. Problem

People send each other short-form videos (TikTok, Instagram Reels, YouTube Shorts and similar) through many different chat apps. The videos get buried in conversations. There is no single place to watch what friends sent, react to it, and know what you have already seen. Engagement-optimised platforms also mix friends' recommendations with algorithmic content and harvest data. **[Owner]**

## 2. Value proposition

**VidFriends is a private "For You" page made only of videos your friends sent you.** Paste or share a link (or upload a clip), choose friends, and they watch it in one vertical feed. They can react and reply, and you know when they've watched. It is privacy-focused, has no ads and no algorithmic stranger content, and runs on infrastructure a trusted person controls. **[Owner]**, with self-hosting from **[Legacy]**.

## 3. Business outcomes

| ID | Outcome | Measure (proposed targets, not commitments) |
|---|---|---|
| BO-1 | Friends consolidate shared short videos in one place | In an alpha group, ≥ 70% of videos shared among members go through VidFriends during a 4-week trial (self-reported) |
| BO-2 | Recipients actually watch what friends send | ≥ 80% of shares marked watched within 48 h |
| BO-3 | Senders get closure: they know it was seen and how it landed | ≥ 30% of watched shares receive a reaction or reply |
| BO-4 | The service is cheap and simple to operate for one trusted operator | A fresh install works in ≤ 30 min by following the runbook. Steady-state infra cost for a ≤ 50-user instance is ≤ US$10/month, excluding storage growth. Both are proposed targets. |
| BO-5 | Users' privacy is respected | No third-party analytics or trackers. Only the minimum personal data needed (username, display name, optional profile picture, passkey public keys; no email or password, per NFR-PRIV-03 and ADR-0018). Self-service account deletion and data export. |
| BO-6 | The project stops restarting | One repository, one roadmap, and milestones closed only by passing E2E acceptance tests ([ADR-0001](../adr/0001-record-architecture-decisions.md), [AUDIT L-04](../legacy/AUDIT.md#4-lessons-referenced-by-id-from-the-design-docs)) |

## 4. Stakeholders

| Stakeholder | Interest |
|---|---|
| Owner (project sponsor, GitHub org `VidFriends`) | Product direction. Runs the first instance. Approves material decisions. |
| Instance operator / admin (initially the owner) | Easy deploy, low cost, control over who joins, storage control |
| Members (end users: friends and family, mostly non-technical) | Effortless sharing, a pleasant feed, privacy |
| Engineering agents and contributors | An unambiguous plan and specs (the reason this document set exists) |
| Source platforms (TikTok, YouTube, Meta, …) | Their terms of service constrain downloading (see BC-5) |

## 5. Business constraints

| ID | Constraint | Source |
|---|---|---|
| BC-1 | No advertising. No third-party analytics, tracking or telemetry. | [Owner] 2025 README; [Legacy] 2026 FAQ |
| BC-2 | Low operating cost. It must run on a single small VM or home server. Paid tiers only when usage demands it. | [Owner] "minimal server load", "free tier" |
| BC-3 | Private-circle product. No public discovery, no public profiles, no strangers' content. | [Owner] + [Legacy] invite-only |
| BC-4 | Delivery is mostly by AI engineering agents, so specs must be explicit and verifiable | [Owner] this task; [Legacy] evidence |
| BC-5 | **Downloading third-party platform videos may conflict with those platforms' terms and with copyright.** VidFriends stores copies only for private viewing within an invite-only instance. Copies are never republished and expire per retention policy. The operator is responsible for their instance. | [Decision]; risk **accepted by owner** 2026-10-03 (OQ-1) |
| BC-6 | The app is self-hostable, so no feature may depend on a proprietary SaaS that an operator cannot replace. Mobile push via Apple/Google is the accepted exception. | [Legacy] + [Decision] [ADR-0005](../adr/0005-instance-model.md) |
| BC-7 | App store distribution needs an Apple Developer account (US$99/yr) and a Google Play account (US$25 once) before the mobile milestone | [Decision] [ADR-0004](../adr/0004-mobile-expo.md) |
| BC-8 | Self-host only. The project operates no public or default instance and owns no domain. | [Owner] 2026-10-03, [ADR-0014](../adr/0014-self-host-only-no-public-instance.md) |

## 6. Scope at business level

**In scope (v1):** private instances, friend connections, sending videos to specific friends, a received-video feed, reactions and replies, notifications, an admin console, a web/PWA client, and iOS and Android apps (Expo, after the web MVP).

**Out of scope / non-goals:**
- Public social network features: followers, public profiles, discovery, trending.
- Monetisation in v1.
- Recommendation algorithms.
- Federation between instances.
- Content creation tools beyond simple capture.
- Multi-tenant hosting of many communities on one deployment.

## 7. Open questions (all resolved 2026-10-03)

| ID | Question | Owner answer (2026-10-03) | Former default |
|---|---|---|---|
| OQ-1 | Is downloading and storing copies of third-party platform videos acceptable for the owner-run instance (ToS and copyright exposure)? | **Accepted:** "comfortable with the risk, its for private groups". Link-only mode stays available (FR-VID-09). | Yes, with retention limits |
| OQ-2 | Licence for the new codebase. Legacy licences were AGPL-3.0 (2026 backend), Apache-2.0 (2025) and an unfiled "MIT" claim. | **MIT** (LICENSE added in M1-T1) | AGPL-3.0-only |
| OQ-3 | Product and legal name. Legacy used "VidFriends Inc.", "VidFlow Inc.", and the domains `vidfriends.app` and `vidfriends.ai`. | **Name: VidFriends. No project domain**, because it is self-host only ([ADR-0014](../adr/0014-self-host-only-no-public-instance.md)). | `vidfriends.app` |
| OQ-4 | Will the owner operate a public instance? | **No public server.** Self-host only ([ADR-0014](../adr/0014-self-host-only-no-public-instance.md)). | Private, invite-only |
