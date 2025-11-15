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