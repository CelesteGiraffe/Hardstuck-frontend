<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { selectedPreset, clearSelectedPreset } from './stores';
  import { createSession } from './api';
  import { sessionsQuery, weeklySkillSummaryQuery } from './queries';
  import { profileStore } from './profileStore';
  import type { Preset, PresetBlock, SessionBlockPayload, SessionPayload } from './api';

  export let audioEnabled = true;

  const formatDuration = (seconds = 0) => {
    const totalSeconds = Math.max(0, Math.round(seconds));
    const minutes = Math.floor(totalSeconds / 60);
    const remainder = totalSeconds % 60;

    if (minutes === 0 && remainder === 0) {
      return '0m';
    }

    return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
  };

  const PROGRESS_RADIUS = 70;
  const PROGRESS_CIRCUMFERENCE = 2 * Math.PI * PROGRESS_RADIUS;

  let timerId: number | null = null;
  let currentBlockIndex = 0;
  let remainingSeconds = 0;
  let isRunning = false;
  let sessionComplete = false;
  let sessionStartTime: number | null = null;
  let sessionEndTime: number | null = null;
  let cuePreferences = { audio: true };
  let lastPresetId: number | null = null;
  let blockOverrides: Record<number, { remaining?: string; actual?: string }> = {};
  let blockNotes: Record<number, string> = {};
  let sessionNotes = '';
  let activeBlockKey: number | null = null;
  let currentBlockOverrides: { remaining?: string; actual?: string } = {};
  let timelineEntries: TimelineEntry[] = [];
  let savePending = false;
  let saveSuccess: string | null = null;
  let saveError: string | null = null;

  type TimelineEntry = {
    key: number;
    index: number;
    type: string;
    skillId?: number;
    planned: number;
    actual: number;
    status: 'completed' | 'active' | 'upcoming';
    hasNotes: boolean;
  };

  const getBlockKey = (block: PresetBlock, index: number) => block.id ?? block.orderIndex ?? index;
  const parseManualValue = (value?: string) => {
    if (!value) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  function resetDraftStates() {
    blockOverrides = {};
    blockNotes = {};
    sessionNotes = '';
  }

  function updateOverrideInput(
    blockKey: number | null,
    field: 'remaining' | 'actual',
    value: string,
  ) {
    if (blockKey === null) return;
    const trimmed = value.trim();
    const nextValue = trimmed === '' ? undefined : trimmed;
    const existing = blockOverrides[blockKey] ?? {};
    const updated = { ...existing };

    if (nextValue === undefined) {
      delete updated[field];
    } else {
      updated[field] = nextValue;
    }

    if (Object.keys(updated).length === 0) {
      const cloned = { ...blockOverrides };
      delete cloned[blockKey];
      blockOverrides = cloned;
      return;
    }

    blockOverrides = { ...blockOverrides, [blockKey]: updated };
  }

  function handleBlockNoteChange(blockKey: number, text: string) {
    blockNotes = { ...blockNotes, [blockKey]: text };
  }

  $: activePreset = $selectedPreset;
  $: presetBlocks = activePreset?.blocks ?? [];
  $: hasPreset = Boolean(activePreset);
  $: blockCount = presetBlocks.length;
  $: totalPlanned = presetBlocks.reduce((sum, block) => sum + (block.durationSeconds ?? 0), 0);
  $: blockTypes = hasPreset ? Array.from(new Set(presetBlocks.map((block) => block.type))) : [];
  $: activeBlock = presetBlocks[currentBlockIndex];
  $: futureRemaining = presetBlocks
    .slice(currentBlockIndex + 1)
    .reduce((sum, block) => sum + block.durationSeconds, 0);
  $: plannedRemaining = Math.max(0, (activeBlock ? Math.max(0, remainingSeconds) : 0) + futureRemaining);
  $: elapsedSeconds = Math.max(0, totalPlanned - plannedRemaining);
  $: progressRatio = totalPlanned ? Math.min(1, elapsedSeconds / totalPlanned) : 0;
  $: progressOffset = PROGRESS_CIRCUMFERENCE * (1 - progressRatio);

  $: activeBlockKey = activeBlock ? getBlockKey(activeBlock, currentBlockIndex) : null;
  $: currentBlockOverrides = activeBlockKey !== null ? blockOverrides[activeBlockKey] ?? {} : {};
  $: timelineEntries = presetBlocks.map((block, index) => {
    const key = getBlockKey(block, index);
    const isCompleted = sessionComplete || index < currentBlockIndex;
    const isActive = index === currentBlockIndex && !sessionComplete;
    const overrideValues = blockOverrides[key] ?? {};
    const manualActual = parseManualValue(overrideValues.actual);
    const planned = block.durationSeconds ?? 0;
    let defaultActual = 0;

    if (isCompleted) {
      defaultActual = planned;
    } else if (isActive) {
      defaultActual = Math.max(0, planned - remainingSeconds);
    }

    const actual = manualActual ?? defaultActual;
    return {
      key,
      index,
      type: block.type,
      skillId: block.skillId,
      planned,
      actual,
      status: (isCompleted ? 'completed' : isActive ? 'active' : 'upcoming') as TimelineEntry['status'],
      hasNotes: Boolean((blockNotes[key] ?? block.notes ?? '').trim()),
    };
  });

  $: if (hasPreset && activePreset?.id !== lastPresetId) {
    lastPresetId = activePreset?.id ?? null;
    resetTimerState();
  }

  $: if (!hasPreset) {
    stopTicker();
    currentBlockIndex = 0;
    remainingSeconds = 0;
    isRunning = false;
    sessionComplete = false;
    sessionStartTime = null;
    sessionEndTime = null;
    lastPresetId = null;
  }

  onMount(() => {
    if (hasPreset) {
      remainingSeconds = presetBlocks[0]?.durationSeconds ?? 0;
    }

    return () => stopTicker();
  });

  onDestroy(() => {
    stopTicker();
  });

  function resetTimerState() {
    stopTicker();
    resetDraftStates();
    sessionComplete = false;
    isRunning = false;
    currentBlockIndex = 0;
    sessionStartTime = null;
    sessionEndTime = null;
    remainingSeconds = presetBlocks[0]?.durationSeconds ?? 0;
  }

  function startTimer() {
    if (!hasPreset || blockCount === 0) return;
    if (sessionComplete) {
      resetTimerState();
    }
    saveSuccess = null;
    saveError = null;
    if (!sessionStartTime) {
      sessionStartTime = Date.now();
    }
    if (!isRunning) {
      isRunning = true;
      timerId = window.setInterval(tick, 1000);
    }
  }

  function pauseTimer() {
    isRunning = false;
    stopTicker();
  }

  function previousBlock() {
    if (!hasPreset || blockCount === 0) return;
    const previousIndex = Math.max(0, currentBlockIndex - 1);
    currentBlockIndex = previousIndex;
    sessionComplete = false;
    sessionEndTime = null;
    remainingSeconds = presetBlocks[currentBlockIndex]?.durationSeconds ?? 0;
  }

  function skipBlock() {
    if (!hasPreset || blockCount === 0) return;
    handleBlockCompletion();
  }

  function tick() {
    if (!isRunning || sessionComplete) return;
    if (remainingSeconds <= 1) {
      remainingSeconds = 0;
      handleBlockCompletion();
    } else {
      remainingSeconds = remainingSeconds - 1;
    }
  }

  function handleBlockCompletion() {
    triggerCues();
    const nextIndex = currentBlockIndex + 1;

    if (nextIndex >= blockCount) {
      sessionComplete = true;
      isRunning = false;
      sessionEndTime = Date.now();
      stopTicker();
      remainingSeconds = 0;
      currentBlockIndex = Math.max(0, blockCount - 1);
      return;
    }

    currentBlockIndex = nextIndex;
    remainingSeconds = presetBlocks[currentBlockIndex]?.durationSeconds ?? 0;
  }

  function stopTicker() {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function triggerCues() {
    if (audioEnabled) {
      playAudioCue();
    }
  }

  function playAudioCue() {
    if (typeof window === 'undefined') return;
    const ctor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ctor) return;
    const context = new ctor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 480;
    oscillator.connect(gain);
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.12, context.currentTime);
    oscillator.start();
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.2);
    oscillator.stop(context.currentTime + 0.2);
    oscillator.onended = () => context.close();
  }

  function buildSessionBlocks(): SessionBlockPayload[] {
    return presetBlocks.map((block, index) => {
      const key = getBlockKey(block, index);
      const overrideValues = blockOverrides[key] ?? {};
      const manualActual = parseManualValue(overrideValues.actual);
      const planned = block.durationSeconds ?? 0;
      const actual = manualActual ?? planned;
      const userNotes = blockNotes[key]?.trim();
      const defaultNotes = block.notes?.trim();
      const notes = userNotes ?? defaultNotes;

      return {
        type: block.type,
        skillIds: [block.skillId],
        plannedDuration: planned,
        actualDuration: actual,
        notes: notes || undefined,
      };
    });
  }

  function createSessionPayload(): SessionPayload {
    const startedTime = sessionStartTime ?? Date.now();
    const finishedTime = sessionEndTime ?? Date.now();
    const trimmedNotes = sessionNotes.trim();

    return {
      startedTime: new Date(startedTime).toISOString(),
      finishedTime: new Date(finishedTime).toISOString(),
      source: 'timer',
      presetId: activePreset?.id ?? null,
      notes: trimmedNotes || undefined,
      blocks: buildSessionBlocks(),
    };
  }

  async function saveSession() {
    if (savePending || !sessionComplete || !hasPreset) return;
    savePending = true;
    saveError = null;
    saveSuccess = null;

    try {
      await createSession(createSessionPayload());
      saveSuccess = 'Session saved!';
      await Promise.all([sessionsQuery.refresh(), weeklySkillSummaryQuery.refresh()]);
      await profileStore.refresh();
      resetTimerState();
      clearSelectedPreset();
    } catch (error) {
      saveError = error instanceof Error ? error.message : 'Unable to save session';
    } finally {
      savePending = false;
    }
  }

  function formatTimeLabel(timestamp: number | null) {
    return timestamp
      ? new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : '—';
  }
</script>

<main class="screen-shell timer-shell">
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
            Open the Presets screen and pick a routine to bring it into the Preset Runner. Blocks, durations, and lighting cues
            will appear here as soon as you choose one.
          </p>
      </div>
    {/if}
  </section>

  {#if hasPreset}
    <section class="screen-content timer-panel glass-card">
      <div class="timer-panel-layout">
        <div class="timer-primary">
          <div class="timer-panel-inner">
            <div class="progress-ring" aria-live="polite">
              <svg viewBox="0 0 180 180" role="img" aria-label="Preset progress">
                <circle
                  class="ring-base"
                  cx="90"
                  cy="90"
                  r={PROGRESS_RADIUS}
                  stroke-width="10"
                />
                <circle
                  class="ring-progress"
                  cx="90"
                  cy="90"
                  r={PROGRESS_RADIUS}
                  stroke-width="10"
                  stroke-dasharray={PROGRESS_CIRCUMFERENCE}
                  stroke-dashoffset={progressOffset}
                  stroke-linecap="round"
                />
              </svg>
              <div class="ring-labels">
                <strong>{formatDuration(remainingSeconds)}</strong>
                <span>{isRunning ? 'Running' : sessionComplete ? 'Session complete' : 'Paused'}</span>
              </div>
              <p class="ring-secondary">
                {formatDuration(elapsedSeconds)} · {formatDuration(totalPlanned)} elapsed
              </p>
            </div>
            <div class="timer-details">
              <p class="meta-label">Current block</p>
              <h3>
                {activeBlock?.type ?? 'Standby'}
                <span class="inline-label">{currentBlockIndex + 1}/{blockCount}</span>
              </h3>
              <p class="section-copy">
                Skill {activeBlock?.skillId ?? '—'} · {formatDuration(activeBlock?.durationSeconds)} planned
              </p>
              <div class="session-times">
                <div>
                  <span class="meta-label">Session start</span>
                  <strong>{formatTimeLabel(sessionStartTime)}</strong>
                </div>
                <div>
                  <span class="meta-label">Session end</span>
                  <strong>{formatTimeLabel(sessionEndTime)}</strong>
                </div>
              </div>
            </div>
          </div>
          <div class="timer-controls">
            <button
              type="button"
              on:click={previousBlock}
              disabled={!hasPreset || blockCount === 0 || currentBlockIndex === 0}
            >
              Previous
            </button>
            <button
              type="button"
              class="primary"
              on:click={startTimer}
              disabled={!hasPreset || blockCount === 0 || isRunning}
            >
              {sessionComplete ? 'Restart' : 'Start'}
            </button>
            <button type="button" on:click={pauseTimer} disabled={!isRunning}>
              Pause
            </button>
            <button
              type="button"
              on:click={skipBlock}
              disabled={!hasPreset || blockCount === 0 || sessionComplete}
            >
              Skip
            </button>
          </div>
          {#if activeBlock}
            <div class="override-group">
              <label class="override-field">
                <span>Remaining override</span>
                <input
                  data-testid="remaining-override-input"
                  type="number"
                  min="0"
                  inputmode="numeric"
                  value={currentBlockOverrides.remaining ?? ''}
                  on:input={(event) =>
                    updateOverrideInput(activeBlockKey, 'remaining', event.currentTarget.value)
                  }
                />
                <small>Adjust the clock without changing the running routine.</small>
              </label>
              <label class="override-field">
                <span>Actual duration override</span>
                <input
                  data-testid="actual-override-input"
                  type="number"
                  min="0"
                  inputmode="numeric"
                  value={currentBlockOverrides.actual ?? ''}
                  on:input={(event) =>
                    updateOverrideInput(activeBlockKey, 'actual', event.currentTarget.value)
                  }
                />
                <small>Correct the actual duration that appears in the timeline.</small>
              </label>
            </div>
          {/if}
        </div>
        <aside class="timeline-panel">
          <header class="timeline-header">
            <div>
              <p class="hero-accent">Timeline</p>
              <h3>Block flow</h3>
            </div>
            <p class="section-copy">
              Planned vs actual durations, active status, and saved notes appear here as you move through the preset.
            </p>
          </header>
          <ul class="timeline-list">
            {#each timelineEntries as entry (entry.key)}
              <li
                class="timeline-item"
                class:timeline-active={entry.status === 'active'}
                class:timeline-completed={entry.status === 'completed'}
              >
                <div class="timeline-item-header">
                  <div>
                    <p class="meta-label">Block {entry.index + 1}</p>
                    <strong>{entry.type ?? 'Block'}</strong>
                    <span class="timeline-skill">Skill {entry.skillId ?? '—'}</span>
                  </div>
                  <span class="timeline-status">
                    {entry.status === 'active'
                      ? 'Active'
                      : entry.status === 'completed'
                      ? 'Completed'
                      : 'Upcoming'}
                  </span>
                </div>
                <div class="timeline-item-durations">
                  <div>
                    <span class="meta-label">Planned</span>
                    <strong>{formatDuration(entry.planned)}</strong>
                  </div>
                  <div>
                    <span class="meta-label">Actual</span>
                    <strong data-testid={`timeline-actual-${entry.key}`}>
                      {formatDuration(entry.actual)}
                    </strong>
                  </div>
                </div>
                {#if entry.status === 'completed' && entry.hasNotes}
                  <span class="note-badge">Notes saved</span>
                {/if}
              </li>
            {/each}
          </ul>
        </aside>
      </div>
    </section>
  {/if}

  {#if hasPreset}
    <section class="screen-content blocks-section glass-card">
      <div class="blocks-header">
        <div>
          <p class="hero-accent">Block overview</p>
          <h3>{activePreset?.name} · {blockCount} block{blockCount === 1 ? '' : 's'}</h3>
        </div>
      </div>
      <div class="blocks-grid">
        {#each activePreset?.blocks ?? [] as block, index (getBlockKey(block, index))}
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
            <label class="block-card-note">
              <span>Notes</span>
              <textarea
                rows="2"
                value={blockNotes[getBlockKey(block, index)] ?? block.notes ?? ''}
                placeholder="Capture thoughts or reminders"
                on:input={(event) => handleBlockNoteChange(getBlockKey(block, index), event.currentTarget.value)}
              ></textarea>
            </label>
          </article>
        {/each}
      </div>
    </section>
  {/if}
  {#if hasPreset}
    <section class="screen-content notes-section glass-card">
      <div class="notes-header">
        <div>
          <p class="hero-accent">Session notes</p>
          <h3>Reflections</h3>
        </div>
        <p class="section-copy">Draft thoughts stay in this space until you clear them.</p>
      </div>
      <textarea
        class="notes-textarea"
        rows="4"
        bind:value={sessionNotes}
        placeholder="What worked today? What do you want to adjust next time?"
        data-testid="session-notes"
      ></textarea>
    </section>
    {#if sessionComplete}
      <section class="screen-content save-section glass-card">
        <div class="save-section-header">
          <div>
            <p class="hero-accent">Session complete</p>
            <h3>Capture today&apos;s run</h3>
            <p class="section-copy">
              Save the timeline, overrides, and notes so your Home screen stays up to date.
            </p>
          </div>
          <button
            type="button"
            class="timer-save-button"
            data-testid="save-session-button"
            on:click={saveSession}
            disabled={savePending}
          >
            {savePending ? 'Saving…' : 'Save session'}
          </button>
        </div>
        <p class="save-helper section-copy">
          The save button is disabled until the current request finishes. Notes and overrides stay intact if
          a save attempt fails.
        </p>
        {#if savePending || saveError || saveSuccess}
          <p class="save-feedback" aria-live="polite">
            {#if savePending}
              Saving session…
            {:else if saveError}
              <span class="save-error">{saveError}</span>
            {:else if saveSuccess}
              <span class="save-success">{saveSuccess}</span>
            {/if}
          </p>
        {/if}
      </section>
    {/if}
    {#if !sessionComplete && (saveSuccess || saveError)}
      <p
        class={`save-feedback ${saveSuccess ? 'save-success' : 'save-error'}`}
        aria-live="polite"
        data-testid="save-feedback"
      >
        {saveSuccess ?? saveError}
      </p>
    {/if}
  {/if}
</main>

<style>
  .timer-shell {
    display: flex;
    flex-direction: column;
    gap: clamp(1rem, 1.5vw, 1.75rem);
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

  .timer-panel {
    display: block;
  }

  .timer-panel-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: clamp(1rem, 2vw, 1.5rem);
  }

  .timer-primary {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .timer-panel-inner {
    display: flex;
    gap: clamp(1rem, 2vw, 1.5rem);
    align-items: center;
    flex-wrap: wrap;
  }

  .timeline-panel {
    border-radius: var(--card-radius);
    border: 1px solid rgba(255, 255, 255, 0.12);
    padding: 1rem;
    background: rgba(4, 6, 20, 0.65);
    box-shadow: var(--glow);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-height: 520px;
  }

  .timeline-header {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .timeline-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    overflow-y: auto;
    max-height: 360px;
  }

  .timeline-item {
    border-radius: var(--card-radius);
    border: 1px solid rgba(255, 255, 255, 0.12);
    padding: 0.75rem;
    background: rgba(15, 23, 42, 0.7);
    box-shadow: var(--glow);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .timeline-item-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .timeline-skill {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .timeline-status {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #a5b4fc;
  }

  .timeline-item-durations {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .timeline-item-durations strong {
    font-size: 0.95rem;
    color: #fff;
  }

  .timeline-active {
    border-color: rgba(244, 114, 182, 0.9);
  }

  .timeline-completed {
    opacity: 0.92;
  }

  .note-badge {
    align-self: flex-start;
    background: rgba(99, 102, 241, 0.2);
    color: #e0e7ff;
    padding: 0.2rem 0.75rem;
    border-radius: 999px;
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .override-group {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.75rem;
  }

  .override-field {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .override-field input {
    border-radius: var(--card-radius);
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.04);
    color: #fff;
    padding: 0.45rem 0.6rem;
  }

  .override-field small {
    font-size: 0.65rem;
    color: var(--text-muted);
  }

  .progress-ring {
    width: 180px;
    position: relative;
    text-align: center;
  }

  .progress-ring svg {
    width: 100%;
    height: auto;
    transform: rotate(-90deg);
  }

  .ring-base,
  .ring-progress {
    fill: none;
    stroke-width: 10;
  }

  .ring-base {
    stroke: rgba(255, 255, 255, 0.1);
  }

  .ring-progress {
    stroke: #f472b6;
    transition: stroke-dashoffset 0.4s ease;
  }

  .ring-labels {
    position: absolute;
    inset: 45px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 0.35rem;
    text-transform: none;
  }

  .ring-labels strong {
    font-size: 1.75rem;
  }

  .ring-secondary {
    margin-top: 0.5rem;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .timer-details {
    flex: 1;
    min-width: 220px;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .inline-label {
    font-size: 0.7rem;
    color: var(--text-muted);
    margin-left: 0.35rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  .session-times {
    display: grid;
    grid-template-columns: repeat(2, minmax(120px, 1fr));
    gap: 0.75rem;
    margin-top: 0.5rem;
  }

  .timer-controls {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .timer-controls button {
    flex: 1;
    min-width: 110px;
    padding: 0.65rem 1rem;
    border-radius: var(--card-radius);
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.05);
    color: #fff;
    font-weight: 600;
    font-size: 0.95rem;
    transition: transform 0.15s ease, border 0.15s ease;
  }

  .timer-controls button:hover:enabled {
    transform: translateY(-1px);
  }

  .timer-controls button:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .timer-controls .primary {
    border: none;
    background: linear-gradient(135deg, #f472b6, #6366f1);
    box-shadow: 0 10px 25px rgba(99, 102, 241, 0.35);
  }

  .timer-cues {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
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

  .block-card-note {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .block-card-note textarea {
    width: 100%;
    border-radius: var(--card-radius);
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.03);
    color: #fff;
    padding: 0.5rem;
    resize: vertical;
    min-height: 78px;
    font-size: 0.85rem;
  }

  .notes-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .notes-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .notes-textarea {
    width: 100%;
    border-radius: var(--card-radius);
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    color: #fff;
    padding: 0.75rem;
    font-size: 0.9rem;
    min-height: 140px;
    resize: vertical;
  }

  .save-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .save-section-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .timer-save-button {
    border: none;
    border-radius: var(--card-radius);
    padding: 0.65rem 1.25rem;
    font-weight: 600;
    font-size: 0.95rem;
    background: linear-gradient(135deg, #f472b6, #6366f1);
    color: #fff;
    box-shadow: 0 10px 25px rgba(99, 102, 241, 0.35);
  }

  .timer-save-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .save-helper {
    margin: 0;
  }

  .save-feedback {
    margin: 0;
    font-size: 0.9rem;
    letter-spacing: 0.05em;
    color: var(--text-muted);
  }

  .save-success {
    color: #4ade80;
  }

  .save-error {
    color: #f87171;
  }

  @media (max-width: 640px) {
    .timer-panel-inner {
      flex-direction: column;
      align-items: stretch;
    }

    .ring-labels {
      inset: 55px;
    }

    .session-times {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 900px) {
    .timer-panel-layout {
      grid-template-columns: 1fr;
    }

    .timeline-panel {
      order: 2;
    }
  }
</style>
