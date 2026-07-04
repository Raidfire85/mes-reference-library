import * as fs from 'fs/promises';
import * as path from 'path';
import { Uri } from 'vscode';
import { getWikiUri } from './wikiPaths';

export interface SearchIndexEntry {
  fileName: string;
  pageTitle: string;
  content: string;
}

export interface SearchResult {
  pageTitle: string;
  fileName: string;
  snippet: string;
}

export async function buildSearchIndex(extensionUri: Uri): Promise<SearchIndexEntry[]> {
  const entries: SearchIndexEntry[] = [];
  const wikiUri = getWikiUri(extensionUri);
  const files = await fs.readdir(wikiUri.fsPath);
  const htmlFiles = files.filter(
    (f) => f.endsWith('.html') && !f.endsWith('.backup')
  );

  for (const fileName of htmlFiles) {
    try {
      const filePath = path.join(wikiUri.fsPath, fileName);
      const content = await fs.readFile(filePath, 'utf8');
      const pageTitle = extractPageTitle(content, fileName);
      const plainText = stripHtmlTags(content);

      entries.push({ fileName, pageTitle, content: plainText });
    } catch {
      // Skip unreadable files
    }
  }

  return entries;
}

export function searchIndex(
  index: SearchIndexEntry[],
  searchTerm: string,
  limit = 15
): SearchResult[] {
  if (!searchTerm || searchTerm.length < 2) {
    return [];
  }

  const results: SearchResult[] = [];

  for (const entry of index) {
    const matchIndex = entry.content.toLowerCase().indexOf(searchTerm.toLowerCase());
    if (matchIndex < 0) {
      continue;
    }

    const snippetStart = Math.max(0, matchIndex - 50);
    const snippetLength = Math.min(150, entry.content.length - snippetStart);
    let snippet = entry.content.substring(snippetStart, snippetStart + snippetLength);

    if (snippetStart > 0) {
      snippet = '...' + snippet;
    }
    if (snippetStart + snippetLength < entry.content.length) {
      snippet = snippet + '...';
    }

    const regex = new RegExp(escapeRegex(searchTerm), 'gi');
    snippet = snippet.replace(regex, (m) => `►${m}◄`);

    results.push({
      pageTitle: entry.pageTitle,
      fileName: entry.fileName,
      snippet,
    });
  }

  return results
    .sort((a, b) => {
      const aTitle = a.pageTitle.toLowerCase().includes(searchTerm.toLowerCase()) ? 0 : 1;
      const bTitle = b.pageTitle.toLowerCase().includes(searchTerm.toLowerCase()) ? 0 : 1;
      return aTitle - bTitle;
    })
    .slice(0, limit);
}

function extractPageTitle(htmlContent: string, fallbackFileName: string): string {
  const h1Match = htmlContent.match(/<h1[^>]*>(.*?)<\/h1>/is);
  if (h1Match?.[1]) {
    return stripHtmlTags(h1Match[1]).trim();
  }

  const titleMatch = htmlContent.match(/<title[^>]*>(.*?)<\/title>/is);
  if (titleMatch?.[1]) {
    return stripHtmlTags(titleMatch[1]).replace(/\s*·\s*MES Reference Library\s*$/i, '').trim();
  }

  return path.basename(fallbackFileName, '.html').replace(/-/g, ' ');
}

function stripHtmlTags(html: string): string {
  let text = html;
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<[^>]+>/g, ' ');
  text = decodeHtmlEntities(text);
  text = text.replace(/\s+/g, ' ');
  return text.trim();
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
