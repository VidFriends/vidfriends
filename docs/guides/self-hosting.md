# Self-hosting VidFriends

VidFriends has no central service and no public instance
([ADR-0014](../adr/0014-self-host-only-no-public-instance.md)). Every server is run by someone for
their own circle of friends or family. This guide explains what you are taking on; the step-by-step
procedures are in the [operator runbook](../../deploy/RUNBOOK.md).

## What you run

One Docker Compose stack on one machine ([TDD §6](../design/TDD.md#6-deployment-and-operations)):

| Service | What it does |
|---|---|
| `caddy` | HTTPS (automatic certificates) and the only published ports, 80 and 443 |
| `server` | The API and the web app |
| `worker` | Downloads links with yt-dlp, processes video with ffmpeg, sends notifications, runs maintenance |
| `postgres` | All data except video files |
| `seaweedfs` | Video files, thumbnails and profile pictures (S3-compatible, private) |
| `migrate` | Runs database migrations, then exits |

A 2 vCPU / 4 GB VM comfortably serves 50 active members (the M5 load test measured a p95 of 21 ms,
[report](../reports/2026-10-04-m5-load-and-security-review.md)). Disk is the real constraint: plan
for roughly 10–30 MB per short video kept (Assumption: 1080p H.264 clips under a minute), plus
backups on a separate disk.

## Before you start

- **A domain name** pointing at the machine, with ports 80 and 443 open, so Caddy can get a
  certificate. The mobile apps and Web Push need HTTPS.
- **Your responsibility as operator.** You can technically read everything stored on the server,
  including videos and private conversations (ADR-0016). Members are told this in the privacy page
  (`/privacy`) on your server. Only invite people who trust you, and keep the machine, its backups
  and `deploy/.env` private.
- **Legal.** You decide which sites members can fetch videos from (Admin → Settings → allowed
  sites). Downloading may conflict with a site's terms in your jurisdiction; turning off
  "Download videos from links" makes every link a link-only card.

## Install, upgrade, back up

Follow the [runbook](../../deploy/RUNBOOK.md):

1. [Install on a fresh VM](../../deploy/RUNBOOK.md#1-install-on-a-fresh-vm) (about 15 minutes,
   most of it installing Docker and downloading images).
2. [Set up nightly backups](../../deploy/RUNBOOK.md#3-backup) before inviting anyone, and
   [practise a restore](../../deploy/RUNBOOK.md#4-restore) once.
3. [Upgrade](../../deploy/RUNBOOK.md#2-upgrade) when a release appears: back up, change the image
   tag, `docker compose pull && docker compose up -d --wait`.

## Configuration

Secrets and infrastructure settings live in `deploy/.env`
([full reference](../../deploy/ENV.md)). Everything about how the community works is changed in
the app under **Admin → Settings** and takes effect immediately:

| Setting | Default | Notes |
|---|---|---|
| Server name | VidFriends | Shown on login, join links and the privacy page |
| Who can join | Invite only | "Anyone with the link" lets anyone who can reach the server register |
| Members can create invites | On | Off: only admins invite |
| Download videos from links | On | Off: links are shared as link-only cards |
| Allowed sites | YouTube, TikTok, Instagram, Facebook, X, Reddit, Vimeo | One domain per line; subdomains included |
| Largest video / longest video | 200 MB / 600 s | Larger or longer links become link-only cards |
| Storage per member / server cap | 5 GB / none | Uploads and downloads stop at the limit |
| Keep watched videos for | 90 days | 0 keeps everything; saved videos are never cleaned up |
| Session lengths | 30 days idle / 180 days maximum | |

## Day to day

- **Invites:** Admin → Invites (or the Invites page). Each invite is a link and a QR code; set how
  many people can use it, when it expires, and whether they become your friend automatically.
- **Forgotten passwords:** there is no email. Admin → Members → *Password-reset link* gives you a
  single-use link valid for 24 hours to pass on privately.
- **Problem members:** suspend (they are logged out and their shares are hidden), or delete the
  account. You cannot remove the last admin.
- **Storage:** Admin → Storage shows usage per member and lets you run retention now.
- **Audit log:** Admin → Audit log records logins, admin actions, setting changes and invite use for
  365 days.
- **Monitoring:** optional Prometheus and Grafana overlay
  ([runbook §5](../../deploy/RUNBOOK.md#5-monitoring)); otherwise watch `/readyz` with any uptime
  checker.
- **When link downloads break:** sites change often. Upgrading to the latest release brings the
  newest yt-dlp; meanwhile affected links fall back to link-only cards.

## Getting help

Check the [runbook](../../deploy/RUNBOOK.md) and open an issue on the project's repository with
the output of `docker compose ps` and the relevant `docker compose logs` lines. Logs contain no
passwords, tokens, invite codes, notes or replies, but do contain member ids; review before posting.
