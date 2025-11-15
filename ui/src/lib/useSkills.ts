import type { SkillsState } from './skillsStore';
import { skillsStore, resetSkillsCacheForTests } from './skillsStore';

export function useSkills(options?: { autoLoad?: boolean }) {
  if (options?.autoLoad ?? true) {
    skillsStore.ensureLoaded();
  }
  return skillsStore as typeof skillsStore & {
    subscribe: (run: (value: SkillsState) => void) => () => void;
  };
}

export { resetSkillsCacheForTests };
