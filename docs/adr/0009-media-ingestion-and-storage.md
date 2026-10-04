# ADR-0009: Media ingestion through durable jobs; private S3-compatible storage with signed URLs

- **Status:** Accepted. The owner accepted the legal risk for private groups on 2026-10-03 (BRD OQ-1). **Superseded in part by [ADR-0015](0015-bundled-object-store-seaweedfs.md)** (bundled store and `/media-store` routing).
- **Date:** 2026-10-03
- **Decided by:** Claude under delegation

## Context

- Every era downloaded videos server-side, because third-party embeds were flaky and unplayable inside a vertical feed (the 2025 commit "removed embed remenance").
- Past implementations had serious problems:
  - **Synchronous** yt-dlp calls inside requests.
  - In-memory queues that lost jobs.
  - A 1.8 µs timeout.
  - Public-read buckets.
  - Internal S3 URLs leaked to clients.
  - No HTTP Range support.
  - Unbounded downloads.
  - SSRF exposure (L-05, L-07, L-09, L-10).

## Decision

1. **Add-by-link** creates a `videos` row and enqueues a `video.fetch` pg-boss job. The HTTP request never waits on yt-dlp.
2. The **worker** runs yt-dlp with these controls:
   - The URL is passed after `--`.
   - `--no-playlist`, `--max-filesize`, a format selector that prefers ≤ 1080p H.264/AAC MP4, and `--restrict-filenames`.
   - The output goes to a per-job temporary directory on a disk-backed volume, which is always cleaned up.
   - A wall-clock timeout applies.
   - Egress is restricted by NFR-SEC-05: the worker resolves the host and refuses private ranges, and yt-dlp's own redirects are limited to the allowlist where possible.
3. **Processing** (`video.process`):
   - ffprobe the file.
   - If it is not browser-safe (H.264/AAC in MP4, or VP9/AV1 in WebM with a fallback), transcode with ffmpeg. Otherwise remux with `+faststart`.
   - Extract a thumbnail frame at roughly 10% of the duration, as WebP.
   - Upload to storage under `media/<video_id>/<rendition>.mp4` and `thumbs/<video_id>.webp`. Keys are opaque and never include user input.
   - Mark the video `ready`.
4. **Storage:** a **private** bucket on any S3-compatible service. MinIO is the default for self-hosting; R2, B2 and S3 are supported by config.
5. **Delivery:** the API authorises access (BR-SHR-6), then returns a **presigned GET URL** (TTL ≤ 15 min) that supports Range natively. For MinIO behind the same reverse proxy, the presign host is the public proxied path (`/media-store/…`), so clients never see internal hostnames.
6. **Uploads:** the client requests an upload slot. The API checks size and quota, then returns a presigned PUT (or multipart presign for files over 64 MB) to `uploads/<upload_id>`. The client confirms completion. The worker sniffs the content, hashes it, processes it, and deletes the raw upload.
7. **Link-only fallback:** when downloading is disabled, unsupported or keeps failing, the share shows title and thumbnail metadata where available and links out (BR-MED-3, BR-MED-9).
8. **yt-dlp version** is pinned in the worker image and bumped by a scheduled CI job (NFR-OPS-05), because platforms break extractors often.

## Alternatives considered

- **Embeds only (no download).** Legal exposure is lower. Rejected as the default because embeds are unreliable, inconsistent in a vertical feed, and track users (BC-1). It remains available as an operator setting.
- **Proxying media through the API server.** Rejected: it ties up Node, makes Range handling and timeouts error-prone, and failed before. Presigned URLs offload delivery to storage.
- **HLS/DASH adaptive streaming.** Overkill for clips under 10 minutes. Revisit if bandwidth complaints arise.

## Consequences

- The reverse proxy must route a public path to MinIO in the default compose setup ([TDD §6](../design/TDD.md#6-deployment-and-operations)).
- Storage cost is bounded by retention (BR-MED-5) and quotas.
- **Accepted risk** (owner, 2026-10-03): platform terms of service and copyright (BRD BC-5, OQ-1). Mitigations: private instances only, no republishing, retention purge, and the `link_download_enabled` switch.
