<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import PresetBlocksEditor, { type BlockEdit } from './PresetBlocksEditor.svelte';
  import { savePreset } from '../api';
  import type { Preset, PresetPayload, Skill } from '../api';
  import { useSkills } from '../useSkills';

  export let preset: Preset | null = null;

  type PresetBlockForm = BlockEdit;

  const dispatch = createEventDispatcher<{ saved: Preset }>();
  const skillsStore = useSkills();

  let skillOptions: Skill[] = [];

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

  function createEmptyBlock(): PresetBlockForm {
    return {
      skillId: skillOptions[0]?.id ?? 0,
      type: '',
      durationSeconds: 60,
      notes: '',
    };
  }

  if (!blocks.length) {
    blocks = [createEmptyBlock()];
  }

  let saving = false;
  let error: string | null = null;

  $: skillOptions = $skillsStore.skills;
  $: skillsError = $skillsStore.error;

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      error = 'Give the preset a name before saving.';
      return;
    }

    if (!skillOptions.length) {
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
    } as PresetPayload;

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
    <PresetBlocksEditor bind:blocks disabled={saving} />
  </div>

  {#if error}
    <p class="form-error">{error}</p>
  {/if}

  {#if skillsError}
    <p class="form-error">{skillsError}</p>
  {/if}

  <button type="submit" class="button-primary" disabled={saving || !skillOptions.length}>
    {#if saving}Saving…{:else if !skillOptions.length}Waiting on skills…{:else}Save preset{/if}
  </button>
</form>

<style>
  .preset-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .field {
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

  .button-primary {
    border: none;
    padding: 0.65rem 1rem;
    border-radius: 999px;
    font-weight: 600;
    cursor: pointer;
    background: linear-gradient(135deg, #6366f1, #d946ef);
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
