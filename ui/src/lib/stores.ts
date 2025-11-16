import { writable } from 'svelte/store';
import type { Preset } from './api';

export const activeScreenId = writable<'home' | 'presetRunner' | 'skills' | 'presets' | 'history' | 'profile'>('home');

export function navigateTo(screenId: 'home' | 'presetRunner' | 'skills' | 'presets' | 'history' | 'profile') {
  activeScreenId.set(screenId);
}

export const selectedPreset = writable<Preset | null>(null);

export function launchPreset(preset: Preset) {
  selectedPreset.set(preset);
  navigateTo('presetRunner');
}

export function clearSelectedPreset() {
  selectedPreset.set(null);
}
