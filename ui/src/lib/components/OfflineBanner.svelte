<script lang="ts">
  export let message: string | null = null;
</script>

{#if message}
  <div class="offline-banner" role="status" aria-live="polite">
    <span class="offline-status-chip">Offline</span>
    <p class="offline-message-text">{message}</p>
  </div>
{/if}
