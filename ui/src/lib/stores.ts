import { writable } from 'svelte/store';
import type { Preset } from './api';

export const activeScreenId = writable<'home' | 'presets' | 'timer' | 'history' | 'skills'>('home');

export function navigateTo(screenId: 'home' | 'presets' | 'timer' | 'history' | 'skills') {
  activeScreenId.set(screenId);
}

export const selectedPreset = writable<Preset | null>(null);
