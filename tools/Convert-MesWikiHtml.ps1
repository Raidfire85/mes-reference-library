# Converts MES wiki HTML files to offline-friendly format using mes-wiki.css
param(
    [string]$Root = (Join-Path (Split-Path $PSScriptRoot -Parent) 'wiki')
)

$BookIconSvg = @'
<svg aria-hidden="true" class="octicon octicon-book" height="16" viewBox="0 0 16 16" width="16">
  <path d="M0 1.75A.75.75 0 0 1 .75 1h4.253c1.227 0 2.317.59 3 1.501A3.743 3.743 0 0 1 11.006 1h4.245a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75h-4.507a2.25 2.25 0 0 0-1.591.659l-.622.621a.75.75 0 0 1-1.06 0l-.622-.621A2.25 2.25 0 0 0 5.258 13H.75a.75.75 0 0 1-.75-.75Zm7.251 10.324.004-5.073-.002-2.253A2.25 2.25 0 0 0 5.003 2.5H1.5v9h3.757a3.75 3.75 0 0 1 1.994.574ZM8.755 4.75l-.004 7.322a3.752 3.752 0 0 1 1.992-.572H14.5v-9h-3.495a2.25 2.25 0 0 0-2.25 2.25Z"></path>
</svg>
'@

function Clean-HtmlFragment {
    param([string]$Html)

    if ([string]::IsNullOrWhiteSpace($Html)) { return '' }

    $Html = [regex]::Replace($Html, '<!--\s*LEGION-WIKI-NOTICE-START\s*-->[\s\S]*?<!--\s*LEGION-WIKI-NOTICE-END\s*-->', '', 'IgnoreCase')
    $Html = [regex]::Replace($Html, '<template[\s\S]*?</template>', '', 'IgnoreCase')
    $Html = [regex]::Replace($Html, '<markdown-accessiblity-table>\s*', '', 'IgnoreCase')
    $Html = [regex]::Replace($Html, '\s*</markdown-accessiblity-table>', '', 'IgnoreCase')
    $Html = [regex]::Replace($Html, '\s+dir="auto"', '', 'IgnoreCase')
    $Html = [regex]::Replace($Html, '\s+data-[a-z0-9_-]+="[^"]*"', '', 'IgnoreCase')
    $Html = [regex]::Replace($Html, '\s+itemprop="[^"]*"', '', 'IgnoreCase')
    $Html = [regex]::Replace($Html, '<article[^>]*>\s*', '', 'IgnoreCase')
    $Html = [regex]::Replace($Html, '\s*</article>', '', 'IgnoreCase')
    $Html = [regex]::Replace($Html, 'class="markdown-body entry-content container-lg"', 'class="markdown-body"', 'IgnoreCase')
    $Html = $Html.Trim()
    return $Html
}

function Extract-MarkdownSection {
    param(
        [string]$Html,
        [string]$EndPattern
    )

    $openMatch = [regex]::Match($Html, '<(div|article)\s+class="markdown-body"[^>]*>', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if (-not $openMatch.Success) { return $null }

    $start = $openMatch.Index + $openMatch.Length
    $endMatch = [regex]::Match($Html.Substring($start), $EndPattern, [System.Text.RegularExpressions.RegexOptions]::Singleline -bor [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if (-not $endMatch.Success) { return $null }

    return $Html.Substring($start, $endMatch.Index).Trim()
}

function Extract-SidebarSection {
    param([string]$Html)

    $marker = 'Box-body wiki-custom-sidebar markdown-body">'
    $startIndex = $Html.IndexOf($marker)
    if ($startIndex -lt 0) { return $null }

    $start = $startIndex + $marker.Length
    $endPattern = '</div>\s*</div>\s*</div>\s*</div>\s*</div>\s*(?:</div>\s*)?(?:</turbo-frame>|</body>)'
    $endMatch = [regex]::Match($Html.Substring($start), $endPattern, [System.Text.RegularExpressions.RegexOptions]::Singleline -bor [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if (-not $endMatch.Success) {
        $endPattern = '</div>\s*</div>\s*</div>\s*</div>\s*</div>'
        $endMatch = [regex]::Match($Html.Substring($start), $endPattern, [System.Text.RegularExpressions.RegexOptions]::Singleline -bor [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    }
    if (-not $endMatch.Success) { return $null }

    return $Html.Substring($start, $endMatch.Index).Trim()
}

function Get-InnerMatch {
    param(
        [string]$Html,
        [string]$Pattern
    )

    $match = [regex]::Match($Html, $Pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline -bor [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if ($match.Success) { return $match.Groups[1].Value }
    return $null
}

function Get-PageTitle {
    param([string]$Html, [string]$FileName)

    $title = Get-InnerMatch $Html '<h1[^>]*class="[^"]*gh-header-title[^"]*"[^>]*>([^<]+)</h1>'
    if (-not $title) { $title = Get-InnerMatch $Html "<div class='wiki-header'>\s*<h1[^>]*>([^<]+)</h1>" }
    if (-not $title) { $title = Get-InnerMatch $Html '<div class="wiki-header">\s*<h1[^>]*>([^<]+)</h1>' }
    if (-not $title) { $title = Get-InnerMatch $Html '<title>([^<|]+)' }
    if (-not $title) { $title = [System.IO.Path]::GetFileNameWithoutExtension($FileName).Replace('-', ' ') }
    return ($title -replace '\s+', ' ').Trim()
}

function Get-PageAuthor {
    param([string]$Html)

    $author = Get-InnerMatch $Html 'gh-header-meta">\s*([^<]+)'
    if (-not $author) { $author = Get-InnerMatch $Html 'class="metadata">([^<]+)' }
    if (-not $author) { $author = 'Author: MeridiusIX' }
    return $author.Trim()
}

function Build-WikiPage {
    param(
        [string]$Title,
        [string]$Author,
        [string]$MainContent,
        [string]$SidebarContent = $null,
        [switch]$BlobLayout
    )

    $mainClass = 'wiki-content'
    if ($BlobLayout) { $mainClass += ' wiki-content--blob' }

    $containerClass = 'wiki-container'
    if (-not $SidebarContent) { $containerClass += ' wiki-container--single' }

    $sidebarHtml = ''
    if ($SidebarContent) {
        $sidebarHtml = @"

  <div class="wiki-sidebar">
    <div class="wiki-rightbar">
      <div class="Box Box--condensed">
        <div class="Box-body wiki-custom-sidebar markdown-body">
$SidebarContent
        </div>
      </div>
    </div>
  </div>
"@
    }

    if ($BlobLayout) {
        $mainInner = @"
    <div class="$mainClass">
      <div class="blob-wrapper">
$MainContent
      </div>
    </div>
"@
    }
    else {
        $mainInner = @"
    <div class="$mainClass">
      <div class="markdown-body">
$MainContent
      </div>
    </div>
"@
    }

    return @"
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>$Title &middot; MES Reference Library</title>
  <link rel="stylesheet" href="mes-wiki.css">
</head>
<body>

<div class="wiki-tab-container">
  <a class="wiki-tab" href="Home.html">
$BookIconSvg
    <span>Home</span>
  </a>
</div>

<div class="wiki-header">
  <h1 class="gh-header-title">$Title</h1>
  <div class="gh-header-meta">$Author</div>
</div>

<div class="$containerClass">
$mainInner
$sidebarHtml
</div>

</body>
</html>
"@
}

function Convert-WikiHtmlFile {
    param(
        [string]$Path
    )

    $fileName = [System.IO.Path]::GetFileName($Path)
    if ($fileName -eq 'Home.clean.html') { return 'skipped' }

    $html = [System.IO.File]::ReadAllText($Path)
    $title = Get-PageTitle $html $fileName
    $author = Get-PageAuthor $html

    $bodyMatch = [regex]::Match($html, '(?s)<body>(.*)</body>', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    $body = if ($bodyMatch.Success) { $bodyMatch.Groups[1].Value } else { $html }

    $isBlob = $body -match '<table[^>]*class="[^"]*\bhighlight\b[^"]*"'

    if ($isBlob) {
        $blob = Get-InnerMatch $html '(<table[^>]*class="[^"]*highlight[^"]*"[\s\S]*?</table>)'
        if (-not $blob) { throw "Could not extract blob table from $fileName" }
        $blob = Clean-HtmlFragment $blob
        $output = Build-WikiPage -Title $title -Author $author -MainContent $blob -BlobLayout
    }
    elseif ($html -match "wiki-sidebar") {
        $main = Extract-MarkdownSection -Html $html -EndPattern '</div>\s*</div>\s*<div class=[''"]wiki-sidebar'
        $sidebar = Extract-SidebarSection -Html $html
        if (-not $main) { throw "Could not extract main content from $fileName" }
        if (-not $sidebar) { throw "Could not extract sidebar from $fileName" }
        $main = Clean-HtmlFragment $main
        $sidebar = Clean-HtmlFragment $sidebar
        $output = Build-WikiPage -Title $title -Author $author -MainContent $main -SidebarContent $sidebar
    }
    else {
        $main = Extract-MarkdownSection -Html $html -EndPattern '</div>\s*</div>\s*(?:</div>\s*)?(?:</body>|</html>)'
        if (-not $main) { $main = Get-InnerMatch $html '<article class="markdown-body[^"]*"[^>]*>([\s\S]*?)</article>' }
        if (-not $main) { throw "Could not extract single-column content from $fileName" }
        $main = Clean-HtmlFragment $main
        $output = Build-WikiPage -Title $title -Author $author -MainContent $main
    }

    [System.IO.File]::WriteAllText($Path, $output, [System.Text.UTF8Encoding]::new($false))
    return 'converted'
}

if ($MyInvocation.InvocationName -ne '.') {
$htmlFiles = Get-ChildItem -Path $Root -Filter '*.html' -File | Sort-Object Name
$converted = 0
$failed = @()

foreach ($file in $htmlFiles) {
    try {
        $result = Convert-WikiHtmlFile -Path $file.FullName
        if ($result -eq 'converted') {
            $converted++
            Write-Host "OK  $($file.Name)"
        }
        else {
            Write-Host "SKIP $($file.Name)"
        }
    }
    catch {
        $failed += [pscustomobject]@{ File = $file.Name; Error = $_.Exception.Message }
        Write-Host "FAIL $($file.Name): $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Converted: $converted / $($htmlFiles.Count)"
if ($failed.Count -gt 0) {
    Write-Host "Failed: $($failed.Count)" -ForegroundColor Red
    $failed | Format-Table -AutoSize
    exit 1
}
}