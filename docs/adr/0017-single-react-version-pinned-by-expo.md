# ADR-0017: One React version for the whole monorepo, set by the Expo SDK

- **Status:** Accepted
- **Date:** 2026-10-04
- **Decided by:** Claude under delegation (cross-cutting dependency pattern, M6-T1)
- **Supersedes:** none. Refines [ADR-0004](0004-mobile-expo.md) and [ADR-0012](0012-monorepo-and-tooling.md).

## Context

- The mobile app ([ADR-0004](0004-mobile-expo.md)) shares `packages/contracts` and
  `packages/api-client` (whose React hooks take `react` as a peer) with the web app.
- React Native's renderer requires the exact React version it was released with. Expo SDK 57
  ships React Native 0.86 with React 19.2.3. The web app was on React 19.3.0.
- Expo's monorepo guide states that duplicate React versions in one app cause runtime errors and
  that duplicate React Native versions in one monorepo are unsupported. With pnpm, a shared package
  resolves `react` from its own dependency tree, so two versions in the workspace would put two
  copies into the mobile bundle.

## Decision

1. The monorepo uses exactly one `react` and `react-dom` version: the one the current Expo SDK
   pins. It is enforced with `overrides` in `pnpm-workspace.yaml`, and the web app, `api-client`
   and the mobile app declare the same exact version.
2. React upgrades follow Expo SDK upgrades. Dependabot updates to `react`, `react-dom` or
   `@types/react` that run ahead of the SDK are declined until the SDK moves.

## Alternatives considered

| Option | Verdict |
|---|---|
| Separate React versions per app, isolated with Metro resolver rules | Fragile: every shared package needs custom resolution; Expo documents it as unsupported. |
| Keep the mobile app outside the workspace | Loses the shared contracts and hooks that ADR-0004 and ADR-0006 rely on. |
| Pin React Native to a version matching the web's React | No Expo SDK release offers that combination. |

## Consequences

- The web app moved from React 19.3.0 to 19.2.3 (no 19.3-only APIs were in use; build, tests and
  E2E unchanged).
- Upgrading React is a joint web and mobile change, done when bumping the Expo SDK.

## Revisit when

- Expo supports isolated React versions per app in a monorepo, or the mobile app moves out of the
  workspace.
