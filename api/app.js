const express = require('express');
const db = require('./db');
const {
  saveMmrLog,
  getAllMmrLogs,
  getMmrLogs,
  deleteMmrLog,
  updateMmrLog,
  deleteMmrLogs,
  getAllSkills,
  upsertSkill,
  deleteSkill,
  getAllPresets,
  savePreset,
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
} = db;

const app = express();

app.use(express.json());

const { normalizePlaylist } = require('./playlist-normalize');

app.get('/api/health', (_, res) => {
  res.json({ ok: true });
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

app.delete('/api/mmr', (req, res) => {
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
  const { id, name, category, tags, notes } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  const skill = upsertSkill({ id, name, category, tags, notes });
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