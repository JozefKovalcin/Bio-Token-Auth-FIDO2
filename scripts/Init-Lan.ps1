param([Parameter(Mandatory = $true)][string]$AppHost)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if ($AppHost -notmatch '^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$') {
    throw 'Zadajte IPv4 adresu alebo DNS meno bez https://, portu a cesty.'
}
$AppHost = $AppHost.ToLowerInvariant()
if (Test-Path -LiteralPath '.env') { throw '.env už existuje. Upravte APP_HOST ručne; pôvodné šifrovacie kľúče zachovajte.' }
function New-HexSecret {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}
$isDnsName = $AppHost -match '^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$'
$rpId = if ($isDnsName) { $AppHost } else { '' }
$lines = @("APP_HOST=$AppHost", "POSTGRES_PASSWORD=$(New-HexSecret)", "TOTP_ENCRYPTION_KEY=$(New-HexSecret)",
    'WEBAUTHN_ENABLED=false', "WEBAUTHN_RP_ID=$rpId", 'WEBAUTHN_TRUSTED_ROOTS_FILE=/config/webauthn-roots.json',
    'WEBAUTHN_AAGUID_ALLOWLIST=', 'MODE_C_ENABLED=false', 'MODE_C_HARDWARE_VERIFIED=false',
    'ATTESTATION_SERVICE_URL=http://attestation:8081', "ATTESTATION_SERVICE_TOKEN=$(New-HexSecret)",
    'ATTESTATION_PACKAGE_NAME=sk.biotoken.android', 'ATTESTATION_SIGNING_CERT_SHA256=', 'ATTESTATION_MIN_APP_VERSION=1')
New-Item -ItemType Directory -Force -Path (Join-Path (Get-Location) 'infra/data') | Out-Null
[IO.File]::WriteAllLines((Join-Path (Get-Location) '.env'), $lines, (New-Object Text.UTF8Encoding $false))
Write-Host "Nastavenie vytvorené pre https://$AppHost. Spustite: docker compose up --build -d"
if (-not $isDnsName) { Write-Host 'Pre režimy B/C použite stabilné DNS meno namiesto IP adresy. Kľúče a dáta zachovajte.' }
