# VidFriends

**A private "For You" page made only of videos your friends sent you.** Paste or share a short-form video link (TikTok, Reels, Shorts, …), pick friends, and they watch it in one vertical feed, react, and reply. There are no ads, no strangers, and no tracking. It runs on an invite-only server operated by someone you trust. MIT licensed.

## Status

Implementation is under way, milestone by milestone. See [docs/ROADMAP.md](docs/ROADMAP.md) for what is done (with evidence) and what is next. Seven earlier attempts (2025–2026) are preserved under the git tag `legacy-code-snapshot`.

- Plan and status: [docs/ROADMAP.md](docs/ROADMAP.md)
- Agent and contributor rules: [AGENTS.md](AGENTS.md)
- Requirements: [BRD](docs/requirements/BRD.md) · [PRD](docs/requirements/PRD.md) · [FRD](docs/requirements/FRD.md) · [SRS](docs/requirements/SRS.md)
- Design: [HLD](docs/design/HLD.md) · [SDD](docs/design/SDD.md) · [TDD](docs/design/TDD.md) · [LLD](docs/design/LLD.md) · [ADRs](docs/adr/README.md)
- Self-hosting: [deploy/](deploy/) (compose stack, [environment reference](deploy/ENV.md))
- History: [legacy audit](docs/legacy/AUDIT.md)

## Repository layout

```
apps/server        Hono API + background worker, Drizzle schema and migrations (ADR-0007)
apps/web           React + Vite SPA, served by the server (ADR-0003)
packages/contracts Zod route definitions → generated openapi.json (ADR-0006)
packages/api-client Typed fetch client + TanStack Query hooks
packages/test-utils API test client and the authorization-matrix harness
packages/config    Shared tsconfig and ESLint presets
e2e                Playwright specs against the production images
deploy             Dockerfile targets' runtime config: compose files, Caddyfile, .env templates
```

## Development

Requirements: Node.js 24 (22.12+ works), pnpm 10 (`corepack enable`), Docker with Compose.

```sh
pnpm install
cp .env.example .env                 # dev-only values
pnpm dev:services                    # PostgreSQL + SeaweedFS (S3) on localhost
pnpm --filter @vidfriends/server build && node apps/server/dist/main.js migrate
pnpm dev                             # API on :8080 (tsx watch) + web on http://localhost:5173
```

Open http://localhost:5173. The server log prints a one-time **setup token** while the instance is unclaimed; paste it on the setup screen to become the admin.

### Tests

```sh
pnpm test        # unit, contract and API integration tests (needs `pnpm dev:services`)
pnpm e2e         # builds the images, starts the production stack on https://localhost:8443, runs Playwright
pnpm e2e:down    # stops the E2E stack and deletes its volumes
```

API tests run against a real PostgreSQL. Each test file clones a migrated template database, so tests are isolated and fast. Point them elsewhere with `TEST_DATABASE_URL` (default `postgres://postgres:postgres@localhost:5432/postgres`). The E2E suite uses Playwright's Chromium; run `pnpm --filter @vidfriends/e2e exec playwright install chromium` once.

### Quality gate

CI runs on every pull request ([.github/workflows/ci.yml](.github/workflows/ci.yml)): build, lint, typecheck, Prettier, OpenAPI drift check, environment-reference drift check, migration immutability, dependency audit, unit/API tests, image builds with Trivy, and the E2E suite. Before pushing, run:

```sh
pnpm build && pnpm lint && pnpm typecheck && pnpm format:check && pnpm test
```

### Changing the API, schema or configuration

- **API:** edit the route definitions in `packages/contracts/src/routes`, implement the handler in `apps/server/src/modules/<area>/routes.ts` (startup fails if a route has no handler), then run `pnpm --filter @vidfriends/contracts gen` and commit `openapi.json`. Every route that takes an id must be added to the authorization matrix (`apps/server/test/authz-matrix.test.ts`).
- **Database:** edit `apps/server/src/db/schema.ts`, run `pnpm --filter @vidfriends/server db:generate`, review the SQL and commit it with the updated `CHECKSUMS`. Never edit a migration after it is merged.
- **Environment variables:** edit `apps/server/src/config/env.ts`, then run `pnpm --filter @vidfriends/server env:docs`.

## License

[MIT](LICENSE)
