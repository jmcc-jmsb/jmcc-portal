#!/usr/bin/env bash
# ABOUTME: Applies every migration to a throwaway Postgres and runs the RLS assertions against it.
# ABOUTME: Needs Docker only — no Supabase project, no network, nothing to clean up by hand.
set -euo pipefail

CONTAINER=jmcc-portal-test-db
IMAGE=postgres:17-alpine
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

echo "→ starting $IMAGE"
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null

# The image starts, runs its own init, restarts once, and only then accepts
# connections. Polling for two consecutive ready results avoids connecting to
# the first, short-lived server and losing the schema when it bounces.
ready=0
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U postgres -q 2>/dev/null; then
    ready=$((ready + 1))
    [ "$ready" -ge 2 ] && break
  else
    ready=0
  fi
  sleep 1
done
[ "$ready" -ge 2 ] || { echo "postgres never became ready"; docker logs "$CONTAINER"; exit 1; }

run() {
  echo "→ $(basename "$1")"
  docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres < "$1"
}

run "$ROOT/supabase/tests/00_shim.sql"
for migration in "$ROOT"/supabase/migrations/*.sql; do run "$migration"; done
# The cabinet catalog is production data, not fixtures — the tests exercise the
# real 22 pieces rather than a made-up set that could drift from them.
run "$ROOT/supabase/seed_cabinet.sql"
run "$ROOT/supabase/tests/01_fixtures.sql"
run "$ROOT/supabase/tests/02_embargo.test.sql"
run "$ROOT/supabase/tests/03_cabinet_tasks_events.test.sql"
