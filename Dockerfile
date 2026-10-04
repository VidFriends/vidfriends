# syntax=docker/dockerfile:1.7
# One image definition, two targets (ADR-0007, TDD §6): `server` (API + web app) and `worker`
# (jobs; adds ffmpeg and a pinned yt-dlp). Both run as non-root.

ARG NODE_IMAGE=node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1

# The build stage runs on the build machine's platform: Node under QEMU emulation crashed
# intermittently with SIGILL in arm64 release builds. It produces only JavaScript, plus the
# prebuilt native packages (sharp, @node-rs/argon2) of the *target* platform, chosen at deploy time.
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS build
ARG TARGETARCH
COPY deploy/docker/with-extra-ca.sh /usr/local/bin/with-extra-ca
RUN corepack enable
WORKDIR /src
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json .npmrc* ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY packages/api-client/package.json packages/api-client/
COPY packages/config/package.json packages/config/
COPY packages/test-utils/package.json packages/test-utils/
COPY e2e/package.json e2e/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    --mount=type=secret,id=extra_ca,required=false \
    with-extra-ca pnpm install --frozen-lockfile
COPY . .
ARG VIDFRIENDS_VERSION=0.1.0-dev
RUN pnpm turbo run build --filter=@vidfriends/server --filter=@vidfriends/web
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    --mount=type=secret,id=extra_ca,required=false \
    case "${TARGETARCH:-$(uname -m)}" in amd64|x86_64) cpu=x64 ;; arm64|aarch64) cpu=arm64 ;; *) exit 1 ;; esac \
    && with-extra-ca pnpm --filter @vidfriends/server deploy --prod --legacy \
      --os=linux --cpu="$cpu" --libc=musl /out \
    && cp -r apps/web/dist /out/web

FROM ${NODE_IMAGE} AS server
# The runtime never uses npm or corepack; removing them drops their bundled dependencies (and
# their CVEs) from the image (M5-T7 dependency audit).
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
ENV NODE_ENV=production \
    ROLE=api \
    WEB_DIST=/app/web \
    PORT=8080
WORKDIR /app
COPY --from=build --chown=root:root /out /app
ARG VIDFRIENDS_VERSION=0.1.0-dev
ENV VIDFRIENDS_VERSION=${VIDFRIENDS_VERSION}
USER node
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
ENTRYPOINT ["node", "dist/main.js"]

FROM ${NODE_IMAGE} AS worker
# The runtime never uses npm or corepack; removing them drops their bundled dependencies (and
# their CVEs) from the image (M5-T7 dependency audit).
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
# ffmpeg/ffprobe from Alpine; yt-dlp pinned in deploy/worker/requirements.txt and bumped by a
# scheduled workflow independently of server releases (NFR-OPS-05).
COPY deploy/docker/with-extra-ca.sh /usr/local/bin/with-extra-ca
RUN --mount=type=secret,id=extra_ca,required=false \
    with-extra-ca apk add --no-cache ffmpeg python3 ca-certificates \
    && python3 -m venv /opt/yt-dlp
COPY deploy/worker/requirements.txt /opt/yt-dlp/requirements.txt
RUN --mount=type=secret,id=extra_ca,required=false \
    with-extra-ca /opt/yt-dlp/bin/pip install --no-cache-dir -r /opt/yt-dlp/requirements.txt \
    && /opt/yt-dlp/bin/python -m pip uninstall --yes --quiet pip \
    && ln -s /opt/yt-dlp/bin/yt-dlp /usr/local/bin/yt-dlp \
    && mkdir -p /work && chown node:node /work
ENV NODE_ENV=production \
    ROLE=worker \
    WORK_DIR=/work
WORKDIR /app
COPY --from=build --chown=root:root /out /app
ARG VIDFRIENDS_VERSION=0.1.0-dev
ENV VIDFRIENDS_VERSION=${VIDFRIENDS_VERSION}
USER node
ENTRYPOINT ["node", "dist/main.js"]
