# Shared helpers for backup.sh and restore.sh (NFR-REL-04). Sourced, not executed.
# Every docker compose call honours COMPOSE_FILE / COMPOSE_PROJECT_NAME / COMPOSE_ENV_FILES, so the
# scripts work for any project layout; by default they run from deploy/ with compose.yml + .env.
set -eu

RCLONE_IMAGE=${RCLONE_IMAGE:-rclone/rclone:1.71.0}
DEPLOY_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$DEPLOY_DIR"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "error: $*"; exit 1; }

dc() { docker compose "$@"; }

# Reads a variable from the running server container, so the values always match the deployment
# and never appear on a command line.
server_env() { dc exec -T server printenv "$1"; }

# Runs rclone on the compose network with an on-the-fly S3 remote named "store". Credentials travel
# as environment variables (docker -e NAME passes the value from this shell, not the command line).
rclone_run() {
  container=$(dc ps -q seaweedfs)
  [ -n "$container" ] || die "the seaweedfs service is not running"
  network=$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$container" | cut -d' ' -f1)
  RCLONE_CONFIG_STORE_TYPE=s3
  RCLONE_CONFIG_STORE_PROVIDER=SeaweedFS
  RCLONE_CONFIG_STORE_ENDPOINT=$(server_env S3_ENDPOINT)
  RCLONE_CONFIG_STORE_ACCESS_KEY_ID=$(server_env S3_ACCESS_KEY_ID)
  RCLONE_CONFIG_STORE_SECRET_ACCESS_KEY=$(server_env S3_SECRET_ACCESS_KEY)
  export RCLONE_CONFIG_STORE_TYPE RCLONE_CONFIG_STORE_PROVIDER RCLONE_CONFIG_STORE_ENDPOINT \
    RCLONE_CONFIG_STORE_ACCESS_KEY_ID RCLONE_CONFIG_STORE_SECRET_ACCESS_KEY
  docker run --rm --network "$network" --user "$(id -u):$(id -g)" -e RCLONE_CONFIG=/dev/null \
    -e RCLONE_CONFIG_STORE_TYPE -e RCLONE_CONFIG_STORE_PROVIDER -e RCLONE_CONFIG_STORE_ENDPOINT \
    -e RCLONE_CONFIG_STORE_ACCESS_KEY_ID -e RCLONE_CONFIG_STORE_SECRET_ACCESS_KEY \
    -v "$BACKUP_DIR:/backup" "$RCLONE_IMAGE" "$@"
}
