#!/bin/sh
# Creates the local files that git ignores: the JWT keys and the database password.
# Safe to run again, because it never replaces files that already exist.
set -eu
cd "$(dirname "$0")/.."

mkdir -p secrets
if [ ! -f secrets/jwt_private.pem ]; then
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out secrets/jwt_private.pem
  openssl pkey -in secrets/jwt_private.pem -pubout -out secrets/jwt_public.pem
  echo "Created JWT keys in secrets/"
fi

if [ ! -f .env ]; then
  echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" > .env
  echo "Created .env"
fi
