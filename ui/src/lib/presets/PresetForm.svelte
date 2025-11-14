<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { savePreset } from '../api';
  import type { Preset, Skill, PresetBlockPayload } from '../api';

  type PresetBlockForm = Omit<PresetBlockPayload, 'orderIndex' | 'notes'> & { id?: number; notes: string };

  export let skills: Skill[] = [];
  export let preset: Preset | null = null;

  const dispatch = createEventDispatcher<{ saved: Preset }>();

  let name = preset?.name ?? '';
  let blocks: PresetBlockForm[] = preset
    ? preset.blocks.map((block) => ({
        id: block.id,
        skillId: block.skillId,
        type: block.type,
        durationSeconds: block.durationSeconds,
        notes: block.notes ?? '',
      }))
    : [];

  if (!blocks.length) {
    blocks = [createEmptyBlock()];
  }

  let saving = false;
  let error: string | null = null;

  function createEmptyBlock(): PresetBlockForm {
    return {
      skillId: skills[0]?.id ?? 0,
      type: '',
      durationSeconds: 60,
      notes: '',
    };
  }

  function updateBlock(index: number, patch: Partial<PresetBlockForm>) {
    blocks = blocks.map((block, idx) => (idx === index ? { ...block, ...patch } : block));
  }

  function addBlock() {
    blocks = [...blocks, createEmptyBlock()];
  }

  function removeBlock(index: number) {
    if (blocks.length <= 1) {
      return;
    }

    blocks = blocks.filter((_, idx) => idx !== index);
  }

  $: if (skills.length) {
    const validSkillIds = new Set(skills.map((skill) => skill.id));
    const needsAdjustment = blocks.some((block) => !validSkillIds.has(block.skillId));
    if (needsAdjustment) {
      const fallback = skills[0].id;
      blocks = blocks.map((block) => ({
        ...block,
        skillId: validSkillIds.has(block.skillId) ? block.skillId : fallback,
      }));
    }
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      error = 'Give the preset a name before saving.';
      return;
    }

    if (!skills.length) {
      error = 'Add at least one skill before saving a preset.';
      return;
    }

    saving = true;
    error = null;

    const payload = {
      id: preset?.id,
      name: trimmedName,
      blocks: blocks.map((block, index) => ({
        id: block.id,
        skillId: block.skillId,
        type: block.type.trim() || 'Block',
        durationSeconds: Number(block.durationSeconds) || 0,
        notes: block.notes.trim() || null,
        orderIndex: index,
      })),
    };

    try {
      const saved = await savePreset(payload);
      dispatch('saved', saved);
    } catch (submitError) {
      console.error('Failed to save preset', submitError);
      if (submitError instanceof Error) {
        error = submitError.message;
      } else {
        error = 'Unable to save preset right now.';
      }
    } finally {
      saving = false;
    }
  }
</script>

<form class="preset-form" on:submit|preventDefault={handleSubmit}>
  <label class="field">
    <span>Preset name</span>
    <input type="text" bind:value={name} placeholder="Morning warm-up" required />
  </label>

  <div class="blocks">
    {#each blocks as block, index}
      <fieldset class="block">
        <legend>Block {index + 1}</legend>
        <label>
          <span>Skill</span>
          <select
            value={block.skillId}
            on:change={(event) => updateBlock(index, { skillId: Number(event.currentTarget.value) })}
            required
          >
            {#if !skills.length}
              <option value="0" disabled>Loading skills…</option>
            {:else}
              {#each skills as skill}
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
          />
        </label>

        <label>
          <span>Duration (sec)</span>
          <input
            type="number"
            min="0"
            value={block.durationSeconds}
            on:input={(event) => updateBlock(index, { durationSeconds: Number(event.currentTarget.value) })}
          />
        </label>

        <label>
          <span>Notes</span>
          <textarea
            rows="2"
            value={block.notes}
            on:input={(event) => updateBlock(index, { notes: event.currentTarget.value })}
            placeholder="Add coaching cues, focus points, or reminders"
          ></textarea>
        </label>

        <div class="block-actions">
          {#if blocks.length > 1}
            <button type="button" class="button-light" on:click={() => removeBlock(index)}>Remove block</button>
          {/if}
        </div>
      </fieldset>
    {/each}

    <button type="button" class="button-secondary" on:click={addBlock}>Add another block</button>
  </div>

  {#if error}
    <p class="form-error">{error}</p>
  {/if}

  <button type="submit" class="button-primary" disabled={saving || !skills.length}>
    {#if saving}Saving…{:else if !skills.length}Waiting on skills…{:else}Save preset{/if}
  </button>
</form>

<style>
  .preset-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .field,
  .block label {
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

  .blocks {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .block {
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    background: rgba(14, 26, 41, 0.6);
  }

  legend {
    font-size: 0.95rem;
    font-weight: 600;
  }

  .block-actions {
    display: flex;
    justify-content: flex-end;
  }

  .button-primary,
  .button-secondary,
  .button-light {
    border: none;
    padding: 0.65rem 1rem;
    border-radius: 999px;
    font-weight: 600;
    cursor: pointer;
  }

  .button-primary {
    background: linear-gradient(135deg, #6366f1, #d946ef);
    color: #fff;
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

  .form-error {
    color: #f87171;
    margin: 0;
  }

  .button-primary[disabled] {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
