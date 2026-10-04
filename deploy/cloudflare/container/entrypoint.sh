#!/bin/sh
# Cloudflare test instance (ADR-0021): Postgres, SeaweedFS and VidFriends (ROLE=all) in one
# container behind the vidfriends.app Worker. The disk is ephemeral: state is restored from the
# R2 backup at start, backed up every 15 minutes, and once more on SIGTERM before exit.
set -eu

DATA=/data
: "${POSTGRES_PASSWORD:?}" "${S3_ACCESS_KEY_ID:?}" "${S3_SECRET_ACCESS_KEY:?}" "${PUBLIC_URL:?}"
mkdir -p "$DATA/seaweed" /run/postgresql
chown postgres:postgres /run/postgresql
backup() { flock /tmp/backup.lock node /opt/cf/backup.mjs backup || true; }

restored=0
if node /opt/cf/backup.mjs restore; then
  restored=1
else
  rc=$?
  if [ "$rc" -ne 3 ]; then
    echo "restore failed ($rc); refusing to start empty over an existing backup" >&2
    exit 1
  fi
fi

# PostgreSQL: a fresh cluster each start, loaded from the dump when there is one.
rm -rf "$DATA/pg" && mkdir -p "$DATA/pg" && chown postgres:postgres "$DATA/pg"
su-exec postgres initdb -D "$DATA/pg" -E UTF8 --auth-local=trust --auth-host=scram-sha-256 >/dev/null
su-exec postgres pg_ctl -D "$DATA/pg" -w -l "$DATA/pg/server.log" -o "-c listen_addresses=127.0.0.1" start
su-exec postgres psql -q -v ON_ERROR_STOP=1 \
  -c "create role vidfriends login password '$POSTGRES_PASSWORD'" \
  -c "create database vidfriends owner vidfriends"
if [ "$restored" = 1 ]; then
  PGPASSWORD="$POSTGRES_PASSWORD" pg_restore -h 127.0.0.1 -U vidfriends -d vidfriends \
    --no-owner --exit-on-error "$DATA/db.dump"
fi

# SeaweedFS: 64 MB volumes so full ones never change again (incremental backups); only the
# authenticated S3 gateway listens beyond loopback (as in deploy/compose.yml).
umask 077
printf '{"identities":[{"name":"vidfriends","credentials":[{"accessKey":"%s","secretKey":"%s"}],"actions":["Admin","Read","Write","List","Tagging"]}]}' \
  "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY" > /tmp/s3.json
umask 022
weed server -dir="$DATA/seaweed" -ip=127.0.0.1 -ip.bind=127.0.0.1 -s3 -s3.ip.bind=0.0.0.0 \
  -s3.port=8333 -s3.config=/tmp/s3.json -volume.port=18080 -volume.max=200 \
  -master.volumeSizeLimitMB=64 \
  >"$DATA/weed.log" 2>&1 &
WEED=$!
for _ in $(seq 1 120); do
  if wget -q -O /dev/null http://127.0.0.1:8333/healthz &&
    wget -q -O - http://127.0.0.1:9333/dir/status | grep -q '"DataNodes":\[{'; then
    break
  fi
  sleep 1
done

export NODE_ENV=production ROLE=all PORT=8080 HOST=0.0.0.0 WEB_DIST=/app/web WORK_DIR=/work \
  DATABASE_URL="postgres://vidfriends:$POSTGRES_PASSWORD@127.0.0.1:5432/vidfriends" \
  S3_ENDPOINT=http://127.0.0.1:8333 S3_PUBLIC_ENDPOINT="$PUBLIC_URL" S3_BUCKET=media-store
cd /app
su-exec node node dist/main.js migrate
su-exec node node dist/main.js &
APP=$!

(while sleep 900; do backup; done) &
LOOP=$!

stop() {
  kill "$LOOP" 2>/dev/null || true
  kill -TERM "$APP" 2>/dev/null || true
  wait "$APP" 2>/dev/null || true
  backup
  kill -TERM "$WEED" 2>/dev/null || true
  wait "$WEED" 2>/dev/null || true
  su-exec postgres pg_ctl -D "$DATA/pg" -m fast stop || true
  exit 0
}
trap stop TERM INT

# If the app exits on its own, back up what there is and exit so the platform restarts us.
wait "$APP" || true
stop
