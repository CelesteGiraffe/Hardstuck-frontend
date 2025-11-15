import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/svelte'
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
})
