import { Uri } from 'vscode';

export const WIKI_DIR = 'wiki';

export function getWikiUri(extensionUri: Uri): Uri {
  return Uri.joinPath(extensionUri, WIKI_DIR);
}
