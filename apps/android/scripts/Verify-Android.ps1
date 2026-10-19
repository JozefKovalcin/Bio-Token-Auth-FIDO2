param(
    [string]$ServiceOrigin = 'https://auth.bio-token.test',
    [switch]$ConnectedDevice
)

$ErrorActionPreference = 'Stop'
$taskAndroidRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$taskBundledJdk = Join-Path $taskAndroidRoot '.tooling/jdk'
if (Test-Path -LiteralPath $taskBundledJdk) {
    $taskJdkDirectory = Get-ChildItem -LiteralPath $taskBundledJdk -Directory | Select-Object -First 1
    if ($taskJdkDirectory) { $env:JAVA_HOME = $taskJdkDirectory.FullName }
}
$taskBundledSdk = Join-Path $taskAndroidRoot '.tooling/android-sdk'
if (-not $env:ANDROID_HOME -and (Test-Path -LiteralPath $taskBundledSdk)) { $env:ANDROID_HOME = $taskBundledSdk }
if (Test-Path -LiteralPath (Join-Path $taskAndroidRoot '.tooling/gradle-home')) {
    $env:GRADLE_USER_HOME = Join-Path $taskAndroidRoot '.tooling/gradle-home'
}
$taskChecks = @('spotlessCheck', ':core:test', ':app:testDebugUnitTest', ':app:lintDebug', ':app:assembleDebug', ':app:assembleDebugAndroidTest')
if ($ConnectedDevice) { $taskChecks += ':app:connectedDebugAndroidTest' }
Push-Location -LiteralPath $taskAndroidRoot
try {
    & ./gradlew.bat @taskChecks "-PbioServiceOrigin=$ServiceOrigin" --no-daemon
    if ($LASTEXITCODE -ne 0) { throw "Android verification failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}
