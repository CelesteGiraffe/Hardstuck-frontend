import { derived } from 'svelte/store';
import { createResourceStore } from './queries/createResourceStore';
import * as api from './api';
import type {
  GoalProgress,
  ProfileSettings,
  ProfileSettingsPayload,
  TrainingGoal,
  TrainingGoalPayload,
} from './api';

type ProfileResourceData = {
  settings: ProfileSettings;
  goals: TrainingGoal[];
  progress: GoalProgress[];
};

const initialProfileData: ProfileResourceData = {
  settings: {
    id: 1,
    name: '',
    avatarUrl: '',
    timezone: '',
    defaultWeeklyTargetMinutes: 0,
  },
  goals: [],
  progress: [],
};

const PROFILE_REFRESH_INTERVAL_MS = 60 * 1000;

const profileResource = createResourceStore<ProfileResourceData, void>(
  () => api.getProfile(),
  {
    initialData: initialProfileData,
    label: 'profile',
    refreshIntervalMs: PROFILE_REFRESH_INTERVAL_MS,
  }
);

const settings = derived(profileResource, (state) => state.data.settings);
const goals = derived(profileResource, (state) => state.data.goals);
const progressMap = derived(profileResource, (state) =>
  state.data.progress.reduce<Record<number, GoalProgress>>((acc, progress) => {
    acc[progress.goalId] = progress;
    return acc;
  }, {})
);

async function refresh(options?: { force?: boolean }) {
  await profileResource.refresh(undefined, options);
}

async function updateSettings(payload: ProfileSettingsPayload): Promise<void> {
  await api.updateProfileSettings(payload);
  await refresh({ force: true });
}

async function saveGoal(payload: TrainingGoalPayload): Promise<TrainingGoal> {
  const goal = await api.saveGoal(payload);
  await refresh({ force: true });
  return goal;
}

async function deleteGoal(id: number): Promise<void> {
  await api.deleteGoal(id);
  await refresh({ force: true });
}

function getGoalProgress(goalId: number, params?: { from?: string; to?: string }) {
  return api.getGoalProgress(goalId, params);
}

export const profileStore = {
  settings,
  goals,
  progressMap,
  refresh,
  updateSettings,
  saveGoal,
  deleteGoal,
  getGoalProgress,
};