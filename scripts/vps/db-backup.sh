#!/usr/bin/env bash
# Backs up Farbaek's self-hosted database (ADR 0036): a full custom-format
# pg_dump to /opt/farbaek/backups (mode 600), keeping the newest 14. When
# /opt/farbaek/env/backup.env holds an rclone remote named "offsite" (for
# Cloudflare R2: RCLONE_CONFIG_OFFSITE_TYPE=s3 and its keys), each dump is
# also copied there. Run nightly by farbaek-db-backup.timer, as farbaek.
set -euo pipefail

DIR=/opt/farbaek/backups
KEEP=14
BACKUP_ENV=/opt/farbaek/env/backup.env
RCLONE_IMAGE=rclone/rclone:1.71.1

# Records each run for the Health page and /api/ready (ADR 0071). Never fails the backup itself.
note_run() {
  docker exec supabase-db psql -U postgres -d postgres -qAt -v ON_ERROR_STOP=1 \n    -c "select public.app_note_job_run('db_backup', $1, '$2')" >/dev/null 2>&1 || true
}

main() {
  trap 'note_run false "The nightly backup failed; see journalctl -u farbaek-db-backup."' ERR
  install -d -m 700 "$DIR"
  local file="$DIR/farbaek-$(date -u +%Y%m%dT%H%M%SZ).dump"
  umask 077
  docker exec supabase-db pg_dump -h localhost -U supabase_admin -d postgres -Fc >"$file.partial"
  mv "$file.partial" "$file"
  echo "backup: $(basename "$file"), $(du -h "$file" | cut -f1)"

  # Keep the newest $KEEP.
  ls -1t "$DIR"/farbaek-*.dump | tail -n +$((KEEP + 1)) | xargs -r rm -f

  if [ -f "$BACKUP_ENV" ] && grep -Eq '^RCLONE_CONFIG_OFFSITE_TYPE=.+' "$BACKUP_ENV"; then
    local bucket
    bucket=$(grep -E '^OFFSITE_BUCKET=' "$BACKUP_ENV" | cut -d= -f2-)
    docker run --rm --env-file "$BACKUP_ENV" -v "$DIR:/backups:ro" "$RCLONE_IMAGE" \
      copy "/backups/$(basename "$file")" "offsite:${bucket:-farbaek-backups}/database/" --s3-no-check-bucket
    echo "copied off the server to ${bucket:-farbaek-backups}"
  else
    echo "no off-server copy: $BACKUP_ENV has no offsite remote yet (docs/deploy/vps.md)"
  fi
  note_run true "$(basename "$file")"
}

main "$@"
exit 0
