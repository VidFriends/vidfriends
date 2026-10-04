#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "=== Building and starting docker compose stack ==="
docker compose up --build --wait

cleanup() {
  echo "=== Cleaning up docker compose stack ==="
  docker compose down
}
trap cleanup EXIT

echo "=== Running integration tests ==="
export VIDFRIENDS_ADDR="http://localhost:8080"
export VIDFRIENDS_DATABASE_URL="postgres://vidfriends:vidfriends@localhost:5432/vidfriends?sslmode=disable"
export VIDFRIENDS_S3_ENDPOINT="http://localhost:9000"
export VIDFRIENDS_S3_ACCESS_KEY="minioadmin"
export VIDFRIENDS_S3_SECRET_KEY="minioadmin"
export VIDFRIENDS_S3_BUCKET="vidfriends-videos"
export VIDFRIENDS_S3_USE_SSL="false"

go test -count=1 -tags=integration -timeout 120s -v ./test/integration/

echo "=== All integration tests passed ==="
