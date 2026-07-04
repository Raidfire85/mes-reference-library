import Module from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const vscodeShimPath = path.join(__dirname, 'vscode-shim.cjs');

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'vscode') {
    return vscodeShimPath;
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const { WikiSyncService } = await import('../out/wikiSync/wikiSyncService.js');

console.log(`Wiki sync starting for ${repoRoot}`);
if (process.env.MES_SOURCE_PATH) {
  console.log(`Using local MES source: ${process.env.MES_SOURCE_PATH}`);
} else {
  console.log('Downloading MES source from GitHub master...');
}

const sync = new WikiSyncService({ fsPath: repoRoot });
const result = await sync.syncFromMesSource({
  report: ({ message }) => {
    if (message) {
      console.log(`  ${message}`);
    }
  },
});

console.log('\nSource:', result.sourceLabel);

if (result.updated.length > 0) {
  console.log('\nUpdated:');
  for (const line of result.updated) {
    console.log(`  - ${line}`);
  }
} else {
  console.log('\nNo wiki pages needed updates.');
}

if (result.errors.length > 0) {
  console.error('\nErrors:');
  for (const line of result.errors) {
    console.error(`  - ${line}`);
  }
  process.exit(1);
}

console.log('\nSync complete.');
