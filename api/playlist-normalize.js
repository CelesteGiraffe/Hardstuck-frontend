const playlistDefinitions = require('./playlist-definitions');

// Small normalization helper for playlist names sent by BakkesMod or other clients.
// Only translate known/recognized playlists; preserve unknown values unchanged or reject when marked.

function normalizePlaylist(input) {
  if (input === undefined || input === null) return 'Unknown';
  const original = String(input).trim();
  if (!original) return 'Unknown';

  const lowered = original.toLowerCase();
  const hasRanked = /\branked\b/i.test(lowered);
  const hasCasual = /\bcasual\b|\bunranked\b|\bunrated\b|\bparty\b|\bprivate\b/i.test(lowered);
  const hasLegacy = /\blegacy\b/i.test(lowered);

  // Clean string for matching
  let s = original.replace(/^\s+|\s+$/g, '');
  s = s.replace(/\s*\(.*?\)\s*/g, ' '); // strip parentheses
  s = s.replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const l = s.toLowerCase();
  const context = { hasRanked, hasCasual, hasLegacy };
  const definition = findDefinition(l, context);

  if (definition) {
    if (definition.emit === false) {
      return null;
    }
    return definition.canonical;
  }

  // Unknown — preserve trimmed original
  return original;
}

function findDefinition(normalized, context) {
  for (const candidate of playlistDefinitions) {
    if (!matchesContext(candidate, context)) continue;
    if (candidate.matchers.some((matcher) => matcher.test(normalized))) {
      return candidate;
    }
  }
  return null;
}

function matchesContext(definition, context) {
  if (context.hasLegacy && definition.disallowLegacy) {
    return false;
  }

  switch (definition.prefix) {
    case 'ranked':
      if (!context.hasRanked) {
        const implicitAllowed = definition.allowImplicitRanked && !context.hasCasual;
        const legacyAllowed = context.hasLegacy && definition.allowWhenLegacy;
        if (!implicitAllowed && !legacyAllowed) {
          return false;
        }
      }
      break;
    case 'casual':
      if (context.hasRanked && definition.disallowWhenRanked) {
        return false;
      }
      if (!context.hasCasual && !context.hasRanked && !definition.allowUndeclared) {
        return false;
      }
      break;
    default:
      break;
  }

  return true;
}

module.exports = { normalizePlaylist };
