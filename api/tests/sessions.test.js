process.env.DATABASE_PATH = ':memory:';

const request = require('supertest');
const app = require('../app');
const db = require('../db');

beforeEach(() => {
  db.clearMmrLogs();
  db.clearPresetTables();
  db.clearSkills();
  db.clearSessionTables();
});

describe('POST /api/sessions', () => {
  it('creates a session with blocks and returns persisted data', async () => {
    const payload = {
      startedTime: '2025-11-15T08:00:00Z',
      finishedTime: '2025-11-15T08:30:00Z',
      source: 'timer',
      blocks: [
        {
          type: 'warmup',
          skillIds: [1],
          plannedDuration: 120,
          actualDuration: 110,
          notes: 'minutes of focus',
        },
        {
          type: 'focus',
          skillIds: [1, 2],
          plannedDuration: 180,
          actualDuration: 180,
        },
      ],
    };

    const response = await request(app)
      .post('/api/sessions')
      .send(payload)
      .set('Content-Type', 'application/json');

    expect(response.statusCode).toBe(201);
    expect(response.body).toMatchObject({
      source: payload.source,
      notes: null,
      skillIds: [1, 2],
      actualDuration: 290,
    });
    expect(response.body.blocks).toHaveLength(2);
    expect(response.body.blocks[0]).toMatchObject({
      type: 'warmup',
      plannedDuration: 120,
      actualDuration: 110,
      notes: 'minutes of focus',
    });

    const sessionsList = await request(app).get('/api/sessions');
    expect(sessionsList.statusCode).toBe(200);
    expect(sessionsList.body).toHaveLength(1);
    expect(sessionsList.body[0].blocks[1].plannedDuration).toBe(180);
  });

  it('rejects missing required fields on payload and leaves tables empty', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({ blocks: [] })
      .set('Content-Type', 'application/json');

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: 'startedTime and source are required' });

    const sessionsList = await request(app).get('/api/sessions');
    expect(sessionsList.body).toHaveLength(0);
  });

  it('rejects blocks missing required metadata and does not persist partial data', async () => {
    const badPayload = {
      startedTime: '2025-11-15T09:00:00Z',
      source: 'preset',
      blocks: [
        {
          type: 'focus',
          skillIds: [3],
          actualDuration: 90,
        },
      ],
    };

    const response = await request(app)
      .post('/api/sessions')
      .send(badPayload)
      .set('Content-Type', 'application/json');

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({
      error: 'blocks must include type, skillIds array, plannedDuration, and actualDuration',
    });

    const sessionsList = await request(app).get('/api/sessions');
    expect(sessionsList.body).toHaveLength(0);
  });
});

describe('DELETE /api/sessions/:id', () => {
  it('removes a session and its blocks', async () => {
    const payload = {
      startedTime: '2025-11-15T08:00:00Z',
      source: 'timer',
      blocks: [
        {
          type: 'focus',
          skillIds: [1],
          plannedDuration: 120,
          actualDuration: 110,
        },
      ],
    };

    const createResponse = await request(app)
      .post('/api/sessions')
      .send(payload)
      .set('Content-Type', 'application/json');

    expect(createResponse.statusCode).toBe(201);
    const sessionId = createResponse.body.id;

    const deleteResponse = await request(app).delete(`/api/sessions/${sessionId}`);
    expect(deleteResponse.statusCode).toBe(204);

    const listResponse = await request(app).get('/api/sessions');
    expect(listResponse.body).toHaveLength(0);
  });

  it('returns 404 when the session does not exist', async () => {
    const response = await request(app).delete('/api/sessions/999');
    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({ error: 'session not found' });
  });

  it('validates the session id parameter', async () => {
    const response = await request(app).delete('/api/sessions/not-a-number');
    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: 'invalid session id' });
  });
});
