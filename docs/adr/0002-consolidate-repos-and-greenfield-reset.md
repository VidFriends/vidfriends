# ADR-0002: Consolidate all restarts into one repository and reset to greenfield

- **Status:** Accepted
- **Date:** 2026-10-03
- **Decided by:** Owner (explicit instruction: "merge them all into one cohesive project… remove all code… we will start code greenfield"). Claude chose the mechanics.

## Context

Seven repositories contain overlapping attempts at the same product. The [legacy audit](../legacy/AUDIT.md) inventories them:

| Origin repo | Era | Imported to (in tag `legacy-code-snapshot`) |
|---|---|---|
| `zemdregon/vidshare` (now `VidFriends/vidshare`) | 2025 | `legacy/vidshare-2025/` |
| `zemdregon/vidfriends` (now `VidFriends/vidfriends`, this repo) | 2025 | `legacy/vidfriends-2025/` |
| `VidFriends/vidfriends-backend` | 2026 | `legacy/vidfriends-backend-2026/` |
| `VidFriends/vidfriends-web` | 2026 | `legacy/vidfriends-web-2026/` |
| `VidFriends/vidfriends-ios` | 2026 | `legacy/vidfriends-ios-2026/` |
| `VidFriends/vidfriends-android` | 2026 | `legacy/vidfriends-android-2026/` |
| `VidFriends/VidFriends-iOS-Android` | 2026 | `legacy/vidfriends-ios-android-2026/` |

## Decision

- `VidFriends/vidfriends` is the single project repository.
- The full history of every repo was merged in under `legacy/<name>/`. Original commits stay reachable through `git log`.
- The annotated tag **`legacy-code-snapshot`** marks the last commit that contains all legacy code. Unmerged work that existed nowhere else is tagged `legacy/vidfriends-android-2026/vid-503-fix`.
- The next commit removed all code. The repository now holds design documentation only, and implementation restarts greenfield against [docs/ROADMAP.md](../ROADMAP.md).
- Legacy code is **reference only**. Do not copy it forward without checking it against the SRS. Its known defects are listed in the audit.

## Alternatives considered

- **Pick the most complete restart and continue it.** Rejected by the owner. The audit also found that no restart had a coherent client and backend contract.
- **Keep seven repos and archive six.** Rejected: plans would keep fragmenting, and cross-repo history would be lost.

## Consequences

- To read old code: `git checkout legacy-code-snapshot -- legacy/<name>`, or browse the tag on GitHub.
- The other six repositories are now redundant. Archiving them is recommended and is an owner action (see the roadmap, M0).
- Open Dependabot PRs on the old repos no longer apply.
