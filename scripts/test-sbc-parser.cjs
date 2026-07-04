#!/usr/bin/env node
/**
 * Smoke tests for SBC parsing and file classification.
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs/promises');

const root = path.join(__dirname, '..');
const { parseSbcDocument } = require(path.join(root, 'out/sbc/sbcParser.js'));
const { classifySbcFile } = require(path.join(root, 'out/sbc/sbcFileClassification.js'));
const { extractDirectDefinitionsChildren } = require(path.join(root, 'out/sbc/definitionsXml.js'));

const ENTITY_COMPONENT_FIXTURE = `<?xml version="1.0"?>
<Definitions>
  <EntityComponents>
    <EntityComponent xsi:type="MyObjectBuilder_InventoryComponentDefinition">
      <Id>
        <TypeId>Inventory</TypeId>
        <SubtypeId>MES-Profile-A</SubtypeId>
      </Id>
      <Description>
        [MES Spawn Conditions]
        [SpaceCargoShip:true]
      </Description>
    </EntityComponent>
    <EntityComponent xsi:type="MyObjectBuilder_InventoryComponentDefinition">
      <Id>
        <TypeId>Inventory</TypeId>
        <SubtypeId>MES-Profile-B</SubtypeId>
      </Id>
      <Description>
        [MES Spawn Conditions]
        [ContainerTypes:Some-Container-Not-Profile-Id]
      </Description>
    </EntityComponent>
  </EntityComponents>
</Definitions>`;

const SPAWN_GROUP_FIXTURE = `<?xml version="1.0"?>
<Definitions>
  <SpawnGroups>
    <SpawnGroup>
      <Id>
        <TypeId>SpawnGroupDefinition</TypeId>
        <SubtypeId>SG-Test</SubtypeId>
      </Id>
      <Description>
        [Modular Encounters SpawnGroup]
        [FactionOwner:SPRT]
      </Description>
      <Prefabs>
        <Prefab SubtypeId="(NPC-Test) Prefab Name">
          <Speed>25</Speed>
        </Prefab>
      </Prefabs>
    </SpawnGroup>
  </SpawnGroups>
</Definitions>`;

const VANILLA_SPAWN_GROUP_FIXTURE = `<?xml version="1.0"?>
<Definitions>
  <SpawnGroups>
    <SpawnGroup>
      <Id>
        <TypeId>SpawnGroupDefinition</TypeId>
        <SubtypeId>WildWolf</SubtypeId>
      </Id>
      <Description>Wild animal encounter spawn group</Description>
      <Frequency>5.0</Frequency>
      <Prefabs>
        <Prefab SubtypeId="WildWolfPrefab">
          <Speed>10</Speed>
        </Prefab>
      </Prefabs>
    </SpawnGroup>
  </SpawnGroups>
</Definitions>`;

const VANILLA_BEHAVIOR_FIXTURE = `<?xml version="1.0"?>
<Definitions>
  <BehaviorTrees>
    <BehaviorTree>
      <Id>
        <SubtypeId>WildAnimalBehavior</SubtypeId>
      </Id>
      <Description>Vanilla wild AI behavior tree</Description>
    </BehaviorTree>
  </BehaviorTrees>
</Definitions>`;

function testEntityComponentProfiles() {
  const parsed = parseSbcDocument(ENTITY_COMPONENT_FIXTURE);
  assert.strictEqual(parsed.profiles.length, 2);
  assert.strictEqual(parsed.profiles[0].subtypeId, 'MES-Profile-A');
  assert.strictEqual(parsed.profiles[1].subtypeId, 'MES-Profile-B');
  assert.ok(!parsed.subtypeIds.has('Some-Container-Not-Profile-Id'));
}

function testSpawnGroupIgnoresPrefabSubtypeId() {
  const parsed = parseSbcDocument(SPAWN_GROUP_FIXTURE);
  assert.strictEqual(parsed.profiles.length, 1);
  assert.strictEqual(parsed.profiles[0].subtypeId, 'SG-Test');
  assert.deepStrictEqual([...parsed.subtypeIds.keys()], ['SG-Test']);
}

function testClassifyMesSpawnGroupAsMesProfiles() {
  const result = classifySbcFile(SPAWN_GROUP_FIXTURE);
  assert.strictEqual(result.kind, 'mes-profiles');
  assert.ok(result.profileCount >= 1);
}

function testClassifyVanillaSpawnGroupAsSkipped() {
  const result = classifySbcFile(VANILLA_SPAWN_GROUP_FIXTURE);
  assert.strictEqual(result.kind, 'vanilla-se');
  assert.strictEqual(result.vanillaLabel, 'Spawn Groups');
  assert.strictEqual(result.profileCount, 0);
}

function testClassifyVanillaBehaviorTreeAsSkipped() {
  const result = classifySbcFile(VANILLA_BEHAVIOR_FIXTURE);
  assert.strictEqual(result.kind, 'vanilla-se');
  assert.strictEqual(result.vanillaLabel, 'Behavior Trees');
}

function testClassifyMesEntityComponentsAsMesProfiles() {
  const result = classifySbcFile(ENTITY_COMPONENT_FIXTURE);
  assert.strictEqual(result.kind, 'mes-profiles');
  assert.strictEqual(result.profileCount, 2);
}

const VANILLA_AI_BEHAVIOR_FIXTURE = `<?xml version="1.0"?>
<Definitions>
  <AIBehaviors>
    <AIBehavior xsi:type="MyObjectBuilder_BehaviorTreeDefinition">
      <Id>
        <TypeId>MyObjectBuilder_BehaviorTreeDefinition</TypeId>
        <SubtypeId>DeerBehavior</SubtypeId>
      </Id>
    </AIBehavior>
  </AIBehaviors>
</Definitions>`;

function testClassifyVanillaAiBehaviorsAsSkipped() {
  const result = classifySbcFile(VANILLA_AI_BEHAVIOR_FIXTURE);
  assert.strictEqual(result.kind, 'vanilla-se');
  assert.strictEqual(result.vanillaLabel, 'AI behaviors');
}

function testClassifyGenericSeFileAsSkipped() {
  const result = classifySbcFile('<?xml version="1.0"?><Definitions><WeirdRoot><Item /></WeirdRoot></Definitions>');
  assert.strictEqual(result.kind, 'vanilla-se');
  assert.strictEqual(result.vanillaLabel, 'Weird Root');
}

async function testMesUpstreamSample() {
  const samplePath = path.join(
    root,
    'tools/.mes-github-cache/Modular-Encounters-Systems-master/Data/Profiles/SpawnConditions/AllCargoShipA.sbc'
  );

  let text;
  try {
    text = await fs.readFile(samplePath, 'utf8');
  } catch {
    console.log('skip upstream sample (cache not present)');
    return;
  }

  const parsed = parseSbcDocument(text);
  assert.strictEqual(parsed.profiles.length, 2);
  assert.strictEqual(parsed.profiles[0].subtypeId, 'MES-SpawnConditions-AllCargoShipA');
  assert.strictEqual(parsed.profiles[1].subtypeId, 'MES-SpawnConditions-AllCargoShipA-Escort');

  const classification = classifySbcFile(text);
  assert.strictEqual(classification.kind, 'mes-profiles');
}

async function testMesCreatureDummySpawnGroup() {
  const samplePath = path.join(
    root,
    'tools/.mes-github-cache/Modular-Encounters-Systems-master/Data/Profiles/CreatureDummy.sbc'
  );

  let text;
  try {
    text = await fs.readFile(samplePath, 'utf8');
  } catch {
    console.log('skip CreatureDummy sample (cache not present)');
    return;
  }

  const classification = classifySbcFile(text);
  assert.strictEqual(classification.kind, 'mes-profiles');
  assert.ok(classification.profileCount >= 1);
}

async function testVanillaSeInstallSample() {
  const samplePath =
    'C:/Program Files (x86)/Steam/steamapps/common/SpaceEngineers/Content/Data/AIBehavior.sbc';

  let text;
  try {
    text = await fs.readFile(samplePath, 'utf8');
  } catch {
    console.log('skip vanilla SE install sample (game not installed at default path)');
    return;
  }

  const children = extractDirectDefinitionsChildren(text);
  assert.deepStrictEqual(children.map((c) => c.name), ['AIBehaviors']);

  const classification = classifySbcFile(text);
  assert.strictEqual(classification.kind, 'vanilla-se');
  assert.strictEqual(classification.vanillaLabel, 'AI behaviors');
}

async function main() {
  testEntityComponentProfiles();
  testSpawnGroupIgnoresPrefabSubtypeId();
  testClassifyMesSpawnGroupAsMesProfiles();
  testClassifyVanillaSpawnGroupAsSkipped();
  testClassifyVanillaBehaviorTreeAsSkipped();
  testClassifyMesEntityComponentsAsMesProfiles();
  testClassifyVanillaAiBehaviorsAsSkipped();
  testClassifyGenericSeFileAsSkipped();
  await testMesUpstreamSample();
  await testMesCreatureDummySpawnGroup();
  await testVanillaSeInstallSample();
  console.log('sbcParser and classification smoke tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
