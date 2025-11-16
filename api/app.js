const express = require('express');
const {
  saveMmrLog,
  getAllMmrLogs,
  getMmrLogs,
  getAllSkills,
  upsertSkill,
  deleteSkill,
  getAllPresets,
  savePreset,
  deletePreset,
  getSessions,
  saveSession,
  getSkillDurationSummary,
} = require('./db');

const app = express();

app.use(express.json());

app.get('/api/health', (_, res) => {
  res.json({ ok: true });
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

  saveMmrLog({
    timestamp,
    playlist,
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