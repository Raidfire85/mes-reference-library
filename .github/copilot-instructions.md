# MES Reference Library - GitHub Copilot Instructions

## Primary Rule
**NEVER invent or guess XML tags. Always verify every tag against the MES HTML documentation in this workspace before using it.**

---

## What This Extension Is
A VS Code / Cursor extension that embeds the full Modular Encounter Systems (MES) and RivalAI wiki as a local searchable reference library. The HTML files in the `wiki/` folder ARE the official documentation.

---

## Documentation Source of Truth
The MES HTML documentation files ship with this extension in the `wiki/` folder. When developing, they are at `<workspace>/wiki/`. When installed, they live under the extension folder, typically:
```
%USERPROFILE%\.cursor\extensions\raidfire.mes-reference-library-<version>\wiki\
```
or for VS Code:
```
%USERPROFILE%\.vscode\extensions\raidfire.mes-reference-library-<version>\wiki\
```
During development, use `<workspace>/wiki/` as `html_base_path`. After install, use the resolved extension `wiki` folder path (stored in `mes-doc-index.json`) and build lookups as `html_base_path` + filename.

- Use `mes-doc-index.json` → `html_base_path` to find where the HTML files are on this machine
- Use `get_file` with the full resolved path to read only the relevant section
- A tag is **only valid** if it is found in one of these HTML files
- If a tag is not found in any HTML file → it is **invalid and must be removed**
- See `MES_RULES.md` for the full rules and known invalid tags

### Quick Reference Index
| Topic | File |
|---|---|
| Spawn Groups | `SpawnGroup.html` |
| Spawn Group Template | `SpawnGroup-Template.html` |
| Spawn Conditions | `Spawning-Conditions.html` |
| Spawn Conditions Groups | `Spawning-Conditions-Groups.html` |
| Spawning Getting Started | `Spawning-Getting-Started.html` |
| Spawn (general) | `Spawn.html` |
| Spawn Filtering | `Spawn-Filtering.html` |
| Core Behavior | `Core-Behavior.html` |
| Behaviors Getting Started | `Behaviors-Getting-Started.html` |
| Autopilot | `Autopilot.html` |
| Triggers | `Trigger.html` |
| Trigger Group | `Trigger-Group.html` |
| Actions | `Action.html` |
| Chat | `Chat.html` |
| Commands | `Command.html` |
| Condition | `Condition.html` |
| Target | `Target.html` |
| Waypoint | `Waypoint.html` |
| Zone | `Zone.html` |
| Zone Conditions | `Zone-Conditions.html` |
| Manipulation | `Manipulation.html` |
| Manipulation Groups | `Manipulation-Groups.html` |
| Loot | `Loot.html` |
| Loot Profiles | `Loot-Profiles.html` |
| Loot Profile Group | `Loot-Profile-Group.html` |
| Weapons | `Weapons.html` |
| Weapon Mod Rules | `Weapon-Mod-Rules.html` |
| Combat Settings | `Combat-Settings.html` |
| Grid Settings | `Grid-Settings.html` |
| General Settings | `General-Settings.html` |
| Prefab Data | `Prefab-Data.html` |
| Block Replacement | `Block-Replacement.html` |
| Block Replacement Profiles | `Block-Replacement-Profiles.html` |
| Encounter Attributes | `Encounter-Attributes.html` |
| Encounter Guide | `Encounter-Guide.html` |
| Random Encounters | `Random-Encounters.html` |
| Space Cargo Ships | `Space-Cargo-Ships.html` |
| Planetary Cargo Ships | `Planetary-Cargo-Ships.html` |
| Planetary Installations | `Planetary-Installations.html` |
| Wave Spawners | `Wave-Spawners.html` |
| Boss Encounters | `Boss-Encounters.html` |
| Dereliction | `Dereliction.html` |
| Clean Up | `Clean-Up.html` |
| Timeout | `Timeout.html` |
| Replenishment | `Replenishment.html` |
| Player Condition Profile | `Player-Condition-Profile.html` |
| Creatures | `Creatures.html` |
| Bot Spawn | `Bot-Spawn.html` |
| AiEnabled Bot Spawning | `AiEnabled-Bot-Spawning.html` |
| Datapad | `Datapad.html` |
| Text Template | `TextTemplate.html` |
| Random Name Generator | `Random-Name-Generator-Guide.html` |
| Scripting API | `Scripting-API.html` |
| Custom Event Actions | `Custom-Event-Actions-and-ScenarioTools.html` |
| Event | `Event.html` |
| Event Action | `Event-Action.html` |
| Event Condition | `Event-Condition.html` |
| Events Getting Started | `Events-Getting-Started.html` |
| Threat Score | `Threat-Score-Guide.html` |
| Factions Template | `Factions-Template.html` |
| Armor Modules | `Armor-Modules-Included-with-MES.html` |
| NPC Grid Guidelines | `NPC-Grid-Setup-Guidelines.html` |
| Mod Difficulty | `Mod-Difficulty-Chart.html` |
| Mod Republishing | `Mod-Republishing-and-Reuse.html` |
| Economy Stations FAQ | `Economy-Stations-FAQ.html` |
| Mission Profile | `Mission-Profile.html` |
| Safezone Profile | `Safezone-Profile.html` |
| Shipyard Profile | `Shipyard-Profile.html` |
| Store Profile | `Store-Profile.html` |
| Admin & Debug | `Admin-&-Debug-Options.html` |
| Tutorials | `Tutorials.html` |
| FAQ | `Frequently-Asked-Questions.html` |
| Troubleshooting | `Troubleshooting.html` |
| Troubleshooting Tips | `Troubleshooting-Tips.html` |
| Bugs / Crashes | `Bugs,-Issues,-or-Crashes.html` |
| Home | `Home.html` |

---

## Rules

### ✅ DO
1. Verify every tag against the HTML documentation before using it
2. Use `mes-doc-index.json` to find the correct HTML filename, then `get_file` with the full repo path
3. Read only the relevant section of an HTML file
4. Use SpawnGroup templates whenever available (`SpawnGroup-Template.html`)
5. Preserve XML formatting exactly as found in examples
6. Generate valid `.sbc` files targeting Space Engineers XML format
7. Follow the tag nesting rules documented in each HTML file
8. Search ALL HTML files if a tag is not found in the expected file

### ❌ DON'T
1. **Never guess or invent tag names** - not even plausible-sounding ones
2. **Never rely on model memory** for tag names - always check the docs
3. **Never mix MES tags with RivalAI tags** in the wrong profile type
4. **Never read entire HTML files** - search for specific sections only
5. **Never use tags from `.sbc` examples** as proof a tag is valid - only HTML docs count
6. **Never skip documentation lookup** even for tags that seem obvious
7. **Never add tags not found in documentation** even if they seem logical

---

## File Structure

### SBC File Types and Their Documentation
| SBC Role | Header Tag | Reference HTML |
|---|---|---|
| Behavior profile | `[RivalAI Behavior]` | `Core-Behavior.html` |
| Autopilot profile | `[RivalAI Autopilot]` | `Autopilot.html` |
| Trigger profile | `[RivalAI Trigger]` | `Trigger.html` |
| Action profile | `[RivalAI Action]` | `Action.html` |
| Chat profile | `[RivalAI Chat]` | `Chat.html` |
| Command profile | `[RivalAI Command]` | `Command.html` |
| Condition profile | `[RivalAI Condition]` | `Condition.html` |
| Target profile | `[RivalAI Target]` | `Target.html` |
| Waypoint profile | `[RivalAI Waypoint]` | `Waypoint.html` |
| Zone profile | `[MES Zone]` | `Zone.html` |
| Spawn group | `[Modular Encounters SpawnGroup]` | `SpawnGroup.html` |
| Spawn conditions | `[MES Spawn Conditions]` | `Spawning-Conditions.html` |
| Manipulation | `[MES Manipulation]` | `Manipulation.html` |
| Loot profile | `[MES Loot]` | `Loot.html` |

### XML Structure Rules
- All profiles go inside `<EntityComponents>` blocks
- Profile `<SubtypeId>` must match exactly when referenced by another profile
- Tags are written as `[TagName:Value]` inside the `<Description>` block
- Behavior tags belong ONLY inside Behavior profiles
- Autopilot tags belong ONLY inside Autopilot profiles

---

## Validation Workflow

When generating or modifying any `.sbc` file:
1. Identify the file type from its `[RivalAI ...]` or `[MES ...]` header
2. Look up the correct HTML reference file from the table above
3. Build full path: `html_base_path` (from `mes-doc-index.json`) + filename
4. Use `get_file` to read only the relevant section
5. Verify EACH tag exists in that HTML file before writing it
6. If a tag is not found → check all other HTML files at the same base path
7. If not found anywhere → the tag is INVALID, do not use it

---

## Common Mistakes to Avoid
- `MaxEngagementDistance` → NOT documented, do not use
- `IdealTargetDistance` → NOT documented, do not use
- `OffensiveApproachSpeed` → NOT documented, do not use
- `OffensiveRetreatSpeed` → NOT documented, do not use
- `AutopilotFlags` → NOT documented, do not use
- `RemoveGridOnDespawn` → NOT documented, do not use
- `TimeUntilDespawn` → NOT documented, do not use
- `IgnoreDespawnRules` → NOT documented, do not use
- `BroadcastCurrentTarget` → NOT documented, do not use
- `BroadcastDespawnMessage` → NOT documented, do not use
- `MaximumWeaponRange` → NOT documented, do not use
- `IgnoreOtherCombatFlags` → NOT documented, do not use
- `MaxDistanceFromDefenseTerritory` → NOT documented, do not use
- `TerritoryToDefend` → NOT documented, do not use
- `PatrolRouteDistanceIncrement` → NOT documented, do not use
- `PatrolRouteMinDistance` → NOT documented, do not use
- `PatrolRouteMaxDistance` → NOT documented, do not use
- `DisengageOnNoTarget` → NOT documented, do not use
- `MaxTimeToWaitForTarget` → NOT documented, do not use
- `IdealMinimumDistance` → NOT documented, do not use

Always check documentation. Do not use tags from the list above unless they are found in the official MES HTML files.
