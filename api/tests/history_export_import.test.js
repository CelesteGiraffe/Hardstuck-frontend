process.env.DATABASE_PATH = ':memory:';

const request = require('supertest');
const db = require('../db');
const app = require('../app');

describe('history export/import', () => {
  beforeEach(() => {
    db.clearMmrLogs();
    db.clearPresetTables();
    db.clearSessionTables();
    db.clearTrainingGoals();
    db.clearSkills();
    db.clearProfileSettings();
    db.clearFavorites();
  });

  it('exports CSV with header and multiple playlists', async () => {
    const payloads = [
      {
        timestamp: '2025-11-23T09:02:00Z',
        playlist: 'Dropshot',
        mmr: 750,
        gamesPlayedDiff: 0,
        source: 'bakkes_snapshot',
      },
      {
        timestamp: '2025-11-23T10:00:00Z',
        playlist: 'Standard',
        mmr: 1620,
        gamesPlayedDiff: 1,
        source: 'manual',
      },
    ];

    for (const payload of payloads) {
      await request(app)
        .post('/api/mmr-log')
        .set('Content-Type', 'application/json')
        .send(payload);
    }

    const response = await request(app).get('/api/history/export');

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/csv/);
    expect(response.text).toContain('MMR Playlist,Timestamp,MMR,Games Played Diff,Source');
    expect(response.text).toContain('Dropshot,2025-11-23T09:02:00Z,750,0,bakkes_snapshot');
    expect(response.text).toContain('Casual,2025-11-23T10:00:00Z,1620,1,manual');
  });

  it('imports CSV rows and reports a summary', async () => {
    const csv = `MMR Playlist,Timestamp,MMR,Games Played Diff,Source\nDropshot,2025-11-23T09:02:00Z,750,0,bakkes_snapshot\nStandard,2025-11-23T10:00:00Z,1630,1,manual`;

    const response = await request(app)
      .post('/api/history/import')
      .set('Content-Type', 'application/json')
      .send({ csv });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ imported: 2, skipped: 0, errors: [] });

    const logs = db.getAllMmrLogs();
    expect(logs).toHaveLength(2);
    expect(logs.map((log) => log.playlist)).toContain('Dropshot');
    expect(logs.map((log) => log.playlist)).toContain('Casual');
  });

  it('skips invalid rows but still imports valid entries', async () => {
    const csv = `MMR Playlist,Timestamp,MMR,Games Played Diff,Source\n,2025-11-23T09:00:00Z,750,0,bakkes_snapshot\nStandard,not-a-date,1600,1,manual\nModern,2025-11-23T10:00:00Z,1700,1,manual`;

    const response = await request(app)
      .post('/api/history/import')
      .set('Content-Type', 'application/json')
      .send({ csv });

    expect(response.statusCode).toBe(200);
    expect(response.body.imported).toBe(1);
    expect(response.body.skipped).toBe(0);
    expect(response.body.errors).toEqual([
      'Line 2: playlist is required',
      'Line 3: invalid timestamp',
    ]);

    const logs = db.getAllMmrLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].playlist).toBe('Modern');
  });

  it('counts skipped rows that are duplicates', async () => {
    const csv = `MMR Playlist,Timestamp,MMR,Games Played Diff,Source\nDropshot,2025-11-23T09:02:00Z,750,0,bakkes_snapshot\nDropshot,2025-11-23T09:03:00Z,750,0,bakkes_snapshot`;

    const response = await request(app)
      .post('/api/history/import')
      .set('Content-Type', 'application/json')
      .send({ csv });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ imported: 1, skipped: 1, errors: [] });
  });
});
