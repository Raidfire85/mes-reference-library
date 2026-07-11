# Change Log

All notable changes to the MES Reference Library extension are documented here.

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
