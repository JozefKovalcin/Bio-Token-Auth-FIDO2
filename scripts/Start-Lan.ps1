param([string]$AppHost)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker Desktop nie je dostupný. Nainštalujte ho a povoľte Linux kontajnery s WSL 2.'
}
docker info --format '{{.OSType}}' *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Spúšťam Docker Desktop. Prvé spustenie môže chvíľu trvať.'
    docker desktop start --detach
    if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop sa nepodarilo spustiť. Skontrolujte WSL 2 a hlásenie aplikácie Docker Desktop.' }
    $deadline = (Get-Date).AddSeconds(90)
    do {
        Start-Sleep -Seconds 3
        docker info --format '{{.OSType}}' *> $null
        $ready = $LASTEXITCODE -eq 0
    } until ($ready -or (Get-Date) -ge $deadline)
    if (-not $ready) { throw 'Docker engine neodpovedá. V Docker Desktop skontrolujte stav a v PowerShelli vykonajte wsl --status.' }
}
$osType = docker info --format '{{.OSType}}'
if ($osType -ne 'linux') { throw 'Prepnite Docker Desktop na Linux kontajnery.' }
if (-not (Test-Path -LiteralPath '.env')) {
    if (-not $AppHost) { throw 'Pri prvom spustení zadajte -AppHost s LAN adresou servera.' }
    & (Join-Path $PSScriptRoot 'Init-Lan.ps1') -AppHost $AppHost
} elseif ($AppHost) {
    $existingHost = ((Get-Content -LiteralPath '.env' | Where-Object { $_ -match '^APP_HOST=' }) -replace '^APP_HOST=', '').Trim()
    if ($existingHost -ne $AppHost.ToLowerInvariant()) { throw 'APP_HOST sa líši od existujúcej konfigurácie. Upravte ho v .env; šifrovacie kľúče zachovajte.' }
}
$runtimeFlags = @{}
Get-Content -LiteralPath '.env' | ForEach-Object {
    if ($_ -match '^(WEBAUTHN_ENABLED|MODE_C_ENABLED|APP_HOST)=(.*)$') { $runtimeFlags[$Matches[1]] = $Matches[2].Trim() }
}
if ($runtimeFlags['WEBAUTHN_ENABLED'] -eq 'true') {
    $parsedIp = $null
    if ([Net.IPAddress]::TryParse($runtimeFlags['APP_HOST'], [ref]$parsedIp)) {
        throw 'WebAuthn vyžaduje stabilné DNS meno v APP_HOST a WEBAUTHN_RP_ID. Zachovajte existujúce tajomstvá a postupujte podľa docs/modes-b-c.md.'
    }
}
$composeProfile = @()
if ($runtimeFlags['MODE_C_ENABLED'] -eq 'true') { $composeProfile = @('--profile', 'mode-c') }
docker compose @composeProfile up --build -d --wait
if ($LASTEXITCODE -ne 0) { throw 'Spustenie zlyhalo. Podrobnosti: docker compose logs --tail 50' }
Write-Host 'Kontajnery sú pripravené. Pred prvým prihlásením nastavte dôveru HTTPS podľa docs/lan-test.md.'
