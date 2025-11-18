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
  it('normalizes "Casual Threes" to "Casual 3v3" on POST', async () => {
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
    expect(rec.playlist).toBe('Casual 3v3');
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
    expect(patch.body.playlist).toBe('Casual 3v3');
  });
});
