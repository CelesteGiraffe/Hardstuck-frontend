<script lang="ts">
  import type { GoalProgress, TrainingGoal } from '../api';
  import {
    formatGoalEtaLabel,
    formatGoalPercentLabel,
    getGoalCompletionPercent,
    getGoalDueDate,
    getGoalRemainingMinutes,
  } from '../formatters/goalProgress';

  export let goal: TrainingGoal;
  export let progress: GoalProgress | null = null;
  export let skillName: string | null = null;
  export let onEdit: () => void = () => {};
  export let onDelete: () => void = () => {};

  let completionPercent: number | null = null;
  let remainingMinutes: number | null = null;
  let percentLabel = '—';
  let etaLabel: string | null = null;
  let dueDate: Date | null = null;

  $: completionPercent = getGoalCompletionPercent(goal, progress);
  $: percentLabel = formatGoalPercentLabel(completionPercent);
  $: remainingMinutes = getGoalRemainingMinutes(goal, progress);
  $: etaLabel = formatGoalEtaLabel(goal, progress);
  $: dueDate = getGoalDueDate(goal, progress);
</script>

<article class="goal-card">
  <header class="goal-card-header">
    <div>
      <h3>{goal.label}</h3>
      <p class="goal-card-meta">
        {goal.goalType === 'skill' ? 'Skill goal' : 'Global goal'} • {goal.periodDays}d window
      </p>
      {#if skillName}
        <p class="goal-card-skill">{skillName}</p>
      {/if}
    </div>
    <div class="goal-card-actions">
      <button type="button" aria-label="Edit goal" on:click={onEdit}>Edit</button>
      <button type="button" aria-label="Delete goal" on:click={onDelete}>Remove</button>
    </div>
  </header>

  <div class="goal-targets">
    {#if goal.targetMinutes !== null && goal.targetMinutes !== undefined}
      <span class="goal-chip">Minute target: {goal.targetMinutes}m</span>
    {/if}
    {#if goal.targetSessions !== null && goal.targetSessions !== undefined}
      <span class="goal-chip">Session target: {goal.targetSessions}</span>
    {/if}
    <span class="goal-chip">Window: {goal.periodDays}d</span>
  </div>

  <div class="goal-progress">
    <div>
      <p>Trained</p>
      <strong>{progress?.actualMinutes ?? 0}m</strong>
      {#if progress?.actualSeconds}
        <small>{progress.actualSeconds}s</small>
      {/if}
    </div>
    <div>
      <p>Sessions</p>
      <strong>{progress?.actualSessions ?? 0}</strong>
    </div>
  </div>

  <div class="goal-progress-summary">
    <div
      class="goal-progress-bar"
      role="progressbar"
      aria-valuenow={completionPercent ?? 0}
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <span class="goal-progress-fill" style={`width: ${Math.max(0, completionPercent ?? 0)}%`}></span>
    </div>
    <div class="goal-progress-meta">
      <span class="goal-progress-percent">{percentLabel} complete</span>
      {#if remainingMinutes !== null}
        <span class="goal-progress-remaining">{remainingMinutes} min remaining</span>
      {/if}
      {#if etaLabel}
        <span class="goal-progress-due">{etaLabel}</span>
      {/if}
    </div>
    {#if dueDate}
      <p class="goal-progress-due-date">Due by {dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
    {/if}
  </div>
</article>

<style>
  .goal-card {
    background: var(--bg-panel-strong);
    border: 1px solid var(--border-soft);
    border-radius: var(--card-radius);
    padding: clamp(1rem, 1.8vw, 1.4rem);
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    box-shadow: var(--glow);
  }

  .goal-card-header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }

  .goal-card-header h3 {
    margin: 0 0 0.2rem;
    font-size: 1.1rem;
  }

  .goal-card-meta {
    margin: 0;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .goal-card-skill {
    margin: 0.1rem 0 0;
    font-size: 0.85rem;
    color: #d5ebff;
  }

  .goal-card-actions {
    display: flex;
    gap: 0.35rem;
    align-items: center;
  }

  .goal-card-actions button {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 999px;
    padding: 0.2rem 0.75rem;
    font-size: 0.75rem;
    color: inherit;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .goal-card-actions button:hover {
    background: rgba(99, 102, 241, 0.15);
  }

  .goal-targets {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .goal-chip {
    border-radius: 999px;
    padding: 0.2rem 0.8rem;
    font-size: 0.75rem;
    border: 1px solid var(--border-soft);
    background: rgba(248, 113, 113, 0.15);
  }

  .goal-progress {
    display: flex;
    gap: 1.25rem;
  }

  .goal-progress div {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .goal-progress strong {
    font-size: 1.3rem;
  }

  .goal-progress p {
    margin: 0;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .goal-progress small {
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  .goal-progress-summary {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .goal-progress-bar {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 999px;
    height: 6px;
    position: relative;
    overflow: hidden;
  }

  .goal-progress-fill {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, #22d3ee, #6366f1);
    border-radius: inherit;
    transition: width 0.3s ease;
  }

  .goal-progress-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .goal-progress-percent {
    font-weight: 600;
    color: inherit;
  }

  .goal-progress-remaining,
  .goal-progress-due {
    color: var(--text-muted);
  }

  .goal-progress-due-date {
    margin: 0;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  @media (max-width: 640px) {
    .goal-card {
      padding: 1rem;
    }

    .goal-progress {
      flex-direction: column;
    }
  }
</style>
