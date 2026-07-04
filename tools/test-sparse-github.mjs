/**
 * Test sparse GitHub download (scripts folder only).
 * Run: node tools/test-sparse-github.mjs
 */
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const GITHUB_REPO = 'MeridiusIX/Modular-Encounters-Systems';
const GITHUB_BRANCH = 'master';
const MES_SCRIPTS_GITHUB_PATH = 'Data/Scripts/ModularEncountersSystems';
const GITHUB_TREE_API = `https://api.github.com/repos/${GITHUB_REPO}/git/trees/${GITHUB_BRANCH}?recursive=1`;
const GITHUB_RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}`;

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mes-ref-test-'));
const sourcePath = path.join(tempRoot, 'ModularEncountersSystems');

try {
  const treeRes = await fetch(GITHUB_TREE_API, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'mes-reference-library-test',
    },
  });
  const tree = await treeRes.json();
  const prefix = `${MES_SCRIPTS_GITHUB_PATH}/`;
  const files = tree.tree
    .filter((e) => e.type === 'blob' && e.path.startsWith(prefix))
    .map((e) => e.path.slice(prefix.length));

  console.log('Files to download:', files.length);
  console.log('Sample:', files.slice(0, 3).join(', '));

  await fs.mkdir(sourcePath, { recursive: true });
  let i = 0;
  for (const rel of files) {
    const url = `${GITHUB_RAW_BASE}/${MES_SCRIPTS_GITHUB_PATH}/${rel}`;
    const res = await fetch(url);
    const buf = Buffer.from(await res.arrayBuffer());
    const out = path.join(sourcePath, rel);
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, buf);
    i++;
  }

  console.log('Downloaded:', i);
  console.log('Temp path:', sourcePath);
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
  console.log('Cleaned up temp folder.');
}
