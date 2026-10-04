# ADR-0008: Opaque server-side sessions (cookie for web, bearer for mobile), not JWTs

- **Status:** Accepted
- **Date:** 2026-10-03
- **Decided by:** Claude under delegation

## Context

The earlier attempts got authentication wrong in several ways ([L-13](../legacy/AUDIT.md#4-lessons-referenced-by-id-from-the-design-docs), [L-17](../legacy/AUDIT.md#4-lessons-referenced-by-id-from-the-design-docs)):

- The 2026 backend accepted refresh JWTs as access tokens, trusted the stale `role` claim inside the JWT, and had a no-op logout. Suspension was never enforced.
- The 2025 vidfriends access token was decorative: it was never checked.
- Clients stored tokens in `localStorage` or in plaintext.

The requirements are immediate revocation on suspension and logout (FR-AUTH-05/06) at small scale, where one indexed database lookup per request is cheap.

## Decision

- **Session:** a random 256-bit token. Only `sha256(token)` is stored in the `sessions` table, with `user_id`, `client` (`web` or `mobile`), user agent, creation time, last-seen time, idle expiry and absolute expiry.
- **Every request** looks up the session by hash, checks expiry, and joins the user's `status` and `role`. Both come from the database, never from the token. `last_seen` is updated at most once per 5 minutes.
- **Web:** the token is sent in a `vf_session` cookie with `HttpOnly; Secure; SameSite=Lax; Path=/`. Because the API and the SPA share an origin, there is no CORS. CSRF defence uses an Origin/Referer check plus a double-submit `vf_csrf` token header on unsafe methods.
- **Mobile:** the token is returned in the login response body and sent as `Authorization: Bearer`. It is stored in expo-secure-store (Keychain/Keystore). There is no refresh token: the session is sliding (BR-SES-1). A 401 response sends the app back to the login screen.
- **Revocation:** delete the session rows (logout, suspension, password change, and the rest of BR-SES-2).
- **Passkeys** (post-v1, CAP-16) are added as another credential type. They issue the same session.

## Alternatives considered

- **JWT access + refresh tokens.** Rejected: revocation needs a database check anyway, the design is more complex, and the legacy implementation shows the pitfalls.
- **Third-party identity provider (OIDC).** Rejected: an operator dependency (BC-6), and overkill for a friends-only instance.
- **Lucia or Better Auth libraries.** Lucia is deprecated as a library. Better Auth is credible but brings its own schema and plugins. The mechanism here is small enough to own. Reconsider adopting Better Auth when adding passkeys.

## Consequences

- One indexed read per request (`sessions.token_hash` is the primary key). This is acceptable at the target scale.
- Horizontal scaling remains possible, because sessions live in the database.
