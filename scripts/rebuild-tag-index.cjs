const path = require('path');

const root = path.join(__dirname, '..');

const mesSourcePath = path.join(
  root,
  'tools/.mes-github-cache/Modular-Encounters-Systems-master/Data/Scripts/ModularEncountersSystems'
);
const wikiDir = path.join(root, 'wiki');

async function main() {
  const builderPath = path.join(root, 'out/wikiSync/profileTagIndexBuilder.js');
  const { buildProfileTagIndex, saveProfileTagIndex } = require(builderPath);

  const index = await buildProfileTagIndex(mesSourcePath, wikiDir, 'MES GitHub cache (rebuild)');
  const changed = await saveProfileTagIndex(wikiDir, index);

  const behavior = index.profiles.find((p) => p.profileCs === 'Behavior/Subsystems');
  const manip = index.profiles.find((p) => p.profileCs === 'ManipulationProfile.cs');
  const spawnGroup = index.profiles.find((p) => p.profileCs === 'ImprovedSpawnGroup.cs');
  const spawnCond = index.profiles.find((p) => p.profileCs === 'SpawnConditionsProfile.cs');

  const check = (tags, name) => (tags ?? []).includes(name);
  console.log(changed ? 'profile-tag-index rebuilt' : 'profile-tag-index unchanged');
  console.log('  profiles:', index.profiles.length);
  console.log('  tags:', Object.keys(index.tagToHeaders).length);
  console.log('  BehaviorName:', check(behavior?.tags, 'BehaviorName'));
  console.log('  TargetData:', check(behavior?.tags, 'TargetData'));
  console.log('  TriggerGroups:', check(behavior?.tags, 'TriggerGroups'));
  console.log('  WeaponSystem:', check(behavior?.tags, 'WeaponSystem'));
  console.log('  UseThreatLevelCheck:', check(spawnCond?.tags, 'UseThreatLevelCheck'));
  console.log('  UseRivalAi (manip):', check(manip?.tags, 'UseRivalAi'));
  console.log('  UseRivalAi (spawn group):', check(spawnGroup?.tags, 'UseRivalAi'));
  console.log('  ManipulationProfile tag count:', manip?.tags?.length ?? 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
