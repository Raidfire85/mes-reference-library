#!/usr/bin/env node
/**
 * Scans Space Engineers vanilla Content/Data for <Definitions> child roots.
 * Regenerates src/sbc/vanillaSeDefinitionRoots.ts
 *
 * Usage:
 *   node scripts/scan-vanilla-se-roots.cjs
 *   node scripts/scan-vanilla-se-roots.cjs "D:/Steam/.../SpaceEngineers/Content/Data"
 */
const fs = require('fs/promises');
const path = require('path');

const DEFAULT_SE_DATA =
  'C:/Program Files (x86)/Steam/steamapps/common/SpaceEngineers/Content/Data';

const ROOT = path.join(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'src/sbc/vanillaSeDefinitionRoots.ts');

function humanizeRoot(name) {
  const special = {
    AIBehaviors: 'AI behaviors',
    LCDTextures: 'LCD textures',
    DLCs: 'DLC definitions',
    XML: 'XML definitions',
  };
  if (special[name]) {
    return special[name];
  }

  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function extractDirectDefinitionsChildren(text) {
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

function extractXsiType(openTag) {
  const match = openTag.match(/\bxsi:type="([^"]+)"/i);
  return match?.[1] ?? null;
}

async function walkSbcFiles(dir, out = []) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkSbcFiles(full, out);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.sbc')) {
      out.push(full);
    }
  }

  return out;
}

async function main() {
  const dataRoot = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_SE_DATA;

  try {
    const stat = await fs.stat(dataRoot);
    if (!stat.isDirectory()) {
      throw new Error('not a directory');
    }
  } catch {
    console.error(`Space Engineers Data folder not found: ${dataRoot}`);
    process.exit(2);
  }

  const files = await walkSbcFiles(dataRoot);
  const roots = new Map();

  for (const filePath of files) {
    const text = await fs.readFile(filePath, 'utf8');
    const children = extractDirectDefinitionsChildren(text);

    for (const child of children) {
      const key = child.name;
      if (!roots.has(key)) {
        roots.set(key, {
          label: humanizeRoot(key),
          xsiTypes: new Set(),
          fileCount: 0,
        });
      }

      const entry = roots.get(key);
      entry.fileCount++;
      if (child.xsiType) {
        entry.xsiTypes.add(child.xsiType);
      }
    }
  }

  const sorted = [...roots.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const lines = sorted.map(([name, meta]) => {
    const xsiTypes = [...meta.xsiTypes].sort();
    const xsiPart =
      xsiTypes.length > 0
        ? `\n    xsiTypes: [${xsiTypes.map((t) => `'${t}'`).join(', ')}],`
        : '';
    return `  ${JSON.stringify(name)}: {
    label: ${JSON.stringify(meta.label)},${xsiPart}
  }`;
  });

  const contents = `/**
 * Vanilla Space Engineers <Definitions> child roots.
 * Generated from SE install Data folder — run: node scripts/scan-vanilla-se-roots.cjs
 * Source: ${dataRoot.replace(/\\/g, '/')}
 * Files scanned: ${files.length}
 */
export interface VanillaSeRootInfo {
  label: string;
  xsiTypes?: string[];
}

export const VANILLA_SE_DEFINITION_ROOTS: Record<string, VanillaSeRootInfo> = {
${lines.join(',\n')}
};

export const DEFAULT_VANILLA_SE_LABEL = 'Space Engineers definitions';
`;

  await fs.writeFile(OUT_FILE, contents, 'utf8');
  console.log(`Wrote ${OUT_FILE}`);
  console.log(`Scanned ${files.length} vanilla .sbc files, ${sorted.length} definition roots.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
