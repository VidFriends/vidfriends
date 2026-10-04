# ADR-0003: Web client stack

- **Status:** Accepted
- **Date:** 2026-10-03
- **Decided by:** Owner. The core stack was chosen by the owner on 2026-10-03. Claude recommended the supporting libraries marked † and the owner approved them.

## Context

Earlier web clients used React with Vite and React Router (2025 `legacy/vidfriends-2025/frontend`) and React with Vite and plain fetch (2026 `legacy/vidfriends-web-2026`). In both, request and response types were written by hand and drifted from the backend (see the [legacy audit](../legacy/AUDIT.md)).

## Decision

| Concern | Choice |
|---|---|
| Language | TypeScript (strict) |
| Framework / build | React + Vite |
| Styling | Tailwind CSS |
| Components | shadcn/ui on Radix UI primitives |
| Server state | TanStack Query |
| Routing | TanStack Router (file-based, type-safe search params) |
| Validation † | Zod. Schemas are shared with the backend and mobile in `packages/contracts`. |
| Forms † | React Hook Form + Zod resolver |
| API client † | Generated from the OpenAPI document (see [ADR-0006](0006-api-contract-first.md)) |
| Testing † | Vitest + Testing Library (unit), Playwright (end-to-end) |

The web app is a single-page app (SPA) served as static files. It is also an installable PWA, which on Android supports receiving shared links through the Web Share Target API.

## Alternatives considered

- **Next.js / Remix (SSR).** Rejected: the app is fully authenticated and gets no SEO benefit, so SSR adds hosting complexity.
- **React Router.** Rejected in favour of TanStack Router, which has stronger type safety and integrates with TanStack Query loaders.

## Consequences

- The web app needs a separate API origin or path, which brings CORS and cookie decisions. Those are covered in the [HLD](../design/HLD.md).
- Accessibility is helped by Radix primitives but must still be verified (NFR-A11Y-*).

## Revisit when

Public, crawlable pages become a requirement.
