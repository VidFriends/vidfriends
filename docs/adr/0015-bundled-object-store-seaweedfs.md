# ADR-0015: Bundle SeaweedFS (not MinIO) as the default S3-compatible store; serve media at `/<bucket>/` without path rewriting

- **Status:** Accepted
- **Date:** 2026-10-04
- **Decided by:** Claude under delegation (infrastructure choice inside [ADR-0009](0009-media-ingestion-and-storage.md)'s "any S3-compatible service")
- **Supersedes in part:** [ADR-0009](0009-media-ingestion-and-storage.md), only the sentences naming **MinIO** as the bundled default and describing the `/media-store` prefix as *stripped* by the proxy. Everything else in ADR-0009 stands: private bucket, presigned URLs with TTL ≤ 15 min, Range support, durable jobs, any S3-compatible backend by configuration.

## Context

- ADR-0009, the HLD and TDD §6 assumed MinIO as the bundled object store, with a `minio-init` one-shot container.
- On 2026-10-04, `minio/minio`, `minio/mc`, `quay.io/minio/minio` and `bitnami/minio` could not be pulled (MinIO stopped publishing community images). A self-hostable product cannot depend on an image operators cannot download (BO-4, NFR-OPS-01).
- TDD §6 routed `/media-store/*` to the store "with the prefix stripped" and presigned against `https://<domain>/media-store`. That cannot work with AWS SigV4: the signature covers the request path, so a proxy that rewrites the path invalidates every presigned URL. Verified locally: a presigned URL is only accepted when the path the store sees equals the path that was signed.

## Decision

1. The bundled store is **SeaweedFS** (`chrislusf/seaweedfs`, Apache-2.0) running `weed server -s3` as a single container. Its S3 gateway supports SigV4 presigned PUT/GET, HTTP Range (206) and private buckets (anonymous reads return 403). This was verified with the AWS SDK v3 on 2026-10-04.
2. The default **bucket name is `media-store`**, and presigned URLs use **path-style** addressing against `S3_PUBLIC_ENDPOINT = PUBLIC_URL`. A media URL therefore looks like `https://<host>/media-store/media/<id>/main.mp4?X-Amz-…`.
3. Caddy routes `/media-store/*` to the store **unchanged** (no prefix stripping) and preserves the `Host` header, so the signature computed for the public origin validates at the store. Clients never see internal hostnames (L-10).
4. The server creates the bucket at startup if it does not exist (`HeadBucket` → `CreateBucket`), which replaces the `minio-init` container. Credentials come from `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`; the SeaweedFS container writes its identity file from the same variables at start, so no secret is committed (L-06).
5. The S3 client sets `requestChecksumCalculation` and `responseChecksumValidation` to `WHEN_REQUIRED`. Recent AWS SDK versions otherwise embed CRC32 checksums in presigned PUT URLs, which non-AWS stores reject.
6. External S3, R2 or B2 remain supported by configuration (`S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_BUCKET`), exactly as ADR-0009 describes. In that case the `/media-store` route and the SeaweedFS container are dropped.

## Alternatives considered

| Option | Verdict |
|---|---|
| Keep MinIO and ask operators to build the image from source | Rejected: adds a build step to every install, against BO-4. |
| Garage (`dxflrs/garage`) | Credible and pullable, but needs a layout-assignment and key-creation bootstrap through its admin CLI before first use, and is AGPL. More moving parts than SeaweedFS for the same features. |
| RustFS | Pullable and MinIO-compatible, but young (pre-1.0) at decision time. Revisit later. |
| Separate media subdomain (no path prefix) | Works with SigV4, but forces every operator to add a second DNS name and certificate. Rejected for onboarding friction. |

## Consequences

- HLD §3, TDD §6 and the compose files say SeaweedFS instead of MinIO, and the `/media-store` route is not stripped.
- The service worker must never handle `/media-store/*` navigations (already a TDD §4 rule).
- Operators who rename the bucket must also change the Caddy route to `/<bucket>/*`.

## Revisit when

- MinIO (or another simpler store) publishes maintained images again, or
- SeaweedFS's S3 compatibility regresses for presigned URLs or Range requests (covered by the M2-T3 and M3-T6 API tests).
