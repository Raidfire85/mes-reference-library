# Change Log

All notable changes to the MES Reference Library extension are documented here.

## [3.19.6] - 2026-07-12

### Fixed

- Wiki tag metadata parsing now accepts both `Allowed Values:` and `Allowed Value(s):` table labels (synced WebWiki uses the latter).
- Also accepts `Multiple Tags Allowed:` alongside `Multiple Tag Allowed:`.

### Changed

- Mod validation report header now shows the running extension version (e.g. `MES Reference Library v3.19.6`) so you can confirm which build validated your mod.

## [3.19.5] - 2026-07-12

### Fixed

- **SBC / Mod validation false positives** for tags like `[MaxActions:-1]`, `[CheckTargetDistance:true]`, `[LimitRotationSpeed:true]`, and `[ReplenishSystems:true]`.
- Wiki tag metadata parsing now reads MES-WebWiki `<table>` markup (previously looked for nonexistent `role="table"` tables, so Allowed Values were ignored).
- `-1` is accepted only on MES tags where the source uses it as disabled/unlimited (110 tags derived from MES `Profile.cs` defaults plus wiki default/description hints).

## [3.19.4] - 2026-07-12

### Fixed

- **Validate Mod** no longer fails silently: errors are shown in a notification if validation crashes.
- Skips oversized `.sbc` files (> 50 MB, usually world saves) instead of hitting Node's 2 GiB read limit.
- Warns when no `.sbc` files are found under the selected `Data` folder.
- Validation report tab is revealed more reliably; completion message points to the **MES Mod Validation** panel.

## [3.19.3] - 2026-07-12

### Changed

- Rebuilt bundled wiki from latest [MES-WebWiki](https://github.com/Raidfire85/MES-WebWiki), including enum/vector allowed values and tag table updates across Autopilot, Spawn Conditions, Core Behavior, Command, Target, Trigger, Weapons, and related pages.
- Refreshed vendored sync modules from [MES-WebWiki-Sync](https://github.com/Raidfire85/MES-WebWiki-Sync).

## [3.19.2] - 2026-07-12

### Fixed

- VS Marketplace and Open VSX icon restored to **MeridiousIcon** (scaled `MeridiousIcon.jpg` portrait) instead of the stylized blue/white silhouette.

## [3.19.1] - 2026-07-12

### Fixed

- Marketplace icon now uses a white portrait on a steel-blue background so it displays correctly on the Open VSX Registry (previous black-on-transparent icon was invisible on dark gallery pages).
- Extension icon moved to root `icon.png` for Open VSX compatibility.

## [3.19.0] - 2026-07-12

### Changed

- Synced bundled wiki from latest [MES-WebWiki](https://github.com/Raidfire85/MES-WebWiki), including enum and vector **allowed values** resolved from MES profile source via [MES-WebWiki-Sync](https://github.com/Raidfire85/MES-WebWiki-Sync).
- Build now fetches WebWiki markdown from GitHub by default at compile time (set `WIKI_BUILD_LOCAL=1` to use a local `../MES-WebWiki` clone instead).
- Updated wiki pages: Safezone Profile, Action, Event-Action, Faction Icon, Spawn Conditions, Home, and related tag tables.

### Fixed

- Validator and wiki tag tables now reflect MES-source enum/vector hints where the WebWiki sync pipeline provides them.

## [3.18.4] - 2026-07-11

### Fixed

- Packaged `markdown-it` and `yaml` dependencies so the extension activates correctly after install.
- Resolved duplicate wiki page titles from mkdocs nav vs. markdown headings.
- Published to VS Marketplace and Open VSX.
