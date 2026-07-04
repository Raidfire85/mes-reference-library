import * as vscode from 'vscode';
import {
  buildSearchIndex,
  searchIndex,
  SearchIndexEntry,
  SearchResult,
} from './searchIndex';
import { renderWikiPage } from './wikiContent';
import { getWikiUri } from './wikiPaths';

export class MesWikiViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'mesReference.wikiView';

  private _view?: vscode.WebviewView;
  private _currentPage = 'Home.html';
  private _backStack: string[] = [];
  private _forwardStack: string[] = [];
  private _searchIndex: SearchIndexEntry[] = [];
  private _indexReady = false;
  private _bookmarks: Set<string>;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext
  ) {
    this._bookmarks = new Set(context.globalState.get<string[]>('mesReference.bookmarks', []));
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri, getWikiUri(this.extensionUri)],
    };

    webviewView.webview.onDidReceiveMessage((message) => {
      void this.handleMessage(message);
    });

    void this.ensureSearchIndex().then(() => this.renderPage('Home.html', { pushHistory: false }));
  }

  public async focus(): Promise<void> {
    await vscode.commands.executeCommand('mesReference.wikiView.focus');
  }

  public async openWikiPage(fileName: string, options?: { searchTerm?: string }): Promise<void> {
    await this.focus();
    await this.renderPage(fileName, { pushHistory: false, searchTerm: options?.searchTerm });
  }

  public async openSearch(): Promise<void> {
    await this.focus();
    const query = await vscode.window.showInputBox({
      placeHolder: 'Search MES wiki...',
      prompt: 'Enter at least 2 characters to search',
    });

    if (!query || query.trim().length < 2) {
      return;
    }

    await this.ensureSearchIndex();
    const results = searchIndex(this._searchIndex, query.trim());

    if (results.length === 0) {
      void vscode.window.showInformationMessage(`No results found for "${query.trim()}".`);
      return;
    }

    const picked = await this.showSearchQuickPick(results, query.trim());
    if (picked) {
      await this.renderPage(picked.fileName, { searchTerm: query.trim() });
    }
  }

  public async showBookmarksPicker(): Promise<void> {
    if (this._bookmarks.size === 0) {
      void vscode.window.showInformationMessage('No bookmarks saved yet.');
      return;
    }

    const items = [...this._bookmarks]
      .sort((a, b) => a.localeCompare(b))
      .map((fileName) => ({
        label: this.getPageTitle(fileName),
        description: fileName,
        fileName,
      }));

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a bookmarked page',
    });

    if (picked) {
      await this.renderPage(picked.fileName);
    }
  }

  public invalidateSearchIndex(): void {
    this._indexReady = false;
    this._searchIndex = [];
  }

  public async refreshCurrentPage(): Promise<void> {
    await this.renderPage(this._currentPage, { pushHistory: false });
  }

  public async syncWiki(): Promise<void> {
    await vscode.commands.executeCommand('mesReference.syncWiki');
  }

  private async handleMessage(message: {
    type: string;
    fileName?: string;
    hash?: string;
    query?: string;
    searchTerm?: string;
  }): Promise<void> {
    switch (message.type) {
      case 'navigate':
        if (message.fileName) {
          await this.renderPage(message.fileName, {
            hash: message.hash,
            searchTerm: message.searchTerm,
          });
        }
        break;
      case 'back':
        await this.goBack();
        break;
      case 'forward':
        await this.goForward();
        break;
      case 'refresh':
        await this.renderPage(this._currentPage, { pushHistory: false });
        break;
      case 'validateSbc':
        await vscode.commands.executeCommand('mesReference.validateSbc');
        break;
      case 'validateMod':
        await vscode.commands.executeCommand('mesReference.validateMod');
        break;
      case 'syncWiki':
        await this.syncWiki();
        break;
      case 'toggleBookmark':
        this.toggleBookmark(this._currentPage);
        await this.renderPage(this._currentPage, { pushHistory: false });
        break;
      case 'showBookmarks':
        await this.showBookmarksPicker();
        break;
      case 'search':
        await this.handleSearch(message.query ?? '');
        break;
    }
  }

  private async handleSearch(query: string): Promise<void> {
    if (!this._view) {
      return;
    }

    await this.ensureSearchIndex();

    const results = searchIndex(this._searchIndex, query);
    this._view.webview.postMessage({ type: 'searchResults', results });
  }

  private async ensureSearchIndex(): Promise<void> {
    if (this._indexReady) {
      return;
    }

    this._searchIndex = await buildSearchIndex(this.extensionUri);
    this._indexReady = true;
  }

  private async renderPage(
    fileName: string,
    options?: {
      pushHistory?: boolean;
      hash?: string;
      searchTerm?: string;
    }
  ): Promise<void> {
    if (!this._view) {
      return;
    }

    const pushHistory = options?.pushHistory ?? true;

    if (pushHistory && this._currentPage && this._currentPage !== fileName) {
      this._backStack.push(this._currentPage);
      this._forwardStack = [];
    }

    this._currentPage = fileName;

    try {
      const scrollToHash = options?.hash
        ? options.hash.startsWith('#')
          ? options.hash
          : `#${options.hash}`
        : undefined;

      const html = await renderWikiPage(this.extensionUri, this._view.webview, fileName, {
        canGoBack: this._backStack.length > 0,
        canGoForward: this._forwardStack.length > 0,
        isBookmarked: this._bookmarks.has(fileName),
        bookmarkCount: this._bookmarks.size,
        highlightTerm: options?.searchTerm,
        scrollToHash,
      });

      this._view.webview.html = html;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this._view.webview.html = `<html><body style="font-family:sans-serif;padding:20px;">
        <h2>Page Not Found</h2>
        <p>Could not load: ${fileName}</p>
        <p>${message}</p>
      </body></html>`;
    }
  }

  private async goBack(): Promise<void> {
    if (this._backStack.length === 0) {
      return;
    }

    this._forwardStack.push(this._currentPage);
    const previous = this._backStack.pop()!;
    await this.renderPage(previous, { pushHistory: false });
  }

  private async goForward(): Promise<void> {
    if (this._forwardStack.length === 0) {
      return;
    }

    this._backStack.push(this._currentPage);
    const next = this._forwardStack.pop()!;
    await this.renderPage(next, { pushHistory: false });
  }

  private toggleBookmark(fileName: string): void {
    if (this._bookmarks.has(fileName)) {
      this._bookmarks.delete(fileName);
    } else {
      this._bookmarks.add(fileName);
    }

    void this.context.globalState.update('mesReference.bookmarks', [...this._bookmarks]);
  }

  private getPageTitle(fileName: string): string {
    const entry = this._searchIndex.find((e) => e.fileName === fileName);
    if (entry) {
      return entry.pageTitle;
    }
    return fileName.replace('.html', '').replace(/-/g, ' ');
  }

  private async showSearchQuickPick(
    results: SearchResult[],
    query: string
  ): Promise<SearchResult | undefined> {
    const items = results.map((result) => ({
      label: result.pageTitle,
      description: result.fileName,
      detail: result.snippet.replace(/►|◄/g, ''),
      result,
    }));

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: `Results for "${query}"`,
      matchOnDescription: true,
      matchOnDetail: true,
    });

    return picked?.result;
  }
}
