<script lang="ts">
  import { onMount } from 'svelte';
  import { getMmrRecords } from './api';

  let mmrCount: number | null = null;
  let loading = true;
  let error: string | null = null;

  onMount(async () => {
    try {
      const records = await getMmrRecords();
      mmrCount = records.length;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not load records';
    } finally {
      loading = false;
    }
  });
</script>

<section class="screen-content">
  <h1>History</h1>
  <p>Review past sessions and MMR changes over time.</p>
  <p>
    {#if loading}
      Fetching recorded MMR data...
    {:else if error}
      <span class="badge offline">{error}</span>
    {:else}
      {mmrCount} record{mmrCount === 1 ? '' : 's'} loaded.
    {/if}
  </p>
</section>