import { writable } from 'svelte/store';
import { rankablePlaylists } from './rankThresholds';

const STORAGE_KEY = 'selectedProfilePlaylist';
const DEFAULT_PLAYLIST = rankablePlaylists[0]?.canonical ?? 'Ranked 1v1';

function isValidPlaylist(value?: string | null): value is string {
  return Boolean(value && rankablePlaylists.some((option) => option.canonical === value));
}

function readStoredPlaylist(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isValidPlaylist(stored)) {
      return stored;
    }
  } catch (error) {
    console.warn('Unable to read stored playlist');
  }
  return null;
}

const storedPlaylist = readStoredPlaylist();
const initialValue = isValidPlaylist(storedPlaylist) ? storedPlaylist : DEFAULT_PLAYLIST;

const internalStore = writable(initialValue);

function persist(value: string) {
  const normalized = isValidPlaylist(value) ? value : DEFAULT_PLAYLIST;
  internalStore.set(normalized);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, normalized);
    } catch (error) {
      console.warn('Unable to persist playlist selection', error);
    }
  }
}

export const profilePlaylistStore = {
  subscribe: internalStore.subscribe,
  set(value: string) {
    persist(value);
  },
  reset() {
    internalStore.set(DEFAULT_PLAYLIST);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch (error) {
        console.warn('Unable to clear stored playlist selection', error);
      }
    }
  },
};