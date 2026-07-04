# Scans installed MES source and builds TagDescriptions.json for wiki generation.
$ErrorActionPreference = 'Stop'
$mesPath = "C:\Program Files (x86)\Steam\steamapps\workshop\content\244850\1521905890\Data\Scripts\ModularEncountersSystems"
$outFile = Join-Path $PSScriptRoot 'TagDescriptions.json'

function Split-PascalCase([string]$text) {
    if ([string]::IsNullOrWhiteSpace($text)) { return $text }
    $s = [regex]::Replace($text, '([a-z0-9])([A-Z])', '$1 $2')
    $s = [regex]::Replace($s, '([A-Z]+)([A-Z][a-z])', '$1 $2')
    return ($s -replace '_', ' ').ToLowerInvariant()
}

function Add-Desc([hashtable]$map, [string]$tag, [string]$desc) {
    if ([string]::IsNullOrWhiteSpace($tag) -or [string]::IsNullOrWhiteSpace($desc)) { return }
    $desc = ($desc -replace '\s+', ' ').Trim()
    if ($desc.Length -lt 8) { return }
    if (-not $map.ContainsKey($tag) -or $map[$tag].Length -lt $desc.Length) {
        $map[$tag] = $desc
    }
}

function Format-Comment([string]$comment, [string]$tagName) {
    $c = $comment.Trim().TrimEnd('.')
    if ($c -eq $tagName) { return $null }
    if ($c.Length -lt 3) { return $null }
    if ($c -cmatch '^[A-Z][a-z]+$') { return $null }
    # Title-case short comments from ActionSystem
    if ($c -notmatch '[a-z]') { $c = Split-PascalCase $c }
    if ($c.Length -gt 0) {
        $c = $c.Substring(0,1).ToUpper() + $c.Substring(1)
    }
    if ($c -notmatch '[.!?]$') { $c += '.' }
    return $c
}

function Get-InferredDescription([string]$tagName, [string]$parseType) {
    $words = Split-PascalCase $tagName
    $isList = $parseType -match 'List|Dict'
    $isBool = $parseType -match '^Bool' -or $parseType -eq 'Contains'

    if ($tagName -match '^(Use|Enable|Allow|Activate|Apply|Include|Register|Preserve|Append|Broadcast|Highlight|Ignore|Overwrite|Manual|Prioritize|Only|Try|Force|Link|Save|Remove|Add|Increase|Decrease|End|Start|Clear|Disable|Reset|Set|Change|Create|Process|Play|Spawn|Teleport|Transfer|Switch|Refresh|Repair|Build|Recalculate|Check|Compare|Match|Has|Is|Can|Must|DoNot|No)(.*)$') {
        $verb = $Matches[1].ToLowerInvariant()
        $rest = Split-PascalCase $Matches[2]
        if ([string]::IsNullOrWhiteSpace($rest)) { $rest = Split-PascalCase $tagName }

        switch -Regex ($verb) {
            '^(use|enable|allow|activate|apply|include|register|preserve|append|broadcast|highlight|ignore|overwrite|manual|prioritize|only|try|force|link|save|add|increase|decrease|start|end|clear|disable|reset|set|change|create|process|play|spawn|teleport|transfer|switch|refresh|repair|build|recalculate|check|compare|match|can|must|donot|no)$' {
                if ($isBool) {
                    switch ($verb) {
                        'allow' { return "When <code>true</code>, allows $rest." }
                        'activate' { return "When <code>true</code>, activates $rest." }
                        'disable' { return "When <code>true</code>, disables $rest." }
                        'clear' { return "When <code>true</code>, clears $rest." }
                        'reset' { return "When <code>true</code>, resets $rest." }
                        'change' { return "When <code>true</code>, changes $rest." }
                        'set' { return "When <code>true</code>, sets $rest." }
                        'check' { return "When <code>true</code>, checks $rest." }
                        'compare' { return "When <code>true</code>, compares $rest." }
                        'match' { return "When <code>true</code>, requires $rest to match." }
                        'try' { return "When <code>true</code>, attempts $rest." }
                        'force' { return "When <code>true</code>, forces $rest." }
                        'spawn' { return "When <code>true</code>, spawns $rest." }
                        'teleport' { return "When <code>true</code>, teleports $rest." }
                        'switch' { return "When <code>true</code>, switches $rest." }
                        'refresh' { return "When <code>true</code>, refreshes $rest." }
                        'broadcast' { return "When <code>true</code>, broadcasts $rest." }
                        'process' { return "When <code>true</code>, processes $rest." }
                        'play' { return "When <code>true</code>, plays $rest." }
                        'repair' { return "When <code>true</code>, repairs $rest." }
                        'build' { return "When <code>true</code>, builds $rest." }
                        'use' { return "When <code>true</code>, uses $rest." }
                        'enable' { return "When <code>true</code>, enables $rest." }
                        'must' { return "When <code>true</code>, requires $rest." }
                        'donot' { return "When <code>true</code>, prevents $rest." }
                        default { return "When <code>true</code>, enables or applies $rest." }
                    }
                }
            }
        }
    }

    if ($tagName -match '^(Min|Max)(.+)$') {
        $kind = if ($Matches[1] -eq 'Min') { 'Minimum' } else { 'Maximum' }
        $rest = Split-PascalCase $Matches[2]
        return "$kind value for $rest."
    }

    if ($tagName -match '^(New|Old)(.+)$') {
        $kind = if ($Matches[1] -eq 'New') { 'New' } else { 'Previous' }
        $rest = Split-PascalCase $Matches[2]
        return "$kind value used for $rest."
    }

    if ($tagName -match 'Ids?$' -or $tagName -match 'Names$' -or $tagName -match 'Profiles$') {
        $what = Split-PascalCase ($tagName -replace 'Ids?$|Names$|Profiles$', '')
        if ($isList) { return "One or more $what profile or id values (comma-separated)." }
        return "A $what profile or id value."
    }

    if ($tagName -match 'Radius$') { return "Radius in meters for $(Split-PascalCase ($tagName -replace 'Radius$',''))." }
    if ($tagName -match 'Distance$') { return "Distance in meters for $(Split-PascalCase ($tagName -replace 'Distance$',''))." }
    if ($tagName -match 'Altitude$') { return "Altitude in meters for $(Split-PascalCase ($tagName -replace 'Altitude$',''))." }
    if ($tagName -match 'Timer$|TimeTrigger$|Cooldown$|Duration$') { return "Time in seconds for $(Split-PascalCase $tagName)." }
    if ($tagName -match 'Amount$|Percentage$|Percent$') { return "Numeric amount for $(Split-PascalCase $tagName)." }
    if ($tagName -match 'Speed$') { return "Speed value for $(Split-PascalCase $tagName)." }

    if ($isBool) { return "When <code>true</code>, activates $(Split-PascalCase $tagName)." }
    if ($isList) { return "List of values for $(Split-PascalCase $tagName)." }
    if ($parseType -match 'Enum') { return "Enum value for $(Split-PascalCase $tagName)." }
    if ($parseType -match 'Double|Float|Int|Long') { return "Numeric value for $(Split-PascalCase $tagName)." }
    if ($parseType -match 'String') { return "Text value for $(Split-PascalCase $tagName)." }
    if ($parseType -match 'Vector') { return "Vector3D coordinates for $(Split-PascalCase $tagName)." }

    return "Configures $(Split-PascalCase $tagName)."
}

function Get-TagMetaFromFile([string]$filePath) {
    $meta = @{}
    $content = Get-Content $filePath -Raw
    [regex]::Matches($content, '\{"([A-Za-z][A-Za-z0-9_-]*)", \(s, o\) => TagParse\.Tag(\w+)Check') | ForEach-Object {
        $meta[$_.Groups[1].Value] = $_.Groups[2].Value
    }
    [regex]::Matches($content, 'tag\.Contains\("\[([A-Za-z0-9_-]+):"') | ForEach-Object {
        if (-not $meta.ContainsKey($_.Groups[1].Value)) { $meta[$_.Groups[1].Value] = 'Contains' }
    }
    return $meta
}

$descriptions = @{}

# 1) ActionSystem comments
$actionSystem = Get-ChildItem $mesPath -Recurse -Filter 'ActionSystem.cs' | Select-Object -First 1
if ($actionSystem) {
    $content = Get-Content $actionSystem.FullName -Raw
    [regex]::Matches($content, '//([^\r\n]+)\r?\n\s*lastAction = "([A-Za-z0-9_-]+)"') | ForEach-Object {
        $comment = Format-Comment $_.Groups[1].Value $_.Groups[2].Value
        if ($comment) { Add-Desc $descriptions $_.Groups[2].Value $comment }
    }
}

# 2) Inline field comments in profile files
Get-ChildItem $mesPath -Recurse -Filter '*Profile*.cs' | ForEach-Object {
    $lines = Get-Content $_.FullName
    foreach ($line in $lines) {
        if ($line -match '^\s*public\s+\w[\w<>,\s]*\s+([A-Za-z0-9_]+)\s*;\s*//(.+)$') {
            $tag = $Matches[1]
            $comment = $Matches[2].Trim()
            if ($comment -match 'OBSOLETE|Obsolete|Not used|Implement') {
                Add-Desc $descriptions $tag "<strong>OBSOLETE.</strong> $comment"
            } else {
                Add-Desc $descriptions $tag (Format-Comment $comment $tag)
            }
        }
        if ($line -match '^\s*//([A-Za-z][A-Za-z0-9_-]+)\s*$') {
            $pendingTag = $Matches[1]
        } elseif ($pendingTag -and $line -match 'tag\.Contains\("\[' + [regex]::Escape($pendingTag) + ':') {
            Add-Desc $descriptions $pendingTag "Configures $(Split-PascalCase $pendingTag)."
            $pendingTag = $null
        } elseif ($line -match '^\s*//(.+ Config|.+ Settings)\s*$') {
            $section = $Matches[1].Trim()
            $pendingSection = $section
        }
    }
}

# 3) Section comments above fields (AutoPilot style)
Get-ChildItem $mesPath -Recurse -Filter '*Profile*.cs' | ForEach-Object {
    $pendingSection = $null
    Get-Content $_.FullName | ForEach-Object {
        if ($_ -match '^\s*//(.+ Config|.+ Settings|Profile|Speed Config|Planet Config)\s*$') {
            $pendingSection = $Matches[1].Trim()
        } elseif ($_ -match '^\s*public\s+\w[\w<>,\s]*\s+([A-Za-z0-9_]+)\s*;(?:\s*//(.*))?$') {
            $tag = $Matches[1]
            if ($Matches[2]) {
                Add-Desc $descriptions $tag (Format-Comment $Matches[2].Trim() $tag)
            } elseif ($pendingSection) {
                Add-Desc $descriptions $tag "$pendingSection setting: $(Split-PascalCase $tag)."
            }
        }
    }
}

# 4) Manual overrides (high-value / non-obvious tags)
$manual = @{
    'MaxTargetValue' = 'Maximum TargetValue (threat score) a target may have. <strong>Default in MES source is 1</strong> if omitted - use <code>[MaxTargetValue:-1]</code> to remove the upper cap.'
    'MinTargetValue' = 'Minimum TargetValue (threat score) required for a target to be valid when using the <code>TargetValue</code> filter.'
    'SwitchToBehavior' = '<strong>OBSOLETE.</strong> Do not use. MES skips re-registering an already-registered Remote Control. Use <code>[ChangeBehaviorSubclass:true]</code> and <code>[NewBehaviorSubclass:Value]</code> instead.'
    'NewBehavior' = '<strong>OBSOLETE.</strong> Companion tag for deprecated <code>SwitchToBehavior</code>. Use <code>NewBehaviorSubclass</code> instead.'
    'ChangeBehaviorSubclass' = 'When <code>true</code>, switches the behavior subclass (eg Fighter, Horsefly, Patrol) via <code>NewBehaviorSubclass</code>.'
    'NewBehaviorSubclass' = 'BehaviorSubclass enum value to assign when <code>ChangeBehaviorSubclass</code> is true.'
    'ToggleBlocksOfType' = 'When <code>true</code>, toggles blocks matching <code>BlockTypesToToggle</code> using <code>BlockTypeToggles</code> (On/Off).'
    'HorseflyWaypointWaitTimeTrigger' = 'Remote Control tag. Seconds the Horsefly waits at an offset waypoint before moving again. Overrides autopilot <code>WaypointWaitTimeTrigger</code> when greater than zero.'
    'HorseflyWaypointAbandonTimeTrigger' = 'Remote Control tag. Seconds before abandoning the current offset waypoint and generating a new one.'
    'UseVanillaTargetLocking' = 'When <code>true</code>, uses Space Engineers vanilla turret/grid target locking.'
    'UsePlayerConditionProfile' = 'When <code>true</code>, the trigger uses <code>PlayerConditionProfileIds</code> to filter which players can activate it.'
    'ProcessAsAdminSpawn' = 'When <code>true</code>, treats the spawn action as an admin spawn (bypasses some spawn condition checks).'
    'UseNoTargetTimer' = 'When <code>true</code>, the behavior starts a no-target despawn timer while idle without a valid target.'
    'MatchAllFilters' = 'Target must match ALL listed TargetFilterEnum values.'
    'MatchAnyFilters' = 'Target must match at least ONE listed TargetFilterEnum value.'
    'MatchNoneFilters' = 'Target is rejected if it matches ANY listed TargetFilterEnum value.'
    'Score' = 'Prefab threat/score value used by MES prefab data rules.'
    'WeaponsSystem' = 'SubtypeId of the MES weapons system profile attached to this behavior.'
    'ActivateEvent' = 'When <code>true</code>, activates MES events whose ids or tags match <code>ActivateEventIds</code> / <code>ActivateEventTags</code>.'
    'ActivateAssertiveAntennas' = 'When <code>true</code>, enables assertive antenna behavior on the NPC grid (antennas actively broadcast/track).'
    'AllowBlueprintBuilding' = 'When <code>true</code>, players can build grids from blueprints at this shipyard terminal.'
    'AllowScrapPurchasing' = 'When <code>true</code>, players can sell scrap grids to this shipyard.'
    'AllowRepairAndConstruction' = 'When <code>true</code>, players can repair and weld incomplete blocks at this shipyard.'
    'AllowCustomReplacement' = 'When <code>true</code>, players can pay to replace blocks using <code>OldBlock</code>/<code>NewBlock</code> or <code>BlockReplacementProfileIds</code>.'
    'AllowGridTakeover' = 'When <code>true</code>, players can purchase ownership of an NPC grid through this shipyard.'
    'BlockName' = 'SubtypeId or name of the shipyard terminal block this profile applies to.'
    'StoreBlockName' = 'Optional store block name linked to shipyard transactions.'
    'InteractionRadius' = 'Radius in meters around the shipyard block where players can interact. Source default: <code>250</code>.'
    'MinReputation' = 'Minimum faction reputation required (may be unused in current MES build). Source default: <code>-500</code>.'
    'ReputationNeededForDiscount' = 'Faction reputation at or above this value unlocks reputation-based discounts. Source default: <code>501</code>.'
    'BlueprintBuildingCommissionPercentage' = 'Blueprint build price multiplier percentage (100 = raw cost). Source default: <code>115</code>.'
    'ScrapPurchasingMaxPercentageValue' = 'Base percentage of scrap value paid to the player. Source default: <code>75</code>.'
    'GridTakeoverPricePerComputerMultiplier' = 'Price multiplier per computer block when taking over a grid. Source default: <code>100</code>.'
}
foreach ($k in $manual.Keys) { Add-Desc $descriptions $k $manual[$k] }

# 5) Fill gaps using tag meta + inference
Get-ChildItem $mesPath -Recurse -Filter '*.cs' | ForEach-Object {
    $meta = Get-TagMetaFromFile $_.FullName
    foreach ($tag in $meta.Keys) {
        if (-not $descriptions.ContainsKey($tag)) {
            Add-Desc $descriptions $tag (Get-InferredDescription $tag $meta[$tag])
        }
    }
}

# Behavior subclass tags on RemoteControl
@(
    'HorseFighterWaypointWaitTimeTrigger','HorseFighterWaypointAbandonTimeTrigger',
    'HorseNauticalWaypointWaitTimeTrigger','HorseNauticalWaypointAbandonTimeTrigger',
    'FighterEngageDistancePlanet','FighterEngageDistanceSpace',
    'FighterDisengageDistancePlanet','FighterDisengageDistanceSpace',
    'CustomWaypoints','Routes','GetSpeedFromSpawnGroup','UsePauseAutopilotFromSpawnGroup'
) | ForEach-Object {
    if (-not $descriptions.ContainsKey($_)) {
        Add-Desc $descriptions $_ (Get-InferredDescription $_ 'Int')
    }
}

$descriptions.GetEnumerator() | Sort-Object Name | ForEach-Object {
    [PSCustomObject]@{ Tag = $_.Key; Description = $_.Value }
} | ConvertTo-Json -Depth 3 | Set-Content -Path $outFile -Encoding UTF8

Write-Output "Wrote $($descriptions.Count) tag descriptions to TagDescriptions.json"
