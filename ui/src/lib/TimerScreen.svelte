<script lang="ts">
  import { selectedPreset } from './stores';
  import type { Preset } from './api';

  const formatDuration = (seconds = 0) => {
    const totalSeconds = Math.max(0, Math.round(seconds));
    const minutes = Math.floor(totalSeconds / 60);
    const remainder = totalSeconds % 60;

    if (minutes === 0 && remainder === 0) {
      return '0m';
    }

    return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
  };

  $: activePreset = $selectedPreset;
  $: hasPreset = Boolean(activePreset);
  $: blockCount = activePreset?.blocks.length ?? 0;
  $: totalPlanned = activePreset?.blocks.reduce((sum, block) => sum + (block.durationSeconds ?? 0), 0) ?? 0;
  $: blockTypes = activePreset ? Array.from(new Set(activePreset.blocks.map((block) => block.type))) : [];
</script>

<main class="screen-shell timer-shell">
  <section class="screen-content timer-hero glass-card">
    <div>
      <p class="hero-accent">Focused training</p>
      <h1 class="glow-heading">Timer</h1>
      <p class="section-copy">
        Queue up a preset to guide focused repetitions, sync your aims, and stay on the neon path.
      </p>
    </div>
    <span class="hero-chip">Neon ready</span>
  </section>

  <section class="screen-content preset-summary glass-card">
    {#if hasPreset}
      <header class="preset-summary-header">
        <div>
          <p class="hero-accent">Preset ready</p>
          <h2>{activePreset?.name}</h2>
          <p class="section-copy">
            {blockCount} block{blockCount === 1 ? '' : 's'} · {formatDuration(totalPlanned)} planned
          </p>
        </div>
        <div class="preset-summary-types">
          <span class="meta-label">Block types</span>
          <strong>{blockTypes.join(', ') || '—'}</strong>
        </div>
      </header>
      <div class="preset-summary-meta">
        <div>
          <span class="meta-label">Total time</span>
          <strong>{formatDuration(totalPlanned)}</strong>
        </div>
        <div>
          <span class="meta-label">Blocks</span>
          <strong>{blockCount}</strong>
        </div>
      </div>
    {:else}
      <div class="empty-state">
        <p class="hero-accent">No preset selected</p>
        <h3 class="glow-heading">Ready when you are</h3>
        <p class="section-copy">
          Open the Presets screen and pick a routine to bring it into the timer. Blocks, durations, and lighting cues
          will appear here as soon as you choose one.
        </p>
      </div>
    {/if}
  </section>

  {#if hasPreset}
    <section class="screen-content blocks-section glass-card">
      <div class="blocks-header">
        <div>
          <p class="hero-accent">Block overview</p>
          <h3>{activePreset?.name} · {blockCount} block{blockCount === 1 ? '' : 's'}</h3>
        </div>
      </div>
      <div class="blocks-grid">
        {#each activePreset?.blocks ?? [] as block}
          <article class="block-card">
            <div class="block-card-type">{block.type}</div>
            <div class="block-card-duration">
              <span>Planned duration</span>
              <strong>{formatDuration(block.durationSeconds)}</strong>
            </div>
            <div class="block-card-skill">
              <span>Skill ID</span>
              <strong>{block.skillId}</strong>
            </div>
            {#if block.notes}
              <p class="block-card-notes">{block.notes}</p>
            {/if}
          </article>
        {/each}
      </div>
    </section>
  {/if}
</main>

<style>
  .timer-shell {
    display: flex;
    flex-direction: column;
    gap: clamp(1rem, 1.5vw, 1.75rem);
  }

  .timer-hero {
    background: linear-gradient(135deg, rgba(249, 115, 211, 0.18), rgba(99, 102, 241, 0.25));
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }

  .hero-chip {
    padding: 0.35rem 0.9rem;
    border-radius: 999px;
    border: 1px solid rgba(249, 115, 211, 0.6);
    background: rgba(249, 115, 211, 0.2);
    color: #fff;
    font-size: 0.8rem;
  }

  .preset-summary {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .preset-summary-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .preset-summary-meta {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 1rem;
  }

  .meta-label {
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .empty-state {
    border: 1px dashed rgba(255, 255, 255, 0.2);
    padding: 1.25rem;
    border-radius: var(--card-radius);
    background: rgba(15, 23, 42, 0.45);
    text-align: left;
  }

  .blocks-section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .blocks-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1rem;
  }

  .block-card {
    border-radius: var(--card-radius);
    border: 1px solid rgba(255, 255, 255, 0.12);
    padding: 1rem;
    background: rgba(4, 6, 20, 0.65);
    box-shadow: var(--glow);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .block-card-type {
    font-size: 1rem;
    font-weight: 600;
    text-transform: capitalize;
  }

  .block-card-duration,
  .block-card-skill {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .block-card-duration strong,
  .block-card-skill strong {
    color: #fff;
    font-size: 1rem;
  }

  .block-card-notes {
    margin: 0;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  @media (max-width: 640px) {
    .timer-hero {
      flex-direction: column;
    }
  }
</style>
