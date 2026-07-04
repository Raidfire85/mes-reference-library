param(
  [string]$VsixPath,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

if (-not $VsixPath) {
  $latest = Get-ChildItem -Path $repoRoot -Filter "mes-reference-library-*.vsix" -ErrorAction SilentlyContinue |
    ForEach-Object {
      $versionText = $_.BaseName -replace '^mes-reference-library-', ''
      if ($versionText -match '^\d+(\.\d+)*$') {
        [pscustomobject]@{ Path = $_.FullName; Version = [version]$versionText }
      }
    } |
    Sort-Object Version -Descending |
    Select-Object -First 1

  if ($latest) {
    $VsixPath = $latest.Path
  }
}

if (-not $VsixPath -or -not (Test-Path -LiteralPath $VsixPath)) {
  throw "VSIX not found. Run 'npm run build-vsix' first, or pass -VsixPath 'path\to\mes-reference-library-x.y.z.vsix'."
}

# Cursor/VS Code CLI uses Node internally; these deprecation warnings come from the
# editor CLI itself (punycode, url.parse), not from this extension.
$env:NODE_OPTIONS = "--disable-warning=DEP0040 --disable-warning=DEP0169"

$installArgs = @("--install-extension", (Resolve-Path -LiteralPath $VsixPath).Path)
if ($Force) {
  $installArgs += "--force"
}

Write-Host "Installing $VsixPath ..."
& cursor @installArgs
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host "Done. Reload Cursor (Developer: Reload Window) if the extension was already running."
