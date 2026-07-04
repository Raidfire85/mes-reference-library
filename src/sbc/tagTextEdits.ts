import { ValidationIssue } from './sbcValidator';
import { fullLineRange, PlainTextEdit, positionAt } from './textEdits';

export function formatTagLine(tagName: string, tagValue: string): string {
  return `[${tagName}:${tagValue}]`;
}

export function buildRemoveTagEditsFromText(
  text: string,
  issue: ValidationIssue
): PlainTextEdit[] | null {
  const lines = text.split(/\r?\n/);
  const line = issue.line;
  if (line < 0 || line >= lines.length) {
    return null;
  }

  const lineText = lines[line];
  const tagPattern = issue.tagName
    ? new RegExp(`\\[${escapeRegExp(issue.tagName)}:[^\\]]*\\]`)
    : null;

  if (tagPattern && tagPattern.test(lineText)) {
    const trimmed = lineText.replace(tagPattern, '').trimEnd();
    if (trimmed.length === 0 || trimmed === '//') {
      const range = fullLineRange(text, line);
      return range ? [{ range, newText: '' }] : null;
    }

    const start = positionAt(text, line, 0);
    const end = positionAt(text, line, lineText.length);
    return [{ range: { start, end }, newText: trimmed }];
  }

  if (issue.column >= 0 && issue.endColumn > issue.column) {
    const start = positionAt(text, line, issue.column);
    const end = positionAt(text, line, issue.endColumn);
    return [{ range: { start, end }, newText: '' }];
  }

  const range = fullLineRange(text, line);
  return range ? [{ range, newText: '' }] : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
