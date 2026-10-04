# ADR-0021: Cloudflare test instance: one container behind a Worker, backed up to R2

- **Status:** Accepted
- **Date:** 2026-10-04
- **Decided by:** Owner (multiple-choice answers, 2026-10-04: deploy a test instance to
  Cloudflare; keep data with backups to R2; host it at `vidfriends.app`; real link downloads).
  Mechanism: Claude under delegation.
- **Supersedes:** none. The supported self-hosting path stays Docker Compose
  ([ADR-0007](0007-backend-stack.md), [ADR-0015](0015-bundled-object-store-seaweedfs.md)).

## Context

- The owner wants a VidFriends instance on the internet for testing, on their Cloudflare account
  (Workers Paid, R2, the `vidfriends.app` zone). There is no VM to run the compose stack on.
- VidFriends needs PostgreSQL, an S3-compatible store with presigned URLs and Range requests,
  ffmpeg and yt-dlp, and HTTPS on a domain for passkeys (ADR-0018).
- Cloudflare Containers run Docker images next to a Worker, but their disk is ephemeral: a
  restart, a redeploy or a long sleep starts from the image again. Container snapshots exist, but
  are a beta and tied to one image version, so they do not survive a redeploy.
- The connected account cannot mint R2 S3 credentials, so the app cannot use R2 as its S3 store.

## Decision

1. **One container, one Worker.** The container image (`deploy/cloudflare/container`) is the
   VidFriends worker image plus PostgreSQL 16 and SeaweedFS. It runs the app with `ROLE=all`.
   The Worker (`deploy/cloudflare/worker`) owns `vidfriends.app` (custom domain), sends
   `/media-store/*` to SeaweedFS's S3 gateway and everything else to the app, and sets
   `X-Forwarded-For` from `CF-Connecting-IP` (the only way in, so the container trusts it).
2. **Backups to R2 through the Worker.** The Worker exposes `/__backup/<key>` (PUT, GET) on a
   private R2 bucket, guarded by a random bearer token held as a Worker secret. The container:
   - restores the latest backup before starting (and refuses to start empty if a backup exists
     but cannot be read);
   - backs up every 15 minutes and once more on `SIGTERM`: a `pg_dump`, plus SeaweedFS's files
     in 64 MB parts, sending only files that changed. SeaweedFS volumes are capped at 64 MB, so
     full volumes are uploaded once.
3. **Secrets** (`APP_SECRET`, the Postgres password, the internal S3 keys, the backup token) are
   generated randomly and stored only as Worker secrets. `APP_SECRET` must never change, because
   it encrypts the VAPID key and push tokens.
4. **Size and lifetime:** a custom instance of 2 vCPU, 6 GiB and 20 GB disk, one instance, and a
   24-hour idle timeout (waking restores the backup).
5. **Deploys** run `deploy/cloudflare/deploy.sh`: build the images, push to the Cloudflare
   registry, `wrangler deploy`. It is a manual step, not part of CI.

## Alternatives considered

| Option | Why not |
|---|---|
| Throwaway container without backups | The owner chose to keep data across restarts. |
| External Postgres (Neon) and R2 S3 keys | Needs accounts and secrets from the owner; the owner chose backups. |
| Container snapshots only | Beta, and a snapshot is lost when the image changes (every deploy). |
| A Cloudflare Tunnel to a machine | No machine is available; this session's container is temporary. |

## Consequences

- A crash or forced kill can lose up to 15 minutes of data. A graceful stop (deploy, sleep)
  loses nothing.
- SeaweedFS files are copied while it runs; a file caught mid-write is repaired by SeaweedFS on
  the next start or sent again in the next backup. Acceptable for a test instance.
- A cold start (after a deploy or a day without visitors) waits for the restore.
- The instance is for testing. Members' videos live on Cloudflare; this is not the self-hosted
  privacy model of BC-1.

## Revisit when

- Container snapshots or volumes become generally available and survive image updates, or the
  instance is meant for more than testing.
