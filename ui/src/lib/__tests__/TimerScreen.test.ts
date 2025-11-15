import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test } from 'vitest';
import TimerScreen from '../TimerScreen.svelte';
import { selectedPreset } from '../stores';
import type { Preset } from '../api';

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

beforeEach(() => {
  selectedPreset.set(samplePreset);
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  selectedPreset.set(null);
  localStorage.clear();
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
