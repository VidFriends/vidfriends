# ADR-0016: Accept two residual security risks for v0.1 (unproxied yt-dlp redirects; operator can read all data)

- **Status:** Accepted; item 1 partly superseded by [ADR-0023](0023-bundled-egress-proxy.md) (a bundled, optional egress proxy)
- **Date:** 2026-10-04
- **Decided by:** Claude under delegation (M5-T7 security review; owner may override at M5-T9 sign-off)
- **Supersedes:** none. Records the M5 revisit that [TDD §5](../design/TDD.md#5-security-engineering) asked for.

## Context

TDD §5 listed two residual risks to revisit at M5. The M5-T7 review
([report](../reports/2026-10-04-m5-load-and-security-review.md)) re-examined both after fixing what
it found:

1. **yt-dlp follows redirects.** The server validates the submitted link (allowlist, public DNS,
   `--` before the URL, NFR-SEC-05), but yt-dlp itself may follow an HTTP redirect from an
   allowlisted site to any host the worker can reach. The review found the worst target, the
   unauthenticated SeaweedFS master/volume/filer APIs, reachable from the worker and fixed it by
   binding them to loopback. What remains reachable without a proxy: the API container (needs a
   session; returns nothing useful), and hosts on the operator's own network or a cloud metadata
   endpoint, whose responses are not video and are discarded by ffprobe content sniffing
   (NFR-SEC-08). Exploitation also needs an open redirect on one of the allowlisted platforms that
   yt-dlp's extractor would follow.
2. **The operator can read all data.** Videos, notes and conversations are stored unencrypted at
   rest on the operator's server; admins cannot read them through the API (BR-ADM-1), but whoever
   runs the server can read the database and bucket.

## Decision

1. Ship v0.1 with yt-dlp's redirects **not** confined by default. Provide `FETCH_PROXY_URL`
   (passed to yt-dlp as `--proxy` for every request, redirects included) so an operator can route
   fetches through a filtering egress proxy that refuses private, loopback and link-local
   destinations; the runbook describes it. Keep the SeaweedFS internal APIs on loopback.
2. Accept that the operator can read everything. Disclose it plainly in the privacy disclosure
   shown to members (M5-T8) and in the self-hosting guide. End-to-end encryption stays a non-goal
   for v1 (PRD).

## Alternatives considered

| Option | Verdict |
|---|---|
| Bundle an egress proxy (for example Smokescreen) in the default compose | Rejected for v0.1: another always-on container and image to keep patched for a low-likelihood path; revisit if a real open-redirect chain is found. |
| Put the worker on its own network with only S3 and Postgres reachable | Does not help: those are exactly the services it must reach, and SeaweedFS's S3 gateway shares a container with the APIs now bound to loopback. |
| Disable redirects in yt-dlp | Not supported as a general option, and many platform downloads legitimately redirect to CDNs. |
| Encrypt media at rest with per-user keys | Out of scope for v1 (PRD non-goal); the operator would still hold the keys on the same server. |

## Consequences

- An operator who wants defence in depth sets `FETCH_PROXY_URL`; nothing else changes.
- The privacy disclosure must say that the server operator can technically access shared videos
  and conversations.

## Revisit when

- A working open-redirect chain on an allowlisted platform is reported, or the allowlist grows to
  sites with user-controlled redirects: then bundle the egress proxy by default.
- The product moves beyond small trusted groups (BRD): then reconsider encryption at rest.
