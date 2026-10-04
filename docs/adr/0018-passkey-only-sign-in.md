# ADR-0018: Passkey-only sign-in; no passwords

- **Status:** Accepted
- **Date:** 2026-10-04
- **Decided by:** Owner (multiple-choice answers, 2026-10-04: passkeys only with no passwords;
  HTTPS on a domain required; recovery by admin link plus a server command; mobile sign-in by
  browser hand-off). Mechanism details: Claude under delegation.
- **Supersedes:** the password parts of [ADR-0008](0008-authentication-sessions.md) (sessions,
  cookies, bearer tokens and revocation stay as decided there). Amends
  [ADR-0013](0013-instance-pairing-and-join-links.md) (no plain-http pairing).

## Context

- Members sign in with a username and password (FR-AUTH-03/04). There is no email (NFR-PRIV-03),
  so a forgotten password needs an admin-issued reset link (WF-ADM-4).
- The owner chose passkeys (WebAuthn discoverable credentials) as the **only** credential.
  Passkeys resist phishing and credential stuffing, and remove password storage.
- WebAuthn has hard constraints:
  - It works only in a secure context, and the relying-party ID must be a registrable domain,
    never an IP address. Plain-http home-network servers (allowed with a warning by WF-PAIR-3)
    cannot use passkeys.
  - Native passkeys in an app need the app to be associated with the domain. iOS requires each
    domain in the app's entitlements at build time. With self-hosted servers on arbitrary
    domains ([ADR-0014](0014-self-host-only-no-public-instance.md)), a store app cannot list them.

## Decision

1. **Credential.** WebAuthn discoverable credentials (resident keys) with user verification
   required, verified with `@simplewebauthn/server`. The relying-party ID is the host name of
   `PUBLIC_URL` and the expected origin is its origin. Members can hold several passkeys (one
   per device or password manager) and name them. Passwords, password hashes, the password
   routes and the common-password list are removed.
2. **Challenges** are random, single-use, stored as hashes with a purpose and a 5-minute expiry.
3. **Flows.**
   - **Setup** (FR-AUTH-01): the setup token plus a username and display name start a passkey
     registration that creates the first admin.
   - **Join** (FR-AUTH-02): a valid invite plus a username and display name start a passkey
     registration that creates the member.
   - **Sign in:** no username is typed. The browser offers the device's passkeys for this server;
     the assertion identifies the member. Suspended accounts are refused (FR-AUTH-06).
   - **Manage passkeys:** members add, rename and remove passkeys in Settings. The last one cannot
     be removed.
   - **Sensitive actions** (account deletion, removing a passkey) need a fresh passkey
     assertion instead of password re-entry.
4. **Recovery.** An admin creates a single-use recovery link (24 h), replacing the password-reset
   link. Registering a passkey through it **removes the account's other passkeys and sessions**,
   because the usual reason is a lost device. A locked-out admin is recovered by the operator:
   `docker compose exec server node dist/main.js recovery-link <username>` prints such a link to
   the terminal (never to the logs).
5. **HTTPS on a domain is required.** In production the server refuses to start unless
   `PUBLIC_URL` is `https://` with a domain name (`localhost` stays allowed for trials). Apps no
   longer pair with plain-http servers.
6. **Mobile sign-in by browser hand-off** (OAuth-style, PKCE). The app opens
   `PUBLIC_URL/app-auth` in the system's secure browser sheet with a random `state` and a
   `code_challenge` (S256). The page runs sign-in, join or recovery with the phone's passkeys,
   then redirects to the fixed `vidfriends://auth` callback with a one-time code (60 s, single
   use, bound to the challenge). The app exchanges code and verifier for its bearer session
   (ADR-0008). Only that callback is allowed, so the page is not an open redirect.
7. **Sessions** are unchanged ([ADR-0008](0008-authentication-sessions.md)): a passkey sign-in
   issues the same cookie or bearer session.

## Alternatives considered

| Option | Verdict |
|---|---|
| Keep passwords and add passkeys | Rejected by the owner: passkeys only. |
| Passwords only on plain-http LAN servers | Offered; the owner chose HTTPS everywhere. |
| Recovery codes per member | Offered; the owner chose the admin link plus server command. |
| Native passkeys in the app (Android Credential Manager with per-server asset links) | Works on Android only; iOS cannot list self-hosted domains. The owner chose the hand-off. |
| Better Auth (suggested for passkeys in ADR-0008) | Brings its own schema and session model; the WebAuthn part is small with SimpleWebAuthn, and sessions stay as designed. |

## Consequences

- No password storage, reset tokens or argon2 dependency; less to leak or brute-force. Rate
  limits stay on the sign-in endpoints (NFR-SEC-06).
- Every server needs a domain and HTTPS; the runbook already sets this up with Caddy. Trials on
  one machine keep working on `localhost`.
- A member who loses all passkeys needs an admin; a sole admin needs shell access to the server.
- Tests use software authenticators: SimpleWebAuthn-compatible fake credentials in API tests and
  Chromium's virtual authenticator in Playwright. The mobile hand-off is tested at the API and in
  the app's unit tests; real-phone passkey use is a device check (with M6-T5's).
- Requirements change: FR-AUTH-01..04, FR-ACCT-02/03, FR-ADM reset link, FR-PAIR-03, WF-PAIR-3,
  NFR-SEC-02 and NFR-PRIV-03 (see the SRS change log).

## Revisit when

- Browsers allow passkeys on IP addresses or private networks.
- The apps are in the stores with a fixed set of domains (native passkeys become possible).
