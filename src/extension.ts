import * as vscode from 'vscode';
import { MesWikiViewProvider } from './mesWikiViewProvider';
import { registerSbcTagHoverProvider } from './sbcTagHoverProvider';
import { SbcValidatorService } from './sbcValidatorService';
import { WikiSyncService } from './wikiSync/wikiSyncService';
import {
  clearMesSourcePath,
  pickAndSaveMesSourcePath,
  showMesSourcePath,
} from './wikiSync/mesGithubSource';
import { runFirstRunSyncIfNeeded, runWikiSync } from './wikiSync/firstRunSync';
import { refreshDiscoveredHeaders } from './wikiSync/refreshDiscoveredHeaders';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new MesWikiViewProvider(context.extensionUri, context);
  const validator = new SbcValidatorService(context.extensionUri, provider);
  const wikiSync = new WikiSyncService(context.extensionUri);
  validator.register(context);
  registerSbcTagHoverProvider(context, () => validator.getValidationContext());
  void refreshDiscoveredHeaders(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(MesWikiViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    validator,
    vscode.commands.registerCommand('mesReference.open', () => provider.focus()),
    vscode.commands.registerCommand('mesReference.search', () => provider.openSearch()),
    vscode.commands.registerCommand('mesReference.showBookmarks', () => provider.showBookmarksPicker()),
    vscode.commands.registerCommand('mesReference.validateSbc', () => validator.validateActiveEditor()),
    vscode.commands.registerCommand('mesReference.validateMod', () => validator.validateModDataFolder()),
    vscode.commands.registerCommand('mesReference.syncWiki', () =>
      runWikiSync(wikiSync, provider, validator)
    ),
    vscode.commands.registerCommand('mesReference.setMesSourcePath', () => pickAndSaveMesSourcePath()),
    vscode.commands.registerCommand('mesReference.clearMesSourcePath', () => clearMesSourcePath()),
    vscode.commands.registerCommand('mesReference.showMesSourcePath', () => showMesSourcePath()),
    vscode.commands.registerCommand('mesReference.openIssueWiki', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const issues = await validator.validateDocument(editor.document);
      const firstWithWiki = issues.find((issue) => issue.wikiFile);
      if (firstWithWiki?.wikiFile) {
        await provider.openWikiPage(firstWithWiki.wikiFile);
      } else {
        await provider.focus();
      }
    })
  );

  void runFirstRunSyncIfNeeded(context, wikiSync, provider, validator);
}

export function deactivate(): void {}
