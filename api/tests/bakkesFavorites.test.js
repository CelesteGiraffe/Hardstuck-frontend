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

describe('GET /api/v1/bakkes/favorites', () => {
  it('returns an empty list when no favorites are stored for the user', async () => {
    const response = await request(app).get('/api/v1/bakkes/favorites').set('X-User-Id', 'player-one');

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('returns only the favorites that belong to the authenticated user', async () => {
    db.addFavoriteForUser({ userId: 'player-one', name: 'Boost Play', code: 'AAA-111' });
    db.addFavoriteForUser({ userId: 'player-one', name: 'Aerial Drill', code: 'BBB-222' });
    db.addFavoriteForUser({ userId: 'player-two', name: 'Other Set', code: 'ZZZ-999' });

    const response = await request(app).get('/api/v1/bakkes/favorites').set('X-User-Id', 'player-one');

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([
      { name: 'Boost Play', code: 'AAA-111' },
      { name: 'Aerial Drill', code: 'BBB-222' },
    ]);
  });

  it('returns 401 when the user header is missing', async () => {
    const response = await request(app).get('/api/v1/bakkes/favorites');

    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual({ error: 'X-User-Id header is required' });
  });

  it('returns 500 when the favorites store fails', async () => {
    const spy = jest.spyOn(db, 'getFavoritesByUser').mockImplementation(() => {
      throw new Error('boom');
    });

    const response = await request(app).get('/api/v1/bakkes/favorites').set('X-User-Id', 'player-one');

    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({ error: 'Unable to load favorites' });

    spy.mockRestore();
  });
});
