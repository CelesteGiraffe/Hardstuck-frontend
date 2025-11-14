const express = require('express');
const { saveMmrLog, getAllMmrLogs, getAllSkills, upsertSkill } = require('./db');

const app = express();

app.use(express.json());

app.get('/api/health', (_, res) => {
  res.json({ ok: true });
});

app.post('/api/mmr-log', (req, res) => {
  const { timestamp, playlist, mmr, gamesPlayedDiff, source } = req.body;

  if (!timestamp || !playlist || typeof mmr !== 'number' || typeof gamesPlayedDiff !== 'number') {
    return res.status(400).json({ error: 'timestamp, playlist, mmr, and gamesPlayedDiff are required' });
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

app.get('/api/mmr', (_, res) => {
  res.json(getAllMmrLogs());
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

module.exports = app;