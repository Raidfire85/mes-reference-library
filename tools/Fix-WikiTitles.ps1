$RepoRoot = Split-Path $PSScriptRoot -Parent
$WikiRoot = Join-Path $RepoRoot 'wiki'

Get-ChildItem -Path $WikiRoot -Filter '*.html' -File | ForEach-Object {
    $text = [System.IO.File]::ReadAllText($_.FullName)
    $updated = [regex]::Replace(
        $text,
        '<title>\s*(.+?)\s*(?:[\u00C2\u00B7\u00B7]|\s|&middot;)*\s*MES Reference Library\s*</title>',
        '<title>$1 &middot; MES Reference Library</title>'
    )
    if ($updated -ne $text) {
        [System.IO.File]::WriteAllText($_.FullName, $updated, [System.Text.UTF8Encoding]::new($false))
        Write-Host "Fixed: $($_.Name)"
    }
}

$prototype = Join-Path $WikiRoot 'Home.clean.html'
if (Test-Path $prototype) {
    Remove-Item $prototype
    Write-Host 'Removed Home.clean.html'
}

Write-Host 'Done'
