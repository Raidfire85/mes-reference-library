import * as fs from 'fs/promises';
import { Uri, Webview } from 'vscode';
import { getWikiUri } from './wikiPaths';

export interface RenderPageOptions {
  highlightTerm?: string;
  scrollToHash?: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isBookmarked: boolean;
  bookmarkCount: number;
}

export async function renderWikiPage(
  extensionUri: Uri,
  webview: Webview,
  fileName: string,
  options: RenderPageOptions
): Promise<string> {
  const wikiUri = getWikiUri(extensionUri);
  const filePath = Uri.joinPath(wikiUri, fileName);
  let html = await fs.readFile(filePath.fsPath, 'utf8');

  const cssUri = webview.asWebviewUri(Uri.joinPath(wikiUri, 'mes-wiki.css'));
  html = html.replace(/href="mes-wiki\.css"/gi, `href="${cssUri}"`);

  const toolbar = buildToolbar(options);
  const scripts = buildScripts(options.highlightTerm, options.scrollToHash);

  if (/<body[^>]*>/i.test(html)) {
    html = html.replace(/<body([^>]*)>/i, `<body$1>${toolbar}`);
  } else {
    html = toolbar + html;
  }

  if (html.includes('</body>')) {
    html = html.replace('</body>', `${scripts}</body>`);
  } else {
    html = html + scripts;
  }

  return html;
}

function buildToolbar(options: RenderPageOptions): string {
  const bookmarkIcon = options.isBookmarked ? '★' : '☆';
  const bookmarkClass = options.isBookmarked ? 'active' : '';

  return `
<style id="mes-ref-toolbar-style">
  #mes-ref-toolbar-wrapper {
    position: sticky;
    top: 0;
    z-index: 10000;
    background: #1e1e1e;
    border-bottom: 1px solid #3f3f46;
  }
  #mes-ref-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    padding: 6px 8px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  #mes-ref-toolbar button {
    min-width: 28px;
    height: 26px;
    padding: 0 8px;
    border: 1px solid #3f3f46;
    background: #2d2d30;
    color: #fff;
    border-radius: 3px;
    cursor: pointer;
    font-size: 13px;
  }
  #mes-ref-toolbar button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  #mes-ref-toolbar button.active {
    color: #ffd700;
  }
  #mes-ref-toolbar label {
    color: #ccc;
    font-size: 12px;
    margin-left: 4px;
  }
  #mes-ref-search {
    flex: 1 1 120px;
    min-width: 120px;
    height: 26px;
    padding: 0 8px;
    border: 1px solid #3f3f46;
    background: #2d2d30;
    color: #fff;
    border-radius: 3px;
    font-size: 12px;
  }
  #mes-ref-search-results {
    max-height: 280px;
    overflow-y: auto;
    background: #1e1e1e;
    border-top: 1px solid #3f3f46;
    display: none;
  }
  #mes-ref-search-results.visible { display: block; }
  .mes-ref-result {
    padding: 8px 10px;
    border-bottom: 1px solid #2d2d30;
    cursor: pointer;
    color: #fff;
  }
  .mes-ref-result:hover { background: #2d2d30; }
  .mes-ref-result-title { font-weight: 600; font-size: 13px; margin-bottom: 2px; }
  .mes-ref-result-snippet { font-size: 11px; color: #aaa; white-space: normal; }
  mark.mes-ref-highlight { background: #ffeb3b; color: #000; padding: 1px 2px; }
</style>
<div id="mes-ref-toolbar-wrapper">
<div id="mes-ref-toolbar">
  <button id="mes-ref-back" title="Back" ${options.canGoBack ? '' : 'disabled'}>←</button>
  <button id="mes-ref-forward" title="Forward" ${options.canGoForward ? '' : 'disabled'}>→</button>
  <label for="mes-ref-search">Search:</label>
  <input id="mes-ref-search" type="text" placeholder="Search wiki..." autocomplete="off" />
  <button id="mes-ref-refresh" title="Refresh">↻</button>
  <button id="mes-ref-validate" title="Validate Current SBC">✓</button>
  <button id="mes-ref-validate-mod" title="Validate All SBC in Mod Data">✓ Mod</button>
  <button id="mes-ref-sync" title="Sync Wiki from GitHub (MES master)">⟳</button>
  <button id="mes-ref-bookmark" class="${bookmarkClass}" title="Bookmark this page">${bookmarkIcon}</button>
  <button id="mes-ref-bookmarks" title="View bookmarks">★ ${options.bookmarkCount}</button>
</div>
<div id="mes-ref-search-results"></div>
</div>`;
}

function buildScripts(highlightTerm?: string, scrollToHash?: string): string {
  const escapedTerm = highlightTerm
    ? highlightTerm.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    : '';
  const hashId = scrollToHash
    ? (scrollToHash.startsWith('#') ? scrollToHash.slice(1) : scrollToHash)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
    : '';

  return `
<script>
(function() {
  const vscode = acquireVsCodeApi();
  let searchTimer = null;

  function post(type, payload) {
    vscode.postMessage(Object.assign({ type: type }, payload || {}));
  }

  document.getElementById('mes-ref-back')?.addEventListener('click', () => post('back'));
  document.getElementById('mes-ref-forward')?.addEventListener('click', () => post('forward'));
  document.getElementById('mes-ref-refresh')?.addEventListener('click', () => post('refresh'));
  document.getElementById('mes-ref-validate')?.addEventListener('click', () => post('validateSbc'));
  document.getElementById('mes-ref-validate-mod')?.addEventListener('click', () => post('validateMod'));
  document.getElementById('mes-ref-sync')?.addEventListener('click', () => post('syncWiki'));
  document.getElementById('mes-ref-bookmark')?.addEventListener('click', () => post('toggleBookmark'));
  document.getElementById('mes-ref-bookmarks')?.addEventListener('click', () => post('showBookmarks'));

  const searchInput = document.getElementById('mes-ref-search');
  const resultsEl = document.getElementById('mes-ref-search-results');

  searchInput?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      post('search', { query: searchInput.value.trim() });
    }, 200);
  });

  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      resultsEl.classList.remove('visible');
    }
  });

  document.addEventListener('click', (e) => {
    const anchor = e.target.closest('a');
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    if (!href) return;

    if (href.startsWith('#')) return;

    if (/\\.html($|[#?])/i.test(href)) {
      e.preventDefault();
      const fileName = href.split('#')[0].split('?')[0];
      const hash = href.includes('#') ? href.substring(href.indexOf('#')) : '';
      post('navigate', { fileName: fileName, hash: hash });
    }
  });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'searchResults') {
      resultsEl.innerHTML = '';
      if (!msg.results || msg.results.length === 0) {
        resultsEl.classList.remove('visible');
        return;
      }
      for (const result of msg.results) {
        const item = document.createElement('div');
        item.className = 'mes-ref-result';
        item.innerHTML = '<div class="mes-ref-result-title">' + result.pageTitle + '</div>' +
          '<div class="mes-ref-result-snippet">' + result.snippet + '</div>';
        item.addEventListener('click', () => {
          post('navigate', { fileName: result.fileName, searchTerm: searchInput.value.trim() });
          resultsEl.classList.remove('visible');
        });
        resultsEl.appendChild(item);
      }
      resultsEl.classList.add('visible');
    }
  });

  const highlightTerm = "${escapedTerm}";
  if (highlightTerm) {
    const regex = new RegExp(highlightTerm.replace(/[.*+?^$\\{}()|[\\]\\\\]/g, '\\\\$&'), 'gi');
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let node;
    let firstMatch = null;
    while (node = walker.nextNode()) {
      if (!node.nodeValue || !regex.test(node.nodeValue)) continue;
      regex.lastIndex = 0;
      const span = document.createElement('span');
      span.innerHTML = node.nodeValue.replace(regex, '<mark class="mes-ref-highlight">$&</mark>');
      node.parentNode.replaceChild(span, node);
      if (!firstMatch) firstMatch = span.querySelector('mark');
    }
    if (firstMatch) firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const hashId = "${hashId}";
  if (hashId) {
    const hashEl = document.getElementById(hashId);
    if (hashEl) hashEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
})();
</script>`;
}
