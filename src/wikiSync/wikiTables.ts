import { WikiTableStyle } from './constants';
import { TagMetaMap } from './tagMetaParser';
import { getTypeHint, inferDescription } from './typeHints';

export function buildWikiTagTable(
  tagName: string,
  description: string,
  allowedValuesHtml: string,
  multipleAllowed: string,
  style: WikiTableStyle,
  filterRequired?: string
): string {
  let rows = `<tr>
<td align="left">Tag Format:</td>
<td align="left"><code>[${tagName}:Value]</code></td>
</tr>
<tr>
<td align="left">Description:</td>
<td align="left">${description}</td>
</tr>`;

  if (style === 'Target' && filterRequired) {
    rows += `
<tr>
<td align="left">Filter Required:</td>
<td align="left"><code>${filterRequired}</code></td>
</tr>`;
  }

  if (style === 'Target') {
    rows += `
<tr>
<td align="left">Allowed Values:</td>
<td align="left">${allowedValuesHtml}</td>
</tr>
<tr>
<td align="left">Multiple Tag Allowed:</td>
<td align="left">${multipleAllowed}</td>
</tr>`;
  } else if (style === 'Prefab') {
    rows += `
<tr>
<td align="left">Allowed Value(s):</td>
<td align="left">${allowedValuesHtml}</td>
</tr>
<tr>
<td align="left">Default Value(s):</td>
<td align="left"><code>N/A</code></td>
</tr>
<tr>
<td align="left">Multiple Tags Allowed:</td>
<td align="left">${multipleAllowed}</td>
</tr>`;
  } else {
    rows += `
<tr>
<td align="left">Allowed Value(s):</td>
<td align="left">${allowedValuesHtml}</td>
</tr>
<tr>
<td align="left">Multiple Tags Allowed:</td>
<td align="left">${multipleAllowed}</td>
</tr>`;
  }

  return `<div class="mes-tag-table-wrap"><table role="table">
<thead>
<tr>
<th align="left">Tag:</th>
<th align="left">${tagName}</th>
</tr>
</thead>
<tbody>
${rows}
</tbody>
</table></div>`;
}

export function buildTagTableFromMeta(
  tagName: string,
  meta: TagMetaMap,
  tagDescriptions: Record<string, string>,
  style: WikiTableStyle
): string {
  const parseType = meta[tagName] ?? 'Unknown';
  const hint = getTypeHint(parseType);
  const multipleAllowed = hint.multipleAllowed ? 'Yes' : 'No';
  const description =
    tagDescriptions[tagName] ?? inferDescription(tagName, parseType);

  return buildWikiTagTable(
    tagName,
    description,
    hint.allowedValuesHtml,
    multipleAllowed,
    style
  );
}

export function backfillNanDescriptionsInWikiContent(
  content: string,
  tagDescriptions: Record<string, string>,
  meta: TagMetaMap = {}
): string {
  const pattern =
    /(<div class="wiki-content">\s*<div class="markdown-body">)([\s\S]*)(<\/div>\s*<\/div>\s*(?=<div class=['"]wiki-sidebar['"]>))/;

  return content.replace(pattern, (_, head, body, tail) => {
    return `${head}${backfillNanDescriptionsInFragment(body, tagDescriptions, meta)}${tail}`;
  });
}

function backfillNanDescriptionsInFragment(
  fragment: string,
  tagDescriptions: Record<string, string>,
  meta: TagMetaMap
): string {
  return fragment.replace(/<table(\s[^>]*)>([\s\S]*?)<\/table>/gi, (tableHtml) => {
    if (!/>nan</i.test(tableHtml)) {
      return tableHtml;
    }

    const tagMatch = tableHtml.match(
      /<th align="left">Tag:[^<]*<\/th>\s*<th align="left">([A-Za-z0-9_-]+)<\/th>/i
    );
    if (!tagMatch) {
      return tableHtml;
    }

    const tag = tagMatch[1];
    const parseType = meta[tag] ?? 'Unknown';
    const hint = getTypeHint(parseType);
    let updated = tableHtml;

    if (/(<td align="left">Description:<\/td>\s*<td align="left">)nan(<\/td>)/i.test(updated)) {
      const description = tagDescriptions[tag] ?? inferDescription(tag, parseType);
      if (description && description !== 'nan') {
        updated = updated.replace(
          /(<td align="left">Description:<\/td>\s*<td align="left">)nan(<\/td>)/i,
          `$1${description}$2`
        );
      }
    }

    updated = updated.replace(
      /(<td align="left">Multiple Tags? Allowed:<\/td>\s*<td align="left">)nan(<\/td>)/i,
      `$1${hint.multipleAllowed ? 'yes' : 'no'}$2`
    );

    return updated;
  });
}

export function buildSupplementHeader(): string {
  return `<div class="mes-wiki-sync-section">
<div class="markdown-heading"><h2 class="heading-element">Additional Tags (MES Source Sync)</h2></div>
<p>The tags below exist in the current MES workshop/GitHub source but were not present in the original MeridiusIX wiki page. Descriptions are generated from MES source code (ActionSystem handlers, profile fields, and tag naming).</p>`;
}
