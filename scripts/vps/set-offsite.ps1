# Turns on off-server copies of the nightly database backup (ADR 0036):
# Cloudflare R2. Asks for the R2 token's two keys (stars as you paste), saves
# them in /opt/farbaek/env/backup.env on the server, then takes a backup
# straight away to prove the copy reaches R2. Nothing is saved on this computer.
#
# Before it: in Cloudflare, R2 > Create bucket "farbaek-backups", with a
# lifecycle rule that deletes objects after 14 days (the Privacy Policy's
# backup period), and R2 > Manage API tokens > Create a token with "Object
# Read & Write" on that bucket only. Then run, in your own PowerShell window,
# with your account ID (the 32 characters in the dashboard's address):
#
#   powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\set-offsite.ps1" -AccountId <account id>
param(
  [Parameter(Mandatory = $true)][string]$AccountId,
  [string]$Bucket = "farbaek-backups",
  [string]$Server = "2.25.88.188",
  [string]$Key = "$HOME\.ssh\farbaek_vps"
)

$ssh = @("-i", $Key, "-o", "StrictHostKeyChecking=accept-new", "farbaek@$Server")
$AccountId = $AccountId.Trim().ToLower()
if ($AccountId -notmatch '^[0-9a-f]{32}$') { Write-Host "That isn't an account ID (32 letters and digits), so nothing changed." -ForegroundColor Red; exit 1 }
if ($Bucket -notmatch '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$') { Write-Host "That isn't a bucket name, so nothing changed." -ForegroundColor Red; exit 1 }

function Read-Secret([string]$prompt) {
  $secure = Read-Host -AsSecureString -Prompt $prompt
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)).Trim() }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

$id = Read-Secret "R2 token: Access Key ID"
$secret = Read-Secret "R2 token: Secret Access Key"
# Checked without showing them: a wrong paste shouldn't end up on screen.
if ($id -notmatch '^[0-9a-f]{32}$' -or $secret -notmatch '^[0-9a-f]{64}$') {
  $id = $null; $secret = $null
  Write-Host "Those don't look like an R2 Access Key ID (32 characters) and Secret Access Key (64), so nothing changed." -ForegroundColor Red
  exit 1
}

Write-Host "Saving them on the server..." -ForegroundColor Cyan
@(
  "RCLONE_CONFIG_OFFSITE_TYPE=s3",
  "RCLONE_CONFIG_OFFSITE_PROVIDER=Cloudflare",
  "RCLONE_CONFIG_OFFSITE_REGION=auto",
  "RCLONE_CONFIG_OFFSITE_ENDPOINT=https://$AccountId.r2.cloudflarestorage.com",
  "RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID=$id",
  "RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY=$secret",
  "OFFSITE_BUCKET=$Bucket"
) -join "`n" | ssh @ssh "farbaek-set-env --file /opt/farbaek/env/backup.env"
$saved = $LASTEXITCODE
$id = $null; $secret = $null
if ($saved -ne 0) { Write-Host "The server didn't save them, so nothing changed." -ForegroundColor Red; exit 1 }

Write-Host "Taking a backup now and copying it to R2 (under a minute)..." -ForegroundColor Cyan
$out = ssh @ssh "farbaek-db-backup 2>&1"
if ($LASTEXITCODE -eq 0 -and ($out -join "`n") -match "copied off the server") {
  Write-Host "Done. Every nightly backup now also goes to R2 ($Bucket)." -ForegroundColor Green
  exit 0
}
Write-Host "The backup ran, but the copy to R2 didn't succeed. Check the token is for the '$Bucket' bucket with Object Read & Write, then run this again." -ForegroundColor Red
exit 1
