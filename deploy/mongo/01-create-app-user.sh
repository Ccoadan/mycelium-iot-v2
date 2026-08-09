#!/usr/bin/env bash
set -Eeuo pipefail

: "${MONGO_INITDB_DATABASE:?MONGO_INITDB_DATABASE es obligatorio}"
: "${MONGO_APP_USERNAME:?MONGO_APP_USERNAME es obligatorio}"
: "${MONGO_APP_PASSWORD:?MONGO_APP_PASSWORD es obligatorio}"

if [[ ! "$MONGO_INITDB_DATABASE" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "MONGO_INITDB_DATABASE contiene caracteres no permitidos" >&2
  exit 1
fi

if [[ ! "$MONGO_APP_USERNAME" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "MONGO_APP_USERNAME contiene caracteres no permitidos" >&2
  exit 1
fi

if [[ ! "$MONGO_APP_PASSWORD" =~ ^[A-Fa-f0-9]{48,128}$ ]]; then
  echo "MONGO_APP_PASSWORD debe ser hexadecimal y tener entre 48 y 128 caracteres" >&2
  exit 1
fi

mongosh --quiet "$MONGO_INITDB_DATABASE" <<EOF
db.createUser({
  user: "$MONGO_APP_USERNAME",
  pwd: "$MONGO_APP_PASSWORD",
  roles: [{ role: "readWrite", db: "$MONGO_INITDB_DATABASE" }]
});
EOF
