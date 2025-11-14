<script lang="ts">
  import { onMount } from 'svelte';
  import { getSessions, getSkills, getPresets, getSkillSummary } from './api';
  import type { Session, SessionBlock, SkillSummary } from './api';

  let sessions: Session[] = [];
  let selectedSession: Session | null = null;
  let loading = true;
  let error: string | null = null;
  let skillMap: Record<number, string> = {};
  let presetMap: Record<number, string> = {};
  let summary: SkillSummary[] = [];
  let summaryLoading = true;
  let summaryError: string | null = null;

  onMount(async () => {
    loadSessions();
    loadSummary();
  });

  async function loadSessions() {
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
  }

  async function loadSummary() {
    summaryLoading = true;
    summaryError = null;
    const to = new Date();
    const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

    try {
      summary = await getSkillSummary({ from: from.toISOString(), to: to.toISOString() });
    } catch (err) {
      summaryError = err instanceof Error ? err.message : 'Unable to load summary';
    } finally {
      summaryLoading = false;
    }
  }

  function formatDate(value: string) {
    return new Date(value).toLocaleString();
  }

  function totalDurationMinutes(session: Session) {
    const totalSeconds = session.blocks.reduce((sum, block) => sum + Math.max(0, block.actualDuration), 0);
    return Math.round(totalSeconds / 60);
  }

  $: chartMaxMinutes = summary.length ? Math.max(...summary.map((item) => item.minutes)) : 0;

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

  <div class="history-summary">
    <h2>Training per skill (last 7 days)</h2>

    {#if summaryLoading}
      <p>Loading summary…</p>
    {:else if summaryError}
      <p class="badge offline">{summaryError}</p>
    {:else if summary.length === 0}
      <p>No activity recorded yet.</p>
    {:else}
      <div class="summary-chart">
        {#each summary as item}
          <div class="chart-bar">
            <div
              class="chart-bar-value"
              style={`height: ${chartMaxMinutes ? (item.minutes / chartMaxMinutes) * 160 : 0}px`}
            >
              <span>{item.minutes}m</span>
            </div>
            <div class="chart-bar-label">{item.name}</div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

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

<style>
  .history-summary {
    background: var(--card-background, #fff);
    border-radius: 12px;
    padding: 1rem;
    margin-bottom: 1.5rem;
    box-shadow: 0 10px 40px -20px rgba(0, 0, 0, 0.25);
  }

  .summary-chart {
    display: flex;
    gap: 0.75rem;
    align-items: flex-end;
    min-height: 180px;
  }

  .chart-bar {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }

  .chart-bar-value {
    width: 100%;
    background: linear-gradient(180deg, #8dd9ff, #4a7cff);
    border-radius: 999px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    font-size: 0.75rem;
    color: #fff;
    font-weight: 600;
  }

  .chart-bar-value span {
    padding-bottom: 0.25rem;
  }

  .chart-bar-label {
    font-size: 0.75rem;
    text-align: center;
    color: var(--muted-text, #7a7a7a);
    max-width: 60px;
    word-break: break-word;
  }
</style>