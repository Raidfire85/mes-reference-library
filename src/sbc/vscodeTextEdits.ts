import * as vscode from 'vscode';
import { PlainTextEdit } from './textEdits';

export function toVscodeTextEdit(edit: PlainTextEdit): vscode.TextEdit {
  return new vscode.TextEdit(
    new vscode.Range(
      new vscode.Position(edit.range.start.line, edit.range.start.character),
      new vscode.Position(edit.range.end.line, edit.range.end.character)
    ),
    edit.newText
  );
}

export function toVscodeWorkspaceEdit(editsByFile: Map<string, PlainTextEdit[]>): vscode.WorkspaceEdit {
  const workspaceEdit = new vscode.WorkspaceEdit();
  for (const [filePath, edits] of editsByFile) {
    workspaceEdit.set(vscode.Uri.file(filePath), edits.map(toVscodeTextEdit));
  }
  return workspaceEdit;
}
