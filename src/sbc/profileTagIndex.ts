import * as fs from 'fs/promises';
import * as path from 'path';
import { Uri } from 'vscode';
import type { ProfileTagIndex, ProfileTagIndexTagProfile } from '../wikiSync/profileTagIndexBuilder';

export type { ProfileTagIndex, ProfileTagIndexTagProfile };

const INDEX_FILE = 'profile-tag-index.json';

export async function loadProfileTagIndex(extensionUri: Uri): Promise<ProfileTagIndex | null> {
  const filePath = path.join(extensionUri.fsPath, 'wiki', INDEX_FILE);

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, '')) as ProfileTagIndex;
    if (!parsed?.headerToTags || !parsed?.tagToProfiles) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function isTagValidForHeader(
  index: ProfileTagIndex,
  tagName: string,
  header: string
): boolean {
  return index.headerToTags[header]?.includes(tagName) ?? false;
}

export function getHeadersForTag(index: ProfileTagIndex, tagName: string): string[] {
  return index.tagToHeaders[tagName] ?? [];
}

export function getOtherProfilesForTag(
  index: ProfileTagIndex,
  tagName: string,
  currentHeader: string
): ProfileTagIndexTagProfile[] {
  return (index.tagToProfiles[tagName] ?? []).filter((entry) => entry.header !== currentHeader);
}

/** Other profile types for cross-profile hints (one entry per title, aliases merged). */
export function getDistinctOtherProfilesForTag(
  index: ProfileTagIndex,
  tagName: string,
  currentHeader: string
): ProfileTagIndexTagProfile[] {
  const seenTitles = new Set<string>();
  const results: ProfileTagIndexTagProfile[] = [];

  for (const entry of getOtherProfilesForTag(index, tagName, currentHeader)) {
    if (seenTitles.has(entry.title)) {
      continue;
    }
    seenTitles.add(entry.title);
    results.push(entry);
  }

  return results.sort((a, b) => a.title.localeCompare(b.title));
}

export function shouldShowCrossProfileHint(
  index: ProfileTagIndex,
  tagName: string,
  currentHeader: string
): boolean {
  return getDistinctOtherProfilesForTag(index, tagName, currentHeader).length > 0;
}

export function isCrossProfileTag(index: ProfileTagIndex, tagName: string): boolean {
  return (index.tagToProfiles[tagName]?.length ?? 0) > 1;
}

export function formatProfileTitleList(titles: string[]): string {
  const unique = [...new Set(titles)].sort();
  if (unique.length === 0) {
    return '';
  }
  if (unique.length === 1) {
    return unique[0];
  }
  if (unique.length === 2) {
    return `${unique[0]} and ${unique[1]}`;
  }
  return `${unique.slice(0, -1).join(', ')}, and ${unique[unique.length - 1]}`;
}

export function formatCrossProfileHint(
  tagName: string,
  otherProfiles: ProfileTagIndexTagProfile[]
): string {
  const titles = otherProfiles.map((entry) => entry.title);
  return `[${tagName}] is a cross-profile tag — also valid in: ${formatProfileTitleList(titles)}.`;
}

export function formatWrongProfileHint(
  tagName: string,
  profileHeader: string,
  validProfiles: ProfileTagIndexTagProfile[]
): string {
  const titles = validProfiles.map((entry) => entry.title);
  return `[${tagName}] is not parsed for ${profileHeader} in MES source. Valid in: ${formatProfileTitleList(titles)}.`;
}

export function formatCrossProfileHintForCurrentProfile(
  tagName: string,
  otherProfiles: ProfileTagIndexTagProfile[]
): string {
  if (otherProfiles.length === 0) {
    return `[${tagName}] is used by more than one MES profile type.`;
  }
  return formatCrossProfileHint(tagName, otherProfiles);
}

export function formatCrossProfileHoverMarkdown(
  tagName: string,
  otherProfiles: ProfileTagIndexTagProfile[]
): string {
  if (otherProfiles.length === 0) {
    return '';
  }
  return `**Cross-profile tag** — also valid in: ${formatProfileTitleList(otherProfiles.map((entry) => entry.title))}`;
}
