import { derived } from 'svelte/store';
import type { Skill } from './api';
import { skillsQuery } from './queries';

export type SkillLookup = Record<number, Skill>;

export type SkillsState = {
  skills: Skill[];
  loading: boolean;
  error: string | null;
  lookup: SkillLookup;
};

const buildLookup = (skills: Skill[]): SkillLookup =>
  skills.reduce<SkillLookup>((acc, skill) => {
    acc[skill.id] = skill;
    return acc;
  }, {});

const skillsState = derived(skillsQuery, (state) => ({
  skills: state.data,
  loading: state.loading,
  error: state.error,
  lookup: buildLookup(state.data),
}));

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

export const skillTags = derived(skillsQuery, (state) => {
  const tags = new Set<string>();
  for (const skill of state.data) {
    for (const tag of extractTags(skill.tags)) {
      tags.add(tag);
    }
  }
  return Array.from(tags).sort();
});

export const skillLookup = derived(skillsState, (state) => state.lookup);

export const skillsStore = {
  subscribe: skillsState.subscribe,
  refresh: () => skillsQuery.refresh(),
  ensureLoaded: () => skillsQuery.refresh(),
  reset: () => skillsQuery.reset(),
};

export function resetSkillsCacheForTests() {
  skillsStore.reset();
}