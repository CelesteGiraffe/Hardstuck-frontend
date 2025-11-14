<script lang="ts">
  import { onMount } from 'svelte';
  import PresetForm from './presets/PresetForm.svelte';
  import { getPresets, getSkills, deletePreset } from './api';
  import type { Preset, Skill } from './api';

  let presets: Preset[] = [];
  let skills: Skill[] = [];
  let loading = false;
  let error: string | null = null;
  let selectedPresetId: number | null = null;
  let editingPreset: Preset | null = null;
  let formKey = 0;
  let detailMessage: string | null = null;
  let deleteError: string | null = null;
  let deleting = false;

  let skillsLoading = false;

  $: selectedPreset = presets.find((preset) => preset.id === selectedPresetId) ?? null;
  $: skillLookup = Object.fromEntries(skills.map((skill) => [skill.id, skill.name]));

  onMount(() => {
    const handleUpdates = () => refreshPresets();
    loadData();
    window.addEventListener('presets-updated', handleUpdates);
    return () => window.removeEventListener('presets-updated', handleUpdates);
  });

  async function loadData() {
    loading = true;
    skillsLoading = true;
    error = null;

    try {
      const [presetData, skillData] = await Promise.all([getPresets(), getSkills()]);
      presets = presetData;
      skills = skillData;
      ensureSelection();
    } catch (loadError) {
      console.error('Failed to load presets or skills', loadError);
      error = 'Unable to load preset data';
    } finally {
      loading = false;
      skillsLoading = false;
      formKey += 1;
    }
  }

  async function refreshPresets(focusId?: number) {
    try {
      const data = await getPresets();
      presets = data;
      if (focusId) {
        selectedPresetId = focusId;
      }
      ensureSelection();
    } catch (refreshError) {
      console.error('Failed to refresh presets', refreshError);
      error = 'Unable to refresh presets';
    }
  }

  function ensureSelection() {
    if (!selectedPresetId || !presets.some((preset) => preset.id === selectedPresetId)) {
      selectedPresetId = presets[0]?.id ?? null;
    }
  }

  function selectPreset(preset: Preset) {
    selectedPresetId = preset.id;
    detailMessage = null;
    deleteError = null;
  }

  function openNewPresetForm() {
    editingPreset = null;
    formKey += 1;
    detailMessage = null;
    deleteError = null;
  }

  function openEditingPreset() {
    if (!selectedPreset) return;
    editingPreset = selectedPreset;
    formKey += 1;
    detailMessage = null;
    deleteError = null;
  }

  async function handleSaved(event: CustomEvent<Preset>) {
    const saved = event.detail;
    detailMessage = `Preset “${saved.name}” saved.`;
    editingPreset = null;
    formKey += 1;
    await refreshPresets(saved.id);
    window.dispatchEvent(
      new CustomEvent('presets-updated', { detail: { action: 'save', preset: saved } })
    );
  }

  async function handleDelete() {
    if (!selectedPreset) return;
    deleting = true;
    deleteError = null;

    try {
      await deletePreset(selectedPreset.id);
      detailMessage = `Deleted ${selectedPreset.name}`;
      selectedPresetId = null;
      await refreshPresets();
      window.dispatchEvent(
        new CustomEvent('presets-updated', { detail: { action: 'delete', id: selectedPreset.id } })
      );
    } catch (err) {
      deleteError = err instanceof Error ? err.message : 'Unable to delete preset';
    } finally {
      deleting = false;
    }
  }
</script>

<section class="screen-content presets-shell">
  <div class="presets-hero">
    <h1>Presets</h1>
    <p>Craft reusable training sessions, edit them quickly, and reuse the same glowing routines from the Home screen.</p>
  </div>

  <div class="preset-layout">
    <aside class="preset-list glass-card">
      <div class="list-header">
        <div>
          <h2>Saved routines</h2>
          <p>Tap a preset to preview its blocks below.</p>
        </div>
        <button type="button" class="button-neon" on:click={openNewPresetForm}>New preset</button>
      </div>

      {#if loading}
        <p class="form-error">Loading presets…</p>
      {:else if error}
        <p class="form-error">{error}</p>
      {:else if presets.length === 0}
        <p class="form-error">No presets yet. Use the form to build a routine.</p>
      {:else}
        <ul>
          {#each presets as preset}
            <li>
              <button
                type="button"
                class:selected={preset.id === selectedPresetId}
                on:click={() => selectPreset(preset)}
              >
                <span>{preset.name}</span>
                <small>{preset.blocks.length} block{preset.blocks.length === 1 ? '' : 's'}</small>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </aside>

    <div class="preset-detail-panel">
      <div class="preset-form-wrapper glass-card">
        <div class="form-header">
          <div>
            <h2>{editingPreset ? 'Edit preset' : 'Create preset'}</h2>
            <p>{editingPreset ? 'Update the selected routine and push it to the launch list.' : 'Start by giving the preset a name and defining blocks.'}</p>
          </div>
          <div class="form-actions">
            {#if selectedPreset}
              <button type="button" class="button-soft" on:click={openEditingPreset}>Edit selected</button>
            {/if}
            <button type="button" class="button-soft" on:click={openNewPresetForm}>Clear form</button>
          </div>
        </div>

        {#key formKey}
          <PresetForm {skills} preset={editingPreset} on:saved={handleSaved} />
        {/key}
        {#if skillsLoading}
          <p class="form-error">Loading skills…</p>
        {/if}
      </div>

      <div class="preset-detail glass-card">
        <div class="detail-header">
          <div>
            <h2>Preset preview</h2>
            <p>Block durations, skill focus, and notes render here as you select a preset.</p>
          </div>
          {#if selectedPreset}
            <div class="detail-actions">
              <button type="button" class="button-soft" on:click={openEditingPreset}>Edit</button>
              <button type="button" class="btn-primary" on:click={handleDelete} disabled={deleting}>
                {#if deleting}Deleting…{:else}Delete preset{/if}
              </button>
            </div>
          {/if}
        </div>

        {#if detailMessage}
          <p class="form-success detail-message">{detailMessage}</p>
        {/if}
        {#if deleteError}
          <p class="form-error detail-message">{deleteError}</p>
        {/if}

        {#if selectedPreset}
          <p class="preset-meta">{selectedPreset.blocks.length} block{selectedPreset.blocks.length === 1 ? '' : 's'}</p>
          <ul class="block-breakdown">
            {#each selectedPreset.blocks as block, index}
              <li>
                <div class="block-row">
                  <span class="block-index">{index + 1}</span>
                  <div>
                    <p class="block-type">{block.type}</p>
                    <p class="block-skill">{skillLookup[block.skillId] ?? `Skill ${block.skillId}`}</p>
                  </div>
                  <span class="block-duration">{block.durationSeconds} sec</span>
                </div>
                {#if block.notes}
                  <p class="block-notes">{block.notes}</p>
                {/if}
              </li>
            {/each}
          </ul>
        {:else if !loading}
          <p class="form-error">Select a preset to see the breakpoints.</p>
        {/if}
      </div>
    </div>
  </div>
</section>

<style>
  .presets-shell {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .presets-hero h1 {
    margin: 0;
  }

  .preset-layout {
    display: grid;
    grid-template-columns: minmax(260px, 1fr) minmax(420px, 2fr);
    gap: 1.5rem;
  }

  .preset-list ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .preset-list button {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.65rem 0.9rem;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(15, 23, 42, 0.8);
    color: #fff;
    font-weight: 500;
    cursor: pointer;
  }

  .preset-list button.selected {
    border-color: rgba(99, 102, 241, 0.6);
    box-shadow: 0 0 25px rgba(99, 102, 241, 0.2);
  }

  .preset-detail-panel {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .form-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .form-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .detail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .detail-actions {
    display: flex;
    gap: 0.5rem;
  }

  .preset-meta {
    color: var(--text-muted);
    margin-top: 0;
    margin-bottom: 0.75rem;
  }

  .block-breakdown {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .block-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .block-row p {
    margin: 0;
  }

  .block-index {
    font-weight: 600;
    min-width: 2rem;
    text-align: center;
  }

  .block-type {
    font-weight: 600;
  }

  .block-skill {
    color: var(--text-muted);
    font-size: 0.85rem;
  }

  .block-duration {
    font-weight: 600;
  }

  .block-notes {
    margin: 0.25rem 0 0;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .detail-message {
    margin: 0.5rem 0 0;
  }

  @media (max-width: 960px) {
    .preset-layout {
      grid-template-columns: 1fr;
    }
  }
</style>