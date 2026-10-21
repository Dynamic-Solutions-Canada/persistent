# Build and validate the package resource index without loading the app or changing Windows.
# ASCII ONLY: this script is compatible with Windows PowerShell 5.1.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$CatalogDirectory,
    [Parameter(Mandatory=$true)][string]$Layout,
    [Parameter(Mandatory=$true)][string]$MakePri,
    [Parameter(Mandatory=$true)][string]$EvidenceDirectory,
    [string]$PackagePath,
    [string]$MakeAppx
)
$ErrorActionPreference = 'Stop'
$toolProject = Join-Path $PSScriptRoot '..\tools\localization-resources\ManifestResources.csproj'
$hostPri = Join-Path $Layout 'Persistent.Desktop.pri'
if (-not (Test-Path $hostPri)) { throw 'Host runtime PRI is missing before package indexing.' }
$originalHostHash = (Get-FileHash $hostPri -Algorithm SHA256).Hash
$work = Join-Path $env:TEMP ("PersistentPackageResources-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $work, $EvidenceDirectory | Out-Null
try {
    $checkLayout = $Layout
    if ($PackagePath) {
        if (-not $MakeAppx) { throw 'Package verification requires MakeAppx.' }
        $checkLayout = Join-Path $work 'unpacked'
        & $MakeAppx unpack /p $PackagePath /d $checkLayout /o
        if ($LASTEXITCODE -ne 0) { throw 'Could not unpack the finished MSIX for resource validation.' }
    } else {
        $inputDirectory = Join-Path $work 'input'
        $strings = Join-Path $inputDirectory 'Strings'
        $manifest = Join-Path $Layout 'AppxManifest.xml'
        & dotnet run --project $toolProject --configuration Release -- $CatalogDirectory $manifest $strings
        if ($LASTEXITCODE -ne 0) { throw 'Could not generate canonical package resources.' }
        Copy-Item $hostPri (Join-Path $inputDirectory 'Persistent.Desktop.pri')
        $config = Join-Path $work 'priconfig.xml'
        & $MakePri createconfig /cf $config /dq lang-en-US /pv 10.0.0 /o
        if ($LASTEXITCODE -ne 0) { throw 'MakePri createconfig failed.' }
        & dotnet run --project $toolProject --configuration Release --no-build -- --configure-package $config $inputDirectory
        if ($LASTEXITCODE -ne 0) { throw 'Could not restrict the package resource inputs.' }
        [xml]$document = Get-Content $manifest -Raw
        $identity = $document.Package.Identity.Name
        # Exactly one host index, no loose XBFs or framework indexes. The PRI indexer
        # preserves host resources while merging its old root into the package identity.
        & $MakePri new /pr $inputDirectory /cf $config /mn $manifest /in $identity /of (Join-Path $Layout 'resources.pri') /o
        if ($LASTEXITCODE -ne 0) { throw 'MakePri package indexing failed.' }
        Copy-Item $config (Join-Path $EvidenceDirectory 'priconfig.xml') -Force
    }

    $packagedHost = Join-Path $checkLayout 'Persistent.Desktop.pri'
    if ((Get-FileHash $packagedHost -Algorithm SHA256).Hash -ne $originalHostHash) {
        throw 'The package changed the standalone host PRI.'
    }
    $packagePri = Join-Path $checkLayout 'resources.pri'
    if (-not (Test-Path $packagePri)) { throw 'Package root resources.pri is missing.' }
    $packageDump = Join-Path $EvidenceDirectory 'package.pri.xml'
    $hostDump = Join-Path $EvidenceDirectory 'host.pri.xml'
    & $MakePri dump /if $packagePri /of $packageDump /dt detailed /o
    if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the actual package-root PRI.' }
    & $MakePri dump /if $packagedHost /of $hostDump /dt detailed /o
    if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the actual host PRI.' }
    $report = & dotnet run --project $toolProject --configuration Release --no-build -- --verify-package $CatalogDirectory $checkLayout $packageDump $hostDump
    if ($LASTEXITCODE -ne 0) { throw 'Manifest/default/XAML resource resolution validation failed.' }
    $report | Set-Content (Join-Path $EvidenceDirectory 'validation.json') -Encoding UTF8
    Write-Host $report
    if ($PackagePath) { Write-Host "Verified actual packaged resources: $PackagePath" }
} finally {
    if (Test-Path $work) { Remove-Item $work -Recurse -Force }
}
