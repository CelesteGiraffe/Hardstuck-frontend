import { describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/svelte'
import PresetBlocksEditor from '../PresetBlocksEditor.svelte'

describe('PresetBlocksEditor', () => {
  const skills = [
    { id: 1, name: 'Footwork', category: null, tags: null, notes: null },
    { id: 2, name: 'Aiming', category: null, tags: null, notes: null },
  ]

  it('adds another block when requested', async () => {
    const blocks = [
      { skillId: skills[0].id, type: 'Warm-up', durationSeconds: 60, notes: '' },
    ]

    const { container, getByRole } = render(PresetBlocksEditor, {
      props: { blocks, skills },
    })

    expect(container.querySelectorAll('fieldset')).toHaveLength(1)

    await fireEvent.click(getByRole('button', { name: /add another block/i }))

    expect(container.querySelectorAll('fieldset')).toHaveLength(2)
  })
})
