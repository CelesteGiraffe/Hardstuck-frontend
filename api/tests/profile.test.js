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
});

describe('profile endpoints', () => {
  it('returns seeded settings with no goals', async () => {
    const response = await request(app).get('/api/profile');
    expect(response.statusCode).toBe(200);
    expect(response.body.settings).toEqual({
      id: 1,
      name: '',
      avatarUrl: '',
      timezone: '',
      defaultWeeklyTargetMinutes: 0,
    });
    expect(response.body.goals).toEqual([]);
    expect(response.body.progress).toEqual([]);
  });

  it('updates settings with valid payload', async () => {
    const payload = {
      name: 'Celeste',
      avatarUrl: 'https://example.com/avatar.png',
      timezone: 'UTC',
      defaultWeeklyTargetMinutes: 240,
    };

    const putResponse = await request(app)
      .put('/api/profile/settings')
      .send(payload)
      .set('Content-Type', 'application/json');

    expect(putResponse.statusCode).toBe(200);
    expect(putResponse.body).toEqual({
      id: 1,
      ...payload,
    });

    const getResponse = await request(app).get('/api/profile');
    expect(getResponse.body.settings).toMatchObject(payload);
  });

  it('rejects invalid settings payload', async () => {
    const response = await request(app)
      .put('/api/profile/settings')
      .send({ name: '', timezone: '', defaultWeeklyTargetMinutes: -5 })
      .set('Content-Type', 'application/json');

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('name is required');
  });
});

describe('training goals', () => {
  it('creates and deletes a goal', async () => {
    const payload = {
      label: 'Weekly focus',
      goalType: 'global',
      periodDays: 7,
      targetMinutes: 120,
    };

    const postResponse = await request(app)
      .post('/api/profile/goals')
      .send(payload)
      .set('Content-Type', 'application/json');

    expect(postResponse.statusCode).toBe(201);
    expect(postResponse.body).toMatchObject(payload);
    expect(postResponse.body.id).toBeDefined();

    const listResponse = await request(app).get('/api/profile');
    expect(listResponse.body.goals).toHaveLength(1);

    const deleteResponse = await request(app).delete(`/api/profile/goals/${postResponse.body.id}`);
    expect(deleteResponse.statusCode).toBe(204);

    const emptyList = await request(app).get('/api/profile');
    expect(emptyList.body.goals).toEqual([]);
  });

  it('rejects missing label or period days', async () => {
    const response = await request(app)
      .post('/api/profile/goals')
      .send({ goalType: 'global' })
      .set('Content-Type', 'application/json');

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('label is required');
  });
});

describe('goal progress calculations', () => {
  it('reports accurate progress for skill goal', async () => {
    const skill = await request(app)
      .post('/api/skills')
      .send({ name: 'Aerial' })
      .set('Content-Type', 'application/json');

    const goal = await request(app)
      .post('/api/profile/goals')
      .send({
        label: 'Aerial practice',
        goalType: 'skill',
        skillId: skill.body.id,
        periodDays: 7,
        targetMinutes: 60,
      })
      .set('Content-Type', 'application/json');

    expect(goal.statusCode).toBe(201);

    const sessionTime = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    await request(app)
      .post('/api/sessions')
      .send({
        startedTime: sessionTime,
        source: 'test',
        blocks: [
          {
            type: 'skill',
            skillIds: [skill.body.id],
            plannedDuration: 600,
            actualDuration: 600,
          },
        ],
      })
      .set('Content-Type', 'application/json');

    const progressResponse = await request(app).get(`/api/profile/goals/progress?goalId=${goal.body.id}`);
    expect(progressResponse.statusCode).toBe(200);
    expect(progressResponse.body).toMatchObject({
      goalId: goal.body.id,
      actualSeconds: 600,
      actualSessions: 1,
      actualMinutes: 10,
    });
  });

  it('includes goal progress in profile summary', async () => {
    const skill = await request(app)
      .post('/api/skills')
      .send({ name: 'Rotation' })
      .set('Content-Type', 'application/json');

    const goal = await request(app)
      .post('/api/profile/goals')
      .send({
        label: 'Rotation focus',
        goalType: 'skill',
        skillId: skill.body.id,
        periodDays: 7,
        targetMinutes: 30,
      })
      .set('Content-Type', 'application/json');

    const sessionTime = new Date().toISOString();
    await request(app)
      .post('/api/sessions')
      .send({
        startedTime: sessionTime,
        source: 'test',
        blocks: [
          {
            type: 'skill',
            skillIds: [skill.body.id],
            plannedDuration: 300,
            actualDuration: 300,
          },
        ],
      })
      .set('Content-Type', 'application/json');

    const profileResponse = await request(app).get('/api/profile');
    expect(profileResponse.body.progress).toHaveLength(1);
    expect(profileResponse.body.progress[0].goalId).toBe(goal.body.id);
  });
});
