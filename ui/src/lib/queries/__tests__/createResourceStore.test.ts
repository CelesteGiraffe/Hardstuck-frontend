import { get } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createResourceStore,
  getProcessEnv,
  resolveIsVitestEnvironment,
} from '../createResourceStore';

describe('createResourceStore', () => {
  it('loads data and tracks metadata', async () => {
    const fetcher = vi.fn().mockResolvedValue(['alpha']);
    const store = createResourceStore(fetcher, {
      initialData: [],
      label: 'test',
    });

    await store.refresh();

    const state = get(store);
    expect(state.data).toEqual(['alpha']);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.lastUpdated).toBeTruthy();
    expect(fetcher).toHaveBeenCalled();
  });

  it('captures fetch errors', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('boom'));
    const store = createResourceStore(fetcher, {
      initialData: [],
      label: 'err',
    });

    await expect(store.refresh()).rejects.toThrow('boom');

    const state = get(store);
    expect(state.error).toBe('boom');
    expect(state.loading).toBe(false);
    expect(state.data).toEqual([]);
  });

  describe('process detection helpers', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('returns undefined when reading process.env throws', () => {
      vi.stubGlobal('process', {
        get env() {
          throw new Error('unable to read env');
        },
      });

      expect(getProcessEnv()).toBeUndefined();
    });

    it('allows overriding the resolved env to keep Vitest detection working', () => {
      const meta = { vitest: false } as ImportMeta & { vitest?: boolean };
      const env = {} as ImportMetaEnv & Record<string, string | undefined>;

      expect(resolveIsVitestEnvironment(meta, env, { VITEST: '1' })).toBe(true);
    });
  });

});
