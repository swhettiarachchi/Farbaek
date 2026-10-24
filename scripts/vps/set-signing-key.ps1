# Turns on signed ProofPacks (ADR 0062): makes Farbaek's Ed25519 signing key
# on the VPS itself, stores it as PROOFPACK_SIGNING_KEY and restarts the app.
# The private key is made on the server and never leaves it: nobody, including
# you, sees it. It refuses to replace a key that's already set, because
# evidence signed with the old one could no longer be checked.
# Run it in your own PowerShell window:
#
#   cd C:\Users\INTEL\Documents\FarBaek
#   & .\scripts\vps\set-signing-key.ps1
param(
  [string]$Server = "2.25.88.188",
  [string]$Key = "$HOME\.ssh\farbaek_vps"
)

# Runs on the server. Windows line endings are stripped on both sides, since
# bash reads a carriage return as part of a command.
$remote = @'
set -euo pipefail
envfile=/opt/farbaek/env/production.env
if [ ! -r "$envfile" ]; then
  echo "Can't read $envfile, so nothing changed."
  exit 2
fi
if grep -q '^PROOFPACK_SIGNING_KEY=.' "$envfile"; then
  echo "A signing key is already set, so nothing changed."
  exit 3
fi
key=$(openssl genpkey -algorithm ed25519 -outform DER | base64 -w0)
[ -n "$key" ] || { echo "openssl made no key, so nothing changed."; exit 4; }
printf 'PROOFPACK_SIGNING_KEY=%s\n' "$key" | farbaek-set-env
unset key
echo "Restarting the app with it (3 to 5 minutes)..."
farbaek-deploy --again
'@ -replace "`r", ""

Write-Host "Making the signing key on the server..." -ForegroundColor Cyan
$remote | ssh -i $Key -o StrictHostKeyChecking=accept-new "farbaek@$Server" "tr -d '\r' | bash -s"
if ($LASTEXITCODE -eq 0) {
  Write-Host "Done. New ProofPacks are signed, and the public key is at https://www.farbaek.com/.well-known/farbaek-keys.json" -ForegroundColor Green
}
