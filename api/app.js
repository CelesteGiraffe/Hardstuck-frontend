const express = require('express');
const db = require('./db');
const {
  saveMmrLog,
  getAllMmrLogs,
  getMmrLogs,
  deleteMmrLog,
  updateMmrLog,
  deleteMmrLogs,
  clearMmrLogs,
  getAllSkills,
  upsertSkill,
  deleteSkill,
  ensureFavoriteForUser,
  getAllPresets,
  savePreset,
  exportPresetShare,
  importPresetShare,
  deletePreset,
  getSessions,
  saveSession,
  getSkillDurationSummary,
  getProfile,
  updateProfile,
  getTrainingGoals,
  saveTrainingGoal,
  deleteTrainingGoal,
  getGoalProgress,
  onChange,
} = db;

const app = express();

const SSE_HEARTBEAT_MS = 25 * 1000;
const MAX_HISTORY_LIMIT = 200;
const DEFAULT_MMR_HISTORY_LIMIT = 50;
const DEFAULT_SESSION_HISTORY_LIMIT = 25;
const sseClients = new Set();
const sseHeartbeats = new Map();

function removeSseClient(res) {
  sseClients.delete(res);
  const heartbeat = sseHeartbeats.get(res);
  if (heartbeat) {
    clearInterval(heartbeat);
    sseHeartbeats.delete(res);
  }
}

function parseHistoryLimit(name, value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer`);
  }

  if (parsed <= 0) {
    throw new Error(`${name} must be greater than 0`);
  }

  if (parsed > MAX_HISTORY_LIMIT) {
    throw new Error(`${name} cannot exceed ${MAX_HISTORY_LIMIT}`);
  }

  return parsed;
}

function limitHistory(records, limit) {
  if (records.length <= limit) {
    return records;
  }
  return records.slice(-limit);
}

function escapeCsvValue(value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (/"|,|\n/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildMmrExportCsv(records) {
  const header = ['MMR Playlist', 'Timestamp', 'MMR', 'Games Played Diff', 'Source'];
  const lines = [header.map(escapeCsvValue).join(',')];
  for (const record of records) {
    const row = [record.playlist, record.timestamp, record.mmr ?? '', record.gamesPlayedDiff ?? '', record.source ?? ''];
    lines.push(row.map(escapeCsvValue).join(','));
  }
  return lines.join('\n');
}

function broadcastServerUpdate(payload) {
  const payloadWithTimestamp = {
    ...payload,
    timestamp: new Date().toISOString(),
  };
  const message = JSON.stringify(payloadWithTimestamp);
  for (const client of [...sseClients]) {
    try {
      client.write('event: update\n');
      client.write(`data: ${message}\n\n`);
    } catch (error) {
      removeSseClient(client);
    }
  }
}

if (typeof onChange === 'function') {
  onChange(broadcastServerUpdate);
}

app.use(express.json());

const { normalizePlaylist } = require('./playlist-normalize');

function normalizeHeader(value) {
  return (value || '').trim().toLowerCase();
}

function parseCsvLine(line) {
  const cells = [];
  let buffer = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        buffer += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(buffer);
      buffer = '';
      continue;
    }

    buffer += char;
  }

  cells.push(buffer);
  return cells.map((cell) => cell.trim());
}

function extractMmrRowsFromCsv(csvText) {
  const lines = csvText.split(/\r?\n/);
  const parsed = lines.map((line, index) => ({
    row: parseCsvLine(line),
    lineNumber: index + 1,
  }));

  const headerIndex = parsed.findIndex(({ row }) => normalizeHeader(row[0]) === 'mmr playlist');
  if (headerIndex === -1) {
    return { error: 'CSV must include an MMR section with header' };
  }

  const mmrRows = [];
  for (let i = headerIndex + 1; i < parsed.length; i += 1) {
    const { row, lineNumber } = parsed[i];
    if (!row.length) {
      continue;
    }

    const firstCell = normalizeHeader(row[0]);
    if (firstCell === 'session date' || firstCell === 'mmr playlist') {
      break;
    }

    if (row.every((cell) => cell === '')) {
      continue;
    }

    mmrRows.push({ row, lineNumber });
  }

  return { mmrRows };
}

app.get('/api/health', (_, res) => {
  res.json({ ok: true });
});

app.get('/api/updates', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  res.write('retry: 10000\n\n');

  const heartbeat = setInterval(() => {
    try {
      res.write(': keep-alive\n\n');
    } catch (error) {
      removeSseClient(res);
    }
  }, SSE_HEARTBEAT_MS);

  sseHeartbeats.set(res, heartbeat);
  sseClients.add(res);

  req.on('close', () => {
    removeSseClient(res);
  });
});

app.get('/api/v1/bakkes/favorites', (req, res) => {
  const userId = (req.header('x-user-id') || '').trim();

  if (!userId) {
    return res.status(401).json({ error: 'X-User-Id header is required' });
  }

  try {
    const favorites = db.getFavoritesByUser(userId);
    res.json(favorites);
  } catch (error) {
    res.status(500).json({ error: 'Unable to load favorites' });
  }
});

app.get('/api/bakkesmod/history', (req, res) => {
  const { mmrFrom, mmrTo, sessionStart, sessionEnd, playlist } = req.query;

  try {
    const mmrLimit = parseHistoryLimit('mmrLimit', req.query.mmrLimit, DEFAULT_MMR_HISTORY_LIMIT);
    const sessionLimit = parseHistoryLimit('sessionLimit', req.query.sessionLimit, DEFAULT_SESSION_HISTORY_LIMIT);
    const mmrHistory = getMmrLogs({ playlist, from: mmrFrom, to: mmrTo });
    const trainingHistory = getSessions({ start: sessionStart, end: sessionEnd });
    const limitedMmr = limitHistory(mmrHistory, mmrLimit);
    const limitedTraining = limitHistory(trainingHistory, sessionLimit);
    const statusTimestamp = new Date().toISOString();

    const status = {
      receivedAt: statusTimestamp,
      generatedAt: statusTimestamp,
      mmrEntries: limitedMmr.length,
      trainingSessions: limitedTraining.length,
      lastMmrTimestamp: limitedMmr.length ? limitedMmr[limitedMmr.length - 1].timestamp : null,
      lastTrainingTimestamp: limitedTraining.length ? limitedTraining[limitedTraining.length - 1].startedTime : null,
      mmrLimit,
      sessionLimit,
      filters: {
        playlist: playlist ?? null,
        mmrFrom: mmrFrom ?? null,
        mmrTo: mmrTo ?? null,
        sessionStart: sessionStart ?? null,
        sessionEnd: sessionEnd ?? null,
      },
    };

    return res.json({ mmrHistory: limitedMmr, trainingHistory: limitedTraining, status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load history';
    return res.status(400).json({ error: message });
  }
});

app.get('/api/history/export', (req, res) => {
  const { playlist, from, to } = req.query;

  try {
    const records = getMmrLogs({ playlist, from, to });
    const csv = buildMmrExportCsv(records);
    res.set('Content-Type', 'text/csv; charset=utf-8');
    return res.send(csv);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to export history';
    return res.status(400).json({ error: message });
  }
});

app.post('/api/history/import', (req, res) => {
  const csvText = typeof req.body?.csv === 'string' ? req.body.csv.trim() : '';

  if (!csvText) {
    return res.status(400).json({ error: 'CSV text is required' });
  }

  const parsed = extractMmrRowsFromCsv(csvText);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const { mmrRows } = parsed;
  const summary = { imported: 0, skipped: 0, errors: [] };

  for (const { row, lineNumber } of mmrRows) {
    const [playlistValue, timestampValue, mmrValue, gamesPlayedDiffValue, sourceValue] = row;
    if (!playlistValue) {
      summary.errors.push(`Line ${lineNumber}: playlist is required`);
      continue;
    }

    const normalizedPlaylist = normalizePlaylist(playlistValue);
    if (!normalizedPlaylist) {
      summary.errors.push(`Line ${lineNumber}: unsupported playlist`);
      continue;
    }

    const timestamp = (timestampValue || '').trim();
    if (!timestamp || Number.isNaN(Date.parse(timestamp))) {
      summary.errors.push(`Line ${lineNumber}: invalid timestamp`);
      continue;
    }

    const mmrNumber = Number(mmrValue);
    if (!Number.isFinite(mmrNumber)) {
      summary.errors.push(`Line ${lineNumber}: mmr must be a number`);
      continue;
    }

    const gamesDiff = Number(gamesPlayedDiffValue ?? '');
    if (!Number.isFinite(gamesDiff)) {
      summary.errors.push(`Line ${lineNumber}: gamesPlayedDiff must be a number`);
      continue;
    }

    const inserted = saveMmrLog({
      timestamp,
      playlist: normalizedPlaylist,
      mmr: mmrNumber,
      gamesPlayedDiff: gamesDiff,
      source: (sourceValue || '').trim() || 'bakkes',
    });

    if (inserted) {
      summary.imported += 1;
    } else {
      summary.skipped += 1;
    }
  }

  return res.json(summary);
});

app.post('/api/mmr-log', (req, res) => {
  const { timestamp, playlist, mmr, gamesPlayedDiff, source } = req.body;
  const errors = [];

  if (!timestamp) {
    errors.push('timestamp is required');
  }

  if (typeof playlist !== 'string' || playlist.trim().length === 0) {
    errors.push('playlist must be a non-empty string');
  }

  if (typeof mmr !== 'number' || Number.isNaN(mmr)) {
    errors.push('mmr must be a number');
  }

  if (typeof gamesPlayedDiff !== 'number' || Number.isNaN(gamesPlayedDiff)) {
    errors.push('gamesPlayedDiff must be a number');
  }

  if (errors.length) {
    return res.status(400).json({ error: errors.join('. ') });
  }

  const normalizedPlaylist = normalizePlaylist(playlist);
  if (!normalizedPlaylist) {
    return res.status(400).json({ error: 'unsupported playlist' });
  }

  saveMmrLog({
    timestamp,
    playlist: normalizedPlaylist,
    mmr,
    gamesPlayedDiff,
    source,
  });

  res.status(201).json({ saved: true });
});

app.get('/api/mmr', (req, res) => {
  const { playlist, from, to } = req.query;
  res.json(getMmrLogs({ playlist, from, to }));
});

app.delete('/api/mmr/clear', (_, res) => {
  try {
    const deleted = clearMmrLogs();
    res.status(200).json({ deleted });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to clear mmr records';
    res.status(500).json({ error: message });
  }
});

app.delete('/api/mmr/:id', (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid mmr id' });
  }

  try {
    deleteMmrLog(id);
    res.status(204).end();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete mmr record';
    res.status(400).json({ error: message });
  }
});

app.patch('/api/mmr/:id', (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid mmr id' });
  }

  const { timestamp, playlist, mmr, gamesPlayedDiff, source } = req.body;
  const errors = [];

  if (!timestamp) {
    errors.push('timestamp is required');
  }

  if (typeof playlist !== 'string' || playlist.trim().length === 0) {
    errors.push('playlist must be a non-empty string');
  }

  const mmrNum = Number(mmr);
  const gamesPlayedDiffNum = Number(gamesPlayedDiff);

  if (!Number.isFinite(mmrNum)) {
    errors.push('mmr must be a number');
  }

  if (!Number.isFinite(gamesPlayedDiffNum)) {
    errors.push('gamesPlayedDiff must be a number');
  }

  if (errors.length) {
    return res.status(400).json({ error: errors.join('. ') });
  }

  try {
    const normalizedPlaylist = normalizePlaylist(playlist);
    if (!normalizedPlaylist) {
      return res.status(400).json({ error: 'unsupported playlist' });
    }

    const updated = updateMmrLog({
      id,
      timestamp,
      playlist: normalizedPlaylist,
      mmr: mmrNum,
      gamesPlayedDiff: gamesPlayedDiffNum,
      source,
    });
    res.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update mmr record';
    if (message === 'mmr record not found') {
      res.status(404).json({ error: message });
    } else {
      res.status(400).json({ error: message });
    }
  }
});

app.delete('/api/mmr', (req, res, next) => {
  if (req.path !== '/api/mmr') {
    return next();
  }
  const { playlist, from, to } = req.query;

  if (!playlist && !from && !to) {
    return res.status(400).json({ error: 'At least one filter (playlist, from, to) is required to delete records' });
  }

  try {
    const deleted = deleteMmrLogs({ playlist, from, to });
    res.status(200).json({ deleted });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete mmr records';
    res.status(400).json({ error: message });
  }
});

app.get('/api/skills', (_, res) => {
  res.json(getAllSkills());
});

app.post('/api/skills', (req, res) => {
  const { id, name, category, tags, notes, favoriteCode, favoriteName } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  const skill = upsertSkill({ id, name, category, tags, notes, favoriteCode, favoriteName });
  const userId = (req.header('x-user-id') || '').trim();
  ensureFavoriteForUser({ userId, name: favoriteName, code: favoriteCode });
  res.status(201).json(skill);
});

app.delete('/api/skills/:id', (req, res) => {
  const skillId = Number(req.params.id);

  if (!Number.isInteger(skillId) || skillId <= 0) {
    return res.status(400).json({ error: 'invalid skill id' });
  }

  try {
    deleteSkill(skillId);
    res.status(204).end();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete skill';
    res.status(400).json({ error: message });
  }
});

app.get('/api/presets', (_, res) => {
  res.json(getAllPresets());
});

app.post('/api/presets', (req, res) => {
  const { id, name, blocks } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  const normalizedBlocks = Array.isArray(blocks) ? blocks : [];

  for (const block of normalizedBlocks) {
    if (
      typeof block.orderIndex !== 'number' ||
      typeof block.skillId !== 'number' ||
      typeof block.type !== 'string' ||
      typeof block.durationSeconds !== 'number'
    ) {
      return res.status(400).json({ error: 'blocks must include orderIndex, skillId, type, and durationSeconds' });
    }
  }

  try {
    const preset = savePreset({ id, name, blocks: normalizedBlocks });
    res.status(201).json(preset);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/presets/:id', (req, res) => {
  const presetId = Number(req.params.id);

  if (!Number.isInteger(presetId) || presetId <= 0) {
    return res.status(400).json({ error: 'invalid preset id' });
  }

  try {
    deletePreset(presetId);
    res.status(204).end();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/presets/:id/share', (req, res) => {
  const presetId = Number(req.params.id);

  if (!Number.isInteger(presetId) || presetId <= 0) {
    return res.status(400).json({ error: 'invalid preset id' });
  }

  try {
    const share = exportPresetShare(presetId);
    res.json({ share });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to generate share text';
    res.status(400).json({ error: message });
  }
});

app.post('/api/presets/share/import', (req, res) => {
  const shareText = typeof req.body?.share === 'string' ? req.body.share.trim() : '';
  if (!shareText) {
    return res.status(400).json({ error: 'share text is required' });
  }

  const userId = (req.header('x-user-id') || '').trim();
  if (!userId) {
    return res.status(401).json({ error: 'X-User-Id header is required' });
  }

  try {
    const preset = importPresetShare({ share: shareText, userId });
    res.status(201).json({ preset });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to import shared preset';
    res.status(400).json({ error: message });
  }
});

app.get('/api/sessions', (req, res) => {
  const { start, end } = req.query;
  const sessions = getSessions({ start, end });
  res.json(sessions);
});

function normalizeSessionBlocks(blocks) {
  if (!Array.isArray(blocks)) {
    return [];
  }

  const isValidNumber = (value) => typeof value === 'number' && Number.isFinite(value);

  return blocks.map((block) => {
    if (
      typeof block.type !== 'string' ||
      !Array.isArray(block.skillIds) ||
      !isValidNumber(block.plannedDuration) ||
      !isValidNumber(block.actualDuration)
    ) {
      throw new Error('blocks must include type, skillIds array, plannedDuration, and actualDuration');
    }

    if (block.skillIds.some((skillId) => typeof skillId !== 'number' || !Number.isFinite(skillId))) {
      throw new Error('skillIds must be an array of numbers');
    }

    return {
      type: block.type,
      skillIds: block.skillIds,
      plannedDuration: block.plannedDuration,
      actualDuration: block.actualDuration,
      notes: block.notes ?? null,
    };
  });
}

app.get('/api/summary/skills', (req, res) => {
  const { from, to } = req.query;
  const summary = getSkillDurationSummary({ from, to });
  res.json(summary);
});

app.get('/api/profile', (_, res) => {
  const settings = getProfile();
  const goals = getTrainingGoals();
  const progress = goals
    .map((goal) => {
      const periodDays = Number(goal.periodDays) || 0;
      const to = new Date().toISOString();
      const from = periodDays > 0 ? new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString() : null;
      return getGoalProgress({ goalId: goal.id, from, to })[0];
    })
    .filter(Boolean);

  res.json({ settings, goals, progress });
});

app.put('/api/profile/settings', (req, res) => {
  const { name, avatarUrl, timezone, defaultWeeklyTargetMinutes } = req.body;
  const errors = [];

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push('name is required');
  }

  if (!timezone || typeof timezone !== 'string' || timezone.trim().length === 0) {
    errors.push('timezone is required');
  }

  if (avatarUrl !== undefined && typeof avatarUrl !== 'string') {
    errors.push('avatarUrl must be a string');
  }

  const minutes = Number(defaultWeeklyTargetMinutes);
  if (!Number.isFinite(minutes) || minutes < 0) {
    errors.push('defaultWeeklyTargetMinutes must be a non-negative number');
  }

  if (errors.length) {
    return res.status(400).json({ error: errors.join('. ') });
  }

  const existing = getProfile();
  const updated = updateProfile({
    name: name.trim(),
    avatarUrl: avatarUrl !== undefined ? avatarUrl.trim() : existing.avatarUrl,
    timezone: timezone.trim(),
    defaultWeeklyTargetMinutes: Math.floor(minutes),
  });

  res.json(updated);
});

app.post('/api/profile/goals', (req, res) => {
  try {
    const goal = saveTrainingGoal({
      id: req.body.id,
      label: req.body.label,
      goalType: req.body.goalType,
      skillId: req.body.skillId,
      targetMinutes: req.body.targetMinutes,
      targetSessions: req.body.targetSessions,
      periodDays: req.body.periodDays,
      notes: req.body.notes,
    });

    const status = req.body.id ? 200 : 201;
    res.status(status).json(goal);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/profile/goals/:id', (req, res) => {
  const goalId = Number(req.params.id);

  if (!Number.isInteger(goalId) || goalId <= 0) {
    return res.status(400).json({ error: 'invalid goal id' });
  }

  try {
    deleteTrainingGoal(goalId);
    res.status(204).end();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/profile/goals/progress', (req, res) => {
  const { goalId, from, to } = req.query;

  if (!goalId) {
    return res.status(400).json({ error: 'goalId is required' });
  }

  const parsedGoalId = Number(goalId);
  if (!Number.isInteger(parsedGoalId) || parsedGoalId <= 0) {
    return res.status(400).json({ error: 'invalid goalId' });
  }

  const progress = getGoalProgress({ goalId: parsedGoalId, from, to });
  if (!progress.length) {
    return res.status(404).json({ error: 'goal not found' });
  }

  res.json(progress[0]);
});

app.post('/api/sessions', (req, res) => {
  const { startedTime, finishedTime = null, source, presetId = null, notes = null, blocks } = req.body;

  if (!startedTime || !source) {
    return res.status(400).json({ error: 'startedTime and source are required' });
  }

  let normalizedBlocks;

  try {
    normalizedBlocks = normalizeSessionBlocks(blocks);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  try {
    const saved = saveSession({ startedTime, finishedTime, source, presetId, notes, blocks: normalizedBlocks });
    res.status(201).json(saved);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = app;