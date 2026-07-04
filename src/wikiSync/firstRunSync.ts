import * as vscode from 'vscode';
import { MesWikiViewProvider } from '../mesWikiViewProvider';
import { SbcValidatorService } from '../sbcValidatorService';
import { WikiSyncService } from './wikiSyncService';

const FIRST_RUN_SYNC_KEY = 'mesReference.firstRunSyncCompleted';

export interface WikiSyncRunnerOptions {
  allowUserPrompt?: boolean;
  progressTitle?: string;
  /** Suppress "already up to date" and other low-value success toasts. */
  quietSuccess?: boolean;
  /** Suppress error toast; caller handles failure messaging (first-run sync). */
  quietFailure?: boolean;
}

export async function runWikiSync(
  wikiSync: WikiSyncService,
  provider: MesWikiViewProvider,
  validator: SbcValidatorService,
  options?: WikiSyncRunnerOptions
): Promise<void> {
  const progressTitle = options?.progressTitle ?? 'MES Reference: Syncing wiki from GitHub';

  try {
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: progressTitle,
        cancellable: true,
      },
      async (progress, token) =>
        wikiSync.syncFromMesSource(progress, token, {
          acquireSource: { allowUserPrompt: options?.allowUserPrompt !== false },
        })
    );

    provider.invalidateSearchIndex();
    validator.invalidateRegistry();
    await provider.refreshCurrentPage();
    await validator.revalidateOpenSbcFiles();

    if (result.updated.length === 0 && result.errors.length === 0) {
      if (!options?.quietSuccess) {
        void vscode.window.showInformationMessage(
          'MES wiki sync: already up to date with GitHub master.'
        );
      }
      return;
    }

    const summary =
      result.updated.length > 0
        ? `Updated: ${result.updated.join(', ')}`
        : 'No wiki pages needed updates.';

    if (result.errors.length > 0) {
      void vscode.window
        .showWarningMessage(
          `MES wiki sync completed with ${result.errors.length} error(s). ${summary}`,
          'Show Details'
        )
        .then((choice) => {
          if (choice === 'Show Details') {
            void vscode.window.showInformationMessage(result.errors.join('\n'));
          }
        });
      return;
    }

    void vscode.window.showInformationMessage(
      `MES wiki sync complete (${result.sourceLabel}). ${summary}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!options?.quietFailure) {
      void vscode.window.showErrorMessage(`MES wiki sync failed: ${message}`);
    }
    throw error;
  }
}

/** Runs a one-time background sync after install. Never prompts for a folder path. */
export async function runFirstRunSyncIfNeeded(
  context: vscode.ExtensionContext,
  wikiSync: WikiSyncService,
  provider: MesWikiViewProvider,
  validator: SbcValidatorService
): Promise<void> {
  if (context.globalState.get<boolean>(FIRST_RUN_SYNC_KEY)) {
    return;
  }

  const syncOnFirstRun = vscode.workspace
    .getConfiguration('mesReference')
    .get<boolean>('syncOnFirstRun', true);

  if (!syncOnFirstRun) {
    await context.globalState.update(FIRST_RUN_SYNC_KEY, true);
    return;
  }

  try {
    await runWikiSync(wikiSync, provider, validator, {
      allowUserPrompt: false,
      progressTitle: 'MES Reference: First-time wiki sync',
      quietSuccess: true,
      quietFailure: true,
    });
  } catch {
    void vscode.window.showInformationMessage(
      'MES Reference: first-time wiki sync could not reach GitHub or a local MES install. The bundled wiki is ready to use — click ⟳ Sync when you are online to update.'
    );
  } finally {
    await context.globalState.update(FIRST_RUN_SYNC_KEY, true);
  }
}
