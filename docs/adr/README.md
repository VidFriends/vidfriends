# Architecture Decision Records

These records follow the rules in [ADR-0001](0001-record-architecture-decisions.md):

- Files are numbered `NNNN-kebab-title.md`.
- An ADR is never rewritten after acceptance. To change a decision, add a new ADR and mark the old one `Superseded by ADR-XXXX`.
- Every ADR says whether the **owner** decided it or whether **Claude decided it under delegation**.

| ADR | Title | Status | Decided by |
|---|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions; one canonical document set | Accepted | Claude (delegated) |
| [0002](0002-consolidate-repos-and-greenfield-reset.md) | Consolidate all restarts into one repo; greenfield reset | Accepted | Owner |
| [0003](0003-web-client-stack.md) | Web client stack | Accepted | Owner (+ Claude for supporting libraries) |
| [0004](0004-mobile-expo.md) | Mobile with Expo instead of native apps | Accepted | Owner (accepted Claude's recommendation) |
| [0005](0005-instance-model.md) | Single-tenant, self-hostable, invite-only instances | Accepted; superseded in part by 0014 | Claude (delegated) |
| [0006](0006-api-contract-first.md) | Zod contracts → generated OpenAPI | Accepted | Claude (delegated) |
| [0007](0007-backend-stack.md) | Node + Hono + Postgres + Drizzle + pg-boss | Accepted | Claude (delegated) |
| [0008](0008-authentication-sessions.md) | Opaque DB sessions; cookie (web) / bearer (mobile) | Accepted | Claude (delegated) |
| [0009](0009-media-ingestion-and-storage.md) | Media via durable jobs; private S3 + presigned URLs | Accepted (risk accepted by owner); superseded in part by 0015 | Claude (delegated) |
| [0010](0010-share-centric-social-model.md) | Share-centric social model; no global feed | Accepted | Claude (delegated) |
| [0011](0011-notifications.md) | In-app + Web Push + Expo Push; polling | Accepted | Claude (delegated) |
| [0012](0012-monorepo-and-tooling.md) | pnpm/Turborepo monorepo layout and tooling | Accepted | Claude (delegated) |
| [0013](0013-instance-pairing-and-join-links.md) | HTTPS join links; QR encodes the same URL | Accepted; amended by 0014 | Claude (delegated) |
| [0014](0014-self-host-only-no-public-instance.md) | Self-host only; no public or default instance; no project domain | Accepted | Owner |
| [0015](0015-bundled-object-store-seaweedfs.md) | Bundle SeaweedFS instead of MinIO; serve `/<bucket>/` unrewritten | Accepted; supersedes part of 0009 | Claude (delegated) |
| [0016](0016-accepted-residual-security-risks-v0-1.md) | Accept unproxied yt-dlp redirects (optional egress proxy) and operator data access for v0.1 | Accepted | Claude (delegated) |

**Template for new ADRs:** use the header fields Status, Date, Decided by and Supersedes, then the sections Context, Decision, Alternatives considered, Consequences, and Revisit when.
