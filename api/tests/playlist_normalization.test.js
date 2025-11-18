process.env.DATABASE_PATH = ':memory:';

const request = require('supertest');
const db = require('../db');
const app = require('../app');

beforeEach(() => {
  db.clearMmrLogs();
  db.clearPresetTables();
  db.clearSessionTables();
  db.clearTrainingGoals();
  db.clearSkills();
  db.clearProfileSettings();
  db.clearFavorites();
});

describe('playlist normalization', () => {
  it('normalizes "Casual Threes" to "Casual" on POST', async () => {
    const payload = {
      timestamp: '2025-11-13T00:00:00Z',
      playlist: 'Casual Threes',
      mmr: 2100,
      gamesPlayedDiff: 1,
      source: 'bakkes',
    };

    const post = await request(app).post('/api/mmr-log').send(payload).set('Content-Type', 'application/json');
    expect(post.statusCode).toBe(201);

    const all = await request(app).get('/api/mmr');
    expect(all.statusCode).toBe(200);
    expect(all.body.length).toBeGreaterThan(0);
    const rec = all.body[0];
    expect(rec.playlist).toBe('Casual');
  });

  it('normalizes "Ranked Doubles" to "Ranked 2v2" on POST', async () => {
    const payload = {
      timestamp: '2025-11-13T01:00:00Z',
      playlist: 'Ranked Doubles',
      mmr: 2000,
      gamesPlayedDiff: 1,
      source: 'bakkes',
    };

    const post = await request(app).post('/api/mmr-log').send(payload).set('Content-Type', 'application/json');
    expect(post.statusCode).toBe(201);

    const all = await request(app).get('/api/mmr');
    const rec = all.body.find((r) => r.mmr === payload.mmr);
    expect(rec).toBeDefined();
    expect(rec.playlist).toBe('Ranked 2v2');
  });

  it('normalizes "Ranked Quads" to "Ranked 4v4" on POST', async () => {
    const payload = {
      timestamp: '2025-11-13T01:15:00Z',
      playlist: 'Ranked Quads',
      mmr: 1950,
      gamesPlayedDiff: 1,
      source: 'bakkes',
    };

    const post = await request(app).post('/api/mmr-log').send(payload).set('Content-Type', 'application/json');
    expect(post.statusCode).toBe(201);

    const all = await request(app).get('/api/mmr');
    const rec = all.body.find((r) => r.mmr === payload.mmr);
    expect(rec).toBeDefined();
    expect(rec.playlist).toBe('Ranked 4v4');
  });

  it('normalizes "Ranked 4v4 Quads" to "Ranked 4v4" on POST', async () => {
    const payload = {
      timestamp: '2025-11-13T01:20:00Z',
      playlist: 'Ranked 4v4 Quads',
      mmr: 1925,
      gamesPlayedDiff: 1,
      source: 'bakkes',
    };

    const post = await request(app).post('/api/mmr-log').send(payload).set('Content-Type', 'application/json');
    expect(post.statusCode).toBe(201);

    const all = await request(app).get('/api/mmr');
    const rec = all.body.find((r) => r.mmr === payload.mmr);
    expect(rec).toBeDefined();
    expect(rec.playlist).toBe('Ranked 4v4');
  });

  it('normalizes "Ranked Chaos" to "Ranked Chaos" on POST', async () => {
    const payload = {
      timestamp: '2025-11-13T01:30:00Z',
      playlist: 'Ranked Chaos',
      mmr: 1805,
      gamesPlayedDiff: 1,
      source: 'bakkes',
    };

    const post = await request(app).post('/api/mmr-log').send(payload).set('Content-Type', 'application/json');
    expect(post.statusCode).toBe(201);

    const all = await request(app).get('/api/mmr');
    const rec = all.body.find((r) => r.playlist === 'Ranked Chaos' && r.mmr === payload.mmr);
    expect(rec).toBeDefined();
    expect(rec.playlist).toBe('Ranked Chaos');
  });

  it('treats bare "Standard" as "Casual" on POST', async () => {
    const payload = {
      timestamp: '2025-11-13T03:00:00Z',
      playlist: 'Standard',
      mmr: 1800,
      gamesPlayedDiff: 1,
      source: 'bakkes',
    };

    const post = await request(app).post('/api/mmr-log').send(payload).set('Content-Type', 'application/json');
    expect(post.statusCode).toBe(201);

    const all = await request(app).get('/api/mmr');
    const rec = all.body.find((r) => r.playlist === 'Casual' && r.mmr === payload.mmr);
    expect(rec).toBeDefined();
    expect(rec.playlist).toBe('Casual');
  });

  it('treats bare "Doubles" as "Casual" on POST', async () => {
    const payload = {
      timestamp: '2025-11-13T04:00:00Z',
      playlist: 'Doubles',
      mmr: 1700,
      gamesPlayedDiff: 1,
      source: 'bakkes',
    };

    const post = await request(app).post('/api/mmr-log').send(payload).set('Content-Type', 'application/json');
    expect(post.statusCode).toBe(201);

    const all = await request(app).get('/api/mmr');
    const rec = all.body.find((r) => r.playlist === 'Casual' && r.mmr === payload.mmr);
    expect(rec).toBeDefined();
    expect(rec.playlist).toBe('Casual');
  });

  it('treats bare "Duel" as "Casual" on POST', async () => {
    const payload = {
      timestamp: '2025-11-13T05:00:00Z',
      playlist: 'Duel',
      mmr: 1600,
      gamesPlayedDiff: 1,
      source: 'bakkes',
    };

    const post = await request(app).post('/api/mmr-log').send(payload).set('Content-Type', 'application/json');
    expect(post.statusCode).toBe(201);

    const all = await request(app).get('/api/mmr');
    const rec = all.body.find((r) => r.playlist === 'Casual' && r.mmr === payload.mmr);
    expect(rec).toBeDefined();
    expect(rec.playlist).toBe('Casual');
  });

  it('treats "Casual Chaos" as "Casual" on POST', async () => {
    const payload = {
      timestamp: '2025-11-13T06:00:00Z',
      playlist: 'Casual Chaos',
      mmr: 1650,
      gamesPlayedDiff: 1,
      source: 'bakkes',
    };

    const post = await request(app).post('/api/mmr-log').send(payload).set('Content-Type', 'application/json');
    expect(post.statusCode).toBe(201);

    const all = await request(app).get('/api/mmr');
    const rec = all.body.find((r) => r.playlist === 'Casual' && r.mmr === payload.mmr);
    expect(rec).toBeDefined();
    expect(rec.playlist).toBe('Casual');
  });

  it('treats "Casual Quads" as "Casual" on POST', async () => {
    const payload = {
      timestamp: '2025-11-13T06:30:00Z',
      playlist: 'Casual Quads',
      mmr: 1675,
      gamesPlayedDiff: 1,
      source: 'bakkes',
    };

    const post = await request(app).post('/api/mmr-log').send(payload).set('Content-Type', 'application/json');
    expect(post.statusCode).toBe(201);

    const all = await request(app).get('/api/mmr');
    const rec = all.body.find((r) => r.mmr === payload.mmr);
    expect(rec).toBeDefined();
    expect(rec.playlist).toBe('Casual');
  });

  it('ignores duplicate snapshot casual entries', async () => {
    const payload = {
      timestamp: '2025-11-13T09:00:00Z',
      playlist: 'Duel',
      mmr: 1400,
      gamesPlayedDiff: 0,
      source: 'bakkes_snapshot',
    };

    await request(app).post('/api/mmr-log').send(payload).set('Content-Type', 'application/json');
    await request(app).post('/api/mmr-log').send(payload).set('Content-Type', 'application/json');

    const all = await request(app).get('/api/mmr');
    const records = all.body.filter((r) => r.playlist === 'Casual' && r.timestamp === payload.timestamp);
    expect(records.length).toBe(1);
  });

  it('stores Heatseeker playlist for LTMs', async () => {
    const payload = {
      timestamp: '2025-11-13T07:00:00Z',
      playlist: 'Heatseeker',
      mmr: 1700,
      gamesPlayedDiff: 1,
      source: 'bakkes',
    };

    const post = await request(app).post('/api/mmr-log').send(payload).set('Content-Type', 'application/json');
    expect(post.statusCode).toBe(201);

    const all = await request(app).get('/api/mmr');
    const rec = all.body.find((r) => r.playlist === 'Heatseeker' && r.mmr === payload.mmr);
    expect(rec).toBeDefined();
    expect(rec.playlist).toBe('Heatseeker');
  });

  it('rejects unsupported training playlists', async () => {
    const payload = {
      timestamp: '2025-11-13T08:00:00Z',
      playlist: 'Training',
      mmr: 1500,
      gamesPlayedDiff: 1,
      source: 'bakkes',
    };

    const post = await request(app).post('/api/mmr-log').send(payload).set('Content-Type', 'application/json');
    expect(post.statusCode).toBe(400);
    expect(post.body.error).toBe('unsupported playlist');
  });

  it('rejects Solo Standard uploads', async () => {
    const payload = {
      timestamp: '2025-11-13T10:00:00Z',
      playlist: 'Solo Standard',
      mmr: 1700,
      gamesPlayedDiff: 1,
      source: 'bakkes',
    };

    const post = await request(app).post('/api/mmr-log').send(payload).set('Content-Type', 'application/json');
    expect(post.statusCode).toBe(400);
    expect(post.body.error).toBe('unsupported playlist');
  });

  it('normalizes "Duel (Legacy)" to "Ranked 1v1" on POST and PATCH', async () => {
    const payload = {
      timestamp: '2025-11-13T02:00:00Z',
      playlist: 'Duel (Legacy)',
      mmr: 1900,
      gamesPlayedDiff: 1,
      source: 'bakkes',
    };

    const post = await request(app).post('/api/mmr-log').send(payload).set('Content-Type', 'application/json');
    expect(post.statusCode).toBe(201);

    const all = await request(app).get('/api/mmr');
    const rec = all.body.find((r) => r.mmr === payload.mmr);
    expect(rec).toBeDefined();
    expect(rec.playlist).toBe('Ranked 1v1');

    // Now patch the same record with another variant
    const updatedPayload = {
      timestamp: '2025-11-14T12:30:00Z',
      playlist: 'Casual Threes',
      mmr: 1950,
      gamesPlayedDiff: 1,
      source: 'bakkes-patch',
    };

    const patch = await request(app)
      .patch(`/api/mmr/${rec.id}`)
      .send(updatedPayload)
      .set('Content-Type', 'application/json');

    expect(patch.statusCode).toBe(200);
    expect(patch.body.playlist).toBe('Casual');
  });
});
