$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$data = Join-Path (Get-Location) 'infra/data'
New-Item -ItemType Directory -Force -Path $data | Out-Null
$pem = Join-Path $data 'bio-token-root.crt'
docker compose cp 'caddy:/data/caddy/pki/authorities/local/root.crt' $pem
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $pem)) {
    throw 'Koreňový certifikát Caddy sa nepodarilo exportovať. Najprv spustite aplikáciu.'
}
$certificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($pem)
$der = $certificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
$content = [Convert]::ToBase64String($der)
$profileId = [Guid]::NewGuid().ToString().ToUpperInvariant()
$certificateId = [Guid]::NewGuid().ToString().ToUpperInvariant()
$xml = @"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>PayloadContent</key><array><dict>
<key>PayloadContent</key><data>$content</data>
<key>PayloadDescription</key><string>Lokálna certifikačná autorita Bio Token Auth</string>
<key>PayloadDisplayName</key><string>Bio Token Auth LAN CA</string>
<key>PayloadIdentifier</key><string>sk.tuke.biotoken.rootca</string>
<key>PayloadType</key><string>com.apple.security.root</string>
<key>PayloadUUID</key><string>$certificateId</string>
<key>PayloadVersion</key><integer>1</integer>
</dict></array>
<key>PayloadDescription</key><string>Dôvera HTTPS pre Bio Token Auth v lokálnej sieti</string>
<key>PayloadDisplayName</key><string>Bio Token Auth – HTTPS</string>
<key>PayloadIdentifier</key><string>sk.tuke.biotoken.profile</string>
<key>PayloadOrganization</key><string>Bio Token Auth</string>
<key>PayloadRemovalDisallowed</key><false/>
<key>PayloadScope</key><string>System</string>
<key>PayloadType</key><string>Configuration</string>
<key>PayloadUUID</key><string>$profileId</string>
<key>PayloadVersion</key><integer>1</integer>
</dict></plist>
"@
$profile = Join-Path $data 'bio-token-ios-ca.mobileconfig'
[IO.File]::WriteAllText($profile, $xml, [Text.UTF8Encoding]::new($false))
$sha256 = [Security.Cryptography.SHA256]::Create()
try { $fingerprint = ([BitConverter]::ToString($sha256.ComputeHash($der))).Replace('-', '') }
finally { $sha256.Dispose() }
Write-Host "iOS profil: $profile"
Write-Host "SHA-256 certifikátu: $fingerprint"
