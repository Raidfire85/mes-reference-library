import * as path from 'path';

/** Walk up from an .sbc file to the mod's Data folder (SE mod layout). */
export function findModDataRoot(filePath: string): string | null {
  let dir = path.dirname(filePath);

  while (true) {
    if (path.basename(dir).toLowerCase() === 'data') {
      return dir;
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

export function isPathUnderRoot(filePath: string, root: string): boolean {
  const normalizedFile = path.normalize(filePath).toLowerCase();
  const normalizedRoot = path.normalize(root).toLowerCase();
  const rootWithSep = normalizedRoot.endsWith(path.sep)
    ? normalizedRoot
    : normalizedRoot + path.sep;
  return normalizedFile.startsWith(rootWithSep) || normalizedFile === normalizedRoot;
}

export function describeReferenceScope(dataRoot: string | null): string {
  if (!dataRoot) {
    return 'nearby .sbc files';
  }

  const modRoot = path.dirname(dataRoot);
  const modName = path.basename(modRoot);
  return modName ? `mod Data (${modName})` : 'mod Data';
}
