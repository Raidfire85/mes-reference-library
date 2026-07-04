import { parseSbcDocument } from './sbcParser';
import { buildModAssetIndex, ModAssetIndex } from './modAssetIndex';

export interface ModProfileEntry {
  subtypeId: string;
  header: string | null;
  sourceLabel: string;
}

export interface ModScopeContext {
  knownSubtypeIds: Set<string>;
  profileIndex: Map<string, ModProfileEntry>;
  assetIndex: ModAssetIndex;
  scopeLabel: string;
  openFileCount: number;
  diskFileCount: number;
}

export function buildModProfileIndex(sources: Map<string, string>): Map<string, ModProfileEntry> {
  const index = new Map<string, ModProfileEntry>();

  for (const [sourceLabel, text] of sources) {
    const parsed = parseSbcDocument(text);
    for (const profile of parsed.profiles) {
      if (!profile.subtypeId || profile.subtypeId === '(unknown)') {
        continue;
      }

      index.set(profile.subtypeId, {
        subtypeId: profile.subtypeId,
        header: profile.header,
        sourceLabel,
      });
    }
  }

  return index;
}

export function buildModScopeContext(
  sources: Map<string, string>,
  scopeLabel: string,
  openFileCount: number,
  diskFileCount: number
): ModScopeContext {
  const profileIndex = buildModProfileIndex(sources);
  return {
    knownSubtypeIds: new Set(profileIndex.keys()),
    profileIndex,
    assetIndex: buildModAssetIndex(sources),
    scopeLabel,
    openFileCount,
    diskFileCount,
  };
}

export function getModProfileEntry(
  profileIndex: Map<string, ModProfileEntry>,
  subtypeId: string
): ModProfileEntry | undefined {
  return profileIndex.get(subtypeId);
}
