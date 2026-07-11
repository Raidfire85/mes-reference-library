# Generates extension icons from media/MeridiousIcon.jpg (MES helmet portrait).
# - icon.png (root + media): marketplace icon with solid background (visible on Open VSX dark UI)
# - activitybar.svg: single-color silhouette with fill="currentColor" (VS/Cursor tint per theme)
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$repoRoot = Join-Path $PSScriptRoot '..'
$mediaDir = Join-Path $repoRoot 'media'
$sourcePath = Join-Path $mediaDir 'MeridiousIcon.jpg'
$mediaIconPath = Join-Path $mediaDir 'icon.png'
$rootIconPath = Join-Path $repoRoot 'icon.png'
$activitySvgPath = Join-Path $mediaDir 'activitybar.svg'

if (-not (Test-Path $sourcePath)) {
    throw "Missing source image: $sourcePath"
}

function Remove-WhiteBackground([System.Drawing.Bitmap]$bmp, [int]$threshold = 235) {
    for ($x = 0; $x -lt $bmp.Width; $x++) {
        for ($y = 0; $y -lt $bmp.Height; $y++) {
            $c = $bmp.GetPixel($x, $y)
            if ($c.A -gt 0 -and $c.R -ge $threshold -and $c.G -ge $threshold -and $c.B -ge $threshold) {
                $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 255, 255, 255))
            }
        }
    }
}

function New-PortraitMask([int]$size) {
    $source = [System.Drawing.Image]::FromFile($sourcePath)
    try {
        $bmp = New-Object System.Drawing.Bitmap -ArgumentList @($size, $size)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $g.Clear([System.Drawing.Color]::Transparent)
        $g.DrawImage($source, 0, 0, $size, $size)
        $g.Dispose()
        Remove-WhiteBackground $bmp
        return $bmp
    } finally {
        $source.Dispose()
    }
}

function Test-MaskPixel($bmp, $x, $y) {
    if ($x -lt 0 -or $y -lt 0 -or $x -ge $bmp.Width -or $y -ge $bmp.Height) {
        return $false
    }
    return $bmp.GetPixel($x, $y).A -gt 64
}

function New-MarketplaceIcon([int]$size) {
    $mask = New-PortraitMask 96
    $bmp = New-Object System.Drawing.Bitmap -ArgumentList @($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear([System.Drawing.Color]::FromArgb(255, 30, 72, 110))

    $pad = 16
    $drawSize = $size - (2 * $pad)
    for ($y = 0; $y -lt $drawSize; $y++) {
        for ($x = 0; $x -lt $drawSize; $x++) {
            $sx = [int]($x * $mask.Width / $drawSize)
            $sy = [int]($y * $mask.Height / $drawSize)
            if (Test-MaskPixel $mask $sx $sy) {
                $bmp.SetPixel($x + $pad, $y + $pad, [System.Drawing.Color]::White)
            }
        }
    }

    $mask.Dispose()
    $g.Dispose()
    return $bmp
}

function Export-ActivityBarSvg([int]$size, [string]$path) {
    $mask = New-PortraitMask $size
    $rects = New-Object System.Collections.Generic.List[string]

    for ($y = 0; $y -lt $size; $y++) {
        for ($x = 0; $x -lt $size; $x++) {
            if (Test-MaskPixel $mask $x $y) {
                [void]$rects.Add("<rect x=""$x"" y=""$y"" width=""1"" height=""1""/>")
            }
        }
    }

    $mask.Dispose()

    $svg = @"
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 $size $size" role="img" aria-label="MES Reference">
  <g fill="currentColor">
    $($rects -join '')
  </g>
</svg>
"@
    [System.IO.File]::WriteAllText($path, $svg, [System.Text.UTF8Encoding]::new($false))
}

function Save-Png($bitmap, $path) {
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
}

$marketplaceIcon = New-MarketplaceIcon 128
Save-Png $marketplaceIcon $mediaIconPath
Copy-Item -Path $mediaIconPath -Destination $rootIconPath -Force
Export-ActivityBarSvg 24 $activitySvgPath

Write-Host "Wrote $mediaIconPath and $rootIconPath (marketplace: white portrait on steel-blue background)"
Write-Host "Wrote $activitySvgPath (activity bar: currentColor, theme-tinted by VS Code/Cursor)"
