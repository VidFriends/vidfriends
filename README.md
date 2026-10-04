# VidFriends

**A private "For You" page made only of videos your friends sent you.** Paste or share a short-form video link (TikTok, Reels, Shorts, …), pick friends, and they watch it in one vertical feed, react, and reply. There are no ads, no strangers, and no tracking. It runs on an invite-only server operated by someone you trust.

## Status

**Planning complete; implementation not started.** This repository consolidates seven earlier attempts (2025–2026). Their code was removed and preserved under the git tag `legacy-code-snapshot`. Development restarts from scratch.

- Plan and status: [docs/ROADMAP.md](docs/ROADMAP.md)
- Agent and contributor rules: [AGENTS.md](AGENTS.md)
- Requirements: [BRD](docs/requirements/BRD.md) · [PRD](docs/requirements/PRD.md) · [FRD](docs/requirements/FRD.md) · [SRS](docs/requirements/SRS.md)
- Design: [HLD](docs/design/HLD.md) · [SDD](docs/design/SDD.md) · [TDD](docs/design/TDD.md) · [LLD](docs/design/LLD.md) · [ADRs](docs/adr/README.md)
- History: [legacy audit](docs/legacy/AUDIT.md)

## Planned stack

- **Web:** React, Vite, TypeScript, Tailwind, shadcn/ui, TanStack Query and Router.
- **Mobile:** Expo.
- **Server:** Node, Hono, PostgreSQL, Drizzle, pg-boss.
- **Media:** yt-dlp and ffmpeg.
- **Storage:** S3-compatible.
- **Deployment:** Docker Compose with Caddy.
