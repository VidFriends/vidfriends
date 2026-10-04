# Environment reference

Generated from `apps/server/src/config/env.ts` by `pnpm --filter @vidfriends/server env:docs`. Do not edit by hand.

The server validates every value at startup and exits with one aggregated error message when something is wrong (NFR-OPS-02). With `NODE_ENV=production` it also refuses missing, short or known-default secrets (NFR-SEC-03).

Product policy (signup mode, quotas, retention, session lifetimes and so on) is **not** configured here: admins change it at runtime in the instance settings (FRD WF-ADM-3).

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | `production` enables the secret strength checks (NFR-SEC-03). |
| `ROLE` | `all` | Process role: `api` (HTTP + web app), `worker` (background jobs) or `all` (both, for small installs). `node dist/main.js migrate` applies migrations and exits. |
| `HOST` | `0.0.0.0` | HTTP bind address. |
| `PORT` | `8080` | HTTP port. |
| `METRICS_PORT` | `9464` | Internal Prometheus `/metrics` port (0 disables). Never publish it. |
| `PUBLIC_URL` | **required** | Public origin of the instance, e.g. `https://vf.example.org`. Used for join links, CSRF origin checks and cookie security. Example: `https://vf.example.org`. |
| `DATABASE_URL` | **required** | PostgreSQL connection string. Example: `postgres://vidfriends:<password>@postgres:5432/vidfriends`. **Secret.** |
| `APP_SECRET` | **required** | At least 32 random characters. Used for CSRF tokens and to encrypt instance secrets (VAPID key) at rest. Generate with `openssl rand -base64 48`. **Secret.** |
| `TRUSTED_PROXIES` | `127.0.0.1/32,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7` | Comma-separated CIDRs of reverse proxies whose `X-Forwarded-For` is trusted (L-20). Default: loopback and private ranges (the compose network). |
| `LOG_LEVEL` | `info` | pino log level. |
| `WEB_DIST` | `` | Directory with the built web app (served at `/`). Empty means `../web/dist` relative to the server package. |
| `SHUTDOWN_GRACE_SECONDS` | `15` | Maximum time to finish in-flight requests on SIGTERM (NFR-REL-02). |
| `RATE_LIMIT_AUTH_PER_MINUTE` | `10` | Auth endpoint requests per minute, per client IP and per username (NFR-SEC-06). |
| `RATE_LIMIT_USER_PER_MINUTE` | `300` | Authenticated requests per minute per user (NFR-SEC-06). |
| `RATE_LIMIT_IP_PER_MINUTE` | `1200` | All requests per minute per client IP. |
| `S3_ENDPOINT` | (unset) | Internal S3 API endpoint used by the server and worker, e.g. `http://seaweedfs:8333`. Empty for AWS S3. Example: `http://seaweedfs:8333`. |
| `S3_PUBLIC_ENDPOINT` | (unset) | Endpoint used in presigned URLs given to clients. With the bundled SeaweedFS this is `PUBLIC_URL` (the proxy routes `/<bucket>/*` to the store, ADR-0015). Defaults to `S3_ENDPOINT`. Example: `https://vf.example.org`. |
| `S3_REGION` | `us-east-1` | S3 region. |
| `S3_BUCKET` | `media-store` | Private bucket name. With the bundled SeaweedFS the proxy serves it at `/<bucket>/` (ADR-0015). |
| `S3_ACCESS_KEY_ID` | `` | S3 access key id. **Secret.** |
| `S3_SECRET_ACCESS_KEY` | `` | S3 secret access key. **Secret.** |
| `S3_FORCE_PATH_STYLE` | `true` | Use path-style S3 URLs (required for SeaweedFS and MinIO). |
| `WORK_DIR` | `/tmp/vidfriends-work` | Disk-backed directory for per-job temporary files (worker). Each job uses and removes its own subdirectory. |
| `WORKER_FETCH_CONCURRENCY` | `2` | Concurrent `video.fetch` jobs per worker (NFR-PERF-03). |
| `WORKER_PROCESS_CONCURRENCY` | `1` | Concurrent `video.process` (transcode) jobs per worker (NFR-PERF-03). |
| `YTDLP_PATH` | `yt-dlp` | yt-dlp executable. |
| `FFMPEG_PATH` | `ffmpeg` | ffmpeg executable. |
| `FFPROBE_PATH` | `ffprobe` | ffprobe executable. |
| `FETCH_TIMEOUT_SECONDS` | `600` | Wall-clock limit for one yt-dlp run (BR-MED-2). |
| `PROCESS_TIMEOUT_SECONDS` | `900` | Wall-clock limit for one ffmpeg run. |
