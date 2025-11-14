export type MmrRecord = {
  id: number;
  timestamp: string;
  playlist: string;
  mmr: number;
  gamesPlayedDiff: number;
  source: string;
};

export type Skill = {
  id: number;
  name: string;
  category: string | null;
  tags: string | null;
  notes: string | null;
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

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

function buildUrl(path: string) {
  return `${API_BASE.replace(/\/$/, '')}${path}`;
}

export async function healthCheck(): Promise<boolean> {
  try {
    const response = await fetch(buildUrl('/api/health'));
    return response.ok;
  } catch (error) {
    console.error('Health check failed', error);
    return false;
  }
}

export async function getMmrRecords(): Promise<MmrRecord[]> {
  const response = await fetch(buildUrl('/api/mmr'));
  if (!response.ok) {
    throw new Error('Unable to load MMR records');
  }

  const data = (await response.json()) as MmrRecord[];
  return data;
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

export async function createSkill(payload: { name: string; category?: string; notes?: string }): Promise<Skill> {
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