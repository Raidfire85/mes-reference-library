import {
  getProfileHeaders,
  isLikelyReferenceTag,
  KNOWN_INVALID_TAGS,
  REQUIRED_PROFILE_TAGS,
} from './profileHeaders';
import { classifySbcFile, shouldValidateAsMesProfiles } from './sbcFileClassification';
import { MesProfile, parseSbcDocument, ParsedSbc } from './sbcParser';
import {
  applyValueSpecOverrides,
  formatInvalidValueMessage,
  formatNotSetMessage,
  inferValueSpecFromTagName,
  isUnsetTagValue,
  TagValueSpec,
  validateTagValueAgainstSpec,
} from './tagMetadata';
import { ModScopeContext } from './modProfileIndex';
import {
  AUDIO_REFERENCE_TAGS,
  CONTAINER_TYPE_REFERENCE_TAGS,
  extractSpawnGroupPrefabReferences,
  isNoChatAudioValue,
  PREFAB_REFERENCE_TAGS,
} from './modAssetIndex';
import {
  formatWrongProfileHint,
  isTagValidForHeader,
  ProfileTagIndex,
} from './profileTagIndex';
import {
  formatExpectedProfileTypes,
  getExpectedHeadersForReferenceTag,
  headerMatchesReferenceExpectation,
} from './referenceTags';
import {
  formatWikiPageList,
  getDocumentedFilesForTag,
  getTagMetadata,
  isTagDocumented,
  TagRegistry,
} from './tagRegistry';

export interface IssueHintData {
  validProfileHeaders?: string[];
  validProfileTitles?: string[];
  expectedReferenceHeaders?: string[];
  expectedReferenceLabel?: string;
  missingSubtypeIds?: string[];
  referencedSubtypeId?: string;
  referencedSourceLabel?: string;
  referencedActualHeader?: string | null;
  requiredTagName?: string;
  duplicateSubtypeId?: string;
}

export interface ValidationIssue {
  line: number;
  column: number;
  endColumn: number;
  severity: 'error' | 'warning' | 'information';
  message: string;
  code: string;
  wikiFile?: string;
  /** MES profile header for the Description block (e.g. [RivalAI Action]). */
  profileHeader?: string | null;
  /** Owning MES profile SubtypeId for this Description block. */
  subtypeId?: string;
  tagName?: string;
  tagValue?: string;
  hintData?: IssueHintData;
}

export interface ValidateSbcOptions {
  /** SubtypeIds from .sbc files in the mod Data tree (or nearby files if no Data folder). */
  knownSubtypeIds?: Set<string>;
  /** Human-readable scope for missing-reference messages (e.g. "mod Data (MyMod)"). */
  referenceScopeLabel?: string;
  /** Source-backed allowlists from MES profile .cs files (profile-tag-index.json). */
  profileTagIndex?: ProfileTagIndex | null;
  /** Parsed SubtypeId → profile header map for the mod project scope. */
  modScope?: ModScopeContext;
}

export function validateSbc(
  text: string,
  registry: TagRegistry,
  options: ValidateSbcOptions = {}
): ValidationIssue[] {
  const classification = classifySbcFile(text);
  if (!shouldValidateAsMesProfiles(classification)) {
    return [];
  }

  const issues: ValidationIssue[] = [];
  const parsed = parseSbcDocument(text);

  issues.push(...validateFileStructure(text, parsed));
  issues.push(...validateDuplicateSubtypes(parsed));
  issues.push(...validateSpawnGroupPrefabReferences(text, options.modScope));

  if (parsed.profiles.length === 0) {
    issues.push({
      line: 0,
      column: 0,
      endColumn: 1,
      severity: 'warning',
      message:
        'No MES profiles found. Expected a <Description> block with a profile header like [RivalAI Target] or [Modular Encounters SpawnGroup].',
      code: 'mes-no-profiles',
    });
    return issues;
  }

  const knownSubtypeIds =
    options.modScope?.knownSubtypeIds ??
    options.knownSubtypeIds ??
    new Set(
      parsed.profiles
        .map((profile) => profile.subtypeId)
        .filter((id) => id && id !== '(unknown)')
    );
  const referenceScopeLabel =
    options.modScope?.scopeLabel ?? options.referenceScopeLabel ?? 'this folder';

  for (const profile of parsed.profiles) {
    issues.push(
      ...validateProfile(
        profile,
        registry,
        knownSubtypeIds,
        referenceScopeLabel,
        options.profileTagIndex,
        options.modScope
      )
    );
  }

  return issues;
}

function validateFileStructure(text: string, parsed: ParsedSbc): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!text.includes('<Definitions')) {
    issues.push({
      line: 0,
      column: 0,
      endColumn: 1,
      severity: 'warning',
      message: 'File does not contain a <Definitions> root element (expected Space Engineers SBC format).',
      code: 'mes-missing-definitions',
    });
  }

  return issues;
}

function validateDuplicateSubtypes(parsed: ParsedSbc): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const [id, lines] of parsed.subtypeIds.entries()) {
    if (lines.length <= 1) {
      continue;
    }

    for (let i = 1; i < lines.length; i++) {
      issues.push({
        line: lines[i],
        column: 0,
        endColumn: 80,
        severity: 'error',
        message: `Duplicate MES profile SubtypeId "${id}" (also declared on line ${lines[0] + 1}).`,
        code: 'mes-duplicate-subtype',
        hintData: { duplicateSubtypeId: id },
      });
    }
  }

  return issues;
}

function validateProfile(
  profile: MesProfile,
  registry: TagRegistry,
  knownSubtypeIds: Set<string>,
  referenceScopeLabel: string,
  profileTagIndex?: ProfileTagIndex | null,
  modScope?: ModScopeContext
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!profile.header) {
    issues.push({
      line: profile.subtypeLine,
      column: 0,
      endColumn: 80,
      severity: 'warning',
      message: `Profile "${profile.subtypeId}" has no recognized MES/RivalAI header (e.g. [RivalAI Behavior], [Modular Encounters SpawnGroup]).`,
      code: 'mes-missing-header',
      subtypeId: profile.subtypeId,
    });
    return issues;
  }

  const primaryWiki = getProfileHeaders()[profile.header];
  if (!primaryWiki) {
    issues.push({
      line: profile.headerLine,
      column: 0,
      endColumn: profile.header.length,
      severity: 'error',
      message: `Unknown profile header "${profile.header}".`,
      code: 'mes-unknown-header',
      profileHeader: profile.header,
      subtypeId: profile.subtypeId,
    });
    return issues;
  }

  for (const tag of profile.tags) {
    issues.push(
      ...validateTag(
        tag,
        profile,
        primaryWiki,
        registry,
        knownSubtypeIds,
        referenceScopeLabel,
        profileTagIndex,
        modScope
      )
    );
  }

  issues.push(...validateRequiredTags(profile));

  return issues;
}

function validateRequiredTags(profile: MesProfile): ValidationIssue[] {
  if (!profile.header) {
    return [];
  }

  const required = REQUIRED_PROFILE_TAGS[profile.header];
  if (!required?.length) {
    return [];
  }

  const present = new Set(profile.tags.map((tag) => tag.tagName));
  const issues: ValidationIssue[] = [];

  for (const tagName of required) {
    if (present.has(tagName)) {
      continue;
    }

    issues.push({
      line: profile.headerLine,
      column: 0,
      endColumn: 80,
      severity: 'warning',
      message: `Required tag [${tagName}] is missing from this profile.`,
      code: 'mes-missing-required-tag',
      wikiFile: getProfileHeaders()[profile.header] ?? undefined,
      profileHeader: profile.header,
      subtypeId: profile.subtypeId,
      tagName,
      hintData: { requiredTagName: tagName },
    });
  }

  return issues;
}

function validateTag(
  tag: MesProfile['tags'][number],
  profile: MesProfile,
  primaryWiki: string,
  registry: TagRegistry,
  knownSubtypeIds: Set<string>,
  referenceScopeLabel: string,
  profileTagIndex?: ProfileTagIndex | null,
  modScope?: ModScopeContext
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const endColumn = tag.column + tag.raw.length;
  const base = {
    line: tag.line,
    column: tag.column,
    endColumn,
  };

  if (KNOWN_INVALID_TAGS.has(tag.tagName)) {
    issues.push(
      attachTagContext(
        {
          ...base,
          severity: 'error',
          message: `Tag [${tag.tagName}] is not documented in the MES wiki (known invalid tag).`,
          code: 'mes-known-invalid-tag',
          wikiFile: primaryWiki,
        },
        tag,
        profile
      )
    );
    return issues;
  }

  if (profileTagIndex && profile.header) {
    return validateTagWithSourceIndex(
      tag,
      profile,
      primaryWiki,
      registry,
      knownSubtypeIds,
      referenceScopeLabel,
      profileTagIndex,
      modScope,
      base
    );
  }

  return validateTagWikiOnly(
    tag,
    profile,
    primaryWiki,
    registry,
    knownSubtypeIds,
    referenceScopeLabel,
    modScope,
    base
  );
}

function validateTagWithSourceIndex(
  tag: MesProfile['tags'][number],
  profile: MesProfile,
  primaryWiki: string,
  registry: TagRegistry,
  knownSubtypeIds: Set<string>,
  referenceScopeLabel: string,
  profileTagIndex: ProfileTagIndex,
  modScope: ModScopeContext | undefined,
  base: Pick<ValidationIssue, 'line' | 'column' | 'endColumn'>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const header = profile.header!;
  const validForCurrent = isTagValidForHeader(profileTagIndex, tag.tagName, header);
  const documentedIn = getDocumentedFilesForTag(registry, tag.tagName);
  const valueWikiFile = resolveValueWikiFile(tag.tagName, primaryWiki, documentedIn, registry);

  if (validForCurrent) {
    issues.push(
      ...attachTagContextToMany(
        validateUnsetOrInvalidValue(tag, valueWikiFile, registry, base, profile),
        tag,
        profile
      )
    );
    issues.push(...validateReferences(tag, profile, base, knownSubtypeIds, referenceScopeLabel, modScope));
    issues.push(...validateModAssetReferences(tag, profile, base, modScope));
    return issues;
  }

  const validProfiles = profileTagIndex.tagToProfiles[tag.tagName] ?? [];
  if (validProfiles.length > 0) {
    issues.push(
      attachTagContext(
        {
          ...base,
          severity: 'warning',
          message: formatWrongProfileHint(tag.tagName, header, validProfiles),
          code: 'mes-wrong-profile-tag',
          wikiFile: documentedIn[0] ?? primaryWiki,
          hintData: {
            validProfileHeaders: validProfiles.map((entry) => entry.header),
            validProfileTitles: validProfiles.map((entry) => entry.title),
          },
        },
        tag,
        profile
      )
    );
    issues.push(
      ...attachTagContextToMany(
        validateUnsetOrInvalidValue(tag, valueWikiFile, registry, base, profile),
        tag,
        profile
      )
    );
    return issues;
  }

  if (documentedIn.length > 0) {
    issues.push(
      attachTagContext(
        {
          ...base,
          severity: 'error',
          message: `[${tag.tagName}] appears in wiki (${formatWikiPageList(documentedIn)}) but was not found in MES source profile parsers.`,
          code: 'mes-unknown-tag-source',
          wikiFile: documentedIn[0],
        },
        tag,
        profile
      )
    );
    issues.push(
      ...attachTagContextToMany(
        validateUnsetOrInvalidValue(tag, documentedIn[0], registry, base, profile),
        tag,
        profile
      )
    );
    return issues;
  }

  issues.push(
    attachTagContext(
      {
        ...base,
        severity: 'error',
        message: `Tag [${tag.tagName}] was not found in MES source or wiki documentation.`,
        code: 'mes-unknown-tag',
        wikiFile: primaryWiki,
      },
      tag,
      profile
    )
  );

  return issues;
}

function validateTagWikiOnly(
  tag: MesProfile['tags'][number],
  profile: MesProfile,
  primaryWiki: string,
  registry: TagRegistry,
  knownSubtypeIds: Set<string>,
  referenceScopeLabel: string,
  modScope: ModScopeContext | undefined,
  base: Pick<ValidationIssue, 'line' | 'column' | 'endColumn'>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (isTagDocumented(registry, tag.tagName, primaryWiki)) {
    issues.push(
      ...attachTagContextToMany(validateTagValue(tag, primaryWiki, registry, base, profile), tag, profile)
    );
    issues.push(...validateReferences(tag, profile, base, knownSubtypeIds, referenceScopeLabel, modScope));
    issues.push(...validateModAssetReferences(tag, profile, base, modScope));
    return issues;
  }

  const documentedIn = getDocumentedFilesForTag(registry, tag.tagName);

  if (documentedIn.length === 0) {
    issues.push(
      attachTagContext(
        {
          ...base,
          severity: 'error',
          message: `Tag [${tag.tagName}] was not found in any MES wiki documentation.`,
          code: 'mes-unknown-tag',
          wikiFile: primaryWiki,
        },
        tag,
        profile
      )
    );
    return issues;
  }

  const wikiFile = documentedIn[0];
  issues.push(
    attachTagContext(
      {
        ...base,
        severity: 'warning',
        message: `[${tag.tagName}] is documented on ${formatWikiPageList(documentedIn)}, not under ${profile.header}.`,
        code: 'mes-wrong-profile-tag',
        wikiFile,
      },
      tag,
      profile
    )
  );

  issues.push(
    ...attachTagContextToMany(
      validateUnsetOrInvalidValue(tag, wikiFile, registry, base, profile),
      tag,
      profile
    )
  );

  return issues;
}

function resolveValueWikiFile(
  tagName: string,
  primaryWiki: string,
  documentedIn: string[],
  registry: TagRegistry
): string {
  if (isTagDocumented(registry, tagName, primaryWiki)) {
    return primaryWiki;
  }

  return documentedIn[0] ?? primaryWiki;
}

function resolveValueSpec(
  tagName: string,
  wikiFile: string,
  registry: TagRegistry
): TagValueSpec | undefined {
  const spec =
    getTagMetadata(registry, tagName, wikiFile)?.valueSpec ??
    inferValueSpecFromTagName(tagName) ??
    undefined;

  return spec ? applyValueSpecOverrides(tagName, spec) : undefined;
}

function validateUnsetOrInvalidValue(
  tag: MesProfile['tags'][number],
  wikiFile: string,
  registry: TagRegistry,
  base: Pick<ValidationIssue, 'line' | 'column' | 'endColumn'>,
  profile: MesProfile
): ValidationIssue[] {
  const spec = resolveValueSpec(tag.tagName, wikiFile, registry);
  if (!spec) {
    if (isUnsetTagValue(tag.value)) {
      return [
        {
          ...base,
          severity: 'warning',
          message: `[${tag.tagName}] not set — set a value.`,
          code: 'mes-not-set',
          wikiFile,
        },
      ];
    }
    return [];
  }

  if (isUnsetTagValue(tag.value)) {
    return [
      {
        ...base,
        severity: 'warning',
        message: formatNotSetMessage(tag.tagName, spec),
        code: 'mes-not-set',
        wikiFile,
      },
    ];
  }

  const valueError = validateTagValueAgainstSpec(tag.value, spec);
  if (valueError) {
    return [
      {
        ...base,
        severity: 'warning',
        message: formatInvalidValueIssueMessage(tag, profile, spec),
        code: 'mes-invalid-value',
        wikiFile,
      },
    ];
  }

  return [];
}

function validateTagValue(
  tag: MesProfile['tags'][number],
  primaryWiki: string,
  registry: TagRegistry,
  base: Pick<ValidationIssue, 'line' | 'column' | 'endColumn'>,
  profile: MesProfile
): ValidationIssue[] {
  return validateUnsetOrInvalidValue(tag, primaryWiki, registry, base, profile);
}

function formatInvalidValueIssueMessage(
  tag: MesProfile['tags'][number],
  profile: MesProfile,
  spec: TagValueSpec
): string {
  if (tag.tagName === 'AutopilotProfile' && profile.header && /Action/i.test(profile.header)) {
    return `[AutopilotProfile] on ${profile.header}: invalid value "${tag.value}" — use Primary, Secondary, or Tertiary (behavior autopilot slot mode, not an autopilot SubtypeId).`;
  }

  if (profile.header) {
    const base = formatInvalidValueMessage(tag.tagName, tag.value, spec);
    return base.replace(`[${tag.tagName}]`, `[${tag.tagName}] on ${profile.header}`);
  }

  return formatInvalidValueMessage(tag.tagName, tag.value, spec);
}

function attachTagContext(
  issue: ValidationIssue,
  tag: MesProfile['tags'][number],
  profile: MesProfile
): ValidationIssue {
  return {
    ...issue,
    profileHeader: profile.header,
    subtypeId: profile.subtypeId,
    tagName: tag.tagName,
    tagValue: tag.value,
  };
}

function attachTagContextToMany(
  issues: ValidationIssue[],
  tag: MesProfile['tags'][number],
  profile: MesProfile
): ValidationIssue[] {
  return issues.map((issue) => attachTagContext(issue, tag, profile));
}

function validateModAssetReferences(
  tag: MesProfile['tags'][number],
  profile: MesProfile,
  base: Pick<ValidationIssue, 'line' | 'column' | 'endColumn'>,
  modScope?: ModScopeContext
): ValidationIssue[] {
  const assetIndex = modScope?.assetIndex;
  if (!assetIndex || isUnsetTagValue(tag.value)) {
    return [];
  }

  const refs = splitReferenceValues(tag.value).filter((ref) => {
    if (!valueLooksLikeSubtypeReference(ref)) {
      return false;
    }
    if (AUDIO_REFERENCE_TAGS.has(tag.tagName) && isNoChatAudioValue(ref)) {
      return false;
    }
    return true;
  });
  if (refs.length === 0) {
    return [];
  }

  const scopeLabel = modScope?.scopeLabel ?? 'mod Data';

  if (AUDIO_REFERENCE_TAGS.has(tag.tagName)) {
    const missing = refs.filter((ref) => !assetIndex.audioSubtypeIds.has(ref));
    if (missing.length === 0) {
      return [];
    }

    const audioHint =
      assetIndex.audioSubtypeIds.size > 0
        ? `searched ${assetIndex.audioSubtypeIds.size} audio SubtypeId(s) in ${scopeLabel}`
        : `no audio .sbc definitions found in ${scopeLabel}`;

    return [
      attachTagContext(
        {
          ...base,
          severity: 'warning',
          message: `[${tag.tagName}] audio SubtypeId not found in mod audio .sbc files (${audioHint}): ${missing.join(', ')}.`,
          code: 'mes-missing-audio-reference',
          hintData: { missingSubtypeIds: missing },
        },
        tag,
        profile
      ),
    ];
  }

  if (CONTAINER_TYPE_REFERENCE_TAGS.has(tag.tagName)) {
    const missing = refs.filter((ref) => !assetIndex.containerTypeSubtypeIds.has(ref));
    if (missing.length === 0) {
      return [];
    }

    const containerHint =
      assetIndex.containerTypeSubtypeIds.size > 0
        ? `searched ${assetIndex.containerTypeSubtypeIds.size} container type SubtypeId(s) in ${scopeLabel}`
        : `no ContainerTypes .sbc definitions found in ${scopeLabel}`;

    return [
      attachTagContext(
        {
          ...base,
          severity: 'warning',
          message: `[${tag.tagName}] container type SubtypeId not found in mod ContainerTypes .sbc files (${containerHint}): ${missing.join(', ')}.`,
          code: 'mes-missing-container-type-reference',
          hintData: { missingSubtypeIds: missing },
        },
        tag,
        profile
      ),
    ];
  }

  if (PREFAB_REFERENCE_TAGS.has(tag.tagName)) {
    const missing = refs.filter((ref) => !assetIndex.prefabSubtypeIds.has(ref));
    if (missing.length === 0) {
      return [];
    }

    const prefabHint =
      assetIndex.prefabSubtypeIds.size > 0
        ? `searched ${assetIndex.prefabSubtypeIds.size} prefab SubtypeId(s) in ${scopeLabel}`
        : `no Prefabs .sbc definitions found in ${scopeLabel}`;

    return [
      attachTagContext(
        {
          ...base,
          severity: 'warning',
          message: `[${tag.tagName}] prefab SubtypeId not found in mod Prefabs .sbc files (${prefabHint}): ${missing.join(', ')}.`,
          code: 'mes-missing-prefab-reference',
          hintData: { missingSubtypeIds: missing },
          wikiFile: 'SpawnGroup.html',
        },
        tag,
        profile
      ),
    ];
  }

  return [];
}

function validateSpawnGroupPrefabReferences(
  text: string,
  modScope?: ModScopeContext
): ValidationIssue[] {
  const assetIndex = modScope?.assetIndex;
  if (!assetIndex) {
    return [];
  }

  const refs = extractSpawnGroupPrefabReferences(text);
  if (refs.length === 0) {
    return [];
  }

  const scopeLabel = modScope?.scopeLabel ?? 'mod Data';
  const issues: ValidationIssue[] = [];

  for (const ref of refs) {
    if (assetIndex.prefabSubtypeIds.has(ref.subtypeId)) {
      continue;
    }

    const prefabHint =
      assetIndex.prefabSubtypeIds.size > 0
        ? `searched ${assetIndex.prefabSubtypeIds.size} prefab SubtypeId(s) in ${scopeLabel}`
        : `no Prefabs .sbc definitions found in ${scopeLabel}`;

    issues.push({
      line: ref.line,
      column: ref.column,
      endColumn: ref.endColumn,
      severity: 'warning',
      message: `SpawnGroup <Prefab SubtypeId="${ref.subtypeId}"> not found in mod Prefabs .sbc files (${prefabHint}).`,
      code: 'mes-missing-prefab-reference',
      hintData: { missingSubtypeIds: [ref.subtypeId] },
      wikiFile: 'SpawnGroup.html',
    });
  }

  return issues;
}

function validateReferences(
  tag: MesProfile['tags'][number],
  profile: MesProfile,
  base: Pick<ValidationIssue, 'line' | 'column' | 'endColumn'>,
  knownSubtypeIds: Set<string>,
  referenceScopeLabel: string,
  modScope?: ModScopeContext
): ValidationIssue[] {
  const expectedHeaders = getExpectedHeadersForReferenceTag(tag.tagName);
  const shouldCheckReferences =
    expectedHeaders !== null || isLikelyReferenceTag(tag.tagName);

  if (!shouldCheckReferences || isUnsetTagValue(tag.value) || !valueLooksLikeSubtypeReference(tag.value)) {
    return [];
  }

  const refs = splitReferenceValues(tag.value);
  if (refs.length === 0) {
    return [];
  }

  const ids = modScope?.knownSubtypeIds ?? knownSubtypeIds;
  const scopeLabel = modScope?.scopeLabel ?? referenceScopeLabel;
  const profileIndex = modScope?.profileIndex;
  const issues: ValidationIssue[] = [];
  const missing: string[] = [];

  for (const ref of refs) {
    if (!ids.has(ref)) {
      missing.push(ref);
    }
  }

  if (missing.length > 0) {
    const fileHint =
      modScope && modScope.openFileCount + modScope.diskFileCount > 1
        ? ` (searched ${modScope.openFileCount} open + ${modScope.diskFileCount} on-disk .sbc files in ${scopeLabel})`
        : '';
    issues.push(
      attachTagContext(
        {
          ...base,
          severity: 'warning',
          message: `Referenced SubtypeId(s) not found in ${scopeLabel}${fileHint}: ${missing.join(', ')}.`,
          code: 'mes-missing-reference',
          hintData: {
            missingSubtypeIds: missing,
            expectedReferenceHeaders: expectedHeaders ?? undefined,
            expectedReferenceLabel: expectedHeaders
              ? formatExpectedProfileTypes(expectedHeaders)
              : undefined,
          },
        },
        tag,
        profile
      )
    );
  }

  if (!expectedHeaders || !profileIndex) {
    return issues;
  }

  const expectedLabel = formatExpectedProfileTypes(expectedHeaders);

  for (const ref of refs) {
    if (missing.includes(ref)) {
      continue;
    }

    const entry = profileIndex.get(ref);
    if (!entry) {
      continue;
    }

    if (!headerMatchesReferenceExpectation(entry.header, expectedHeaders)) {
      const actual = entry.header ?? '(missing MES profile header)';
      issues.push(
        attachTagContext(
          {
            ...base,
            severity: 'warning',
            message: `[${tag.tagName}] references "${ref}" from ${entry.sourceLabel}, which uses ${actual} — expected a ${expectedLabel} profile.`,
            code: 'mes-wrong-reference-profile',
            hintData: {
              referencedSubtypeId: ref,
              referencedSourceLabel: entry.sourceLabel,
              referencedActualHeader: entry.header,
              expectedReferenceHeaders: expectedHeaders,
              expectedReferenceLabel: expectedLabel,
            },
          },
          tag,
          profile
        )
      );
    }
  }

  return issues;
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