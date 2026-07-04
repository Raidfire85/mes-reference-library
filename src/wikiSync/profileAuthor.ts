import * as fs from 'fs/promises';
import * as path from 'path';
import { GITHUB_BRANCH, GITHUB_REPO } from './constants';
import { findProfileFile } from './tagMetaParser';

const GITHUB_COMMITS_API = `https://api.github.com/repos/${GITHUB_REPO}/commits`;

/** Match author display names used on the original Meridius wiki pages. */
const AUTHOR_DISPLAY: Record<string, string> = {
  jturp: 'JTurp',
  MeridiusIX: 'MeridiusIX',
  CptArthur: 'CptArthur',
  enenra: 'enenra',
};

export interface ProfileAuthorsFile {
  version: 1;
  authors: Record<string, string>;
}

interface GitHubCommitSummary {
  author?: { login?: string | null } | null;
  commit?: { author?: { name?: string | null } | null };
}

export function formatProfileAuthor(login: string | null | undefined, name: string | null | undefined): string {
  if (login) {
    if (AUTHOR_DISPLAY[login]) {
      return AUTHOR_DISPLAY[login];
    }
    if (/^[a-z][a-z0-9]*$/.test(login)) {
      return login.charAt(0).toUpperCase() + login.slice(1);
    }
    return login;
  }

  if (name) {
    return name;
  }

  return 'MeridiusIX';
}

export function mesProfilePathToGithubPath(profileFilePath: string): string {
  const normalized = profileFilePath.replace(/\\/g, '/');
  const marker = 'ModularEncountersSystems';
  const idx = normalized.indexOf(marker);
  if (idx < 0) {
    return '';
  }

  const suffix = normalized.slice(idx + marker.length).replace(/^\//, '');
  return `Data/Scripts/ModularEncountersSystems/${suffix}`;
}

export async function loadProfileAuthorsFile(wikiDir: string): Promise<ProfileAuthorsFile> {
  const filePath = path.join(wikiDir, 'profile-authors.json');

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as ProfileAuthorsFile;
    if (parsed?.version === 1 && parsed.authors && typeof parsed.authors === 'object') {
      return parsed;
    }
  } catch {
    // No author cache yet.
  }

  return { version: 1, authors: {} };
}

export async function saveProfileAuthorsFile(
  wikiDir: string,
  authors: Record<string, string>
): Promise<void> {
  const filePath = path.join(wikiDir, 'profile-authors.json');
  const payload: ProfileAuthorsFile = { version: 1, authors };
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function fetchOldestCommitAuthor(githubPath: string): Promise<string> {
  let page = 1;
  let lastPage: GitHubCommitSummary[] = [];

  for (;;) {
    const url = `${GITHUB_COMMITS_API}?path=${encodeURIComponent(githubPath)}&sha=${GITHUB_BRANCH}&per_page=100&page=${page}`;
    const response = await fetch(url, { headers: githubHeaders() });
    if (!response.ok) {
      throw new Error(`GitHub commits API ${response.status} for ${githubPath}`);
    }

    const commits = (await response.json()) as GitHubCommitSummary[];
    if (!Array.isArray(commits) || commits.length === 0) {
      break;
    }

    lastPage = commits;
    const link = response.headers.get('link') ?? '';
    if (!link.includes('rel="next"')) {
      break;
    }
    page++;
  }

  const oldest = lastPage[lastPage.length - 1];
  return formatProfileAuthor(oldest?.author?.login, oldest?.commit?.author?.name);
}

export async function resolveProfileAuthors(
  wikiDir: string,
  mesSourcePath: string,
  profileCsFiles: string[],
  options?: { useGithub?: boolean }
): Promise<Map<string, string>> {
  const cache = await loadProfileAuthorsFile(wikiDir);
  const authors = new Map<string, string>();
  const missing: string[] = [];
  const useGithub = options?.useGithub ?? true;

  for (const profileCs of profileCsFiles) {
    const cached = cache.authors[profileCs];
    if (cached) {
      authors.set(profileCs, cached);
      continue;
    }
    missing.push(profileCs);
  }

  if (missing.length === 0 || !useGithub) {
    for (const profileCs of missing) {
      authors.set(profileCs, 'MeridiusIX');
    }
    return authors;
  }

  let cacheChanged = false;

  for (const profileCs of missing) {
    try {
      const profilePath = await findProfileFile(mesSourcePath, profileCs);
      if (!profilePath) {
        authors.set(profileCs, 'MeridiusIX');
        continue;
      }

      const githubPath = mesProfilePathToGithubPath(profilePath);
      if (!githubPath) {
        authors.set(profileCs, 'MeridiusIX');
        continue;
      }

      const author = await fetchOldestCommitAuthor(githubPath);
      authors.set(profileCs, author);
      cache.authors[profileCs] = author;
      cacheChanged = true;
    } catch {
      authors.set(profileCs, cache.authors[profileCs] ?? 'MeridiusIX');
    }
  }

  if (cacheChanged) {
    await saveProfileAuthorsFile(wikiDir, cache.authors);
  }

  return authors;
}

function githubHeaders(): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'mes-reference-library-vscode-extension',
  };
}
