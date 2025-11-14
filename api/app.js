const express = require('express');

const app = express();

app.get('/api/health', (_, res) => {
  res.json({ ok: true });
});

module.exports = app;