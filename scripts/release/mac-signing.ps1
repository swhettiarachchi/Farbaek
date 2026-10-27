# Sets up signing for Farbaek Agent for Mac (ADR 0098), on Windows, once.
# Run it in your own PowerShell window. Secrets never appear on screen and
# never go into the repository: they're kept in a folder in your home
# folder, and each is put on the clipboard only when you're about to paste
# it into GitHub.
#
# 1. Make a certificate request:
#      powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\release\mac-signing.ps1" -Step request
#    Then at developer.apple.com > Certificates > + > Developer ID Application
#    (G2 Sub-CA), upload developer-id.csr and save the .cer it gives you into
#    the same folder.
# 2. Make an App Store Connect API key for notarization:
#    appstoreconnect.apple.com > Users and Access > Integrations >
#    App Store Connect API > Team Keys > Generate, access "Developer".
#    Download the AuthKey_....p8 (it's offered once) into your Downloads folder.
# 3. Package it all for GitHub:
#      powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\release\mac-signing.ps1" -Step github
param(
  [Parameter(Mandatory = $true)][ValidateSet("request", "github")][string]$Step,
  [string]$Name = "Suvin Hettiarachchi",
  [string]$TeamId = "65BULQ4657",
  [string]$Folder = "$HOME\FarbaekMacSigning",
  # App Store Connect's Issuer ID (not secret); asked for when it isn't given here.
  [string]$IssuerId = ""
)

# Every OpenSSL step's exit code is checked; its progress output on stderr isn't an error.
$openssl = @("C:\Program Files\Git\usr\bin\openssl.exe", "C:\Program Files\Git\mingw64\bin\openssl.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $openssl) { Write-Host "OpenSSL wasn't found. It comes with Git for Windows; install Git, then run this again." -ForegroundColor Red; exit 1 }
New-Item -ItemType Directory -Force -Path $Folder | Out-Null
$key = Join-Path $Folder "developer-id.key"
$csr = Join-Path $Folder "developer-id.csr"

if ($Step -eq "request") {
  if (Test-Path $key) {
    Write-Host "A key already exists in $Folder, so it was kept. Upload developer-id.csr from there." -ForegroundColor Yellow
  } else {
    & $openssl genrsa -out $key 2048 2>$null
    if ($LASTEXITCODE -ne 0) { Write-Host "The key couldn't be made." -ForegroundColor Red; exit 1 }
    & $openssl req -new -key $key -out $csr -subj "/CN=$Name/C=LK" 2>$null
    if ($LASTEXITCODE -ne 0) { Write-Host "The certificate request couldn't be made." -ForegroundColor Red; exit 1 }
  }
  Write-Host "Made $csr. Keep the folder: developer-id.key in it is private." -ForegroundColor Green
  Write-Host "Next: on the page that opens, choose Developer ID Application, then G2 Sub-CA, upload developer-id.csr, and download the certificate into $Folder." -ForegroundColor Cyan
  Start-Process "https://developer.apple.com/account/resources/certificates/add"
  Start-Process explorer.exe $Folder
  exit 0
}

# Step github: the certificate Apple gave back, with the private key, as a password-protected .p12.
if (-not (Test-Path $key)) { Write-Host "developer-id.key isn't in $Folder. Run -Step request first, then make the certificate from that request." -ForegroundColor Red; exit 1 }
# The newest .cer that is this team's Developer ID Application certificate. Apple's own intermediate
# certificate (saved by an earlier run) and any other certificates are passed over.
$pem = Join-Path $Folder "developer-id.pem"
$cer = $null; $subject = ""
$candidates = Get-ChildItem -Path $Folder, "$HOME\Downloads" -Filter "*.cer" -ErrorAction SilentlyContinue | Where-Object { $_.Name -notlike "DeveloperIDG2CA*" } | Sort-Object LastWriteTime -Descending
foreach ($c in $candidates) {
  & $openssl x509 -inform DER -in $c.FullName -out $pem 2>$null
  if ($LASTEXITCODE -ne 0) { & $openssl x509 -in $c.FullName -out $pem 2>$null }
  if ($LASTEXITCODE -ne 0) { continue }
  $s = (& $openssl x509 -in $pem -noout -subject 2>$null) -join " "
  if ($s -match "Developer ID Application" -and $s -match [regex]::Escape($TeamId)) { $cer = $c; $subject = $s; break }
}
if (-not $cer) { Write-Host "No Developer ID Application certificate for team $TeamId in $Folder or Downloads. Download it from Apple first." -ForegroundColor Red; exit 1 }
# The certificate must belong to this key: compare the public halves only.
$fromCert = (& $openssl x509 -in $pem -noout -pubkey 2>$null) -join "`n"
$fromKey = (& $openssl pkey -in $key -pubout 2>$null) -join "`n"
if ($fromCert -ne $fromKey) { Write-Host "That certificate was made from a different request. Upload developer-id.csr from $Folder and download the new certificate." -ForegroundColor Red; exit 1 }
Write-Host "Certificate: $subject" -ForegroundColor Green

# Apple's Developer ID intermediate, so the chain is complete on the build machine.
$g2 = Join-Path $Folder "DeveloperIDG2CA.der"
try { Invoke-WebRequest -UseBasicParsing -Uri "https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer" -OutFile $g2 }
catch { Write-Host "Apple's Developer ID intermediate certificate couldn't be downloaded. Check the internet connection, then run this again." -ForegroundColor Red; exit 1 }
$g2pem = Join-Path $Folder "DeveloperIDG2CA.pem"
& $openssl x509 -inform DER -in $g2 -out $g2pem 2>$null

$bytes = New-Object byte[] 24
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$password = [Convert]::ToBase64String($bytes) -replace '[+/=]', 'x'
$p12 = Join-Path $Folder "developer-id.p12"
$env:FARBAEK_P12_PASS = $password
# 3DES and SHA-1 inside the .p12: what macOS's keychain import reads everywhere.
& $openssl pkcs12 -export -inkey $key -in $pem -certfile $g2pem -name "Farbaek Developer ID" -out $p12 -passout env:FARBAEK_P12_PASS -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1 2>$null
$made = $LASTEXITCODE
Remove-Item Env:FARBAEK_P12_PASS
if ($made -ne 0) { Write-Host "The .p12 couldn't be made." -ForegroundColor Red; exit 1 }

$p8 = Get-ChildItem -Path "$HOME\Downloads", $Folder -Filter "AuthKey_*.p8" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $p8) { Write-Host "No AuthKey_....p8 in Downloads. Make the App Store Connect API key first (step 2 at the top of this script)." -ForegroundColor Red; exit 1 }
if ($p8.DirectoryName -ne $Folder) { Move-Item $p8.FullName (Join-Path $Folder $p8.Name) -Force; $p8 = Get-Item (Join-Path $Folder $p8.Name) }
$keyId = $p8.BaseName -replace '^AuthKey_', ''
$issuer = $IssuerId.Trim()
if (-not $issuer) { $issuer = (Read-Host -Prompt "Paste the Issuer ID shown above the keys in App Store Connect").Trim() }
if ($issuer -notmatch '^[0-9a-f-]{36}$') { Write-Host "That isn't an Issuer ID (36 characters with dashes), so nothing was copied." -ForegroundColor Red; exit 1 }

$values = [ordered]@{
  "MAC_CERT_P12_BASE64" = [Convert]::ToBase64String([IO.File]::ReadAllBytes($p12))
  "MAC_CERT_PASSWORD"   = $password
  "APPLE_API_KEY_P8"    = [IO.File]::ReadAllText($p8.FullName)
  "APPLE_API_KEY_ID"    = $keyId
  "APPLE_API_ISSUER"    = $issuer
}
Start-Process "https://github.com/swhettiarachchi/Farbaek/settings/secrets/actions/new"
Write-Host "GitHub's New secret page is open. For each of the five secrets, this copies its name, then its value: paste each into GitHub with Ctrl+V. Don't copy anything else meanwhile." -ForegroundColor Cyan
$n = 0
foreach ($name in $values.Keys) {
  $n++
  # The name goes on the clipboard too, so nothing is typed or copied by hand (which would replace the value).
  Read-Host -Prompt "Secret $n of 5. Press Enter to copy its NAME"
  Set-Clipboard -Value $name
  Write-Host "Copied the name. In GitHub, click the Name box and press Ctrl+V." -ForegroundColor Green
  Read-Host -Prompt "Then press Enter here to copy its VALUE"
  Set-Clipboard -Value $values[$name]
  Write-Host "Copied the value. Click the Secret box, press Ctrl+V, choose Add secret, then New repository secret." -ForegroundColor Green
}
Read-Host -Prompt "When the last one is added in GitHub, press Enter to clear the clipboard"
Set-Clipboard -Value " "
$values = $null; $password = $null
Write-Host "Done. The clipboard is cleared. Keep $Folder private: it holds the key that signs Farbaek Agent for Mac." -ForegroundColor Green
