# Cloudflare test instance

A VidFriends instance for testing at **https://vidfriends.app**, on Cloudflare Containers
([ADR-0021](../../docs/adr/0021-cloudflare-test-instance.md)). For a real deployment, use the
Docker Compose stack in [`deploy/`](../RUNBOOK.md).

- `container/`: the image (VidFriends + PostgreSQL + SeaweedFS), its entrypoint and the backup
  script.
- `worker/`: the Worker that owns `vidfriends.app`, starts the container and stores backups in the
  private R2 bucket `vidfriends-test-backups`.

## Claim the instance (first time)

1. Cloudflare dashboard → Workers & Pages → **vidfriends-test** → Containers → Logs (or Observability).
2. Search for `setup token` and copy the token from the newest line. It changes on every restart
   until the server is claimed.
3. Open https://vidfriends.app/setup, paste it, and create your passkey.

If you lose your admin passkey later, an admin can create a recovery link (Admin → Members). Without
another admin, the operator command `node dist/main.js recovery-link <username>` needs a shell
in the container (`wrangler containers ssh`, if enabled), so add a second passkey in Settings.

## Deploy a new version

```sh
export CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=…
sh deploy/cloudflare/deploy.sh   # from the repository root; TAG defaults to the git commit
```

The running container gets `SIGTERM`, backs up, and the new one restores the backup.

## Secrets (once)

Set as Worker secrets, never committed: `APP_SECRET` (never change it), `POSTGRES_PASSWORD`,
`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `BACKUP_TOKEN`:

```sh
cd deploy/cloudflare/worker && npx wrangler secret bulk secrets.json --name vidfriends-test
```

## Backups

Every 15 minutes and on shutdown: a `pg_dump` and SeaweedFS's files (64 MB parts, only changes)
go to R2 under `manifest.json`, `files/…`. A crash can lose up to 15 minutes. To start over, delete
the objects in the bucket and redeploy.
