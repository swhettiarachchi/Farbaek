# Makes the account app store reviewers sign in with (ADR 0151): an email
# address with a password, already confirmed, in Farbaek's own Auth on the
# VPS. Reviewers sign in at www.farbaek.com/sign-in/password. Run by the
# owner, never by Claude: it creates an account and you choose its password.
#
# The password is asked for twice and shows as stars. It goes to the server
# over SSH on standard input, never on a command line, and isn't saved here.
# An address that already has an account is refused, so a real account never
# gets a password by mistake.
#
# Run, in your own PowerShell window:
#
#   powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\add-review-account.ps1"
#
# Options:
#   -Email play@farbaek.com    another address; default hello@farbaek.com
param(
  [string]$Email = "hello@farbaek.com",
  [string]$Server = "2.25.88.188",
  [string]$Key = "$HOME\.ssh\farbaek_vps"
)

$Email = $Email.Trim().ToLower()
if ($Email -notmatch '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$') { Write-Host "'$Email' isn't an email address, so nothing changed." -ForegroundColor Red; exit 1 }

function Read-Secret([string]$prompt) {
  $secure = Read-Host -AsSecureString -Prompt $prompt
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

Write-Host "Making the review account $Email." -ForegroundColor Cyan
Write-Host "Choose a new password of at least 16 characters, used nowhere else. Keep it in your password manager." -ForegroundColor DarkGray
$first = Read-Secret "Password for $Email"
if ($first.Length -lt 16) { $first = $null; Write-Host "That's shorter than 16 characters, so nothing changed." -ForegroundColor Red; exit 1 }
$second = Read-Secret "The same password again"
if ($first -cne $second) { $first = $null; $second = $null; Write-Host "The two didn't match, so nothing changed." -ForegroundColor Red; exit 1 }
$second = $null

# Auth's admin API, called on the server with the app's own settings. The
# whole script, with the request in a quoted heredoc, reaches bash on standard
# input: no quotes pass through Windows' argument handling, and neither the
# key nor the password is ever on a command line.
$remote = @'
set -eu
env=/opt/farbaek/env/production.env
url=$(sed -n 's/^NEXT_PUBLIC_SUPABASE_URL=//p' "$env" | head -n1 | tr -d '\r')
key=$(sed -n 's/^SUPABASE_SECRET_KEY=//p' "$env" | head -n1 | tr -d '\r')
[ -n "$url" ] && [ -n "$key" ] || { echo "settings-missing"; exit 1; }
umask 077
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
printf 'apikey: %s\nAuthorization: Bearer %s\nContent-Type: application/json\n' "$key" "$key" > "$tmp/headers"
code=$(curl -sS -o "$tmp/out" -w '%{http_code}' -X POST "$url/auth/v1/admin/users" -H @"$tmp/headers" --data-binary @- <<'FARBAEK_BODY'
__BODY__
FARBAEK_BODY
) || { echo "unreachable"; exit 1; }
case "$code" in 200|201) echo "created"; exit 0 ;; esac
if grep -qiE 'email_exists|already (been )?registered' "$tmp/out"; then echo "exists"; exit 2; fi
echo "refused $code $(grep -oE '"(msg|message|error_code)":"[^"]*"' "$tmp/out" | head -n2 | tr '\n' ' ')"
exit 1
'@

# One line of JSON, so it can't end the heredoc early; bash runs Unix line endings only.
$body = @{ email = $Email; password = $first; email_confirm = $true } | ConvertTo-Json -Compress
$first = $null
$script = ($remote -replace "`r", "").Replace("__BODY__", $body)
$body = $null
# Windows PowerShell pipes ASCII to programs unless told otherwise; the password may have other characters.
$OutputEncoding = New-Object System.Text.UTF8Encoding $false
$answer = @($script | ssh -i $Key -o StrictHostKeyChecking=accept-new "farbaek@$Server" "bash -s")
$status = $LASTEXITCODE
$script = $null
$line = ($answer | Select-Object -Last 1)

if ($status -eq 0 -and $line -eq "created") {
  Write-Host "Done. $Email can sign in with that password." -ForegroundColor Green
  Write-Host "Next:" -ForegroundColor Cyan
  Write-Host "  1. Sign in once at https://www.farbaek.com/sign-in/password, so its workspace is made."
  Write-Host "  2. In Play Console, Sign in details: Yes, then Add instructions, with this address and the password."
  exit 0
}
if ($line -eq "exists") { Write-Host "$Email already has a Farbaek account, so nothing changed. Run it again with -Email and an address that has none." -ForegroundColor Yellow; exit 1 }
if ($line -eq "settings-missing") { Write-Host "The server's settings don't name Farbaek's Auth, so nothing changed. Tell Claude." -ForegroundColor Red; exit 1 }
if ($line -eq "unreachable") { Write-Host "The server couldn't reach Farbaek's Auth, so nothing changed. Try again in a minute." -ForegroundColor Red; exit 1 }
if ($line) { Write-Host "Auth didn't make the account: $line" -ForegroundColor Red } else { Write-Host "The server didn't answer. Check the connection and try again." -ForegroundColor Red }
exit 1
