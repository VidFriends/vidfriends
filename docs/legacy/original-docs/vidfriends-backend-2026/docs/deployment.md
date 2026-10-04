# VidFriends Deployment Guide

**Audience:** Tech-savvy users comfortable with Docker who may not be DevOps experts
**Last reviewed:** 2026-06-16
**Applies to:** VidFriends backend v1.0+

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Architecture Overview](#architecture-overview)
4. [Configuration Reference](#configuration-reference)
5. [Production Hardening](#production-hardening)
6. [Backup & Restore](#backup--restore)
7. [Monitoring & Health Checks](#monitoring--health-checks)
8. [Upgrading](#upgrading)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Docker Engine** 24+ and **Docker Compose** v2+
- **Operating System:** Linux (recommended) or macOS
- **Minimum server specs:**
  - 1 CPU core
  - 1 GB RAM
  - 10 GB free disk space
- **Recommended production specs:**
  - 2 CPU cores
  - 2 GB RAM
  - 50 GB SSD (scales with video storage)

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/vidfriends/backend.git
cd backend

# 2. Start all services (PostgreSQL + migrations + API)
make dev
# Equivalent to: docker compose up --build --wait

# 3. Verify it's running
curl http://localhost:8080/api/health
# {"status":"ok","database":"ok"}
```

### Production Deployment

```bash
# 1. Create production environment file
cp .env.example .env.production
# Edit .env.production with strong secrets

# 2. Deploy with production overrides (Caddy TLS, security hardening)
make deploy
# Equivalent to: docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d --wait

# 3. Tail production logs
make prod-logs
```

This starts:
- **PostgreSQL 16** — primary database
- **migrate** — runs schema migrations on startup
- **MinIO** — S3-compatible object storage for video files
- **createbuckets** — auto-creates the required MinIO bucket on first run
- **VidFriends API** — Go backend on port 8080

---

## Architecture Overview

```
                         Internet
                            |
                        [Caddy / Nginx]
                       (optional, for TLS)
                             |
                     VidFriends API (:8080)
                      ╱            ╲
              PostgreSQL (:5432)   MinIO (:9000)
                                   (video storage)
```

VidFriends is a single-process Go server backed by PostgreSQL for metadata and MinIO (or any S3-compatible store) for video file storage. In production you typically put a reverse proxy (Caddy, Nginx, or your cloud LB) in front for TLS termination.

---

## Configuration Reference

All configuration is via environment variables. Copy `.env.example` to `.env` and fill in your values. Never commit `.env` files.

### Server

| Variable | Default | Description |
|---|---|---|
| `VIDFRIENDS_ADDR` | `:8080` | Listen address and port |
| `VIDFRIENDS_READ_TIMEOUT` | `10` | HTTP read timeout in seconds |
| `VIDFRIENDS_WRITE_TIMEOUT` | `30` | HTTP write timeout in seconds |
| `VIDFRIENDS_SHUTDOWN_TIMEOUT` | `15` | Graceful shutdown timeout in seconds |

### Database

| Variable | Default | Description |
|---|---|---|
| `VIDFRIENDS_DATABASE_URL` | `postgres://vidfriends:vidfriends@localhost:5432/vidfriends?sslmode=disable` | PostgreSQL connection string |

### Authentication & JWT

| Variable | Default | Description |
|---|---|---|
| `VIDFRIENDS_JWT_SECRET` | `vidfriends-dev-secret-do-not-use-in-prod` | HMAC secret for JWT signing. Generate with `openssl rand -base64 32` |
| `VIDFRIENDS_JWT_EXPIRY` | `15m` | Access token expiry (Go duration format, e.g. `15m`, `24h`) |
| `VIDFRIENDS_JWT_REFRESH_EXPIRY` | `168h` | Refresh token expiry (default 7 days) |

### S3-Compatible Object Storage

| Variable | Default | Description |
|---|---|---|
| `VIDFRIENDS_S3_ENDPOINT` | `http://localhost:9000` | S3 endpoint URL (MinIO, AWS S3, etc.) |
| `VIDFRIENDS_S3_ACCESS_KEY` | `minioadmin` | S3 access key |
| `VIDFRIENDS_S3_SECRET_KEY` | `minioadmin` | S3 secret key |
| `VIDFRIENDS_S3_BUCKET` | `vidfriends-videos` | S3 bucket name for video storage |
| `VIDFRIENDS_S3_USE_SSL` | `false` | Enable SSL for S3 connections (`true` or `false`) |

### Video Download (yt-dlp)

| Variable | Default | Description |
|---|---|---|
| `VIDFRIENDS_YTDLP_PATH` | `yt-dlp` | Path to yt-dlp binary |
| `VIDFRIENDS_YTDLP_OUTPUT_DIR` | `/tmp/vidfriends-downloads` | Temporary download directory |
| `VIDFRIENDS_YTDLP_MAX_FILE_SIZE` | `524288000` | Max file size in bytes (default 500 MB) |
| `VIDFRIENDS_YTDLP_DOWNLOAD_TIMEOUT` | `30m` | Download timeout (Go duration format) |

### Push Notifications

| Variable | Default | Description |
|---|---|---|
| `VIDFRIENDS_NTFY_URL` | _(empty)_ | ntfy.sh URL for self-hosted push notifications |
| `VIDFRIENDS_GOTIFY_URL` | _(empty)_ | Gotify URL for push notifications |
| `VIDFRIENDS_FCM_CREDENTIALS_FILE` | _(empty)_ | Path to Firebase Cloud Messaging credentials JSON |
| `VIDFRIENDS_APNS_KEY_FILE` | _(empty)_ | Path to APNs authentication key file |
| `VIDFRIENDS_APNS_KEY_ID` | _(empty)_ | APNs key ID |
| `VIDFRIENDS_APNS_TEAM_ID` | _(empty)_ | Apple Team ID |
| `VIDFRIENDS_APNS_TOPIC` | _(empty)_ | APNs topic (bundle identifier) |

### Rate Limiting & CORS

| Variable | Default | Description |
|---|---|---|
| `VIDFRIENDS_RATE_LIMIT_RATE` | `10` | Max requests per second per user/IP |
| `VIDFRIENDS_RATE_LIMIT_BURST` | `20` | Burst allowance |
| `VIDFRIENDS_CORS_ORIGINS` | `http://localhost:3000,http://localhost:5173` | Comma-separated allowed CORS origins |

### Platform Restrictions

| Variable | Default | Description |
|---|---|---|
| `VIDFRIENDS_ALLOWED_PLATFORMS` | `youtube.com,youtu.be,tiktok.com,instagram.com,...` | Comma-separated list of allowed video source platforms |
| `VIDFRIENDS_DUPLICATE_THRESHOLD` | `12` | Perceptual hash Hamming distance threshold for duplicate detection |

### Observability

| Variable | Default | Description |
|---|---|---|
| `VIDFRIENDS_LOG_LEVEL` | `info` | Log level: `debug`, `info`, `warn`, `error` |

### Example .env file

```bash
# VidFriends Environment Configuration
# Copy this file to .env and fill in your values.
# NEVER commit .env files to version control.

# ---------- Server ----------
VIDFRIENDS_ADDR=:8080
VIDFRIENDS_READ_TIMEOUT=10
VIDFRIENDS_WRITE_TIMEOUT=30
VIDFRIENDS_SHUTDOWN_TIMEOUT=15

# ---------- Database ----------
VIDFRIENDS_DATABASE_URL=postgres://vidfriends:vidfriends@postgres:5432/vidfriends?sslmode=disable

# ---------- Auth / JWT ----------
VIDFRIENDS_JWT_SECRET=vidfriends-dev-secret-do-not-use-in-prod
VIDFRIENDS_JWT_EXPIRY=15m

# ---------- S3 / Object Storage ----------
VIDFRIENDS_S3_ENDPOINT=http://minio:9000
VIDFRIENDS_S3_ACCESS_KEY=minioadmin
VIDFRIENDS_S3_SECRET_KEY=minioadmin
VIDFRIENDS_S3_BUCKET=vidfriends-videos
VIDFRIENDS_S3_USE_SSL=false

# ---------- Rate Limiting ----------
VIDFRIENDS_RATE_LIMIT_RATE=10
VIDFRIENDS_RATE_LIMIT_BURST=20

# ---------- CORS ----------
VIDFRIENDS_CORS_ORIGINS=http://localhost:3000,http://localhost:5173

# ---------- Logging ----------
VIDFRIENDS_LOG_LEVEL=info
```

---

## Production Hardening

### 1. Change Default Credentials

The default `docker-compose.yml` uses `vidfriends:vidfriends` for PostgreSQL. **Change this before exposing to any network:**

```yaml
environment:
  POSTGRES_PASSWORD: <generated-strong-password>
```

Update `VIDFRIENDS_DATABASE_URL` to match.

### 2. Use a Reverse Proxy for TLS

Never expose the API port (8080) directly to the internet. Use Caddy (auto TLS) or Nginx:

**Caddy example** (`Caddyfile`):
```
vidfriends.example.com {
    reverse_proxy api:8080
}
```

Add to `docker-compose.yml`:
```yaml
caddy:
  image: caddy:2-alpine
  restart: unless-stopped
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - caddy_data:/data
    - ./Caddyfile:/etc/caddy/Caddyfile:ro
  depends_on:
    - api

volumes:
  caddy_data:
```

### 3. Bind API to Localhost

In production, bind the API port to `127.0.0.1` so only the reverse proxy can reach it:

```yaml
ports:
  - "127.0.0.1:8080:8080"
```

### 4. Resource Limits

```yaml
deploy:
  resources:
    limits:
      cpus: "1.0"
      memory: "256M"
```

### 5. Read-Only Root Filesystem

```yaml
security_opt:
  - no-new-privileges:true
cap_drop:
  - ALL
cap_add:
  - NET_BIND_SERVICE
read_only: true
tmpfs:
  - /tmp:size=64M
```

### 6. Firewall Rules

Only these ports need to be open:
- `80/tcp` — HTTP (redirects to HTTPS)
- `443/tcp` — HTTPS
- `22/tcp` — SSH (admin access only)

Do **not** expose port 8080, 5432, or 9000 to the internet.

### 7. Database Connection Security

Use `sslmode=require` or `sslmode=verify-full` for production database connections if your PostgreSQL supports TLS. The default `sslmode=disable` is only safe on isolated Docker networks.

### 8. MinIO Security

If using MinIO in production:
- Change the default `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` from `minioadmin`
- Keep MinIO ports (9000, 9001) bound to `127.0.0.1` only
- Use `VIDFRIENDS_S3_USE_SSL=true` and a TLS-enabled MinIO endpoint
- The `createbuckets` service auto-creates the required bucket on first run; it can be removed after initial setup

### 9. Security Checklist

Run through the [Security Checklist](security-checklist.md) before going live to verify all production security requirements.

---

## Backup & Restore

### Database Backup

```bash
# Backup
docker compose exec -T postgres pg_dump -U vidfriends vidfriends > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore
cat backup.sql | docker compose exec -T postgres psql -U vidfriends vidfriends
```

### Automated Backup (cron)

Create `/etc/cron.d/vidfriends-backup`:
```
0 3 * * * root cd /opt/vidfriends && docker compose exec -T postgres pg_dump -U vidfriends vidfriends > /backups/vidfriends_$(date +\%Y\%m\%d).sql && gzip /backups/vidfriends_$(date +\%Y\%m\%d).sql
```

### Backup Rotation

```bash
# Keep 30 days of daily backups
find /backups -name "vidfriends_*.sql.gz" -mtime +30 -delete
```

### Database Volume

Even with SQL backups, consider snapshotting the PostgreSQL data volume for faster recovery:

```bash
docker run --rm -v vidfriends_pgdata:/source -v /backups/volumes:/dest alpine tar czf /dest/pgdata_$(date +%Y%m%d).tar.gz -C /source .
```

---

## Monitoring & Health Checks

### Built-in Health Endpoint

```
GET /api/health
```

Response:
```json
{"status":"ok","database":"ok"}
```

The Dockerfile includes a `HEALTHCHECK` instruction that hits this endpoint every 30 seconds.

### Docker Health Check

The health check is already configured in the Dockerfile:
```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["sh", "-c", "wget -qO- http://localhost:8080/api/health || exit 1"]
```

### Docker Compose Health Status

```bash
docker compose ps
# Look for "healthy" in the STATUS column
```

### Prometheus & Grafana (optional)

Add Prometheus metrics endpoint and monitoring stack:

```yaml
prometheus:
  image: prom/prometheus:v2.53
  restart: unless-stopped
  volumes:
    - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
    - prometheus_data:/prometheus

grafana:
  image: grafana/grafana:11.1
  restart: unless-stopped
  ports:
    - "127.0.0.1:3000:3000"
  volumes:
    - grafana_data:/var/lib/grafana

volumes:
  prometheus_data:
  grafana_data:
```

### Logging

Logs go to stdout/stderr (Docker-friendly):

```bash
# Tail logs
docker compose logs -f api

# Filter by log level
docker compose logs api | grep '"level":"error"'

# JSON format parsing
docker compose logs api | jq 'select(.level == "error")'
```

### Uptime Monitoring

Use an external service (Pingdom, Better Uptime, Healthchecks.io) to hit your `/api/health` endpoint every minute from outside your network.

---

## Upgrading

### Standard Upgrade

```bash
# 1. Pull the latest code
git pull origin main

# 2. Rebuild and restart
docker compose up --build -d --wait

# 3. Verify
curl http://localhost:8080/api/health
```

### Rolling Back

```bash
# Revert to the previous git commit
git checkout <previous-tag-or-commit>

# Rebuild and restart
docker compose up --build -d --wait
```

To rollback the database, apply the down migration:

```bash
docker compose run --rm migrate -path /migrations \
  -database "$VIDFRIENDS_DATABASE_URL" down 1
```

### Zero-Downtime Deployments

For production environments that can't tolerate downtime:

1. Run a second API instance behind your reverse proxy
2. Use `restart: always` and rolling update strategy
3. Ensure `VIDFRIENDS_SHUTDOWN_TIMEOUT` is long enough for in-flight requests

```yaml
api:
  deploy:
    replicas: 2
    update_config:
      parallelism: 1
      delay: 10s
      order: start-first
```

Note: This requires Docker Swarm or similar orchestration. For single-server setups, expect ~5s of downtime during restart.

---

## Troubleshooting

### API won't start

Check logs:
```bash
docker compose logs api
```

Common causes:
- PostgreSQL not reachable — verify `VIDFRIENDS_DATABASE_URL`
- Port conflict — change `VIDFRIENDS_ADDR` or host port mapping
- Migration failure — inspect `docker compose logs migrate`

### Health check failing

```bash
# Check if the container is running
docker compose ps

# Inspect the container
docker compose inspect api

# Manual health check
docker compose exec api wget -qO- http://localhost:8080/api/health
```

### Database connection refused

```bash
# Verify PostgreSQL is healthy
docker compose ps postgres

# Check PostgreSQL logs
docker compose logs postgres

# Test connection from API container
docker compose exec postgres pg_isready -U vidfriends
```

### Out of disk space

```bash
# Check volume sizes
docker system df -v

# Prune unused data
docker system prune -f

# Inspect PostgreSQL data volume
docker run --rm -v vidfriends_pgdata:/data alpine du -sh /data
```
