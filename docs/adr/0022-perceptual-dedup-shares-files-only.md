# ADR-0022: Perceptual dedup shares stored files only

- **Status:** Accepted
- **Date:** 2026-10-04
- **Decided by:** Owner scheduled perceptual dedup (multiple-choice answer, 2026-10-04).
  Mechanism: Claude under delegation.
- **Supersedes:** none. It extends BR-MED-4, which limited dedup to exact normalised URLs and
  exact SHA-256 in v1, and keeps its rule that dedup reuses media only.

## Context

- The same clip often reaches an instance through different links: a TikTok repost and the
  YouTube Short it came from, or two uploads of one video saved at different quality. Exact dedup
  (same normalised URL, same bytes) misses these, so each copy is stored again.
- The legacy backend tried perceptual dedup and broke it in ways recorded in the audit
  ([L-19](../legacy/AUDIT.md#4-lessons-referenced-by-id-from-the-design-docs),
  [backend §6.5](../legacy/audits/2026-backend.md)):
  - It moved comments and inbox entries from one member's video onto another member's video.
  - It hashed one frame, so undecodable clips all hashed alike and were grouped together.
  - It scanned every video on each upload.
- Scale is small (A-3: ≤ 50 members), and the worker already decodes every video with ffmpeg.

## Decision

1. **Only bytes are shared.** When a newly processed video shows the same clip as an earlier
   `ready` video, its row points at the earlier video's stored file (`media_key`) instead of
   uploading its own. Everything else stays its own: the row, link, title, thumbnail, adders,
   shares, reactions and conversations. Nothing moves between members, and members see no
   difference except that the file plays.
2. **Fingerprint:** a 64-bit DCT perceptual hash (pHash) of 8 frames taken at fixed fractions of
   the duration, each scaled to 32×32 grayscale by ffmpeg. Frames that are too flat (pixel
   standard deviation below 6, such as black or single-colour frames) are left out. A clip needs
   5 usable frames to be fingerprinted at all.
3. **Match** (all must hold):
   - The durations are within max(1 s, 2 %).
   - The aspect ratios are within 3 %.
   - The earlier file is at least 90 % of the new video's height, so a reuse never lowers quality.
   - At least 5 frame positions are usable in both clips, every one of them is within 10 bits
     (Hamming distance), and their mean is at most 5 bits.
   - Candidates come from an index on duration. The earliest matching video wins.
4. **Accounting:** the video whose processing stored the file is charged for it (BR-MED-6). A
   video that reuses a file is marked `media_reused` and charged nothing.
5. **Lifetime:** retention and account deletion clear a video's own `media_key` as before. They
   delete the file only when no other video still uses it. The reuse transaction locks the earlier
   video's row, so retention cannot purge the file in between. If the earlier video is no longer
   `ready`, the new video stores its own file.
6. **Operator switch:** `MEDIA_DEDUP=perceptual` (default) or `exact`.

## Alternatives considered

| Option | Why not |
|---|---|
| Merge the second video into the first (one row, shares re-pointed) | Moves members' shares onto another member's object: the L-19 defect. It would also show a stranger's link and title. |
| Awareness only ("possibly the same clip"), no storage reuse | Does not save storage, which is the point of the backlog item. |
| One frame, or a whole-file audio fingerprint | One frame mis-groups intros and blank frames. Audio is often replaced on reposts. |
| A vector index (pgvector, BK-tree) | Not needed at this scale; the duration index keeps the candidate set small. |

## Consequences

- New table `video_fingerprints` (migration 0010) and the column `videos.media_reused`.
- The signed URL for a reused file names the earlier video's object key. That is an opaque id
  and grants nothing on its own, since every media request is still checked (BR-SHR-6).
- A false match would make a video play a different clip. The thresholds are deliberately
  strict, flat frames are ignored, and the operator can switch to `exact`.
- When the original video expires first, its member's bytes are released and the file lives on,
  uncharged, until the last video using it expires.

## Revisit when

- Members report wrong videos playing, or a higher scale needs a proper similarity index.
