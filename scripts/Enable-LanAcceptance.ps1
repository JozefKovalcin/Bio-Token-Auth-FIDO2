[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)][System.Net.IPAddress]$ServerAddress,
    [Parameter(Mandatory = $true)][string]$ClientSubnet,
    [ValidatePattern('^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$')]
    [string]$AppHost = 'auth.bio-token.test',
    [Parameter(Mandatory = $true)][string]$RootCertificate,
    [Parameter(Mandatory = $true)][ValidatePattern('^[A-Fa-f0-9]{64}$')][string]$ExpectedCaSha256
)
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $WhatIfPreference -and -not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Spustite tento skript v PowerShelli ako spravca. -WhatIf nic nemeni.'
}
if ($ServerAddress.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork) { throw 'ServerAddress musi byt IPv4.' }
$subnetParts = $ClientSubnet.Split('/')
$subnetIp = $null
if ($subnetParts.Count -ne 2 -or -not [Net.IPAddress]::TryParse($subnetParts[0], [ref]$subnetIp) -or
    $subnetIp.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or $subnetParts[1] -notmatch '^\d+$' -or
    [int]$subnetParts[1] -lt 16 -or [int]$subnetParts[1] -gt 32) { throw 'ClientSubnet musi byt explicitna IPv4 podsiet /16 az /32.' }
$prefix = [int]$subnetParts[1]
$serverBytes = $ServerAddress.GetAddressBytes()
$subnetBytes = $subnetIp.GetAddressBytes()
for ($bit = 0; $bit -lt $prefix; $bit++) {
    $octet = [int][Math]::Floor($bit / 8)
    $mask = 1 -shl (7 - ($bit % 8))
    if (($serverBytes[$octet] -band $mask) -ne ($subnetBytes[$octet] -band $mask)) { throw 'ServerAddress nie je v ClientSubnet.' }
}
$certificatePath = (Resolve-Path -LiteralPath $RootCertificate).Path
if ((Get-FileHash -LiteralPath $certificatePath -Algorithm SHA256).Hash -ne $ExpectedCaSha256) { throw 'SHA256 verejneho CA suboru sa nezhoduje.' }
$certificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new($certificatePath)
$caExtension = $certificate.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.19' }
if ($certificate.HasPrivateKey -or -not $caExtension -or -not $caExtension.CertificateAuthority -or
    (Get-Date) -lt $certificate.NotBefore -or (Get-Date) -gt $certificate.NotAfter) { throw 'Ocakavany je platny verejny CA certifikat bez privatneho kluca.' }
$AppHost = $AppHost.ToLowerInvariant()
$rulePrefix = 'BioTokenAcceptance-' + $AppHost.Replace('.', '-')
$existingDns = @(Get-DnsClientNrptRule | Where-Object { $_.Namespace -contains $AppHost })
if ($existingDns.Count -gt 0 -and @($existingDns | Where-Object { @($_.NameServers).Count -ne 1 -or $_.NameServers -ne '127.0.0.1' }).Count -gt 0) {
    throw 'Existuje odlisne NRPT pravidlo; skript ho neprepise.'
}
$rules = @(@{Suffix='HTTPS';Protocol='TCP';Port=443}, @{Suffix='DNS-TCP';Protocol='TCP';Port=53}, @{Suffix='DNS-UDP';Protocol='UDP';Port=53})
$wslCreator = '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}'
$hasHyperV = [bool](Get-Command New-NetFirewallHyperVRule -ErrorAction SilentlyContinue)
# Check all collisions before making the first change.
foreach ($rule in $rules) {
    $name = "$rulePrefix-$($rule.Suffix)"
    if (Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue) { throw "Firewall pravidlo $name uz existuje; skript ho neprepise." }
    if ($hasHyperV) {
        $hyperVName = "$rulePrefix-WSL-$($rule.Suffix)"
        if (Get-NetFirewallHyperVRule -Name $hyperVName -ErrorAction SilentlyContinue) { throw "Hyper-V pravidlo $hyperVName uz existuje; skript ho neprepise." }
    }
}
foreach ($rule in $rules) {
    $name = "$rulePrefix-$($rule.Suffix)"
    if ($PSCmdlet.ShouldProcess("$ServerAddress port $($rule.Port)/$($rule.Protocol), iba $ClientSubnet", 'Pridat Windows firewall pravidlo')) {
        New-NetFirewallRule -Name $name -DisplayName $name -Direction Inbound -Action Allow -Protocol $rule.Protocol -LocalPort $rule.Port -LocalAddress $ServerAddress.IPAddressToString -RemoteAddress $ClientSubnet -Profile Any | Out-Null
    }
}
if ($hasHyperV) {
    foreach ($rule in $rules) {
        $name = "$rulePrefix-WSL-$($rule.Suffix)"
        if ($PSCmdlet.ShouldProcess("WSL port $($rule.Port)/$($rule.Protocol), iba $ClientSubnet", 'Pridat Hyper-V firewall pravidlo')) {
            New-NetFirewallHyperVRule -Name $name -DisplayName $name -Direction Inbound -Action Allow -VMCreatorId $wslCreator -Protocol $rule.Protocol -LocalPorts $rule.Port -LocalAddresses $ServerAddress.IPAddressToString -RemoteAddresses $ClientSubnet | Out-Null
        }
    }
}
if ($existingDns.Count -eq 0 -and $PSCmdlet.ShouldProcess("$AppHost -> lokalny DNS 127.0.0.1", 'Pridat presne NRPT pravidlo')) {
    Add-DnsClientNrptRule -Namespace $AppHost -NameServers '127.0.0.1' -Comment $rulePrefix | Out-Null
}
if ($PSCmdlet.ShouldProcess("CurrentUser Root, CA SHA256 $ExpectedCaSha256", 'Importovat overeny verejny CA certifikat')) {
    Import-Certificate -FilePath $certificatePath -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
}
Write-Host 'Konfiguracia pripravena. Skutocne DNS/HTTPS a telefon este overte samostatne. B/C tento skript nezapina.'
