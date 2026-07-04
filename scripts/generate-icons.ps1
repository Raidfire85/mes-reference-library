# Generates extension icons from media/MeridiousIcon.jpg (MES helmet portrait).
# - icon.png: original black portrait (transparent background)
# - activitybar.svg: single-color silhouette with fill="currentColor" (VS/Cursor tint per theme)
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$mediaDir = Join-Path (Join-Path $PSScriptRoot '..') 'media'
$sourcePath = Join-Path $mediaDir 'MeridiousIcon.jpg'
$iconPath = Join-Path $mediaDir 'icon.png'
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

Save-Png (New-PortraitMask 128) $iconPath
Export-ActivityBarSvg 24 $activitySvgPath

Write-Host "Wrote $iconPath (marketplace: black portrait, transparent background)"
Write-Host "Wrote $activitySvgPath (activity bar: currentColor, theme-tinted by VS Code/Cursor)"
