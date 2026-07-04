import path from 'path';
import { fileURLToPath } from 'url';
import { discoverAutoManagedProfiles } from '../out/wikiSync/profileDiscovery.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mes =
  'C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\244850\\1521905890\\Data\\Scripts\\ModularEncountersSystems';
const wiki = path.join(__dirname, '..', 'wiki');

const profiles = await discoverAutoManagedProfiles(mes, wiki);
console.log('Auto-managed profiles:', profiles.length);
for (const profile of profiles) {
  console.log(`  ${profile.profileCs} -> ${profile.htmlFile} (${profile.tagCount} tags) header=${profile.header ?? 'none'}`);
}
