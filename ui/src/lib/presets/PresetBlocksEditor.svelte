<script lang="ts">
  import { useSkills } from '../useSkills';
  import type { Skill } from '../api';
  import type { BlockEdit } from './types';

  export let blocks: BlockEdit[] = [];
  export let disabled = false;
  export let skills: Skill[] | null = null;

  const skillsStore = useSkills();
  let dragIndex: number | null = null;

  function updateBlocks(next: BlockEdit[]) {
    blocks = next;
  }

  $: skillOptions = skills ?? $skillsStore.skills;
  $: hasMissingSkill =
    skillOptions.length > 0 && blocks.some((block) => !skillOptions.some((skill) => skill.id === block.skillId));

  $: if (skillOptions.length && hasMissingSkill) {
    const fallback = skillOptions[0].id;
    updateBlocks(
      blocks.map((block) => ({
        ...block,
        skillId: skillOptions.some((skill) => skill.id === block.skillId) ? block.skillId : fallback,
      }))
    );
  }

  $: statusMessage = (() => {
    if (skills) {
      return hasMissingSkill
        ? 'Some block assignments referenced missing skills, so they now follow the first skill.'
        : null;
    }

    if ($skillsStore.loading) {
      return 'Loading skills…';
    }
    if ($skillsStore.error) {
      return 'Unable to load skills yet.';
    }
    if (!skillOptions.length) {
      return 'Add at least one skill to define blocks.';
    }
    return hasMissingSkill
      ? 'Some block assignments referenced missing skills, so they now follow the first skill.'
      : null;
  })();

  function createEmptyBlock(): BlockEdit {
    return {
      skillId: skillOptions[0]?.id ?? 0,
      type: '',
      durationSeconds: 60,
      notes: '',
    };
  }

  function addBlock() {
    updateBlocks([...blocks, createEmptyBlock()]);
  }

  function removeBlock(index: number) {
    if (blocks.length <= 1) {
      return;
    }
    const next = [...blocks];
    next.splice(index, 1);
    updateBlocks(next);
  }

  function updateBlock(index: number, patch: Partial<BlockEdit>) {
    const next = [...blocks];
    next[index] = { ...next[index], ...patch };
    updateBlocks(next);
  }

  function moveBlock(from: number, to: number) {
    if (from === to) {
      return;
    }
    const next = [...blocks];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    updateBlocks(next);
  }

  function handleDragStart(event: DragEvent, index: number) {
    if (disabled) {
      return;
    }
    dragIndex = index;
    event.dataTransfer?.setData('text/plain', String(index));
    event.dataTransfer?.setDragImage(event.currentTarget as HTMLElement, 0, 0);
  }

  function handleDragOver(event: DragEvent, index: number) {
    if (disabled) {
      return;
    }
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
  }

  function handleDrop(event: DragEvent, index: number) {
    if (disabled) {
      return;
    }
    event.preventDefault();
    if (dragIndex === null) {
      return;
    }
    moveBlock(dragIndex, index);
    dragIndex = null;
  }

  function handleDragEnd() {
    dragIndex = null;
  }
</script>

<section class="blocks-editor">
  {#if statusMessage}
    <p class="status-message">{statusMessage}</p>
  {/if}

  <div class="blocks-list">
    {#each blocks as block, index (block.id ?? index)}
      <fieldset
        class="block-entry {dragIndex === index ? 'dragging' : ''}"
        draggable={!disabled}
        on:dragstart={(event) => handleDragStart(event, index)}
        on:dragover={(event) => handleDragOver(event, index)}
        on:drop={(event) => handleDrop(event, index)}
        on:dragend={handleDragEnd}
      >
        <legend>
          <span>Block {index + 1}</span>
          {#if !disabled && skillOptions.length > 1}
            <span class="reorder-handle" role="presentation" title="Drag to reorder">≡</span>
          {/if}
        </legend>

        <label>
          <span>Skill</span>
          <select
            value={block.skillId}
            on:change={(event) => updateBlock(index, { skillId: Number(event.currentTarget.value) })}
            disabled={disabled || !skillOptions.length}
            required
          >
            {#if !skillOptions.length}
              <option value="0" disabled>Loading skills…</option>
            {:else}
              {#each skillOptions as skill}
                <option value={skill.id}>{skill.name}</option>
              {/each}
            {/if}
          </select>
        </label>

        <label>
          <span>Block type</span>
          <input
            type="text"
            value={block.type}
            on:input={(event) => updateBlock(index, { type: event.currentTarget.value })}
            placeholder="Warm-up, Drill, Scrimmage"
            disabled={disabled}
          />
        </label>

        <label>
          <span>Duration (sec)</span>
          <input
            type="number"
            min="0"
            value={block.durationSeconds}
            on:input={(event) =>
              updateBlock(index, { durationSeconds: Number(event.currentTarget.value) || 0 })
            }
            disabled={disabled}
          />
        </label>

        <label>
          <span>Notes</span>
          <textarea
            rows="2"
            value={block.notes}
            on:input={(event) => updateBlock(index, { notes: event.currentTarget.value })}
            placeholder="Add coaching cues, focus points, or reminders"
            disabled={disabled}
          ></textarea>
        </label>

        <div class="block-actions">
          {#if blocks.length > 1}
            <button type="button" class="button-light" on:click={() => removeBlock(index)} disabled={disabled}>
              Remove block
            </button>
          {/if}
        </div>
      </fieldset>
    {/each}
  </div>

  <button type="button" class="button-secondary" on:click={addBlock} disabled={disabled || !skillOptions.length}>
    Add another block
  </button>
</section>

<style>
  .blocks-editor {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .status-message {
    color: var(--text-muted);
    margin: 0;
  }

  .blocks-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  fieldset.block-entry {
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    background: rgba(14, 26, 41, 0.6);
  }

  fieldset.block-entry.dragging {
    box-shadow: 0 0 20px rgba(99, 102, 241, 0.3);
  }

  legend {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.95rem;
    font-weight: 600;
    margin-bottom: 0.25rem;
  }

  .reorder-handle {
    border: none;
    background: transparent;
    color: inherit;
    font-size: 1.25rem;
    cursor: grab;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  input,
  select,
  textarea {
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(15, 23, 42, 0.8);
    color: #fff;
    padding: 0.5rem 0.75rem;
    font-size: 0.95rem;
  }

  textarea {
    resize: vertical;
  }

  .button-secondary,
  .button-light {
    border: none;
    padding: 0.65rem 1rem;
    border-radius: 999px;
    font-weight: 600;
    cursor: pointer;
  }

  .button-secondary {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    align-self: flex-start;
  }

  .button-light {
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
  }
</style>
