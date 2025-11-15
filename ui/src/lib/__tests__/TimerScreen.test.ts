import { cleanup, fireEvent, render } from '@testing-library/svelte';
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
