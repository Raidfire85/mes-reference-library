import * as vscode from 'vscode';
import { ModValidationReport } from './sbc/modValidationReport';
import { ValidationIssue } from './sbc/sbcValidator';
import { MesWikiViewProvider } from './mesWikiViewProvider';

export interface IssueFixHandler {
  applyIssueFix(filePath: string, issue: ValidationIssue, fixId: string): Promise<boolean>;
}

export class ModValidationReportPanel implements vscode.Disposable {
  public static readonly viewType = 'mesReference.modValidationReport';
  private static currentPanel?: ModValidationReportPanel;

  private readonly panel: vscode.WebviewPanel;
  private readonly wikiProvider: MesWikiViewProvider;
  private readonly fixHandler?: IssueFixHandler;

  private constructor(
    extensionUri: vscode.Uri,
    report: ModValidationReport,
    wikiProvider: MesWikiViewProvider,
    fixHandler?: IssueFixHandler
  ) {
    this.wikiProvider = wikiProvider;
    this.fixHandler = fixHandler;
    this.panel = vscode.window.createWebviewPanel(
      ModValidationReportPanel.viewType,
      'MES Mod Validation',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    this.panel.iconPath = {
      light: vscode.Uri.joinPath(extensionUri, 'media', 'activitybar.svg'),
      dark: vscode.Uri.joinPath(extensionUri, 'media', 'activitybar.svg'),
    };
    this.panel.webview.html = this.renderHtml(report);
    this.panel.webview.onDidReceiveMessage((message: { type: string; filePath?: string; line?: number; column?: number; wikiFile?: string }) => {
      void this.handleMessage(message);
    });
    this.panel.onDidDispose(() => {
      ModValidationReportPanel.currentPanel = undefined;
    });
  }

  static show(
    extensionUri: vscode.Uri,
    report: ModValidationReport,
    wikiProvider: MesWikiViewProvider,
    fixHandler?: IssueFixHandler
  ): ModValidationReportPanel {
    if (ModValidationReportPanel.currentPanel) {
      ModValidationReportPanel.currentPanel.panel.webview.html =
        ModValidationReportPanel.currentPanel.renderHtml(report);
      ModValidationReportPanel.currentPanel.panel.reveal(vscode.ViewColumn.Beside);
      return ModValidationReportPanel.currentPanel;
    }

    ModValidationReportPanel.currentPanel = new ModValidationReportPanel(
      extensionUri,
      report,
      wikiProvider,
      fixHandler
    );
    return ModValidationReportPanel.currentPanel;
  }

  dispose(): void {
    this.panel.dispose();
  }

  private async handleMessage(message: {
    type: string;
    filePath?: string;
    line?: number;
    column?: number;
    wikiFile?: string;
    fixId?: string;
    issue?: ValidationIssue;
  }): Promise<void> {
    if (message.type === 'openLocation' && message.filePath) {
      const uri = vscode.Uri.file(message.filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc, { preview: false });
      const line = Math.max(0, message.line ?? 0);
      const column = Math.max(0, message.column ?? 0);
      const position = new vscode.Position(line, column);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
      return;
    }

    if (message.type === 'openWiki' && message.wikiFile) {
      await this.wikiProvider.openWikiPage(message.wikiFile);
      return;
    }

    if (
      message.type === 'applyFix' &&
      message.filePath &&
      message.fixId &&
      message.issue &&
      this.fixHandler
    ) {
      const applied = await this.fixHandler.applyIssueFix(
        message.filePath,
        message.issue,
        message.fixId
      );
      if (applied) {
        void vscode.window.showInformationMessage('MES fix applied.');
      } else {
        void vscode.window.showWarningMessage(
          'Could not apply fix — the file may have changed since the report was generated.'
        );
      }
    }
  }

  private renderHtml(report: ModValidationReport): string {
    const generated = new Date(report.generatedAt).toLocaleString();
    const hasIssues = report.errorCount > 0 || report.warningCount > 0;

    const validatedFileCount = report.scannedFileCount - report.skippedNonMesFileCount;
    const summaryClass = hasIssues ? 'summary-warn' : 'summary-ok';
    const summaryText = hasIssues
      ? `${report.errorCount} error(s), ${report.warningCount} warning(s) across ${report.filesWithIssues.length} MES profile file(s).`
      : `All ${validatedFileCount} MES profile .sbc file(s) passed validation.`;

    const skippedSection =
      report.skippedNonMesFileCount === 0
        ? ''
        : `<section class="section skipped-section">
        <h2>Skipped non-MES .sbc files (${report.skippedNonMesFileCount})</h2>
        <p class="lead">Vanilla Space Engineers definition files (from game Data: spawn groups, AI behaviors, cube blocks, prefabs, etc.) — skipped unless they contain MES profile headers or tags. Audio, container, and prefab SubtypeIds are still indexed for cross-reference checks.</p>
        <ul class="category-list">${report.skippedNonMesByCategory
          .map((category) => {
            const indexed =
              category.indexedSubtypeCount > 0
                ? ` · ${category.indexedSubtypeCount} SubtypeId(s) indexed`
                : '';
            const fileLabel = category.fileCount === 1 ? '1 file' : `${category.fileCount} files`;
            return `<li><span class="category-name">${escapeHtml(category.kindLabel)}</span> <span class="category-meta">${fileLabel}${indexed}</span></li>`;
          })
          .join('')}</ul>
      </section>`;

    const duplicateSection =
      report.crossFileDuplicates.length === 0
        ? ''
        : `<section class="section">
        <h2>Duplicate SubtypeIds across mod</h2>
        <p class="lead">These SubtypeIds are defined in more than one .sbc file. MES requires unique profile ids per mod.</p>
        ${report.crossFileDuplicates
          .map(
            (dup) => `<div class="dup-card">
              <div class="dup-id">${escapeHtml(dup.subtypeId)}</div>
              <ul>${dup.locations
                .map(
                  (loc) =>
                    `<li><button class="link" data-open="${escapeAttr(loc.filePath)}" data-line="${loc.line}">${escapeHtml(loc.relativePath)}:${loc.line + 1}</button></li>`
                )
                .join('')}</ul>
            </div>`
          )
          .join('')}
      </section>`;

    const fileSections = report.filesWithIssues
      .map((file) => {
        const errors = file.issues.filter((issue) => issue.severity === 'error').length;
        const warnings = file.issues.filter((issue) => issue.severity === 'warning').length;
        const issuesHtml = file.issues
          .map((issue) => {
            const badgeClass =
              issue.severity === 'error'
                ? 'badge-error'
                : issue.severity === 'warning'
                  ? 'badge-warn'
                  : 'badge-info';
            const profileLabel =
              issue.profileHeader && issue.subtypeId
                ? `${issue.profileHeader} · ${issue.subtypeId}`
                : issue.profileHeader ?? (issue.subtypeId ? issue.subtypeId : '');
            const fixButtons =
              issue.applicableFixes?.length && this.fixHandler
                ? issue.applicableFixes
                    .map(
                      (fix) =>
                        `<button class="apply-btn" title="${escapeAttr(fix.description ?? '')}" data-apply="${escapeAttr(fix.id)}" data-file="${escapeAttr(file.filePath)}" data-issue="${escapeAttr(JSON.stringify(issue))}">${escapeHtml(fix.title)}</button>`
                    )
                    .join('')
                : '';
            return `<article class="issue ${badgeClass}">
              <div class="issue-head">
                <span class="badge ${badgeClass}">${issue.severity}</span>
                <span class="loc">Line ${issue.line + 1}</span>
                ${profileLabel ? `<span class="profile">${escapeHtml(profileLabel)}</span>` : ''}
                <button class="open-btn" data-open="${escapeAttr(file.filePath)}" data-line="${issue.line}" data-column="${issue.column}">Open</button>
                ${issue.wikiFile ? `<button class="wiki-btn" data-wiki="${escapeAttr(issue.wikiFile)}">Wiki</button>` : ''}
              </div>
              <p class="msg">${escapeHtml(issue.message)}</p>
              <p class="fix"><strong>Fix:</strong> ${escapeHtml(issue.fixHint)}</p>
              ${fixButtons ? `<div class="fix-actions">${fixButtons}</div>` : ''}
            </article>`;
          })
          .join('');

        return `<section class="file-section">
          <h3>${escapeHtml(file.relativePath)} <span class="counts">${errors} error(s), ${warnings} warning(s)</span></h3>
          ${issuesHtml}
        </section>`;
      })
      .join('');

    const cleanNote =
      report.cleanFileCount > 0
        ? `<p class="clean-note">${report.cleanFileCount} other MES profile .sbc file(s) had no issues.</p>`
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MES Mod Validation</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #d4d4d4);
      --muted: var(--vscode-descriptionForeground, #9da5b4);
      --border: var(--vscode-panel-border, #3c3c3c);
      --accent: var(--vscode-textLink-foreground, #3794ff);
      --ok: #3fb950;
      --warn: #d29922;
      --err: #f85149;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 20px 24px 40px;
      font: 13px/1.5 var(--vscode-font-family, Segoe UI, sans-serif);
      color: var(--fg);
      background: var(--bg);
    }
    h1 { margin: 0 0 6px; font-size: 20px; }
    h2 { margin: 28px 0 10px; font-size: 16px; }
    h3 { margin: 0 0 12px; font-size: 14px; }
    .meta { color: var(--muted); margin-bottom: 16px; }
    .summary {
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px 16px;
      margin-bottom: 20px;
    }
    .summary-ok { border-color: color-mix(in srgb, var(--ok) 50%, var(--border)); }
    .summary-warn { border-color: color-mix(in srgb, var(--warn) 50%, var(--border)); }
    .stats { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 8px; color: var(--muted); }
    .lead { color: var(--muted); margin-top: 0; }
    .file-section, .section {
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px 16px;
      margin-bottom: 16px;
    }
    .counts { color: var(--muted); font-weight: normal; font-size: 12px; }
    .issue {
      border-left: 3px solid var(--border);
      padding: 10px 12px;
      margin-bottom: 10px;
      background: color-mix(in srgb, var(--fg) 4%, transparent);
      border-radius: 0 6px 6px 0;
    }
    .issue.badge-error { border-left-color: var(--err); }
    .issue.badge-warn { border-left-color: var(--warn); }
    .issue-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
    .badge {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 600;
    }
    .badge-error { background: color-mix(in srgb, var(--err) 20%, transparent); color: var(--err); }
    .badge-warn { background: color-mix(in srgb, var(--warn) 20%, transparent); color: var(--warn); }
    .loc { color: var(--muted); font-size: 12px; }
    .profile { color: var(--accent); font-size: 12px; font-weight: 600; }
    .msg { margin: 0 0 6px; }
    .fix { margin: 0; color: var(--muted); }
    .fix-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .apply-btn { border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); font-size: 12px; }
    .clean-note { color: var(--muted); }
    .category-list { margin: 8px 0 0; padding-left: 0; list-style: none; }
    .category-list li { padding: 4px 0; display: flex; gap: 8px; flex-wrap: wrap; }
    .category-name { font-weight: 600; min-width: 9rem; }
    .category-meta { color: var(--muted); font-size: 12px; }
    button {
      font: inherit;
      cursor: pointer;
      border: 1px solid var(--border);
      background: color-mix(in srgb, var(--fg) 6%, transparent);
      color: var(--fg);
      border-radius: 4px;
      padding: 2px 8px;
    }
    button:hover { border-color: var(--accent); color: var(--accent); }
    .link { border: none; background: none; padding: 0; color: var(--accent); text-decoration: underline; }
    .dup-card { margin-bottom: 10px; }
    .dup-id { font-weight: 600; margin-bottom: 4px; }
    ul { margin: 0; padding-left: 18px; }
  </style>
</head>
<body>
  <h1>MES Mod Validation Report</h1>
  <p class="meta">${escapeHtml(report.modName)} · ${escapeHtml(report.scopeLabel)} · ${generated}</p>
  <div class="summary ${summaryClass}">
    <strong>${summaryText}</strong>
    <div class="stats">
      <span>${report.scannedFileCount} .sbc files scanned</span>
      <span>${validatedFileCount} MES profile file(s) validated</span>
      <span>${report.profileCount} MES profiles found</span>
      ${report.skippedNonMesFileCount > 0 ? `<span>${report.skippedNonMesFileCount} non-MES file(s) skipped</span>` : ''}
      <span>Data: ${escapeHtml(report.dataRoot)}</span>
    </div>
  </div>
  ${cleanNote}
  ${skippedSection}
  ${duplicateSection}
  ${hasIssues ? fileSections : `<p>No tag, reference, or profile issues found in MES profile files.${report.skippedNonMesFileCount > 0 ? ` ${report.skippedNonMesFileCount} non-MES .sbc file(s) skipped (see categories above).` : ''}</p>`}
  <script>
    const vscode = acquireVsCodeApi();
    document.body.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const openPath = target.getAttribute('data-open');
      if (openPath) {
        vscode.postMessage({
          type: 'openLocation',
          filePath: openPath,
          line: Number(target.getAttribute('data-line') || 0),
          column: Number(target.getAttribute('data-column') || 0),
        });
        return;
      }
      const wikiFile = target.getAttribute('data-wiki');
      if (wikiFile) {
        vscode.postMessage({ type: 'openWiki', wikiFile });
        return;
      }
      const applyFixId = target.getAttribute('data-apply');
      const applyFile = target.getAttribute('data-file');
      const issueJson = target.getAttribute('data-issue');
      if (applyFixId && applyFile && issueJson) {
        try {
          vscode.postMessage({
            type: 'applyFix',
            fixId: applyFixId,
            filePath: applyFile,
            issue: JSON.parse(issueJson),
          });
        } catch (err) {
          console.error('Invalid issue payload', err);
        }
      }
    });
  </script>
</body>
</html>`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;');
}
