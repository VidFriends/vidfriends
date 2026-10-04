# Cloudflare test instance image (ADR-0021): the VidFriends worker image (which also contains the
# API and web app) plus PostgreSQL and SeaweedFS, run together by entrypoint.sh.
ARG BASE_IMAGE=vidfriends-worker:local
FROM chrislusf/seaweedfs:4.48@sha256:4e61d15fd35994cb1e43e1e553dff106794841fd9a99ade2fc8c8bfce4d7872d AS weed

FROM ${BASE_IMAGE}
USER root
RUN --mount=type=secret,id=extra_ca,required=false \
    with-extra-ca apk add --no-cache postgresql16 postgresql16-client postgresql16-contrib su-exec \
    && mkdir -p /data && chown node:node /work
COPY --from=weed /usr/bin/weed /usr/bin/weed
COPY backup.mjs entrypoint.sh /opt/cf/
EXPOSE 8080 8333
ENTRYPOINT ["/bin/sh", "/opt/cf/entrypoint.sh"]
