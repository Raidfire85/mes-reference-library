import * as path from 'path';
import { Uri } from 'vscode';
import { loadDiscoveredProfilesFile } from './discoveredProfiles';
import { setDiscoveredProfileHeaders } from '../sbc/profileHeaders';

export async function refreshDiscoveredHeaders(extensionUri: Uri): Promise<void> {
  const wikiDir = path.join(extensionUri.fsPath, 'wiki');
  const file = await loadDiscoveredProfilesFile(wikiDir);
  const map: Record<string, string> = {};

  for (const profile of file.profiles) {
    if (profile.header) {
      map[profile.header] = profile.htmlFile;
    }
  }

  setDiscoveredProfileHeaders(map);
}
