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

describe('Preset share API', () => {
  function seedPresetWithFavorite() {
    const skill = db.upsertSkill({
      name: 'Aerial control',
      category: 'Aerial',
      tags: 'offense,aerial',
      notes: 'Keep hover height low',
      favoriteCode: 'ABC-123',
      favoriteName: 'Aerial Drill',
    });

    return db.savePreset({
      name: 'Stream routine',
      blocks: [
        {
          orderIndex: 0,
          skillId: skill.id,
          type: 'Warm up',
          durationSeconds: 120,
          notes: 'Set rotation before taking shots',
        },
      ],
    });
  }

  it('returns a share bundle for a preset', async () => {
    const preset = seedPresetWithFavorite();

    const response = await request(app).get(`/api/presets/${preset.id}/share`);

    expect(response.statusCode).toBe(200);
    expect(typeof response.body.share).toBe('string');
    expect(response.body.share.startsWith('RLTRAINER:PRESET:V1:')).toBe(true);
  });

  it('requires X-User-Id when importing', async () => {
    const preset = seedPresetWithFavorite();
    const shareResponse = await request(app).get(`/api/presets/${preset.id}/share`);

    const response = await request(app).post('/api/presets/share/import').send({ share: shareResponse.body.share });

    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual({ error: 'X-User-Id header is required' });
  });

  it('imports a shared preset and recreates the favorite', async () => {
    const preset = seedPresetWithFavorite();
    const shareResponse = await request(app).get(`/api/presets/${preset.id}/share`);

    db.clearPresetTables();
    db.clearSkills();
    db.clearFavorites();

    const response = await request(app)
      .post('/api/presets/share/import')
      .set('X-User-Id', 'share-target')
      .send({ share: shareResponse.body.share });

    expect(response.statusCode).toBe(201);
    expect(response.body.preset.name).toBe('Stream routine');

    const presets = db.getAllPresets();
    expect(presets).toHaveLength(1);
    expect(presets[0].name).toBe('Stream routine');
    expect(presets[0].blocks).toHaveLength(1);
    expect(presets[0].blocks[0].type).toBe('Warm up');

    const skills = db.getAllSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0].favoriteCode).toBe('ABC-123');
    expect(skills[0].favoriteName).toBe('Aerial Drill');

    const favorites = db.getFavoritesByUser('share-target');
    expect(favorites).toEqual([{ name: 'Aerial Drill', code: 'ABC-123' }]);
  });
});
