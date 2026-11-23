#!/usr/bin/env bash
# Creates a custom-format PostgreSQL backup without touching the source data.
export MSYS_NO_PATHCONV=1
# Usage: infrastructure/scripts/pg-backup.sh [output-directory]
# Env: SOURCE_DB (default whoosh_stay), COMPOSE_FILE (default docker-compose.yml)
set -euo pipefail

SOURCE_DB="${SOURCE_DB:-whoosh_stay}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
OUT_DIR="${1:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="${OUT_DIR}/${SOURCE_DB}-${STAMP}.dump"

mkdir -p "$OUT_DIR"

docker compose -f "$COMPOSE_FILE" exec -T postgres \
  sh -c "pg_dump -U whoosh -d '$SOURCE_DB' --format=custom --no-owner --no-privileges" \
  > "$OUT_FILE"

if [ "$(head -c 5 "$OUT_FILE")" != "PGDMP" ]; then
  echo "ERROR: $OUT_FILE is not a valid pg_dump custom archive" >&2
  rm -f "$OUT_FILE"
  exit 1
fi

SIZE="$(wc -c < "$OUT_FILE" | tr -d ' ')"
echo "Backup written: $OUT_FILE ($SIZE bytes)"
echo "Checksum (host): $(sha256sum "$OUT_FILE" | cut -d' ' -f1)"
