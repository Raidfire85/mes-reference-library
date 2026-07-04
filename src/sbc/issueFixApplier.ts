/**
 * VS Code adapters for one-click fixes. Core logic lives in issueFixLogic.ts (no vscode dependency).
 */
import * as vscode from 'vscode';
import { buildFixEditsByFile, getApplicableFixes } from './issueFixLogic';
import { ApplicableFix, FixContext } from './issueFixTypes';
import { ValidationIssue } from './sbcValidator';
import { TagRegistry } from './tagRegistry';
import { toVscodeTextEdit, toVscodeWorkspaceEdit } from './vscodeTextEdits';

export type { ApplicableFix, FixContext, FixConfidence } from './issueFixTypes';
export { getApplicableFixes } from './issueFixLogic';

export function buildFixEdits(
  issue: ValidationIssue,
  fixId: string,
  document: vscode.TextDocument,
  registry?: TagRegistry | null,
  context: FixContext = {}
): vscode.TextEdit[] | null {
  const editsByFile = buildFixEditsByFile(
    issue,
    fixId,
    document.uri.fsPath,
    document.getText(),
    { ...context, registry: registry ?? context.registry }
  );
  if (!editsByFile) {
    return null;
  }

  const edits = editsByFile.get(document.uri.fsPath);
  return edits?.map(toVscodeTextEdit) ?? null;
}

export function buildFixWorkspaceEdit(
  issue: ValidationIssue,
  fixId: string,
  sourceFilePath: string,
  sourceText: string,
  context: FixContext = {}
): vscode.WorkspaceEdit | null {
  const editsByFile = buildFixEditsByFile(issue, fixId, sourceFilePath, sourceText, context);
  return editsByFile ? toVscodeWorkspaceEdit(editsByFile) : null;
}

export async function applyIssueFix(
  filePath: string,
  issue: ValidationIssue,
  fixId: string,
  context: FixContext = {}
): Promise<boolean> {
  const uri = vscode.Uri.file(filePath);
  const document = await vscode.workspace.openTextDocument(uri);
  const workspaceEdit = buildFixWorkspaceEdit(
    issue,
    fixId,
    filePath,
    document.getText(),
    context
  );
  if (!workspaceEdit) {
    return false;
  }

  const applied = await vscode.workspace.applyEdit(workspaceEdit);
  if (applied) {
    const editor = await vscode.window.showTextDocument(document, { preview: false });
    const position = new vscode.Position(issue.line, issue.column);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
  }
  return applied;
}
