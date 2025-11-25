import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor, within, cleanup } from '@testing-library/svelte';
import * as api from './api';
import SkillsScreen from './SkillsScreen.svelte';
import { resetSkillsCacheForTests } from './useSkills';
import { skillsStore } from './skillsStore';

describe('SkillsScreen training packs UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
    // clear localStorage so tests start fresh
    localStorage.clear();
    vi.spyOn(api, 'getBakkesFavorites').mockResolvedValue([]);
    // prevent the component from calling the real API for skills in these tests
    vi.spyOn(api, 'getSkills').mockResolvedValue([]);
  });

  afterEach(() => {
    // ensure DOM is reset between tests and avoid leaving renders behind
    cleanup();
    document.body.innerHTML = '';
  });

  it('shows the training packs input and can add an item', async () => {
    const { getByLabelText, getByTestId, queryByText } = render(SkillsScreen);

    const input = await waitFor(() => getByLabelText('New training pack name')) as HTMLInputElement;
    const addButton = getByTestId('add-pack-button');

    // initial list is empty
    expect(queryByText('No training packs added yet.')).toBeTruthy();

    // add a pack
    await fireEvent.input(input, { target: { value: 'Aerial Training Pack' } });
    await fireEvent.click(addButton);

    const list = getByTestId('training-list');
    expect(list.textContent).toContain('Aerial Training Pack');
  });

  it('allows removing a training pack', async () => {
    const { getByLabelText, getByTestId, getByText } = render(SkillsScreen);

    const input = await waitFor(() => getByLabelText('New training pack name')) as HTMLInputElement;
    const addButton = getByTestId('add-pack-button');

    await fireEvent.input(input, { target: { value: 'Shot Pack 1' } });
    await fireEvent.click(addButton);

    const item = getByText('Shot Pack 1');
    expect(item).toBeTruthy();

    // remove it
    const removeBtn = getByText('Remove');
    await fireEvent.click(removeBtn);

    // removed
    await waitFor(() => expect(() => getByText('Shot Pack 1')).toThrow());
  });
});
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor, within } from '@testing-library/svelte'
import * as api from './api'
import SkillsScreen from './SkillsScreen.svelte'
import { resetSkillsCacheForTests } from './useSkills'
import { skillsStore } from './skillsStore'

const skills = [
  { id: 1, name: 'Fooskill', category: 'Control', tags: 'air, offense', notes: 'Keep it clean' },
]

describe('SkillsScreen', () => {
  beforeEach(() => {
    resetSkillsCacheForTests()
    vi.restoreAllMocks()
    const env = import.meta.env as ImportMetaEnv & Record<string, string | undefined>
    env.VITE_BAKKES_USER_ID = 'test-player'
  })

  it('updates a skill and refreshes the shared store', async () => {
    vi.spyOn(api, 'getSkills').mockResolvedValue(skills)
  const updateSpy = vi.spyOn(api, 'updateSkill').mockResolvedValue(skills[0])
  const refreshSpy = vi.spyOn(skillsStore, 'refresh').mockResolvedValue(skills)

  const { getAllByLabelText, findByRole, container } = render(SkillsScreen)

  await waitFor(() => getAllByLabelText('Edit Fooskill'))
  const editButton = getAllByLabelText('Edit Fooskill').find((button) => button.textContent?.trim() === 'Edit') ?? getAllByLabelText('Edit Fooskill')[0]
  await fireEvent.click(editButton)

  const inlineForm = (await waitFor(() => container.querySelector('.skill-inline-form'))) as HTMLFormElement
  const nameInput = inlineForm.querySelector('input[placeholder="Skill name"]') as HTMLInputElement
  await fireEvent.input(nameInput, { target: { value: 'Fooskill 2' } })
  await fireEvent.submit(inlineForm)

  await waitFor(() => expect(updateSpy).toHaveBeenCalled())
  expect(refreshSpy).toHaveBeenCalled()
  })

  it('deletes a skill when confirmed', async () => {
    vi.spyOn(api, 'getSkills').mockResolvedValue(skills)
    const deleteSpy = vi.spyOn(api, 'deleteSkill').mockResolvedValue(undefined)
    const refreshSpy = vi.spyOn(skillsStore, 'refresh').mockResolvedValue(skills)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

  const { getAllByLabelText } = render(SkillsScreen)

  await waitFor(() => getAllByLabelText('Delete Fooskill'))
  await fireEvent.click(getAllByLabelText('Delete Fooskill')[0])

    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith(skills[0].id))
    expect(refreshSpy).toHaveBeenCalled()
  })

  it('submits the selected favorite when adding a skill', async () => {
    vi.spyOn(api, 'getSkills').mockResolvedValue(skills)
    const favorites = [
      { name: 'Boost Play', code: 'AAA-111' },
      { name: 'Aerial Drill', code: 'BBB-222' },
    ]
    const favoritesSpy = vi.spyOn(api, 'getBakkesFavorites').mockResolvedValue(favorites)
    const createSpy = vi.spyOn(api, 'createSkill').mockResolvedValue(skills[0])
    const refreshSpy = vi.spyOn(skillsStore, 'refresh').mockResolvedValue(skills)

  const { container } = render(SkillsScreen)

    await waitFor(() => expect(favoritesSpy).toHaveBeenCalled())
    const getSelect = () => within(container).getByTestId('favorites-select') as HTMLSelectElement
    await waitFor(() => expect(getSelect().disabled).toBeFalsy())

  const form = getSelect().closest('form')
    if (!form) {
      throw new Error('Favorites dropdown should be inside the skill form')
    }
  const formHelpers = within(form)
    const nameInput = formHelpers.getByLabelText('Name')
  const favoriteCodeInput = formHelpers.getByTestId('favorite-code-input') as HTMLInputElement
  await fireEvent.input(favoriteCodeInput, { target: { value: favorites[1].code } })
    await fireEvent.input(nameInput, { target: { value: 'Boost Note' } })
  await fireEvent.submit(form)

    await waitFor(() => expect(createSpy).toHaveBeenCalled())
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ favoriteCode: favorites[1].code })
    )
    expect(refreshSpy).toHaveBeenCalled()
  })

  it('shows a message when favorites fail to load', async () => {
    vi.spyOn(api, 'getSkills').mockResolvedValue(skills)
    vi.spyOn(api, 'getBakkesFavorites').mockRejectedValue(new Error('boom'))

    const { getByText } = render(SkillsScreen)

    await waitFor(() => expect(getByText('boom')).toBeInTheDocument())
  })

  it('applies mobile layout when the viewport is small', async () => {
    vi.spyOn(api, 'getSkills').mockResolvedValue(skills)

    // mock matchMedia so the component believes it is on a small screen
    const mql = {
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => mql as unknown as MediaQueryList,
    })

    const { container } = render(SkillsScreen)

    // the component will render and set a data attribute when mobile
    await waitFor(() => expect(container.querySelector('.skills-dashboard')).toBeTruthy())
    const dash = container.querySelector('.skills-dashboard') as HTMLElement
    expect(dash.getAttribute('data-mobile')).toBe('true')
  })
})
