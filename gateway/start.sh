#!/bin/sh
# Kong's config file cannot read a key from a file, so insert the public key before starting.
set -eu

awk 'FNR == NR { key = key "          " $0 "\n"; next }
     /__JWT_PUBLIC_KEY__/ { printf "%s", key; next }
     { print }' /run/secrets/jwt_public_key /kong/kong.yml > /tmp/kong.yml

exec /docker-entrypoint.sh kong docker-start
