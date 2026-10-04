# ADR-0013: Instance pairing through HTTPS join links (QR codes encode the same URL)

- **Status:** Accepted; **amended by [ADR-0014](0014-self-host-only-no-public-instance.md)** (no Universal/App Links, no default domain); amended by [ADR-0018](0018-passkey-only-sign-in.md) (no plain-http pairing)
- **Date:** 2026-10-03
- **Decided by:** Claude under delegation

## Context

In 2026, the web admin rendered a QR code containing only `window.location.origin`, and the iOS app scanned it as a bare server URL. Invites were shared separately as text. The mobile audit recommended a structured payload ([mobile audit §7.1](../legacy/audits/2026-mobile.md)).

## Decision

- **The canonical join artifact is an HTTPS URL:** `https://<instance-host>/join/<invite-code>`. A bare `https://<instance-host>` is also accepted for "connect to server, then log in".
- **QR codes encode exactly that URL.** No custom scheme and no JSON payload, so any phone camera opens it.
- **Web:** `/join/<code>` renders registration with the code prefilled and shows the inviter's display name (`GET /api/v1/invites/<code>/preview`, rate-limited, returning only the inviter's display name and the expiry).
- **Mobile (M6):**
  - Universal Links (iOS) and App Links (Android) are configured **for the default instance's domain only**. App association files cannot cover arbitrary self-hosted domains.
  - For other instances, the user scans the QR code from inside the app (in-app scanner) or pastes the URL. The app derives the base URL, validates it with `GET /api/v1/instance` (FR-PAIR-01), and then continues with registration.
- The base URL is derived from the join URL's origin. Instances served under a path prefix are not supported in v1.

## Alternatives considered

- **`vidfriends://pair?server=…&code=…`.** Camera apps don't open it when the app isn't installed, which is a dead end for new users.
- **Signed JSON payload in the QR.** It adds no security over an HTTPS origin plus a single-use code, and it is not human-readable.

## Consequences

- The instance needs a stable public origin with valid TLS for the smoothest mobile onboarding. LAN-only HTTP instances still work through paste or scan (WF-PAIR-3).
