param([Parameter(Mandatory = $true)][string]$Origin)
$ErrorActionPreference = 'Stop'
$Origin = $Origin.TrimEnd('/')
if ($Origin -notmatch '^https://[^/]+$') { throw 'Použite HTTPS origin bez cesty.' }
$health = Invoke-RestMethod "$Origin/api/health"
if ($health.status -ne 'ok') { throw 'API nie je pripravené.' }
$page = Invoke-WebRequest $Origin -UseBasicParsing
if ($page.Content -notmatch 'Bio Token Auth') { throw 'Web nie je dostupný.' }
try {
    Invoke-RestMethod "$Origin/api/auth/logout" -Method Post -ContentType 'application/json' -Body '{}' | Out-Null
    throw 'CSRF ochrana nezamietla požiadavku bez Origin.'
} catch {
    if ([int]$_.Exception.Response.StatusCode -ne 403) { throw }
}
try {
    Invoke-RestMethod "$Origin/api/auth/me" | Out-Null
    throw 'Neprihlásený klient získal reláciu.'
} catch {
    if ([int]$_.Exception.Response.StatusCode -ne 401) { throw }
}
Write-Host 'PASS: dôveryhodné HTTPS, web, API, CSRF a neprihlásený prístup.'
Write-Host 'Pokračujte manuálnym testom heslo + TOTP podľa docs/lan-test.md.'
