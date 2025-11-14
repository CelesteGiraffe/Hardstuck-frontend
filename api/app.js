const express = require('express');

const app = express();
const mmrLogs = [];

app.use(express.json());

app.get('/api/health', (_, res) => {
  res.json({ ok: true });
});

app.post('/api/mmr-log', (req, res) => {
  const { timestamp, playlist, mmr, gamesPlayedDiff } = req.body;
  const record = { timestamp, playlist, mmr, gamesPlayedDiff };
  mmrLogs.push(record);
  res.status(201).json({ saved: true });
});

app.get('/api/mmr', (_, res) => {
  res.json(mmrLogs);
});

app.resetMmrLogs = () => {
  mmrLogs.length = 0;
};

module.exports = app;