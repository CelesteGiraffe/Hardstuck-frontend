import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import PresetsScreen from './PresetsScreen.svelte';
import * as api from './api';
import { resetSkillsCacheForTests } from './useSkills';

vi.mock('./constants', async () => {
  const actual = await vi.importActual<typeof import('./constants')>('./constants');
  return {
    ...actual,
    getBakkesUserId: () => 'test-player',
  };
});

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    getSkills: vi.fn(),
    getPresets: vi.fn(),
    getPresetShare: vi.fn(),
    importPresetShare: vi.fn(),
  };
});

const mockedApi = vi.mocked(api, true);

describe.skip('PresetsScreen share workflow', () => {
  const skills = [
    { id: 1, name: 'Fooskill', category: 'Control', tags: '', notes: '', favoriteCode: null, favoriteName: null },
  ];
  const presets = [
    {
      id: 1,
      name: 'Stream routine',
      orderIndex: 0,
      blocks: [
        { id: 1, presetId: 1, orderIndex: 0, skillId: 1, type: 'Warm up', durationSeconds: 120, notes: '' },
      ],
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
    resetSkillsCacheForTests();
    const env = import.meta.env as ImportMetaEnv & Record<string, string | undefined>;
    env.VITE_BAKKES_USER_ID = 'test-player';
  });

  const stubPresets = () => {
    mockedApi.getSkills.mockResolvedValue(skills);
    mockedApi.getPresets.mockResolvedValue(presets);
  };

  it('generates a share string', async () => {
    stubPresets();
    const shareSpy = mockedApi.getPresetShare.mockResolvedValue('RLTRAINER:PRESET:V1:ABC');

    const { getByLabelText, getByText, findByTestId, findByText } = render(PresetsScreen);

    const shareButton = await waitFor(() => getByLabelText('Share preset'));
    await fireEvent.click(shareButton);

    await findByText('Share preset'); // wait for dialog to open

    const generateButton = await waitFor(() => getByText('Generate share text'));
    await fireEvent.click(generateButton);

    await waitFor(() => expect(shareSpy).toHaveBeenCalledWith(presets[0].id));
    const output = await findByTestId('share-output') as HTMLTextAreaElement;
    expect(output.value).toBe('RLTRAINER:PRESET:V1:ABC');
  });
});
