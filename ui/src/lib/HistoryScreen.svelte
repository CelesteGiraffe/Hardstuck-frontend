<script lang="ts">
  import { onMount } from 'svelte';
  import { getSessions, getSkills, getPresets } from './api';
  import type { Session, SessionBlock } from './api';

  let sessions: Session[] = [];
  let selectedSession: Session | null = null;
  let loading = true;
  let error: string | null = null;
  let skillMap: Record<number, string> = {};
  let presetMap: Record<number, string> = {};

  onMount(async () => {
    loading = true;
    error = null;

    try {
      const [sessionData, skills, presets] = await Promise.all([getSessions(), getSkills(), getPresets()]);
      sessions = sessionData.sort((a, b) => new Date(b.startedTime).getTime() - new Date(a.startedTime).getTime());
      skillMap = Object.fromEntries(skills.map((skill) => [skill.id, skill.name]));
      presetMap = Object.fromEntries(presets.map((preset) => [preset.id, preset.name]));
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unable to load sessions';
    } finally {
      loading = false;
    }
  });

  function formatDate(value: string) {
    return new Date(value).toLocaleString();
  }

  function totalDurationMinutes(session: Session) {
    const totalSeconds = session.blocks.reduce((sum, block) => sum + Math.max(0, block.actualDuration), 0);
    return Math.round(totalSeconds / 60);
  }

  function toggleSession(session: Session) {
    selectedSession = selectedSession?.id === session.id ? null : session;
  }

  function getPresetName(session: Session) {
    if (!session.presetId) {
      return 'manual';
    }

    return presetMap[session.presetId] ?? `Preset #${session.presetId}`;
  }

  function getBlockSkills(block: SessionBlock) {
    return block.skillIds.map((id) => skillMap[id] ?? `Skill #${id}`).join(', ');
  }
</script>

<section class="screen-content">
  <h1>History</h1>
  <p>Review your completed training sessions.</p>

  {#if loading}
    <p>Loading sessions…</p>
  {:else if error}
    <p class="badge offline">{error}</p>
  {:else if sessions.length === 0}
    <p>No sessions recorded yet. Start a preset on the Home screen!</p>
  {:else}
    <div class="history-grid">
      {#each sessions as session}
        <button
          class={`history-card ${selectedSession?.id === session.id ? 'expanded' : ''}`}
          type="button"
          on:click={() => toggleSession(session)}
          aria-expanded={selectedSession?.id === session.id}
        >
          <div class="history-card-header">
            <span>{formatDate(session.startedTime)}</span>
            <span>{totalDurationMinutes(session)} min</span>
          </div>
          <p class="history-card-meta">
            {session.source} • {getPresetName(session)}
          </p>
        </button>
      {/each}
    </div>

    {#if selectedSession}
      <div class="session-detail">
        <h2>Session details</h2>
        <p>
          <strong>Started:</strong> {formatDate(selectedSession.startedTime)}
        </p>
        {#if selectedSession.finishedTime}
          <p>
            <strong>Finished:</strong> {formatDate(selectedSession.finishedTime)}
          </p>
        {/if}
        <p>
          <strong>Source:</strong> {selectedSession.source} • {getPresetName(selectedSession)}
        </p>
        <ul class="session-blocks">
          {#each selectedSession.blocks as block, index}
            <li>
              <div class="block-top">
                <strong>
                  Block {index + 1}: {block.type}
                </strong>
                <span>{block.actualDuration}s actual • {block.plannedDuration}s planned</span>
              </div>
              <p class="block-skills">Skills: {getBlockSkills(block)}</p>
              {#if block.notes}
                <p class="block-notes">Notes: {block.notes}</p>
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {/if}
</section>