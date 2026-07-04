import * as path from 'path';
import { normalizeHeaderForReferenceMatch } from './referenceTags';
import { buildModReferenceGraph } from './modReferenceGraph';
import { parseSbcDocument } from './sbcParser';
import { ValidationIssue } from './sbcValidator';
import { buildRemoveTagEditsFromText, formatTagLine } from './tagTextEdits';
import { positionAt } from './textEdits';
import { PlainTextEdit } from './textEdits';

export interface TagMoveTarget {
  subtypeId: string;
  header: string | null;
  sourceLabel: string;
  linkDirection: 'incoming' | 'outgoing';
  linkTagName: string;
}

export function findTagMoveTarget(
  issue: ValidationIssue,
  modSources?: Map<string, string>
): TagMoveTarget | null {
  if (!modSources?.size || issue.code !== 'mes-wrong-profile-tag') {
    return null;
  }

  if (!issue.subtypeId || !issue.tagName || !issue.hintData?.validProfileHeaders?.length) {
    return null;
  }

  const graph = buildModReferenceGraph(modSources);
  const validHeaders = new Set(
    issue.hintData.validProfileHeaders.map((header) => normalizeHeaderForReferenceMatch(header))
  );

  const candidates: TagMoveTarget[] = [];

  for (const edge of graph.incomingBySubtypeId.get(issue.subtypeId) ?? []) {
    const from = graph.profileBySubtypeId.get(edge.fromSubtypeId);
    if (!from?.header || !headerMatchesValid(from.header, validHeaders)) {
      continue;
    }

    candidates.push({
      subtypeId: from.subtypeId,
      header: from.header,
      sourceLabel: from.sourceLabel,
      linkDirection: 'incoming',
      linkTagName: edge.tagName,
    });
  }

  for (const edge of graph.outgoingBySubtypeId.get(issue.subtypeId) ?? []) {
    const to = graph.profileBySubtypeId.get(edge.toSubtypeId);
    if (!to?.header || !headerMatchesValid(to.header, validHeaders)) {
      continue;
    }

    candidates.push({
      subtypeId: to.subtypeId,
      header: to.header,
      sourceLabel: to.sourceLabel,
      linkDirection: 'outgoing',
      linkTagName: edge.tagName,
    });
  }

  const unique = dedupeCandidates(candidates);
  if (unique.length !== 1) {
    return null;
  }

  const target = unique[0];
  if (profileHasTag(modSources, target.sourceLabel, target.subtypeId, issue.tagName)) {
    return null;
  }

  return target;
}

export function buildMoveTagEdits(
  issue: ValidationIssue,
  sourceFilePath: string,
  sourceText: string,
  modSources?: Map<string, string>,
  dataRoot?: string | null
): Map<string, PlainTextEdit[]> | null {
  const target = findTagMoveTarget(issue, modSources);
  if (!target || !issue.tagName) {
    return null;
  }

  const removeEdits = buildRemoveTagEditsFromText(sourceText, issue);
  if (!removeEdits) {
    return null;
  }

  const targetFilePath = resolveSourceFilePath(dataRoot ?? null, sourceFilePath, target.sourceLabel);
  const targetText = modSources?.get(target.sourceLabel);
  if (!targetText) {
    return null;
  }

  const insertEdit = buildInsertTagEdit(targetText, target.subtypeId, issue.tagName, issue.tagValue ?? '');
  if (!insertEdit) {
    return null;
  }

  return new Map([
    [sourceFilePath, removeEdits],
    [targetFilePath, [insertEdit]],
  ]);
}

function headerMatchesValid(header: string, validHeaders: Set<string>): boolean {
  return validHeaders.has(normalizeHeaderForReferenceMatch(header));
}

function dedupeCandidates(candidates: TagMoveTarget[]): TagMoveTarget[] {
  const seen = new Set<string>();
  const unique: TagMoveTarget[] = [];

  for (const candidate of candidates) {
    if (seen.has(candidate.subtypeId)) {
      continue;
    }
    seen.add(candidate.subtypeId);
    unique.push(candidate);
  }

  return unique;
}

function profileHasTag(
  sources: Map<string, string>,
  sourceLabel: string,
  subtypeId: string,
  tagName: string
): boolean {
  const text = sources.get(sourceLabel);
  if (!text) {
    return false;
  }

  const profile = parseSbcDocument(text).profiles.find((entry) => entry.subtypeId === subtypeId);
  return profile?.tags.some((tag) => tag.tagName === tagName) ?? false;
}

function resolveSourceFilePath(
  dataRoot: string | null,
  sourceFilePath: string,
  sourceLabel: string
): string {
  if (dataRoot) {
    return path.join(dataRoot, sourceLabel);
  }

  return path.join(path.dirname(sourceFilePath), sourceLabel);
}

function buildInsertTagEdit(
  text: string,
  subtypeId: string,
  tagName: string,
  tagValue: string
): PlainTextEdit | null {
  const profile = parseSbcDocument(text).profiles.find((entry) => entry.subtypeId === subtypeId);
  if (!profile) {
    return null;
  }

  const lines = text.split(/\r?\n/);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const tagLine = formatTagLine(tagName, tagValue);

  if (profile.tags.length > 0) {
    const lastTag = profile.tags[profile.tags.length - 1];
    const lineText = lines[lastTag.line] ?? '';
    const indent = lineText.match(/^\s*/)?.[0] ?? '\t\t';
    const lineEnd = positionAt(text, lastTag.line, lineText.length);
    return {
      range: { start: lineEnd, end: lineEnd },
      newText: `${eol}${indent}${tagLine}`,
    };
  }

  const headerLine = profile.headerLine;
  const lineText = lines[headerLine] ?? '';
  const indent = lineText.match(/^\s*/)?.[0] ?? '\t\t';
  const lineEnd = positionAt(text, headerLine, lineText.length);
  return {
    range: { start: lineEnd, end: lineEnd },
    newText: `${eol}${indent}${tagLine}`,
  };
}
