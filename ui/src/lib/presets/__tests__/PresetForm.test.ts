import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/svelte'
import * as api from '../../api'
import { resetSkillsCacheForTests } from '../../useSkills'
import PresetForm from '../PresetForm.svelte'

describe('PresetForm', () => {
  const skills = [
    { id: 1, name: 'Footwork', category: null, tags: null, notes: null },
    { id: 2, name: 'Aiming', category: null, tags: null, notes: null },
  ]

  beforeEach(() => {
    resetSkillsCacheForTests()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a trimmed payload and dispatches the saved event', async () => {
    const getSkillsSpy = vi.spyOn(api, 'getSkills').mockResolvedValue(skills)
    const savedHandler = vi.fn()
    const { container, getByLabelText, getByRole, findByRole } = render(PresetForm, {
      events: {
        saved: savedHandler,
      },
    })
    const saveSpy = vi
      .spyOn(api, 'savePreset')
      .mockResolvedValue({
        id: 1,
        name: 'Focus routine',
        orderIndex: 0,
        blocks: [
          { id: 1, presetId: 1, orderIndex: 0, skillId: skills[0].id, type: 'Drill', durationSeconds: 120, notes: null },
        ],
      })

    await waitFor(() => expect(getSkillsSpy).toHaveBeenCalled())
    const submitButton = await findByRole('button', { name: /save preset/i })
    await waitFor(() => expect(submitButton.hasAttribute('disabled')).toBe(false))

    await fireEvent.input(getByLabelText(/Preset name/i), { target: { value: '  Focus routine' } })
  await fireEvent.input(getByLabelText(/Block type/i), { target: { value: '  Drill  ' } })
  await fireEvent.input(getByLabelText(/Minutes/i), { target: { value: '2' } })
  await fireEvent.input(getByLabelText(/Seconds/i), { target: { value: '0' } })

    const form = container.querySelector('form')
    expect(form).toBeTruthy()
    await fireEvent.submit(form as HTMLFormElement)

    await waitFor(() => expect(saveSpy).toHaveBeenCalled())

    expect(saveSpy).toHaveBeenCalledWith({
      id: undefined,
      name: 'Focus routine',
      blocks: [
        {
          id: undefined,
          orderIndex: 0,
          skillId: skills[0].id,
          type: 'Drill',
          durationSeconds: 120,
          notes: null,
        },
      ],
    })

    expect(savedHandler).toHaveBeenCalledTimes(1)
  })

  it('adds another block when the user requests it', async () => {
    const getSkillsSpy = vi.spyOn(api, 'getSkills').mockResolvedValue(skills)
    const { container, getAllByRole } = render(PresetForm)
    await waitFor(() => expect(getSkillsSpy).toHaveBeenCalled())
    expect(container.querySelectorAll('fieldset')).toHaveLength(1)

    const buttons = getAllByRole('button', { name: /add another block/i })
    const addBlockButton = buttons.at(-1)!
    await waitFor(() => expect(addBlockButton.hasAttribute('disabled')).toBe(false))
    await fireEvent.click(addBlockButton)

    await waitFor(() => expect(container.querySelectorAll('fieldset')).toHaveLength(2))
  })
})
