# MES Reference Library

Offline **Modular Encounter Systems (MES)** and **RivalAI** wiki reference for [VS Code](https://code.visualstudio.com/), with optional **GitHub sync** and built-in **SBC validation** for Space Engineers mod authors.

> **Unofficial community tool** — not affiliated with or endorsed by MeridiusIX.

The full wiki is **bundled locally** — **no internet required** to browse, search, or validate after install. **Sync is optional** and updates the wiki from the community [MES-WebWiki](https://github.com/Raidfire85/MES-WebWiki) repository (refreshed weekly on GitHub).

**Current release:** `3.19.3`

## Features

### Wiki reference panel

- Sidebar **MES Reference** panel with the full MES/RivalAI community wiki (~80+ pages)
- **Search** across all wiki pages
- **Back / forward** navigation, **refresh**, and **bookmarks**
- Wiki links open inside the panel (no external browser needed)
- Sticky toolbar on every page: search, validate, sync, navigation, and bookmarks
- Nested sidebar navigation matching the WebWiki structure (e.g. Economy & Station Blocks)

### Wiki sync from MES-WebWiki

> **Internet required for sync.** Sync contacts `api.github.com` and `raw.githubusercontent.com`. Wiki browsing, search, bookmarks, and SBC validation work fully offline with the bundled wiki.

Click **⟳ Sync** in the wiki toolbar or run **MES Reference Library: Sync Wiki from MES-WebWiki** from the Command Palette.

On **first install**, the extension runs a **one-time background sync** automatically when online. After that, use **⟳ Sync** yourself to stay current. Disable with **`mesReference.syncOnFirstRun`** if you prefer fully manual updates.

**Wiki content** is downloaded from [Raidfire85/MES-WebWiki](https://github.com/Raidfire85/MES-WebWiki) (`main` branch):

- `docs/*.md` — community wiki markdown (auto-updated weekly on GitHub)
- `mkdocs.yml` — sidebar/navigation structure
- Built locally into offline HTML pages inside the extension

If GitHub is unreachable, the **bundled wiki keeps working** — sync fails gracefully and you can try again later.

**Validator data** (separate from wiki pages) is updated from [MeridiusIX/Modular-Encounters-Systems](https://github.com/MeridiusIX/Modular-Encounters-Systems) (`master` branch):

- Downloads `Data/Scripts/ModularEncountersSystems` for profile headers and tag metadata
- Updates `profile-tag-index.json` used by the SBC validator
- GitHub is tried first; if unavailable, sync auto-searches workshop/local MES installs or prompts for a folder

Auto-search order for MES source fallback:

1. **`mesReference.mesSourcePath`** (if previously saved)
2. **Steam workshop MES** install
3. **Other workshop/local mod** folders containing `Data/Scripts/ModularEncountersSystems`
4. **Folder picker** — if nothing above is found, you are prompted to choose the folder manually

### Setting the offline MES source path

| Method | How |
|--------|-----|
| **Command Palette** | `MES Reference Library: Set MES Source Path (Offline Fallback)` — folder picker |
| **Settings UI** | `File → Preferences → Settings` → search **MES Reference** → **Mes Source Path** |
| **settings.json** | `"mesReference.mesSourcePath": "C:\\\\path\\\\to\\\\ModularEncountersSystems"` |

Use **Show MES Source Path** to see the configured path (or what auto-discovery would find). Use **Clear MES Source Path** to remove it.

### SBC validation

Validation runs automatically when you open, edit, or save `.sbc` files. You can also validate manually from the editor title bar, the wiki toolbar (**✓**), the Command Palette, or **Ctrl+Shift+M**.

A valid **MES profile** requires a `<Description>` block **and** a recognized profile header (e.g. `[RivalAI Behavior]`, `[Modular Encounters SpawnGroup]`).

Checks include:

- **Tag names** — documented in the MES wiki, known-invalid tags, and tags used under the wrong profile (e.g. a Weapons tag under Behavior)
- **Values** — placeholders like `[UseBarrageFire:Value]` flagged as *not set* with hints (`use true or false`, numeric ranges, etc.)
- **Enums & booleans** — from wiki *Allowed Values* tables (e.g. `BehaviorName`, Trigger `Type`)
- **Numbers** — min/max and range rules from the wiki (e.g. `[Radius:25000]`)
- **GPS / Vector3D** — coordinate format such as `[Coordinates:{X:1 Y:1 Z:1}]`
- **MES profile references** — cross-file SubtypeId lookup across your mod's entire **`Data`** folder tree
- **Linked assets** — audio SubtypeIds (`[ChatAudio:…]`), container types (`[ContainerTypes:…]`, `[LootContainerSubtypeId:…]`), and spawn group prefabs (`<Prefab SubtypeId="…">`) validated against definitions in your mod's audio, `ContainerTypes`, and `Prefabs` .sbc files
- **Discovered profiles** — headers found by sync are included alongside the static profile list

Diagnostics appear as squiggles in the editor with **fix hints** in the Problems panel. Use **Open Wiki** after validating to jump to relevant documentation.

### Mod validation report

Run **MES Reference Library: Validate Mod (All SBC in Data)** from the Command Palette, wiki toolbar, or **Ctrl+Shift+Alt+M** while editing an `.sbc` file. Right-click a mod **`Data`** folder in the Explorer for the same command.

The report scans every `.sbc` under your mod `Data` folder and opens a summary panel:

- **MES profile files** — full tag, reference, and profile validation with fix hints
- **Skipped non-MES files** — summarized by category (Audio, Container types, Prefabs, Factions, etc.) with SubtypeId counts indexed for cross-reference checks — not listed file-by-file
- **Duplicate SubtypeIds** — profiles defined in more than one file across the mod
- **Apply fix** buttons where a safe one-click fix is available (see below)

### Quick fixes

Conservative one-click fixes — only offered when the edit is mechanically safe and won't guess at references or NPC wiring.

Available as **Quick Fix** (lightbulb) in the editor and **Apply** buttons in the mod validation report:

| Fix | When |
|-----|------|
| **Autopilot overwrite** | `ChangeAutopilotProfile` + `AutopilotProfile:SubtypeId` on an Action profile → `OverwriteAutopilotProfile` + `OverwriteAutopilotId` |
| **Move tag to linked profile** | Wrong-profile tag, and exactly one linked profile of the correct type (e.g. spawn condition tag → spawn group that references it) |
| **Remove unparsed tag** | Dead tags MES never parses, or wrong-profile tags when move isn't possible |

**Not auto-fixed** (hints only): missing/wrong MES profile references, duplicate SubtypeIds, enum/value guesses, and wiring tags like `Spawner`, `TargetData`, `BehaviorName`.

## Installation

### From the Marketplace (recommended)

Search for **MES Reference Library** in the VS Code or Cursor Extensions view and click **Install**.

Or open: [MES Reference Library on the Visual Studio Marketplace](https://marketplace.visualstudio.com/search?term=mes%20reference%20library&target=VSCode&category=All%20categories&sortBy=Relevance)

### From GitHub Releases

1. Open the [Releases](https://github.com/Raidfire85/MES-Reference-Library/releases) page and download the latest `mes-reference-library-*.vsix`.
2. In VS Code or Cursor: **Extensions** → **⋯** menu → **Install from VSIX...**
3. Select the downloaded file and **reload the window**.

> Prefer not to install a VSIX from someone directly? Clone this repo, run `npm install && npm run build-vsix`, and install the VSIX you built yourself.

### From CLI

```powershell
$env:NODE_OPTIONS = "--disable-warning=DEP0040 --disable-warning=DEP0169"
cursor --install-extension "path\to\mes-reference-library-3.19.3.vsix"
```

For VS Code, use `code` instead of `cursor`.

### From source (developers)

```powershell
npm run install-extension
```

This builds if needed, picks the newest `.vsix` in the repo root, and installs it quietly.

> **Note:** If you run `cursor --install-extension` without `NODE_OPTIONS`, you may see Node deprecation warnings (`punycode`, `url.parse`). Those come from the **Cursor/VS Code CLI**, not this extension. They are safe to ignore, or use the commands above to hide them.

## Usage

1. Click the **MES Reference** icon in the Activity Bar (left sidebar).
2. Browse or search the wiki while editing your mod.
3. Open any `.sbc` file — validation runs automatically.
4. Hover squiggles for details and fix hints; use Quick Fix where offered.
5. Run **Validate Mod** to get a full report across your `Data` folder.
6. Run **⟳ Sync** when you want the latest wiki from MES-WebWiki and updated validator tag data from MES source.

## Commands

| Command | Description |
|---------|-------------|
| **MES Reference Library: Open** | Focus the wiki panel |
| **MES Reference Library: Search** | Focus the wiki search box |
| **MES Reference Library: Show Bookmarks** | Pick a bookmarked wiki page |
| **MES Reference Library: Validate Current SBC** | Validate the active `.sbc` file |
| **MES Reference Library: Validate Mod (All SBC in Data)** | Scan the mod `Data` folder and open the validation report |
| **MES Reference Library: Sync Wiki from MES-WebWiki** | Download wiki markdown from MES-WebWiki and rebuild pages; update validator tag index from MES source |
| **MES Reference Library: Set MES Source Path (Offline Fallback)** | Choose a local `ModularEncountersSystems` folder for when GitHub is unavailable |
| **MES Reference Library: Show MES Source Path** | Show configured fallback path or auto-detected local MES install |
| **MES Reference Library: Clear MES Source Path** | Remove the configured fallback path |
| **MES Reference Library: Open Wiki for Issue** | Open wiki docs for the first validation issue |

**Keyboard shortcuts:**

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+M` | Validate current `.sbc` |
| `Ctrl+Shift+Alt+M` | Validate entire mod `Data` folder |

## Settings

| Setting | Description |
|---------|-------------|
| **`mesReference.mesSourcePath`** | Offline fallback path to `ModularEncountersSystems`. **Not required** — sync auto-searches workshop/local installs when GitHub fails; you only need this if auto-search cannot find MES (or you pick a folder when prompted). |
| **`mesReference.syncOnFirstRun`** | Run a one-time background wiki sync on first activation after install (default: `true`). Disable if you prefer fully manual updates. |

## Requirements & limitations

| Requirement | Details |
|-------------|---------|
| **Offline use** | Wiki browse, search, bookmarks, and validation work without internet after install |
| **Sync (optional)** | Requires `api.github.com` and `raw.githubusercontent.com` |
| **Space Engineers modding** | Designed for `.sbc` mod definition files |
| **Experimental mode** | MES mods require Experimental Mode in Space Engineers (documented in wiki) |

**Sync does not require** the WebWiki site to be hosted or online — only the GitHub repository. If sync fails, the bundled wiki remains usable.

## Building from source

```powershell
npm install
npm run compile
npm run build-vsix
```

Output: `mes-reference-library-<version>.vsix` in the repo root. Previous builds are moved to `oldver/` automatically.

### Publishing to the Marketplace

See [PUBLISHING.md](PUBLISHING.md) for step-by-step instructions.

### Developer scripts

```powershell
npm run test-parser          # smoke tests for XML-aware SBC parsing
npm run scan-vanilla-se-roots  # regenerate vanilla SE definition roots from game install
npm run validate-mod -- --data "C:\path\to\mod\Data" [--out report.json]
npm run generate-icons       # regenerate media/icon.png and activitybar.svg from MeridiousIcon.jpg
```

`validate-mod` runs headless (no VS Code) and exits with code 1 when errors are found.

## License

This extension is released under the **MIT License** (see `LICENSE` in the package root).

### Extension software

Copyright (c) 2026 **raidfire** — the VS Code/Cursor extension code (TypeScript, packaging, validation, and sync tooling).

### Bundled MES documentation

**Unofficial community tool** — not affiliated with or endorsed by MeridiusIX.

The offline wiki pages are sourced from the community [MES-WebWiki](https://github.com/Raidfire85/MES-WebWiki) project, which mirrors and extends documentation from [Modular Encounter Systems / RivalAI](https://github.com/MeridiusIX/Modular-Encounters-Systems). Original documentation is attributed to **MeridiusIX** and [GitHub contributors](https://github.com/MeridiusIX/Modular-Encounters-Systems/graphs/contributors), including:

| Contributor | Contributor |
|-------------|-------------|
| MeridiusIX | CptArthur |
| enenra | jturp |
| ryo0ka | ToroidalDevil |
| stubkan | irreality-net |
| DarkXeRoX | tinsoldier |
| InvalidArgument3 | Synirrr |
| Blaylock1988 | SpruceMarcy |
| StalkR | *(and others)* |

Validator tag metadata is generated from C# profile definitions in the MES source repository. The upstream MES project does not ship a separate license file; this extension redistributes documentation with attribution for offline reference use.

If you are a contributor and would like your name added or adjusted, open an issue on this extension's repository.
