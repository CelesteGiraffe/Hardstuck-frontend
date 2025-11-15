import { beforeEach, describe, expect, it } from 'vitest';
import { readCache, writeCache, dashboardCacheVersion } from './homeCache';

describe('homeCache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reads versioned entries that match the current cache version', () => {
    const payload = [
      {
        id: 1,
        timestamp: new Date().toISOString(),
        playlist: 'Standard',
        mmr: 2100,
        gamesPlayedDiff: 1,
        source: 'bakkes',
      },
    ];

    writeCache('latestMmr', payload);
    const entry = readCache('latestMmr');

    expect(entry).not.toBeNull();
    expect(entry?.version).toBe(dashboardCacheVersion);
    expect(entry?.data).toEqual(payload);
  });

  it('drops entries that use an outdated version', () => {
    const storageKey = '@rl-trainer/dashboard-latest-mmr';
    const staleEntry = {
      version: 'old-version',
      timestamp: new Date().toISOString(),
      data: [],
    };

    localStorage.setItem(storageKey, JSON.stringify(staleEntry));

    expect(readCache('latestMmr')).toBeNull();
    expect(localStorage.getItem(storageKey)).toBeNull();
  });
});
