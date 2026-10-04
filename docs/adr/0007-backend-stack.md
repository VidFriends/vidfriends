# ADR-0007: Backend stack: Node.js + Hono + PostgreSQL + Drizzle + pg-boss, with a separate worker process

- **Status:** Accepted. Note (2026-10-04): the bundled S3 store named under Testing is now SeaweedFS ([ADR-0015](0015-bundled-object-store-seaweedfs.md)).
- **Date:** 2026-10-03
- **Decided by:** Claude under delegation. The owner fixed the client stack ([ADR-0003](0003-web-client-stack.md), [ADR-0004](0004-mobile-expo.md)) but not the backend.

## Context

- Every earlier backend was Go: the 2025 vidshare and vidfriends backends and the 2026 backend. None reached a working end-to-end state. The failures were contract drift, missing authorization, and dead background work. None were caused by Go itself.
- The clients are now TypeScript on web and mobile. Sharing schemas removes the main source of drift ([ADR-0006](0006-api-contract-first.md)).
- Requirements: self-hostable containers ([ADR-0005](0005-instance-model.md)); long-running media jobs (yt-dlp, ffmpeg); durable jobs (NFR-REL-01); small-scale load (≤ 50 users per instance, proposed).

## Decision

| Concern | Choice |
|---|---|
| Runtime | Node.js 24 LTS, TypeScript strict, ESM |
| HTTP framework | Hono (with `@hono/node-server`), routes from `@hono/zod-openapi` |
| Database | PostgreSQL 16+ |
| Data access and migrations | Drizzle ORM with drizzle-kit SQL migrations (forward-only, reviewed SQL committed) |
| Background jobs | **pg-boss** (PostgreSQL-backed queue: retries, backoff, cron schedules, singleton jobs) |
| Processes | One image with two entrypoints: `server` (HTTP API + static web app) and `worker` (jobs: fetch, process, notify, retention, sweeper). Small installs may run both in one container with `ROLE=all`. |
| Media tools | yt-dlp (pinned; worker image only), ffmpeg/ffprobe |
| Object storage | Any S3-compatible service through the AWS SDK v3 ([ADR-0009](0009-media-ingestion-and-storage.md)) |
| Password hashing | argon2id (`@node-rs/argon2`) |
| Logging and metrics | pino (JSON) and prom-client |
| Testing | Vitest. API integration tests run against real PostgreSQL and MinIO via Testcontainers or the dev compose stack. |

## Alternatives considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| Go (net/http + pgx + River) | Single static binary, strong concurrency, team history | No shared types with TS clients. Contracts would need OpenAPI-to-TS codegen, a second language for agents, and previously drifted. | Credible runner-up |
| Cloudflare Workers + D1 + R2 | Free tier, the owner's 2025 intent, the owner uses it elsewhere | Not self-hostable. Cannot run yt-dlp or ffmpeg. | Rejected (ADR-0005) |
| NestJS / Fastify | Mature | Heavier (Nest), or no first-class Zod-to-OpenAPI route model (Fastify needs extra plugins) | Rejected for simplicity |
| BullMQ + Redis | Popular | Adds Redis to every self-hosted install | Rejected: PostgreSQL is already present |
| Prisma | Popular ORM | Heavier runtime engine. SQL migrations less transparent. | Drizzle preferred |

## Consequences

- One language across the monorepo ([ADR-0012](0012-monorepo-and-tooling.md)).
- The worker container needs Python (for yt-dlp) and ffmpeg. The server image can stay slim if the images are split. The proposed layout is one Dockerfile with `server` and `worker` targets.
- CPU-heavy transcoding is bounded by worker concurrency (NFR-PERF-03).

## Revisit when

- Profiling shows Node cannot meet NFR-PERF targets on the reference host, or
- a non-TypeScript client becomes primary.
