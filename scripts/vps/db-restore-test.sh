#!/usr/bin/env bash
# Proves the newest backup restores (ADR 0036): loads it into a throwaway
# Postgres container from the same image, then checks that every table in
# public and private, and auth.users, is there with rows where the live
# database has rows. The container is removed afterwards. Run weekly by
# farbaek-db-restore-test.timer, as farbaek.
set -euo pipefail

DIR=/opt/farbaek/backups
DB_IMAGE=supabase/postgres:17.6.1.136
NAME=farbaek-restore-test
TABLES_SQL="select n.nspname || '.' || c.relname, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind = 'r' and (n.nspname in ('public', 'private') or (n.nspname = 'auth' and c.relname = 'users')) order by 1"

# Records each run for the Health page and /api/ready (ADR 0071). Never fails the test itself.
note_run() {
  local detail=${2//\'/\'\'}
  docker exec supabase-db psql -U postgres -d postgres -qAt -v ON_ERROR_STOP=1 \
    -c "select public.app_note_job_run('restore_test', $1, '$detail')" >/dev/null 2>&1 || true
}

main() {
  trap 'note_run false "The restore test failed; see journalctl -u farbaek-db-restore-test."' ERR
  local latest
  latest=$(ls -1t "$DIR"/farbaek-*.dump 2>/dev/null | head -1)
  [ -n "$latest" ] || { echo "restore test: no backup to test"; note_run false "There was no backup to test."; exit 1; }
  trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
  docker rm -f "$NAME" >/dev/null 2>&1 || true

  local password
  password=$(openssl rand -hex 16)
  docker run -d --name "$NAME" -e POSTGRES_PASSWORD="$password" "$DB_IMAGE" >/dev/null
  local i
  for i in $(seq 1 60); do docker exec "$NAME" pg_isready -U postgres -h localhost >/dev/null 2>&1 && break; sleep 2; done

  # The image creates Supabase's own schemas at start; --clean replaces them with the backup's.
  docker exec -i -e PGPASSWORD="$password" "$NAME" pg_restore -h localhost -U supabase_admin -d postgres --clean --if-exists --no-owner <"$latest" >/dev/null 2>&1 || true

  local live restored missing=0 empty=0 name rows
  live=$(docker exec supabase-db psql -h localhost -U postgres -d postgres -AtF ' ' -c "$TABLES_SQL")
  restored=$(docker exec -e PGPASSWORD="$password" "$NAME" psql -h localhost -U supabase_admin -d postgres -AtF ' ' -c "$TABLES_SQL")
  while read -r name rows; do
    [ -n "$name" ] || continue
    if ! grep -q "^$name " <<<"$restored"; then missing=$((missing + 1)); echo "missing from the backup: $name"; continue; fi
    if [ "$rows" != 0 ] && grep -q "^$name 0$" <<<"$restored"; then empty=$((empty + 1)); echo "empty in the backup: $name"; fi
  done <<<"$live"

  if [ "$missing" = 0 ] && [ "$empty" = 0 ]; then
    echo "restore test passed: $(basename "$latest"), $(wc -l <<<"$restored") tables"
    note_run true "$(basename "$latest"), $(wc -l <<<"$restored") tables"
  else
    echo "restore test FAILED: $missing missing, $empty empty ($(basename "$latest"))"
    note_run false "$missing tables missing, $empty empty in $(basename "$latest")"
    exit 1
  fi
}

main "$@"
exit 0
