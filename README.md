# VidFriends Backend

[![CI](https://github.com/vidfriends/backend/actions/workflows/ci.yml/badge.svg)](https://github.com/vidfriends/backend/actions)

Backend server for VidFriends — a unified place to find all of your shortform videos sent by your friends.

## Tech Stack

- **Language:** Go 1.22+
- **Database:** PostgreSQL 16
- **Object Storage:** MinIO (S3-compatible)
- **Migrations:** [golang-migrate](https://github.com/golang-migrate/migrate)
- **Containerization:** Docker + Docker Compose

## Quick Start (<5 steps)

```bash
# 1. Clone the repo
git clone https://github.com/vidfriends/backend.git
cd backend

# 2. Copy environment config
cp .env.example .env

# 3. Start everything
make dev
# or: docker compose up --build --wait

# 4. Verify it's running
curl http://localhost:8080/api/health
# {"status":"ok","database":"ok"}
```

## Project Structure

```
cmd/server/main.go        # Entry point
internal/
  config/config.go        # Environment-based configuration
  database/database.go    # PostgreSQL connection pool
  handler/                # HTTP handlers (auth, video, health, admin, ws)
  middleware/             # Middleware (auth, logging, cors, ratelimit)
  router/router.go        # Route setup
  auth/jwt.go             # JWT token management
  storage/s3.go           # S3-compatible object storage client
  model/models.go         # Data models
migrations/               # Database migrations (golang-migrate)
docs/                     # Documentation
```

## Development

```bash
# Run locally (requires Postgres)
VIDFRIENDS_DATABASE_URL="postgres://..." go run ./cmd/server

# Lint
make lint

# Unit tests
make test

# Integration tests (starts docker compose, runs tests, tears down)
make test-integration

# Build binary
make build
```

## Production Deployment

See [Deployment Guide](docs/deployment.md) for production setup including:

- Reverse proxy (Caddy / Nginx) with TLS
- Secrets management
- Rate limiting and CORS configuration
- Backup and restore procedures
- Monitoring and health checks
- Zero-downtime deployments
- Security hardening

## API Endpoints

| Method | Path                          | Description              | Auth Required |
|--------|-------------------------------|--------------------------|---------------|
| GET    | /api/health                   | Health check             | No            |
| POST   | /api/auth/register            | Register new user        | No            |
| POST   | /api/auth/login               | Login                    | No            |
| POST   | /api/auth/refresh             | Refresh token            | No            |
| GET    | /api/auth/me                  | Current user profile     | Yes           |
| GET    | /api/ws                       | WebSocket                | No            |
| POST   | /api/videos/upload            | Upload video file        | Yes           |
| POST   | /api/videos/from-link         | Import video from URL     | Yes           |
| GET    | /api/feed                     | Get feed                 | Yes           |
| GET    | /api/videos/{id}              | Video detail             | Yes           |
| POST   | /api/videos/{id}/like         | Like video               | Yes           |
| DELETE | /api/videos/{id}/like         | Unlike video             | Yes           |
| GET    | /api/videos/{id}/comments     | Get comments             | Yes           |
| POST   | /api/videos/{id}/comment      | Add comment              | Yes           |
| POST   | /api/videos/{id}/watched      | Mark watched             | Yes           |
| GET    | /api/history                  | Watch history            | Yes           |
| GET    | /api/admin/stats              | Admin statistics         | Yes (admin)   |
| GET    | /api/admin/users              | List users               | Yes (admin)   |
| PATCH  | /api/admin/users/{id}         | Update user              | Yes (admin)   |
| DELETE | /api/admin/users/{id}         | Delete user              | Yes (admin)   |
| GET    | /api/admin/storage            | Storage breakdown        | Yes (admin)   |
| POST   | /api/admin/eviction/run       | Run storage eviction     | Yes (admin)   |
| GET    | /api/admin/activity           | Activity log             | Yes (admin)   |
| GET    | /api/admin/invites            | List invites              | Yes (admin)   |
| POST   | /api/admin/invites            | Create invite             | Yes (admin)   |

## Environment Variables

See [.env.example](.env.example) for all configurable environment variables.

## Configuration Reference

Full environment variable reference is in [docs/deployment.md](docs/deployment.md#configuration-reference).

## Integration Tests

Integration tests verify the full docker-compose stack:

- Health endpoint returns `200 OK` with database status
- Database migrations ran (all expected tables exist)
- MinIO connectivity (bucket exists, can upload objects)

### Prerequisites

- Docker and Docker Compose
- Go 1.22+

### Run

```bash
# One command — starts stack, runs tests, cleans up
make test-integration

# Or manually
./scripts/integration-test.sh
```

### CI

The integration test job runs on every push/PR in CI. It spins up the full stack
(`postgres` + `migrate` + `minio` + `api`), runs the smoke tests, and tears
everything down.

## User-Facing Documentation

- [Admin Setup Guide](docs/admin-setup.md) — for self-hosters deploying VidFriends
- [End-User Guide](docs/user-guide.md) — for friends using the platform
- [FAQ](docs/faq.md) — common questions about data, storage, and features

## Security

See [Security Checklist](docs/security-checklist.md) for production security
verification.

---

## License

[AGPL-3.0](LICENSE) — VidFriends Inc.
