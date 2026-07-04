import * as fs from 'fs/promises';
import * as path from 'path';
import { Uri } from 'vscode';
import { parseTagMetadataFromWiki, TagMetadata } from './tagMetadata';

export interface TagRegistry {
  tagsByFile: Map<string, Set<string>>;
  tagToFiles: Map<string, Set<string>>;
  metadataByFile: Map<string, Map<string, TagMetadata>>;
}
const TAG_PATTERN = /\[([A-Za-z0-9_]+):[^\]]*\]/g;

export async function buildTagRegistry(extensionUri: Uri): Promise<TagRegistry> {
  const wikiPath = path.join(extensionUri.fsPath, 'wiki');
  const tagsByFile = new Map<string, Set<string>>();
  const tagToFiles = new Map<string, Set<string>>();
  const metadataByFile = new Map<string, Map<string, TagMetadata>>();

  let files: string[];
  try {
    files = await fs.readdir(wikiPath);
  } catch {
    return { tagsByFile, tagToFiles, metadataByFile };
  }

  for (const fileName of files.filter((f) => f.endsWith('.html'))) {
    const content = await fs.readFile(path.join(wikiPath, fileName), 'utf8');
    const tags = extractTagsFromHtml(content);
    tagsByFile.set(fileName, tags);
    metadataByFile.set(fileName, parseTagMetadataFromWiki(content, fileName));

    for (const tag of tags) {
      if (!tagToFiles.has(tag)) {
        tagToFiles.set(tag, new Set());
      }
      tagToFiles.get(tag)!.add(fileName);
    }
  }

  return { tagsByFile, tagToFiles, metadataByFile };
}
export function extractTagsFromHtml(html: string): Set<string> {
  const tags = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = TAG_PATTERN.exec(html)) !== null) {
    tags.add(match[1]);
  }

  TAG_PATTERN.lastIndex = 0;
  return tags;
}

export function getDocumentedFilesForTag(registry: TagRegistry, tagName: string): string[] {
  return [...(registry.tagToFiles.get(tagName) ?? [])].sort();
}

export function isTagDocumented(registry: TagRegistry, tagName: string, htmlFile: string): boolean {
  return registry.tagsByFile.get(htmlFile)?.has(tagName) ?? false;
}

export function getTagMetadata(
  registry: TagRegistry,
  tagName: string,
  htmlFile: string
): TagMetadata | undefined {
  return registry.metadataByFile.get(htmlFile)?.get(tagName);
}

/** Wiki filename → short page label (e.g. Weapons.html → Weapons). */
export function wikiPageLabel(fileName: string): string {
  return fileName.replace(/\.html$/i, '');
}

export function formatWikiPageList(fileNames: string[]): string {
  const labels = fileNames.map(wikiPageLabel);
  if (labels.length === 0) {
    return '';
  }
  if (labels.length === 1) {
    return labels[0];
  }
  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}
