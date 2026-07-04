import * as fs from 'fs/promises';
import * as path from 'path';
import { NEW_PROFILE_PAGES, PAGE_MAP } from './constants';
import { loadDiscoveredProfilesFile } from './discoveredProfiles';
import {
  findAllProfileCsFiles,
  parseProfileManagerHeaders,
  profileCsToTitle,
} from './profileDiscovery';
import { findProfileFile, getTagMetaFromSource, parseTagMetaFromContent } from './tagMetaParser';
import { STATIC_PROFILE_HEADERS } from '../sbc/profileHeaders';

const PROFILE_TAG_INDEX_VERSION = 1;
const PROFILE_MANAGER = 'ProfileManager.cs';

const RUNTIME_ONLY_SOURCE_FILES = new Set(['EventGroupProfile.cs', 'AutoPilotProfileBak.cs']);

/** Non-*Profile.cs files that define SBC tags for a profile header. */
const EXTRA_TAG_SOURCE_FILES: Record<string, string[]> = {
  'EventActionReference.cs': ['[MES Event Action]'],
  'EventConditions.cs': ['[MES Event Condition]'],
  'WeaponSystemReference.cs': ['[RivalAI Weapons]', '[MES AI Weapons]'],
  'ImprovedSpawnGroup.cs': ['[Modular Encounters SpawnGroup]'],
  'LootGroup.cs': ['[MES Loot Group]'],
  'ManipulationGroup.cs': ['[MES Manipulation Group]'],
  'SpawnConditionsGroup.cs': ['[MES Spawn Conditions Group]'],
  'StaticEncounter.cs': ['[MES Static Encounter]'],
  'Zone.cs': ['[MES Zone]'],
};

/** Parsed on dedicated SBC profile SubtypeIds — must not pollute [RivalAI Behavior]. */
function isDedicatedSbcProfileSourceFile(fileName: string): boolean {
  return (
    /Profile\.cs$/i.test(fileName) ||
    /ReferenceProfile\.cs$/i.test(fileName) ||
    /Reference\.cs$/i.test(fileName)
  );
}

const BEHAVIOR_HEADERS = ['[RivalAI Behavior]', '[Rival AI Behavior]', '[MES AI Behavior]'];
const SPAWN_GROUP_HEADER = '[Modular Encounters SpawnGroup]';

export interface ProfileTagIndexProfile {
  profileCs: string;
  title: string;
  headers: string[];
  tags: string[];
}

export interface ProfileTagIndexTagProfile {
  header: string;
  title: string;
  profileCs: string;
}

export interface ProfileTagIndex {
  version: number;
  generatedAt: string;
  sourceLabel: string;
  profiles: ProfileTagIndexProfile[];
  tagToHeaders: Record<string, string[]>;
  headerToTags: Record<string, string[]>;
  tagToProfiles: Record<string, ProfileTagIndexTagProfile[]>;
}

export async function buildProfileTagIndex(
  mesSourcePath: string,
  wikiDir: string,
  sourceLabel: string
): Promise<ProfileTagIndex> {
  const managerHeaders = await parseProfileManagerHeaders(mesSourcePath);
  const managerBindings = await parseProfileManagerHeaderBindings(mesSourcePath);
  const discovered = await loadDiscoveredProfilesFile(wikiDir);
  const headerBySourceFile = buildHeaderBySourceFileMap(managerHeaders, managerBindings, discovered.profiles);

  const sourceFiles = await collectTagSourceFiles(mesSourcePath);
  const behaviorTags = await collectBehaviorOnlyTags(mesSourcePath);
  const profileEntries: ProfileTagIndexProfile[] = [];

  for (const sourceFile of sourceFiles) {
    const tags = await getTagsForSourceFile(mesSourcePath, sourceFile);
    if (tags.length === 0) {
      continue;
    }

    const headers = headerBySourceFile.get(sourceFile) ?? [];
    if (headers.length === 0) {
      continue;
    }

    profileEntries.push({
      profileCs: sourceFile,
      title: profileCsToTitle(sourceFile.replace(/\.cs$/i, '')),
      headers: [...headers].sort(),
      tags: tags.sort(),
    });
  }

  if (behaviorTags.length > 0) {
    profileEntries.push({
      profileCs: 'Behavior/Subsystems',
      title: 'Core Behavior',
      headers: [...BEHAVIOR_HEADERS].sort(),
      tags: behaviorTags.sort(),
    });
  }

  const coreBehaviorExtra = PAGE_MAP['Core-Behavior.html']?.extraTags ?? [];
  if (coreBehaviorExtra.length > 0) {
    const entry = profileEntries.find((p) => p.profileCs === 'Behavior/Subsystems');
    if (entry) {
      const merged = new Set([...entry.tags, ...coreBehaviorExtra]);
      entry.tags = [...merged].sort();
    }
  }

  await mergeSpawnGroupInlineTags(profileEntries, mesSourcePath);

  return finalizeProfileTagIndex(profileEntries, sourceLabel);
}

export async function saveProfileTagIndex(
  wikiDir: string,
  index: ProfileTagIndex
): Promise<boolean> {
  const filePath = path.join(wikiDir, 'profile-tag-index.json');
  const json = `${JSON.stringify(index, null, 2)}\n`;
  let changed = true;

  try {
    const existing = await fs.readFile(filePath, 'utf8');
    const existingIndex = JSON.parse(existing.replace(/^\uFEFF/, '')) as ProfileTagIndex;
    changed = !profileTagIndexDataEquals(existingIndex, index);
  } catch {
    // Missing or unreadable file — write fresh index.
  }

  if (changed) {
    await fs.writeFile(filePath, json, 'utf8');
  }

  return changed;
}

/** Compare tag index payload, ignoring sync metadata that changes every run. */
export function profileTagIndexDataEquals(a: ProfileTagIndex, b: ProfileTagIndex): boolean {
  return serializeProfileTagIndexData(a) === serializeProfileTagIndexData(b);
}

function serializeProfileTagIndexData(index: ProfileTagIndex): string {
  const { generatedAt: _generatedAt, sourceLabel: _sourceLabel, ...data } = index;
  return JSON.stringify(data);
}

function finalizeProfileTagIndex(
  profiles: ProfileTagIndexProfile[],
  sourceLabel: string
): ProfileTagIndex {
  const tagToHeaders = new Map<string, Set<string>>();
  const headerToTags = new Map<string, Set<string>>();
  const tagToProfiles = new Map<string, Map<string, ProfileTagIndexTagProfile>>();

  for (const profile of profiles) {
    for (const header of profile.headers) {
      if (!headerToTags.has(header)) {
        headerToTags.set(header, new Set());
      }
      for (const tag of profile.tags) {
        headerToTags.get(header)!.add(tag);

        if (!tagToHeaders.has(tag)) {
          tagToHeaders.set(tag, new Set());
        }
        tagToHeaders.get(tag)!.add(header);

        if (!tagToProfiles.has(tag)) {
          tagToProfiles.set(tag, new Map());
        }
        const byHeader = tagToProfiles.get(tag)!;
        if (!byHeader.has(header)) {
          byHeader.set(header, {
            header,
            title: profile.title,
            profileCs: profile.profileCs,
          });
        }
      }
    }
  }

  const sortStrings = (values: Iterable<string>): string[] => [...values].sort();

  return {
    version: PROFILE_TAG_INDEX_VERSION,
    generatedAt: new Date().toISOString(),
    sourceLabel,
    profiles: profiles.sort((a, b) => a.profileCs.localeCompare(b.profileCs)),
    tagToHeaders: Object.fromEntries(
      [...tagToHeaders.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([tag, headers]) => [tag, sortStrings(headers)])
    ),
    headerToTags: Object.fromEntries(
      [...headerToTags.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([header, tags]) => [header, sortStrings(tags)])
    ),
    tagToProfiles: Object.fromEntries(
      [...tagToProfiles.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([tag, byHeader]) => [
          tag,
          [...byHeader.values()].sort((a, b) => a.title.localeCompare(b.title)),
        ])
    ),
  };
}

function buildHeaderBySourceFileMap(
  managerHeaders: Map<string, string>,
  managerBindings: Map<string, string[]>,
  discoveredProfiles: Array<{ profileCs: string; header: string | null }>
): Map<string, string[]> {
  const map = new Map<string, Set<string>>();

  const add = (sourceFile: string, header: string): void => {
    if (!map.has(sourceFile)) {
      map.set(sourceFile, new Set());
    }
    map.get(sourceFile)!.add(header);
  };

  for (const [header, htmlFile] of Object.entries(STATIC_PROFILE_HEADERS)) {
    const cfg = PAGE_MAP[htmlFile];
    if (cfg?.profile) {
      add(cfg.profile, header);
    }
  }

  for (const [sourceFile, headers] of managerBindings) {
    for (const header of headers) {
      add(sourceFile, header);
    }
  }

  for (const [stem, header] of managerHeaders) {
    const sourceFile = `${stem}Profile.cs`;
    add(sourceFile, header);
    const groupFile = `${stem}Group.cs`;
    add(groupFile, header);
  }

  for (const profile of discoveredProfiles) {
    if (profile.header) {
      add(profile.profileCs, profile.header);
    }
  }

  for (const [sourceFile, headers] of Object.entries(EXTRA_TAG_SOURCE_FILES)) {
    for (const header of headers) {
      add(sourceFile, header);
    }
  }

  const resolved = new Map<string, string[]>();
  for (const [sourceFile, headers] of map) {
    resolved.set(sourceFile, [...headers].sort());
  }

  for (const sourceFile of Object.keys(EXTRA_TAG_SOURCE_FILES)) {
    if (!resolved.has(sourceFile)) {
      resolved.set(sourceFile, [...EXTRA_TAG_SOURCE_FILES[sourceFile]].sort());
    }
  }

  return resolved;
}

async function parseProfileManagerHeaderBindings(
  mesSourcePath: string
): Promise<Map<string, string[]>> {
  const managerPath = await findProfileFile(mesSourcePath, PROFILE_MANAGER);
  const bindings = new Map<string, Set<string>>();

  if (!managerPath) {
    return new Map();
  }

  const content = await fs.readFile(managerPath, 'utf8');
  const blocks = content.split(/\r?\n\s*if\s*\(/);

  for (const block of blocks) {
    const headers = new Set<string>();
    for (const match of block.matchAll(/DescriptionText\.Contains\("(\[[^\]]+\])"\)/g)) {
      headers.add(match[1]);
    }

    if (headers.size === 0) {
      continue;
    }

    const classMatches = [...block.matchAll(/new\s+([A-Za-z][A-Za-z0-9_]*)\s*\(/g)];
    for (const classMatch of classMatches) {
      const sourceFile = classNameToSourceFile(classMatch[1]);
      if (!bindings.has(sourceFile)) {
        bindings.set(sourceFile, new Set());
      }
      for (const header of headers) {
        bindings.get(sourceFile)!.add(header);
      }
    }

    const stemMatch = block.match(/(\w+?)Profiles\.ContainsKey/);
    if (stemMatch && classMatches.length === 0) {
      const sourceFile = `${stemMatch[1]}Profile.cs`;
      if (!bindings.has(sourceFile)) {
        bindings.set(sourceFile, new Set());
      }
      for (const header of headers) {
        bindings.get(sourceFile)!.add(header);
      }
    }
  }

  return new Map(
    [...bindings.entries()].map(([sourceFile, headers]) => [sourceFile, [...headers].sort()])
  );
}

function classNameToSourceFile(className: string): string {
  if (className.endsWith('Profile') || className.endsWith('Group')) {
    return `${className}.cs`;
  }

  if (className.endsWith('Reference')) {
    return `${className}.cs`;
  }

  return `${className}.cs`;
}

async function collectTagSourceFiles(mesSourcePath: string): Promise<string[]> {
  const profileFiles = (await findAllProfileCsFiles(mesSourcePath)).filter(
    (file) => !RUNTIME_ONLY_SOURCE_FILES.has(file)
  );
  const extras = Object.keys(EXTRA_TAG_SOURCE_FILES);
  return [...new Set([...profileFiles, ...extras])].sort();
}

async function getTagsForSourceFile(mesSourcePath: string, sourceFile: string): Promise<string[]> {
  const meta = await getTagMetaFromSource(mesSourcePath, sourceFile);
  return Object.keys(meta);
}

async function collectBehaviorOnlyTags(mesSourcePath: string): Promise<string[]> {
  const tags = new Set<string>();
  const behaviorDir = await findBehaviorDir(mesSourcePath);
  if (!behaviorDir) {
    return [];
  }

  const subsystemsDir = path.join(behaviorDir, 'Subsystems');
  await walkCsFiles(behaviorDir, async (filePath) => {
    const fileName = path.basename(filePath);
    if (isDedicatedSbcProfileSourceFile(fileName)) {
      return;
    }

    if (filePath.startsWith(subsystemsDir) && isBehaviorSubsystemRuntimeOnly(fileName)) {
      return;
    }

    const content = await fs.readFile(filePath, 'utf8');
    for (const tag of Object.keys(parseTagMetaFromContent(content))) {
      tags.add(tag);
    }
  });

  return [...tags];
}

/** Runtime wiring on behavior grids — not standalone SBC profile tag tables. */
function isBehaviorSubsystemRuntimeOnly(fileName: string): boolean {
  return fileName === 'ActionSystem.cs' || fileName === 'ConditionProfile.cs';
}

async function mergeSpawnGroupInlineTags(
  profileEntries: ProfileTagIndexProfile[],
  mesSourcePath: string
): Promise<void> {
  const spawnConditionTags =
    profileEntries.find((p) => p.profileCs === 'SpawnConditionsProfile.cs')?.tags ?? [];
  const manipulationTags =
    profileEntries.find((p) => p.profileCs === 'ManipulationProfile.cs')?.tags ?? [];
  const spawnGroupOwnTags = await getTagsForSourceFile(mesSourcePath, 'ImprovedSpawnGroup.cs');

  const merged = new Set([...spawnConditionTags, ...manipulationTags, ...spawnGroupOwnTags]);
  if (merged.size === 0) {
    return;
  }

  let entry = profileEntries.find((p) => p.profileCs === 'ImprovedSpawnGroup.cs');
  if (!entry) {
    entry = {
      profileCs: 'ImprovedSpawnGroup.cs',
      title: 'Spawn Group',
      headers: [SPAWN_GROUP_HEADER],
      tags: [],
    };
    profileEntries.push(entry);
  }

  entry.tags = [...merged].sort();
  if (!entry.headers.includes(SPAWN_GROUP_HEADER)) {
    entry.headers = [...entry.headers, SPAWN_GROUP_HEADER].sort();
  }
}

async function findBehaviorDir(mesSourcePath: string): Promise<string | null> {
  const direct = path.join(mesSourcePath, 'Behavior');
  try {
    const stat = await fs.stat(direct);
    if (stat.isDirectory()) {
      return direct;
    }
  } catch {
    // Fall through to recursive search.
  }

  return findDirectoryRecursive(mesSourcePath, 'Behavior');
}

async function findDirectoryRecursive(
  root: string,
  dirName: string,
  predicate?: (fullPath: string) => boolean
): Promise<string | null> {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const fullPath = path.join(root, entry.name);
    if (entry.name === dirName && (!predicate || predicate(fullPath))) {
      return fullPath;
    }

    const found = await findDirectoryRecursive(fullPath, dirName, predicate);
    if (found) {
      return found;
    }
  }

  return null;
}

async function walkCsFiles(dir: string, onFile: (filePath: string) => Promise<void>): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkCsFiles(fullPath, onFile);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.cs')) {
      await onFile(fullPath);
    }
  }
}

/** Resolve headers for a profile .cs file (used by tests and tooling). */
export function resolveHeadersForSourceFile(
  sourceFile: string,
  managerHeaders: Map<string, string>,
  managerBindings: Map<string, string[]>,
  discoveredProfiles: Array<{ profileCs: string; header: string | null }>
): string[] {
  const map = buildHeaderBySourceFileMap(managerHeaders, managerBindings, discoveredProfiles);
  return map.get(sourceFile) ?? EXTRA_TAG_SOURCE_FILES[sourceFile] ?? [];
}
