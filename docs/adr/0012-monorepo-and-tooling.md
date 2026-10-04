# ADR-0012: pnpm-workspace monorepo layout and tooling

- **Status:** Accepted
- **Date:** 2026-10-03
- **Decided by:** Claude under delegation. The single-repository direction was decided by the owner ([ADR-0002](0002-consolidate-repos-and-greenfield-reset.md)).

## Decision

```
vidfriends/
├── apps/
│   ├── server/        # Hono API + worker entrypoints, Drizzle schema & migrations
│   ├── web/           # React + Vite SPA (ADR-0003), built into server image
│   └── mobile/        # Expo app (ADR-0004) — created in M6
├── packages/
│   ├── contracts/     # Zod schemas, route defs, generated openapi.json (ADR-0006)
│   ├── api-client/    # typed fetch client + TanStack Query hooks (web & mobile)
│   ├── config/        # shared tsconfig, eslint, prettier presets
│   └── test-utils/    # factories, API test harness, authz matrix helper
├── e2e/               # Playwright specs (web) — Maestro flows added in M6
├── deploy/            # compose files, Caddyfile, .env templates, runbooks
├── docs/              # this documentation set
└── AGENTS.md
```

**Tooling:**

- **Workspace:** pnpm workspaces, with Turborepo for cached `build`, `typecheck`, `lint` and `test` pipelines.
- **Language:** TypeScript strict with `noUncheckedIndexedAccess`.
- **Lint and format:** ESLint (flat config, typescript-eslint, react-hooks, jsx-a11y) and Prettier.
- **Tests:** Vitest (unit and API), Playwright (web E2E), Maestro (mobile E2E, M6).
- **CI:** GitHub Actions on PRs and `main`. Branch protection on `main` requires a green CI run.
- **Dependency updates:** Renovate or Dependabot with grouped minor and patch updates. Never more than 5 open PRs.
- **Versioning:** Changesets for release notes. Images are tagged `vX.Y.Z` on GHCR.
- **Default branch:** `main`. The legacy `master` versus `main` confusion broke CI before ([backend audit §8.4](../legacy/audits/2026-backend.md)).

## Alternatives considered

- **Nx.** More powerful but heavier.
- **Separate repos per app.** That is exactly what caused the drift.

## Consequences

- Mobile and web share `packages/*`. React Native's Metro bundler needs workspace-aware config (Expo SDK 52+ supports monorepos).
