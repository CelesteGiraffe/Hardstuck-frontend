import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { writable } from 'svelte/store';

const skillList = [
  { id: 2, name: 'Aerial control', category: 'Mechanics', tags: '', notes: '' },
];

vi.mock('../profileStore', () => {
  const defaultSettings = {
    id: 1,
    name: 'Test Trainer',
    avatarUrl: 'https://example.com/avatar.png',
    timezone: 'UTC',
    defaultWeeklyTargetMinutes: 120,
  };

  const existingGoal = {
    id: 1,
    label: 'Weekly focus',
    goalType: 'global' as const,
    skillId: null,
    targetMinutes: 90,
    targetSessions: 4,
    periodDays: 7,
    notes: 'Focus on mechanics every day',
  };

  const skillGoal = {
    id: 2,
    label: 'Skill focus',
    goalType: 'skill' as const,
    skillId: 2,
    targetMinutes: 45,
    targetSessions: 2,
    periodDays: 7,
    notes: 'Sharpen aerial reads',
  };

  const progressMap = {
    1: {
      goalId: 1,
      actualSeconds: 3600,
      actualMinutes: 60,
      actualSessions: 3,
      periodFrom: null,
      periodTo: null,
    },
  };

  const stores = {
    settingsStore: writable(defaultSettings),
    goalsStore: writable([existingGoal]),
    progressStore: writable(progressMap),
  };

  const mocks = {
    updateSettings: vi.fn(),
    saveGoal: vi.fn().mockResolvedValue({
      id: 2,
      label: 'New goal',
      goalType: 'skill',
      skillId: 2,
      targetMinutes: 30,
      targetSessions: null,
      periodDays: 5,
      notes: null,
    }),
    deleteGoal: vi.fn(),
    refresh: vi.fn(),
    getGoalProgress: vi.fn(),
  };

  const helpers = {
    defaultSettings,
    existingGoal,
    skillGoal,
    progressMap,
    stores,
    mocks,
  };

  return {
    profileStore: {
      settings: stores.settingsStore,
      goals: stores.goalsStore,
      progressMap: stores.progressStore,
      refresh: mocks.refresh,
      updateSettings: mocks.updateSettings,
      saveGoal: mocks.saveGoal,
      deleteGoal: mocks.deleteGoal,
      getGoalProgress: mocks.getGoalProgress,
    },
    __testHelpers: helpers,
  };
});

const mockedSkills = writable({
  skills: skillList,
  loading: false,
  error: null,
  lookup: { 2: skillList[0] },
});

vi.mock('../useSkills', () => ({
  useSkills: () => mockedSkills,
  resetSkillsCacheForTests: () => {},
}));

import ProfileScreen from '../ProfileScreen.svelte';
// @ts-ignore The mocked module exposes __testHelpers for testing.
import { __testHelpers } from '../profileStore';

const { stores, mocks, defaultSettings, existingGoal, progressMap } = __testHelpers;

const resetStores = () => {
  stores.settingsStore.set(defaultSettings);
  stores.goalsStore.set([existingGoal]);
  stores.progressStore.set(progressMap);
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetStores();
});

describe('ProfileScreen', () => {
  test('renders settings and goal data', () => {
    const { getByLabelText, getByText } = render(ProfileScreen);

    expect(getByLabelText('Display name')).toHaveValue(defaultSettings.name);
    expect(getByLabelText('Timezone')).toHaveValue(defaultSettings.timezone);
    expect(getByText('Global goals')).toBeInTheDocument();
    expect(getByText(existingGoal.label)).toBeInTheDocument();
  });

  test('shows validation errors when settings invalid', async () => {
    const { getByLabelText, getByRole, findByText } = render(ProfileScreen);

    const nameInput = getByLabelText('Display name');
    await fireEvent.input(nameInput, { target: { value: '' } });

    const saveButton = getByRole('button', { name: /save settings/i });
    const settingsForm = saveButton.closest('form');
    if (!settingsForm) {
      throw new Error('Settings form not found');
    }
    await fireEvent.submit(settingsForm);

    expect(await findByText(/please provide a display name/i)).toBeInTheDocument();
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });

  test('saves new skill goal through store', async () => {
    const { skillGoal } = __testHelpers;
    stores.goalsStore.set([skillGoal]);
    const { getAllByLabelText, getByLabelText } = render(ProfileScreen);

    const editButtons = getAllByLabelText('Edit goal');
    await fireEvent.click(editButtons[0]);

    await waitFor(() => expect(getByLabelText('Skill')).toBeInTheDocument());

    await fireEvent.input(getByLabelText('Label'), { target: { value: 'Updated focus' } });
    await fireEvent.input(getByLabelText('Target minutes'), { target: { value: '30' } });
    await fireEvent.input(getByLabelText('Period (days)'), { target: { value: '5' } });

    const goalFormElement = getByLabelText('Label').closest('form');
    if (!goalFormElement) {
      throw new Error('Goal form not rendered');
    }
    await fireEvent.submit(goalFormElement);

    await waitFor(() => expect(mocks.saveGoal).toHaveBeenCalled());
    expect(mocks.saveGoal).toHaveBeenCalledWith(expect.objectContaining({
      label: 'Updated focus',
      goalType: 'skill',
      skillId: 2,
      targetMinutes: 30,
      periodDays: 5,
      notes: skillGoal.notes,
      targetSessions: skillGoal.targetSessions,
      id: skillGoal.id,
    }));
  });
});
