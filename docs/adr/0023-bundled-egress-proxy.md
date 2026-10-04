# ADR-0023: Bundled, optional egress proxy for link downloads

- **Status:** Accepted
- **Date:** 2026-10-04
- **Decided by:** Owner scheduled the bundled egress proxy (multiple-choice answer, 2026-10-04).
  Mechanism: Claude under delegation.
- **Supersedes:** item 1 of [ADR-0016](0016-accepted-residual-security-risks-v0-1.md) in part:
  operators no longer have to bring their own proxy, though `FETCH_PROXY_URL` still accepts one.
  Redirects remain unconfined by default, so the rest of ADR-0016 stands.

## Context

- yt-dlp follows redirects inside its own process. The app checks the link and its resolved
  addresses before starting yt-dlp (BR-MED-1, NFR-SEC-05), but it cannot see later hops. That is
  the residual risk ADR-0016 accepted.
- `FETCH_PROXY_URL` already sends every yt-dlp request through a proxy, but the operator had to
  find, configure and patch one (the runbook suggested Smokescreen). ADR-0016 rejected bundling a
  third-party proxy image because it is one more image to keep patched.
- The server already has a vetted check for private, loopback, link-local, CGNAT, multicast and
  IPv4-mapped addresses (`isPublicAddress`).

## Decision

1. **A small forward proxy in our own code** (`apps/server/src/egress/proxy.ts`), started as
   `node dist/egress-proxy.js` from the server image. That image is already built and pinned, so
   there is no new third-party image to patch.
   - It handles `CONNECT` tunnels (https) and absolute-form plain-http requests.
   - It resolves the host and refuses the request unless **every** address is public, using the
     same `isPublicAddress` rule as the app.
   - It connects to the address it checked, so a second DNS answer cannot change the target.
   - It allows only ports 80 and 443 (`EGRESS_ALLOWED_PORTS`).
   - It logs host, port and verdict only, never paths or queries.
2. **Optional compose profile** `egress-proxy`. The operator turns it on with
   `COMPOSE_PROFILES=egress-proxy` and `FETCH_PROXY_URL=http://egress-proxy:3128`. The worker
   waits for its health check when the profile is on. The container is read-only, drops all
   capabilities, has `no-new-privileges` and is limited to 128 MB.
3. Defaults are unchanged: without the profile, behaviour is exactly as in ADR-0016.

## Alternatives considered

| Option | Why not |
|---|---|
| Bundle Smokescreen or Squid | A third-party image to pin and patch, plus its own ACL format; ours reuses the tested address rule. |
| Network isolation of the worker (internal network only) | The worker also sends push notifications to arbitrary push services; isolating it would need every outbound path proxied. Possible later. |
| On by default | ADR-0016's reasoning holds for small installs: one more container for a low-likelihood path. Revisit with its trigger. |

## Consequences

- A hardened install closes the redirect residual risk with two lines in `.env`.
- The proxy only guards yt-dlp (and the ffmpeg it starts for segmented downloads, which yt-dlp
  points at the same proxy). Other outbound traffic (push services) keeps its own guards
  (ADR-0020's egress guard, fixed provider hosts).
- New process to keep reviewed: `apps/server/test/egress-proxy.test.ts` covers tunnelling,
  forwarding, refusals without a connection attempt, ports and logging.

## Revisit when

- ADR-0016's trigger fires (an open-redirect or SSRF report against a supported site): then make
  the profile the default.
