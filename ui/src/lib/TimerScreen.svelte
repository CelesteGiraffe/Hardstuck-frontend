<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { selectedPreset } from './stores';
  import { createSession, getSkills } from './api';
  import type { Preset, PresetBlock, Skill, SessionBlockPayload } from './api';

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
  let sessionStartTime: string | null = null;
  let sessionEndTime: string | null = null;
  let sessionBlocks: RecordedBlock[] = [];
  let blockNotesMap: Record<number, string> = {};
  let currentBlockNotes = '';
  let blockStartTimestamp: number | null = null;
  let lastPreparedBlockIndex: number | null = null;
  let savingSession = false;
  let saveResultMessage: string | null = null;

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
  }

  onMount(async () => {
    try {
      const skills = await getSkills();
      skillsMap = Object.fromEntries(skills.map((skill) => [skill.id, skill]));
    } catch (error) {
      console.error('Unable to load skills', error);
    }
  });

  onDestroy(() => {
    unsubscribe();
    clearTimer();
  });

  $: currentBlock = activePreset?.blocks?.[currentBlockIndex] ?? null;
  $: currentSkillName = currentBlock ? skillsMap[currentBlock.skillId]?.name ?? `Skill #${currentBlock.skillId}` : null;
  $: if (currentBlock && lastPreparedBlockIndex !== currentBlockIndex && !sessionComplete) {
    prepareCurrentBlock();
  }

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
    sessionBlocks = [
      ...sessionBlocks,
      {
        skillIds: [block.skillId],
        type: block.type,
        plannedDuration: block.durationSeconds,
        actualDuration: actualSeconds,
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
    remainingSeconds = activePreset.blocks[nextIndex].durationSeconds;
    sessionComplete = false;

    if (manual) {
      stopTimer();
    } else {
      isRunning = true;
    }

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
      notes: null,
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
      resetForPreset(activePreset);
    } catch (error) {
      console.error('Failed to save session', error);
      saveResultMessage = 'Unable to save session right now.';
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
          <div class="timer-details">
            <p class="skill-name">{currentSkillName}</p>
            <p class="block-type">{currentBlock.type}</p>
            <p class="duration">Planned: {formatDuration(currentBlock.durationSeconds)}</p>
            <p class="remaining">Remaining: {formatDuration(Math.max(remainingSeconds, 0))}</p>
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

  .timer-details .skill-name {
    font-size: 1.6rem;
    font-weight: 600;
  }

  .timer-details .block-type {
    font-size: 0.9rem;
    text-transform: uppercase;
  }

  .timer-controls {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .notes-label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.9rem;
    color: var(--text-muted);
    margin-top: 0.75rem;
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
  }

  @media (max-width: 640px) {
    .timer-controls {
      flex-direction: column;
    }
  }
</style>