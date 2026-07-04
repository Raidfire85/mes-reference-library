import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  GITHUB_RAW_BASE,
  GITHUB_REPO,
  GITHUB_TREE_API,
  MES_SCRIPTS_GITHUB_PATH,
} from './constants';
import {
  discoverLocalMesSource,
  DiscoveredMesSource,
  isValidMesSourceFolder,
  MES_SOURCE_FOLDER_NAME,
} from './mesSourceDiscovery';

const DOWNLOAD_CONCURRENCY = 12;

export interface AcquiredMesSource {
  sourcePath: string;
  cleanup: () => Promise<void>;
  label: string;
}

export interface AcquireMesSourceOptions {
  /** When false, auto-discovery only — no folder picker (used for first-run background sync). */
  allowUserPrompt?: boolean;
}

interface GitHubTreeResponse {
  tree: Array<{
    path: string;
    type: 'blob' | 'tree';
  }>;
  truncated?: boolean;
}

export async function acquireMesSource(
  progress?: vscode.Progress<{ message?: string }>,
  token?: vscode.CancellationToken,
  options?: AcquireMesSourceOptions
): Promise<AcquiredMesSource> {
  const allowUserPrompt = options?.allowUserPrompt !== false;
  const configuredPath = vscode.workspace
    .getConfiguration('mesReference')
    .get<string>('mesSourcePath', '')
    .trim();

  try {
    return await acquireMesSourceFromGithub(progress, token);
  } catch (githubError) {
    progress?.report({ message: 'GitHub unavailable — searching for local MES source...' });

    let local = await discoverLocalMesSource(configuredPath);
    if (!local && allowUserPrompt) {
      local = await promptUserForMesSourceFallback(
        'GitHub sync failed and no local MES install was found. Select your ModularEncountersSystems folder (must contain ProfileManager.cs), or cancel to abort sync.'
      );
    }

    if (local) {
      return {
        sourcePath: local.sourcePath,
        label: local.label,
        cleanup: async () => {},
      };
    }

    if (allowUserPrompt) {
      throw new Error(
        `Sync cancelled: GitHub unavailable and no local ${MES_SOURCE_FOLDER_NAME} folder was selected.\n\n${formatSyncError(githubError)}`
      );
    }

    throw new Error(
      `GitHub unavailable and no local ${MES_SOURCE_FOLDER_NAME} folder was found.\n\n${formatSyncError(githubError)}`
    );
  }
}

export async function acquireMesSourceFromGithub(
  progress?: vscode.Progress<{ message?: string }>,
  token?: vscode.CancellationToken
): Promise<AcquiredMesSource> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mes-ref-sync-'));
  const sourcePath = path.join(tempRoot, MES_SOURCE_FOLDER_NAME);

  const cleanup = async (): Promise<void> => {
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  };

  const controller = new AbortController();
  const cancelListener = token?.onCancellationRequested(() => {
    controller.abort();
    void cleanup();
  });

  try {
    if (token?.isCancellationRequested) {
      throw new Error('Sync cancelled.');
    }

    progress?.report({ message: 'Fetching file list from GitHub...' });
    const filePaths = await listGithubScriptFiles(controller.signal);

    if (filePaths.length === 0) {
      throw new Error(`No files found under ${MES_SCRIPTS_GITHUB_PATH} on GitHub.`);
    }

    progress?.report({
      message: `Downloading ${filePaths.length} files from ${MES_SCRIPTS_GITHUB_PATH}...`,
    });

    await fs.mkdir(sourcePath, { recursive: true });
    await downloadGithubFiles(filePaths, sourcePath, controller.signal, (done, total) => {
      if (done % 25 === 0 || done === total) {
        progress?.report({ message: `Downloading MES scripts (${done}/${total})...` });
      }
    });

    await assertMesSourceFolder(sourcePath);

    const csCount = filePaths.filter((p) => p.endsWith('.cs')).length;
    if (csCount === 0) {
      throw new Error('Downloaded MES source contains no .cs files.');
    }

    progress?.report({ message: `MES source ready (${csCount} .cs files)` });

    return {
      sourcePath,
      label: 'GitHub master',
      cleanup,
    };
  } catch (error) {
    await cleanup();
    if (controller.signal.aborted) {
      throw new Error('Sync cancelled.');
    }
    throw error;
  } finally {
    cancelListener?.dispose();
  }
}

export async function pickAndSaveMesSourcePath(): Promise<void> {
  const selected = await promptUserForMesSourceFallback(
    'MES Reference: select local ModularEncountersSystems folder (offline fallback)'
  );
  if (!selected) {
    return;
  }

  void vscode.window.showInformationMessage(
    `MES source fallback saved. Sync will still use GitHub when online; this path is used if GitHub is unavailable.\n${selected.sourcePath}`
  );
}

/** Folder picker used when auto-discovery fails or the user sets a fallback manually. */
async function promptUserForMesSourceFallback(
  title: string
): Promise<DiscoveredMesSource | null> {
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: `Select ${MES_SOURCE_FOLDER_NAME} folder`,
    title,
  });

  if (!picked?.[0]) {
    return null;
  }

  const selected = picked[0].fsPath;
  if (!(await isValidMesSourceFolder(selected))) {
    void vscode.window.showErrorMessage(
      `That folder is not a valid MES source root. Select the folder that contains ProfileManager.cs (${MES_SOURCE_FOLDER_NAME}).`
    );
    return null;
  }

  const config = vscode.workspace.getConfiguration('mesReference');
  await config.update('mesSourcePath', selected, vscode.ConfigurationTarget.Global);

  return {
    sourcePath: selected,
    label: 'user-selected folder',
  };
}

export async function clearMesSourcePath(): Promise<void> {
  const config = vscode.workspace.getConfiguration('mesReference');
  const current = config.get<string>('mesSourcePath', '').trim();
  if (!current) {
    void vscode.window.showInformationMessage('No MES source fallback path is configured.');
    return;
  }

  await config.update('mesSourcePath', '', vscode.ConfigurationTarget.Global);
  void vscode.window.showInformationMessage('MES source fallback path cleared.');
}

export async function showMesSourcePath(): Promise<void> {
  const config = vscode.workspace.getConfiguration('mesReference');
  const current = config.get<string>('mesSourcePath', '').trim();

  if (!current) {
    const discovered = await discoverLocalMesSource();
    if (discovered) {
      void vscode.window.showInformationMessage(
        `No mesReference.mesSourcePath configured. Auto-detected fallback: ${discovered.label}\n${discovered.sourcePath}`
      );
      return;
    }

    void vscode.window.showInformationMessage(
      'No mesReference.mesSourcePath configured. Sync uses GitHub when online; run **Set MES Source Path** to choose an offline fallback folder.'
    );
    return;
  }

  const valid = await isValidMesSourceFolder(current);
  void vscode.window.showInformationMessage(
    `MES source fallback (${valid ? 'valid' : 'not found'}):\n${current}\n\nSync still tries GitHub first when online.`
  );
}

async function listGithubScriptFiles(signal: AbortSignal): Promise<string[]> {
  const response = await fetch(GITHUB_TREE_API, {
    signal,
    headers: githubHeaders(),
  });

  if (!response.ok) {
    throw new Error(`GitHub file list failed (${response.status} ${response.statusText}).`);
  }

  const payload = (await response.json()) as GitHubTreeResponse;
  if (payload.truncated) {
    throw new Error('GitHub file list was truncated; cannot sync safely.');
  }

  const prefix = `${MES_SCRIPTS_GITHUB_PATH}/`;
  return payload.tree
    .filter((entry) => entry.type === 'blob' && entry.path.startsWith(prefix))
    .map((entry) => entry.path.slice(prefix.length))
    .sort();
}

async function downloadGithubFiles(
  relativePaths: string[],
  sourcePath: string,
  signal: AbortSignal,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  let done = 0;
  const total = relativePaths.length;
  let index = 0;

  const workers = Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, total) }, async () => {
    while (index < total) {
      if (signal.aborted) {
        throw new Error('Sync cancelled.');
      }

      const current = index++;
      const relativePath = relativePaths[current];
      const url = `${GITHUB_RAW_BASE}/${MES_SCRIPTS_GITHUB_PATH}/${relativePath}`;
      const response = await fetch(url, { signal });

      if (!response.ok) {
        throw new Error(`Failed to download ${relativePath} (${response.status}).`);
      }

      const content = Buffer.from(await response.arrayBuffer());
      const outPath = path.join(sourcePath, relativePath);
      await fs.mkdir(path.dirname(outPath), { recursive: true });
      await fs.writeFile(outPath, content);

      done++;
      onProgress?.(done, total);
    }
  });

  await Promise.all(workers);
}

function githubHeaders(): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'mes-reference-library-vscode-extension',
  };
}

async function assertMesSourceFolder(sourcePath: string): Promise<void> {
  if (!(await isValidMesSourceFolder(sourcePath))) {
    throw new Error(`MES source folder not found or invalid: ${sourcePath}`);
  }
}

function formatSyncError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
