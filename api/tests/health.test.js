process.env.DATABASE_PATH = ':memory:';

const request = require('supertest');
const db = require('../db');
const app = require('../app');

beforeEach(() => {
  db.clearMmrLogs();
  db.clearSkills();
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

  it('rejects incomplete payloads', async () => {
    const response = await request(app)
      .post('/api/mmr-log')
      .send({ playlist: 'Standard', mmr: 100, gamesPlayedDiff: 1 })
      .set('Content-Type', 'application/json');

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: 'timestamp, playlist, mmr, and gamesPlayedDiff are required' });
  });

  it('returns all stored records', async () => {
    const base = {
      timestamp: '2025-11-13T00:00:00Z',
      playlist: 'Standard',
      mmr: 2100,
      gamesPlayedDiff: 3,
      source: 'bakkes',
    };

    await request(app).post('/api/mmr-log').send(base).set('Content-Type', 'application/json');
    await request(app)
      .post('/api/mmr-log')
      .send({ ...base, timestamp: '2025-11-13T00:30:00Z', mmr: 2120 })
      .set('Content-Type', 'application/json');

    const response = await request(app).get('/api/mmr');
    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveLength(2);
  });
});

describe('skills endpoints', () => {
  it('creates a skill and returns it when listing', async () => {
    const payload = {
      name: 'Shooting',
      category: 'Offense',
      tags: 'air,demo',
      notes: 'focus on placement',
    };

    const post = await request(app)
      .post('/api/skills')
      .send(payload)
      .set('Content-Type', 'application/json');

    expect(post.statusCode).toBe(201);
    expect(post.body).toMatchObject(payload);
    expect(post.body.id).toBeDefined();

    const get = await request(app).get('/api/skills');
    expect(get.statusCode).toBe(200);
    expect(get.body).toEqual([
      expect.objectContaining({
        id: expect.any(Number),
        name: payload.name,
        category: payload.category,
        tags: payload.tags,
        notes: payload.notes,
      }),
    ]);
  });

  it('updates a skill when id is provided', async () => {
    const payload = { name: 'Mechanics' };
    const post = await request(app)
      .post('/api/skills')
      .send(payload)
      .set('Content-Type', 'application/json');

    const updated = await request(app)
      .post('/api/skills')
      .send({ id: post.body.id, name: 'Rotation', category: 'Teamplay' })
      .set('Content-Type', 'application/json');

    expect(updated.statusCode).toBe(201);
    expect(updated.body).toMatchObject({ id: post.body.id, name: 'Rotation', category: 'Teamplay' });
  });

  it('rejects skill requests without a name', async () => {
    const response = await request(app)
      .post('/api/skills')
      .send({ category: 'Defense' })
      .set('Content-Type', 'application/json');

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: 'name is required' });
  });
});