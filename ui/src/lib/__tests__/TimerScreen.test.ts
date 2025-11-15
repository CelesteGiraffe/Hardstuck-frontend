import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { Preset, Session, Skill, SkillSummary } from '../api';
import { get } from 'svelte/store';
import { selectedPreset } from '../stores';
import { presetsQuery, sessionsQuery, skillsQuery, weeklySkillSummaryQuery } from '../queries';

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

const sampleSkill: Skill = {
  id: 42,
  name: 'Aerial control',
  category: 'Mechanics',
  tags: 'air,demo',
  notes: 'focus on ceiling shots',
};

const createSessionMock = createSession as Mock;
let sessionsRefreshMock: Mock;
let weeklySummaryRefreshMock: Mock;

beforeEach(() => {
  selectedPreset.set(samplePreset);
  presetsQuery.setData([samplePreset]);
  skillsQuery.setData([sampleSkill]);
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
  vi.useRealTimers();
  cleanup();
  selectedPreset.set(null);
  localStorage.clear();
  sessionsRefreshMock.mockRestore();
  weeklySummaryRefreshMock.mockRestore();
  presetsQuery.reset();
  skillsQuery.reset();
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
  await waitFor(() => expect(get(selectedPreset)).toBeNull());
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

test('counts down the active block and completes via ticker updates', async () => {
  vi.useFakeTimers();
  const { getByRole, getByTestId, getByText } = render(TimerScreen);
  const startButton = getByRole('button', { name: 'Start' });
  await fireEvent.click(startButton);

  const firstActual = getByTestId('timeline-actual-1');
  vi.advanceTimersByTime(1000);
  await waitFor(() => expect(firstActual.textContent).toBe('0m 1s'));

  vi.advanceTimersByTime(59000);
  await waitFor(() => expect(firstActual.textContent).toBe('1m'));
  expect(getByText('Active')).toBeInTheDocument();
});

test('preserves custom block notes once the block completes', async () => {
  const noNotesPreset = {
    ...samplePreset,
    blocks: samplePreset.blocks.map((block, index) =>
      index === 0 ? { ...block, notes: '' } : block
    ),
  } satisfies Preset;

  selectedPreset.set(noNotesPreset);
  presetsQuery.setData([noNotesPreset]);

  const { getAllByPlaceholderText, getByText } = render(TimerScreen);
  const blockNoteInput = getAllByPlaceholderText('Capture thoughts or reminders')[0];
  await fireEvent.input(blockNoteInput, { target: { value: 'Focus flicks' } });

  const skipButton = getByText('Skip');
  await fireEvent.click(skipButton);
  await waitFor(() => expect(getByText('Notes saved')).toBeInTheDocument());
});

test('save workflow sends overrides and notes to createSession', async () => {
  const { getByRole, getByTestId, getByText } = render(TimerScreen);
  const actualOverride = getByTestId('actual-override-input');
  await fireEvent.input(actualOverride, { target: { value: '18' } });
  const notesTextarea = getByTestId('session-notes') as HTMLTextAreaElement;
  await fireEvent.input(notesTextarea, { target: { value: 'Smooth reps' } });

  await fireEvent.click(getByRole('button', { name: 'Start' }));
  await fireEvent.click(getByText('Skip'));
  await fireEvent.click(getByText('Skip'));

  const saveButton = await waitFor(() => getByRole('button', { name: 'Save session' }));
  await fireEvent.click(saveButton);

  await waitFor(() => expect(createSessionMock).toHaveBeenCalled());
  const payload = createSessionMock.mock.calls[0][0];
  expect(payload.notes).toBe('Smooth reps');
  expect(payload.blocks[0].actualDuration).toBe(18);
});
