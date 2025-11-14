process.env.DATABASE_PATH = ':memory:';

const request = require('supertest');
const db = require('../db');
const app = require('../app');

beforeEach(() => {
  db.clearMmrLogs();
});

describe('GET /api/health', () => {
  it('responds with ok true', async () => {
    const response = await request(app).get('/api/health');
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});

describe('MMR log endpoints', () => {
  it('stores logs and returns them on GET', async () => {
    const payload = {
      timestamp: '2025-11-13T00:00:00Z',
      playlist: 'Standard',
      mmr: 2100,
      gamesPlayedDiff: 3,
      source: 'bakkes',
    };

    const post = await request(app)
      .post('/api/mmr-log')
      .send(payload)
      .set('Content-Type', 'application/json');

    expect(post.statusCode).toBe(201);
    expect(post.body).toEqual({ saved: true });

    const get = await request(app).get('/api/mmr');
    expect(get.statusCode).toBe(200);
    expect(get.body).toEqual([
      expect.objectContaining({
        id: expect.any(Number),
        timestamp: payload.timestamp,
        playlist: payload.playlist,
        mmr: payload.mmr,
        gamesPlayedDiff: payload.gamesPlayedDiff,
        source: payload.source,
      }),
    ]);
  });
});