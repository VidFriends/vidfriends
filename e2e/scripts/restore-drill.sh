#!/bin/sh
# Backup/restore drill on the populated E2E stack (M5-T5, NFR-REL-04): back up, delete every volume,
# start a fresh stack with the same .env, restore, and require identical data and a ready server.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
export COMPOSE_PROJECT_NAME=vf-e2e
export COMPOSE_FILE="$root/deploy/compose.yml:$root/e2e/compose.e2e.yml"
export COMPOSE_ENV_FILES="$root/e2e/.stack/e2e.env"
export BACKUP_DIR="${BACKUP_DIR:-$root/e2e/.stack/backups}"

state() {
  docker compose exec -T postgres psql -U vidfriends -d vidfriends -At -c "
    select 'users=' || count(*) from users union all
    select 'shares=' || count(*) from shares union all
    select 'replies=' || count(*) from replies union all
    select 'videos=' || count(*) from videos union all
    select 'media=' || count(media_key) from videos union all
    select 'audit=' || count(*) from audit_log"
}
objects() { find "$BACKUP_DIR/media/current" -type f | wc -l; }

rm -rf "$BACKUP_DIR"
before=$(state)
echo "before: $(echo $before)"
"$root/deploy/backup/backup.sh"
mirrored=$(objects)
node "$root/e2e/scripts/stack.mjs" down
node "$root/e2e/scripts/stack.mjs" up
[ "$(state | grep '^users=')" = "users=0" ] || { echo 'fresh stack is not empty'; exit 1; }
"$root/deploy/backup/restore.sh"
after=$(state)
echo "after:  $(echo $after)"
[ "$before" = "$after" ] || { echo 'restored data differs'; exit 1; }
rm -rf "$BACKUP_DIR/media/current"
# Mirror the restored bucket again: every object must have come back.
"$root/deploy/backup/backup.sh"
[ "$(objects)" = "$mirrored" ] || { echo "objects: $mirrored backed up, $(objects) restored"; exit 1; }
docker compose exec -T server wget -qO- http://127.0.0.1:8080/readyz
echo
echo "restore drill passed ($mirrored objects)"
