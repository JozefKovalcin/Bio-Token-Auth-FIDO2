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
$lines = @("APP_HOST=$AppHost", "POSTGRES_PASSWORD=$(New-HexSecret)", "TOTP_ENCRYPTION_KEY=$(New-HexSecret)")
[IO.File]::WriteAllLines((Join-Path (Get-Location) '.env'), $lines, (New-Object Text.UTF8Encoding $false))
Write-Host "Nastavenie vytvorené pre https://$AppHost. Spustite: docker compose up --build -d"
