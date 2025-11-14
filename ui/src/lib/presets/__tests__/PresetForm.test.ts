import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/svelte'
import * as api from '../../api'
import PresetForm from '../PresetForm.svelte'

describe('PresetForm', () => {
  const skills = [
    { id: 1, name: 'Footwork', category: null, tags: null, notes: null },
    { id: 2, name: 'Aiming', category: null, tags: null, notes: null },
  ]

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a trimmed payload and dispatches the saved event', async () => {
    const { component, getByLabelText, getByRole } = render(PresetForm, { props: { skills } })
    const typedComponent = component as { $on: (type: string, callback: (event: unknown) => void) => void }
    const saveSpy = vi
      .spyOn(api, 'savePreset')
      .mockResolvedValue({
        id: 1,
        name: 'Focus routine',
        blocks: [
          { id: 1, presetId: 1, orderIndex: 0, skillId: skills[0].id, type: 'Drill', durationSeconds: 120, notes: null },
        ],
      })

    const savedHandler = vi.fn()
    typedComponent.$on('saved', savedHandler)

    await fireEvent.input(getByLabelText(/Preset name/i), { target: { value: '  Focus routine' } })
    await fireEvent.input(getByLabelText(/Block type/i), { target: { value: '  Drill  ' } })
    await fireEvent.input(getByLabelText(/Duration \(sec\)/i), { target: { value: '120' } })

    await fireEvent.submit(getByRole('form'))

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
    const { container, getByRole } = render(PresetForm, { props: { skills } })
    expect(container.querySelectorAll('fieldset')).toHaveLength(1)

    await fireEvent.click(getByRole('button', { name: /add another block/i }))

    expect(container.querySelectorAll('fieldset')).toHaveLength(2)
  })
})
