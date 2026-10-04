# ADR-0005: Single-tenant, self-hostable instances with invite-only signup

- **Status:** Accepted; **superseded in part by [ADR-0014](0014-self-host-only-no-public-instance.md)** (no owner-run or default instance)
- **Date:** 2026-10-03
- **Decided by:** Claude under delegation, reconciling conflicting legacy intent

## Context

The two eras of the project disagree about hosting (see [AUDIT §3](../legacy/AUDIT.md#3-product-intent-across-eras-reconciled-in-the-brdprd)):

- **2025, owner-written:** one hosted service at `vidfriends.app` on the Cloudflare free tier, privacy-focused.
- **2026, agent-written:** "self-hosted by a trusted friend", invite-only, with mobile apps that pair to a server URL or QR code. The same docs also list `api.vidfriends.ai` as a production server.

Both eras share the same constraints: a private friend circle, low cost, privacy, and no ads.

## Decision

- One deployment equals **one instance** equals **one community**: one database, one storage bucket, and its own admins. There is no multi-tenancy inside a deployment.
- Instances are **self-hostable** with Docker Compose on a small VM or home server. They have no hard dependency on any proprietary SaaS except mobile push relays (BC-6).
- Signup is **invite-only by default**. Open signup is an instance setting.
- The owner runs the first instance (proposed: `vidfriends.app`). Mobile builds may set that instance as the default, so non-technical users never type a URL. Any other instance can be reached by QR or join link ([ADR-0013](0013-instance-pairing-and-join-links.md)).
- There is no federation between instances.

## Alternatives considered

| Option | Why not |
|---|---|
| Multi-tenant SaaS only (2025 direction) | Contradicts the "server run by someone you trust" privacy stance. It adds tenant isolation complexity, and the owner carries all legal and ops burden. |
| Self-host only, with no default instance | Onboarding friction for non-technical friends, and the owner's own circle would still need a server. |
| Federation (ActivityPub-like) | Large complexity and no stated need. |
| Cloudflare Workers + D1 + R2 (2025 stack) | Not self-hostable by typical operators. yt-dlp and ffmpeg cannot run in Workers. |

## Consequences

- The server must run in containers: yt-dlp, ffmpeg and a long-running worker are required ([ADR-0007](0007-backend-stack.md)).
- Mobile apps need runtime-configurable base URLs and pairing.
- The admin console is a core feature, not an afterthought.
- Each operator bears the legal responsibility for their instance (BC-5).

## Revisit when

The owner decides to offer hosted instances for many communities. That would require a tenancy ADR.
