import { parseSbcDocument, ParsedSbc } from './sbcParser';
import { getProfileHeaders } from './profileHeaders';
import { extractIndexedAssetIds } from './modAssetIndex';
import { extractDirectDefinitionsChildren } from './definitionsXml';
import {
  DEFAULT_VANILLA_SE_LABEL,
  VANILLA_SE_DEFINITION_ROOTS,
} from './vanillaSeDefinitionRoots';

export type SbcFileKind = 'mes-profiles' | 'vanilla-se';

export interface SbcFileClassification {
  kind: SbcFileKind;
  /** Human-readable label for vanilla SE definition files (e.g. "Spawn groups"). */
  vanillaLabel?: string;
  /** Direct child element(s) under <Definitions>, when present. */
  definitionRoots?: string[];
  /** MES profiles with both <Description> and a recognized profile header. */
  profileCount: number;
  /** SubtypeIds indexed from this file for cross-reference checks (audio, container types). */
  indexedAssetIds: string[];
}

export function classifySbcFile(text: string): SbcFileClassification {
  const parsed = parseSbcDocument(text);
  const mesProfileCount = countValidMesProfiles(parsed);
  const indexedAssetIds = extractIndexedAssetIds(text);
  const definitionRoots = extractDirectDefinitionsChildren(text).map((child) => child.name);

  if (isMesProfileFile(parsed, text, mesProfileCount)) {
    return { kind: 'mes-profiles', profileCount: mesProfileCount, indexedAssetIds, definitionRoots };
  }

  const vanillaLabel = detectVanillaSeLabel(text) ?? DEFAULT_VANILLA_SE_LABEL;
  return {
    kind: 'vanilla-se',
    vanillaLabel,
    profileCount: 0,
    indexedAssetIds,
    definitionRoots,
  };
}

export function shouldValidateAsMesProfiles(classification: SbcFileClassification): boolean {
  return classification.kind === 'mes-profiles';
}

export function skipLabelForClassification(classification: SbcFileClassification): string {
  return classification.vanillaLabel ?? DEFAULT_VANILLA_SE_LABEL;
}

function isMesProfileFile(parsed: ParsedSbc, text: string, mesProfileCount: number): boolean {
  return mesProfileCount > 0 || hasMesProfileDescription(text) || hasMesStyleTags(parsed);
}

function countValidMesProfiles(parsed: ParsedSbc): number {
  const headers = getProfileHeaders();
  return parsed.profiles.filter((profile) => profile.header && headers[profile.header]).length;
}

export function isNonMesDefinitionSbc(text: string): boolean {
  return !shouldValidateAsMesProfiles(classifySbcFile(text));
}

function detectVanillaSeLabel(text: string): string | undefined {
  const children = extractDirectDefinitionsChildren(text);
  if (children.length === 0) {
    return undefined;
  }

  for (const child of children) {
    const label = labelForDefinitionsChild(child);
    if (label) {
      return label;
    }
  }

  return undefined;
}

function labelForDefinitionsChild(child: { name: string; xsiType: string | null }): string | undefined {
  const known = VANILLA_SE_DEFINITION_ROOTS[child.name];
  if (known) {
    if (child.name === 'Definition' && child.xsiType) {
      return labelForXsiType(child.xsiType);
    }
    return known.label;
  }

  if (child.xsiType) {
    return labelForXsiType(child.xsiType);
  }

  return humanizeRootName(child.name);
}

function labelForXsiType(xsiType: string): string {
  const stripped = xsiType.replace(/^MyObjectBuilder_/, '').replace(/Definition$/, '');
  return humanizeRootName(stripped);
}

function humanizeRootName(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/** MES/RivalAI profile headers in a Description block. */
function hasMesProfileDescription(text: string): boolean {
  return /<Description\b[^>]*>[\s\S]*?\[(?:RivalAI|MES|Modular Encounters)/i.test(text);
}

/** Bracket tags like [FactionOwner:SPRT] — vanilla spawn descriptions use plain text only. */
function hasMesStyleTags(parsed: ParsedSbc): boolean {
  return parsed.profiles.some((profile) => profile.tags.length > 0);
}
