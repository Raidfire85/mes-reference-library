export type TagValueKind =
  | 'boolean'
  | 'enum'
  | 'number'
  | 'integer'
  | 'reference'
  | 'coordinates'
  | 'freeform';

export interface TagValueSpec {
  kind: TagValueKind;
  enumValues?: string[];
  min?: number;
  max?: number;
  minExclusive?: boolean;
  allowMinusOne?: boolean;
  /** When set, each X/Y/Z component must be >= this value. */
  coordinatesMin?: number;
  referenceKind?: string;
  multipleAllowed?: boolean;
}

/** MES treats -1 as "no limit" for these target threat-score bounds (TargetingSystem.cs). */
export const MES_MINUS_ONE_NUMERIC_TAGS = new Set(['MinTargetValue', 'MaxTargetValue']);

export function applyValueSpecOverrides(tagName: string, spec: TagValueSpec): TagValueSpec {
  if (
    (spec.kind === 'number' || spec.kind === 'integer') &&
    MES_MINUS_ONE_NUMERIC_TAGS.has(tagName)
  ) {
    return { ...spec, allowMinusOne: true };
  }

  return spec;
}

export interface TagMetadata {
  tagName: string;
  wikiFile: string;
  valueSpec: TagValueSpec;
}

/** MES Vector3D / GPS coordinate format, e.g. {X:1 Y:1 Z:1} */
export const VECTOR3D_PATTERN =
  /^\{\s*X:\s*(-?\d+(?:\.\d+)?)\s+Y:\s*(-?\d+(?:\.\d+)?)\s+Z:\s*(-?\d+(?:\.\d+)?)\s*\}$/i;

const TABLE_PATTERN = /<table role="table">([\s\S]*?)<\/table>/gi;
const CODE_PATTERN = /<code>([^<]*)<\/code>/gi;

export function parseTagMetadataFromWiki(html: string, wikiFile: string): Map<string, TagMetadata> {
  const metadata = new Map<string, TagMetadata>();
  const supplementalEnums = collectSupplementalEnums(html);

  let tableMatch: RegExpExecArray | null;
  TABLE_PATTERN.lastIndex = 0;
  while ((tableMatch = TABLE_PATTERN.exec(html)) !== null) {
    const tableHtml = tableMatch[1];
    const tagName = extractTagNameFromTable(tableHtml);
    if (!tagName) {
      continue;
    }

    const allowedHtml = extractTableCell(tableHtml, 'Allowed Values:');
    if (!allowedHtml) {
      continue;
    }

    const descriptionHtml = extractTableCell(tableHtml, 'Description:');

    const multipleAllowed = extractTableCell(tableHtml, 'Multiple Tag Allowed:')
      ?.replace(/<[^>]+>/g, '')
      .trim()
      .toLowerCase() === 'yes';

    let valueSpec = parseAllowedValues(allowedHtml);
    if (descriptionHtml && mentionsMinusOne(stripHtml(descriptionHtml).toLowerCase(), [])) {
      valueSpec = { ...valueSpec, allowMinusOne: true };
    }
    valueSpec = applyValueSpecOverrides(tagName, valueSpec);
    if (
      valueSpec.kind === 'freeform' &&
      /see table above/i.test(stripHtml(allowedHtml)) &&
      supplementalEnums.length > 0 &&
      tagName === 'Type'
    ) {
      valueSpec = { kind: 'enum', enumValues: supplementalEnums };
    }

    valueSpec.multipleAllowed = multipleAllowed;
    metadata.set(tagName, { tagName, wikiFile, valueSpec });
  }

  TABLE_PATTERN.lastIndex = 0;
  return metadata;
}

function collectSupplementalEnums(html: string): string[] {
  const values: string[] = [];

  let tableMatch: RegExpExecArray | null;
  TABLE_PATTERN.lastIndex = 0;
  while ((tableMatch = TABLE_PATTERN.exec(html)) !== null) {
    const tableHtml = tableMatch[1];
    if (!/<th[^>]*>\s*Type:\s*<\/th>/i.test(tableHtml)) {
      continue;
    }

    let codeMatch: RegExpExecArray | null;
    CODE_PATTERN.lastIndex = 0;
    const rows = tableHtml.match(/<tr>[\s\S]*?<\/tr>/gi) ?? [];
    for (const row of rows) {
      if (/<th/i.test(row)) {
        continue;
      }
      CODE_PATTERN.lastIndex = 0;
      codeMatch = CODE_PATTERN.exec(row);
      if (codeMatch) {
        const value = decodeHtmlEntities(codeMatch[1].trim());
        if (value) {
          values.push(value);
        }
      }
    }
  }

  TABLE_PATTERN.lastIndex = 0;
  CODE_PATTERN.lastIndex = 0;
  return values;
}

function extractTagNameFromTable(tableHtml: string): string | null {
  const match = tableHtml.match(
    /<thead>[\s\S]*?<th[^>]*>\s*Tag:[\s\S]*?<\/th>\s*<th[^>]*>([\s\S]*?)<\/th>/i
  );
  if (!match) {
    return null;
  }
  return decodeHtmlEntities(match[1].replace(/<[^>]+>/g, '').trim());
}

function extractTableCell(tableHtml: string, label: string): string | null {
  const pattern = new RegExp(
    `<td[^>]*>\\s*${escapeRegex(label)}\\s*<\\/td>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`,
    'i'
  );
  return tableHtml.match(pattern)?.[1] ?? null;
}

function parseAllowedValues(allowedHtml: string): TagValueSpec {
  const codes = extractCodeValues(allowedHtml);
  const text = stripHtml(allowedHtml).replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();

  if (/see table above/i.test(lower)) {
    return { kind: 'freeform' };
  }

  if (
    codes.length === 2 &&
    codes.every((value) => /^true$|^false$/i.test(value))
  ) {
    return { kind: 'boolean' };
  }

  if (/any .* subtypeid/i.test(lower)) {
    return { kind: 'reference', referenceKind: text };
  }

  if (isCoordinatesAllowedValues(lower)) {
    const coordinatesMin = /equal or greater than\s*0|greater than\s*0/i.test(lower) ? 0 : undefined;
    return { kind: 'coordinates', coordinatesMin };
  }

  const betweenMatch = lower.match(
    /between [`'"]?(-?\d+(?:\.\d+)?)[`'"]? and [`'"]?(-?\d+(?:\.\d+)?)[`'"]?/
  );
  if (betweenMatch) {
    return {
      kind: lower.includes('integer') ? 'integer' : 'number',
      min: Number(betweenMatch[1]),
      max: Number(betweenMatch[2]),
      allowMinusOne: mentionsMinusOne(lower, codes),
    };
  }

  const gtMatch = lower.match(/(?:greater|higher) than [`'"]?(-?\d+(?:\.\d+)?)[`'"]?/);
  if (gtMatch) {
    return {
      kind: lower.includes('integer') ? 'integer' : 'number',
      min: Number(gtMatch[1]),
      minExclusive: true,
      allowMinusOne: mentionsMinusOne(lower, codes),
    };
  }

  const gteMatch = lower.match(/(?:at least|minimum of) [`'"]?(-?\d+(?:\.\d+)?)[`'"]?/);
  if (gteMatch) {
    return {
      kind: lower.includes('integer') ? 'integer' : 'number',
      min: Number(gteMatch[1]),
      allowMinusOne: mentionsMinusOne(lower, codes),
    };
  }

  const enumValues = codes.filter(
    (value) =>
      value &&
      !/^value$/i.test(value) &&
      value !== 'N/A' &&
      !/see table/i.test(value) &&
      value !== 'All' &&
      !isVector3DExample(value)
  );

  if (enumValues.length > 0 && !lower.startsWith('any ')) {
    return { kind: 'enum', enumValues };
  }

  if (lower.includes('true') && lower.includes('false') && enumValues.length === 0) {
    return { kind: 'boolean' };
  }

  return { kind: 'freeform' };
}

function mentionsMinusOne(lower: string, codes: string[]): boolean {
  return lower.includes('-1') || codes.some((code) => code.trim() === '-1');
}

function isCoordinatesAllowedValues(lower: string): boolean {
  return (
    /vector3d/.test(lower) ||
    /vector coordinates/.test(lower) ||
    /vector3d value/.test(lower) ||
    /any vector3d string/.test(lower)
  );
}

function isVector3DExample(value: string): boolean {
  return VECTOR3D_PATTERN.test(value.trim()) || /^\{X:#\s+Y:#\s+Z:#\}$/i.test(value.trim());
}

export function parseVector3D(
  value: string
): { x: number; y: number; z: number } | null {
  const match = value.trim().match(VECTOR3D_PATTERN);
  if (!match) {
    return null;
  }
  return {
    x: Number(match[1]),
    y: Number(match[2]),
    z: Number(match[3]),
  };
}

export function isUnsetTagValue(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === '' || /^value$/i.test(trimmed);
}

export function notSetHint(spec: TagValueSpec): string {
  switch (spec.kind) {
    case 'boolean':
      return 'use true or false';
    case 'enum':
      return `use one of: ${spec.enumValues!.join(', ')}`;
    case 'number':
    case 'integer':
      return numericHint(spec);
    case 'coordinates':
      return coordinatesHint(spec);
    case 'reference':
      return 'enter a SubtypeId';
    default:
      return 'set a value';
  }
}

function numericHint(spec: TagValueSpec): string {
  const typeLabel = spec.kind === 'integer' ? 'integer' : 'number';
  if (spec.min !== undefined && spec.max !== undefined) {
    return `use a ${typeLabel} between ${spec.min} and ${spec.max}`;
  }
  if (spec.min !== undefined) {
    if (spec.minExclusive) {
      return spec.allowMinusOne
        ? `use a ${typeLabel} greater than ${spec.min}, or -1 for no limit`
        : `use a ${typeLabel} greater than ${spec.min}`;
    }
    return `use a ${typeLabel} of at least ${spec.min}`;
  }
  if (spec.allowMinusOne) {
    return `use a ${typeLabel} greater than 0, or -1 for no limit`;
  }
  return `enter a ${typeLabel}`;
}

function coordinatesHint(spec: TagValueSpec): string {
  if (spec.coordinatesMin !== undefined && spec.coordinatesMin >= 0) {
    return 'use GPS format {X:0 Y:0 Z:0} with X, Y, and Z each ≥ 0';
  }
  return 'use GPS format {X:0 Y:0 Z:0}';
}

export function formatNotSetMessage(tagName: string, spec: TagValueSpec): string {
  return `[${tagName}] not set — ${notSetHint(spec)}.`;
}

export function formatInvalidValueMessage(
  tagName: string,
  value: string,
  spec: TagValueSpec
): string {
  return `[${tagName}] invalid value "${value}" — ${notSetHint(spec)}.`;
}

/** Guess value type from tag name when wiki metadata is unavailable. */
export function inferValueSpecFromTagName(tagName: string): TagValueSpec | null {
  if (tagName.startsWith('Use') || tagName.toLowerCase().includes('enable')) {
    return { kind: 'boolean' };
  }

  if (
    /^(Min|Max)/.test(tagName) ||
    /(Distance|Range|Amount|Cooldown|Delay|Rate|Speed|Percent|Percentage|Angle|Health|Altitude|Radius|Time|Fire|Clip|Replenish|Ms)$/i.test(
      tagName
    )
  ) {
    return applyValueSpecOverrides(tagName, {
      kind: 'number',
      min: 0,
      minExclusive: true,
    });
  }

  if (
    tagName === 'Coordinates' ||
    tagName === 'Direction' ||
    /Vector3D/i.test(tagName) ||
    /Offset$/i.test(tagName)
  ) {
    return { kind: 'coordinates' };
  }

  return null;
}

/** Show hover options only for multi-choice tags (not plain bool/number). */
export function shouldShowAllowedValuesHoverHint(spec?: TagValueSpec | null): boolean {
  if (!spec?.enumValues?.length || spec.kind === 'boolean' || spec.kind === 'number' || spec.kind === 'integer') {
    return false;
  }

  const normalized = spec.enumValues.map((value) => value.toLowerCase());
  if (
    normalized.length === 2 &&
    normalized.includes('true') &&
    normalized.includes('false')
  ) {
    return false;
  }

  return spec.kind === 'enum' && normalized.length >= 2;
}

export function formatAllowedValuesHoverHint(spec: TagValueSpec): string {
  const values = spec.enumValues?.join(', ') ?? '';
  if (spec.multipleAllowed) {
    return `**Options** (can repeat with different values): ${values}`;
  }
  return `**Options:** ${values}`;
}

export function validateTagValueAgainstSpec(value: string, spec: TagValueSpec): string | null {
  if (spec.kind === 'boolean') {
    return /^(true|false)$/i.test(value) ? null : 'expected true or false';
  }

  if (spec.kind === 'enum') {
    const match = spec.enumValues!.some(
      (allowed) => allowed.toLowerCase() === value.toLowerCase()
    );
    return match ? null : `expected one of: ${spec.enumValues!.join(', ')}`;
  }

  if (spec.kind === 'number' || spec.kind === 'integer') {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return `expected a ${spec.kind}`;
    }
    if (spec.kind === 'integer' && !Number.isInteger(num)) {
      return 'expected an integer';
    }
    if (num === -1 && spec.allowMinusOne) {
      return null;
    }
    if (spec.min !== undefined) {
      if (spec.minExclusive && num <= spec.min) {
        return `must be greater than ${spec.min}`;
      }
      if (!spec.minExclusive && num < spec.min) {
        return `must be at least ${spec.min}`;
      }
    }
    if (spec.max !== undefined && num > spec.max) {
      return `must be at most ${spec.max}`;
    }
    return null;
  }

  if (spec.kind === 'reference') {
    return value.trim() ? null : 'expected a SubtypeId';
  }

  if (spec.kind === 'coordinates') {
    const coords = parseVector3D(value);
    if (!coords) {
      return 'use GPS format {X:0 Y:0 Z:0}';
    }
    if (spec.coordinatesMin !== undefined) {
      if (coords.x < spec.coordinatesMin || coords.y < spec.coordinatesMin || coords.z < spec.coordinatesMin) {
        return `each X, Y, and Z must be at least ${spec.coordinatesMin}`;
      }
    }
    return null;
  }

  return null;
}

function extractCodeValues(html: string): string[] {
  const values: string[] = [];
  let match: RegExpExecArray | null;
  CODE_PATTERN.lastIndex = 0;
  while ((match = CODE_PATTERN.exec(html)) !== null) {
    values.push(decodeHtmlEntities(match[1].trim()));
  }
  CODE_PATTERN.lastIndex = 0;
  return values;
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '));
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
