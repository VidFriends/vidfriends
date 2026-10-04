# ADR-0006: One API contract, defined with Zod and published as OpenAPI

- **Status:** Accepted
- **Date:** 2026-10-03
- **Decided by:** Claude under delegation

## Context

Contract drift was the most common failure across every restart ([L-01](../legacy/AUDIT.md#4-lessons-referenced-by-id-from-the-design-docs)):

- Clients read `{token}` while the server returned `access_token`.
- Fields were PascalCase on one side and camelCase on the other.
- Clients called collections routes that did not exist.
- The three mobile clients used two incompatible dialects.
- A hand-maintained `openapi.yaml` fell out of date.

## Decision

- `packages/contracts` (TypeScript) defines every request, response and error schema with **Zod**, together with the route definitions (method, path, auth requirement).
- The server registers routes **from** these definitions, using `@hono/zod-openapi`. Requests are validated and responses are typed against the same schemas.
- The OpenAPI 3.1 document is **generated** at build time and committed (`packages/contracts/openapi.json`). CI fails if the committed copy is stale. Non-TypeScript consumers (or a future native client) generate clients from it.
- The web and mobile apps use a thin typed client in `packages/api-client`, built from the same route definitions, plus TanStack Query hooks in the same package.
- Wire conventions:
  - JSON field names are `snake_case`.
  - IDs are UUIDv7 strings.
  - Timestamps are RFC 3339 UTC strings.
  - Errors use `{"error": {"code", "message", "details?"}}` with stable machine codes.
  - Cursor pagination uses `{"items", "next_cursor"}`.
  - The version prefix is `/api/v1`.
- Contract tests: the API integration suite asserts that every documented route exists and that its responses validate against the schemas.

## Alternatives considered

- **Hand-written OpenAPI, then code generation for server and clients.** Rejected: YAML-first authoring tends to drift (legacy evidence), and server stubs generated from a spec are awkward in TypeScript.
- **tRPC.** Rejected: it does not naturally produce a public, versioned REST contract for self-hosters and third-party clients, and it ties the transport to TypeScript.
- **GraphQL.** Rejected: unnecessary complexity for a small CRUD-plus-feed API.

## Consequences

- The backend must be TypeScript ([ADR-0007](0007-backend-stack.md)).
- Schema changes are breaking or non-breaking by inspection. Breaking changes require `/api/v2` or a compatibility window, and older mobile builds must keep working within the same major version.
