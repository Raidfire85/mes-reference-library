import * as vscode from 'vscode';
import {
  buildFixEdits,
  buildFixWorkspaceEdit,
  FixContext,
  getApplicableFixes,
} from './sbc/issueFixApplier';
import { ValidationIssue } from './sbc/sbcValidator';
import { TagRegistry } from './sbc/tagRegistry';

export type DocumentValidationProvider = (
  document: vscode.TextDocument
) => Promise<{ issues: ValidationIssue[]; registry: TagRegistry; fixContext: FixContext }>;

export class SbcCodeActionProvider implements vscode.CodeActionProvider {
  constructor(private readonly getDocumentValidation: DocumentValidationProvider) {}

  async provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext
  ): Promise<vscode.CodeAction[]> {
    const mesDiagnostics = context.diagnostics.filter((d) => d.source === 'MES Reference');
    if (mesDiagnostics.length === 0) {
      return [];
    }

    const { issues, registry, fixContext } = await this.getDocumentValidation(document);
    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of mesDiagnostics) {
      const issue = findIssueForDiagnostic(issues, diagnostic);
      if (!issue) {
        continue;
      }

      for (const fix of getApplicableFixes(issue, registry, fixContext)) {
        const workspaceEdit = buildFixWorkspaceEdit(
          issue,
          fix.id,
          document.uri.fsPath,
          document.getText(),
          fixContext
        );
        const singleFileEdits = buildFixEdits(issue, fix.id, document, registry, fixContext);
        if (!workspaceEdit && !singleFileEdits?.length) {
          continue;
        }

        const action = new vscode.CodeAction(fix.title, vscode.CodeActionKind.QuickFix);
        action.edit =
          workspaceEdit ??
          (() => {
            const edit = new vscode.WorkspaceEdit();
            edit.set(document.uri, singleFileEdits!);
            return edit;
          })();
        action.diagnostics = [diagnostic];
        action.isPreferred = fix.isPreferred ?? fix.confidence === 'high';
        actions.push(action);
      }
    }

    return actions;
  }
}

function findIssueForDiagnostic(
  issues: ValidationIssue[],
  diagnostic: vscode.Diagnostic
): ValidationIssue | undefined {
  const line = diagnostic.range.start.line;
  const code = typeof diagnostic.code === 'object' ? diagnostic.code.value : diagnostic.code;

  const onLine = issues.filter((i) => i.line === line);
  if (onLine.length === 0) {
    return undefined;
  }

  if (onLine.length === 1) {
    return onLine[0];
  }

  const byCode = onLine.filter((i) => i.code === code);
  if (byCode.length === 1) {
    return byCode[0];
  }

  const tagMatch = diagnostic.message.match(/\[([^\]]+)\]/);
  if (tagMatch) {
    const tagName = tagMatch[1].split(':')[0];
    const byTag = onLine.filter((i) => i.tagName === tagName);
    if (byTag.length === 1) {
      return byTag[0];
    }
  }

  return onLine.find((i) => diagnostic.range.start.character >= i.column) ?? onLine[0];
}
