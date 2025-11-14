<script lang="ts">
  import { onMount } from 'svelte';
  import { healthCheck, getPresets } from './api';
  import type { Preset } from './api';
  import { navigateTo, selectedPreset } from './stores';

  let apiHealthy: boolean | null = null;
  let presets: Preset[] = [];
  let loadingPresets = false;
  let presetError: string | null = null;

  onMount(async () => {
    apiHealthy = await healthCheck();
    await loadPresets();
  });

  async function loadPresets() {
    loadingPresets = true;
    presetError = null;

    try {
      presets = await getPresets();
    } catch (error) {
      console.error('Failed to load presets', error);
      presetError = 'Unable to load presets';
    } finally {
      loadingPresets = false;
    }
  }

  function beginPreset(preset: Preset) {
    selectedPreset.set(preset);
    navigateTo('timer');
  }
</script>

<section class="screen-content">
  <h1>Home</h1>
  <p>Welcome to the Rocket League training journal.</p>
  <p class="health-status">
    API status:
    {#if apiHealthy === null}
      <span class="badge pending">checking...</span>
    {:else if apiHealthy}
      <span class="badge healthy">online</span>
    {:else}
      <span class="badge offline">offline</span>
    {/if}
  </p>

  <div class="preset-area">
    <h2>Start preset</h2>

    {#if loadingPresets}
      <p>Loading presets…</p>
    {:else if presetError}
      <p class="form-error">{presetError}</p>
    {:else if presets.length === 0}
      <p>No presets yet. Create one on the Presets screen and come back to start training.</p>
    {:else}
      <div class="preset-grid">
        {#each presets as preset}
          <button class="preset-card" type="button" on:click={() => beginPreset(preset)}>
            <span class="preset-name">{preset.name}</span>
            <small class="preset-blocks">{preset.blocks.length} block{preset.blocks.length === 1 ? '' : 's'}</small>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</section>