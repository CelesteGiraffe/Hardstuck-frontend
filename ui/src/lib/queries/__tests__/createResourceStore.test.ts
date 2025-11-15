import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import { createResourceStore } from '../createResourceStore';

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
});
