import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchWebWikiDocs, loadLocalWebWikiSource } from '../out/wikiSync/webWikiFetch.js';
import { buildWikiFromMarkdown } from '../out/wikiSync/mdWikiBuilder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const localWebWiki = path.resolve(repoRoot, '..', 'MES-WebWiki');
const wikiDir = path.join(repoRoot, 'wiki');

async function pathExists(target) {
  try {
    await import('fs/promises').then((fs) => fs.access(target));
    return true;
  } catch {
    return false;
  }
}

async function loadWebWikiSource() {
  const preferLocal = process.env.WIKI_BUILD_LOCAL === '1';

  if (!preferLocal) {
    try {
      const fetched = await fetchWebWikiDocs(repoRoot, (message) => console.log(`  ${message}`));
      console.log(`Using ${fetched.label} (${fetched.filesDownloaded} files).`);
      return fetched;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`GitHub WebWiki fetch failed: ${message}`);
    }
  }

  if (await pathExists(localWebWiki)) {
    const loaded = await loadLocalWebWikiSource(repoRoot, localWebWiki);
    console.log(`Using ${loaded.label} (${loaded.filesDownloaded} files).`);
    return loaded;
  }

  if (!preferLocal) {
    throw new Error('No WebWiki source available (GitHub fetch failed and local MES-WebWiki clone missing).');
  }

  throw new Error(`Local MES-WebWiki not found at ${localWebWiki}`);
}

try {
  const loaded = await loadWebWikiSource();
  const built = await buildWikiFromMarkdown({
    docsDir: loaded.docsDir,
    mkdocsPath: loaded.mkdocsPath,
    outputDir: wikiDir,
    styleCssPath: path.join(wikiDir, 'mes-wiki.css'),
  });
  console.log(`Built ${built.pagesBuilt} wiki pages from WebWiki markdown.`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`Skipping MD wiki build: ${message}`);
  console.warn('Bundled wiki/*.html will be used as-is.');
}
