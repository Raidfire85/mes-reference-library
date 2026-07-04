import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { NEW_PROFILE_PAGES, PAGE_MAP, SYNC_START } from './constants';
import { acquireMesSource, AcquireMesSourceOptions } from './mesGithubSource';
import {
  discoverAutoManagedProfiles,
} from './profileDiscovery';
import { getTagMetaFromSource, TagMetaMap } from './tagMetaParser';
import {
  applyTargetMaxTargetValueNote,
  buildProfilePageFromTemplate,
  buildSyncBlock,
  contentEquals,
  extractSyncBlock,
  getSupplementTagsForPage,
  getTagsInSyncBlock,
  hasBareTablesInWikiContent,
  hasMisplacedSyncBlock,
  injectSupplement,
  normalizeWikiPageWhitespace,
  removeHomeNotice,
  removeSyncBlock,
  updateSidebars,
  wrapBareTagTablesInWikiContent,
} from './wikiHtml';
import { resolveProfileAuthors } from './profileAuthor';
import { refreshDiscoveredHeaders } from './refreshDiscoveredHeaders';
import { buildProfileTagIndex, saveProfileTagIndex } from './profileTagIndexBuilder';
import {
  backfillNanDescriptionsInWikiContent,
  buildSupplementHeader,
  buildTagTableFromMeta,
} from './wikiTables';

export interface WikiSyncResult {
  updated: string[];
  errors: string[];
  sourceLabel: string;
}

export interface WikiSyncOptions {
  acquireSource?: AcquireMesSourceOptions;
}

interface TagDescriptionEntry {
  Tag: string;
  Description: string;
}

export class WikiSyncService {
  constructor(private readonly extensionUri: vscode.Uri) {}

  async syncFromMesSource(
    progress?: vscode.Progress<{ message?: string; increment?: number }>,
    token?: vscode.CancellationToken,
    options?: WikiSyncOptions
  ): Promise<WikiSyncResult> {
    const acquired = await acquireMesSource(progress, token, options?.acquireSource);
    const mesSourcePath = acquired.sourcePath;

    try {
      const wikiDir = path.join(this.extensionUri.fsPath, 'wiki');
      const tagDescriptions = await this.loadTagDescriptions(wikiDir);
      const updated: string[] = [];
      const errors: string[] = [];

      const pageEntries = Object.entries(PAGE_MAP);
      for (let i = 0; i < pageEntries.length; i++) {
        if (token?.isCancellationRequested) {
          break;
        }

        const [page, cfg] = pageEntries[i];
        progress?.report({
          message: `Syncing ${page}`,
          increment: 60 / (pageEntries.length + 20),
        });

        try {
          const htmlPath = path.join(wikiDir, page);
          const content = await fs.readFile(htmlPath, 'utf8');
          let meta: TagMetaMap = {};
          const sourceTags: string[] = [...(cfg.extraTags ?? [])];

          if (cfg.profile) {
            meta = await getTagMetaFromSource(mesSourcePath, cfg.profile);
            sourceTags.push(...Object.keys(meta));
          }

          const uniqueSourceTags = [...new Set(sourceTags)];
          const supplementTags = getSupplementTagsForPage(content, uniqueSourceTags);
          const tableRows =
            supplementTags.length > 0
              ? supplementTags
                  .map((tag) => buildTagTableFromMeta(tag, meta, tagDescriptions, cfg.style))
                  .join('\n')
              : '';
          const tables =
            supplementTags.length > 0
              ? `${buildSupplementHeader()}\n${tableRows}\n</div>`
              : '';
          const desiredSyncBlock = tables ? buildSyncBlock(tables) : null;
          const existingSyncBlock = extractSyncBlock(content);
          const syncUnchanged = Boolean(
            desiredSyncBlock && existingSyncBlock && contentEquals(existingSyncBlock, desiredSyncBlock)
          );
          const layoutRepairNeeded =
            hasMisplacedSyncBlock(content) || hasBareTablesInWikiContent(content);

          let html = wrapBareTagTablesInWikiContent(content);

          if (supplementTags.length > 0) {
            if (!syncUnchanged || layoutRepairNeeded) {
              html = injectSupplement(removeSyncBlock(html), tables);
            }
          } else if (html.includes(SYNC_START)) {
            html = removeSyncBlock(html);
          }

          html = backfillNanDescriptionsInWikiContent(html, tagDescriptions, meta);
          html = normalizeWikiPageWhitespace(html);

          if (!contentEquals(content, html)) {
            await fs.writeFile(htmlPath, html, 'utf8');
            const previousSyncTags = getTagsInSyncBlock(content);
            const added = supplementTags.filter((tag) => !previousSyncTags.has(tag)).length;
            const notes: string[] = [];
            if (added > 0) {
              notes.push(`+${added} tags`);
            } else if (supplementTags.length > 0 && !syncUnchanged) {
              notes.push('sync section updated');
            }
            if (content.includes(SYNC_START) && !html.includes(SYNC_START)) {
              notes.push('removed sync block');
            } else if (!content.includes(SYNC_START) && html.includes(SYNC_START)) {
              notes.push('sync section added');
            }
            if (layoutRepairNeeded) {
              notes.push('layout/tables');
            }
            if (/>nan</i.test(content) && !/>nan</i.test(html)) {
              notes.push('descriptions');
            }
            updated.push(notes.length > 0 ? `${page} (${notes.join(', ')})` : `${page} (content refresh)`);
          }
        } catch (error) {
          errors.push(`${page}: ${formatError(error)}`);
        }
      }

      let template: string | null = null;
      const autoProfiles = await discoverAutoManagedProfiles(mesSourcePath, wikiDir);
      const authorMap = await resolveProfileAuthors(
        wikiDir,
        mesSourcePath,
        autoProfiles.map((profile) => profile.profileCs),
        { useGithub: acquired.label !== 'local folder' }
      );
      const enrichedProfiles = autoProfiles.map((profile) => ({
        ...profile,
        author: authorMap.get(profile.profileCs) ?? 'MeridiusIX',
      }));

      for (const profile of enrichedProfiles) {
        if (token?.isCancellationRequested) {
          break;
        }

        progress?.report({
          message: `Updating ${profile.htmlFile}`,
          increment: 20 / (autoProfiles.length + 2),
        });

        try {
          if (!template) {
            const raw = await fs.readFile(path.join(wikiDir, 'Prefab-Data.html'), 'utf8');
            template = removeSyncBlock(raw);
          }

          const meta = await getTagMetaFromSource(mesSourcePath, profile.profileCs);
          const tables = Object.keys(meta)
            .sort()
            .map((tag) =>
              buildTagTableFromMeta(tag, meta, tagDescriptions, profileConfigStyle(profile.profileCs))
            )
            .join('\n');
          const intro = `<p>${profile.blurb}</p>`;
          const html = buildProfilePageFromTemplate(
            template,
            profile.title,
            intro,
            tables,
            profile.author
          );
          const outPath = path.join(wikiDir, profile.htmlFile);
          let existing = '';
          try {
            existing = await fs.readFile(outPath, 'utf8');
          } catch {
            // New page.
          }

          if (!contentEquals(existing, html)) {
            await fs.writeFile(outPath, html, 'utf8');
            updated.push(`${profile.htmlFile} (${Object.keys(meta).length} tags)`);
          }
        } catch (error) {
          errors.push(`${profile.htmlFile}: ${formatError(error)}`);
        }
      }

      await saveDiscoveredProfilesFileIfChanged(wikiDir, enrichedProfiles);
      await refreshDiscoveredHeaders(this.extensionUri);

      progress?.report({ message: 'Building profile tag index', increment: 5 });
      try {
        const tagIndex = await buildProfileTagIndex(mesSourcePath, wikiDir, acquired.label);
        const tagIndexChanged = await saveProfileTagIndex(wikiDir, tagIndex);
        if (tagIndexChanged) {
          updated.push(
            `profile-tag-index.json (${Object.keys(tagIndex.tagToHeaders).length} tags, ${tagIndex.profiles.length} sources)`
          );
        }
      } catch (error) {
        errors.push(`profile-tag-index.json: ${formatError(error)}`);
      }

      progress?.report({ message: 'Updating Target.html note', increment: 5 });
      try {
        const targetPath = path.join(wikiDir, 'Target.html');
        const targetContent = await fs.readFile(targetPath, 'utf8');
        const { content, changed } = applyTargetMaxTargetValueNote(targetContent);
        if (changed) {
          await fs.writeFile(targetPath, content, 'utf8');
          updated.push('Target.html (MaxTargetValue default note)');
        }
      } catch (error) {
        errors.push(`Target.html note: ${formatError(error)}`);
      }

      progress?.report({ message: 'Refreshing sidebars', increment: 5 });
      try {
        const files = await fs.readdir(wikiDir);
        let sidebarCount = 0;
        for (const file of files.filter((f) => f.endsWith('.html'))) {
          const filePath = path.join(wikiDir, file);
          const original = await fs.readFile(filePath, 'utf8');
          let content = original;
          let changed = false;

          if (file === 'Home.html') {
            const removed = removeHomeNotice(content);
            if (removed.changed) {
              content = removed.content;
              changed = true;
            }
          }

          const { content: next, changed: sidebarChanged } = updateSidebars(
            content,
            enrichedProfiles
          );
          if (sidebarChanged) {
            content = next;
            changed = true;
          }

          if (changed && !contentEquals(original, content)) {
            await fs.writeFile(filePath, content, 'utf8');
            sidebarCount++;
          }
        }
        if (sidebarCount > 0) {
          updated.push(`Sidebars refreshed (${sidebarCount} pages)`);
        }
      } catch (error) {
        errors.push(`Sidebars: ${formatError(error)}`);
      }

      return { updated, errors, sourceLabel: acquired.label };
    } finally {
      progress?.report({ message: 'Cleaning up temporary files...' });
      await acquired.cleanup();
    }
  }

  private async loadTagDescriptions(wikiDir: string): Promise<Record<string, string>> {
    const descPath = path.join(wikiDir, 'TagDescriptions.json');
    const map: Record<string, string> = {};

    try {
      const raw = await fs.readFile(descPath, 'utf8');
      const entries = JSON.parse(raw.replace(/^\uFEFF/, '')) as TagDescriptionEntry[];
      for (const entry of entries) {
        if (entry.Tag && entry.Description) {
          map[entry.Tag] = entry.Description;
        }
      }
    } catch {
      // TagDescriptions.json is optional; inference fills gaps.
    }

    return map;
  }
}

function profileConfigStyle(profileCs: string): import('./constants').WikiTableStyle {
  const known = NEW_PROFILE_PAGES.find((page) => page.profile === profileCs);
  return known?.style ?? 'Prefab';
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function saveDiscoveredProfilesFileIfChanged(
  wikiDir: string,
  profiles: import('./discoveredProfiles').DiscoveredProfile[]
): Promise<void> {
  const { loadDiscoveredProfilesFile, saveDiscoveredProfilesFile } = await import(
    './discoveredProfiles'
  );
  const existing = await loadDiscoveredProfilesFile(wikiDir);
  const next = { version: 1 as const, profiles };

  if (JSON.stringify(existing.profiles) === JSON.stringify(next.profiles)) {
    return;
  }

  await saveDiscoveredProfilesFile(wikiDir, profiles);
}
