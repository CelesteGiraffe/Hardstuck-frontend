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

describe('GET /api/bakkesmod/history', () => {
  it('returns empty history and a status payload when no data exists', async () => {
    const response = await request(app).get('/api/bakkesmod/history');

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      mmrHistory: [],
      trainingHistory: [],
      status: expect.objectContaining({
        receivedAt: expect.any(String),
        generatedAt: expect.any(String),
        mmrEntries: 0,
        trainingSessions: 0,
        lastMmrTimestamp: null,
        lastTrainingTimestamp: null,
        mmrLimit: 50,
        sessionLimit: 25,
      }),
    });
  });

  it('returns the latest MMR logs and sessions respecting limits', async () => {
    const baseMmrPayload = {
      timestamp: '2025-11-17T18:00:00Z',
      playlist: 'Standard',
      mmr: 2100,
      gamesPlayedDiff: 1,
      source: 'bakkes',
    };

    await request(app)
      .post('/api/mmr-log')
      .send(baseMmrPayload)
      .set('Content-Type', 'application/json');

    await request(app)
      .post('/api/mmr-log')
      .send({
        ...baseMmrPayload,
        timestamp: '2025-11-18T18:00:00Z',
        mmr: 2150,
      })
      .set('Content-Type', 'application/json');

    const sessionPayload = (startedTime) => ({
      startedTime,
      source: 'bakkesmod',
      blocks: [
        {
          type: 'drill',
          skillIds: [],
          plannedDuration: 60,
          actualDuration: 60,
        },
      ],
    });

    await request(app)
      .post('/api/sessions')
      .send(sessionPayload('2025-11-17T18:00:00Z'))
      .set('Content-Type', 'application/json');

    await request(app)
      .post('/api/sessions')
      .send(sessionPayload('2025-11-18T19:30:00Z'))
      .set('Content-Type', 'application/json');

    const response = await request(app).get(
      '/api/bakkesmod/history?mmrLimit=1&sessionLimit=1&playlist=Casual'
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.mmrHistory).toHaveLength(1);
    expect(response.body.mmrHistory[0].mmr).toBe(2150);
    expect(response.body.trainingHistory).toHaveLength(1);
    expect(response.body.trainingHistory[0].startedTime).toBe('2025-11-18T19:30:00Z');
    expect(response.body.status.filters).toEqual({
      playlist: 'Casual',
      mmrFrom: null,
      mmrTo: null,
      sessionStart: null,
      sessionEnd: null,
    });
    expect(response.body.status.mmrLimit).toBe(1);
    expect(response.body.status.sessionLimit).toBe(1);
  });

  it('rejects invalid limits for mmr and session history', async () => {
    const response = await request(app).get('/api/bakkesmod/history?mmrLimit=0');
    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: 'mmrLimit must be greater than 0' });

    const sessionLimitResponse = await request(app).get('/api/bakkesmod/history?sessionLimit=abc');
    expect(sessionLimitResponse.statusCode).toBe(400);
    expect(sessionLimitResponse.body).toEqual({ error: 'sessionLimit must be an integer' });
  });
});