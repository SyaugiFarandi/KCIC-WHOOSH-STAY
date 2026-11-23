#!/usr/bin/env bash
# Restores a pg_dump archive into a throw-away database and verifies it, then drops it.
export MSYS_NO_PATHCONV=1
# The source database is only read for comparison; it is never modified.
# Usage: infrastructure/scripts/pg-restore-drill.sh <dump-file>
# Env: SOURCE_DB (default whoosh_stay), COMPOSE_FILE (default docker-compose.yml)
set -euo pipefail

DUMP_FILE="${1:?usage: pg-restore-drill.sh <dump-file>}"
SOURCE_DB="${SOURCE_DB:-whoosh_stay}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
DRILL_DB="whoosh_restore_drill_$(date -u +%Y%m%d%H%M%S)_$$"

if [ "$DRILL_DB" = "$SOURCE_DB" ] || [ "$DRILL_DB" = "whoosh_stay_test" ]; then
  echo "ERROR: refusing to use a production or test database name for the drill" >&2
  exit 1
fi

psql_exec() {
  docker compose -f "$COMPOSE_FILE" exec -T postgres psql -U whoosh "$@"
}

cleanup() {
  psql_exec -d postgres -c "DROP DATABASE IF EXISTS \"$DRILL_DB\";" >/dev/null 2>&1 || true
  docker compose -f "$COMPOSE_FILE" exec -T postgres rm -f /tmp/restore-drill.dump >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose -f "$COMPOSE_FILE" cp "$DUMP_FILE" postgres:/tmp/restore-drill.dump
psql_exec -d postgres -c "CREATE DATABASE \"$DRILL_DB\";"
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_restore -U whoosh -d "$DRILL_DB" --no-owner --no-privileges --exit-on-error /tmp/restore-drill.dump

table_count() {
  psql_exec -d "$1" -tAc \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';"
}
row_count() {
  psql_exec -d "$1" -tAc \
    "SELECT (SELECT count(*) FROM reservations) + (SELECT count(*) FROM audit_logs) + (SELECT count(*) FROM beds);"
}
object_count() {
  psql_exec -d "$1" -tAc \
    "SELECT count(*) FROM pg_constraint WHERE contype='x' UNION ALL SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal;" | tr '\n' '/'
}
migration_count() {
  psql_exec -d "$1" -tAc "SELECT count(*) FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL;"
}

SRC_TABLES="$(table_count "$SOURCE_DB")"
DST_TABLES="$(table_count "$DRILL_DB")"
SRC_ROWS="$(row_count "$SOURCE_DB")"
DST_ROWS="$(row_count "$DRILL_DB")"
SRC_OBJECTS="$(object_count "$SOURCE_DB")"
DST_OBJECTS="$(object_count "$DRILL_DB")"
SRC_MIGRATIONS="$(migration_count "$SOURCE_DB")"
DST_MIGRATIONS="$(migration_count "$DRILL_DB")"

for value in "$SRC_TABLES" "$DST_TABLES" "$SRC_ROWS" "$DST_ROWS" "$SRC_OBJECTS" "$DST_OBJECTS" "$SRC_MIGRATIONS" "$DST_MIGRATIONS"; do
  [ -n "$value" ] || { echo "DRILL FAILED: verification query returned no value" >&2; exit 1; }
  case "$value" in
    *[!0-9/]*) echo "DRILL FAILED: unexpected verification output '$value'" >&2; exit 1 ;;
  esac
done

echo "Drill database: $DRILL_DB"
echo "Source tables:    $SRC_TABLES | restored tables:    $DST_TABLES"
echo "Source rows:      $SRC_ROWS | restored rows:      $DST_ROWS"
echo "Source objects:   $SRC_OBJECTS | restored objects: $DST_OBJECTS"
echo "Migrations:       $SRC_MIGRATIONS (source) | $DST_MIGRATIONS (restored)"

if [ "$SRC_TABLES" != "$DST_TABLES" ] ||
  [ "$SRC_ROWS" != "$DST_ROWS" ] ||
  [ "$SRC_OBJECTS" != "$DST_OBJECTS" ] ||
  [ "$SRC_MIGRATIONS" != "$DST_MIGRATIONS" ]; then
  echo "DRILL FAILED: restored database does not match the source" >&2
  exit 1
fi

echo "append-only trigger check:"
TRIGGER_RESULT="$(psql_exec -d "$DRILL_DB" -c "UPDATE audit_logs SET action = action WHERE id = (SELECT id FROM audit_logs LIMIT 1);" 2>&1 || true)"
if printf '%s' "$TRIGGER_RESULT" | grep -q "append-only"; then
  echo "  ok: audit_logs UPDATE rejected"
else
  echo "DRILL FAILED: audit trigger did not reject UPDATE" >&2
  exit 1
fi

echo "DRILL PASSED"
