<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { selectedPreset } from './stores';
  import { createSession } from './api';
  import { useSkills } from './useSkills';
  import type { Preset, PresetBlock, Skill, SessionBlockPayload } from './api';

  type DurationOverride = {
    remaining?: number;
    actual?: number;
  };

  type TimelineBlock = {
    index: number;
    isActive: boolean;
    isComplete: boolean;
    type: string;
    skillId: number;
    plannedDuration: number;
    actualDuration: number | null;
    notes: string | null;
  };

  type RecordedBlock = {
    skillIds: number[];
    type: string;
    plannedDuration: number;
    actualDuration: number;
    notes: string;
  };

  let activePreset: Preset | null = null;
  let currentBlockIndex = 0;
  let remainingSeconds = 0;
  let isRunning = false;
  let sessionComplete = false;
  let timerHandle: ReturnType<typeof setInterval> | null = null;
  let skillsMap: Record<number, Skill> = {};
  const skillsStore = useSkills();
  let sessionStartTime: string | null = null;
  let sessionEndTime: string | null = null;
  let sessionBlocks: RecordedBlock[] = [];
  let blockNotesMap: Record<number, string> = {};
  let currentBlockNotes = '';
  let blockStartTimestamp: number | null = null;
  let lastPreparedBlockIndex: number | null = null;
  let savingSession = false;
  let saveResultMessage: string | null = null;
  const AUDIO_CUE_PREF_KEY = 'timer:audioCue';
  const VIBRATION_PREF_KEY = 'timer:vibrationCue';

  let blockOverrides: Record<number, DurationOverride> = {};
  let sessionNotes = '';
  let audioCueEnabled = true;
  let vibrationEnabled = false;
  let audioContext: AudioContext | null = null;
  let saveResultStatus: 'success' | 'error' | null = null;
  let timelineBlocks: TimelineBlock[] = [];
  const PROGRESS_RADIUS = 52;
  const PROGRESS_STROKE_WIDTH = 10;
  const PROGRESS_CIRCUMFERENCE = 2 * Math.PI * PROGRESS_RADIUS;
  let lastNotifiedBlockIndex: number | null = null;

  const unsubscribe = selectedPreset.subscribe((preset) => {
    resetForPreset(preset);
  });

  function clearTimer() {
    if (timerHandle) {
      clearInterval(timerHandle);
      timerHandle = null;
    }
  }

  function stopTimer() {
    isRunning = false;
    clearTimer();
  }

  function resetForPreset(preset: Preset | null) {
    stopTimer();
    activePreset = preset;
    currentBlockIndex = 0;
    remainingSeconds = preset?.blocks?.[0]?.durationSeconds ?? 0;
    sessionComplete = preset ? preset.blocks.length === 0 : false;
    sessionStartTime = null;
    sessionEndTime = null;
    sessionBlocks = [];
    blockNotesMap = {};
    currentBlockNotes = '';
    blockStartTimestamp = null;
    lastPreparedBlockIndex = null;
  saveResultMessage = null;
  saveResultStatus = null;
  sessionNotes = '';
  blockOverrides = {};
    lastNotifiedBlockIndex = null;
  }

  function persistPreference(key: string, value: boolean) {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem(key, value ? '1' : '0');
  }

  function loadPreferences() {
    if (typeof localStorage === 'undefined') {
      return;
    }
    const storedAudio = localStorage.getItem(AUDIO_CUE_PREF_KEY);
    const storedVibration = localStorage.getItem(VIBRATION_PREF_KEY);
    audioCueEnabled = storedAudio === null ? true : storedAudio === '1';
    vibrationEnabled = storedVibration === '1';
  }

  function setAudioCueEnabled(value: boolean) {
    audioCueEnabled = value;
    persistPreference(AUDIO_CUE_PREF_KEY, value);
  }

  function setVibrationEnabled(value: boolean) {
    vibrationEnabled = value;
    persistPreference(VIBRATION_PREF_KEY, value);
  }

  function getAudioContext() {
    if (audioContext) {
      return audioContext;
    }
    if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') {
      return null;
    }
    audioContext = new window.AudioContext();
    return audioContext;
  }

  function playAudioCue() {
    if (!audioCueEnabled) {
      return;
    }
    const ctx = getAudioContext();
    if (!ctx) {
      return;
    }
    ctx.resume().catch(() => undefined);
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.frequency.value = 720;
    gainNode.gain.value = 0.15;
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.08);
  }

  function triggerVibration() {
    if (!vibrationEnabled || typeof navigator === 'undefined' || !navigator.vibrate) {
      return;
    }
    navigator.vibrate(120);
  }

  function notifyBlockTransition(targetIndex: number) {
    if (lastNotifiedBlockIndex === targetIndex) {
      return;
    }
    lastNotifiedBlockIndex = targetIndex;
    playAudioCue();
    triggerVibration();
  }

  function handleRemainingOverride(value: number) {
    if (!currentBlock) {
      return;
    }
    const parsedValue = Number.isFinite(value) ? value : 0;
    const clamped = Math.max(0, Math.min(parsedValue, currentBlock.durationSeconds));
    remainingSeconds = clamped;
    blockOverrides = {
      ...blockOverrides,
      [currentBlockIndex]: {
        ...blockOverrides[currentBlockIndex],
        remaining: clamped,
      },
    };
  }

  function handleActualOverride(value: number) {
    if (!currentBlock) {
      return;
    }
    const parsedValue = Number.isFinite(value) ? value : 0;
    const normalized = Math.max(0, parsedValue);
    blockOverrides = {
      ...blockOverrides,
      [currentBlockIndex]: {
        ...blockOverrides[currentBlockIndex],
        actual: normalized,
      },
    };
  }

  onMount(() => {
    skillsStore.ensureLoaded();
    loadPreferences();
  });

  $: skillsMap = Object.fromEntries($skillsStore.skills.map((skill) => [skill.id, skill]));

  onDestroy(() => {
    unsubscribe();
    clearTimer();
  });

  $: currentBlock = activePreset?.blocks?.[currentBlockIndex] ?? null;
  $: currentSkillName = currentBlock ? skillsMap[currentBlock.skillId]?.name ?? `Skill #${currentBlock.skillId}` : null;
  $: if (currentBlock && lastPreparedBlockIndex !== currentBlockIndex && !sessionComplete) {
    prepareCurrentBlock();
  }

  $: progressPercent = currentBlock && currentBlock.durationSeconds
    ? Math.min(1, Math.max(0, (currentBlock.durationSeconds - remainingSeconds) / currentBlock.durationSeconds))
    : 0;

  $: progressDashoffset = PROGRESS_CIRCUMFERENCE * (1 - progressPercent);

  $: timelineBlocks = activePreset?.blocks.map((block, index) => {
    const recorded = sessionBlocks[index];
    const override = blockOverrides[index];
    const overrideRemaining = override?.remaining;
    const remainingBasedActual = overrideRemaining != null ? Math.max(0, block.durationSeconds - overrideRemaining) : null;
    const actualDuration =
      recorded?.actualDuration ?? override?.actual ?? (remainingBasedActual != null ? remainingBasedActual : null);
    const isComplete = index < sessionBlocks.length || (sessionComplete && index <= currentBlockIndex);
    return {
      index,
      isActive: !sessionComplete && index === currentBlockIndex,
      isComplete,
      type: block.type,
      skillId: block.skillId,
      plannedDuration: block.durationSeconds,
      actualDuration: actualDuration ?? null,
      notes: recorded?.notes ?? null,
    };
  }) ?? [];

  function prepareCurrentBlock() {
    blockNotesMap[currentBlockIndex] = blockNotesMap[currentBlockIndex] ?? '';
    currentBlockNotes = blockNotesMap[currentBlockIndex];
    blockStartTimestamp = Date.now();
    if (!sessionStartTime) {
      sessionStartTime = new Date(blockStartTimestamp).toISOString();
    }
    lastPreparedBlockIndex = currentBlockIndex;
  }

  function handleNotesInput(value: string) {
    currentBlockNotes = value;
    blockNotesMap[currentBlockIndex] = value;
  }

  function recordBlockCompletion(block: PresetBlock, blockIndex: number, endedAt: number) {
    const startTime = blockStartTimestamp ?? endedAt;
    const actualSeconds = Math.max(0, Math.round((endedAt - startTime) / 1000));
    const override = blockOverrides[blockIndex];
    const overrideRemaining = override?.remaining;
    const actualFromRemaining = overrideRemaining != null ? Math.max(0, block.durationSeconds - overrideRemaining) : null;
    const actualDuration = override?.actual ?? (actualFromRemaining != null ? actualFromRemaining : actualSeconds);
    sessionBlocks = [
      ...sessionBlocks,
      {
        skillIds: [block.skillId],
        type: block.type,
        plannedDuration: block.durationSeconds,
        actualDuration,
        notes: blockNotesMap[blockIndex] ?? '',
      },
    ];
  }

  function finalizeSession(endedAt: number) {
    sessionComplete = true;
    isRunning = false;
    sessionEndTime = new Date(endedAt).toISOString();
    remainingSeconds = 0;
    blockStartTimestamp = null;
    clearTimer();
    lastNotifiedBlockIndex = null;
  }

  function advanceBlock(manual: boolean) {
    if (!currentBlock || !activePreset) {
      sessionComplete = true;
      stopTimer();
      remainingSeconds = 0;
      return;
    }

    const blockToRecord = currentBlock;
    const blockIndexToRecord = currentBlockIndex;
    const now = Date.now();
    recordBlockCompletion(blockToRecord, blockIndexToRecord, now);

    const nextIndex = currentBlockIndex + 1;

    if (nextIndex >= activePreset.blocks.length) {
      finalizeSession(now);
      return;
    }

    currentBlockIndex = nextIndex;
    const nextBlock = activePreset.blocks[nextIndex];
    const nextOverride = blockOverrides[nextIndex];
    remainingSeconds = nextOverride?.remaining ?? nextBlock.durationSeconds;
    sessionComplete = false;

    if (manual) {
      stopTimer();
    } else {
      isRunning = true;
    }

    notifyBlockTransition(nextIndex);
    lastPreparedBlockIndex = null;
  }

  function tick() {
    if (!isRunning || sessionComplete || remainingSeconds <= 0) {
      return;
    }

    remainingSeconds -= 1;

    if (remainingSeconds <= 0) {
      advanceBlock(false);
    }
  }

  function startTimer() {
    if (!currentBlock || sessionComplete) {
      return;
    }

    if (!timerHandle) {
      timerHandle = setInterval(tick, 1000);
    }

    notifyBlockTransition(currentBlockIndex);
    isRunning = true;
  }

  function pauseTimer() {
    isRunning = false;
  }

  function toggleTimer() {
    if (isRunning) {
      pauseTimer();
    } else {
      startTimer();
    }
  }

  function previousBlock() {
    if (!activePreset || currentBlockIndex === 0) {
      return;
    }

    stopTimer();
    currentBlockIndex -= 1;
    remainingSeconds = activePreset.blocks[currentBlockIndex].durationSeconds;
    sessionComplete = false;
    sessionBlocks = sessionBlocks.slice(0, currentBlockIndex);
    lastPreparedBlockIndex = null;
    notifyBlockTransition(currentBlockIndex);
  }

  function formatDuration(value: number) {
    const minutes = Math.floor(value / 60);
    const seconds = value % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  async function handleSaveSession() {
    if (
      !sessionComplete ||
      sessionBlocks.length === 0 ||
      savingSession ||
      !sessionStartTime ||
      !sessionEndTime
    ) {
      return;
    }

    savingSession = true;
    saveResultMessage = null;

    const payload = {
      startedTime: sessionStartTime,
      finishedTime: sessionEndTime,
      source: 'preset',
      presetId: activePreset?.id ?? null,
      notes: sessionNotes || null,
      blocks: sessionBlocks.map<SessionBlockPayload>((block) => ({
        type: block.type,
        skillIds: block.skillIds,
        plannedDuration: block.plannedDuration,
        actualDuration: block.actualDuration,
        notes: block.notes || null,
      })),
    };

    try {
      await createSession(payload);
      saveResultMessage = 'Session saved!';
      saveResultStatus = 'success';
      resetForPreset(activePreset);
    } catch (error) {
      console.error('Failed to save session', error);
      saveResultMessage = 'Unable to save session right now.';
      saveResultStatus = 'error';
    } finally {
      savingSession = false;
    }
  }
</script>

<section class="screen-content timer-shell">
  <div class="glass-card timer-panel">
    <div class="timer-heading">
      <p class="hero-accent">Focused session</p>
      <h1 class="glow-heading">Timer</h1>
      <p>Run structured blocks, take notes, and finish the session with neon confidence.</p>
    </div>

    {#if !activePreset}
      <p>Select a preset on the Home screen to start a timer.</p>
    {:else}
      <div class="timer-body">
        <div class="timer-header">
          <strong class="preset-title">{activePreset.name}</strong>
          <span class="blocks-count">{activePreset.blocks.length} block{activePreset.blocks.length === 1 ? '' : 's'}</span>
        </div>

        {#if sessionComplete}
          <p class="session-done">All blocks complete. Great work!</p>
        {:else if !currentBlock}
          <p>This preset has no blocks to run.</p>
        {:else}
          <div class="timer-visualization">
            <div class="timer-progress">
              <svg viewBox="0 0 120 120" aria-hidden="true">
                <circle
                  class="progress-ring-bg"
                  cx="60"
                  cy="60"
                  r={PROGRESS_RADIUS}
                  fill="none"
                  stroke-width={PROGRESS_STROKE_WIDTH}
                />
                <circle
                  class="progress-ring"
                  cx="60"
                  cy="60"
                  r={PROGRESS_RADIUS}
                  fill="none"
                  stroke-width={PROGRESS_STROKE_WIDTH}
                  stroke-dasharray={PROGRESS_CIRCUMFERENCE}
                  stroke-dashoffset={progressDashoffset}
                />
              </svg>
              <div class="progress-labels">
                <p>{formatDuration(Math.max(remainingSeconds, 0))}</p>
                <span>Remaining</span>
              </div>
            </div>
            <div class="timer-details">
              <p class="skill-name">{currentSkillName}</p>
              <p class="block-type">{currentBlock.type}</p>
              <p class="duration">Planned: {formatDuration(currentBlock.durationSeconds)}</p>
              <p class="remaining">Remaining: {formatDuration(Math.max(remainingSeconds, 0))}</p>
              <p class="status-text">
                Block {currentBlockIndex + 1} of {activePreset.blocks.length}
              </p>
            </div>
          </div>

          <div class="timer-adjustments">
            <label>
              Remaining time (seconds)
              <input
                type="number"
                min="0"
                max={currentBlock.durationSeconds}
                value={blockOverrides[currentBlockIndex]?.remaining ?? remainingSeconds}
                on:input={(event) => handleRemainingOverride(Number(event.currentTarget.value))}
              />
            </label>
            <label>
              Actual duration override
              <input
                type="number"
                min="0"
                value={blockOverrides[currentBlockIndex]?.actual ?? ''}
                placeholder="Leave blank for live time"
                on:input={(event) => handleActualOverride(Number(event.currentTarget.value))}
              />
            </label>
          </div>

          <div class="cue-toggles">
            <label>
              <input
                type="checkbox"
                checked={audioCueEnabled}
                on:change={(event) => setAudioCueEnabled(event.currentTarget.checked)}
              />
              Audio cues
            </label>
            <label>
              <input
                type="checkbox"
                checked={vibrationEnabled}
                on:change={(event) => setVibrationEnabled(event.currentTarget.checked)}
              />
              Vibration
            </label>
          </div>

          <div class="timer-timeline">
            <h4>Block timeline</h4>
            <div class="timeline-items">
              {#each timelineBlocks as block}
                <div class={`timeline-item ${block.isActive ? 'active' : ''} ${block.isComplete ? 'complete' : ''}`}>
                  <div class="timeline-index">{block.index + 1}</div>
                  <div class="timeline-body">
                    <p class="timeline-skill">{skillsMap[block.skillId]?.name ?? `Skill #${block.skillId}`}</p>
                    <p class="timeline-type">{block.type}</p>
                    <p class="timeline-duration">
                      {#if block.actualDuration != null}
                        {formatDuration(block.actualDuration)} actual
                      {:else}
                        Pending
                      {/if}
                      · {formatDuration(block.plannedDuration)} planned
                    </p>
                    {#if block.notes}
                      <p class="timeline-note">Notes saved</p>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>

          <label class="notes-label">
            Block notes
            <textarea
              class="notes-input"
              rows="3"
              bind:value={currentBlockNotes}
              on:input={(event) => handleNotesInput(event.currentTarget.value)}
              placeholder="What did you focus on?"
            ></textarea>
          </label>

          <div class="timer-controls">
            <button type="button" on:click={previousBlock} disabled={currentBlockIndex === 0 || sessionComplete} class="button-soft">
              Previous block
            </button>
            <button type="button" on:click={toggleTimer} disabled={!currentBlock || sessionComplete} class="button-neon">
              {isRunning ? 'Pause' : 'Start'}
            </button>
            <button type="button" on:click={() => advanceBlock(true)} disabled={sessionComplete || !currentBlock} class="button-soft">
              Skip block
            </button>
          </div>
        {/if}

        <div class="session-summary">
          <h3>Session snapshot</h3>
          <label class="notes-label session-notes">
            Session notes
            <textarea
              class="notes-input"
              rows="2"
              bind:value={sessionNotes}
              placeholder="What should you remember from this session?"
            ></textarea>
          </label>
          <p>Source: preset</p>
          <p>Preset: {activePreset.name}</p>
          {#if sessionStartTime}
            <p>Started: {sessionStartTime}</p>
          {/if}
          {#if sessionEndTime}
            <p>Ended: {sessionEndTime}</p>
          {/if}
          <p>Recorded blocks: {sessionBlocks.length}</p>
          <ul>
            {#each sessionBlocks as block, index}
              <li>
                <strong>Block {index + 1}</strong>: {block.type} ({block.actualDuration}s actual) —
                {block.notes || 'no notes'}
              </li>
            {/each}
          </ul>
          {#if sessionComplete && sessionBlocks.length > 0}
            <div class="session-complete-actions">
              <button
                type="button"
                class="button-neon"
                on:click={handleSaveSession}
                disabled={savingSession}
              >
                {savingSession ? 'Saving…' : 'Finish and save session'}
              </button>
              {#if saveResultMessage}
                <p class={`save-message ${saveResultMessage === 'Session saved!' ? 'success' : ''}`}>
                  {saveResultMessage}
                </p>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</section>

<style>
  .timer-shell {
    display: flex;
    justify-content: center;
  }

  .timer-panel {
    width: 100%;
    max-width: 800px;
    border: 0;
  }

  .timer-heading {
    margin-bottom: 1rem;
  }

  .timer-body {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .timer-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: rgba(255, 255, 255, 0.6);
  }

  .timer-details {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 1.1rem;
  }

  .timer-visualization {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    justify-content: space-between;
    align-items: center;
  }

  .timer-progress {
    width: 160px;
    height: 160px;
    position: relative;
  }

  .timer-progress svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }

  .progress-ring-bg {
    stroke: rgba(255, 255, 255, 0.1);
  }

  .progress-ring {
    stroke: var(--accent-neon, #9df4ff);
    stroke-linecap: round;
    transition: stroke-dashoffset 0.3s ease;
  }

  .progress-labels {
    pointer-events: none;
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    line-height: 1.2;
  }

  .timer-details .skill-name {
    font-size: 1.6rem;
    font-weight: 600;
  }

  .timer-details .block-type {
    font-size: 0.9rem;
    text-transform: uppercase;
  }

  .timer-details .status-text {
    font-size: 0.8rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.5);
  }

  .timer-controls {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .timer-adjustments {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.75rem;
  }

  .timer-adjustments label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .timer-adjustments input {
    width: 100%;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.04);
    padding: 0.5rem 0.75rem;
    color: #fff;
    font-family: inherit;
  }

  .cue-toggles {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    font-size: 0.9rem;
  }

  .cue-toggles label {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .timer-timeline {
    padding: 1rem;
    border-radius: 18px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.02);
  }

  .timer-timeline h4 {
    margin: 0;
    font-size: 1rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    margin-bottom: 0.5rem;
  }

  .timeline-items {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .timeline-item {
    display: flex;
    gap: 0.75rem;
    padding: 0.65rem 0.75rem;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid transparent;
  }

  .timeline-item.complete {
    background: rgba(74, 255, 193, 0.08);
  }

  .timeline-item.active {
    border-color: var(--accent-neon, #9df4ff);
  }

  .timeline-index {
    font-size: 0.75rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.5);
  }

  .timeline-body {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .timeline-skill {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .timeline-type {
    margin: 0;
    font-size: 0.85rem;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.55);
  }

  .timeline-duration {
    margin: 0;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .timeline-note {
    margin: 0;
    font-size: 0.75rem;
    color: #7de9ff;
  }

  .notes-label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.9rem;
    color: var(--text-muted);
    margin-top: 0.75rem;
  }

  .notes-label.session-notes {
    margin-top: 1rem;
  }

  .notes-input {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 12px;
    color: #fff;
    padding: 0.75rem;
    font-family: inherit;
  }

  .session-summary {
    margin-top: 0.5rem;
    padding: 1rem;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .session-summary ul {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .session-summary li {
    font-size: 0.9rem;
    color: var(--text-muted);
  }

  .session-complete-actions {
    margin-top: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .save-message {
    margin: 0;
    font-size: 0.9rem;
    color: #9df4ff;
  }

  .save-message.error {
    color: #ff9f9f;
  }

  .save-message.success {
    color: #8affc1;
  }

  @media (max-width: 640px) {
    .timer-controls {
      flex-direction: column;
    }
    .timer-visualization {
      flex-direction: column;
    }
    .timer-progress {
      margin: 0 auto;
    }
  }
</style>