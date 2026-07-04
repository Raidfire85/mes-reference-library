import { getExpectedHeadersForReferenceTag } from './referenceTags';
import { isLikelyReferenceTag } from './profileHeaders';
import { parseSbcDocument } from './sbcParser';

export interface ProfileRef {
  subtypeId: string;
  header: string | null;
  sourceLabel: string;
}

export interface ReferenceEdge {
  fromSubtypeId: string;
  toSubtypeId: string;
  tagName: string;
  sourceLabel: string;
}

export interface ModReferenceGraph {
  profileBySubtypeId: Map<string, ProfileRef>;
  incomingBySubtypeId: Map<string, ReferenceEdge[]>;
  outgoingBySubtypeId: Map<string, ReferenceEdge[]>;
}

export function buildModReferenceGraph(sources: Map<string, string>): ModReferenceGraph {
  const profileBySubtypeId = new Map<string, ProfileRef>();
  const edges: ReferenceEdge[] = [];

  for (const [sourceLabel, text] of sources) {
    const parsed = parseSbcDocument(text);
    for (const profile of parsed.profiles) {
      if (!profile.subtypeId || profile.subtypeId === '(unknown)') {
        continue;
      }

      if (!profileBySubtypeId.has(profile.subtypeId)) {
        profileBySubtypeId.set(profile.subtypeId, {
          subtypeId: profile.subtypeId,
          header: profile.header,
          sourceLabel,
        });
      }

      for (const tag of profile.tags) {
        if (!isReferenceTag(tag.tagName) || isUnsetTagValue(tag.value)) {
          continue;
        }

        for (const ref of splitReferenceValues(tag.value)) {
          if (!valueLooksLikeSubtypeReference(ref)) {
            continue;
          }

          edges.push({
            fromSubtypeId: profile.subtypeId,
            toSubtypeId: ref,
            tagName: tag.tagName,
            sourceLabel,
          });
        }
      }
    }
  }

  const incomingBySubtypeId = new Map<string, ReferenceEdge[]>();
  const outgoingBySubtypeId = new Map<string, ReferenceEdge[]>();

  for (const edge of edges) {
    if (!incomingBySubtypeId.has(edge.toSubtypeId)) {
      incomingBySubtypeId.set(edge.toSubtypeId, []);
    }
    incomingBySubtypeId.get(edge.toSubtypeId)!.push(edge);

    if (!outgoingBySubtypeId.has(edge.fromSubtypeId)) {
      outgoingBySubtypeId.set(edge.fromSubtypeId, []);
    }
    outgoingBySubtypeId.get(edge.fromSubtypeId)!.push(edge);
  }

  return { profileBySubtypeId, incomingBySubtypeId, outgoingBySubtypeId };
}

function isReferenceTag(tagName: string): boolean {
  return getExpectedHeadersForReferenceTag(tagName) !== null || isLikelyReferenceTag(tagName);
}

function isUnsetTagValue(value: string): boolean {
  return value.trim().length === 0;
}

function splitReferenceValues(value: string): string[] {
  return value
    .split(/[,;|]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function valueLooksLikeSubtypeReference(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  const lower = trimmed.toLowerCase();
  if (lower === 'true' || lower === 'false') {
    return false;
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return false;
  }

  if (lower === 'primary' || lower === 'secondary' || lower === 'tertiary') {
    return false;
  }

  return true;
}
