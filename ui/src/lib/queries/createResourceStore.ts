import { writable } from 'svelte/store';

export type ResourceState<T> = {
  data: T;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  lastUpdated: string | null;
};

export type ResourceStore<T, Params> = {
  subscribe: (run: (value: ResourceState<T>) => void) => () => void;
  refresh: (params?: Params, options?: { force?: boolean }) => Promise<T>;
  reset: () => void;
  setData: (value: T, params?: Params) => void;
};

type RefreshOptions = {
  force?: boolean;
};

export type ResourceStoreOptions<T, Params> = {
  initialData: T;
  initialParams?: Params;
  refreshIntervalMs?: number;
  label?: string;
  autoFetch?: boolean;
};

export function getProcessEnv(): Record<string, string | undefined> | undefined {
  try {
    if (typeof process !== 'undefined') {
      return process.env as Record<string, string | undefined>;
    }
  } catch {
    // ignore errors when process is not available
  }

  return undefined;
}

export function resolveIsVitestEnvironment(
  meta: ImportMeta & { vitest?: boolean },
  env: ImportMetaEnv & Record<string, string | undefined>,
  processEnv?: Record<string, string | undefined> | undefined
): boolean {
  const resolvedProcessEnv = processEnv ?? getProcessEnv();
  return Boolean(meta.vitest || env.VITEST || resolvedProcessEnv?.VITEST);
}

export function createResourceStore<T, Params = undefined>(
  fetcher: (params?: Params) => Promise<T>,
  options: ResourceStoreOptions<T, Params>
): ResourceStore<T, Params> {
  function createInitialState(): ResourceState<T> {
    return {
      data: options.initialData,
      loading: false,
      refreshing: false,
      error: null,
      lastUpdated: null,
    };
  }

  const state = writable<ResourceState<T>>(createInitialState());
  let hasLoaded = false;
  let lastParams: Params | undefined = options.initialParams;
  let pendingPromise: Promise<T> | null = null;
  const label = options.label ?? 'resource';
  const meta = import.meta as ImportMeta & { vitest?: boolean };
  const env = import.meta.env as ImportMetaEnv & Record<string, string | undefined>;
  const isVitest = resolveIsVitestEnvironment(meta, env);

  const setState = (value: ResourceState<T>) => state.set(value);

  async function executeFetch(params: Params | undefined, force: boolean): Promise<T> {
    if (pendingPromise && !force) {
      return pendingPromise;
    }

    const isInitialLoad = !hasLoaded;
    state.update((current) => ({
      ...current,
      loading: isInitialLoad,
      refreshing: !isInitialLoad,
      error: null,
    }));

    const promise = (async () => {
      try {
        const result = await fetcher(params);
        setState({
          data: result,
          loading: false,
          refreshing: false,
          error: null,
          lastUpdated: new Date().toISOString(),
        });
        hasLoaded = true;
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : `Unable to load ${label}`;
        state.update((current) => ({
          ...current,
          loading: false,
          refreshing: false,
          error: message,
        }));
        throw error;
      } finally {
        pendingPromise = null;
      }
    })();

    pendingPromise = promise;
    return promise;
  }

  async function refresh(params?: Params, options?: RefreshOptions): Promise<T> {
    const nextParams = params ?? lastParams;
    lastParams = nextParams;
    return executeFetch(nextParams, options?.force ?? false);
  }

  function setData(value: T, params?: Params) {
    lastParams = params ?? lastParams;
    hasLoaded = true;
    setState({
      data: value,
      loading: false,
      refreshing: false,
      error: null,
      lastUpdated: new Date().toISOString(),
    });
  }

  function reset() {
    hasLoaded = false;
    pendingPromise = null;
    lastParams = options.initialParams;
    setState(createInitialState());
  }

  if (options.refreshIntervalMs && !isVitest) {
    setInterval(() => {
      void refresh(undefined, { force: true });
    }, options.refreshIntervalMs);
  }

  const shouldAutoFetch = options.autoFetch ?? true;
  if (shouldAutoFetch && !isVitest) {
    void refresh(undefined, { force: true });
  }

  return {
    subscribe: state.subscribe,
    refresh,
    reset,
    setData,
  };
}
