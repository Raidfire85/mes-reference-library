/** RivalAI / MES AI header pairs parsed by the same profile .cs file. */
const HEADER_EQUIVALENTS: Record<string, string> = {
  '[MES AI Action]': '[RivalAI Action]',
  '[MES AI Autopilot]': '[RivalAI Autopilot]',
  '[MES AI Behavior]': '[RivalAI Behavior]',
  '[Rival AI Behavior]': '[RivalAI Behavior]',
  '[MES AI Chat]': '[RivalAI Chat]',
  '[MES AI Command]': '[RivalAI Command]',
  '[MES AI Condition]': '[RivalAI Condition]',
  '[MES AI Spawn]': '[RivalAI Spawn]',
  '[MES AI Target]': '[RivalAI Target]',
  '[MES AI Trigger]': '[RivalAI Trigger]',
  '[MES AI TriggerGroup]': '[RivalAI TriggerGroup]',
  '[MES AI Waypoint]': '[RivalAI Waypoint]',
  '[MES AI Weapons]': '[RivalAI Weapons]',
};

const TARGET_HEADERS = ['[RivalAI Target]', '[MES AI Target]'];
const AUTOPILOT_HEADERS = ['[RivalAI Autopilot]', '[MES AI Autopilot]'];
const ACTION_HEADERS = ['[RivalAI Action]', '[MES AI Action]'];
const CONDITION_HEADERS = ['[RivalAI Condition]', '[MES AI Condition]'];
const TRIGGER_HEADERS = ['[RivalAI Trigger]', '[MES AI Trigger]'];
const TRIGGER_GROUP_HEADERS = ['[RivalAI TriggerGroup]', '[MES AI TriggerGroup]'];
const CHAT_HEADERS = ['[RivalAI Chat]', '[MES AI Chat]'];
const SPAWN_HEADERS = ['[RivalAI Spawn]', '[MES AI Spawn]'];
const WEAPONS_HEADERS = ['[RivalAI Weapons]', '[MES AI Weapons]'];
const WAYPOINT_HEADERS = ['[RivalAI Waypoint]', '[MES AI Waypoint]'];
const COMMAND_HEADERS = ['[RivalAI Command]', '[MES AI Command]'];

const EXACT_REFERENCE_HEADERS: Record<string, string[]> = {
  TargetData: TARGET_HEADERS,
  OverrideTargetData: TARGET_HEADERS,
  NewTargetProfile: TARGET_HEADERS,
  NewTargetProfileId: TARGET_HEADERS,
  AutopilotData: AUTOPILOT_HEADERS,
  SecondaryAutopilotData: AUTOPILOT_HEADERS,
  TertiaryAutopilotData: AUTOPILOT_HEADERS,
  Actions: ACTION_HEADERS,
  Conditions: CONDITION_HEADERS,
  Triggers: TRIGGER_HEADERS,
  TriggerGroups: TRIGGER_GROUP_HEADERS,
  ChatData: CHAT_HEADERS,
  Spawner: SPAWN_HEADERS,
  WeaponsSystem: WEAPONS_HEADERS,
  WeaponsSystemProfile: WEAPONS_HEADERS,
  PlanetWaypointProfile: WAYPOINT_HEADERS,
  CommandProfileIds: COMMAND_HEADERS,
  PlayerConditionIds: ['[MES Player Condition]'],
  PlayerConditionProfileIds: ['[MES Player Condition]'],
  ActionIds: ['[MES Event Action]'],
  ConditionIds: ['[MES Event Condition]'],
  PersistantConditionIds: ['[MES Event Condition]'],
  EventConditionIds: ['[MES Event Condition]'],
  PersistantEventConditionIds: ['[MES Event Condition]'],
  RequiredSpawnConditions: ['[MES Spawn Conditions]'],
  StoreProfileId: ['[MES Store]'],
  MissionIds: ['[MES Mission]'],
  SafeZoneProfile: ['[MES SafeZone]'],
  ActivateEventIds: ['[MES Event]'],
  ToggleEventIds: ['[MES Event]'],
  ResetEventCooldownIds: ['[MES Event]'],
  IncreaseRunCountEventIds: ['[MES Event]'],
  BlockReplacementProfileIds: ['[MES Block Replacement]'],
  WeaponRandomizationOverrideProfile: ['[Modular Encounters SpawnGroup]'],
};

const REFERENCE_SUFFIX_HEADERS: Array<{ suffix: string; headers: string[] }> = [
  { suffix: 'PlayerConditionIds', headers: ['[MES Player Condition]'] },
  { suffix: 'PlayerConditionProfileIds', headers: ['[MES Player Condition]'] },
];

export function normalizeHeaderForReferenceMatch(header: string): string {
  return HEADER_EQUIVALENTS[header] ?? header;
}

export function getExpectedHeadersForReferenceTag(tagName: string): string[] | null {
  if (EXACT_REFERENCE_HEADERS[tagName]) {
    return EXACT_REFERENCE_HEADERS[tagName];
  }

  for (const rule of REFERENCE_SUFFIX_HEADERS) {
    if (tagName.endsWith(rule.suffix) && tagName !== 'BehaviorName') {
      return rule.headers;
    }
  }

  return null;
}

export function headerMatchesReferenceExpectation(
  actualHeader: string | null,
  expectedHeaders: string[]
): boolean {
  if (!actualHeader) {
    return false;
  }

  const normalizedActual = normalizeHeaderForReferenceMatch(actualHeader);
  return expectedHeaders.some(
    (expected) => normalizeHeaderForReferenceMatch(expected) === normalizedActual
  );
}

export function formatExpectedProfileTypes(expectedHeaders: string[]): string {
  const labels = new Map<string, string>([
    ['[RivalAI Target]', 'Target'],
    ['[RivalAI Autopilot]', 'Autopilot'],
    ['[RivalAI Action]', 'Action'],
    ['[RivalAI Condition]', 'Condition'],
    ['[RivalAI Trigger]', 'Trigger'],
    ['[RivalAI TriggerGroup]', 'Trigger Group'],
    ['[RivalAI Chat]', 'Chat'],
    ['[RivalAI Spawn]', 'Spawn'],
    ['[RivalAI Weapons]', 'Weapons'],
    ['[RivalAI Waypoint]', 'Waypoint'],
    ['[RivalAI Command]', 'Command'],
    ['[MES Player Condition]', 'Player Condition'],
    ['[MES Event Action]', 'Event Action'],
    ['[MES Event Condition]', 'Event Condition'],
    ['[MES Event]', 'Event'],
    ['[MES Spawn Conditions]', 'Spawn Conditions'],
    ['[MES Store]', 'Store'],
    ['[MES Mission]', 'Mission'],
    ['[MES SafeZone]', 'Safezone'],
    ['[MES Block Replacement]', 'Block Replacement'],
  ]);

  const unique = [
    ...new Set(expectedHeaders.map((header) => labels.get(normalizeHeaderForReferenceMatch(header)) ?? header)),
  ];

  if (unique.length === 1) {
    return unique[0];
  }
  if (unique.length === 2) {
    return `${unique[0]} or ${unique[1]}`;
  }
  return `${unique.slice(0, -1).join(', ')}, or ${unique[unique.length - 1]}`;
}
