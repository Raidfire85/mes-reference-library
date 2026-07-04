# Syncs MES wiki HTML copies with tags from installed workshop MES source.
# Re-run after MES updates. Replaces content between MES-WIKI-SOURCE-SYNC markers.

$ErrorActionPreference = 'Stop'
$mesPath = "C:\Program Files (x86)\Steam\steamapps\workshop\content\244850\1521905890\Data\Scripts\ModularEncountersSystems"
$wikiDir = $PSScriptRoot

$SyncStart = '<!-- MES-WIKI-SOURCE-SYNC-START -->'
$SyncEnd = '<!-- MES-WIKI-SOURCE-SYNC-END -->'
$TagHeaderCol = 'Tag:'

function Get-TagMetaFromSource {
    param([string]$ProfileFileName)
    $file = Get-ChildItem -Path $mesPath -Recurse -Filter $ProfileFileName | Select-Object -First 1
    if (-not $file) { return @{} }
    $content = Get-Content $file.FullName -Raw
    $meta = @{}
    [regex]::Matches($content, '\{"([A-Za-z][A-Za-z0-9_-]*)", \(s, o\) => TagParse\.Tag(\w+)Check') | ForEach-Object {
        $meta[$_.Groups[1].Value] = $_.Groups[2].Value
    }
    [regex]::Matches($content, 'tag\.Contains\("\[([A-Za-z0-9_-]+):"') | ForEach-Object {
        if (-not $meta.ContainsKey($_.Groups[1].Value)) { $meta[$_.Groups[1].Value] = 'Contains' }
    }
    return $meta
}

function Get-TypeHint([string]$parseType) {
    switch -Regex ($parseType) {
        '^Bool' { return @('<code>true</code><br><code>false</code>', $false) }
        '^Int|^Long|^Short|^Uint' { return @('Any Integer Value', $false) }
        '^Float|^Double' { return @('Any Number Value', $false) }
        '^String$' { return @('Any String Value', $false) }
        '^StringList|^IntList|^LongList|^BoolList' { return @('Comma-separated list of values', $true) }
        '^StringDict|^StringIntDict' { return @('Comma-separated key,value pairs', $true) }
        '^BehaviorSubclass' { return @('BehaviorSubclass enum (Horsefly, Patrol, Fighter, Strike, etc.)', $false) }
        '^TargetFilter|^TargetSort|^TargetType|^TargetOwner|^TargetRelation|^CheckEnum' { return @('MES enum value (see Threat Score / Target guides)', $false) }
        '^SwitchEnum' { return @('<code>On</code><br><code>Off</code>', $false) }
        '^ModifierEnum' { return @('Modifier enum value', $false) }
        default { return @('See MES source / enum definition', $false) }
    }
}

function New-WikiTagTable {
    param(
        [string]$TagName,
        [string]$Description,
        [string]$AllowedValuesHtml,
        [string]$MultipleAllowed,
        [ValidateSet('Action','Target','Prefab')]
        [string]$Style = 'Action',
        [string]$FilterRequired = $null
    )

    $rows = @"
<tr>
<td align="left">Tag Format:</td>
<td align="left"><code>[$TagName`:Value]</code></td>
</tr>
<tr>
<td align="left">Description:</td>
<td align="left">$Description</td>
</tr>
"@

    if ($Style -eq 'Target' -and $FilterRequired) {
        $rows += @"

<tr>
<td align="left">Filter Required:</td>
<td align="left"><code>$FilterRequired</code></td>
</tr>
"@
    }

    if ($Style -eq 'Target') {
        $rows += @"

<tr>
<td align="left">Allowed Values:</td>
<td align="left">$AllowedValuesHtml</td>
</tr>
<tr>
<td align="left">Multiple Tag Allowed:</td>
<td align="left">$MultipleAllowed</td>
</tr>
"@
    } elseif ($Style -eq 'Prefab') {
        $rows += @"

<tr>
<td align="left">Allowed Value(s):</td>
<td align="left">$AllowedValuesHtml</td>
</tr>
<tr>
<td align="left">Default Value(s):</td>
<td align="left"><code>N/A</code></td>
</tr>
<tr>
<td align="left">Multiple Tags Allowed:</td>
<td align="left">$MultipleAllowed</td>
</tr>
"@
    } else {
        $rows += @"

<tr>
<td align="left">Allowed Value(s):</td>
<td align="left">$AllowedValuesHtml</td>
</tr>
<tr>
<td align="left">Multiple Tags Allowed:</td>
<td align="left">$MultipleAllowed</td>
</tr>
"@
    }

    return @"
<table role="table">
<thead>
<tr>
<th align="left">$TagHeaderCol</th>
<th align="left">$TagName</th>
</tr>
</thead>
<tbody>
$rows
</tbody>
</table>
"@
}

function New-TagTableFromMeta {
    param(
        [string]$TagName,
        [hashtable]$Meta,
        [hashtable]$TagDescriptions,
        [string]$Style = 'Action'
    )
    $parseType = if ($Meta.ContainsKey($TagName)) { $Meta[$TagName] } else { 'Unknown' }
    $hint = Get-TypeHint $parseType
    $allowedHtml = $hint[0]
    $multi = if ($hint[1]) { 'Yes' } else { 'No' }
    $desc = if ($TagDescriptions.ContainsKey($TagName)) {
        $TagDescriptions[$TagName]
    } else {
        "Configures $(($TagName -replace '([a-z0-9])([A-Z])', '$1 $2').ToLowerInvariant())."
    }
    New-WikiTagTable -TagName $TagName -Description $desc -AllowedValuesHtml $allowedHtml -MultipleAllowed $multi -Style $Style
}

function Remove-SyncBlock([string]$Content) {
    if ($Content.Contains($SyncStart)) {
        $pattern = [regex]::Escape($SyncStart) + '[\s\S]*?' + [regex]::Escape($SyncEnd)
        return [regex]::Replace($Content, $pattern, '').TrimEnd()
    }
    return $Content
}

function Inject-Supplement([string]$HtmlPath, [string]$SupplementHtml) {
    if (-not (Test-Path $HtmlPath)) { return $false }
    $content = Remove-SyncBlock (Get-Content $HtmlPath -Raw)
    $block = "$SyncStart`r`n$SupplementHtml`r`n$SyncEnd"

    $pattern = '(?s)(\r?\n              </div>\r?\n\r?\n          \r?\n\t</div>\r?\n\t<div class=''wiki-sidebar''>)'
    if ($content -notmatch $pattern) {
        Write-Warning "Could not find markdown-body injection point in $HtmlPath"
        return $false
    }
    $content = [regex]::Replace($content, $pattern, "`r`n$block`$1", 1)
    [System.IO.File]::WriteAllText($HtmlPath, $content)
    return $true
}

function Get-MissingTagsForPage([string]$HtmlPath, [string[]]$SourceTags) {
    $content = Remove-SyncBlock (Get-Content $HtmlPath -Raw)
    $missing = @()
    foreach ($t in $SourceTags) {
        $needle = "[$t`:"
        if (-not $content.Contains($needle) -and -not $content.Contains(">$t</th>")) {
            $missing += $t
        }
    }
    return $missing | Sort-Object -Unique
}

function New-ProfilePageFromTemplate {
    param(
        [string]$FileName,
        [string]$Title,
        [string]$IntroHtml,
        [string]$TablesHtml
    )
    $templatePath = Join-Path $wikiDir 'Prefab-Data.html'
    $template = Get-Content $templatePath -Raw

    $template = [regex]::Replace($template, '<title>[^<]*</title>', "<title>$Title &middot; MES Wiki (Source Sync)</title>", 1)
    $template = [regex]::Replace($template, '(<h1 class="flex-auto[^"]*">)[^<]*(</h1>)', "`${1}$Title`${2}", 1)
    $template = $template.Replace('Author: MeridiusIX', 'Author: MES Source Sync')

    $bodyContent = @"
$IntroHtml
<p>Below you can find all tags parsed from MES source for this profile type:</p>
$TablesHtml
"@

    $pattern = "(?s)(<div class=`"markdown-body`">\s*)(.*?)(\s*</div>\s*\r?\n\s*\r?\n\s*\r?\n\s*</div>\s*\r?\n\s*<div class='wiki-sidebar'>)"
    if ($template -notmatch $pattern) {
        throw "Template markdown-body pattern not found in Prefab-Data.html"
    }
    $template = [regex]::Replace($template, $pattern, "`${1}$bodyContent`${3}", 1)
    [System.IO.File]::WriteAllText((Join-Path $wikiDir $FileName), $template)
}

Write-Output 'Building tag descriptions from MES source...'
& (Join-Path $wikiDir 'Build-TagDescriptions.ps1')
$TagDescriptions = @{}
$descJson = Join-Path $wikiDir 'TagDescriptions.json'
if (-not (Test-Path $descJson)) { throw "TagDescriptions.json not found after build." }
foreach ($entry in (Get-Content $descJson -Raw | ConvertFrom-Json)) {
    $TagDescriptions[$entry.Tag] = $entry.Description
}
Write-Output "Loaded $($TagDescriptions.Count) tag descriptions."

$pageMap = @{
    'Target.html' = @{ Profile = 'TargetProfile.cs'; Style = 'Target'; ExtraTags = @() }
    'Action.html' = @{ Profile = 'ActionReferenceProfile.cs'; Style = 'Action'; ExtraTags = @() }
    'Autopilot.html' = @{ Profile = 'AutoPilotProfile.cs'; Style = 'Action'; ExtraTags = @() }
    'Condition.html' = @{ Profile = 'ConditionReferenceProfile.cs'; Style = 'Action'; ExtraTags = @() }
    'Trigger.html' = @{ Profile = 'TriggerProfile.cs'; Style = 'Action'; ExtraTags = @() }
    'Spawning-Conditions.html' = @{ Profile = 'SpawnConditionsProfile.cs'; Style = 'Prefab'; ExtraTags = @() }
    'Command.html' = @{ Profile = 'CommandProfile.cs'; Style = 'Action'; ExtraTags = @() }
    'Chat.html' = @{ Profile = 'ChatProfile.cs'; Style = 'Action'; ExtraTags = @() }
    'Spawn.html' = @{ Profile = 'SpawnProfile.cs'; Style = 'Action'; ExtraTags = @() }
    'Weapons.html' = @{ Profile = 'WeaponSystemReference.cs'; Style = 'Action'; ExtraTags = @('WeaponsSystem') }
    'Player-Condition-Profile.html' = @{ Profile = 'PlayerConditionProfile.cs'; Style = 'Action'; ExtraTags = @() }
    'Core-Behavior.html' = @{
        Profile = $null; Style = 'Action'
        ExtraTags = @(
            'HorseflyWaypointWaitTimeTrigger','HorseflyWaypointAbandonTimeTrigger',
            'HorseFighterWaypointWaitTimeTrigger','HorseFighterWaypointAbandonTimeTrigger',
            'HorseNauticalWaypointWaitTimeTrigger','HorseNauticalWaypointAbandonTimeTrigger',
            'HorseFighterEngageDistancePlanet','HorseFighterEngageDistanceSpace',
            'HorseFighterDisengageDistancePlanet','HorseFighterDisengageDistanceSpace',
            'FighterEngageDistancePlanet','FighterEngageDistanceSpace',
            'FighterDisengageDistancePlanet','FighterDisengageDistanceSpace',
            'FighterPlaneBeginPlanetAttackRunDistance','FighterPlaneBeginSpaceAttackRunDistance',
            'FighterPlaneBreakawayDistance','FighterPlaneEngageUseSafePlanetPathing',
            'FighterPlaneOffsetRecalculationTime','CustomWaypoints','Routes',
            'GetSpeedFromSpawnGroup','UsePauseAutopilotFromSpawnGroup'
        )
    }
    'Event-Action.html' = @{ Profile = 'EventActionReference.cs'; Style = 'Action'; ExtraTags = @() }
    'Event-Condition.html' = @{ Profile = 'EventConditions.cs'; Style = 'Action'; ExtraTags = @() }
    'Bot-Spawn.html' = @{ Profile = 'BotSpawnProfile.cs'; Style = 'Prefab'; ExtraTags = @() }
    'Prefab-Data.html' = @{ Profile = 'PrefabDataProfile.cs'; Style = 'Prefab'; ExtraTags = @('Score') }
}

$updated = @()
foreach ($page in $pageMap.Keys) {
    $cfg = $pageMap[$page]
    $htmlPath = Join-Path $wikiDir $page
    $sourceTags = @()
    $meta = @{}
    if ($cfg.Profile) {
        $meta = Get-TagMetaFromSource -ProfileFileName $cfg.Profile
        $sourceTags = @($meta.Keys)
    }
    if ($cfg.ExtraTags) { $sourceTags += $cfg.ExtraTags }
    $missing = Get-MissingTagsForPage -HtmlPath $htmlPath -SourceTags ($sourceTags | Sort-Object -Unique)
    if ($missing.Count -eq 0) { continue }

    $tables = @()
    $tables += '<div class="markdown-heading"><h2 class="heading-element">Additional Tags (MES Source Sync)</h2></div>'
    $tables += '<p>The tags below exist in the current MES workshop/GitHub source but were not present in the original MeridiusIX wiki page. Descriptions are generated from MES source code (ActionSystem handlers, profile fields, and tag naming).</p>'

    foreach ($tag in $missing) {
        $tables += New-TagTableFromMeta -TagName $tag -Meta $meta -TagDescriptions $TagDescriptions -Style $cfg.Style
    }

    if (Inject-Supplement -HtmlPath $htmlPath -SupplementHtml ($tables -join "`r`n")) {
        $updated += "$page (+$($missing.Count))"
    }
}

$newPages = @(
    @{ File = 'Shipyard-Profile.html'; Title = 'Shipyard Profile'; Profile = 'ShipyardProfile.cs'; Style = 'Prefab'; Blurb = 'Shipyard profiles configure NPC shipyard blocks (blueprint building, repairs, scrap, grid takeover).' }
    @{ File = 'Safezone-Profile.html'; Title = 'Safezone Profile'; Profile = 'SafezoneProfile.cs'; Style = 'Prefab'; Blurb = 'Safezone profiles define safe zones spawned or linked via MES actions.' }
    @{ File = 'Store-Profile.html'; Title = 'Store Profile'; Profile = 'StoreProfile.cs'; Style = 'Prefab'; Blurb = 'Store profiles configure economy store block offers and orders.' }
    @{ File = 'Mission-Profile.html'; Title = 'Mission Profile'; Profile = 'MissionProfile.cs'; Style = 'Prefab'; Blurb = 'Mission profiles define contract/mission data used by MES contract blocks.' }
)

foreach ($np in $newPages) {
    $meta = Get-TagMetaFromSource -ProfileFileName $np.Profile
    $tables = ($meta.Keys | Sort-Object | ForEach-Object {
        New-TagTableFromMeta -TagName $_ -Meta $meta -TagDescriptions $TagDescriptions -Style $np.Style
    }) -join "`r`n"
    $intro = "<p>$($np.Blurb)</p><p>This page was added locally because no equivalent page existed in the original MES wiki.</p>"
    New-ProfilePageFromTemplate -FileName $np.File -Title $np.Title -IntroHtml $intro -TablesHtml $tables
    $updated += "$($np.File) (new, $($meta.Count) tags)"
}

# MaxTargetValue default note in existing Target section
$targetPath = Join-Path $wikiDir 'Target.html'
$targetContent = Get-Content $targetPath -Raw
if ($targetContent -match 'MaxTargetValue' -and $targetContent -notmatch 'Default in MES source is 1') {
    $targetContent = $targetContent.Replace(
        'This tag specifies the maximum value a target must be at to be considered valid. Value must not be <code>lower</code> than <code>MinTargetValue</code>',
        'This tag specifies the maximum value a target must be at to be considered valid. Value must not be <code>lower</code> than <code>MinTargetValue</code>. <strong>Default in MES source is 1</strong> if omitted - use <code>[MaxTargetValue:-1]</code> to remove the upper cap.'
    )
    [System.IO.File]::WriteAllText($targetPath, $targetContent)
    $updated += 'Target.html (MaxTargetValue default note)'
}

# Home.html local notice (inside main markdown-body)
$homePath = Join-Path $wikiDir 'Home.html'
$homeContent = Get-Content $homePath -Raw
$homeNoticeStart = '<!-- LEGION-WIKI-NOTICE-START -->'
$homeNoticeEnd = '<!-- LEGION-WIKI-NOTICE-END -->'
$homeNotice = @"
$homeNoticeStart
<div class="markdown-heading"><h2 class="heading-element">Local MES Wiki Copy</h2></div>
<p>This folder is a local copy of the MES wiki, synced against installed workshop MES source. Profile pages may include an <strong>Additional Tags (MES Source Sync)</strong> section at the bottom of the main content.</p>
<p><strong>New pages:</strong> <a href="Shipyard-Profile.html">Shipyard Profile</a> &middot; <a href="Safezone-Profile.html">Safezone Profile</a> &middot; <a href="Store-Profile.html">Store Profile</a> &middot; <a href="Mission-Profile.html">Mission Profile</a></p>
<p>Re-sync: run <code>Update-MesWikiFromSource.ps1</code> (see <code>README.md</code>).</p>
$homeNoticeEnd
"@
$homeContent = Remove-SyncBlock $homeContent  # no-op unless markers in home
if ($homeContent.Contains($homeNoticeStart)) {
    $homeContent = [regex]::Replace($homeContent, [regex]::Escape($homeNoticeStart) + '[\s\S]*?' + [regex]::Escape($homeNoticeEnd), $homeNotice)
} else {
    $homePattern = '(?s)(\r?\n              </div>\r?\n\r?\n          \r?\n\t</div>\r?\n\t<div class=''wiki-sidebar''>)'
    $homeContent = [regex]::Replace($homeContent, $homePattern, "`r`n$homeNotice`$1", 1)
}
if ($homeContent -notmatch 'Shipyard-Profile\.html"><strong>Shipyard') {
    $homeContent = $homeContent.Replace(
        '<li><a href="Player-Condition-Profile.html"><strong>Player Conditions (New)</strong></a></li>',
        @'
<li><a href="Player-Condition-Profile.html"><strong>Player Conditions (New)</strong></a></li>
<li><a href="Shipyard-Profile.html"><strong>Shipyard Profile (Source Sync)</strong></a></li>
<li><a href="Safezone-Profile.html"><strong>Safezone Profile (Source Sync)</strong></a></li>
<li><a href="Store-Profile.html"><strong>Store Profile (Source Sync)</strong></a></li>
<li><a href="Mission-Profile.html"><strong>Mission Profile (Source Sync)</strong></a></li>
'@
    )
}
[System.IO.File]::WriteAllText($homePath, $homeContent)

Write-Output 'Updated:'
$updated | ForEach-Object { Write-Output "  $_" }

# Normalize Tag headers (fixes Â / nbsp mojibake from original wiki export)
& (Join-Path $wikiDir 'Fix-WikiEncoding.ps1')

# Ensure all sidebar nav blocks include new profile pages
$sidebarInsert = @'
<li><a href="Shipyard-Profile.html"><strong>Shipyard Profile (Source Sync)</strong></a></li>
<li><a href="Safezone-Profile.html"><strong>Safezone Profile (Source Sync)</strong></a></li>
<li><a href="Store-Profile.html"><strong>Store Profile (Source Sync)</strong></a></li>
<li><a href="Mission-Profile.html"><strong>Mission Profile (Source Sync)</strong></a></li>
'@
$playerLine = '<li><a href="Player-Condition-Profile.html"><strong>Player Conditions (New)</strong></a></li>'
$playerLineWithNew = $playerLine + "`r`n" + $sidebarInsert
$sidebarCount = 0
Get-ChildItem -Path $wikiDir -Filter '*.html' | ForEach-Object {
    $content = [System.IO.File]::ReadAllText($_.FullName)
    if ($content.Contains("class='wiki-sidebar'") -and $content.Contains($playerLine) -and -not $content.Contains('Shipyard-Profile.html"><strong>Shipyard Profile')) {
        $content = $content.Replace($playerLine, $playerLineWithNew)
        [System.IO.File]::WriteAllText($_.FullName, $content, [System.Text.UTF8Encoding]::new($false))
        $sidebarCount++
    }
}
Write-Output "Sidebars refreshed: $sidebarCount"
