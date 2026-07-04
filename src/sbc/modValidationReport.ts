import * as path from 'path';
import { issueWithFixHint } from './issueFixHints';
import { ValidationIssue, validateSbc } from './sbcValidator';
import { buildModScopeContext, ModScopeContext } from './modProfileIndex';
import { parseSbcDocument } from './sbcParser';
import { ProfileTagIndex } from './profileTagIndex';
import { TagRegistry } from './tagRegistry';
import { ApplicableFix, FixContext } from './issueFixTypes';
import { classifySbcFile, shouldValidateAsMesProfiles, skipLabelForClassification } from './sbcFileClassification';
import { getModAssetIndexStats } from './modAssetIndex';
import { describeReferenceScope } from './sbcModScope';

export interface ModValidationIssue extends ValidationIssue {
  fixHint: string;
  applicableFixes: ApplicableFix[];
}

export interface ModValidationFileResult {
  filePath: string;
  relativePath: string;
  issues: ModValidationIssue[];
}

export interface CrossFileDuplicateSubtype {
  subtypeId: string;
  locations: Array<{ filePath: string; relativePath: string; line: number }>;
}

export interface SkippedNonMesCategorySummary {
  kindLabel: string;
  fileCount: number;
  indexedSubtypeCount: number;
}

export interface SkippedNonMesFile {
  filePath: string;
  relativePath: string;
  kindLabel: string;
  indexedAssetIds: string[];
}

export interface ModValidationReport {
  modName: string;
  dataRoot: string;
  scopeLabel: string;
  scannedFileCount: number;
  mesProfileFileCount: number;
  profileCount: number;
  indexedAudioSubtypeCount: number;
  indexedContainerTypeSubtypeCount: number;
  indexedPrefabSubtypeCount: number;
  errorCount: number;
  warningCount: number;
  cleanFileCount: number;
  skippedNonMesFileCount: number;
  skippedNonMesByCategory: SkippedNonMesCategorySummary[];
  skippedNonMesFiles: SkippedNonMesFile[];
  filesWithIssues: ModValidationFileResult[];
  crossFileDuplicates: CrossFileDuplicateSubtype[];
  generatedAt: string;
}

export function findCrossFileDuplicateSubtypes(
  filePaths: string[],
  fileContents: Map<string, string>,
  dataRoot: string
): CrossFileDuplicateSubtype[] {
  const subtypeToLocations = new Map<string, Array<{ filePath: string; relativePath: string; line: number }>>();

  for (const filePath of filePaths) {
    const content = fileContents.get(filePath);
    if (!content) {
      continue;
    }

    const parsed = parseSbcDocument(content);
    const relativePath = path.relative(dataRoot, filePath) || path.basename(filePath);

    for (const profile of parsed.profiles) {
      if (!profile.subtypeId || profile.subtypeId === '(unknown)') {
        continue;
      }

      if (!subtypeToLocations.has(profile.subtypeId)) {
        subtypeToLocations.set(profile.subtypeId, []);
      }

      subtypeToLocations.get(profile.subtypeId)!.push({
        filePath,
        relativePath,
        line: profile.subtypeLine,
      });
    }
  }

  const duplicates: CrossFileDuplicateSubtype[] = [];

  for (const [subtypeId, locations] of subtypeToLocations) {
    const uniqueFiles = new Set(locations.map((entry) => entry.filePath.toLowerCase()));
    if (uniqueFiles.size <= 1) {
      continue;
    }

    duplicates.push({
      subtypeId,
      locations: locations.sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
    });
  }

  return duplicates.sort((a, b) => a.subtypeId.localeCompare(b.subtypeId));
}

export function buildCrossFileDuplicateIssues(
  duplicates: CrossFileDuplicateSubtype[]
): Array<{ filePath: string; issue: ValidationIssue }> {
  const results: Array<{ filePath: string; issue: ValidationIssue }> = [];

  for (const duplicate of duplicates) {
    const fileList = [...new Set(duplicate.locations.map((entry) => entry.relativePath))].join(', ');

    for (let i = 1; i < duplicate.locations.length; i++) {
      const location = duplicate.locations[i];
      results.push({
        filePath: location.filePath,
        issue: {
          line: location.line,
          column: 0,
          endColumn: 120,
          severity: 'error',
          message: `Duplicate MES profile SubtypeId "${duplicate.subtypeId}" across mod (also defined in: ${fileList}).`,
          code: 'mes-duplicate-subtype-mod',
          hintData: { duplicateSubtypeId: duplicate.subtypeId },
        },
      });
    }
  }

  return results;
}

export async function buildModValidationReport(
  dataRoot: string,
  filePaths: string[],
  fileContents: Map<string, string>,
  registry: TagRegistry,
  profileTagIndex: ProfileTagIndex | null,
  openFileCount: number
): Promise<ModValidationReport> {
  const sources = new Map<string, string>();
  for (const filePath of filePaths) {
    const content = fileContents.get(filePath);
    if (content) {
      sources.set(path.relative(dataRoot, filePath) || path.basename(filePath), content);
    }
  }

  const scopeLabel = describeReferenceScope(dataRoot);
  const diskFileCount = filePaths.length - openFileCount;
  const modScope: ModScopeContext = buildModScopeContext(
    sources,
    scopeLabel,
    openFileCount,
    Math.max(0, diskFileCount)
  );
  const assetStats = getModAssetIndexStats(modScope.assetIndex);

  const crossFileDuplicates = findCrossFileDuplicateSubtypes(filePaths, fileContents, dataRoot);
  const duplicateIssues = buildCrossFileDuplicateIssues(crossFileDuplicates);
  const duplicateIssuesByFile = new Map<string, ValidationIssue[]>();

  for (const entry of duplicateIssues) {
    if (!duplicateIssuesByFile.has(entry.filePath)) {
      duplicateIssuesByFile.set(entry.filePath, []);
    }
    duplicateIssuesByFile.get(entry.filePath)!.push(entry.issue);
  }

  const filesWithIssues: ModValidationFileResult[] = [];
  const skippedNonMesFiles: SkippedNonMesFile[] = [];
  let profileCount = 0;
  let mesProfileFileCount = 0;
  let errorCount = 0;
  let warningCount = 0;

  const fixContext: FixContext = {
    registry,
    modSources: sources,
    dataRoot,
  };

  for (const filePath of [...filePaths].sort()) {
    const content = fileContents.get(filePath);
    if (!content) {
      continue;
    }

    const classification = classifySbcFile(content);
    profileCount += classification.profileCount;

    if (!shouldValidateAsMesProfiles(classification)) {
      skippedNonMesFiles.push({
        filePath,
        relativePath: path.relative(dataRoot, filePath) || path.basename(filePath),
        kindLabel: skipLabelForClassification(classification),
        indexedAssetIds: classification.indexedAssetIds,
      });
      continue;
    }

    if (classification.profileCount > 0) {
      mesProfileFileCount++;
    }

    const issues = validateSbc(content, registry, { modScope, profileTagIndex });
    const merged = [...issues, ...(duplicateIssuesByFile.get(filePath) ?? [])].map((issue) =>
      issueWithFixHint(issue, registry, fixContext)
    );

    for (const issue of merged) {
      if (issue.severity === 'error') {
        errorCount++;
      } else if (issue.severity === 'warning') {
        warningCount++;
      }
    }

    if (merged.length > 0) {
      filesWithIssues.push({
        filePath,
        relativePath: path.relative(dataRoot, filePath) || path.basename(filePath),
        issues: merged.sort((a, b) => a.line - b.line || a.column - b.column),
      });
    }
  }

  filesWithIssues.sort(
    (a, b) =>
      severityRank(b.issues) - severityRank(a.issues) ||
      a.relativePath.localeCompare(b.relativePath)
  );

  skippedNonMesFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  const skippedNonMesByCategory = summarizeSkippedNonMesByCategory(skippedNonMesFiles);

  const modName = path.basename(path.dirname(dataRoot));
  const validatedMesFileCount = filePaths.length - skippedNonMesFiles.length;

  return {
    modName,
    dataRoot,
    scopeLabel,
    scannedFileCount: filePaths.length,
    mesProfileFileCount,
    profileCount,
    indexedAudioSubtypeCount: assetStats.audioSubtypeCount,
    indexedContainerTypeSubtypeCount: assetStats.containerTypeSubtypeCount,
    indexedPrefabSubtypeCount: assetStats.prefabSubtypeCount,
    errorCount,
    warningCount,
    cleanFileCount: validatedMesFileCount - filesWithIssues.length,
    skippedNonMesFileCount: skippedNonMesFiles.length,
    skippedNonMesByCategory,
    skippedNonMesFiles,
    filesWithIssues,
    crossFileDuplicates,
    generatedAt: new Date().toISOString(),
  };
}

function severityRank(issues: ModValidationIssue[]): number {
  if (issues.some((issue) => issue.severity === 'error')) {
    return 2;
  }
  if (issues.some((issue) => issue.severity === 'warning')) {
    return 1;
  }
  return 0;
}

export function summarizeSkippedNonMesByCategory(
  files: SkippedNonMesFile[]
): SkippedNonMesCategorySummary[] {
  const byKind = new Map<string, { fileCount: number; indexedIds: Set<string> }>();

  for (const file of files) {
    if (!byKind.has(file.kindLabel)) {
      byKind.set(file.kindLabel, { fileCount: 0, indexedIds: new Set() });
    }

    const entry = byKind.get(file.kindLabel)!;
    entry.fileCount++;
    for (const id of file.indexedAssetIds) {
      entry.indexedIds.add(id);
    }
  }

  return [...byKind.entries()]
    .map(([kindLabel, data]) => ({
      kindLabel,
      fileCount: data.fileCount,
      indexedSubtypeCount: data.indexedIds.size,
    }))
    .sort((a, b) => a.kindLabel.localeCompare(b.kindLabel));
}
