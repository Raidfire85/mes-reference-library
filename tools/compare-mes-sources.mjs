/**
 * Compare local Steam workshop MES source vs GitHub master.
 * Run: node tools/compare-mes-sources.mjs
 */
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';
import { parseTagMetaFromContent } from '../out/wikiSync/tagMetaParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSHOP =
  'C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\244850\\1521905890\\Data\\Scripts\\ModularEncountersSystems';
const GITHUB_ZIP =
  'https://codeload.github.com/MeridiusIX/Modular-Encounters-Systems/zip/refs/heads/master';
const CACHE = path.join(__dirname, '.mes-github-cache');
const GITHUB_ROOT = path.join(CACHE, 'Modular-Encounters-Systems-master', 'Data', 'Scripts', 'ModularEncountersSystems');

const PROFILE_FILES = [
  'ActionReferenceProfile.cs',
  'TargetProfile.cs',
  'AutoPilotProfile.cs',
  'SpawnConditionsProfile.cs',
  'ShipyardProfile.cs',
  'SafezoneProfile.cs',
  'StoreProfile.cs',
  'MissionProfile.cs',
  'WeaponSystemReference.cs',
];

async function hashFile(filePath) {
  const data = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function findFileRecursive(dir, fileName) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findFileRecursive(full, fileName);
      if (found) return found;
    } else if (entry.name === fileName) {
      return full;
    }
  }
  return null;
}

async function listCsFiles(dir, base = dir) {
  const files = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listCsFiles(full, base)));
    } else if (entry.name.endsWith('.cs')) {
      files.push(path.relative(base, full).replace(/\\/g, '/'));
    }
  }
  return files.sort();
}

async function downloadGithubZip() {
  await fs.mkdir(CACHE, { recursive: true });
  const zipPath = path.join(CACHE, 'master.zip');
  const extractMarker = path.join(CACHE, '.extracted');

  try {
    await fs.access(extractMarker);
    return;
  } catch {
    // need download
  }

  console.log('Downloading GitHub master zip...');
  const res = await fetch(GITHUB_ZIP);
  if (!res.ok) {
    throw new Error(`GitHub download failed: ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(zipPath, buffer);

  // Use PowerShell Expand-Archive (zip is standard, not gzip despite codeload URL sometimes)
  const { execSync } = await import('child_process');
  execSync(
    `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${CACHE.replace(/'/g, "''")}' -Force"`,
    { stdio: 'inherit' }
  );
  await fs.writeFile(extractMarker, new Date().toISOString());
  console.log('Extracted GitHub source.\n');
}

async function main() {
  try {
    await fs.access(WORKSHOP);
  } catch {
    console.error('Workshop path not found:', WORKSHOP);
    process.exit(1);
  }

  await downloadGithubZip();
  await fs.access(GITHUB_ROOT);

  const [workshopFiles, githubFiles] = await Promise.all([
    listCsFiles(WORKSHOP),
    listCsFiles(GITHUB_ROOT),
  ]);

  const workshopSet = new Set(workshopFiles);
  const githubSet = new Set(githubFiles);

  const onlyWorkshop = workshopFiles.filter((f) => !githubSet.has(f));
  const onlyGithub = githubFiles.filter((f) => !workshopSet.has(f));
  const common = workshopFiles.filter((f) => githubSet.has(f));

  console.log('=== File inventory (.cs) ===');
  console.log(`Workshop: ${workshopFiles.length} files`);
  console.log(`GitHub:   ${githubFiles.length} files`);
  console.log(`Common:   ${common.length} files`);
  console.log(`Only in workshop: ${onlyWorkshop.length}`);
  console.log(`Only in GitHub:   ${onlyGithub.length}`);

  if (onlyWorkshop.length > 0) {
    console.log('\nSample workshop-only:');
    onlyWorkshop.slice(0, 10).forEach((f) => console.log('  ', f));
  }
  if (onlyGithub.length > 0) {
    console.log('\nSample GitHub-only:');
    onlyGithub.slice(0, 10).forEach((f) => console.log('  ', f));
  }

  console.log('\n=== Content hash comparison (common .cs files) ===');
  let identical = 0;
  let different = 0;
  const diffs = [];

  for (const rel of common) {
    const wPath = path.join(WORKSHOP, rel);
    const gPath = path.join(GITHUB_ROOT, rel);
    const [wHash, gHash] = await Promise.all([hashFile(wPath), hashFile(gPath)]);
    if (wHash === gHash) {
      identical++;
    } else {
      different++;
      if (diffs.length < 20) {
        diffs.push(rel);
      }
    }
  }

  console.log(`Identical: ${identical}`);
  console.log(`Different: ${different}`);
  if (diffs.length > 0) {
    console.log('\nChanged files (up to 20):');
    diffs.forEach((f) => console.log('  ', f));
  }

  console.log('\n=== Profile tag counts (parser) ===');
  console.log('Profile'.padEnd(32), 'Workshop'.padStart(10), 'GitHub'.padStart(10), 'Delta'.padStart(8));
  console.log('-'.repeat(62));

  let totalW = 0;
  let totalG = 0;

  for (const profile of PROFILE_FILES) {
    const wFile = await findFileRecursive(WORKSHOP, profile);
    const gFile = await findFileRecursive(GITHUB_ROOT, profile);
    const wCount = wFile ? Object.keys(parseTagMetaFromContent(await fs.readFile(wFile, 'utf8'))).length : -1;
    const gCount = gFile ? Object.keys(parseTagMetaFromContent(await fs.readFile(gFile, 'utf8'))).length : -1;
    totalW += Math.max(0, wCount);
    totalG += Math.max(0, gCount);
    const delta = wCount >= 0 && gCount >= 0 ? gCount - wCount : 'N/A';
    console.log(
      profile.padEnd(32),
      String(wCount).padStart(10),
      String(gCount).padStart(10),
      String(delta).padStart(8)
    );
  }

  console.log('-'.repeat(62));
  console.log('TOTAL (sample profiles)'.padEnd(32), String(totalW).padStart(10), String(totalG).padStart(10), String(totalG - totalW).padStart(8));

  console.log('\n=== Verdict ===');
  if (different === 0 && onlyWorkshop.length === 0 && onlyGithub.length === 0) {
    console.log('Sources appear IDENTICAL for all .cs files.');
  } else if (different === 0 && (onlyWorkshop.length > 0 || onlyGithub.length > 0)) {
    console.log('Shared files are identical, but file lists differ (extra/missing files).');
  } else {
    const pct = common.length ? ((identical / common.length) * 100).toFixed(1) : 0;
    console.log(`${pct}% of common .cs files are byte-identical.`);
    console.log(`${different} file(s) have content differences.`);
    if (totalG > totalW) {
      console.log(`GitHub has ${totalG - totalW} more parsed tags across sample profiles.`);
    } else if (totalW > totalG) {
      console.log(`Workshop has ${totalW - totalG} more parsed tags across sample profiles.`);
    } else {
      console.log('Sample profile tag counts match.');
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
