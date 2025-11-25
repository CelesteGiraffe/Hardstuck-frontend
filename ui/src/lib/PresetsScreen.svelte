<script lang="ts">
  import { onMount } from 'svelte';
  import PresetForm from './presets/PresetForm.svelte';
  import { getPresetShare, importPresetShare, getPresets, deletePreset, updatePresetOrder } from './api';
  import type { Preset } from './api';
  import { useSkills } from './useSkills';
  import { launchPreset } from './stores';
  import { getBakkesUserId } from './constants';

  let presets: Preset[] = [];
  let loading = false;
  let error: string | null = null;
  let selectedPresetId: number | null = null;
  let editingPreset: Preset | null = null;
  let formKey = 0;
  let detailMessage: string | null = null;
  let deleteError: string | null = null;
  let deleting = false;

  const skillsStore = useSkills();

  let shareText = '';
  let shareLoading = false;
  let shareError: string | null = null;
  let importShareText = '';
  let importLoading = false;
  let importError: string | null = null;
  let lastSelectedPresetId: number | null = null;
  let showImportDialog = false;
  let showShareDialog = false;
  let draggedPreset: Preset | null = null;
  let dragOverIndex: number | null = null;

  $: selectedPreset = presets.find((preset) => preset.id === selectedPresetId) ?? null;
  $: skillLookup = Object.fromEntries($skillsStore.skills.map((skill) => [skill.id, skill.name]));

  onMount(() => {
    const handleUpdates = () => refreshPresets();
    loadData();
    window.addEventListener('presets-updated', handleUpdates);
    return () => window.removeEventListener('presets-updated', handleUpdates);
  });

  async function loadData() {
    loading = true;
    error = null;

    try {
      const data = await getPresets();
      presets = data;
      ensureSelection();
    } catch (loadError) {
      console.error('Failed to load presets', loadError);
      error = 'Unable to load preset data';
    } finally {
      loading = false;
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

  async function generateShare() {
    if (!selectedPreset) return;

    shareError = null;
    shareLoading = true;
    shareText = '';

    try {
      shareText = await getPresetShare(selectedPreset.id);
    } catch (err) {
      shareError = err instanceof Error ? err.message : 'Unable to create share text';
    } finally {
      shareLoading = false;
    }
  }

  async function handleImport(event: SubmitEvent) {
    event.preventDefault();
    importError = null;
    const share = importShareText.trim();
    if (!share) {
      importError = 'Paste share text to import';
      return;
    }

    importLoading = true;
    try {
      const preset = await importPresetShare(share, getBakkesUserId());
      const successMessage = `Imported “${preset.name}”.`;
      detailMessage = successMessage;
      importShareText = '';
      await refreshPresets(preset.id);
      selectedPresetId = preset.id;
      showImportDialog = false;
    } catch (err) {
      importError = err instanceof Error ? err.message : 'Unable to import shared preset';
    } finally {
      importLoading = false;
    }
  }

  function openImportDialog() {
    importShareText = '';
    importError = null;
    showImportDialog = true;
  }

  function closeImportDialog() {
    showImportDialog = false;
    importShareText = '';
    importError = null;
    importLoading = false;
  }

  function openShareDialog() {
    shareText = '';
    shareError = null;
    showShareDialog = true;
  }

  function closeShareDialog() {
    showShareDialog = false;
    shareText = '';
    shareError = null;
    shareLoading = false;
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

  $: if (selectedPreset?.id !== lastSelectedPresetId) {
    lastSelectedPresetId = selectedPreset?.id ?? null;
    shareText = '';
    shareError = null;
    importError = null;
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

  function runPreset() {
    if (!selectedPreset) return;
    detailMessage = null;
    launchPreset(selectedPreset);
  }

  function formatPresetDuration(seconds: number | null | undefined) {
    const totalSeconds = Math.max(0, Math.floor(seconds ?? 0));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const remainingSeconds = totalSeconds % 60;
    const parts: string[] = [];
    if (hours) {
      parts.push(`${hours}h`);
    }
    if (minutes) {
      parts.push(`${minutes}min`);
    }
    parts.push(`${remainingSeconds}s`);
    return parts.join(' ');
  }

  function handleDragStart(event: DragEvent, preset: Preset) {
    draggedPreset = preset;
    event.dataTransfer!.effectAllowed = 'move';
    event.dataTransfer!.setData('text/plain', preset.id.toString());
  }

  function handleDragOver(event: DragEvent, index: number) {
    event.preventDefault();
    dragOverIndex = index;
  }

  function handleDragLeave() {
    dragOverIndex = null;
  }

  async function handleDrop(event: DragEvent, dropIndex: number) {
    event.preventDefault();
    dragOverIndex = null;

    if (!draggedPreset) return;

    const draggedIndex = presets.findIndex(p => p.id === draggedPreset!.id);
    if (draggedIndex === -1 || draggedIndex === dropIndex) return;

    // Reorder the array
    const newPresets = [...presets];
    const [removed] = newPresets.splice(draggedIndex, 1);
    newPresets.splice(dropIndex, 0, removed);

    presets = newPresets;

    // Update selection if necessary
    if (selectedPresetId === draggedPreset.id) {
      selectedPresetId = draggedPreset.id;
    }

    // Send new order to server
    try {
      await updatePresetOrder(newPresets.map(p => p.id));
    } catch (error) {
      console.error('Failed to update preset order', error);
      // Revert on error
      await refreshPresets();
    }

    draggedPreset = null;
  }

  function handleDragEnd() {
    draggedPreset = null;
    dragOverIndex = null;
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
        </div>
        <div class="list-header-actions">
          <button
            type="button"
            class="icon-button run-icon button-soft"
            on:click={runPreset}
            disabled={!selectedPreset}
            aria-label="Run selected preset"
          >
            <i class="fas fa-play" aria-hidden="true"></i>
            <span class="sr-only">Run selected</span>
          </button>
          <button
            type="button"
            class="icon-button neon-icon button-neon"
            on:click={openNewPresetForm}
            aria-label="Create new preset"
          >
            <i class="fas fa-plus" aria-hidden="true"></i>
            <span class="sr-only">New preset</span>
          </button>
          <button type="button" class="icon-button" on:click={openShareDialog} disabled={!selectedPreset} aria-label="Share preset">
            <i class="fas fa-share" aria-hidden="true"></i>
            <span class="sr-only">Share preset</span>
          </button>
          <button type="button" class="icon-button" on:click={openImportDialog} aria-label="Import shared preset">
            <i class="fas fa-download" aria-hidden="true"></i>
            <span class="sr-only">Import shared preset</span>
          </button>
          <button type="button" class="icon-button" on:click={handleDelete} disabled={!selectedPreset || deleting} aria-label="Delete preset">
            <i class="fas fa-times" aria-hidden="true"></i>
            <span class="sr-only">Delete preset</span>
          </button>
        </div>
      </div>

      {#if loading}
        <p class="form-error">Loading presets…</p>
      {:else if error}
        <p class="form-error">{error}</p>
      {:else if presets.length === 0}
        <p class="form-error">No presets yet. Use the form to build a routine.</p>
      {:else}
        <ul>
          {#each presets as preset, index}
            <li
              draggable="true"
              on:dragstart={(e) => handleDragStart(e, preset)}
              on:dragend={handleDragEnd}
              on:dragover={(e) => handleDragOver(e, index)}
              on:dragleave={handleDragLeave}
              on:drop={(e) => handleDrop(e, index)}
              class:drag-over={dragOverIndex === index}
            >
              <div class="drag-handle" aria-label="Drag to reorder">
                <i class="fas fa-grip-vertical" aria-hidden="true"></i>
              </div>
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
          <PresetForm preset={editingPreset} on:saved={handleSaved} />
        {/key}
      </div>
    </div>
  </div>
{#if showImportDialog}
  <div class="import-dialog-backdrop" role="presentation" on:click|self={closeImportDialog}>
    <div
      class="import-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-dialog-title"
      tabindex="-1"
    >
      <header class="import-dialog-header">
        <h3 id="import-dialog-title">Import a shared routine</h3>
        <button type="button" class="icon-button" aria-label="Close import dialog" on:click={closeImportDialog}>
          ×
        </button>
      </header>
      <p>
        Paste a share string and the server will recreate the preset and any missing skills (notes and tags included).
      </p>
      <form class="import-form" on:submit|preventDefault={handleImport}>
        <label>
          <span>
            <span class="share-icon" aria-hidden="true">🔗</span>
            Shared text
          </span>
          <textarea
            rows="4"
            bind:value={importShareText}
            placeholder="Paste a share string here"
            aria-label="Shared text"
          ></textarea>
        </label>
        <div class="import-actions">
          <button type="submit" class="button-secondary" disabled={importLoading}>
            {#if importLoading}Importing…{:else}Import preset{/if}
          </button>
        </div>
        {#if importError}
          <p class="form-error">{importError}</p>
        {/if}
      </form>
    </div>
  </div>
{/if}
{#if showShareDialog}
  <div class="share-dialog-backdrop" role="presentation" on:click|self={closeShareDialog}>
    <div
      class="share-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-dialog-title"
      tabindex="-1"
    >
      <header class="share-dialog-header">
        <h3 id="share-dialog-title">Share preset</h3>
        <button type="button" class="icon-button" aria-label="Close share dialog" on:click={closeShareDialog}>
          ×
        </button>
      </header>
      <p>
        Create a single text blob (shareable via pastebin or chat) that re-creates this routine and all referenced skills.
      </p>
      <div class="share-actions">
        <button
          type="button"
          class="button-secondary"
          on:click={generateShare}
          disabled={shareLoading}
          aria-label="Generate share text"
        >
          {#if shareLoading}Generating…{:else}Generate share text{/if}
        </button>
      </div>
      {#if shareError}
        <p class="form-error">{shareError}</p>
      {:else if shareText}
        <label class="share-output">
          <span>Share string</span>
          <textarea rows="3" readonly bind:value={shareText}></textarea>
        </label>
      {/if}
    </div>
  </div>
{/if}

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

  .list-header {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }

  .list-header-actions {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin-bottom: 1rem;
  }

  .icon-button {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(15, 23, 42, 0.8);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 1.1rem;
    color: #fff;
    transition: border-color 0.2s ease, background 0.2s ease;
    padding: 0;
  }

  .icon-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .button-soft.run-icon {
    border-color: rgba(99, 102, 241, 0.6);
    box-shadow: 0 0 10px rgba(99, 102, 241, 0.25);
  }

  .button-neon.neon-icon {
    border-color: rgba(255, 255, 255, 0.2);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
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

  .preset-list li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .drag-handle {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    cursor: grab;
    flex-shrink: 0;
  }

  .drag-handle:active {
    cursor: grabbing;
  }

  .preset-list li.drag-over {
    background: rgba(99, 102, 241, 0.1);
    border-radius: 12px;
  }

  .preset-list li button {
    flex: 1;
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

  .import-dialog-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
  }

  .import-dialog {
    background: rgba(8, 12, 20, 0.95);
    border-radius: 16px;
    padding: 1.25rem;
    width: min(420px, 90vw);
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .import-dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .import-dialog textarea {
    width: 100%;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(15, 23, 42, 0.8);
    color: #fff;
    font-family: inherit;
    padding: 0.65rem;
    font-size: 0.9rem;
    resize: vertical;
  }

  .import-form label span {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin-bottom: 0.35rem;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .import-actions {
    display: flex;
    justify-content: flex-end;
  }

  .share-icon {
    font-size: 1rem;
  }

  .share-dialog-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
  }

  .share-dialog {
    background: rgba(8, 12, 20, 0.95);
    border-radius: 16px;
    padding: 1.25rem;
    width: min(420px, 90vw);
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .share-dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .share-actions {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 1rem;
  }

  .share-output textarea {
    width: 100%;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(15, 23, 42, 0.8);
    color: #fff;
    font-family: inherit;
    padding: 0.65rem;
    font-size: 0.9rem;
    resize: vertical;
  }

  .share-output span {
    display: block;
    margin-bottom: 0.35rem;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  @media (max-width: 960px) {
    .preset-layout {
      grid-template-columns: 1fr;
    }
  }
</style>