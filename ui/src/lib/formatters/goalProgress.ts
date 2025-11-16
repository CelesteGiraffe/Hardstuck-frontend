import type { GoalProgress, TrainingGoal } from '../api';

const DAY_MS = 1000 * 60 * 60 * 24;

export function getGoalCompletionPercent(goal: TrainingGoal, progress: GoalProgress | null): number | null {
  if (goal.targetMinutes && goal.targetMinutes > 0) {
    const actualMinutes = progress?.actualMinutes ?? 0;
    return Math.min(100, Math.round((actualMinutes / goal.targetMinutes) * 100));
  }

  if (goal.targetSessions && goal.targetSessions > 0) {
    const actualSessions = progress?.actualSessions ?? 0;
    return Math.min(100, Math.round((actualSessions / goal.targetSessions) * 100));
  }

  return null;
}

export function getGoalRemainingMinutes(goal: TrainingGoal, progress: GoalProgress | null): number | null {
  if (!goal.targetMinutes || goal.targetMinutes <= 0) {
    return null;
  }
  const actualMinutes = progress?.actualMinutes ?? 0;
  return Math.max(0, goal.targetMinutes - actualMinutes);
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function getGoalDueDate(goal: TrainingGoal, progress: GoalProgress | null): Date | null {
  const explicitEnd = parseDate(progress?.periodTo);
  if (explicitEnd) {
    return explicitEnd;
  }

  const windowStart = parseDate(progress?.periodFrom) ?? new Date();
  if (goal.periodDays <= 0) {
    return null;
  }

  const dueDate = new Date(windowStart);
  dueDate.setDate(dueDate.getDate() + goal.periodDays);
  return dueDate;
}

export function formatGoalPercentLabel(percent: number | null): string {
  if (percent === null || Number.isNaN(percent)) {
    return '—';
  }
  return `${Math.min(100, Math.max(0, Math.round(percent)))}%`;
}

export function formatGoalEtaLabel(goal: TrainingGoal, progress: GoalProgress | null): string | null {
  const dueDate = getGoalDueDate(goal, progress);
  if (!dueDate) {
    return null;
  }

  const now = Date.now();
  const diff = dueDate.getTime() - now;
  const daysRemaining = Math.ceil(diff / DAY_MS);

  if (daysRemaining > 1) {
    return `${daysRemaining} days remaining`;
  }

  if (daysRemaining === 1) {
    return 'Due tomorrow';
  }

  if (daysRemaining === 0) {
    return 'Due today';
  }

  const overdueDays = Math.abs(daysRemaining);
  return `Overdue by ${overdueDays} day${overdueDays === 1 ? '' : 's'}`;
}
