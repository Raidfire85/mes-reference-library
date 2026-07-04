/**
 * Shallow XML helpers for Space Engineers .sbc <Definitions> blocks.
 */
export interface DefinitionsChild {
  name: string;
  xsiType: string | null;
}

export function extractDirectDefinitionsChildren(text: string): DefinitionsChild[] {
  const open = text.search(/<Definitions\b/i);
  if (open < 0) {
    return [];
  }

  const close = text.indexOf('</Definitions>', open);
  if (close < 0) {
    return [];
  }

  const inner = text.slice(open, close);
  const children = [];
  const tagRe = /<([A-Za-z][A-Za-z0-9_]*)\b[^>]*>/g;
  let depth = 0;
  let match;

  while ((match = tagRe.exec(inner)) !== null) {
    const tag = match[0];
    const name = match[1];

    if (name === 'Definitions') {
      depth = 1;
      continue;
    }

    if (tag.startsWith('</')) {
      depth--;
      continue;
    }

    if (tag.endsWith('/>')) {
      if (depth === 1) {
        children.push({ name, xsiType: extractXsiType(tag) });
      }
      continue;
    }

    if (depth === 1) {
      children.push({ name, xsiType: extractXsiType(tag) });
    }
    depth++;
  }

  return children;
}

function extractXsiType(openTag: string): string | null {
  const match = openTag.match(/\bxsi:type="([^"]+)"/i);
  return match?.[1] ?? null;
}
