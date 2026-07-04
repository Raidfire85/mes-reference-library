import { buildFixHint, FixHintOptions } from './issueFixBuilder';
import { getApplicableFixes } from './issueFixLogic';
import { ApplicableFix, FixContext } from './issueFixTypes';
import { TagRegistry } from './tagRegistry';
import { ValidationIssue } from './sbcValidator';

export type { FixHintOptions } from './issueFixBuilder';

export function getFixHintForIssue(
  issue: ValidationIssue,
  registry?: TagRegistry | null
): string {
  return buildFixHint(issue, { registry });
}

/** Message shown in Problems panel and squiggles — includes fix guidance. */
export function formatIssueForDiagnostic(
  issue: ValidationIssue,
  registry?: TagRegistry | null
): string {
  const fix = getFixHintForIssue(issue, registry);
  return `${issue.message}\n\nFix: ${fix}`;
}

export function issueWithFixHint(
  issue: ValidationIssue,
  registry?: TagRegistry | null,
  fixContext: FixContext = {}
): ValidationIssue & { fixHint: string; applicableFixes: ApplicableFix[] } {
  const context: FixContext = { ...fixContext, registry: registry ?? fixContext.registry };
  return {
    ...issue,
    fixHint: getFixHintForIssue(issue, registry),
    applicableFixes: getApplicableFixes(issue, registry, context),
  };
}
