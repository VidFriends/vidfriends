#!/bin/sh
# Runs a build command trusting an optional extra CA (for builds behind a TLS-intercepting proxy).
# The CA comes from a BuildKit secret (`--secret id=extra_ca,src=...`), lives only in /tmp for the
# duration of the command, and never ends up in an image layer.
set -e
if [ -s /run/secrets/extra_ca ]; then
  cat /etc/ssl/certs/ca-certificates.crt /run/secrets/extra_ca > /tmp/extra-ca-bundle.pem 2>/dev/null \
    || cp /run/secrets/extra_ca /tmp/extra-ca-bundle.pem
  export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca
  export SSL_CERT_FILE=/tmp/extra-ca-bundle.pem
  export PIP_CERT=/tmp/extra-ca-bundle.pem
  export npm_config_cafile=/tmp/extra-ca-bundle.pem
fi
status=0
"$@" || status=$?
rm -f /tmp/extra-ca-bundle.pem
exit $status
