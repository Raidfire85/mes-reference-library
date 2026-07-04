import { validateSbc } from '../out/sbc/sbcValidator.js';
import { buildTagRegistry } from '../out/sbc/tagRegistry.js';
import { loadProfileTagIndex } from '../out/sbc/profileTagIndex.js';
import { buildModScopeContext } from '../out/sbc/modProfileIndex.js';

const targetSbc = `<?xml version="1.0"?>
<Definitions><EntityComponents><EntityComponent>
<Id><SubtypeId>TA-Target-A</SubtypeId></Id>
<Description>[RivalAI Target]
[UseCustomTargeting:true]
</Description></EntityComponent></EntityComponents></Definitions>`;

const triggerWrong = `<?xml version="1.0"?>
<Definitions><EntityComponents><EntityComponent>
<Id><SubtypeId>TA-Trigger-A</SubtypeId></Id>
<Description>[RivalAI Trigger]
[Type:Timer]
[Actions:TA-Target-A]
</Description></EntityComponent></EntityComponents></Definitions>`;

const ext = { fsPath: new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1') };
const registry = await buildTagRegistry(ext);
const index = await loadProfileTagIndex(ext);
const sources = new Map([
  ['Targets/TA-Target.sbc', targetSbc],
  ['Triggers/TA-Trigger.sbc', triggerWrong],
]);
const modScope = buildModScopeContext(sources, 'mod Data (TestMod)', 2, 0);
const issues = validateSbc(triggerWrong, registry, { profileTagIndex: index, modScope });

console.log(
  issues
    .filter((issue) => issue.code === 'mes-wrong-reference-profile')
    .map((issue) => issue.message)
    .join('\n') || 'No wrong-reference warnings (unexpected)'
);
