import fs from 'fs/promises';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSHOP =
  'C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\244850\\1521905890\\Data\\Scripts\\ModularEncountersSystems';
const GITHUB = path.join(
  __dirname,
  '.mes-github-cache/Modular-Encounters-Systems-master/Data/Scripts/ModularEncountersSystems'
);

function normHash(content) {
  return crypto.createHash('sha256').update(content.replace(/\r\n/g, '\n')).digest('hex');
}

async function listCs(dir, base = dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await listCs(f, base)));
    } else if (e.name.endsWith('.cs')) {
      out.push(path.relative(base, f).replace(/\\/g, '/'));
    }
  }
  return out.sort();
}

const files = await listCs(WORKSHOP);
let same = 0;
let diff = 0;
const diffs = [];

for (const rel of files) {
  const [w, g] = await Promise.all([
    fs.readFile(path.join(WORKSHOP, rel), 'utf8'),
    fs.readFile(path.join(GITHUB, rel), 'utf8'),
  ]);
  if (normHash(w) === normHash(g)) {
    same++;
  } else {
    diff++;
    if (diffs.length < 20) {
      diffs.push(rel);
    }
  }
}

console.log('Normalized (LF) comparison of all 322 .cs files:');
console.log(`  Identical: ${same}`);
console.log(`  Different: ${diff}`);

if (diffs.length > 0) {
  console.log('\nDifferent files:');
  diffs.forEach((f) => console.log('  ', f));

  const rel = diffs[0];
  const [w, g] = await Promise.all([
    fs.readFile(path.join(WORKSHOP, rel), 'utf8'),
    fs.readFile(path.join(GITHUB, rel), 'utf8'),
  ]);
  const wLines = w.replace(/\r\n/g, '\n').split('\n');
  const gLines = g.replace(/\r\n/g, '\n').split('\n');
  console.log(`\nFirst diff sample (${rel}):`);
  let shown = 0;
  const max = Math.max(wLines.length, gLines.length);
  for (let i = 0; i < max && shown < 8; i++) {
    if (wLines[i] !== gLines[i]) {
      shown++;
      console.log(`  Line ${i + 1}`);
      console.log(`    Workshop: ${(wLines[i] ?? '(missing)').slice(0, 100)}`);
      console.log(`    GitHub:   ${(gLines[i] ?? '(missing)').slice(0, 100)}`);
    }
  }
}
