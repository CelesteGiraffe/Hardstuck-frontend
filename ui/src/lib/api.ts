export type MmrRecord = {
  id: number;
  timestamp: string;
  playlist: string;
  mmr: number;
  gamesPlayedDiff: number;
  source: string;
};

export type MmrLogPayload = {
  timestamp: string;
  playlist: string;
  mmr: number;
  gamesPlayedDiff: number;
  source?: string | null;
};

export type Skill = {
  id: number;
  name: string;
  category: string | null;
  tags: string | null;
  notes: string | null;
};

export type SkillPayload = {
  id?: number;
  name: string;
  category?: string | null;
  tags?: string | null;
  notes?: string | null;
  favoriteCode?: string | null;
};

export type SessionBlock = {
  id: number;
  sessionId: number;
  type: string;
  skillIds: number[];
  plannedDuration: number;
  actualDuration: number;
  notes: string | null;
};

export type Session = {
  id: number;
  startedTime: string;
  finishedTime: string | null;
  source: string;
  presetId: number | null;
  notes: string | null;
  actualDuration: number;
  skillIds: number[];
  blocks: SessionBlock[];
};

export type SkillSummary = {
  skillId: number;
  name: string;
  minutes: number;
};

export type ProfileSettings = {
  id: number;
  name: string;
  avatarUrl: string;
  timezone: string;
  defaultWeeklyTargetMinutes: number;
};

export type TrainingGoal = {
  id: number;
  label: string;
  goalType: 'global' | 'skill';
  skillId: number | null;
  targetMinutes: number | null;
  targetSessions: number | null;
  periodDays: number;
  notes: string | null;
};

export type GoalProgress = {
  goalId: number;
  actualSeconds: number;
  actualMinutes: number;
  actualSessions: number;
  periodFrom: string | null;
  periodTo: string | null;
};

export type BakkesmodHistoryStatusFilters = {
  playlist: string | null;
  mmrFrom: string | null;
  mmrTo: string | null;
  sessionStart: string | null;
  sessionEnd: string | null;
};

export type BakkesmodHistoryStatus = {
  receivedAt: string;
  generatedAt: string;
  mmrEntries: number;
  trainingSessions: number;
  lastMmrTimestamp: string | null;
  lastTrainingTimestamp: string | null;
  mmrLimit: number;
  sessionLimit: number;
  filters: BakkesmodHistoryStatusFilters;
};

export type BakkesmodHistoryPayload = {
  mmrHistory: MmrRecord[];
  trainingHistory: Session[];
  status: BakkesmodHistoryStatus;
};

export type BakkesmodHistoryFilters = {
  mmrLimit?: number;
  sessionLimit?: number;
  playlist?: string;
  mmrFrom?: string;
  mmrTo?: string;
  sessionStart?: string;
  sessionEnd?: string;
};

export type PresetBlock = {
  id: number;
  presetId: number;
  orderIndex: number;
  skillId: number;
  type: string;
  durationSeconds: number;
  notes: string | null;
};

export type Preset = {
  id: number;
  name: string;
  blocks: PresetBlock[];
};

export type PresetBlockPayload = {
  id?: number;
  orderIndex: number;
  skillId: number;
  type: string;
  durationSeconds: number;
  notes?: string | null;
};

export type PresetPayload = {
  id?: number;
  name: string;
  blocks: PresetBlockPayload[];
};

export type BakkesFavorite = {
  name: string;
  code: string;
};

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

function buildUrl(path: string) {
  return `${API_BASE.replace(/\/$/, '')}${path}`;
}

export async function healthCheck(): Promise<boolean> {
  const response = await fetch(buildUrl('/api/health'));
  if (!response.ok) {
    throw new Error('Health check failed');
  }
  return true;
}

export async function getMmrRecords(filters: { playlist?: string; from?: string; to?: string } = {}): Promise<MmrRecord[]> {
  const params = new URLSearchParams();
  if (filters.playlist) params.set('playlist', filters.playlist);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);

  const path = `/api/mmr${params.toString() ? `?${params}` : ''}`;
  const response = await fetch(buildUrl(path));
  if (!response.ok) {
    throw new Error('Unable to load MMR records');
  }

  const data = (await response.json()) as MmrRecord[];
  return data;
}

export async function getBakkesmodHistory(filters: BakkesmodHistoryFilters = {}): Promise<BakkesmodHistoryPayload> {
  const params = new URLSearchParams();
  if (filters.mmrLimit !== undefined) params.set('mmrLimit', String(filters.mmrLimit));
  if (filters.sessionLimit !== undefined) params.set('sessionLimit', String(filters.sessionLimit));
  if (filters.playlist) params.set('playlist', filters.playlist);
  if (filters.mmrFrom) params.set('mmrFrom', filters.mmrFrom);
  if (filters.mmrTo) params.set('mmrTo', filters.mmrTo);
  if (filters.sessionStart) params.set('sessionStart', filters.sessionStart);
  if (filters.sessionEnd) params.set('sessionEnd', filters.sessionEnd);

  const path = `/api/bakkesmod/history${params.toString() ? `?${params}` : ''}`;
  const response = await fetch(buildUrl(path));

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error ?? 'Unable to load BakkesMod history');
  }

  return (await response.json()) as BakkesmodHistoryPayload;
}

export async function createMmrLog(payload: MmrLogPayload): Promise<void> {
  const response = await fetch(buildUrl('/api/mmr-log'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error ?? 'Unable to log MMR');
  }
}

export async function deleteMmrRecord(id: number): Promise<void> {
  const response = await fetch(buildUrl(`/api/mmr/${id}`), {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error ?? 'Unable to delete MMR record');
  }
}

export async function updateMmrRecord(id: number, payload: MmrLogPayload): Promise<MmrRecord> {
  const response = await fetch(buildUrl(`/api/mmr/${id}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error ?? 'Unable to update MMR record');
  }

  return (await response.json()) as MmrRecord;
}

export async function deleteMmrRecords(filters: { playlist?: string; from?: string; to?: string } = {}): Promise<{ deleted: number } | void> {
  const params = new URLSearchParams();
  if (filters.playlist) params.set('playlist', filters.playlist);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);

  const path = `/api/mmr${params.toString() ? `?${params}` : ''}`;
  const response = await fetch(buildUrl(path), { method: 'DELETE' });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error ?? 'Unable to delete MMR records');
  }

  // server returns { deleted } on success
  const data = await response.json().catch(() => null);
  return data ?? undefined;
}

export async function deleteAllMmrRecords(): Promise<{ deleted: number }> {
  const response = await fetch(buildUrl('/api/mmr/clear'), { method: 'DELETE' });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error ?? 'Unable to delete all MMR records');
  }

  return (await response.json()) as { deleted: number };
}

export async function getSkills(): Promise<Skill[]> {
  const response = await fetch(buildUrl('/api/skills'));
  if (!response.ok) {
    throw new Error('Unable to load skills');
  }

  return (await response.json()) as Skill[];
}

export async function getPresets(): Promise<Preset[]> {
  const response = await fetch(buildUrl('/api/presets'));
  if (!response.ok) {
    throw new Error('Unable to load presets');
  }

  return (await response.json()) as Preset[];
}

export async function savePreset(payload: PresetPayload): Promise<Preset> {
  const response = await fetch(buildUrl('/api/presets'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error ?? 'Unable to save preset');
  }

  return (await response.json()) as Preset;
}

export async function deletePreset(id: number): Promise<void> {
  const response = await fetch(buildUrl(`/api/presets/${id}`), {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error ?? 'Unable to delete preset');
  }
}

export type SessionBlockPayload = {
  type: string;
  skillIds: number[];
  plannedDuration: number;
  actualDuration: number;
  notes?: string | null;
};

export type SessionPayload = {
  startedTime: string;
  finishedTime: string | null;
  source: string;
  presetId: number | null;
  notes?: string | null;
  blocks: SessionBlockPayload[];
};

export async function createSession(payload: SessionPayload): Promise<Session> {
  const response = await fetch(buildUrl('/api/sessions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unable to save session' }));
    throw new Error(error.error ?? 'Unable to save session');
  }

  return (await response.json()) as Session;
}

export async function getSessions(filters: { start?: string; end?: string } = {}): Promise<Session[]> {
  const params = new URLSearchParams();
  if (filters.start) params.set('start', filters.start);
  if (filters.end) params.set('end', filters.end);
  const path = `/api/sessions${params.toString() ? `?${params}` : ''}`;
  const response = await fetch(buildUrl(path));
  if (!response.ok) {
    throw new Error('Unable to load sessions');
  }

  return (await response.json()) as Session[];
}

export async function getSkillSummary({ from, to }: { from?: string; to?: string } = {}): Promise<SkillSummary[]> {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const path = `/api/summary/skills${params.toString() ? `?${params}` : ''}`;
  const response = await fetch(buildUrl(path));

  if (!response.ok) {
    throw new Error('Unable to load skill summary');
  }

  return (await response.json()) as SkillSummary[];
}

export async function getBakkesFavorites(userId: string): Promise<BakkesFavorite[]> {
  const response = await fetch(buildUrl('/api/v1/bakkes/favorites'), {
    headers: { 'X-User-Id': userId },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error ?? 'Unable to load favorites');
  }

  return (await response.json()) as BakkesFavorite[];
}

async function postSkill(payload: SkillPayload): Promise<Skill> {
  const response = await fetch(buildUrl('/api/skills'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || 'Unable to create skill');
  }

  return (await response.json()) as Skill;
}

export async function createSkill(payload: SkillPayload): Promise<Skill> {
  return postSkill({ ...payload });
}

export async function updateSkill(payload: SkillPayload): Promise<Skill> {
  if (!payload.id) {
    throw new Error('skill id is required to update');
  }

  return postSkill(payload);
}

export async function deleteSkill(id: number): Promise<void> {
  const response = await fetch(buildUrl(`/api/skills/${id}`), {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || 'Unable to delete skill');
  }
}

export type ProfilePayload = {
  settings: ProfileSettings;
  goals: TrainingGoal[];
  progress: GoalProgress[];
};

export type ProfileSettingsPayload = {
  name: string;
  avatarUrl?: string;
  timezone: string;
  defaultWeeklyTargetMinutes: number;
};

export type TrainingGoalPayload = {
  id?: number;
  label: string;
  goalType: 'global' | 'skill';
  skillId?: number | null;
  targetMinutes?: number | null;
  targetSessions?: number | null;
  periodDays: number;
  notes?: string | null;
};

export async function getProfile(): Promise<ProfilePayload> {
  const response = await fetch(buildUrl('/api/profile'));

  if (!response.ok) {
    throw new Error('Unable to load profile');
  }

  return (await response.json()) as ProfilePayload;
}

export async function updateProfileSettings(payload: ProfileSettingsPayload): Promise<ProfileSettings> {
  const response = await fetch(buildUrl('/api/profile/settings'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || 'Unable to update profile settings');
  }

  return (await response.json()) as ProfileSettings;
}

export async function saveGoal(payload: TrainingGoalPayload): Promise<TrainingGoal> {
  const response = await fetch(buildUrl('/api/profile/goals'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || 'Unable to save goal');
  }

  return (await response.json()) as TrainingGoal;
}

export async function deleteGoal(id: number): Promise<void> {
  const response = await fetch(buildUrl(`/api/profile/goals/${id}`), {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || 'Unable to delete goal');
  }
}

export async function getGoalProgress(
  goalId: number,
  params?: { from?: string; to?: string }
): Promise<GoalProgress> {
  const searchParams = new URLSearchParams({ goalId: String(goalId) });
  if (params?.from) searchParams.set('from', params.from);
  if (params?.to) searchParams.set('to', params.to);

  const response = await fetch(buildUrl(`/api/profile/goals/progress?${searchParams}`));

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || 'Unable to load goal progress');
  }

  return (await response.json()) as GoalProgress;
}