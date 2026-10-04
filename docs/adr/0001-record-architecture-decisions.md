# ADR-0001: Record architecture decisions and keep one canonical document set

- **Status:** Accepted
- **Date:** 2026-10-03
- **Decided by:** Claude (delegated architect), under the owner's instruction to create a single authoritative plan
- **Supersedes:** none

## Context

VidFriends has been restarted at least four times across seven repositories (see [legacy audit](../legacy/AUDIT.md)). Each restart wrote its own README, roadmap, or review notes. None of them stayed authoritative: the 2025 `ROADMAP_TODO.md` described a Go + React monolith, while the 2026 repos were tracked by `VID-*` tickets in an external tracker that this repository cannot reach. The decisions behind each restart were mostly not written down, so each one started again from nothing.

## Decision

1. `docs/ROADMAP.md` is the only canonical plan for scope, priorities, sequencing, and completion criteria.
2. Requirements have exactly one canonical home: `docs/requirements/SRS.md`, with stable IDs (`FR-*`, `NFR-*`). Other documents refer to those IDs instead of restating them.
3. Significant architectural decisions are recorded as numbered ADRs in `docs/adr/`. ADRs are never rewritten after acceptance. To change one, write a new ADR that supersedes it, then update the old ADR's status line to point to the new one.
4. Every ADR states who made the decision: the owner, or Claude acting under delegation.

## Alternatives considered

- **Wiki or external tracker as the source of truth.** Rejected: earlier `VID-*` tickets are no longer reachable from the code, and that history was lost.
- **One large design document.** Rejected: it mixes business, product, and technical concerns, and its sections fall out of date at different rates.

## Consequences

- Agents must read `AGENTS.md` and then `docs/ROADMAP.md` before planning work. Both are enforced by convention.
- Some content is split across files, so cross-links have to be maintained.

## Revisit when

The team adopts a tracker that integrates with the repository and can hold requirement traceability.
