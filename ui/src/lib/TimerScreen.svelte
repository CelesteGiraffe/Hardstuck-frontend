<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { selectedPreset } from './stores';
  import type { Preset, PresetBlock } from './api';

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
  const STORAGE_KEYS = {
    audio: 'timer-audio-cues',
    vibration: 'timer-vibration-cues',
  } as const;

  let timerId: number | null = null;
  let currentBlockIndex = 0;
  let remainingSeconds = 0;
  let isRunning = false;
  let sessionComplete = false;
  let sessionStartTime: number | null = null;
  let sessionEndTime: number | null = null;
  let cuePreferences = { audio: true, vibration: true };
  let lastPresetId: number | null = null;

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
    loadCuePreferences();
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

  function loadCuePreferences() {
    if (typeof localStorage === 'undefined') return;
    const storedAudio = localStorage.getItem(STORAGE_KEYS.audio);
    const storedVibration = localStorage.getItem(STORAGE_KEYS.vibration);
    cuePreferences = {
      audio: storedAudio === null ? true : storedAudio === 'true',
      vibration: storedVibration === null ? true : storedVibration === 'true',
    };
  }

  function setCuePreference(type: 'audio' | 'vibration', value: boolean) {
    cuePreferences = { ...cuePreferences, [type]: value };
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS[type], String(value));
    }
  }

  function triggerCues() {
    if (cuePreferences.audio) {
      playAudioCue();
    }
    if (cuePreferences.vibration && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([120, 80, 120]);
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

  function formatTimeLabel(timestamp: number | null) {
    return timestamp
      ? new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : '—';
  }
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
    <section class="screen-content timer-panel glass-card">
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
        <button type="button" on:click={skipBlock} disabled={!hasPreset || blockCount === 0 || sessionComplete}>
          Skip
        </button>
      </div>
      <div class="timer-cues">
        <label class="cue-toggle">
          <input
            type="checkbox"
            data-testid="audio-toggle"
            checked={cuePreferences.audio}
            on:change={(event) => setCuePreference('audio', event.currentTarget.checked)}
          />
          Audio cues
        </label>
        <label class="cue-toggle">
          <input
            type="checkbox"
            data-testid="vibration-toggle"
            checked={cuePreferences.vibration}
            on:change={(event) => setCuePreference('vibration', event.currentTarget.checked)}
          />
          Vibration cues
        </label>
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

  .timer-panel {
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

  .cue-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .cue-toggle input {
    width: 1rem;
    height: 1rem;
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
</style>
