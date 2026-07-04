import { getExpectedHeadersForReferenceTag } from './referenceTags';
import { TagRegistry } from './tagRegistry';
import { ValidationIssue } from './sbcValidator';
import { buildMoveTagEdits, findTagMoveTarget } from './tagMoveResolver';
import { buildRemoveTagEditsFromText } from './tagTextEdits';
import { positionAt } from './textEdits';
import { ApplicableFix, FixContext } from './issueFixTypes';
import { PlainTextEdit } from './textEdits';

const NEVER_AUTO_FIX_CODES = new Set([
  'mes-missing-reference',
  'mes-wrong-reference-profile',
  'mes-missing-audio-reference',
  'mes-missing-container-type-reference',
  'mes-missing-prefab-reference',
  'mes-duplicate-subtype',
  'mes-duplicate-subtype-mod',
  'mes-unknown-tag',
  'mes-not-set',
  'mes-invalid-value',
  'mes-missing-required-tag',
  'mes-missing-header',
  'mes-unknown-header',
  'mes-no-profiles',
  'mes-missing-definitions',
]);

const WIRING_TAGS = new Set([
  'TargetData',
  'OverrideTargetData',
  'AutopilotData',
  'SecondaryAutopilotData',
  'TertiaryAutopilotData',
  'TriggerGroups',
  'Triggers',
  'WeaponSystem',
  'WeaponsSystem',
  'WeaponsSystemProfile',
  'ChatData',
  'Spawner',
  'BehaviorName',
  'AutopilotProfile',
  'ChangeAutopilotProfile',
  'OverwriteAutopilotProfile',
  'OverwriteAutopilotId',
]);

const AUTOPILOT_SLOT_VALUES = new Set(['Primary', 'Secondary', 'Tertiary']);

export function getApplicableFixes(
  issue: ValidationIssue,
  registry?: TagRegistry | null,
  context: FixContext = {}
): ApplicableFix[] {
  const fixContext: FixContext = { ...context, registry: registry ?? context.registry };

  if (NEVER_AUTO_FIX_CODES.has(issue.code)) {
    if (issue.code === 'mes-invalid-value' && canAutopilotOverwriteFix(issue)) {
      return [autopilotOverwriteFix()];
    }
    return [];
  }

  const fixes: ApplicableFix[] = [];

  if (canAutopilotOverwriteFix(issue)) {
    fixes.push(autopilotOverwriteFix());
  }

  const moveTarget = findTagMoveTarget(issue, fixContext.modSources);
  if (moveTarget) {
    const profileLabel = formatProfileLabel(moveTarget.header, issue.hintData?.validProfileTitles);
    fixes.push({
      id: 'move-tag-to-linked-profile',
      title: `Move [${issue.tagName}] to ${profileLabel} · ${moveTarget.subtypeId}`,
      confidence: 'high',
      isPreferred: true,
      description:
        moveTarget.linkDirection === 'incoming'
          ? `Linked profile references this one via [${moveTarget.linkTagName}]. Removes here and adds on the connected profile.`
          : `This profile references ${moveTarget.subtypeId} via [${moveTarget.linkTagName}]. Removes here and adds on that profile.`,
    });
  }

  if (canSafelyRemoveUnparsedTag(issue)) {
    fixes.push({
      id: 'remove-unparsed-tag',
      title: moveTarget ? 'Remove tag only (do not move)' : 'Remove tag (not parsed on this profile)',
      confidence: 'high',
      description: moveTarget
        ? 'Deletes this line without adding it elsewhere.'
        : 'Deletes this line only. MES ignores it here anyway — add it on the correct profile type manually if you still need it.',
    });
  }

  return fixes;
}

export function buildFixEditsByFile(
  issue: ValidationIssue,
  fixId: string,
  sourceFilePath: string,
  sourceText: string,
  context: FixContext = {}
): Map<string, PlainTextEdit[]> | null {
  switch (fixId) {
    case 'autopilot-overwrite': {
      const edits = buildAutopilotOverwriteEditsFromText(sourceText, issue);
      return edits ? new Map([[sourceFilePath, edits]]) : null;
    }
    case 'remove-unparsed-tag': {
      const edits = buildRemoveTagEditsFromText(sourceText, issue);
      return edits ? new Map([[sourceFilePath, edits]]) : null;
    }
    case 'move-tag-to-linked-profile':
      return buildMoveTagEdits(
        issue,
        sourceFilePath,
        sourceText,
        context.modSources,
        context.dataRoot
      );
    default:
      return null;
  }
}

function autopilotOverwriteFix(): ApplicableFix {
  return {
    id: 'autopilot-overwrite',
    title: 'Use OverwriteAutopilotProfile + OverwriteAutopilotId',
    confidence: 'high',
    isPreferred: true,
    description:
      'Replaces ChangeAutopilotProfile with direct autopilot load. Keeps your SubtypeId; only changes the tag pair MES expects on action profiles.',
  };
}

function canAutopilotOverwriteFix(issue: ValidationIssue): boolean {
  const subtypeId = issue.tagValue?.trim();
  if (!subtypeId || AUTOPILOT_SLOT_VALUES.has(subtypeId)) {
    return false;
  }

  return (
    issue.code === 'mes-invalid-value' &&
    issue.tagName === 'AutopilotProfile' &&
    !!issue.profileHeader &&
    /Action/i.test(issue.profileHeader)
  );
}

function canSafelyRemoveUnparsedTag(issue: ValidationIssue): boolean {
  if (issue.code === 'mes-known-invalid-tag' || issue.code === 'mes-unknown-tag-source') {
    return !!issue.tagName && !isReferenceOrWiringTag(issue.tagName);
  }

  if (issue.code !== 'mes-wrong-profile-tag' || !issue.tagName) {
    return false;
  }

  return !isReferenceOrWiringTag(issue.tagName);
}

function isReferenceOrWiringTag(tagName: string): boolean {
  if (WIRING_TAGS.has(tagName)) {
    return true;
  }
  return getExpectedHeadersForReferenceTag(tagName) !== null;
}

function formatProfileLabel(header: string | null, titles?: string[]): string {
  if (titles?.length === 1) {
    return titles[0];
  }
  return header ?? 'linked profile';
}

function buildAutopilotOverwriteEditsFromText(
  text: string,
  issue: ValidationIssue
): PlainTextEdit[] | null {
  const autopilotId = issue.tagValue?.trim();
  if (!autopilotId || AUTOPILOT_SLOT_VALUES.has(autopilotId)) {
    return null;
  }

  const lines = text.split(/\r?\n/);
  const line = issue.line;
  if (line <= 0 || line >= lines.length) {
    return null;
  }

  const prevLine = lines[line - 1].trim();
  const tagLine = lines[line];
  if (prevLine !== '[ChangeAutopilotProfile:true]' || !tagLine.includes('[AutopilotProfile:')) {
    return null;
  }

  const indent = tagLine.match(/^\s*/)?.[0] ?? '\t\t';
  const prevStart = positionAt(text, line - 1, 0);
  const prevEnd = positionAt(text, line - 1, lines[line - 1].length);
  const tagStart = positionAt(text, line, 0);
  const tagEnd = positionAt(text, line, tagLine.length);

  return [
    {
      range: { start: prevStart, end: prevEnd },
      newText: `${indent}[OverwriteAutopilotProfile:true]`,
    },
    {
      range: { start: tagStart, end: tagEnd },
      newText: `${indent}[OverwriteAutopilotId:${autopilotId}]`,
    },
  ];
}
