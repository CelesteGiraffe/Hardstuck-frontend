<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { selectedPreset } from './stores';
  import { getSkills } from './api';
  import type { Preset, PresetBlock, Skill } from './api';

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
</script>

<section class="screen-content">
  <h1>Timer</h1>
  <p>Start and monitor your current training session.</p>

  {#if !activePreset}
    <p>Select a preset on the Home screen to start a timer.</p>
  {:else}
    <div class="timer-panel">
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
          <button type="button" on:click={previousBlock} disabled={currentBlockIndex === 0 || sessionComplete}>
            Previous block
          </button>
          <button type="button" on:click={toggleTimer} disabled={!currentBlock || sessionComplete} class="primary">
            {isRunning ? 'Pause' : 'Start'}
          </button>
          <button type="button" on:click={() => advanceBlock(true)} disabled={sessionComplete || !currentBlock}>
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
      </div>
    </div>
  {/if}
</section>