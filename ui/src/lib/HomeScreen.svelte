<script lang="ts">
  import { onMount } from 'svelte';
  import { healthCheck } from './api';

  let apiHealthy: boolean | null = null;

  onMount(async () => {
    apiHealthy = await healthCheck();
  });
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
</section>