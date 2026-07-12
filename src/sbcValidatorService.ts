import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { buildModScopeContext, ModScopeContext } from './sbc/modProfileIndex';
import { describeReferenceScope, findModDataRoot, isPathUnderRoot } from './sbc/sbcModScope';
import { buildTagRegistry, TagRegistry } from './sbc/tagRegistry';
import { loadProfileTagIndex, ProfileTagIndex } from './sbc/profileTagIndex';
import { validateSbc, ValidationIssue } from './sbc/sbcValidator';
import { ModValidationReportPanel } from './modValidationReportPanel';
import { buildModValidationReport, ModValidationReport } from './sbc/modValidationReport';
import { formatIssueForDiagnostic } from './sbc/issueFixHints';
import { applyIssueFix, buildFixWorkspaceEdit, FixContext, getApplicableFixes } from './sbc/issueFixApplier';
import { SbcCodeActionProvider } from './sbcCodeActionProvider';
import { refreshDiscoveredHeaders } from './wikiSync/refreshDiscoveredHeaders';
import { MesWikiViewProvider } from './mesWikiViewProvider';

/** Mod definition .sbc files are small; world saves can be multi-GB and must not be read whole. */
const MAX_SBC_READ_BYTES = 50 * 1024 * 1024;

export class SbcValidatorService implements vscode.Disposable {
  private readonly diagnostics = vscode.languages.createDiagnosticCollection('mesReference');
  private registry?: TagRegistry;
  private profileTagIndex?: ProfileTagIndex | null;
  private registryPromise?: Promise<{ registry: TagRegistry; profileTagIndex: ProfileTagIndex | null }>;

  private validateTimer?: ReturnType<typeof setTimeout>;
  private readonly cascadingValidation = new Set<string>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly wikiProvider: MesWikiViewProvider
  ) {}

  register(context: vscode.ExtensionContext): void {
    const scheduleValidate = (document: vscode.TextDocument): void => {
      if (!this.isSbcDocument(document)) {
        return;
      }

      if (this.validateTimer) {
        clearTimeout(this.validateTimer);
      }

      this.validateTimer = setTimeout(() => {
        void this.validateDocument(document);
      }, 400);
    };

    context.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument((document) => {
        void this.validateDocument(document);
      }),
      vscode.workspace.onDidSaveTextDocument((document) => {
        void this.validateDocument(document);
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        scheduleValidate(event.document);
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          void this.validateDocument(editor.document);
        }
      })
    );

    for (const document of vscode.workspace.textDocuments) {
      void this.validateDocument(document);
    }

    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(
        { pattern: '**/*.sbc' },
        new SbcCodeActionProvider((doc) => this.getDocumentValidation(doc)),
        { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
      )
    );
  }

  dispose(): void {
    if (this.validateTimer) {
      clearTimeout(this.validateTimer);
    }
    this.diagnostics.dispose();
  }

  async validateDocument(
    document: vscode.TextDocument,
    options: { skipCascade?: boolean } = {}
  ): Promise<ValidationIssue[]> {
    if (!this.isSbcDocument(document)) {
      this.diagnostics.delete(document.uri);
      return [];
    }

    const { registry, profileTagIndex } = await this.getValidationContextInternal();
    const modScope = await this.collectModScope(document);
    const dataRoot = findModDataRoot(document.uri.fsPath);
    let issues = validateSbc(document.getText(), registry, {
      modScope,
      profileTagIndex,
    });

    if (!dataRoot) {
      issues = [createLimitedScopeIssue(modScope.scopeLabel), ...issues];
    }

    this.applyDiagnostics(document.uri, issues, registry);

    if (!options.skipCascade) {
      void this.revalidateSiblingOpenSbcFiles(document);
    }

    return issues;
  }

  async getDocumentValidation(
    document: vscode.TextDocument
  ): Promise<{ issues: ValidationIssue[]; registry: TagRegistry; fixContext: FixContext }> {
    const { registry, profileTagIndex } = await this.getValidationContextInternal();
    const modScope = await this.collectModScope(document);
    const issues = validateSbc(document.getText(), registry, {
      modScope,
      profileTagIndex,
    });
    const fixContext = await this.buildFixContext(document);
    return { issues, registry, fixContext };
  }

  async buildFixContext(document: vscode.TextDocument): Promise<FixContext> {
    const { registry } = await this.getValidationContextInternal();
    const filePath = document.uri.fsPath;
    const dataRoot = findModDataRoot(filePath);
    const modSources = await this.loadModSourcesMap(dataRoot, filePath, document.getText());
    return { registry, modSources, dataRoot };
  }

  async applyIssueFix(
    filePath: string,
    issue: ValidationIssue,
    fixId: string
  ): Promise<boolean> {
    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    const fixContext = await this.buildFixContext(document);
    const applied = await applyIssueFix(filePath, issue, fixId, fixContext);
    if (applied) {
      await this.validateDocument(document);
    }
    return applied;
  }

  async validateActiveEditor(): Promise<ValidationIssue[]> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showWarningMessage('No active editor to validate.');
      return [];
    }

    if (!this.isSbcDocument(editor.document)) {
      void vscode.window.showWarningMessage('Active file is not an .sbc file.');
      return [];
    }

    const issues = await this.validateDocument(editor.document);
    this.showSummary(editor.document.fileName, issues);
    return issues;
  }

  async validateModDataFolder(): Promise<ModValidationReport | null> {
    const dataRoot = await this.resolveModDataRoot();
    if (!dataRoot) {
      void vscode.window.showWarningMessage(
        'Could not find a mod Data folder. Open an .sbc under Mods/YourMod/Data, open the mod workspace, or pick the Data folder.'
      );
      return null;
    }

    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'MES Reference: Validating mod',
        cancellable: false,
      },
      async () => {
        try {
          return await this.runModValidation(dataRoot);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          void vscode.window.showErrorMessage(`MES mod validation failed: ${message}`);
          return null;
        }
      }
    );
  }

  private async runModValidation(dataRoot: string): Promise<ModValidationReport> {
    const { registry, profileTagIndex } = await this.getValidationContextInternal();
    const { filePaths, fileContents, openFileCount, skippedOversizedFiles } =
      await this.loadModSbcSources(dataRoot);

    if (filePaths.length === 0) {
      void vscode.window.showWarningMessage(
        `MES mod validation: no .sbc files found under ${dataRoot}.`
      );
    }

    const report = await buildModValidationReport(
      dataRoot,
      filePaths,
      fileContents,
      registry,
      profileTagIndex,
      openFileCount,
      skippedOversizedFiles,
      await this.getExtensionVersion()
    );

    for (const file of report.filesWithIssues) {
      this.applyDiagnostics(vscode.Uri.file(file.filePath), file.issues, registry);
    }

    for (const filePath of filePaths) {
      if (!report.filesWithIssues.some((file) => file.filePath === filePath)) {
        this.diagnostics.delete(vscode.Uri.file(filePath));
      }
    }

    for (const document of vscode.workspace.textDocuments) {
      if (this.isSbcDocument(document) && isPathUnderRoot(document.uri.fsPath, dataRoot)) {
        await this.validateDocument(document, { skipCascade: true });
      }
    }

    ModValidationReportPanel.show(this.extensionUri, report, this.wikiProvider, this);

    const summary =
      report.errorCount === 0 && report.warningCount === 0
        ? `MES mod validation: ${report.modName} — all ${report.scannedFileCount} .sbc file(s) passed. Open the "MES Mod Validation" tab if you do not see the report.`
        : `MES mod validation: ${report.modName} — ${report.errorCount} error(s), ${report.warningCount} warning(s) in ${report.filesWithIssues.length} file(s). Open the "MES Mod Validation" tab for details.`;

    if (report.errorCount > 0 || report.warningCount > 0) {
      void vscode.window.showWarningMessage(summary, 'Show Report').then((choice) => {
        if (choice === 'Show Report') {
          ModValidationReportPanel.show(this.extensionUri, report, this.wikiProvider, this);
        }
      });
    } else {
      void vscode.window.showInformationMessage(summary);
    }

    return report;
  }

  private async resolveModDataRoot(): Promise<string | null> {
    const editor = vscode.window.activeTextEditor;
    if (editor && this.isSbcDocument(editor.document)) {
      const root = findModDataRoot(editor.document.uri.fsPath);
      if (root) {
        return root;
      }
    }

    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const dataPath = path.join(folder.uri.fsPath, 'Data');
      try {
        const stat = await fs.stat(dataPath);
        if (stat.isDirectory()) {
          return dataPath;
        }
      } catch {
        // Try next workspace folder.
      }
    }

    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Select mod Data folder',
      title: 'Select Space Engineers mod Data folder',
    });

    return picked?.[0]?.fsPath ?? null;
  }

  private async loadModSourcesMap(
    dataRoot: string | null,
    currentFilePath: string,
    currentFileText: string
  ): Promise<Map<string, string>> {
    const sources = new Map<string, string>();

    if (dataRoot) {
      const { filePaths, fileContents } = await this.loadModSbcSources(dataRoot);
      for (const filePathEntry of filePaths) {
        const content = fileContents.get(filePathEntry);
        if (content) {
          sources.set(this.sourceLabelForFile(filePathEntry, dataRoot), content);
        }
      }
      return sources;
    }

    const scanRoot = path.dirname(currentFilePath);
    const openPaths = new Set<string>();

    for (const openDoc of vscode.workspace.textDocuments) {
      if (!this.isSbcDocument(openDoc)) {
        continue;
      }

      const openPath = openDoc.uri.fsPath;
      if (path.dirname(openPath) !== scanRoot) {
        continue;
      }

      openPaths.add(openPath.toLowerCase());
      sources.set(this.sourceLabelForFile(openPath, null), openDoc.getText());
    }

    const sbcFiles = await this.findSbcFiles(scanRoot, false);
    for (const diskPath of sbcFiles) {
      if (openPaths.has(diskPath.toLowerCase())) {
        continue;
      }
      sources.set(this.sourceLabelForFile(diskPath, null), await this.readSbcFromDiskOrEmpty(diskPath));
    }

    if (!sources.has(this.sourceLabelForFile(currentFilePath, null))) {
      sources.set(this.sourceLabelForFile(currentFilePath, null), currentFileText);
    }

    return sources;
  }

  private async loadModSbcSources(dataRoot: string): Promise<{
    filePaths: string[];
    fileContents: Map<string, string>;
    openFileCount: number;
    skippedOversizedFiles: Array<{ relativePath: string; sizeLabel: string }>;
  }> {
    const filePaths = await this.findSbcFiles(dataRoot, true);
    const fileContents = new Map<string, string>();
    const skippedOversizedFiles: Array<{ relativePath: string; sizeLabel: string }> = [];
    const openPaths = new Set<string>();
    let openFileCount = 0;

    for (const document of vscode.workspace.textDocuments) {
      if (!this.isSbcDocument(document)) {
        continue;
      }

      const openPath = document.uri.fsPath;
      if (!isPathUnderRoot(openPath, dataRoot)) {
        continue;
      }

      openPaths.add(openPath.toLowerCase());
      openFileCount++;
      fileContents.set(openPath, document.getText());
    }

    for (const filePath of filePaths) {
      if (openPaths.has(filePath.toLowerCase())) {
        continue;
      }

      const read = await this.readSbcFromDisk(filePath);
      if (read.oversizedBytes !== undefined) {
        skippedOversizedFiles.push({
          relativePath: path.relative(dataRoot, filePath) || path.basename(filePath),
          sizeLabel: formatSbcByteSize(read.oversizedBytes),
        });
        continue;
      }

      if (read.content !== undefined) {
        fileContents.set(filePath, read.content);
      }
    }

    skippedOversizedFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    return { filePaths, fileContents, openFileCount, skippedOversizedFiles };
  }

  private async getExtensionVersion(): Promise<string> {
    try {
      const raw = await fs.readFile(path.join(this.extensionUri.fsPath, 'package.json'), 'utf8');
      return JSON.parse(raw).version ?? 'unknown';
    } catch {
      return 'unknown';
    }
  }

  invalidateRegistry(): void {
    this.registry = undefined;
    this.profileTagIndex = undefined;
    this.registryPromise = undefined;
  }

  async revalidateOpenSbcFiles(): Promise<void> {
    for (const document of vscode.workspace.textDocuments) {
      if (this.isSbcDocument(document)) {
        await this.validateDocument(document);
      }
    }
  }

  getValidationContext(): Promise<{
    registry: TagRegistry;
    profileTagIndex: ProfileTagIndex | null;
  }> {
    return this.getValidationContextInternal();
  }

  private async getValidationContextInternal(): Promise<{
    registry: TagRegistry;
    profileTagIndex: ProfileTagIndex | null;
  }> {
    if (this.registry) {
      return {
        registry: this.registry,
        profileTagIndex: this.profileTagIndex ?? null,
      };
    }

    if (!this.registryPromise) {
      this.registryPromise = refreshDiscoveredHeaders(this.extensionUri).then(async () => {
        const [registry, profileTagIndex] = await Promise.all([
          buildTagRegistry(this.extensionUri),
          loadProfileTagIndex(this.extensionUri),
        ]);
        this.registry = registry;
        this.profileTagIndex = profileTagIndex;
        return { registry, profileTagIndex };
      });
    }

    return this.registryPromise;
  }

  private applyDiagnostics(
    uri: vscode.Uri,
    issues: ValidationIssue[],
    registry?: TagRegistry | null
  ): void {
    const diagnostics = issues.map((issue) => {
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(issue.line, issue.column, issue.line, issue.endColumn),
        formatIssueForDiagnostic(issue, registry),
        toDiagnosticSeverity(issue.severity)
      );
      diagnostic.code = issue.code;
      diagnostic.source = 'MES Reference';
      (diagnostic as vscode.Diagnostic & { wikiFile?: string }).wikiFile = issue.wikiFile;
      return diagnostic;
    });

    this.diagnostics.set(uri, diagnostics);
  }

  private showSummary(fileName: string, issues: ValidationIssue[]): void {
    const errors = issues.filter((i) => i.severity === 'error').length;
    const warnings = issues.filter((i) => i.severity === 'warning').length;
    const info = issues.filter((i) => i.severity === 'information').length;

    if (issues.length === 0) {
      void vscode.window.showInformationMessage(`MES validate: ${fileName} — no issues found.`);
      return;
    }

    void vscode.window.showWarningMessage(
      `MES validate: ${fileName} — ${errors} error(s), ${warnings} warning(s), ${info} info.`,
      'Open Wiki'
    ).then((choice) => {
      if (choice === 'Open Wiki') {
        void vscode.commands.executeCommand('mesReference.openIssueWiki');
      }
    });
  }

  private isSbcDocument(document: vscode.TextDocument): boolean {
    return document.fileName.toLowerCase().endsWith('.sbc');
  }

  private async revalidateSiblingOpenSbcFiles(document: vscode.TextDocument): Promise<void> {
    const dataRoot = findModDataRoot(document.uri.fsPath);
    const scanRoot = dataRoot ?? path.dirname(document.uri.fsPath);
    const currentKey = document.uri.toString();

    for (const openDoc of vscode.workspace.textDocuments) {
      if (!this.isSbcDocument(openDoc) || openDoc.uri.toString() === currentKey) {
        continue;
      }

      const openPath = openDoc.uri.fsPath;
      if (dataRoot) {
        if (!isPathUnderRoot(openPath, dataRoot)) {
          continue;
        }
      } else if (path.dirname(openPath) !== scanRoot) {
        continue;
      }

      const siblingKey = openDoc.uri.toString();
      if (this.cascadingValidation.has(siblingKey)) {
        continue;
      }

      this.cascadingValidation.add(siblingKey);
      try {
        await this.validateDocument(openDoc, { skipCascade: true });
      } finally {
        this.cascadingValidation.delete(siblingKey);
      }
    }
  }

  private async collectModScope(document: vscode.TextDocument): Promise<ModScopeContext> {
    const filePath = document.uri.fsPath;
    const dataRoot = findModDataRoot(filePath);
    const scanRoot = dataRoot ?? path.dirname(filePath);

    if (dataRoot) {
      const { filePaths, fileContents, openFileCount } = await this.loadModSbcSources(dataRoot);
      const sources = new Map<string, string>();
      for (const filePathEntry of filePaths) {
        const content = fileContents.get(filePathEntry);
        if (content) {
          sources.set(this.sourceLabelForFile(filePathEntry, dataRoot), content);
        }
      }
      return buildModScopeContext(
        sources,
        describeReferenceScope(dataRoot),
        openFileCount,
        filePaths.length - openFileCount
      );
    }

    const sources = new Map<string, string>();
    let openFileCount = 0;
    const openPaths = new Set<string>();

    for (const openDoc of vscode.workspace.textDocuments) {
      if (!this.isSbcDocument(openDoc)) {
        continue;
      }

      const openPath = openDoc.uri.fsPath;
      if (path.dirname(openPath) !== scanRoot) {
        continue;
      }

      openPaths.add(openPath.toLowerCase());
      openFileCount++;
      sources.set(this.sourceLabelForFile(openPath, null), openDoc.getText());
    }

    let diskFileCount = 0;
    const sbcFiles = await this.findSbcFiles(scanRoot, false);
    for (const diskPath of sbcFiles) {
      if (openPaths.has(diskPath.toLowerCase())) {
        continue;
      }
      sources.set(this.sourceLabelForFile(diskPath, null), await this.readSbcFromDiskOrEmpty(diskPath));
      diskFileCount++;
    }

    return buildModScopeContext(sources, describeReferenceScope(null), openFileCount, diskFileCount);
  }

  private sourceLabelForFile(filePath: string, dataRoot: string | null): string {
    if (dataRoot) {
      const relative = path.relative(dataRoot, filePath);
      return relative || path.basename(filePath);
    }

    return path.basename(filePath);
  }

  private async findSbcFiles(root: string, recursive: boolean): Promise<string[]> {
    const files: string[] = [];

    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (recursive) {
            await walk(fullPath);
          }
          continue;
        }

        if (entry.isFile() && entry.name.toLowerCase().endsWith('.sbc')) {
          files.push(fullPath);
        }
      }
    };

    await walk(root);
    return files;
  }

  private async readSbcFromDisk(
    filePath: string
  ): Promise<{ content?: string; oversizedBytes?: number }> {
    const stat = await fs.stat(filePath);
    if (stat.size > MAX_SBC_READ_BYTES) {
      return { oversizedBytes: stat.size };
    }

    return { content: await fs.readFile(filePath, 'utf8') };
  }

  private async readSbcFromDiskOrEmpty(filePath: string): Promise<string> {
    const read = await this.readSbcFromDisk(filePath);
    return read.content ?? '';
  }
}

function createLimitedScopeIssue(scopeLabel: string): ValidationIssue {
  return {
    line: 0,
    column: 0,
    endColumn: 1,
    severity: 'information',
    code: 'mes-limited-scope',
    message: `Reference scope: ${scopeLabel}. Open a file under your mod Data folder for full mod validation.`,
  };
}

function toDiagnosticSeverity(severity: ValidationIssue['severity']): vscode.DiagnosticSeverity {
  switch (severity) {
    case 'error':
      return vscode.DiagnosticSeverity.Error;
    case 'warning':
      return vscode.DiagnosticSeverity.Warning;
    default:
      return vscode.DiagnosticSeverity.Information;
  }
}

function formatSbcByteSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
}
