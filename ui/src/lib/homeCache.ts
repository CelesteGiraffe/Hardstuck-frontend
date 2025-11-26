const CACHE_VERSION = 'dashboard-v1';

type CacheEntry<T> = {
  version: string;
  timestamp: string;
  data: T;
};

const CACHE_KEYS = {
  presets: '@hardstuck/dashboard-presets',
  skillSummary: '@hardstuck/dashboard-skill-summary',
  minutesToday: '@hardstuck/dashboard-minutes',
  latestMmr: '@hardstuck/dashboard-latest-mmr',
} as const;

const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

function getCacheKey(key: keyof typeof CACHE_KEYS): string {
  return CACHE_KEYS[key];
}

function readCache<T>(key: keyof typeof CACHE_KEYS): CacheEntry<T> | null {
  if (!isBrowser) {
    return null;
  }

  const stored = window.localStorage.getItem(getCacheKey(key));
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored) as CacheEntry<T>;
    if (parsed.version !== CACHE_VERSION) {
      window.localStorage.removeItem(getCacheKey(key));
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn('dashboard cache corrupted, clearing', key, error);
    window.localStorage.removeItem(getCacheKey(key));
    return null;
  }
}

function writeCache<T>(key: keyof typeof CACHE_KEYS, data: T): void {
  if (!isBrowser) {
    return;
  }

  const entry: CacheEntry<T> = {
    version: CACHE_VERSION,
    timestamp: new Date().toISOString(),
    data,
  };

  window.localStorage.setItem(getCacheKey(key), JSON.stringify(entry));
}

export { readCache, writeCache };
export type { CacheEntry };
export const dashboardCacheVersion = CACHE_VERSION;
export type DashboardCacheKey = keyof typeof CACHE_KEYS;
