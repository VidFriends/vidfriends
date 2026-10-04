# ADR-0010: Share-centric social model: per-recipient shares, private conversations, no global feed

- **Status:** Accepted
- **Date:** 2026-10-03
- **Decided by:** Claude under delegation, reconciling legacy variants

## Context

The legacy social models conflict ([AUDIT §3](../legacy/AUDIT.md#3-product-intent-across-eras-reconciled-in-the-brdprd)):

| Variant | Model |
|---|---|
| 2025 Worker (owner-era) | A per-recipient `links` row that carries watched, saved and reaction state |
| 2025 vidfriends | Broadcast to all friends, with no recipients |
| 2026 backend | Per-recipient `received_videos`, **plus** a server-wide public feed with public likes and comments on the video |
| 2026 Android | No recipients at all |

The owner's stated core promise is a FYP made only of videos friends sent you.

## Decision

- The primary object is the **Share**: one sender, one recipient, one Video. Recipient state lives on the Share (watched, progress, saved, hidden, reaction).
- Engagement (reaction and replies) belongs to the **Share conversation**, visible only to its two participants. A Video has no public comments or likes.
- **Feeds are derived from received Shares only.** There is no server-wide feed, no public profile pages, and a member's video list is not visible to others.
- Sending to N friends creates N Shares (N separate conversations). The sender's "Sent" view groups them by Video.
- Re-sharing is allowed for any Video the member received ("pass it on"). It creates new Shares from the re-sharer.
- Friendship is consent-based ([L-12](../legacy/AUDIT.md#4-lessons-referenced-by-id-from-the-design-docs)). Sends require an accepted friendship.

## Alternatives considered

- **Group threads (one conversation per send, all recipients).** It reveals recipients to each other, which may surprise users, and needs group membership semantics. It is a possible future feature ("send to group").
- **Public per-video comments (2026).** Rejected: a privacy leak across friend circles that never consented to see each other.

## Consequences

- Very simple authorization: a member sees a Share if and only if they are a participant in it (BR-SHR-6).
- The "also sent by" grouping in the feed is computed at read time (BR-FEED-7).
- Analytics such as "view count" do not exist by design.
