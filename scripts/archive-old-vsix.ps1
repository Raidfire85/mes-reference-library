# Moves packaged VSIX files from the repo root into oldver/ before a new build.
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$oldverDir = Join-Path $repoRoot 'oldver'

if (-not (Test-Path $oldverDir)) {
    New-Item -ItemType Directory -Path $oldverDir | Out-Null
}

$vsixFiles = @(Get-ChildItem -Path $repoRoot -Filter 'mes-reference-library-*.vsix' -File -ErrorAction SilentlyContinue)
if ($vsixFiles.Count -eq 0) {
    Write-Host 'No previous VSIX files to archive.'
    exit 0
}

foreach ($file in $vsixFiles) {
    $dest = Join-Path $oldverDir $file.Name
    Move-Item -LiteralPath $file.FullName -Destination $dest -Force
    Write-Host "Archived $($file.Name) -> oldver/"
}
