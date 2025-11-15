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

export const setupChecklistState = writable<ChecklistSnapshot>(initialState);

export function pushChecklistSnapshot(snapshot: Omit<ChecklistSnapshot, 'updatedAt'>) {
  setupChecklistState.update((previous) => ({
    ...previous,
    ...snapshot,
    updatedAt: Date.now(),
  }));
}
