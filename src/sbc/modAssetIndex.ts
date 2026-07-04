import { columnAt, lineNumberAt } from './textEdits';

/** Indexes Space Engineers definition SubtypeIds from non-MES .sbc files in a mod Data folder. */
export interface ModAssetIndex {
  audioSubtypeIds: Set<string>;
  containerTypeSubtypeIds: Set<string>;
  prefabSubtypeIds: Set<string>;
}

export interface ModAssetIndexStats {
  audioSubtypeCount: number;
  containerTypeSubtypeCount: number;
  prefabSubtypeCount: number;
}

export interface SpawnGroupPrefabReference {
  subtypeId: string;
  line: number;
  column: number;
  endColumn: number;
}

export const AUDIO_REFERENCE_TAGS = new Set(['ChatAudio', 'ChatOverrideAudio']);

/** MES skips sound when ChatAudio is None — wiki documents this as "no audio" (not a SubtypeId). */
export function isNoChatAudioValue(value: string): boolean {
  return value.trim().toLowerCase() === 'none';
}

export const CONTAINER_TYPE_REFERENCE_TAGS = new Set([
  'ContainerTypes',
  'LootContainerSubtypeId',
  'ContainerTypeSubtypeIds',
  'ContainerTypesForStoreOrders',
]);

export const PREFAB_REFERENCE_TAGS = new Set(['Prefabs', 'PrefabIds']);

export function buildModAssetIndex(sources: Map<string, string>): ModAssetIndex {
  const audioSubtypeIds = new Set<string>();
  const containerTypeSubtypeIds = new Set<string>();
  const prefabSubtypeIds = new Set<string>();

  for (const text of sources.values()) {
    for (const id of extractAudioSubtypeIds(text)) {
      audioSubtypeIds.add(id);
    }
    for (const id of extractContainerTypeSubtypeIds(text)) {
      containerTypeSubtypeIds.add(id);
    }
    for (const id of extractPrefabSubtypeIds(text)) {
      prefabSubtypeIds.add(id);
    }
  }

  return { audioSubtypeIds, containerTypeSubtypeIds, prefabSubtypeIds };
}

export function getModAssetIndexStats(index: ModAssetIndex): ModAssetIndexStats {
  return {
    audioSubtypeCount: index.audioSubtypeIds.size,
    containerTypeSubtypeCount: index.containerTypeSubtypeIds.size,
    prefabSubtypeCount: index.prefabSubtypeIds.size,
  };
}

export function extractAudioSubtypeIds(text: string): string[] {
  if (!/<Sounds\b/i.test(text) && !/<SoundDefinitions\b/i.test(text)) {
    return [];
  }

  const ids: string[] = [];
  const pattern =
    /<Sound\b[^>]*>[\s\S]*?<TypeId>\s*MyObjectBuilder_AudioDefinition\s*<\/TypeId>\s*<SubtypeId>([^<]+)<\/SubtypeId>/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const id = match[1].trim();
    if (id) {
      ids.push(id);
    }
  }

  return ids;
}

export function extractContainerTypeSubtypeIds(text: string): string[] {
  if (!/<ContainerTypes\b/i.test(text)) {
    return [];
  }

  const ids: string[] = [];
  const pattern =
    /<ContainerType\b[^>]*>[\s\S]*?<TypeId>\s*ContainerTypeDefinition\s*<\/TypeId>\s*<SubtypeId>([^<]+)<\/SubtypeId>/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const id = match[1].trim();
    if (id) {
      ids.push(id);
    }
  }

  return ids;
}

export function extractPrefabSubtypeIds(text: string): string[] {
  if (!/<Prefabs\b/i.test(text)) {
    return [];
  }

  const ids = new Set<string>();

  const subtypeIdPattern =
    /<TypeId>\s*MyObjectBuilder_PrefabDefinition\s*<\/TypeId>\s*<SubtypeId>([^<]+)<\/SubtypeId>/gi;
  const idAttributePatterns = [
    /<Id\b[^>]*\bType="MyObjectBuilder_PrefabDefinition"[^>]*\bSubtype="([^"]+)"/gi,
    /<Id\b[^>]*\bSubtype="([^"]+)"[^>]*\bType="MyObjectBuilder_PrefabDefinition"/gi,
  ];

  let match: RegExpExecArray | null;
  while ((match = subtypeIdPattern.exec(text)) !== null) {
    const id = match[1].trim();
    if (id) {
      ids.add(id);
    }
  }

  for (const pattern of idAttributePatterns) {
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      const id = match[1].trim();
      if (id) {
        ids.add(id);
      }
    }
  }

  return [...ids];
}

export function extractSpawnGroupPrefabReferences(text: string): SpawnGroupPrefabReference[] {
  if (!/<SpawnGroups\b/i.test(text) && !/<SpawnGroup\b/i.test(text)) {
    return [];
  }

  const refs: SpawnGroupPrefabReference[] = [];
  const pattern = /<Prefab\s+SubtypeId="([^"]+)"/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const subtypeId = match[1].trim();
    if (!subtypeId) {
      continue;
    }

    const valueStart = match.index + match[0].indexOf(subtypeId);
    refs.push({
      subtypeId,
      line: lineNumberAt(text, match.index),
      column: columnAt(text, valueStart),
      endColumn: columnAt(text, valueStart + subtypeId.length),
    });
  }

  return refs;
}

export function extractIndexedAssetIds(text: string): string[] {
  return [
    ...extractAudioSubtypeIds(text),
    ...extractContainerTypeSubtypeIds(text),
    ...extractPrefabSubtypeIds(text),
  ];
}
