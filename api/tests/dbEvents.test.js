process.env.DATABASE_PATH = ':memory:';

const db = require('../db');

describe('database change events', () => {
  beforeEach(() => {
    db.clearMmrLogs();
    db.clearPresetTables();
    db.clearSessionTables();
    db.clearTrainingGoals();
    db.clearSkills();
    db.clearProfileSettings();
    db.clearFavorites();
  });

  it('emits an event when an mmr log is saved', () => {
    const events = [];
    const unsubscribe = db.onChange((event) => events.push(event));
    expect(typeof unsubscribe).toBe('function');

    const timestamp = new Date().toISOString();
    db.saveMmrLog({
      timestamp,
      playlist: 'standard',
      mmr: 1000,
      gamesPlayedDiff: 1,
      source: 'test-suite',
    });

    unsubscribe();

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(
      expect.objectContaining({
        type: 'mmr-log',
        action: 'create',
        playlist: 'standard',
        source: 'test-suite',
        timestamp,
      })
    );
  });

  it('skips saving duplicate mmr entries for the same playlist', () => {
    const events = [];
    const unsubscribe = db.onChange((event) => events.push(event));

    db.saveMmrLog({
      timestamp: '2025-11-20T04:08:41Z',
      playlist: 'Ranked Doubles 2v2',
      mmr: 1250,
      gamesPlayedDiff: 1,
      source: 'test-suite',
    });

    db.saveMmrLog({
      timestamp: '2025-11-20T04:09:41Z',
      playlist: 'Ranked Doubles 2v2',
      mmr: 1250,
      gamesPlayedDiff: 1,
      source: 'test-suite',
    });

    db.saveMmrLog({
      timestamp: '2025-11-20T04:10:41Z',
      playlist: 'Ranked Duel 1v1',
      mmr: 1250,
      gamesPlayedDiff: 1,
      source: 'test-suite',
    });

    unsubscribe();

    const logs = db.getAllMmrLogs();
    const doublesLogs = logs.filter((log) => log.playlist === 'Ranked Doubles 2v2');
    const duelLogs = logs.filter((log) => log.playlist === 'Ranked Duel 1v1');

    expect(events).toHaveLength(2);
    expect(doublesLogs).toHaveLength(1);
    expect(duelLogs).toHaveLength(1);
  });

  it('emits an event when a session is saved', () => {
    const events = [];
    const unsubscribe = db.onChange((event) => events.push(event));

    const sessionStart = new Date().toISOString();
    const saved = db.saveSession({
      startedTime: sessionStart,
      finishedTime: null,
      source: 'session-test',
      presetId: null,
      notes: null,
      blocks: [],
    });

    unsubscribe();

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(
      expect.objectContaining({
        type: 'session',
        action: 'create',
        sessionId: saved.id,
        source: 'session-test',
      })
    );
  });
});
