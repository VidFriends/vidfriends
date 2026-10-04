#!/bin/sh
# Nightly backup (NFR-REL-04, TDD §6): a PostgreSQL custom-format dump (14 daily + 8 weekly kept)
# and a mirror of the media bucket (objects deleted since the last run are kept for 14 days).
#   BACKUP_DIR=/srv/vidfriends-backups deploy/backup/backup.sh
# Schedule it from cron, for example: 15 2 * * * /opt/vidfriends/deploy/backup/backup.sh
. "$(dirname -- "$0")/lib.sh"

BACKUP_DIR=${BACKUP_DIR:-$DEPLOY_DIR/backups}
BACKUP_DIR=$(mkdir -p "$BACKUP_DIR" && cd "$BACKUP_DIR" && pwd)
KEEP_DAILY=${KEEP_DAILY:-14}
KEEP_WEEKLY=${KEEP_WEEKLY:-8}
stamp=$(date -u +%Y%m%dT%H%M%SZ)
umask 077
mkdir -p "$BACKUP_DIR/db/daily" "$BACKUP_DIR/db/weekly" "$BACKUP_DIR/media"

log "dumping the database"
dump="$BACKUP_DIR/db/daily/vidfriends-$stamp.dump"
dc exec -T postgres pg_dump -U vidfriends -d vidfriends -Fc > "$dump.partial"
# A dump that pg_restore cannot list is not a backup.
dc exec -T postgres pg_restore -l < "$dump.partial" > /dev/null || die "the dump is unreadable"
mv "$dump.partial" "$dump"
log "database dump: $dump ($(wc -c < "$dump") bytes)"

# One weekly copy: the first backup of each ISO week.
week=$(date -u +%G-W%V)
if ! ls "$BACKUP_DIR/db/weekly/" | grep -q "^vidfriends-$week"; then
  cp "$dump" "$BACKUP_DIR/db/weekly/vidfriends-$week.dump"
fi
prune() { ls -1 "$1" | sort -r | tail -n +"$(($2 + 1))" | while read -r f; do rm -f "$1/$f"; done; }
prune "$BACKUP_DIR/db/daily" "$KEEP_DAILY"
prune "$BACKUP_DIR/db/weekly" "$KEEP_WEEKLY"

log "mirroring the media bucket"
bucket=$(server_env S3_BUCKET)
rclone_run sync "store:$bucket" /backup/media/current --backup-dir "/backup/media/deleted-$stamp" \
  --fast-list --transfers 8 --checksum --stats-one-line --stats 0
find "$BACKUP_DIR/media" -maxdepth 1 -name 'deleted-*' -type d -mtime +14 -exec rm -rf {} +
log "backup complete"
