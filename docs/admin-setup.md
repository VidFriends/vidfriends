# Admin Setup Guide

**Audience:** Tech-savvy users comfortable with Docker who will self-host VidFriends
**Last reviewed:** 2026-06-16
**Applies to:** VidFriends backend v1.0+

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Step-by-Step Deployment](#step-by-step-deployment)
3. [First-Time Admin Account](#first-time-admin-account)
4. [Inviting Friends](#inviting-friends)
5. [Admin Dashboard](#admin-dashboard)
6. [Storage Management](#storage-management)
7. [User Management](#user-management)
8. [Activity Monitoring](#activity-monitoring)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Docker Engine** 24+ and **Docker Compose** v2+
- **Operating System:** Linux (recommended) or macOS
- **A domain or public IP** if friends will connect from outside your network
- **Minimum server specs:**
  - 1 CPU core, 1 GB RAM, 10 GB free disk space
- **Recommended production specs:**
  - 2 CPU cores, 2 GB RAM, 50 GB SSD (scales with video storage)

For the full production hardening checklist, see the [Deployment Guide](deployment.md) and [Security Checklist](security-checklist.md).

---

## Step-by-Step Deployment

### 1. Clone and Configure

```bash
git clone https://github.com/vidfriends/backend.git
cd backend
cp .env.example .env
```

Edit `.env` with your settings. At minimum, change these secrets:

```bash
VIDFRIENDS_JWT_SECRET=$(openssl rand -base64 32)
# Change the database password too
```

### 2. Start the Server

```bash
docker compose up --build --wait
```

This starts:

- **PostgreSQL 16** — database
- **migrate** — runs schema migrations automatically
- **MinIO** — S3-compatible storage for video files
- **createbuckets** — creates the required S3 bucket
- **VidFriends API** — Go backend on port 8080

### 3. Verify

```bash
curl http://localhost:8080/api/health
# {"status":"ok","database":"ok"}
```

### Production Deployment

For production, use the production override file:

```bash
cp .env.example .env.production
# Edit secrets and settings
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d --wait
```

This adds Caddy for automatic TLS (Let's Encrypt). Point your domain's DNS A record to the server IP before starting.

---

## First-Time Admin Account

VidFriends does not create an admin account automatically. The first user to register via the API is a regular `user`. To make yourself an admin, update your role directly in the database:

```bash
# Connect to PostgreSQL
docker compose exec postgres psql -U vidfriends -d vidfriends

# Make yourself an admin (replace your-email@example.com)
UPDATE users SET role = 'admin' WHERE email = 'your-email@example.com';
```

Now you can access the admin API endpoints (see [Admin Dashboard](#admin-dashboard)).

---

## Inviting Friends

VidFriends uses invite-only registration. As an admin, you create invite tokens that friends use to sign up.

### Create an Invite Token

```bash
# Replace with a future date (RFC3339 format)
curl -X POST http://localhost:8080/api/admin/invites \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"expires_at": "2026-07-15T23:59:59Z"}'
```

Response:

```json
{"token":"abc123...","expires_at":"2026-07-15T23:59:59Z"}
```

### Share the Invite

Give the token to your friend. They will enter it during registration. You can share it as:

- A plain text token: `abc123...`
- A link: `https://yourserver.com/register?code=abc123...`
- A QR code (generate from any QR tool)

### List Existing Invites

```bash
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  http://localhost:8080/api/admin/invites
```

Each invite shows whether it has been used, who used it, and when it expires.

---

## Admin Dashboard

All admin operations are via the API. A web admin UI is under development ([VID-157](/VID/issues/VID-157)). In the meantime, here are the available API endpoints:

### View Stats

```bash
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  http://localhost:8080/api/admin/stats
```

Returns total videos, storage used, total users, and active users (last 24h).

### Manage Users

- **List users:** `GET /api/admin/users`
  - Filter by `?email=`, `?username=`, `?role=`, `?status=`
- **Update user:** `PATCH /api/admin/users/{id}`
  - Change role: `{"role": "admin"}` (values: `user`, `admin`)
  - Change status: `{"status": "suspended"}` (values: `active`, `suspended`, `disabled`)
- **Delete user:** `DELETE /api/admin/users/{id}`

### View Storage

```bash
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  http://localhost:8080/api/admin/storage
```

Returns a breakdown of storage used per user, sorted by usage descending.

### Activity Log

See [Activity Monitoring](#activity-monitoring).

---

## Storage Management

### View Storage Breakdown

The `/api/admin/storage` endpoint shows which users are using the most space:

```bash
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  http://localhost:8080/api/admin/storage
```

### Storage Eviction

VidFriends can automatically evict (delete) old, unengaged videos. Videos are eligible for eviction when they are:

- Older than 90 days
- Have zero likes
- Have zero comments

To run eviction:

```bash
curl -X POST -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  http://localhost:8080/api/admin/eviction/run
```

Response:

```json
{"status":"eviction_complete","evicted":5}
```

Eviction deletes the video file and thumbnail from storage, then marks the video as `deleted` in the database. It runs on-demand; scheduled eviction is under development ([VID-156](/VID/issues/VID-156)). For now, set up a cron job externally if desired.

### Storage Quotas

Each user has a `storage_used` field tracked in the database. Automatic per-user quota enforcement is under development ([VID-156](/VID/issues/VID-156)). Until then, monitor usage via the storage breakdown endpoint.

---

## User Management

### User Statuses

Users can have one of three statuses:

| Status      | Description |
|-------------|-------------|
| `active`    | Normal user, can log in and use the platform |
| `suspended` | Cannot log in until reinstated |
| `disabled`  | Permanently disabled |

### Suspend or Disable a User

```bash
curl -X PATCH http://localhost:8080/api/admin/users/{user-id} \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "suspended"}'
```

### Promote to Admin

```bash
curl -X PATCH http://localhost:8080/api/admin/users/{user-id} \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role": "admin"}'
```

---

## Activity Monitoring

The activity log records significant admin actions.

### View Activity Log

```bash
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  http://localhost:8080/api/admin/activity
```

### Filter the Log

Use query parameters to narrow results:

| Parameter    | Description |
|-------------|-------------|
| `action`    | Filter by action type (e.g., `admin_update_user`) |
| `actor_id`  | Filter by who performed the action |
| `entity_type` | Filter by entity type (e.g., `user`, `video`) |
| `entity_id` | Filter by specific entity ID |
| `limit`     | Results per page (max 100, default 50) |
| `offset`    | Pagination offset |

Example:

```bash
curl "http://localhost:8080/api/admin/activity?action=admin_eviction_run&limit=10"
```

### Tracked Actions

The activity log automatically records:

- User updates (role/status changes)
- User deletions
- Eviction runs
- Invite token creation

---

## Troubleshooting

### Admin API returns 403

Your user role must be `admin`. See [First-Time Admin Account](#first-time-admin-account).

### Invite token rejected

Tokens expire. Check the `expires_at` timestamp and create a new one if needed.

### Eviction ran but nothing happened

No videos met the criteria: older than 90 days with no likes or comments.

### Can't reach the server from outside

- Check your firewall: ports 80 and 443 must be open
- Verify DNS points to your server IP
- If using the production setup, ensure Caddy can obtain a TLS certificate

For general troubleshooting, see the [Deployment Guide](deployment.md#troubleshooting).
