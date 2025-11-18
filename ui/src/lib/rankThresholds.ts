import { formatPlaylistDisplay } from './playlistDisplay';

type PlaylistColumn = '1v1' | '2v2' | '3v3' | '4v4' | 'Hoops' | 'Rumble' | 'Dropshot' | 'Snowday';

export type RankRange = {
  rankName: string;
  imageName: string;
  min: number;
  max: number;
};

export type PlaylistRankingTable = Record<PlaylistColumn, RankRange[]>;

export type PlaylistOption = {
  label: string;
  canonical: string;
  csvKey: PlaylistColumn;
};

export const rankablePlaylists: PlaylistOption[] = [
  { label: 'Ranked 1v1', canonical: 'Ranked 1v1', csvKey: '1v1' },
  { label: 'Ranked 2v2', canonical: 'Ranked 2v2', csvKey: '2v2' },
  { label: 'Ranked 3v3', canonical: 'Ranked 3v3', csvKey: '3v3' },
  { label: 'Ranked 4v4', canonical: 'Ranked 4v4', csvKey: '4v4' },
  { label: 'Hoops', canonical: 'Hoops', csvKey: 'Hoops' },
  { label: 'Rumble', canonical: 'Rumble', csvKey: 'Rumble' },
  { label: 'Dropshot', canonical: 'Dropshot', csvKey: 'Dropshot' },
  { label: 'Snow Day', canonical: 'Snow Day', csvKey: 'Snowday' },
];

const rankedNames = new Set(rankablePlaylists.map((option) => option.canonical));

export function isRankedPlaylist(playlist?: string | null): boolean {
  if (!playlist) {
    return false;
  }
  return rankedNames.has(playlist);
}

export function resolveRankImageSrc(playlist?: string | null): string {
  if (!isRankedPlaylist(playlist)) {
    return '/ranks/norank.png';
  }
  const display = formatPlaylistDisplay(playlist);
  const slug = slugify(display);
  return `/rank-${slug}.png`;
}

const HEADER_KEY_MAP: Record<string, PlaylistColumn> = {
  '1v1': '1v1',
  '2v2': '2v2',
  '3v3': '3v3',
  '4v4': '4v4',
  hoops: 'Hoops',
  rumble: 'Rumble',
  dropshot: 'Dropshot',
  snowday: 'Snowday',
};

let cachedTable: Promise<PlaylistRankingTable> | null = null;

export function loadRankThresholds(): Promise<PlaylistRankingTable> {
  if (cachedTable) {
    return cachedTable;
  }

  cachedTable = fetch('/ranks.csv')
    .then((response) => {
      if (!response.ok) {
        throw new Error('Unable to load rank data');
      }
      return response.text();
    })
    .then(parseCsv)
    .catch((error) => {
      cachedTable = null;
      throw error;
    });
  return cachedTable;
}

export function resetRankThresholdCache() {
  cachedTable = null;
}

export function findRankForPlaylist(
  mmr: number,
  column: PlaylistColumn,
  table: PlaylistRankingTable
): RankRange | null {
  const entries = table[column] ?? [];
  for (const entry of entries) {
    if (entry.min <= mmr && mmr <= entry.max) {
      return entry;
    }
  }
  return null;
}

function parseCsv(contents: string): PlaylistRankingTable {
  const lines = contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length);

  if (lines.length === 0) {
    throw new Error('Missing rank definitions');
  }

  const headers = lines[0].split(',').map((value) => value.trim());
  const table: Partial<PlaylistRankingTable> = {};

  for (let i = 1; i < lines.length; i += 1) {
    const cells = lines[i].split(',').map((value) => value.trim());
    if (!cells[0]) {
      continue;
    }
    const rankName = cells[0];
    const imageName = deriveImageName(rankName);

    for (let columnIndex = 1; columnIndex < Math.min(headers.length, cells.length); columnIndex += 1) {
      const rawHeader = headers[columnIndex];
      const normalizedHeader = rawHeader.trim().toLowerCase();
      const columnKey = HEADER_KEY_MAP[normalizedHeader];
      if (!columnKey) {
        continue;
      }

      const range = parseRange(cells[columnIndex]);
      if (!range) {
        continue;
      }

      const entry: RankRange = {
        rankName,
        imageName,
        min: range.min,
        max: range.max,
      };

      if (!table[columnKey]) {
        table[columnKey] = [];
      }
      table[columnKey]?.push(entry);
    }
  }

  return rankablePlaylists.reduce((acc, playlist) => {
    acc[playlist.csvKey] = table[playlist.csvKey] ?? [];
    return acc;
  }, {} as PlaylistRankingTable);
}

function parseRange(value: string): { min: number; max: number } | null {
  const trimmed = value.replace(/\s/g, '');
  if (!trimmed) {
    return null;
  }

  const parts = trimmed.split(/[–—-]/).filter(Boolean);
  if (!parts.length) {
    return null;
  }

  const numbers = parts.map((part) => Number(part));
  if (numbers.some((num) => Number.isNaN(num))) {
    return null;
  }

  if (numbers.length === 1) {
    return { min: numbers[0], max: numbers[0] };
  }

  return { min: Math.min(numbers[0], numbers[1]), max: Math.max(numbers[0], numbers[1]) };
}

function deriveImageName(rankName: string): string {
  const [firstToken] = rankName.trim().split(/\s+/);
  return firstToken?.toUpperCase() ?? rankName;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'default';
}