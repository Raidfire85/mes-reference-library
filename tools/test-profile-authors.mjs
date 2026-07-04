const paths = [
  'Data/Scripts/ModularEncountersSystems/Spawning/Profiles/ShipyardProfile.cs',
  'Data/Scripts/ModularEncountersSystems/Spawning/Profiles/StoreProfile.cs',
  'Data/Scripts/ModularEncountersSystems/Mission/MissionProfile.cs',
  'Data/Scripts/ModularEncountersSystems/Spawning/Profiles/FactionIconProfile.cs',
  'Data/Scripts/ModularEncountersSystems/Spawning/Profiles/ContractBlockProfile.cs',
  'Data/Scripts/ModularEncountersSystems/Spawning/Profiles/SafezoneProfile.cs',
  'Data/Scripts/ModularEncountersSystems/Spawning/Profiles/PrefabGravityProfile.cs',
];

async function oldestAuthor(path) {
  let page = 1;
  let last = [];
  for (;;) {
    const url =
      'https://api.github.com/repos/MeridiusIX/Modular-Encounters-Systems/commits?path=' +
      encodeURIComponent(path) +
      '&per_page=100&page=' +
      page;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'mes-ref-sync', Accept: 'application/vnd.github+json' },
    });
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      break;
    }
    last = data;
    const link = res.headers.get('link') ?? '';
    if (!link.includes('rel="next"')) {
      break;
    }
    page++;
  }
  const c = last[last.length - 1];
  return {
    file: path.split('/').pop(),
    login: c?.author?.login ?? null,
    name: c?.commit?.author?.name ?? null,
    pages: page,
  };
}

for (const p of paths) {
  console.log(await oldestAuthor(p));
}
