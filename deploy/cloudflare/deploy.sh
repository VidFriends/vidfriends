#!/bin/sh
# Builds the VidFriends images, the Cloudflare test-instance image on top, pushes it to the
# Cloudflare registry and deploys the Worker (ADR-0021, deploy/cloudflare/README.md).
# Needs docker, CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID. Run from the repository root.
set -eu
WRANGLER="npx -y wrangler@4.147.0"
TAG="${TAG:-$(git rev-parse --short HEAD)}"
SECRET_ARGS=""
if [ -n "${EXTRA_CA:-}" ]; then SECRET_ARGS="--secret id=extra_ca,src=$EXTRA_CA"; fi

docker build $SECRET_ARGS --target worker -t vidfriends-worker:local .
docker build $SECRET_ARGS -t "vidfriends-cf:$TAG" deploy/cloudflare/container
(cd deploy/cloudflare/worker && $WRANGLER containers push "vidfriends-cf:$TAG")

IMAGE="registry.cloudflare.com/$CLOUDFLARE_ACCOUNT_ID/vidfriends-cf:$TAG"
CONFIG=deploy/cloudflare/worker/wrangler.deploy.jsonc
sed "s#registry.cloudflare.com/ACCOUNT_ID/vidfriends-cf:TAG#$IMAGE#" deploy/cloudflare/worker/wrangler.jsonc > "$CONFIG"
(cd deploy/cloudflare/worker && $WRANGLER deploy --config wrangler.deploy.jsonc)
rm -f "$CONFIG"
