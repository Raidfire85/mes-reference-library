import {
  HOME_NOTICE_END,
  HOME_NOTICE_START,
  SIDEBAR_PATTERN,
  SYNC_END,
  SYNC_START,
} from './constants';

export function removeSyncBlock(content: string): string {
  if (!content.includes(SYNC_START)) {
    return content;
  }

  const pattern = new RegExp(
    `${escapeRegex(SYNC_START)}[\\s\\S]*?${escapeRegex(SYNC_END)}`,
    'g'
  );
  return content.replace(pattern, '').trimEnd();
}

function findSidebarIndex(content: string): number {
  const match = SIDEBAR_PATTERN.exec(content);
  SIDEBAR_PATTERN.lastIndex = 0;
  return match?.index ?? -1;
}

export function extractSyncBlock(content: string): string | null {
  const start = content.indexOf(SYNC_START);
  const end = content.indexOf(SYNC_END);
  if (start === -1 || end === -1) {
    return null;
  }

  return content.slice(start, end + SYNC_END.length);
}

export function buildSyncBlock(supplementHtml: string): string {
  return `${SYNC_START}\n${supplementHtml}\n${SYNC_END}`;
}

/** Closing markdown-body + wiki-content immediately before the wiki sidebar. */
const WIKI_CONTENT_BEFORE_SIDEBAR =
  /(\s*<\/div>)(\s*<\/div>\s*(?=<div class=['"]wiki-sidebar['"]>))/;

const WIKI_MAIN_MARKDOWN_BODY =
  /(<div class="wiki-content">\s*<div class="markdown-body">)([\s\S]*)(<\/div>\s*<\/div>\s*(?=<div class=['"]wiki-sidebar['"]>))/;

export function extractSyncSupplementHtml(content: string): string | null {
  const block = extractSyncBlock(content);
  if (!block) {
    return null;
  }

  return block
    .slice(block.indexOf(SYNC_START) + SYNC_START.length, block.indexOf(SYNC_END))
    .trim();
}

export function wrapBareTagTablesInWikiContent(content: string): string {
  return content.replace(WIKI_MAIN_MARKDOWN_BODY, (_, head, body, tail) => {
    return `${head}${wrapBareTablesInFragment(body)}${tail}`;
  });
}

function wrapBareTablesInFragment(fragment: string): string {
  return fragment.replace(/<table(\s[^>]*)>([\s\S]*?)<\/table>/gi, (tableHtml, attrs, inner, offset, full) => {
    const before = full.slice(Math.max(0, offset - 80), offset);
    if (/<div class="mes-tag-table-wrap">\s*$/i.test(before)) {
      return tableHtml;
    }

    return `<div class="mes-tag-table-wrap"><table${attrs}>${inner}</table></div>`;
  });
}

export function injectSupplement(content: string, supplementHtml: string): string {
  const cleaned = wrapBareTagTablesInWikiContent(removeSyncBlock(content));
  const block = buildSyncBlock(supplementHtml);
  const match = WIKI_CONTENT_BEFORE_SIDEBAR.exec(cleaned);
  WIKI_CONTENT_BEFORE_SIDEBAR.lastIndex = 0;

  if (match?.index !== undefined) {
    return normalizeWikiPageWhitespace(
      `${cleaned.slice(0, match.index)}\n${block}\n${cleaned.slice(match.index)}`
    );
  }

  const idx = findSidebarIndex(cleaned);
  if (idx === -1) {
    throw new Error('Could not find wiki content injection point');
  }

  return normalizeWikiPageWhitespace(`${cleaned.slice(0, idx)}${block}\n\n  ${cleaned.slice(idx)}`);
}

export function repairWikiPageLayout(content: string): string {
  const syncInner = extractSyncSupplementHtml(content);
  let html = wrapBareTagTablesInWikiContent(removeSyncBlock(content));

  if (!syncInner) {
    return normalizeWikiPageWhitespace(html);
  }

  return normalizeWikiPageWhitespace(injectSupplement(html, syncInner));
}

export function hasMisplacedSyncBlock(content: string): boolean {
  const syncEnd = content.indexOf(SYNC_END);
  if (syncEnd === -1) {
    return false;
  }

  const afterSync = normalizeContent(content).slice(syncEnd + SYNC_END.length);
  return !/^\s*<\/div>\s*<\/div>\s*(?=<div class=['"]wiki-sidebar['"]>)/i.test(afterSync);
}

export function hasBareTablesInWikiContent(content: string): boolean {
  const match = WIKI_MAIN_MARKDOWN_BODY.exec(normalizeContent(content));
  WIKI_MAIN_MARKDOWN_BODY.lastIndex = 0;
  if (!match) {
    return false;
  }

  const withoutWrapped = match[2].replace(/<div class="mes-tag-table-wrap">[\s\S]*?<\/div>/gi, '');
  return /(?:^|[\r\n])<table/i.test(withoutWrapped);
}

export function needsWikiContentRepair(content: string): boolean {
  return hasMisplacedSyncBlock(content) || hasBareTablesInWikiContent(content);
}

export function normalizeWikiPageWhitespace(content: string): string {
  let html = normalizeContent(content);
  html = html.replace(
    /(<!-- MES-WIKI-SOURCE-SYNC-END -->)\s*(<\/div>\s*<\/div>)\s*\n{3,}/i,
    '$1\n$2\n\n'
  );
  html = html.replace(
    /(<\/div>\s*<\/div>)\s*\n{3,}(?=<div class=['"]wiki-sidebar['"]>)/i,
    '$1\n\n'
  );
  html = html.replace(
    /\s*\n[ \t]*<div class=['"]wiki-sidebar['"]>/i,
    '\n\n  <div class="wiki-sidebar">'
  );
  return html;
}

export function getMissingTagsForPage(content: string, sourceTags: string[]): string[] {
  return getUndocumentedTags(content, sourceTags);
}

/** Tags not documented in the given HTML (used against original wiki without sync block). */
export function getUndocumentedTags(html: string, sourceTags: string[]): string[] {
  const missing: string[] = [];

  for (const tag of sourceTags) {
    const needle = `[${tag}:`;
    if (!html.includes(needle) && !html.includes(`>${tag}</th>`)) {
      missing.push(tag);
    }
  }

  return [...new Set(missing)].sort();
}

export function getSupplementTagsForPage(content: string, sourceTags: string[]): string[] {
  return getUndocumentedTags(removeSyncBlock(content), sourceTags);
}

export function getTagsInSyncBlock(content: string): Set<string> {
  const start = content.indexOf(SYNC_START);
  const end = content.indexOf(SYNC_END);
  if (start === -1 || end === -1) {
    return new Set();
  }

  const block = content.slice(start + SYNC_START.length, end);
  const tags = new Set<string>();
  const pattern = /<th align="left">Tag:<\/th>\s*<th align="left">([A-Za-z0-9_-]+)<\/th>/g;

  for (const match of block.matchAll(pattern)) {
    tags.add(match[1]);
  }

  return tags;
}

export function applyTargetMaxTargetValueNote(content: string): { content: string; changed: boolean } {
  if (!content.includes('MaxTargetValue') || content.includes('Default in MES source is 1')) {
    return { content, changed: false };
  }

  const updated = content.replace(
    'This tag specifies the maximum value a target must be at to be considered valid. Value must not be <code>lower</code> than <code>MinTargetValue</code>',
    'This tag specifies the maximum value a target must be at to be considered valid. Value must not be <code>lower</code> than <code>MinTargetValue</code>. <strong>Default in MES source is 1</strong> if omitted - use <code>[MaxTargetValue:-1]</code> to remove the upper cap.'
  );

  return { content: updated, changed: updated !== content };
}

import type { DiscoveredProfile } from './discoveredProfiles';

const PLAYER_LINE =
  '<li><a href="Player-Condition-Profile.html"><strong>Player Conditions (New)</strong></a></li>';

function buildDiscoveredSidebarLinks(profiles: DiscoveredProfile[]): string {
  return profiles
    .map(
      (profile) =>
        `<li><a href="${profile.htmlFile}"><strong>${profile.title}</strong></a></li>`
    )
    .join('\n');
}

function hasWikiSidebar(content: string): boolean {
  SIDEBAR_PATTERN.lastIndex = 0;
  return SIDEBAR_PATTERN.test(content);
}

export function updateSidebars(
  content: string,
  profiles: DiscoveredProfile[] = []
): { content: string; changed: boolean } {
  if (!hasWikiSidebar(content) || !content.includes(PLAYER_LINE) || profiles.length === 0) {
    return { content, changed: false };
  }

  let updated = content;
  for (const profile of profiles) {
    const pattern = new RegExp(
      `<li><a href="${escapeRegex(profile.htmlFile)}"><strong>[^<]*</strong></a></li>\\s*`,
      'g'
    );
    updated = updated.replace(pattern, '');
  }

  const sidebarLinks = buildDiscoveredSidebarLinks(profiles);
  const next = updated.replace(PLAYER_LINE, `${PLAYER_LINE}\n${sidebarLinks}`);

  return {
    content: next,
    changed: !contentEquals(content, next),
  };
}

export function removeHomeNotice(content: string): { content: string; changed: boolean } {
  if (!content.includes(HOME_NOTICE_START)) {
    return { content, changed: false };
  }

  const pattern = new RegExp(
    `${escapeRegex(HOME_NOTICE_START)}[\\s\\S]*?${escapeRegex(HOME_NOTICE_END)}\\s*`
  );
  const updated = content.replace(pattern, '');
  return { content: updated, changed: updated !== content };
}

export function setWikiPageAuthor(content: string, author: string): string {
  return content.replace(
    /<div class="gh-header-meta">Author: [^<]*<\/div>/,
    `<div class="gh-header-meta">Author: ${author}</div>`
  );
}

export function buildProfilePageFromTemplate(
  template: string,
  title: string,
  introHtml: string,
  tablesHtml: string,
  author: string
): string {
  let html = template.replace(/<title>[^<]*<\/title>/, `<title>${title} &middot; MES Reference Library</title>`);
  html = html.replace(
    /(<h1 class="gh-header-title">)[^<]*(<\/h1>)/,
    `$1${title}$2`
  );
  html = setWikiPageAuthor(html, author);

  const bodyContent = `${introHtml}
<p>Below you can find all tags parsed from MES source for this profile type:</p>
<div class="mes-profile-tag-tables">
${tablesHtml}
</div>`;

  const pattern =
    /(<div class="markdown-body">\s*)([\s\S]*?)(\s*<\/div>\s*<\/div>\s*(?=<div class=['"]wiki-sidebar['"]>))/;
  if (!pattern.test(html)) {
    throw new Error('Template markdown-body pattern not found');
  }

  return html.replace(pattern, `$1${bodyContent}$3`);
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeContent(content: string): string {
  return content.replace(/\r\n/g, '\n');
}

export function contentEquals(a: string, b: string): boolean {
  return normalizeContent(a) === normalizeContent(b);
}
