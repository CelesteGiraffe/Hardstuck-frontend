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

describe('PATCH /api/mmr/:id', () => {
  it('updates an existing record and returns the updated row', async () => {
    const payload = {
      timestamp: '2025-11-13T00:00:00Z',
      playlist: 'TestPlaylist',
      mmr: 2100,
      gamesPlayedDiff: 2,
      source: 'manual',
    };

    const post = await request(app).post('/api/mmr-log').send(payload).set('Content-Type', 'application/json');
    expect(post.statusCode).toBe(201);

    const all = await request(app).get('/api/mmr');
    const id = all.body.find((r) => r.playlist === payload.playlist).id;
    expect(id).toBeDefined();

    const updatedPayload = {
      timestamp: '2025-11-14T12:30:00Z',
      playlist: 'TestPlaylist',
      mmr: 2200,
      gamesPlayedDiff: 1,
      source: 'manual-edit',
    };

    const patch = await request(app)
      .patch(`/api/mmr/${id}`)
      .send(updatedPayload)
      .set('Content-Type', 'application/json');

    expect(patch.statusCode).toBe(200);
    expect(patch.body).toMatchObject({
      id: expect.any(Number),
      timestamp: updatedPayload.timestamp,
      playlist: updatedPayload.playlist,
      mmr: updatedPayload.mmr,
      gamesPlayedDiff: updatedPayload.gamesPlayedDiff,
      source: updatedPayload.source,
    });
  });

  it('returns 400 for invalid payloads', async () => {
    const payload = {
      timestamp: '2025-11-13T00:00:00Z',
      playlist: 'TestPlaylist2',
      mmr: 2100,
      gamesPlayedDiff: 2,
      source: 'manual',
    };

    const post = await request(app).post('/api/mmr-log').send(payload).set('Content-Type', 'application/json');
    expect(post.statusCode).toBe(201);

    const all = await request(app).get('/api/mmr');
    const id = all.body.find((r) => r.playlist === payload.playlist).id;

    const bad = await request(app)
      .patch(`/api/mmr/${id}`)
      .send({ timestamp: '', playlist: '', mmr: 'bad', gamesPlayedDiff: 'x' })
      .set('Content-Type', 'application/json');

    expect(bad.statusCode).toBe(400);
    expect(bad.body).toHaveProperty('error');
  });

  it('returns 404 when the record does not exist', async () => {
    const resp = await request(app)
      .patch('/api/mmr/9999')
      .send({ timestamp: '2025-11-15T00:00:00Z', playlist: 'Nope', mmr: 2000, gamesPlayedDiff: 1 })
      .set('Content-Type', 'application/json');

    expect(resp.statusCode).toBe(404);
    expect(resp.body).toHaveProperty('error');
  });
});
