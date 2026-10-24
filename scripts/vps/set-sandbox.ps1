# Connects the sandbox Farbaek runs checks in (Vercel Sandbox, ADR 0016).
# Asks for a Vercel access token (hidden), checks with Vercel that it can
# reach the sandbox project, then saves SANDBOX_PROVIDER, the token, the team
# ID and the project ID on the VPS, and in this checkout's local settings so
# `pnpm sandbox:smoke` can prove the isolation before checks are switched on.
# The token isn't printed or saved anywhere else. Run it in your own
# PowerShell window, from any folder, with your team and project IDs:
#
#   powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\set-sandbox.ps1" -TeamId team_... -ProjectId prj_...
param(
  [Parameter(Mandatory = $true)][string]$TeamId,
  [Parameter(Mandatory = $true)][string]$ProjectId,
  [string]$Server = "2.25.88.188",
  [string]$Key = "$HOME\.ssh\farbaek_vps"
)

if ($TeamId -notmatch '^team_[A-Za-z0-9]{10,40}$') { Write-Host "The team ID should look like team_..., so nothing changed." -ForegroundColor Red; exit 1 }
if ($ProjectId -notmatch '^prj_[A-Za-z0-9]{10,40}$') { Write-Host "The project ID should look like prj_..., so nothing changed." -ForegroundColor Red; exit 1 }

$secure = Read-Host -AsSecureString -Prompt "Vercel access token (it shows as stars)"
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $token = ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)).Trim() }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
if (-not $token) { Write-Host "Nothing typed, so nothing changed." -ForegroundColor Yellow; exit 1 }

# Ask Vercel whether this token can see the project. Only the status code is shown.
Write-Host "Checking the token with Vercel..." -ForegroundColor Cyan
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
try {
  $project = Invoke-RestMethod -Method Get -Uri "https://api.vercel.com/v9/projects/$($ProjectId)?teamId=$($TeamId)" -Headers @{ Authorization = "Bearer $token" } -TimeoutSec 30
  Write-Host "Vercel accepted it: project $($project.name)." -ForegroundColor Green
} catch {
  $code = $null
  if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
  $token = $null
  if ($code -eq 401 -or $code -eq 403) { Write-Host "Vercel refused the token ($code). Copy it again, or make a new one, and rerun this. Nothing changed." -ForegroundColor Red }
  elseif ($code -eq 404) { Write-Host "Vercel found no such project in that team (404). Check the two IDs. Nothing changed." -ForegroundColor Red }
  else { Write-Host "Couldn't reach Vercel ($code). Check the connection and rerun this. Nothing changed." -ForegroundColor Red }
  exit 1
}

$lines = @("SANDBOX_PROVIDER=vercel", "SANDBOX_VERCEL_TOKEN=$token", "SANDBOX_VERCEL_TEAM_ID=$TeamId", "SANDBOX_VERCEL_PROJECT_ID=$ProjectId")

Write-Host "Saving it on the server..." -ForegroundColor Cyan
$lines | ssh -i $Key -o StrictHostKeyChecking=accept-new "farbaek@$Server" farbaek-set-env
if ($LASTEXITCODE -ne 0) { $token = $null; $lines = $null; Write-Host "The server didn't save it, so nothing changed there. Check the connection and rerun this." -ForegroundColor Red; exit 1 }

# The same four settings in this checkout's local settings, replacing any
# earlier ones, with Unix line endings and no byte order mark.
$local = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..\..")) ".env.local"
$keep = @()
if (Test-Path $local) {
  $names = $lines | ForEach-Object { $_.Split("=")[0] + "=" }
  $keep = @(Get-Content -LiteralPath $local -Encoding UTF8 | Where-Object { $line = $_; -not ($names | Where-Object { $line.StartsWith($_) }) })
}
[IO.File]::WriteAllText($local, ((@($keep) + $lines) -join "`n") + "`n", (New-Object Text.UTF8Encoding $false))
$token = $null; $lines = $null

Write-Host "Done. The sandbox settings are saved. Tell Claude, and it will prove the sandbox's isolation, then switch checks on." -ForegroundColor Green
