const express = require('express');

const app = express();
const PORT = process.env.PORT || 4000;

app.get('/api/health', (_, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});