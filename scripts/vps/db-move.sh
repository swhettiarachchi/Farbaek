#!/usr/bin/env bash
# Copies Farbaek's database from Supabase Cloud into the self-hosted Supabase
# on this server (ADR 0036), following Supabase's guide "Restore a Platform
# Project to Self-Hosted": dump roles, schema and data with the Supabase CLI,
# restore them in one transaction with triggers off for the data, then compare
# the row counts of every table in public and private, and of auth's users,
# identities and two-factor factors. Runs as farbaek.
#
# The cloud connection string is MIGRATION_SOURCE_DB_URL in
# /opt/farbaek/env/migration.env, typed in by the owner. It's never printed.
#
#   db-move.sh            dump, restore into the self-hosted database, compare
#   db-move.sh --count    only compare the row counts
set -euo pipefail

CLI_VERSION=2.120.0
BIN=/opt/farbaek/bin
WORK_ROOT=/opt/farbaek/migration
MIGRATION_ENV=/opt/farbaek/env/migration.env
DB_IMAGE=supabase/postgres:17.6.1.136

COUNT_SQL="select n.nspname || '.' || c.relname, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind = 'r' and (n.nspname in ('public', 'private') or (n.nspname = 'auth' and c.relname in ('users', 'identities', 'mfa_factors'))) order by 1"

main() {
  [ -f "$MIGRATION_ENV" ] && grep -Eq '^MIGRATION_SOURCE_DB_URL=.+' "$MIGRATION_ENV" || { echo "Set MIGRATION_SOURCE_DB_URL in $MIGRATION_ENV first."; exit 1; }

  if [ "${1:-}" != "--count" ]; then
    install_cli
    local work
    work="$WORK_ROOT/$(date -u +%Y%m%dT%H%M%SZ)"
    install -d -m 700 "$work"

    step "Dump from Supabase Cloud"
    cloud_dump -f "$work/roles.sql" --role-only
    cloud_dump -f "$work/schema.sql"
    cloud_dump -f "$work/data.sql" --use-copy --data-only
    ls -l "$work"

    step "Postgres versions"
    local cloud ours
    cloud=$(with_source_env docker run --rm -e MIGRATION_SOURCE_DB_URL --entrypoint sh "$DB_IMAGE" -c 'psql "$MIGRATION_SOURCE_DB_URL" -Atc "show server_version"')
    ours=$(docker exec supabase-db psql -h localhost -U postgres -d postgres -Atc "show server_version")
    echo "cloud: $cloud, this server: $ours"
    if [ "${cloud%%.*}" != "${ours%%.*}" ]; then
      echo "The major versions differ; stopping. Use Supabase's matching compose file (docker-compose.pg15.yml or pg17)."
      exit 1
    fi

    step "Restore into the self-hosted database"
    { cat "$work/roles.sql" "$work/schema.sql"; echo "SET session_replication_role = replica;"; cat "$work/data.sql"; } |
      docker exec -i supabase-db psql -h localhost -U postgres -d postgres --single-transaction -v ON_ERROR_STOP=1 -q >"$work/restore.log" 2>&1 ||
      { echo "The restore failed and was rolled back. The first errors:"; grep -m 5 ERROR "$work/restore.log"; exit 1; }
    echo "restored"
  fi

  step "Row counts, Supabase Cloud against this server"
  local a b
  a=$(mktemp) b=$(mktemp)
  with_source_env docker run --rm -e MIGRATION_SOURCE_DB_URL --entrypoint sh "$DB_IMAGE" -c "psql \"\$MIGRATION_SOURCE_DB_URL\" -AtF ' ' -c \"$COUNT_SQL\"" >"$a"
  docker exec supabase-db psql -h localhost -U postgres -d postgres -AtF ' ' -c "$COUNT_SQL" >"$b"
  if diff -u --label cloud --label "this server" "$a" "$b"; then
    echo "All $(wc -l <"$a") tables match."
  else
    echo "The counts above differ."
    rm -f "$a" "$b"
    exit 1
  fi
  rm -f "$a" "$b"
}

# Runs a command with MIGRATION_SOURCE_DB_URL exported from the file. The value is never echoed.
with_source_env() {
  (set -a; . "$MIGRATION_ENV"; set +a; "$@")
}

# The Supabase CLI's dump of the cloud database, with the given flags.
cloud_dump() {
  (set -a; . "$MIGRATION_ENV"; set +a; "$BIN/supabase" db dump --db-url "$MIGRATION_SOURCE_DB_URL" "$@")
}

# The Supabase CLI, pinned and checked against its published checksum.
install_cli() {
  [ -x "$BIN/supabase" ] && "$BIN/supabase" --version 2>/dev/null | grep -qx "$CLI_VERSION" && return 0
  step "Supabase CLI $CLI_VERSION"
  local tmp base="https://github.com/supabase/cli/releases/download/v$CLI_VERSION"
  tmp=$(mktemp -d)
  local archive="supabase_${CLI_VERSION}_linux_amd64.tar.gz"
  curl -fsSL -o "$tmp/$archive" "$base/$archive"
  curl -fsSL -o "$tmp/checksums.txt" "$base/checksums.txt"
  (cd "$tmp" && grep " $archive\$" checksums.txt | sha256sum -c -)
  install -d -m 755 "$BIN"
  tar -xzf "$tmp/$archive" -C "$tmp" supabase
  install -m 755 "$tmp/supabase" "$BIN/supabase"
  rm -rf "$tmp"
  "$BIN/supabase" --version
}

step() { printf '\n== %s\n' "$1"; }

main "$@"
exit 0
