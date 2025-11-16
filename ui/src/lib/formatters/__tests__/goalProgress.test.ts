import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoalProgress, TrainingGoal } from '../../api';
import {
  formatGoalEtaLabel,
  formatGoalPercentLabel,
  getGoalCompletionPercent,
  getGoalDueDate,
  getGoalRemainingMinutes,
} from '../goalProgress';

describe('goal progress formatters', () => {
  const fixedNow = new Date('2025-11-15T00:00:00Z').getTime();

  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calculates percent and remaining minutes for minute targets', () => {
    const goal: TrainingGoal = {
      id: 1,
      label: 'Cardio focus',
      goalType: 'global',
      skillId: null,
      targetMinutes: 120,
      targetSessions: null,
      periodDays: 7,
      notes: null,
    };
    const progress: GoalProgress = {
      goalId: 1,
      actualSeconds: 3600,
      actualMinutes: 60,
      actualSessions: 1,
      periodFrom: '2025-11-08T00:00:00Z',
      periodTo: null,
    };

    expect(getGoalCompletionPercent(goal, progress)).toBe(50);
    expect(getGoalRemainingMinutes(goal, progress)).toBe(60);
    expect(formatGoalPercentLabel(50)).toBe('50%');
  });

  it('uses session targets when minute targets are missing', () => {
    const goal: TrainingGoal = {
      id: 2,
      label: 'Skill reps',
      goalType: 'skill',
      skillId: 1,
      targetMinutes: null,
      targetSessions: 4,
      periodDays: 7,
      notes: null,
    };
    const progress: GoalProgress = {
      goalId: 2,
      actualSeconds: 0,
      actualMinutes: 0,
      actualSessions: 2,
      periodFrom: '2025-11-08T00:00:00Z',
      periodTo: null,
    };

    expect(getGoalCompletionPercent(goal, progress)).toBe(50);
    expect(getGoalRemainingMinutes(goal, progress)).toBe(null);
    expect(formatGoalPercentLabel(null)).toBe('—');
  });

  it('calculates due label from period windows and handles overdue periods', () => {
    const goal: TrainingGoal = {
      id: 3,
      label: 'Tempo mastery',
      goalType: 'skill',
      skillId: 2,
      targetMinutes: 90,
      targetSessions: null,
      periodDays: 5,
      notes: null,
    };
    const progress: GoalProgress = {
      goalId: 3,
      actualSeconds: 0,
      actualMinutes: 0,
      actualSessions: 0,
      periodFrom: '2025-11-09T00:00:00Z',
      periodTo: null,
    };

    const dueDate = getGoalDueDate(goal, progress);
    expect(dueDate?.toISOString().startsWith('2025-11-14')).toBeTruthy();
    expect(formatGoalEtaLabel(goal, progress)).toBe('Overdue by 1 day');

    // Without progress window, derive due date from today
    const goalWithoutProgress: TrainingGoal = { ...goal, id: 4, periodDays: 3 };
    const etaWithoutProgress = formatGoalEtaLabel(goalWithoutProgress, null);
    expect(etaWithoutProgress).toMatch(/days? remaining/);
  });
});
