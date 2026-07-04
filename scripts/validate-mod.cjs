#!/usr/bin/env node
/**
 * Headless mod validation CLI (no VS Code required).
 *
 * Usage:
 *   node scripts/validate-mod.cjs --data "C:\path\to\mod\Data"
 *   node scripts/validate-mod.cjs --data "C:\path\to\mod\Data" --out report.json
 *   npm run validate-mod -- --data "C:\path\to\mod\Data"
 */
const fs = require('fs/promises');
const path = require('path');

const root = path.join(__dirname, '..');

function parseArgs(argv) {
  let dataRoot = '';
  let outPath = '';

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--data' || arg === '-d') {
      dataRoot = argv[++i] ?? '';
    } else if (arg === '--out' || arg === '-o') {
      outPath = argv[++i] ?? '';
    } else if (!arg.startsWith('-') && !dataRoot) {
      dataRoot = arg;
    }
  }

  return { dataRoot, outPath };
}

async function walkSbc(dir, out = []) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkSbc(full, out);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.sbc')) {
      out.push(full);
    }
  }

  return out;
}

async function main() {
  const { dataRoot: dataArg, outPath: outArg } = parseArgs(process.argv);
  const dataRoot = dataArg ? path.resolve(dataArg) : '';

  if (!dataRoot) {
    console.error('Usage: node scripts/validate-mod.cjs --data <path-to-mod-Data-folder> [--out report.json]');
    process.exit(2);
  }

  try {
    const stat = await fs.stat(dataRoot);
    if (!stat.isDirectory()) {
      throw new Error('not a directory');
    }
  } catch {
    console.error(`Data folder not found: ${dataRoot}`);
    process.exit(2);
  }

  const { buildTagRegistry } = require(path.join(root, 'out/sbc/tagRegistry.js'));
  const { loadProfileTagIndex } = require(path.join(root, 'out/sbc/profileTagIndex.js'));
  const { buildModValidationReport } = require(path.join(root, 'out/sbc/modValidationReport.js'));

  const filePaths = await walkSbc(dataRoot);
  const fileContents = new Map();
  for (const filePath of filePaths) {
    fileContents.set(filePath, await fs.readFile(filePath, 'utf8'));
  }

  const registry = await buildTagRegistry({ fsPath: root });
  const profileTagIndex = await loadProfileTagIndex({ fsPath: root });
  const report = await buildModValidationReport(
    dataRoot,
    filePaths,
    fileContents,
    registry,
    profileTagIndex,
    0
  );

  const byCode = new Map();
  for (const file of report.filesWithIssues) {
    for (const issue of file.issues) {
      byCode.set(issue.code, (byCode.get(issue.code) ?? 0) + 1);
    }
  }

  console.log('Mod:', report.modName);
  console.log('Scope:', report.scopeLabel);
  console.log('Files:', report.scannedFileCount, 'Profiles:', report.profileCount);
  console.log('Errors:', report.errorCount, 'Warnings:', report.warningCount);
  console.log('Files with issues:', report.filesWithIssues.length);
  console.log('Issue breakdown:');
  [...byCode.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([code, count]) => console.log(`  ${code}: ${count}`));

  const modSlug = report.modName.replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '') || 'mod';
  const outPath = outArg
    ? path.resolve(outArg)
    : path.join(root, `${modSlug}-validation-report.json`);

  await fs.writeFile(
    outPath,
    JSON.stringify({ byCode: Object.fromEntries(byCode), report }, null, 2)
  );
  console.log('Wrote', outPath);

  process.exit(report.errorCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
