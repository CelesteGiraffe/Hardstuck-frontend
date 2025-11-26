import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/svelte';
import SkillsScreen from './SkillsScreen.svelte';
import * as api from './api';
import { resetSkillsCacheForTests } from './useSkills';
import { skillsStore } from './skillsStore';

const baseSkill = {
  id: 1,
  name: 'Fooskill',
  category: 'Control',
  tags: 'air, offense',
  notes: 'Keep it clean',
  favoriteCode: null,
  favoriteName: null,
  trainingPacks: [],
};

describe('SkillsScreen training packs', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
    resetSkillsCacheForTests();
    vi.spyOn(api, 'getBakkesFavorites').mockResolvedValue([]);
    vi.spyOn(api, 'getSkills').mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('adds and removes training pack drafts before submitting', async () => {
    vi.spyOn(api, 'createSkill').mockResolvedValue({ ...baseSkill, id: 2 });

    const { getByLabelText, getByTestId, getByText, queryByText } = render(SkillsScreen);

    await waitFor(() => getByLabelText('Name'));

    const packNameInput = getByLabelText('New training pack name') as HTMLInputElement;
    const packCodeInput = getByLabelText('New training pack code') as HTMLInputElement;
    const addButton = getByTestId('add-pack-button');

    await fireEvent.input(packNameInput, { target: { value: 'Air Dribble Routine' } });
    await fireEvent.input(packCodeInput, { target: { value: 'abcd-1234-efgh-5678' } });
    await fireEvent.click(addButton);

    expect(queryByText('No training packs added yet.')).toBeNull();
    const list = getByTestId('training-list');
    expect(list.textContent).toContain('Air Dribble Routine');
    expect(list.textContent).toContain('ABCD-1234-EFGH-5678');

    const removeButton = getByText('Remove');
    await fireEvent.click(removeButton);
    await waitFor(() => expect(queryByText('Air Dribble Routine')).toBeNull());
  });

  it('validates training pack code format inline', async () => {
    const { getByLabelText, getByTestId, getByText } = render(SkillsScreen);

    await waitFor(() => getByLabelText('Name'));

    const packNameInput = getByLabelText('New training pack name') as HTMLInputElement;
    const packCodeInput = getByLabelText('New training pack code') as HTMLInputElement;
    const addButton = getByTestId('add-pack-button');

    await fireEvent.input(packNameInput, { target: { value: 'Invalid Pack' } });
    await fireEvent.input(packCodeInput, { target: { value: '1234-ABCD' } });
    await fireEvent.click(addButton);

    expect(getByText(/Code must match/)).toBeInTheDocument();
  });

  it('submits training packs with uppercase codes', async () => {
    const createSpy = vi.spyOn(api, 'createSkill').mockResolvedValue({ ...baseSkill, id: 2 });
    const refreshSpy = vi.spyOn(skillsStore, 'refresh').mockResolvedValue([]);

    const { getByLabelText, getByTestId, getByText } = render(SkillsScreen);

    const nameInput = (await waitFor(() => getByLabelText('Name'))) as HTMLInputElement;
    const packNameInput = getByLabelText('New training pack name') as HTMLInputElement;
    const packCodeInput = getByLabelText('New training pack code') as HTMLInputElement;
    const addButton = getByTestId('add-pack-button');

    await fireEvent.input(nameInput, { target: { value: 'Ceiling Control' } });
    await fireEvent.input(packNameInput, { target: { value: 'Ceiling Shots' } });
    await fireEvent.input(packCodeInput, { target: { value: 'wxyz-9876-tuvw-5432' } });
    await fireEvent.click(addButton);

    const submitButton = getByText('Save skill');
    const form = submitButton.closest('form');
    if (!form) {
      throw new Error('Expected save button to be inside a form');
    }
    await fireEvent.submit(form);

    await waitFor(() => expect(createSpy).toHaveBeenCalled());
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Ceiling Control',
        trainingPacks: [{ name: 'Ceiling Shots', code: 'WXYZ-9876-TUVW-5432' }],
      })
    );
    expect(refreshSpy).toHaveBeenCalled();
  });
});

describe('SkillsScreen actions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
    resetSkillsCacheForTests();
    const env = import.meta.env as ImportMetaEnv & Record<string, string | undefined>;
    env.VITE_BAKKES_USER_ID = 'test-player';
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('updates a skill and saves training packs', async () => {
    const skillWithPack = {
      ...baseSkill,
      trainingPacks: [{ id: 9, name: 'Backboard', code: 'BACK-1234-BOARD-5678', orderIndex: 0 }],
    };
    vi.spyOn(api, 'getSkills').mockResolvedValue([skillWithPack]);
    vi.spyOn(api, 'getBakkesFavorites').mockResolvedValue([]);
    const updateSpy = vi.spyOn(api, 'updateSkill').mockResolvedValue(skillWithPack);
    const refreshSpy = vi.spyOn(skillsStore, 'refresh').mockResolvedValue([skillWithPack]);

    const { getAllByLabelText, container } = render(SkillsScreen);

    await waitFor(() => getAllByLabelText('Edit Fooskill'));
    await fireEvent.click(getAllByLabelText('Edit Fooskill')[0]);

    const inlineForm = (await waitFor(() => container.querySelector('.skill-inline-form'))) as HTMLFormElement;
    const nameInput = inlineForm.querySelector('input[placeholder="Skill name"]') as HTMLInputElement;
    await fireEvent.input(nameInput, { target: { value: 'Fooskill Advanced' } });

    const addNameInput = inlineForm.querySelector('input[aria-label="Existing training pack name"]') as HTMLInputElement;
    const addCodeInput = inlineForm.querySelector('input[aria-label="Existing training pack code"]') as HTMLInputElement;
    await fireEvent.input(addNameInput, { target: { value: 'Corner Reads' } });
    await fireEvent.input(addCodeInput, { target: { value: 'CORN-1234-READ-5678' } });
    const addButton = within(inlineForm).getByText('Add');
    await fireEvent.click(addButton);

    await fireEvent.submit(inlineForm);

    await waitFor(() => expect(updateSpy).toHaveBeenCalled());
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        trainingPacks: [
          { name: 'Backboard', code: 'BACK-1234-BOARD-5678' },
          { name: 'Corner Reads', code: 'CORN-1234-READ-5678' },
        ],
      })
    );
    expect(refreshSpy).toHaveBeenCalled();
  });

  it('deletes a skill when confirmed', async () => {
    vi.spyOn(api, 'getSkills').mockResolvedValue([baseSkill]);
    vi.spyOn(api, 'getBakkesFavorites').mockResolvedValue([]);
    const deleteSpy = vi.spyOn(api, 'deleteSkill').mockResolvedValue(undefined);
    const refreshSpy = vi.spyOn(skillsStore, 'refresh').mockResolvedValue([baseSkill]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const { getAllByLabelText } = render(SkillsScreen);

    await waitFor(() => getAllByLabelText('Delete Fooskill'));
    await fireEvent.click(getAllByLabelText('Delete Fooskill')[0]);

    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith(baseSkill.id));
    expect(refreshSpy).toHaveBeenCalled();
  });

  it('copies a training pack code to the clipboard', async () => {
    const skillWithPack = {
      ...baseSkill,
      trainingPacks: [{ id: 9, name: 'Backboard', code: 'ABCD-1234-EFGH-5678', orderIndex: 0 }],
    };

    vi.spyOn(api, 'getSkills').mockResolvedValue([skillWithPack]);
    vi.spyOn(api, 'getBakkesFavorites').mockResolvedValue([]);

    // ensure clipboard is available and spy on writeText
    const writeText = vi.fn().mockResolvedValue(undefined);
    // @ts-ignore - JSDOM navigator.clipboard might be missing in test env
    Object.assign(navigator, { clipboard: { writeText } });

    const { getAllByLabelText } = render(SkillsScreen);

    // wait for the list to render and then click the copy button
    await waitFor(() => getAllByLabelText('Copy Backboard code'));
    const copyBtn = getAllByLabelText('Copy Backboard code')[0];

    // should use the site icon button variant and our inline modifier
    expect(copyBtn.classList.contains('icon-button')).toBe(true);
    expect(copyBtn.classList.contains('inline')).toBe(true);
    await fireEvent.click(copyBtn);

    // clipboard written
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('ABCD-1234-EFGH-5678'));

    // immediately show transient 'copied' feedback on the button
    expect(copyBtn.classList.contains('copied')).toBe(true);
  });
});
