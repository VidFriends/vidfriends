#!/bin/sh
# Restore (NFR-REL-04): replaces the database with a dump and the media bucket with the mirror.
# Run it on an instance started with the SAME deploy/.env (APP_SECRET decrypts stored secrets).
#   BACKUP_DIR=/srv/vidfriends-backups deploy/backup/restore.sh [path/to/vidfriends-*.dump]
# Without a path, the newest daily dump is used. The API and worker are stopped meanwhile.
. "$(dirname -- "$0")/lib.sh"

BACKUP_DIR=${BACKUP_DIR:-$DEPLOY_DIR/backups}
BACKUP_DIR=$(cd "$BACKUP_DIR" && pwd)
dump=${1:-$(ls -1 "$BACKUP_DIR"/db/daily/*.dump 2>/dev/null | sort | tail -n 1)}
[ -n "$dump" ] && [ -f "$dump" ] || die "no dump found (pass one, or set BACKUP_DIR)"
[ -d "$BACKUP_DIR/media/current" ] || die "no media mirror at $BACKUP_DIR/media/current"

bucket=$(server_env S3_BUCKET)
log "restoring media into bucket $bucket"
rclone_run sync /backup/media/current "store:$bucket" --fast-list --transfers 8 --checksum \
  --stats-one-line --stats 0

log "stopping the API and worker"
dc stop server worker

log "recreating the database and restoring $dump"
# A fresh database rather than pg_restore --clean: --clean cannot drop the partitions of pg-boss's
# partitioned tables, and a fresh database guarantees nothing from the old state survives.
dc exec -T postgres psql -U vidfriends -d postgres -v ON_ERROR_STOP=1 \
  -c 'DROP DATABASE IF EXISTS vidfriends WITH (FORCE)' -c 'CREATE DATABASE vidfriends OWNER vidfriends'
dc exec -T postgres pg_restore -U vidfriends -d vidfriends --no-owner --exit-on-error \
  --single-transaction < "$dump"

log "starting the API and worker (migrations run first)"
dc up -d --wait migrate server worker
log "restore complete"
