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
      .send({})
      .set('Content-Type', 'application/json');

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({
      error:
        'timestamp is required. playlist must be a non-empty string. mmr must be a number. gamesPlayedDiff must be a number',
    });
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

  it('rejects invalid playlist data', async () => {
    const response = await request(app)
      .post('/api/mmr-log')
      .send({ timestamp: '2025-11-13T00:00:00Z', playlist: 123, mmr: 2100, gamesPlayedDiff: 1 })
      .set('Content-Type', 'application/json');

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: 'playlist must be a non-empty string' });
  });

  it('rejects non-numeric mmr', async () => {
    const response = await request(app)
      .post('/api/mmr-log')
      .send({ timestamp: '2025-11-13T00:00:00Z', playlist: 'Standard', mmr: 'bad', gamesPlayedDiff: 1 })
      .set('Content-Type', 'application/json');

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: 'mmr must be a number' });
  });

  it('rejects non-numeric gamesPlayedDiff', async () => {
    const response = await request(app)
      .post('/api/mmr-log')
      .send({ timestamp: '2025-11-13T00:00:00Z', playlist: 'Standard', mmr: 2100, gamesPlayedDiff: 'bad' })
      .set('Content-Type', 'application/json');

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: 'gamesPlayedDiff must be a number' });
  });
});

describe('MMR filters', () => {
  it('filters records by playlist', async () => {
    const base = {
      timestamp: '2025-11-13T00:00:00Z',
      playlist: 'Standard',
      mmr: 2050,
      gamesPlayedDiff: 2,
      source: 'bakkes',
    };

    await request(app).post('/api/mmr-log').send(base).set('Content-Type', 'application/json');
    await request(app)
      .post('/api/mmr-log')
      .send({ ...base, playlist: 'Doubles', timestamp: '2025-11-13T00:15:00Z' })
      .set('Content-Type', 'application/json');

    const response = await request(app).get('/api/mmr?playlist=Standard');
    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].playlist).toBe('Standard');
  });

  it('filters records by date range', async () => {
    const payload = {
      timestamp: '2025-11-13T00:00:00Z',
      playlist: 'Standard',
      mmr: 2100,
      gamesPlayedDiff: 2,
      source: 'bakkes',
    };

    await request(app).post('/api/mmr-log').send(payload).set('Content-Type', 'application/json');
    await request(app)
      .post('/api/mmr-log')
      .send({ ...payload, timestamp: '2025-11-14T00:00:00Z', mmr: 2150 })
      .set('Content-Type', 'application/json');

    const response = await request(app).get(
      '/api/mmr?from=2025-11-14T00:00:00Z&to=2025-11-14T23:59:59Z'
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].timestamp).toBe('2025-11-14T00:00:00Z');
  });

  it('applies playlist and date filters together', async () => {
    const base = {
      timestamp: '2025-11-12T23:00:00Z',
      playlist: 'Standard',
      mmr: 2080,
      gamesPlayedDiff: 1,
      source: 'bakkes',
    };

    await request(app).post('/api/mmr-log').send(base).set('Content-Type', 'application/json');
    await request(app)
      .post('/api/mmr-log')
      .send({ ...base, playlist: 'Champions', timestamp: '2025-11-13T02:00:00Z', mmr: 2140 })
      .set('Content-Type', 'application/json');

    const response = await request(app).get(
      '/api/mmr?playlist=Champions&from=2025-11-13T00:00:00Z&to=2025-11-13T03:00:00Z'
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].playlist).toBe('Champions');
    expect(response.body[0].timestamp).toBe('2025-11-13T02:00:00Z');
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

  it('deletes a skill when no presets or sessions reference it', async () => {
    const skill = await request(app)
      .post('/api/skills')
      .send({ name: 'Transient' })
      .set('Content-Type', 'application/json');

    const deleted = await request(app).delete(`/api/skills/${skill.body.id}`);
    expect(deleted.statusCode).toBe(204);

    const get = await request(app).get('/api/skills');
    expect(get.statusCode).toBe(200);
    expect(get.body).toEqual([]);
  });

  it('prevents deleting a skill while it exists in a preset and allows removal after the preset is deleted', async () => {
    const skill = await request(app)
      .post('/api/skills')
      .send({ name: 'Preset blocker' })
      .set('Content-Type', 'application/json');

    const presetPayload = {
      name: 'Blocking preset',
      blocks: [
        {
          orderIndex: 1,
          skillId: skill.body.id,
          type: 'focus',
          durationSeconds: 60,
        },
      ],
    };

    const createdPreset = await request(app)
      .post('/api/presets')
      .send(presetPayload)
      .set('Content-Type', 'application/json');

    const blocked = await request(app).delete(`/api/skills/${skill.body.id}`);
    expect(blocked.statusCode).toBe(400);
    expect(blocked.body).toEqual({ error: 'Skill is referenced by existing presets or sessions' });

    const deletedPreset = await request(app).delete(`/api/presets/${createdPreset.body.id}`);
    expect(deletedPreset.statusCode).toBe(204);

    const deletedSkill = await request(app).delete(`/api/skills/${skill.body.id}`);
    expect(deletedSkill.statusCode).toBe(204);
  });

  it('prevents deleting a skill used in session blocks', async () => {
    const skill = await request(app)
      .post('/api/skills')
      .send({ name: 'Session blocker' })
      .set('Content-Type', 'application/json');

    await request(app)
      .post('/api/sessions')
      .send({
        startedTime: '2025-11-13T10:00:00Z',
        source: 'testing',
        blocks: [
          {
            type: 'review',
            skillIds: [skill.body.id],
            plannedDuration: 120,
            actualDuration: 120,
          },
        ],
      })
      .set('Content-Type', 'application/json');

    const blocked = await request(app).delete(`/api/skills/${skill.body.id}`);
    expect(blocked.statusCode).toBe(400);
    expect(blocked.body).toEqual({ error: 'Skill is referenced by existing presets or sessions' });
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

  it('returns blocks ordered by orderIndex even if posted out of order', async () => {
    const skillPayload = { name: 'Control' };
    const skill = await request(app)
      .post('/api/skills')
      .send(skillPayload)
      .set('Content-Type', 'application/json');

    const payload = {
      name: 'Order test',
      blocks: [
        {
          orderIndex: 2,
          skillId: skill.body.id,
          type: 'rest',
          durationSeconds: 120,
          notes: 'second block',
        },
        {
          orderIndex: 1,
          skillId: skill.body.id,
          type: 'focus',
          durationSeconds: 180,
          notes: 'first block',
        },
      ],
    };

    await request(app)
      .post('/api/presets')
      .send(payload)
      .set('Content-Type', 'application/json');

    const get = await request(app).get('/api/presets');
    expect(get.statusCode).toBe(200);
    expect(get.body[0].blocks.map((block) => block.orderIndex)).toEqual([1, 2]);
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
    expect(post.body.actualDuration).toBe(payload.blocks[0].actualDuration);
    expect(post.body.skillIds).toEqual([]);
    expect(post.body.notes).toBe(payload.notes);

    const get = await request(app).get('/api/sessions');
    expect(get.statusCode).toBe(200);
    expect(get.body[0]).toMatchObject({
      startedTime: payload.startedTime,
      source: payload.source,
    });
    expect(get.body[0].actualDuration).toBe(payload.blocks[0].actualDuration);
    expect(get.body[0].skillIds).toEqual([]);
    expect(get.body[0].notes).toBe(payload.notes);
    expect(get.body[0].blocks[0].type).toBe(payload.blocks[0].type);
  });

  it('aggregates skill ids and duration across blocks', async () => {
    const payload = {
      startedTime: '2025-11-13T12:00:00Z',
      source: 'quick',
      blocks: [
        {
          type: 'focus',
          skillIds: [1, 2],
          plannedDuration: 120,
          actualDuration: 110,
        },
        {
          type: 'review',
          skillIds: [2, 3],
          plannedDuration: 60,
          actualDuration: 45,
        },
      ],
    };

    const post = await request(app)
      .post('/api/sessions')
      .send(payload)
      .set('Content-Type', 'application/json');

    expect(post.statusCode).toBe(201);
    expect(post.body.actualDuration).toBe(155);
    expect(post.body.skillIds).toEqual([1, 2, 3]);

    const get = await request(app).get('/api/sessions');
    expect(get.body[0].skillIds).toEqual([1, 2, 3]);
    expect(get.body[0].actualDuration).toBe(155);
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

  it('rejects blocks with non-numeric skill ids', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({
        startedTime: '2025-11-13T10:00:00Z',
        source: 'quick',
        blocks: [
          {
            type: 'warmup',
            skillIds: ['bad'],
            plannedDuration: 60,
            actualDuration: 60,
          },
        ],
      })
      .set('Content-Type', 'application/json');

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: 'skillIds must be an array of numbers' });
  });
});

describe('summary endpoints', () => {
  it('reports minutes per skill', async () => {
    const skillPayload = { name: 'Aerial control' };
    const skill = await request(app)
      .post('/api/skills')
      .send(skillPayload)
      .set('Content-Type', 'application/json');

    const sessionPayload = {
      startedTime: '2025-11-13T12:00:00Z',
      finishedTime: '2025-11-13T12:04:00Z',
      source: 'preset',
      blocks: [
        {
          type: 'focus',
          skillIds: [skill.body.id],
          plannedDuration: 120,
          actualDuration: 180,
          notes: 'focus on ceiling shots',
        },
      ],
    };

    await request(app)
      .post('/api/sessions')
      .send(sessionPayload)
      .set('Content-Type', 'application/json');

    const response = await request(app).get('/api/summary/skills');
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([
      expect.objectContaining({
        skillId: skill.body.id,
        name: skill.body.name,
        minutes: 3,
      }),
    ]);
  });
});