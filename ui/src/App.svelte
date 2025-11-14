<script lang="ts">
  import HomeScreen from './lib/HomeScreen.svelte';
  import PresetsScreen from './lib/PresetsScreen.svelte';
  import TimerScreen from './lib/TimerScreen.svelte';
  import HistoryScreen from './lib/HistoryScreen.svelte';
  import SkillsScreen from './lib/SkillsScreen.svelte';

  import { activeScreenId, navigateTo } from './lib/stores';

  type Screen = {
    id: 'home' | 'presets' | 'timer' | 'history' | 'skills';
    label: string;
    component: typeof HomeScreen;
  };

  const screens: Screen[] = [
    { id: 'home', label: 'Home', component: HomeScreen },
    { id: 'presets', label: 'Presets', component: PresetsScreen },
    { id: 'timer', label: 'Timer', component: TimerScreen },
    { id: 'history', label: 'History', component: HistoryScreen },
    { id: 'skills', label: 'Skills', component: SkillsScreen },
  ];

  $: ActiveScreen = screens.find((screen) => screen.id === $activeScreenId)?.component ?? HomeScreen;
</script>

<div class="app-shell">
  <nav class="navigation">
    {#each screens as screen}
      <button
        class:selected={screen.id === $activeScreenId}
        on:click={() => navigateTo(screen.id)}
        aria-current={screen.id === $activeScreenId ? 'page' : undefined}
      >
        {screen.label}
      </button>
    {/each}
  </nav>

  <main class="screen-shell">
    <svelte:component this={ActiveScreen} />
  </main>
</div>
