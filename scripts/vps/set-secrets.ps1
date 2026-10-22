# Asks for Farbaek's production secrets one at a time and stores them on the
# VPS (docs/deploy/vps.md). Paste each value (right-click) and press Enter:
# what you paste shows as stars, goes straight to the server over SSH, and
# isn't saved on this computer. Run it in your own PowerShell window:
#
#   cd C:\Users\INTEL\Documents\FarBaek
#   & .\scripts\vps\set-secrets.ps1
param(
  [string]$Server = "2.25.88.188",
  [string]$Key = "$HOME\.ssh\farbaek_vps"
)

$required = @(
  @{ Name = "SUPABASE_SECRET_KEY"; Where = "Supabase > Project Settings > API Keys > Secret keys > copy icon" },
  @{ Name = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"; Where = "Supabase > API Keys > Publishable key > copy icon" },
  @{ Name = "ANTHROPIC_API_KEY"; Where = "console.anthropic.com > API keys" }
)
$optional = @("GEMINI_API_KEY", "SANDBOX_PROVIDER", "SANDBOX_VERCEL_TOKEN", "SANDBOX_VERCEL_TEAM_ID", "SANDBOX_VERCEL_PROJECT_ID", "SANDBOX_ISOLATION_VERIFIED_AT", "SANDBOX_PREVIEW_DOMAIN", "EMAIL_PROVIDER_API_KEY")
$random = @("SANDBOX_PREVIEW_SECRET", "SANDBOX_CRON_SECRET")

function Read-Secret([string]$Prompt) {
  $secure = Read-Host -AsSecureString -Prompt $Prompt
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)).Trim() }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function New-RandomSecret {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

$lines = New-Object System.Collections.Generic.List[string]
Write-Host ""
Write-Host "Paste each value with a right-click, then press Enter. It shows as stars." -ForegroundColor Cyan
Write-Host ""
foreach ($item in $required) {
  Write-Host "Where to copy it: $($item.Where)"
  do { $value = Read-Secret $item.Name } while (-not $value)
  $lines.Add("$($item.Name)=$value")
}
Write-Host ""
Write-Host "Optional: press Enter to skip any you don't use." -ForegroundColor Cyan
foreach ($name in $optional) {
  $value = Read-Secret "$name (Enter to skip)"
  if ($value) { $lines.Add("$name=$value") }
}
foreach ($name in $random) {
  $value = Read-Secret "$name (Enter to make a new random one)"
  if (-not $value) { $value = New-RandomSecret }
  $lines.Add("$name=$value")
}

Write-Host ""
Write-Host "Sending to the server..." -ForegroundColor Cyan
$lines | ssh -i $Key -o StrictHostKeyChecking=accept-new "farbaek@$Server" farbaek-set-env
$lines.Clear()
Write-Host "Done. You can close this window." -ForegroundColor Green
