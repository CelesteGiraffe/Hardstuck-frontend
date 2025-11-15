import { derived, writable } from 'svelte/store';
import type { Skill } from './api';
import { getSkills } from './api';

export type SkillsState = {
  skills: Skill[];
  loading: boolean;
  error: string | null;
};

const initialState: SkillsState = {
  skills: [],
  loading: false,
  error: null,
};

const skillState = writable<SkillsState>(initialState);
let loadPromise: Promise<void> | null = null;
let hasLoaded = false;

async function fetchSkills(force = false) {
  if (loadPromise && !force) {
    return loadPromise;
  }

  if (hasLoaded && !force) {
    return;
  }

  skillState.update((state) => ({ ...state, loading: true, error: null }));

  loadPromise = (async () => {
    try {
      const skills = await getSkills();
      skillState.set({ skills, loading: false, error: null });
      hasLoaded = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load skills';
      skillState.set({ skills: [], loading: false, error: message });
      hasLoaded = false;
      throw error;
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

const skillsStore = {
  subscribe: skillState.subscribe,
  refresh: () => fetchSkills(true),
  ensureLoaded: () => fetchSkills(),
};

export function resetSkillsCacheForTests() {
  skillState.set(initialState);
  hasLoaded = false;
  loadPromise = null;
}

const trimTag = (tag: string) => tag.trim();

const extractTags = (input: string | null | undefined) => {
  if (!input) {
    return [];
  }

  return input
    .split(',')
    .map(trimTag)
    .filter(Boolean);
};

export const skillTags = derived(skillState, (state) => {
  const tags = new Set<string>();
  for (const skill of state.skills) {
    for (const tag of extractTags(skill.tags)) {
      tags.add(tag);
    }
  }
  return Array.from(tags).sort();
});

export { skillsStore };