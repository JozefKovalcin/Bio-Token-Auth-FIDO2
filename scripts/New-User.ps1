param([Parameter(Mandatory = $true)][string]$Username)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$secure = Read-Host 'Heslo nového účtu (8 až 128 znakov)' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$previousEncoding = $OutputEncoding
try {
    $OutputEncoding = New-Object Text.UTF8Encoding $false
    $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    @{ username = $Username; password = $password } | ConvertTo-Json -Compress | docker compose exec -T api node dist/api/create-user.js
    if ($LASTEXITCODE -ne 0) { throw 'Vytvorenie účtu zlyhalo.' }
} finally {
    $OutputEncoding = $previousEncoding
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    $password = $null
}
