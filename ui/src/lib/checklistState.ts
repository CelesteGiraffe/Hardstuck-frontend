import { writable } from 'svelte/store';

export type ChecklistItem = {
  label: string;
  ready: boolean;
  value: string;
  helper: string;
};

export type ChecklistSnapshot = {
  items: ChecklistItem[];
  lastMmrMeta: string | null;
  cacheNote: string;
  updatedAt: number;
};

const initialState: ChecklistSnapshot = {
  items: [],
  lastMmrMeta: null,
  cacheNote: 'Loading checklist…',
  updatedAt: 0,
};

const snapshotEquals = (a: ChecklistSnapshot, b: Omit<ChecklistSnapshot, 'updatedAt'>) => {
  if (a.items.length !== b.items.length) {
    return false;
  }

  for (let i = 0; i < a.items.length; i += 1) {
    const prev = a.items[i];
    const next = b.items[i];
    if (
      prev.label !== next.label ||
      prev.ready !== next.ready ||
      prev.value !== next.value ||
      prev.helper !== next.helper
    ) {
      return false;
    }
  }

  if (a.lastMmrMeta !== b.lastMmrMeta) {
    return false;
  }

  if (a.cacheNote !== b.cacheNote) {
    return false;
  }

  return true;
};

export const setupChecklistState = writable<ChecklistSnapshot>(initialState);

export function pushChecklistSnapshot(snapshot: Omit<ChecklistSnapshot, 'updatedAt'>) {
  setupChecklistState.update((previous) => {
    if (snapshotEquals(previous, snapshot)) {
      return previous;
    }

    const next = {
      ...snapshot,
      updatedAt: Date.now(),
    };

    return next;
  });
}
