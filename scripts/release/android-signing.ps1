# Sets up signing for Farbaek for Android (ADR 0099), on Windows, once. Run it
# in your own PowerShell window. It makes the upload key Google Play knows the
# app by: an RSA 2048 key with a 30-year certificate, in a password-protected
# PKCS#12 keystore in your home folder. It shows the certificate's fingerprint
# (public: it goes in src/config/android-app.ts) and then copies the two
# secrets for GitHub, a name and then a value at a time. Nothing secret is
# shown on screen or goes into the repository.
#
#   powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\release\android-signing.ps1"
param(
  [string]$Folder = "$HOME\FarbaekAndroidSigning"
)

# Every OpenSSL step's exit code is checked; its progress output on stderr isn't an error.
$openssl = @("C:\Program Files\Git\usr\bin\openssl.exe", "C:\Program Files\Git\mingw64\bin\openssl.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $openssl) { Write-Host "OpenSSL wasn't found. It comes with Git for Windows; install Git, then run this again." -ForegroundColor Red; exit 1 }
New-Item -ItemType Directory -Force -Path $Folder | Out-Null
$keystore = Join-Path $Folder "farbaek-upload.p12"
if (Test-Path $keystore) {
  Write-Host "An upload keystore already exists in $Folder. Google Play knows the app by it, so it was kept, and its secrets are copied again." -ForegroundColor Yellow
}

$key = Join-Path $Folder "farbaek-upload.key"
$cert = Join-Path $Folder "farbaek-upload.pem"
$passwordFile = Join-Path $Folder "keystore-password.txt"
if (-not (Test-Path $keystore)) {
  & $openssl genrsa -out $key 2048 2>$null
  if ($LASTEXITCODE -ne 0) { Write-Host "The key couldn't be made." -ForegroundColor Red; exit 1 }
  & $openssl req -new -x509 -key $key -out $cert -days 10950 -subj "/CN=Farbaek/O=Svanflok/C=LK" 2>$null
  if ($LASTEXITCODE -ne 0) { Write-Host "The certificate couldn't be made." -ForegroundColor Red; exit 1 }
  $bytes = New-Object byte[] 24
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $password = [Convert]::ToBase64String($bytes) -replace '[+/=]', 'x'
  $env:FARBAEK_P12_PASS = $password
  & $openssl pkcs12 -export -inkey $key -in $cert -name farbaek-upload -out $keystore -passout env:FARBAEK_P12_PASS 2>$null
  $made = $LASTEXITCODE
  Remove-Item Env:FARBAEK_P12_PASS
  if ($made -ne 0) { Write-Host "The keystore couldn't be made." -ForegroundColor Red; exit 1 }
  # Kept beside the keystore, in your home folder only: Google Play needs this same key for every update.
  Set-Content -Path $passwordFile -Value $password -NoNewline
  Remove-Item $key
}
if (-not (Test-Path $passwordFile) -or -not (Test-Path $cert)) { Write-Host "The keystore's password or certificate is missing from $Folder, so nothing was copied. Restore the folder from your backup." -ForegroundColor Red; exit 1 }
$password = (Get-Content -Path $passwordFile -Raw).Trim()

$fingerprint = ((& $openssl x509 -in $cert -noout -fingerprint -sha256 2>$null) -join "") -replace '^.*=', ''
Write-Host "Upload certificate SHA-256 (public; it goes in src/config/android-app.ts):" -ForegroundColor Green
Write-Host $fingerprint -ForegroundColor Green

$values = [ordered]@{
  "ANDROID_KEYSTORE_BASE64"   = [Convert]::ToBase64String([IO.File]::ReadAllBytes($keystore))
  "ANDROID_KEYSTORE_PASSWORD" = $password
}
Start-Process "https://github.com/swhettiarachchi/Farbaek/settings/secrets/actions/new"
Write-Host "GitHub's New secret page is open. For each of the two secrets, this copies its name, then its value: paste each into GitHub with Ctrl+V. Don't copy anything else, or take a screenshot, meanwhile." -ForegroundColor Cyan
$n = 0
foreach ($name in $values.Keys) {
  $n++
  Read-Host -Prompt "Secret $n of 2. Press Enter to copy its NAME"
  Set-Clipboard -Value $name
  Write-Host "Copied the name. In GitHub, click the Name box and press Ctrl+V." -ForegroundColor Green
  Read-Host -Prompt "Then press Enter here to copy its VALUE"
  Set-Clipboard -Value $values[$name]
  Write-Host "Copied the value. Click the Secret box, press Ctrl+V, choose Add secret, then New repository secret." -ForegroundColor Green
}
Read-Host -Prompt "When the last one is added in GitHub, press Enter to clear the clipboard"
Set-Clipboard -Value " "
$values = $null; $password = $null
Write-Host "Done. The clipboard is cleared. Keep $Folder private and backed up: Google Play needs this upload key for every update." -ForegroundColor Green
