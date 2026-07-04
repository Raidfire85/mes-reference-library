# MES Reference Library - AI Rules

## Core Principle
**Documentation first. Always.**
Model memory is unreliable for MES tags. The HTML files in this workspace are the ground truth.

---

## The Golden Rules

1. **Never invent XML tags** - If you cannot find it in the HTML docs, it does not exist
2. **Never skip documentation lookup** - Even for tags that seem obvious or familiar
3. **Never trust memory over docs** - A tag seen before may be wrong or outdated
4. **Never read entire HTML files** - Search for specific sections only
5. **Never mix profile types** - RivalAI tags stay in RivalAI profiles, MES tags in MES profiles
6. **Never use `.sbc` files as proof** - Only HTML documentation is valid evidence

---

## HTML Documentation Path

The MES HTML files are installed with the VSIX extension. The path varies per machine and per Visual Studio version:
```
%AppData%\Local\Microsoft\VisualStudio\<Version>\Extensions\<ExtensionFolder>\
```
The user **must tell Copilot** the exact path for their machine. Once known, it is stored as `html_base_path` in `mes-doc-index.json`.

Example: to read `SpawnGroup.html` once the path is known:
```
get_file("<html_base_path>SpawnGroup.html")
```

---

## Tag Lookup Workflow

```
User asks for a tag or profile
		↓
Check mes-doc-index.json for the correct HTML filename
		↓
Build full path: html_base_path + filename
		↓
Use get_file to read ONLY the relevant section
		↓
Verify the tag exists in that section
		↓
If NOT found → check all other HTML files at the same base path
		↓
If NOT found anywhere → TAG IS INVALID, do not use it
```

---

## Profile Type → Documentation Map

```
[RivalAI Behavior]    →  Core-Behavior.html
[RivalAI Autopilot]   →  Autopilot.html
[RivalAI Trigger]     →  Trigger.html
[RivalAI Action]      →  Action.html
[RivalAI Chat]        →  Chat.html
[RivalAI Command]     →  Command.html
[RivalAI Condition]   →  Condition.html
[RivalAI Target]      →  Target.html
[RivalAI Waypoint]    →  Waypoint.html
[MES Zone]            →  Zone.html

[Modular Encounters SpawnGroup]  →  SpawnGroup.html
[MES Spawn Conditions]           →  Spawning-Conditions.html
[MES Manipulation]               →  Manipulation.html
[MES Loot]                       →  Loot.html
```

> **Note:** `Mission-Profile.html`, `Safezone-Profile.html`, `Shipyard-Profile.html`, and `Store-Profile.html` are
> locally-sourced tag-reference pages (added to this repo because no equivalent page existed in the original MES wiki).
> They document tags that can appear inside existing profile `<Description>` blocks, but they do **not** define a
> standalone `[MES ...]` SBC header of their own. Use them as a tag lookup source only; do **not** invent a
> profile-header string for them.

---

## XML Structure Rules

```
SpawnGroup
  └── references → Behavior profile (via RivalAI)
		└── references → Autopilot profile
		└── references → Trigger profiles
			  └── references → Action profiles
					└── references → Chat profiles
					└── references → Command profiles
					└── references → Condition profiles
```

- Tags are written as `[TagName:Value]` inside `<Description>` blocks
- Profile `<SubtypeId>` must match EXACTLY when referenced by another profile
- Nesting rules are defined per profile type in its reference HTML

---

## Known Invalid Tags (Do NOT Use)

These were confirmed NOT present in any MES HTML documentation:

```
MaxEngagementDistance       ← NOT documented
IdealTargetDistance         ← NOT documented
IdealMinimumDistance        ← NOT documented
OffensiveApproachSpeed      ← NOT documented
OffensiveRetreatSpeed       ← NOT documented
AutopilotFlags              ← NOT documented
RemoveGridOnDespawn         ← NOT documented
TimeUntilDespawn            ← NOT documented
IgnoreDespawnRules          ← NOT documented
BroadcastCurrentTarget      ← NOT documented
BroadcastDespawnMessage     ← NOT documented
MaximumWeaponRange          ← NOT documented
IgnoreOtherCombatFlags      ← NOT documented
MaxDistanceFromDefenseTerritory ← NOT documented
TerritoryToDefend           ← NOT documented
PatrolRouteDistanceIncrement ← NOT documented
PatrolRouteMinDistance      ← NOT documented
PatrolRouteMaxDistance      ← NOT documented
DisengageOnNoTarget         ← NOT documented
MaxTimeToWaitForTarget      ← NOT documented
```

---
You can allways double-check the MES HTML files to verify if a tag is valid or not. If a tag is not found in any of the official documentation, it should be considered invalid and not used in any `.sbc` files.

## Quick Reference

| Need | Use |
|---|---|
| Find which HTML to read | `mes-doc-index.json` → get `html_base_path` + filename |
| Read a section of an HTML file | `get_file` with `html_base_path` + filename + startLine/endLine |
| Verify a tag exists | `get_file` on the correct HTML doc only |

---

## Space Engineers SBC Format

```xml
<?xml version="1.0"?>
<Definitions xmlns:xsi="..." xmlns:xsd="...">
  <EntityComponents>
	<EntityComponent xsi:type="MyObjectBuilder_InventoryComponentDefinition">
	  <Id>
		<TypeId>Inventory</TypeId>
		<SubtypeId>MyProfile-SubtypeId</SubtypeId>
	  </Id>
	  <Description>
		[RivalAI ProfileType]
		[Tag:Value]
		[Tag:Value]
	  </Description>
	</EntityComponent>
  </EntityComponents>
</Definitions>
```
