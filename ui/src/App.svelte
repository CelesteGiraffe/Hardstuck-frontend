<script lang="ts">
  import HomeScreen from './lib/HomeScreen.svelte';
  import PresetsScreen from './lib/PresetsScreen.svelte';
  import TimerScreen from './lib/TimerScreen.svelte';
  import HistoryScreen from './lib/HistoryScreen.svelte';
  import SkillsScreen from './lib/SkillsScreen.svelte';

  import { apiOfflineMessage } from './lib/queries';
  import OfflineBanner from './lib/components/OfflineBanner.svelte';
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

  const projectTitle = 'RL Trainer 2';

  $: ActiveScreen = screens.find((screen) => screen.id === $activeScreenId)?.component ?? HomeScreen;
  $: activeScreenLabel = screens.find((screen) => screen.id === $activeScreenId)?.label ?? 'Home';
</script>

<div class="app-shell">
  <header class="app-header">
    <div class="header-heading">
      <div class="project-title-row">
        <h1 class="project-title">{projectTitle}</h1>
        <span class="status-chip">{activeScreenLabel}</span>
      </div>
      <p class="breadcrumb">
        <span>Dashboard</span>
        <span aria-hidden="true">/</span>
        <span>{activeScreenLabel}</span>
      </p>
    </div>
    <OfflineBanner message={$apiOfflineMessage} />
  </header>

  <nav class="navigation" aria-label="Primary">
    {#each screens as screen}
      <button
        class:selected={screen.id === $activeScreenId}
        on:click={() => navigateTo(screen.id)}
        type="button"
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
