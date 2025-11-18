const playlistOverrides: Record<string, string> = {
  quads: 'Ranked 4v4',
  'ranked quads': 'Ranked 4v4',
  'ranked 4v4 quads': 'Ranked 4v4',
  'casual quads': 'Casual',
  'casual 4v4': 'Casual',
};

export function formatPlaylistDisplay(value?: string | null) {
  const fallback = 'Unknown';
  if (!value) {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  const normalized = trimmed.toLowerCase();
  if (playlistOverrides[normalized]) {
    return playlistOverrides[normalized];
  }

  return trimmed;
}