// Small normalization helper for playlist names sent by BakkesMod or other clients.
// Only translate known/recognized playlists; preserve unknown values unchanged.

function normalizePlaylist(input) {
  if (input === undefined || input === null) return 'Unknown';
  const original = String(input).trim();
  if (!original) return 'Unknown';

  const lowered = original.toLowerCase();
  const hasRanked = /\branked\b/i.test(lowered);
  const hasCasual = /\bcasual\b|\bunranked\b|\bunrated\b|\bparty\b|\bprivate\b/i.test(lowered);

  // Clean string for matching
  let s = original.replace(/^\s+|\s+$/g, '');
  s = s.replace(/\s*\(.*?\)\s*/g, ' '); // strip parentheses
  s = s.replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const l = s.toLowerCase();

  // Team-size modes
  if (/\b(1\s*v\s*1|1v1|duel)\b/i.test(l)) {
    const prefix = hasCasual ? 'Casual' : (hasRanked ? 'Ranked' : 'Ranked');
    return `${prefix} 1v1`;
  }

  if (/\b(2\s*v\s*2|2v2|double|doubles)\b/i.test(l)) {
    const prefix = hasCasual ? 'Casual' : (hasRanked ? 'Ranked' : 'Ranked');
    return `${prefix} 2v2`;
  }

  if (/\b(3\s*v\s*3|3v3|standard|threes|casual threes|casual 3v3)\b/i.test(l) || (/\bstandard\b/i.test(l) && !/\bsolo\b/i.test(l))) {
    const prefix = hasCasual ? 'Casual' : (hasRanked ? 'Ranked' : 'Ranked');
    return `${prefix} 3v3`;
  }

  // Solo standard
  if (/\b(solo standard|solo)\b/i.test(l)) {
    return 'Solo Standard';
  }

  // Other named modes (drop prefix if present)
  if (/\brumble\b/i.test(l)) return 'Rumble';
  if (/\bhoops\b/i.test(l)) return 'Hoops';
  if (/\bdropshot\b/i.test(l)) return 'Dropshot';
  if (/\bsnow\s*day|snowday\b/i.test(l)) return 'Snow Day';
  if (/\btournament\b/i.test(l)) return 'Tournament';

  // Unknown — preserve trimmed original
  return original;
}

module.exports = { normalizePlaylist };
