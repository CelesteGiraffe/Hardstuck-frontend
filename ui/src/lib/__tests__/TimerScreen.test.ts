import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { Preset, Session, SkillSummary } from '../api';
import { selectedPreset } from '../stores';
import { sessionsQuery, weeklySkillSummaryQuery } from '../queries';

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    createSession: vi.fn(),
  };
});

import TimerScreen from '../TimerScreen.svelte';
import { createSession } from '../api';

const samplePreset: Preset = {
  id: 1,
  name: 'Focus Flow',
  blocks: [
    {
      id: 1,
      presetId: 1,
      orderIndex: 0,
      skillId: 42,
      type: 'warm-up',
      durationSeconds: 60,
      notes: 'Breathe slowly before diving in.',
    },
    {
      id: 2,
      presetId: 1,
      orderIndex: 1,
      skillId: 43,
      type: 'cool-down',
      durationSeconds: 90,
      notes: '',
    },
  ],
};

const createSessionMock = createSession as Mock;
let sessionsRefreshMock: Mock;
let weeklySummaryRefreshMock: Mock;

beforeEach(() => {
  selectedPreset.set(samplePreset);
  localStorage.clear();
  createSessionMock.mockReset();
  createSessionMock.mockResolvedValue({} as Session);
  sessionsRefreshMock = vi
    .spyOn(sessionsQuery, 'refresh')
    .mockResolvedValue([] as Session[]) as Mock;
  weeklySummaryRefreshMock = vi
    .spyOn(weeklySkillSummaryQuery, 'refresh')
    .mockResolvedValue([] as SkillSummary[]) as Mock;
});

afterEach(() => {
  cleanup();
  selectedPreset.set(null);
  localStorage.clear();
  sessionsRefreshMock.mockRestore();
  weeklySummaryRefreshMock.mockRestore();
});

test('loads stored audio preference when available', () => {
  localStorage.setItem('timer-audio-cues', 'false');
  const { getByTestId } = render(TimerScreen);
  const audioToggle = getByTestId('audio-toggle') as HTMLInputElement;
  expect(audioToggle.checked).toBe(false);
});

test('persists vibration preference toggles', async () => {
  const { getByTestId } = render(TimerScreen);
  const vibrationToggle = getByTestId('vibration-toggle') as HTMLInputElement;
  await fireEvent.change(vibrationToggle, { target: { checked: false } });
  expect(localStorage.getItem('timer-vibration-cues')).toBe('false');
});

test('manual actual override updates timeline actual duration', async () => {
  const { getByTestId } = render(TimerScreen);
  const actualInput = getByTestId('actual-override-input') as HTMLInputElement;
  await fireEvent.input(actualInput, { target: { value: '45' } });
  expect(getByTestId('timeline-actual-1').textContent).toContain('0m 45s');
});

test('shows note badge after completing block with existing notes', async () => {
  const { getByText } = render(TimerScreen);
  const skipButton = getByText('Skip');
  await fireEvent.click(skipButton);
  await waitFor(() => {
    expect(getByText('Notes saved')).toBeInTheDocument();
  });
});

test('shows save CTA when session completes and refreshes on successful save', async () => {
  let resolveCreate: (() => void) | null = null;
  createSessionMock.mockImplementationOnce(
    () =>
      new Promise<Session>((resolve) => {
        resolveCreate = () => resolve({} as Session);
      })
  );

  const { getByText, getByRole, queryByRole } = render(TimerScreen);
  const skipButton = getByText('Skip');
  await fireEvent.click(skipButton);
  await fireEvent.click(skipButton);

  const saveButton = await waitFor(() => getByRole('button', { name: 'Save session' }));
  await fireEvent.click(saveButton);
  expect(saveButton).toBeDisabled();
  expect(resolveCreate).toBeTruthy();
  resolveCreate!();

  await waitFor(() => expect(createSessionMock).toHaveBeenCalled());
  await waitFor(() => expect(sessionsRefreshMock).toHaveBeenCalled());
  expect(weeklySummaryRefreshMock).toHaveBeenCalled();
  await waitFor(() => {
    expect(queryByRole('button', { name: 'Save session' })).not.toBeInTheDocument();
  });
});

test('shows save error when the API fails and keeps notes intact', async () => {
  createSessionMock.mockRejectedValueOnce(new Error('network fail'));

  const { getByText, getByRole, getByTestId } = render(TimerScreen);
  const notesInput = getByTestId('session-notes') as HTMLTextAreaElement;
  await fireEvent.input(notesInput, { target: { value: 'Still here' } });

  const skipButton = getByText('Skip');
  await fireEvent.click(skipButton);
  await fireEvent.click(skipButton);

  const saveButton = await waitFor(() => getByRole('button', { name: 'Save session' }));
  await fireEvent.click(saveButton);

  await waitFor(() => {
    expect(getByText('network fail')).toBeInTheDocument();
  });

  expect(notesInput.value).toBe('Still here');
  expect(saveButton).not.toBeDisabled();
});
