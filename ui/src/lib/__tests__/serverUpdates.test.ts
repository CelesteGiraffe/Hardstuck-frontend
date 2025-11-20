import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleServerUpdate, onServerUpdate, type ServerUpdateEvent } from '../serverUpdates';
import { mmrLogQuery, sessionsQuery, weeklySkillSummaryQuery, skillsQuery, presetsQuery } from '../queries';
import { profileStore } from '../profileStore';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('handleServerUpdate', () => {
  it('notifies listeners and refreshes all cached resources', () => {
    const mmrSpy = vi.spyOn(mmrLogQuery, 'refresh').mockResolvedValue([]);
    const sessionsSpy = vi.spyOn(sessionsQuery, 'refresh').mockResolvedValue([]);
    const weeklySpy = vi.spyOn(weeklySkillSummaryQuery, 'refresh').mockResolvedValue([]);
    const skillsSpy = vi.spyOn(skillsQuery, 'refresh').mockResolvedValue([]);
    const presetsSpy = vi.spyOn(presetsQuery, 'refresh').mockResolvedValue([]);
    const profileSpy = vi.spyOn(profileStore, 'refresh').mockResolvedValue();

    const listener = vi.fn();
    const unsubscribe = onServerUpdate(listener);

    const update: ServerUpdateEvent = {
      type: 'mmr-log',
      payload: { sample: true },
      timestamp: new Date().toISOString(),
    };

    handleServerUpdate(update);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(update);
    expect(mmrSpy).toHaveBeenCalledWith(undefined, { force: true });
    expect(sessionsSpy).toHaveBeenCalledWith(undefined, { force: true });
    expect(weeklySpy).toHaveBeenCalledWith(undefined, { force: true });
    expect(skillsSpy).toHaveBeenCalledWith(undefined, { force: true });
    expect(presetsSpy).toHaveBeenCalledWith(undefined, { force: true });
    expect(profileSpy).toHaveBeenCalledWith({ force: true });

    unsubscribe();
  });
});
