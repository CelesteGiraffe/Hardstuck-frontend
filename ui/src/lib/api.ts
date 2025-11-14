export type MmrRecord = {
  id: number;
  timestamp: string;
  playlist: string;
  mmr: number;
  gamesPlayedDiff: number;
  source: string;
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