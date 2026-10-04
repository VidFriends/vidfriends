# VidFriends operator runbook

How to install, upgrade, back up, restore and monitor a self-hosted VidFriends instance
(ADR-0014: there is no public instance; every deployment is someone's own server). Everything here
runs from the `deploy/` directory of a checkout. Background: [TDD §6](../docs/design/TDD.md#6-deployment-and-operations),
environment reference: [ENV.md](ENV.md).

- [1. Install on a fresh VM](#1-install-on-a-fresh-vm)
- [2. Upgrade](#2-upgrade)
- [3. Backup](#3-backup)
- [4. Restore](#4-restore)
- [5. Monitoring](#5-monitoring)
- [5a. Hardening (optional)](#5a-hardening-optional)
- [6. Routine operations](#6-routine-operations)
- [7. Records](#7-records)

## 1. Install on a fresh VM

Target: from a blank VM to a claimed instance in 30 minutes or less (BO-4, M5-T6).

**You need:**

- A Linux VM with 2 vCPU, 4 GB RAM and enough disk for your videos (start with 40 GB). amd64 and
  arm64 both work.
- A DNS name pointing at the VM (for example `vids.example.org`), with ports 80 and 443 reachable
  from the internet so Caddy can obtain a certificate. For a LAN-only trial, `localhost` works and
  uses Caddy's local CA.
- Docker Engine 24+ with the Compose plugin v2.24+ (`docker compose version`).

**Steps:**

1. Install Docker if needed (Debian/Ubuntu): `curl -fsSL https://get.docker.com | sh`.
2. Get the deployment files:

   ```sh
   git clone https://github.com/VidFriends/vidfriends.git /opt/vidfriends
   cd /opt/vidfriends/deploy
   ```

3. Create the configuration and fill in every value:

   ```sh
   cp .env.example .env
   chmod 600 .env
   for v in POSTGRES_PASSWORD APP_SECRET S3_SECRET_ACCESS_KEY; do
     sed -i "s/^$v=.*/$v=$(openssl rand -hex 32)/" .env
   done
   sed -i "s/^S3_ACCESS_KEY_ID=.*/S3_ACCESS_KEY_ID=vf$(openssl rand -hex 8)/" .env
   ```

   Then edit `.env` and set `DOMAIN` (for example `vids.example.org`) and `PUBLIC_URL`
   (`https://vids.example.org`). Keep the image lines pointing at the release you want. To build
   from source instead, delete the two `VIDFRIENDS_*_IMAGE` lines and run `docker compose build`
   (about 5 minutes on 2 vCPU).

   **Keep a copy of `.env` somewhere safe and private.** `APP_SECRET` encrypts the instance's
   push keys; a backup restored with a different `APP_SECRET` loses Web Push subscriptions.

4. Start the stack: `docker compose up -d --wait`. The `migrate` service runs first; the server
   creates the media bucket on first start.
5. Claim the instance (FR-AUTH-01). The server logs a one-time setup token while no admin exists:

   ```sh
   docker compose logs server | grep 'setup token'
   ```

   Open `PUBLIC_URL/setup`, enter the token, and create the first admin account. The token stops
   working once the instance is claimed.

6. In the app, open **Invites** and create a join link (or QR code) for each friend.
7. Set up backups (section 3) before inviting anyone.

**Check:** `curl -fsS $PUBLIC_URL/readyz` returns `{"status":"ok",...}` with every check `ok`; the admin console
(Admin → Storage) shows the next retention run.

## 2. Upgrade

Releases are tagged `vX.Y.Z` and published as multi-arch images with SBOMs
(`.github/workflows/release.yml`; maintainers either push the tag or dispatch the workflow on
`main` with the version, which creates the tag with the release). Migrations are backward-compatible for one minor version
(expand/contract), so you can roll back by redeploying the previous image.

1. Read the release notes for anything marked **operator action**.
2. Back up: `backup/backup.sh` (section 3).
3. Update the checkout (compose files may change between releases):
   `git -C /opt/vidfriends fetch --tags && git -C /opt/vidfriends checkout vX.Y.Z`.
4. Set both `VIDFRIENDS_SERVER_IMAGE` and `VIDFRIENDS_WORKER_IMAGE` in `.env` to the new tag.
   (Building from source: `docker compose build` instead.)
5. `docker compose pull && docker compose up -d --wait`. `migrate` runs before the server and
   worker start; if it fails, they do not start and the old data is untouched by the new code.
6. Check: `docker compose logs migrate` ends with `migrations applied`; `/readyz` is ready; log in
   and play a video.

**Rollback:** set the image lines back to the previous tag and `docker compose up -d --wait`.
Never run down-migrations. If the new release's notes say a rollback needs the database restored,
use section 4 with the backup from step 2.

## 3. Backup

`backup/backup.sh` makes:

- a PostgreSQL custom-format dump in `BACKUP_DIR/db/daily/` (the newest 14 kept), plus the first
  dump of each ISO week in `db/weekly/` (8 kept). Each dump is checked with `pg_restore -l`;
- a mirror of the media bucket in `BACKUP_DIR/media/current/` (rclone on the compose network);
  objects removed since the previous run are kept in `media/deleted-<time>/` for 14 days.

Credentials are read from the running server container and passed as environment variables,
never on a command line. Run it as a user in the `docker` group:

```sh
BACKUP_DIR=/srv/vidfriends-backups /opt/vidfriends/deploy/backup/backup.sh
```

Schedule it nightly (RPO 24 h), for example with `crontab -e`:

```cron
15 2 * * * BACKUP_DIR=/srv/vidfriends-backups /opt/vidfriends/deploy/backup/backup.sh >> /var/log/vidfriends-backup.log 2>&1
```

Put `BACKUP_DIR` on a different disk from the Docker volumes, and copy it off the machine (for
example `rclone sync /srv/vidfriends-backups remote:vidfriends`). Backups contain private videos
and conversations: encrypt the off-site copy and restrict access.

## 4. Restore

Use this after losing the VM or its volumes, or to roll back data.

1. Install as in section 1, steps 1–4, **with the original `.env`** (same `APP_SECRET`). Do not
   claim the instance.
2. Copy the backup directory to the new machine.
3. Run:

   ```sh
   BACKUP_DIR=/srv/vidfriends-backups /opt/vidfriends/deploy/backup/restore.sh
   ```

   It syncs the media mirror into the bucket, stops the API and worker, recreates the database from
   the newest daily dump (or the dump you pass as an argument), and starts everything again. The
   database is recreated rather than cleaned because `pg_restore --clean` cannot drop pg-boss's
   partitioned tables.

4. Check: log in as a member, open the feed and play a video; Admin → Storage shows the expected
   totals.

Target RTO: 2 hours (most of it is copying media back). Members are logged out only if their
session expired in the meantime.

## 5. Monitoring

The server and worker expose Prometheus metrics on the internal port 9464 (`METRICS_PORT`); it is
never published. An optional overlay adds Prometheus (30 days retention) and Grafana with a
VidFriends dashboard (request rate, p95 latency by route, 5xx rate, queue depth, job outcomes and
durations, stored bytes, memory):

```sh
echo "GRAFANA_ADMIN_PASSWORD=$(openssl rand -hex 16)" >> .env
docker compose -f compose.yml -f compose.monitoring.yml up -d --wait
ssh -L 3000:127.0.0.1:3000 you@your-vm   # then open http://localhost:3000 (user admin)
```

Grafana listens on `127.0.0.1` only. Without the overlay: `/healthz` (process up) and `/readyz`
(database and storage reachable) for an external uptime check, and `docker compose logs` (JSON,
rotated at 10 MB × 5 per container, no access log, no tokens or content).

## 5a. Hardening (optional)

- **Egress proxy for link downloads.** yt-dlp may follow redirects from an allowed site to other
  hosts ([ADR-0016](../docs/adr/0016-accepted-residual-security-risks-v0-1.md)). To confine it, run
  an HTTP proxy that refuses private, loopback and link-local destinations (for example Stripe's
  Smokescreen, which does this by default) as a service on the compose network, and set
  `FETCH_PROXY_URL=http://<service>:<port>` in `.env`. Every yt-dlp request then goes through it.
- **Internal store APIs stay internal.** Only SeaweedFS's authenticated S3 port is reachable on the
  compose network; keep the `-ip.bind=127.0.0.1` flags if you customise `compose.yml`.
- **Host:** enable unattended security updates and a firewall allowing only 22, 80 and 443.

## 6. Routine operations

| Task                      | How                                                                                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                    | `docker compose ps`; `curl -fsS $PUBLIC_URL/readyz`                                                                                                                                          |
| Logs                      | `docker compose logs -f server worker`                                                                                                                                                       |
| Reset a member's password | Admin → Members → Password-reset link; give it to them privately (24 h, single use)                                                                                                          |
| Free space now            | Admin → Storage → Run retention now                                                                                                                                                          |
| yt-dlp update             | A scheduled workflow proposes each new yt-dlp version as a pull request; it reaches you in the next release. When extraction breaks for a site, check the release notes for a patch release. |
| Rotate `S3_*` keys        | Change both in `.env`, then `docker compose up -d --wait` (SeaweedFS reads them at start)                                                                                                    |
| Rotate `APP_SECRET`       | Not supported in place: members' push subscriptions would need re-enabling and CSRF tokens reset. Avoid unless compromised.                                                                  |

## 7. Records

Drills are recorded here with the date, version, environment and observed figures.

### Restore drill — 2026-10-04

- **Version:** branch `c/hopeful-keller-kcl32y` at the M5-T1 web commit (images built from source).
- **Environment:** the E2E compose stack (`deploy/compose.yml` + `e2e/compose.e2e.yml`) in an agent
  sandbox, after a full Playwright run: 10 users, 3 shares, 3 ready videos, 59 audit entries,
  7 media objects (464 KB in total).
- **Procedure:** `backup.sh` → `docker compose down -v` (all volumes deleted) → fresh `up` →
  `restore.sh` → row counts compared → a restored member logged in, loaded the feed and downloaded
  a restored video through Caddy (HTTP 200, `video/mp4`).
- **Observed:** backup 1 s; fresh stack 14 s; restore 11 s; counts identical; RPO = time since
  the last backup (24 h with the nightly schedule); RTO here ≈ 25 s plus copying the backup, far
  inside the 2 h target. Media copy time scales with library size.
- **Finding fixed during the drill:** `pg_restore --clean` failed on pg-boss partitions; the
  script now recreates the database.

### Upgrade drill — 2026-10-04

- **From** images built at commit `1bccb2a` (M3, migrations 0000–0002) **to** the current branch
  (migration 0003 added) on the E2E stack, following section 2: data seeded on the old version
  (setup, join, friends specs and a ready video), `backup.sh`, image lines changed, `up -d --wait`.
- **Observed:** 9 s; `migrate` logged `migrations applied` (3 → 4 rows in
  `drizzle.__drizzle_migrations`); old data intact; the current Playwright suite (join, friends,
  send, watch, admin) passed 5/5 against the upgraded instance.

### Fresh install drill — 2026-10-04 (M5-T6)

- **Procedure:** section 1, steps 2–6, executed verbatim by an agent in a new clone and a new
  compose project, with `DOMAIN=localhost`, ports 9080/9443 and the image lines pointing at
  locally built images (no release tag had been published yet, so `docker compose pull` from GHCR
  was not exercised). The browser steps (claim, create an invite, open Admin → Storage) were driven
  through the real UI with Playwright.
- **Observed:** 28 s from clone to a claimed instance with a join link and `/readyz` all `ok`,
  excluding installing Docker and downloading images (budget a few minutes for both on a typical
  VM). Well inside the 30-minute target (BO-4).
- **Still to do:** repeat on a real blank VM with a public DNS name once `v0.1.0` images exist
  (part of M5-T9).
