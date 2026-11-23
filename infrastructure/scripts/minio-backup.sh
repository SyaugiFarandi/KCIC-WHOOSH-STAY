#!/usr/bin/env bash
# Mirrors the object-storage buckets to a host directory without modifying them.
export MSYS_NO_PATHCONV=1
# Usage: infrastructure/scripts/minio-backup.sh [output-directory]
# Env: MINIO_BUCKETS (space-separated), COMPOSE_FILE (default docker-compose.yml)
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
OUT_DIR="${1:-./backups}/minio-$(date -u +%Y%m%dT%H%M%SZ)"
BUCKETS="${MINIO_BUCKETS:-whoosh-stay-assets whoosh-stay-evidence}"

docker compose -f "$COMPOSE_FILE" exec -T minio sh -c '
  MC=/opt/bitnami/minio-client/bin/mc
  $MC alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
  rm -rf /tmp/minio-backup && mkdir -p /tmp/minio-backup
  for bucket in '"$BUCKETS"'; do
    $MC mirror --quiet "local/$bucket" "/tmp/minio-backup/$bucket" >/dev/null
  done
'

mkdir -p "$OUT_DIR"
docker compose -f "$COMPOSE_FILE" cp minio:/tmp/minio-backup/. "$OUT_DIR"
docker compose -f "$COMPOSE_FILE" exec -T minio rm -rf /tmp/minio-backup

for bucket in $BUCKETS; do
  echo "$bucket: $(find "$OUT_DIR/$bucket" -type f | wc -l | tr -d ' ') files, $(du -sh "$OUT_DIR/$bucket" | cut -f1)"
done
echo "Object backup written: $OUT_DIR"
