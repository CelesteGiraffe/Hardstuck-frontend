import { derived } from 'svelte/store';
import { createResourceStore } from './createResourceStore';
import * as api from '../api';
import type { Skill, Preset, Session, SkillSummary, MmrRecord } from '../api';

const FIVE_MINUTES = 5 * 60 * 1000;
const TWO_MINUTES = 2 * 60 * 1000;

function fetchWeeklySkillSummary(): Promise<SkillSummary[]> {
  const to = new Date();
  const from = new Date(to);
  from.setDate(to.getDate() - 7);
  return api.getSkillSummary({ from: from.toISOString(), to: to.toISOString() });
}

export const skillsQuery = createResourceStore<Skill[], void>(() => api.getSkills(), {
  initialData: [],
  refreshIntervalMs: FIVE_MINUTES,
  label: 'skills',
});

export const presetsQuery = createResourceStore<Preset[], void>(() => api.getPresets(), {
  initialData: [],
  refreshIntervalMs: FIVE_MINUTES,
  label: 'presets',
});

export const sessionsQuery = createResourceStore<Session[], { start?: string; end?: string }>((params) => api.getSessions(params), {
  initialData: [],
  refreshIntervalMs: TWO_MINUTES,
  label: 'sessions',
});

export const mmrLogQuery = createResourceStore<
  MmrRecord[],
  { playlist?: string; from?: string; to?: string }
>((params) => api.getMmrRecords(params),
  {
    initialData: [],
    refreshIntervalMs: FIVE_MINUTES,
    label: 'mmr-logs',
  }
);

export const weeklySkillSummaryQuery = createResourceStore<SkillSummary[], void>(fetchWeeklySkillSummary, {
  initialData: [],
  refreshIntervalMs: FIVE_MINUTES,
  label: 'weekly-summary',
});

const errorSources = [skillsQuery, presetsQuery, sessionsQuery, mmrLogQuery, weeklySkillSummaryQuery];

export const apiOfflineMessage = derived(errorSources, (states) => states.find((state) => state.error)?.error ?? null);

export const isApiOffline = derived(errorSources, (states) => states.some((state) => Boolean(state.error)));
