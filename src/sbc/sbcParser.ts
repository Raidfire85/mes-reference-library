import { getProfileHeaders, normalizeHeader } from './profileHeaders';
import { columnAt, lineNumberAt } from './textEdits';

export interface MesTagUsage {
  tagName: string;
  raw: string;
  value: string;
  line: number;
  column: number;
}

export interface MesProfile {
  subtypeId: string;
  subtypeLine: number;
  header: string | null;
  headerLine: number;
  tags: MesTagUsage[];
}

export interface ParsedSbc {
  profiles: MesProfile[];
  /** MES profile definition SubtypeIds only (not item/component references inside loot tables, etc.). */
  subtypeIds: Map<string, number[]>;
}

const TAG_LINE_PATTERN = /\[([A-Za-z0-9_]+):([^\]]*)\]/g;
const DESCRIPTION_PATTERN = /<Description\b[^>]*>([\s\S]*?)<\/Description>/gi;

/** MES profile containers: each wraps <Id>…<SubtypeId> and <Description>. */
const PROFILE_ENTITY_TAGS = ['EntityComponent', 'SpawnGroup'] as const;

export function parseSbcDocument(text: string): ParsedSbc {
  const profiles: MesProfile[] = [];

  let descMatch: RegExpExecArray | null;
  while ((descMatch = DESCRIPTION_PATTERN.exec(text)) !== null) {
    const blockStart = descMatch.index;
    const blockContent = descMatch[1];
    const blockStartLine = lineNumberAt(text, blockStart);

    const subtypeId = findOwningSubtypeId(text, blockStart);
    const profile = parseDescriptionBlock(blockContent, blockStartLine, subtypeId);
    profiles.push(profile);
  }

  DESCRIPTION_PATTERN.lastIndex = 0;

  return { profiles, subtypeIds: buildProfileDefinitionSubtypeIds(profiles) };
}

export function extractSubtypeIds(text: string): Set<string> {
  return new Set(parseSbcDocument(text).subtypeIds.keys());
}

/** SubtypeIds owned by MES <Description> profile blocks — not nested item references. */
function buildProfileDefinitionSubtypeIds(profiles: MesProfile[]): Map<string, number[]> {
  const subtypeIds = new Map<string, number[]>();

  for (const profile of profiles) {
    if (!profile.subtypeId || profile.subtypeId === '(unknown)') {
      continue;
    }

    if (!subtypeIds.has(profile.subtypeId)) {
      subtypeIds.set(profile.subtypeId, []);
    }
    subtypeIds.get(profile.subtypeId)!.push(profile.subtypeLine);
  }

  return subtypeIds;
}

function parseDescriptionBlock(
  content: string,
  startLine: number,
  subtypeId: { id: string; line: number }
): MesProfile {
  const sanitized = stripDescriptionComments(content);
  const lines = sanitized.split(/\r?\n/);
  let header: string | null = null;
  let headerLine = startLine;
  const tags: MesTagUsage[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineText = stripLineComment(lines[i]);
    const lineNumber = startLine + i;

    if (!header) {
      const maybeHeader = normalizeHeader(lineText);
      if (maybeHeader && getProfileHeaders()[maybeHeader]) {
        header = maybeHeader;
        headerLine = lineNumber;
      }
    }

    let tagMatch: RegExpExecArray | null;
    TAG_LINE_PATTERN.lastIndex = 0;
    while ((tagMatch = TAG_LINE_PATTERN.exec(lineText)) !== null) {
      tags.push({
        tagName: tagMatch[1],
        raw: tagMatch[0],
        value: tagMatch[2].trim(),
        line: lineNumber,
        column: tagMatch.index,
      });
    }
  }

  return {
    subtypeId: subtypeId.id,
    subtypeLine: subtypeId.line,
    header,
    headerLine,
    tags,
  };
}

function stripDescriptionComments(content: string): string {
  return content.replace(/<!--[\s\S]*?-->/g, '');
}

function stripLineComment(line: string): string {
  const slash = line.indexOf('//');
  if (slash < 0) {
    return line;
  }

  return line.slice(0, slash);
}

/**
 * Resolves the profile SubtypeId from the enclosing entity's <Id> block,
 * not arbitrary SubtypeIds elsewhere in the file (loot tables, prefabs, etc.).
 */
function findOwningSubtypeId(text: string, descriptionStart: number): { id: string; line: number } {
  const before = text.slice(0, descriptionStart);

  for (const entityTag of PROFILE_ENTITY_TAGS) {
    const entityStart = findEnclosingEntityStart(before, entityTag);
    if (entityStart === null) {
      continue;
    }

    const segment = text.slice(entityStart, descriptionStart);
    const idBlock = segment.match(/<Id\b[^>]*>[\s\S]*?<\/Id>/i);
    if (!idBlock) {
      continue;
    }

    const subtypeMatch = idBlock[0].match(/<SubtypeId>([^<]+)<\/SubtypeId>/i);
    if (!subtypeMatch) {
      continue;
    }

    const subtypeIndexInSegment =
      (idBlock.index ?? 0) + (subtypeMatch.index ?? 0) + subtypeMatch[0].indexOf(subtypeMatch[1]);
    const absoluteIndex = entityStart + subtypeIndexInSegment;

    return {
      id: subtypeMatch[1].trim(),
      line: lineNumberAt(text, absoluteIndex),
    };
  }

  return { id: '(unknown)', line: 0 };
}

/** Index of the open tag for the entity that directly wraps this <Description>. */
function findEnclosingEntityStart(before: string, entityTag: string): number | null {
  const closeTag = new RegExp(`</${entityTag}>`, 'gi');
  const openTag = new RegExp(`<${entityTag}\\b`, 'gi');

  const closeCount = (before.match(closeTag) || []).length;
  let openIndex = 0;
  let match: RegExpExecArray | null;

  openTag.lastIndex = 0;
  while ((match = openTag.exec(before)) !== null) {
    if (openIndex === closeCount) {
      return match.index;
    }
    openIndex++;
  }

  return null;
}

export function findMesTagAtPosition(
  text: string,
  line: number,
  character: number
): { profile: MesProfile; tag: MesTagUsage } | null {
  const parsed = parseSbcDocument(text);

  for (const profile of parsed.profiles) {
    for (const tag of profile.tags) {
      if (tag.line !== line) {
        continue;
      }

      const endColumn = tag.column + tag.raw.length;
      if (character >= tag.column && character <= endColumn) {
        return { profile, tag };
      }
    }
  }

  return null;
}

export { columnAt, lineNumberAt };
