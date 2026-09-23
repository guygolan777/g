#!/usr/bin/env bash
# Applies all migrations + seed to a throwaway Postgres DB (with Supabase stubs)
# and runs the RLS assertions. Requires a local Postgres reachable via `psql`.
# Usage: PGUSER=postgres bash scripts/test-db.sh
set -euo pipefail
DB=${DB:-mibale_test}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PSQL="psql -q -v ON_ERROR_STOP=1 -d $DB"
dropdb --if-exists --force "$DB" >/dev/null 2>&1 || true
createdb "$DB"
$PSQL < "$ROOT/drizzle/tests/supabase-stub.sql" 2>&1 | grep -v "wal_level\|HINT" || true
for f in "$ROOT"/drizzle/migrations/*.sql; do
  echo "→ $(basename "$f")"
  $PSQL < "$f"
done
echo "→ seed.sql"
$PSQL < "$ROOT/drizzle/seed.sql"
echo "→ rls.sql"
psql -v ON_ERROR_STOP=1 -d "$DB" -At < "$ROOT/drizzle/tests/rls.sql" | tail -1
