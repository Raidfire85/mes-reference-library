$RepoRoot = Split-Path $PSScriptRoot -Parent
$WikiRoot = Join-Path $RepoRoot 'wiki'
$Source = Join-Path $RepoRoot 'bin\Debug\net472'

if (-not (Test-Path $Source)) {
    throw "Backup source not found: $Source"
}

if (-not (Test-Path $WikiRoot)) {
    New-Item -ItemType Directory -Path $WikiRoot -Force | Out-Null
}

Write-Host "Restoring HTML from $Source ..."
Copy-Item -Path (Join-Path $Source '*.html') -Destination $WikiRoot -Force
Write-Host "Restored $((Get-ChildItem $Source -Filter '*.html').Count) files"

& (Join-Path $PSScriptRoot 'Convert-MesWikiHtml.ps1') -Root $WikiRoot

Write-Host 'Validating table counts ...'
$checks = @(
    @{ File = 'SpawnGroup.html'; MinTables = 10 },
    @{ File = 'Core-Behavior.html'; MinTables = 5 },
    @{ File = 'Home.html'; MinTables = 0 }
)

foreach ($check in $checks) {
    $path = Join-Path $WikiRoot $check.File
    $count = ([regex]::Matches([System.IO.File]::ReadAllText($path), '<table')).Count
    if ($count -lt $check.MinTables) {
        throw "$($check.File) validation failed: found $count tables, expected at least $($check.MinTables)"
    }
    Write-Host "OK $($check.File): $count tables"
}

Write-Host 'Restore and conversion complete.'
