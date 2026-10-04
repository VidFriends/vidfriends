# Security Checklist

**Audience:** DevOps / production operators
**Last reviewed:** 2026-06-16

Verify each item before deploying to production.

## Authentication & Authorization

- [ ] JWT secret is a strong random value (`openssl rand -base64 32`)
- [ ] JWT expiry is set to a reasonable duration (default: 15m)
- [ ] Admin endpoints are only accessible with admin role
- [ ] Rate limiting is enabled (default: 10 req/s, burst 20)
- [ ] Passwords are hashed with bcrypt (or equivalent)

## Network Security

- [ ] API port (8080) is bound to `127.0.0.1` — never exposed directly
- [ ] TLS is terminated at reverse proxy (Caddy / Nginx / cloud LB)
- [ ] PostgreSQL port (5432) is not exposed to the internet
- [ ] MinIO ports (9000, 9001) are not exposed to the internet
- [ ] CORS origins are restricted to known domains
- [ ] Firewall only allows ports 80, 443, and 22 (admin SSH)

## Database

- [ ] PostgreSQL password is changed from default
- [ ] Database connection uses `sslmode=require` or `verify-full` if TLS is available
- [ ] Automated daily backups are configured
- [ ] Backup retention policy is in place (30 days recommended)

## Container Security

- [ ] Containers run as non-root user (Dockerfile uses `USER vidfriends`)
- [ ] Resource limits are set (CPU, memory)
- [ ] `no-new-privileges` security option is enabled
- [ ] All Linux capabilities are dropped except `NET_BIND_SERVICE`
- [ ] Root filesystem is read-only with tmpfs for `/tmp`
- [ ] Image uses a minimal base (`alpine:3.20`)
- [ ] Health check is configured in Dockerfile

## Secrets Management

- [ ] `.env` files are excluded from version control (`.gitignore`)
- [ ] No secrets are hardcoded in docker-compose.yml for production
- [ ] Secrets are injected via environment variables or Docker secrets
- [ ] JWT secret, DB password, and S3 credentials are unique per environment

## Observability

- [ ] Health endpoint is accessible and returns DB status
- [ ] Logs are structured JSON (stdout/stderr)
- [ ] Log level is set to `info` or `warn` in production
- [ ] External uptime monitoring is configured (Pingdom, Better Uptime, etc.)

## Application Security

- [ ] Graceful shutdown is configured (SIGTERM/SIGINT)
- [ ] Read/write timeouts are set on the HTTP server
- [ ] Rate limiting is enforced per user (authenticated) and per IP (unauthenticated)
- [ ] SQL injection is prevented by parameterized queries (pgx)
- [ ] Recovery middleware catches panics gracefully
- [ ] Sensitive error details are not leaked in API responses
