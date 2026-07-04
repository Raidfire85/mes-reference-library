import { getProfileHeaders } from './profileHeaders';
import {
  formatExpectedProfileTypes,
  getExpectedHeadersForReferenceTag,
} from './referenceTags';
import {
  getDocumentedFilesForTag,
  getTagMetadata,
  TagRegistry,
} from './tagRegistry';
import {
  inferValueSpecFromTagName,
  notSetHint,
  TagValueSpec,
} from './tagMetadata';
import { IssueHintData, ValidationIssue } from './sbcValidator';

export interface FixHintOptions {
  registry?: TagRegistry | null;
}

const BEHAVIOR_WIRING_TAGS = new Set([
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
]);

const TRIGGER_INLINE_TAGS = new Set(['Actions', 'Conditions', 'MaxActions', 'ActionExecution']);

const SPAWN_GROUP_INLINE_HEADERS = new Set([
  '[Modular Encounters SpawnGroup]',
  '[MES Manipulation]',
]);

export function buildFixHint(issue: ValidationIssue, options: FixHintOptions = {}): string {
  const profile = formatProfileContext(issue);
  const prefix = profile ? `${profile}: ` : '';

  switch (issue.code) {
    case 'mes-invalid-value':
    case 'mes-not-set':
      return buildValueFixHint(issue, options, prefix);
    case 'mes-wrong-profile-tag':
      return buildWrongProfileFixHint(issue, prefix);
    case 'mes-missing-reference':
      return buildMissingReferenceFixHint(issue, prefix);
    case 'mes-missing-audio-reference':
      return buildMissingAudioReferenceFixHint(issue, prefix);
    case 'mes-missing-container-type-reference':
      return buildMissingContainerTypeReferenceFixHint(issue, prefix);
    case 'mes-missing-prefab-reference':
      return buildMissingPrefabReferenceFixHint(issue, prefix);
    case 'mes-wrong-reference-profile':
      return buildWrongReferenceProfileFixHint(issue, prefix);
    case 'mes-missing-required-tag':
      return buildMissingRequiredTagFixHint(issue, options, prefix);
    case 'mes-missing-header':
      return buildMissingHeaderFixHint(issue, prefix);
    case 'mes-unknown-header':
      return `${prefix}Use a recognized MES profile header on the line after <Description> (run wiki sync if this is a new Meridius profile type). Check spelling against the wiki profile list.`;
    case 'mes-unknown-tag':
      return `${prefix}Remove [${issue.tagName ?? 'this tag'}], fix the spelling, or search the wiki for the correct tag name. Run wiki sync if Meridius added new tags.`;
    case 'mes-unknown-tag-source':
      return `${prefix}[${issue.tagName ?? 'This tag'}] is in wiki docs but not in MES source parsers — verify spelling, run wiki sync, or remove if copied from outdated docs.`;
    case 'mes-known-invalid-tag':
      return `${prefix}Remove [${issue.tagName ?? 'this tag'}] — MES does not parse it. Check the wiki for the supported replacement.`;
    case 'mes-duplicate-subtype':
      return `${prefix}Rename or remove the duplicate MES profile SubtypeId "${issue.hintData?.duplicateSubtypeId ?? '…'}" in this file. Each MES profile Definition needs a unique SubtypeId (loot item SubtypeIds inside <Items> may repeat).`;
    case 'mes-duplicate-subtype-mod':
      return `${prefix}Rename one of the duplicate MES profile SubtypeIds "${issue.hintData?.duplicateSubtypeId ?? '…'}" so only one .sbc in the mod defines it.`;
    case 'mes-no-profiles':
      return 'This .sbc has no MES profiles. Add a <Description> block with a header like [RivalAI Target] or [Modular Encounters SpawnGroup]. Standard SE files (audio, blocks, containers) are listed separately as skipped — not as issues.';
    case 'mes-missing-definitions':
      return 'Wrap the file in a standard Space Engineers <Definitions> root element.';
    default:
      return `${prefix}Review the issue and open the linked wiki page for this profile type.`;
  }
}

function formatProfileContext(issue: ValidationIssue): string {
  if (issue.profileHeader && issue.subtypeId && issue.subtypeId !== '(unknown)') {
    return `${issue.profileHeader} profile "${issue.subtypeId}"`;
  }
  if (issue.profileHeader) {
    return issue.profileHeader;
  }
  if (issue.subtypeId && issue.subtypeId !== '(unknown)') {
    return `Profile "${issue.subtypeId}"`;
  }
  return '';
}

function buildValueFixHint(
  issue: ValidationIssue,
  options: FixHintOptions,
  prefix: string
): string {
  const tagName = issue.tagName ?? 'tag';
  const special = getSpecialValueFixHint(issue);
  if (special) {
    return `${prefix}${special}`;
  }

  const spec = resolveTagSpec(issue, options.registry);
  const allowed = spec ? notSetHint(spec) : 'see the wiki Allowed Values table';
  const valueNote =
    issue.code === 'mes-invalid-value' && issue.tagValue
      ? ` You entered "${issue.tagValue}".`
      : '';

  return `${prefix}[${tagName}] on this profile — ${allowed}.${valueNote} See the wiki page for format details.`;
}

function getSpecialValueFixHint(issue: ValidationIssue): string | undefined {
  if (issue.tagName === 'AutopilotProfile' && issue.profileHeader && /Action/i.test(issue.profileHeader)) {
    const subtype = issue.tagValue?.trim() || 'your-autopilot-SubtypeId';
    return (
      `[AutopilotProfile] on ${issue.profileHeader} selects which behavior autopilot slot to use (Primary, Secondary, or Tertiary), not an autopilot SubtypeId. ` +
      `On the NPC [RivalAI Behavior], wire profiles with [AutopilotData:${subtype}] (Primary), [SecondaryAutopilotData:SubtypeId], or [TertiaryAutopilotData:SubtypeId]. ` +
      `Keep [ChangeAutopilotProfile:true] and set [AutopilotProfile:Primary] (or Secondary/Tertiary) to match the slot. ` +
      `To load "${subtype}" directly, use [OverwriteAutopilotProfile:true] and [OverwriteAutopilotId:${subtype}] instead.`
    );
  }

  return undefined;
}

function buildWrongProfileFixHint(issue: ValidationIssue, prefix: string): string {
  const tagName = issue.tagName ?? extractTagFromMessage(issue.message);
  const hint = issue.hintData;
  const validHeaders = hint?.validProfileHeaders ?? [];
  const validTitles = hint?.validProfileTitles ?? [];

  if (tagName === 'UseBarrageFire') {
    return (
      `${prefix}[UseBarrageFire] is read from the [RivalAI Weapons] profile loaded via [WeaponSystem:SubtypeId] on the behavior — not from [RivalAI Behavior]. ` +
      'Add [UseBarrageFire:true/false] to that weapons profile .sbc.'
    );
  }

  if (tagName === 'UseRivalAi' || tagName === 'RivalAiReplaceRemoteControl') {
    return (
      `${prefix}[${tagName}] is parsed on [Modular Encounters SpawnGroup] (inline in spawn group Description) or on a [MES Manipulation] profile. ` +
      'Move it out of standalone spawn conditions into the spawn group .sbc or a manipulation profile referenced by [ManipulationProfiles:…].'
    );
  }

  let moveTarget = '';
  if (validHeaders.length > 0) {
    moveTarget = `Move [${tagName}] to a .sbc whose Description uses ${formatHeaderList(validHeaders)}`;
    if (validTitles.length > 0) {
      moveTarget += ` (${validTitles.join(', ')})`;
    }
    moveTarget += '.';
  } else {
    moveTarget = `Move [${tagName}] to the correct MES profile type for this tag.`;
  }

  const wiring = tagName ? getTagPlacementHint(tagName) : '';
  return `${prefix}${moveTarget}${wiring ? ` ${wiring}` : ''}`;
}

function buildMissingReferenceFixHint(issue: ValidationIssue, prefix: string): string {
  const tagName = issue.tagName ?? 'reference tag';
  const missing = issue.hintData?.missingSubtypeIds ?? extractQuotedList(issue.message);
  const expectedHeaders = issue.hintData?.expectedReferenceHeaders;
  const expectedLabel =
    issue.hintData?.expectedReferenceLabel ??
    (expectedHeaders ? formatExpectedProfileTypes(expectedHeaders) : 'matching');

  const ids = missing.length > 0 ? missing.join(', ') : 'the SubtypeId';
  const headerHint =
    expectedHeaders && expectedHeaders.length > 0
      ? ` Use header ${expectedHeaders[0]} in the new profile's <Description>.`
      : '';

  const wiring = getReferenceWiringHint(tagName, expectedHeaders);

  return (
    `${prefix}[${tagName}] references missing SubtypeId(s): ${ids}. ` +
    `Create a new .sbc under Data with that SubtypeId and a ${expectedLabel} profile.${headerHint}` +
    (wiring ? ` ${wiring}` : ' Save the file in the mod Data folder so cross-file validation can find it.')
  );
}

function buildMissingAudioReferenceFixHint(issue: ValidationIssue, prefix: string): string {
  const missing = issue.hintData?.missingSubtypeIds ?? extractQuotedList(issue.message);
  const ids = missing.length > 0 ? missing.join(', ') : 'the audio SubtypeId';
  return (
    `${prefix}[${issue.tagName ?? 'ChatAudio'}] references audio SubtypeId(s): ${ids}. ` +
    'Define them in a mod audio .sbc under <Sounds> (MyObjectBuilder_AudioDefinition). ' +
    'SubtypeIds can be reused across multiple Chat profiles.'
  );
}

function buildMissingContainerTypeReferenceFixHint(issue: ValidationIssue, prefix: string): string {
  const missing = issue.hintData?.missingSubtypeIds ?? extractQuotedList(issue.message);
  const ids = missing.length > 0 ? missing.join(', ') : 'the container type SubtypeId';
  return (
    `${prefix}[${issue.tagName ?? 'ContainerTypes'}] references container type SubtypeId(s): ${ids}. ` +
    'Define them in a ContainerTypes .sbc (ContainerTypeDefinition). ' +
    'Container subtypes can be reused across loot profiles, bot spawn, and NPC actions.'
  );
}

function buildMissingPrefabReferenceFixHint(issue: ValidationIssue, prefix: string): string {
  const missing = issue.hintData?.missingSubtypeIds ?? extractQuotedList(issue.message);
  const ids = missing.length > 0 ? missing.join(', ') : 'the prefab SubtypeId';
  return (
    `${prefix}Prefab SubtypeId(s): ${ids}. ` +
    'Define the grid prefab in a Prefabs .sbc (MyObjectBuilder_PrefabDefinition). ' +
    'SpawnGroups reference prefabs via <Prefab SubtypeId="..."> in the SpawnGroup XML. ' +
    'Prefab SubtypeIds can be reused across multiple spawn groups.'
  );
}

function buildWrongReferenceProfileFixHint(issue: ValidationIssue, prefix: string): string {
  const hint = issue.hintData;
  const tagName = issue.tagName ?? extractTagFromMessage(issue.message);
  const ref = hint?.referencedSubtypeId ?? extractQuotedAfter(issue.message, 'references "');
  const actual = hint?.referencedActualHeader ?? '(missing header)';
  const expected =
    hint?.expectedReferenceLabel ??
    (hint?.expectedReferenceHeaders
      ? formatExpectedProfileTypes(hint.expectedReferenceHeaders)
      : 'correct profile type');
  const source = hint?.referencedSourceLabel ? ` (${hint.referencedSourceLabel})` : '';

  return (
    `${prefix}[${tagName}] points to "${ref}"${source}, which is a ${actual} profile. ` +
    `Change the referenced .sbc to use a ${expected} header, or point [${tagName}] at a different SubtypeId that already has the right profile type.`
  );
}

function buildMissingRequiredTagFixHint(
  issue: ValidationIssue,
  options: FixHintOptions,
  prefix: string
): string {
  const required = issue.hintData?.requiredTagName ?? issue.tagName ?? 'required tag';
  const spec = resolveTagSpec(
    { ...issue, tagName: required, wikiFile: issue.wikiFile ?? getProfileHeaders()[issue.profileHeader ?? ''] },
    options.registry
  );
  const allowed = spec ? notSetHint(spec) : 'see the wiki';

  if (required === 'Type' && issue.profileHeader && /Trigger/i.test(issue.profileHeader)) {
    return (
      `${prefix}Add [Type:TriggerType] on the same line as [RivalAI Trigger] or the line below (e.g. [Type:AcquiredTarget], [Type:Damage], [Type:Timer]). ` +
      `Allowed trigger types: ${spec?.enumValues?.join(', ') ?? 'see Trigger wiki'}.`
    );
  }

  if (required === 'BehaviorName' && issue.profileHeader && /Behavior/i.test(issue.profileHeader)) {
    return (
      `${prefix}Add [BehaviorName:Fighter] (or CoreBehavior, Patrol, Hunter, etc.) on a line after [RivalAI Behavior]. ` +
      'This tells MES which core behavior class to instantiate.'
    );
  }

  return `${prefix}Add [${required}:value] after the profile header in <Description>. Allowed: ${allowed}.`;
}

function buildMissingHeaderFixHint(issue: ValidationIssue, prefix: string): string {
  const id = issue.subtypeId ?? 'this profile';
  return (
    `${prefix}Profile "${id}" needs a MES header as the first content line in <Description> ` +
    '(e.g. [RivalAI Behavior], [RivalAI Target], [RivalAI Trigger], [Modular Encounters SpawnGroup], [MES Spawn Conditions]).'
  );
}

function getTagPlacementHint(tagName: string): string {
  if (BEHAVIOR_WIRING_TAGS.has(tagName)) {
    return getReferenceWiringHint(tagName, getExpectedHeadersForReferenceTag(tagName) ?? undefined);
  }

  if (TRIGGER_INLINE_TAGS.has(tagName)) {
    if (tagName === 'MaxActions' || tagName === 'ActionExecution') {
      return 'These belong on [RivalAI Trigger], not [RivalAI Action].';
    }
    return 'Use on [RivalAI Trigger] as [Actions:SubtypeId] / [Conditions:SubtypeId] referencing action and condition profiles.';
  }

  const expected = getExpectedHeadersForReferenceTag(tagName);
  if (expected?.some((header) => SPAWN_GROUP_INLINE_HEADERS.has(header))) {
    return 'May also be placed inline on [Modular Encounters SpawnGroup] Description (MES parses spawn conditions and manipulation from the same block).';
  }

  return '';
}

function getReferenceWiringHint(
  tagName: string,
  expectedHeaders?: string[] | null
): string {
  const label = expectedHeaders ? formatExpectedProfileTypes(expectedHeaders) : 'profile';

  if (BEHAVIOR_WIRING_TAGS.has(tagName)) {
    return `Wire on the NPC [RivalAI Behavior] block as [${tagName}:SubtypeId] referencing a ${label} .sbc.`;
  }

  if (tagName === 'Actions' || tagName === 'Conditions') {
    return `On [RivalAI Trigger], use [${tagName}:SubtypeId1,SubtypeId2] listing ${label} SubtypeIds.`;
  }

  if (tagName === 'ChatData') {
    return 'Reference a [RivalAI Chat] SubtypeId; often used on [RivalAI Action] with [UseChatBroadcast:true].';
  }

  if (expectedHeaders?.includes('[Modular Encounters SpawnGroup]')) {
    return `Define a ${label} profile .sbc or place tags inline on the spawn group Description.`;
  }

  if (expectedHeaders && expectedHeaders.length > 0) {
    return `Create a separate .sbc with ${expectedHeaders[0]} and the SubtypeId you reference here.`;
  }

  return '';
}

function resolveTagSpec(
  issue: ValidationIssue,
  registry?: TagRegistry | null
): TagValueSpec | undefined {
  if (!issue.tagName) {
    return undefined;
  }

  if (registry) {
    if (issue.wikiFile) {
      const primary = getTagMetadata(registry, issue.tagName, issue.wikiFile);
      if (primary) {
        return primary.valueSpec;
      }
    }

    for (const wikiFile of getDocumentedFilesForTag(registry, issue.tagName)) {
      const meta = getTagMetadata(registry, issue.tagName, wikiFile);
      if (meta) {
        return meta.valueSpec;
      }
    }
  }

  return inferValueSpecFromTagName(issue.tagName) ?? undefined;
}

function formatHeaderList(headers: string[]): string {
  if (headers.length === 1) {
    return headers[0];
  }
  if (headers.length === 2) {
    return `${headers[0]} or ${headers[1]}`;
  }
  return `${headers.slice(0, -1).join(', ')}, or ${headers[headers.length - 1]}`;
}

function extractTagFromMessage(message: string): string | undefined {
  const match = message.match(/\[([A-Za-z0-9_]+)\]/);
  return match?.[1];
}

function extractQuotedList(message: string): string[] {
  const tail = message.split(':').pop() ?? '';
  return tail
    .replace(/\.$/, '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractQuotedAfter(message: string, needle: string): string | undefined {
  const index = message.indexOf(needle);
  if (index < 0) {
    return undefined;
  }
  const rest = message.slice(index + needle.length);
  const match = rest.match(/^([^"]+)/);
  return match?.[1];
}

/** Build structured hint metadata at validation time. */
export function buildHintData(fields: IssueHintData): IssueHintData {
  return fields;
}
