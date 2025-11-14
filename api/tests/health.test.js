process.env.DATABASE_PATH = ':memory:';

const request = require('supertest');
const db = require('../db');
const app = require('../app');

beforeEach(() => {
  db.clearMmrLogs();
  db.clearPresetTables();
  db.clearSkills();
  db.clearSessionTables();
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

describe('presets endpoints', () => {
  it('creates a preset with blocks and returns it when listing', async () => {
    const skillPayload = { name: 'Aerial' };
    const skill = await request(app)
      .post('/api/skills')
      .send(skillPayload)
      .set('Content-Type', 'application/json');

    const payload = {
      name: 'Warmup',
      blocks: [
        {
          orderIndex: 1,
          skillId: skill.body.id,
          type: 'focus',
          durationSeconds: 300,
          notes: 'air roll practice',
        },
      ],
    };

    const post = await request(app)
      .post('/api/presets')
      .send(payload)
      .set('Content-Type', 'application/json');

    expect(post.statusCode).toBe(201);
    expect(post.body).toMatchObject({ name: payload.name });
    expect(post.body.blocks).toHaveLength(1);

    const get = await request(app).get('/api/presets');
    expect(get.statusCode).toBe(200);
    expect(get.body).toEqual([
      expect.objectContaining({
        id: expect.any(Number),
        name: payload.name,
        blocks: [
          expect.objectContaining({
            orderIndex: 1,
            skillId: skill.body.id,
            type: payload.blocks[0].type,
            durationSeconds: payload.blocks[0].durationSeconds,
            notes: payload.blocks[0].notes,
          }),
        ],
      }),
    ]);
  });

  it('rejects presets without a name', async () => {
    const response = await request(app)
      .post('/api/presets')
      .send({ blocks: [] })
      .set('Content-Type', 'application/json');

    expect(response.statusCode).toBe(400);
  });

  it('updates blocks when re-posted with an id', async () => {
    const skillPayload = { name: 'Rotation' };
    const skill = await request(app)
      .post('/api/skills')
      .send(skillPayload)
      .set('Content-Type', 'application/json');

    const basePayload = {
      name: 'Session',
      blocks: [
        { orderIndex: 1, skillId: skill.body.id, type: 'review', durationSeconds: 120 },
      ],
    };

    const firstPost = await request(app)
      .post('/api/presets')
      .send(basePayload)
      .set('Content-Type', 'application/json');

    const updated = await request(app)
      .post('/api/presets')
      .send({ id: firstPost.body.id, name: 'Session', blocks: [] })
      .set('Content-Type', 'application/json');

    expect(updated.statusCode).toBe(201);
    expect(updated.body.blocks).toHaveLength(0);
  });

  it('rejects blocks missing required keys', async () => {
    const skillPayload = { name: 'Rotation' };
    const skill = await request(app)
      .post('/api/skills')
      .send(skillPayload)
      .set('Content-Type', 'application/json');

    const payload = {
      name: 'Faulty',
      blocks: [
        { orderIndex: 1, skillId: skill.body.id, type: 'focus' /* missing duration */ },
      ],
    };

    const response = await request(app)
      .post('/api/presets')
      .send(payload)
      .set('Content-Type', 'application/json');

    expect(response.statusCode).toBe(400);
  });
});

describe('sessions endpoints', () => {
  it('creates a session with blocks and returns it on GET', async () => {
    const payload = {
      startedTime: '2025-11-13T10:00:00Z',
      finishedTime: '2025-11-13T11:00:00Z',
      source: 'quick',
      notes: 'test run',
      blocks: [
        {
          type: 'warmup',
          skillIds: [],
          plannedDuration: 120,
          actualDuration: 110,
          notes: 'stretch',
        },
      ],
    };

    const post = await request(app)
      .post('/api/sessions')
      .send(payload)
      .set('Content-Type', 'application/json');

    expect(post.statusCode).toBe(201);
    expect(post.body.blocks).toHaveLength(1);

    const get = await request(app).get('/api/sessions');
    expect(get.statusCode).toBe(200);
    expect(get.body[0]).toMatchObject({
      startedTime: payload.startedTime,
      source: payload.source,
    });
    expect(get.body[0].blocks[0].type).toBe(payload.blocks[0].type);
  });

  it('filters sessions by optional start query', async () => {
    await request(app)
      .post('/api/sessions')
      .send({ startedTime: '2025-11-13T09:00:00Z', source: 'quick', blocks: [], finishedTime: null })
      .set('Content-Type', 'application/json');
    await request(app)
      .post('/api/sessions')
      .send({ startedTime: '2025-11-14T09:00:00Z', source: 'quick', blocks: [], finishedTime: null })
      .set('Content-Type', 'application/json');

    const get = await request(app).get('/api/sessions?start=2025-11-14T00:00:00Z');
    expect(get.body).toHaveLength(1);
  });

  it('filters sessions by end query', async () => {
    await request(app)
      .post('/api/sessions')
      .send({ startedTime: '2025-11-15T09:00:00Z', source: 'quick', blocks: [], finishedTime: null })
      .set('Content-Type', 'application/json');
    await request(app)
      .post('/api/sessions')
      .send({ startedTime: '2025-11-16T09:00:00Z', source: 'quick', blocks: [], finishedTime: null })
      .set('Content-Type', 'application/json');

    const get = await request(app).get('/api/sessions?end=2025-11-15T12:00:00Z');
    expect(get.body).toHaveLength(1);
  });

  it('rejects sessions missing required fields', async () => {
    const response = await request(app).post('/api/sessions').send({}).set('Content-Type', 'application/json');

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: 'startedTime and source are required' });
  });
});