<script lang="ts">
  import HomeScreen from './lib/HomeScreen.svelte';
  import PresetsScreen from './lib/PresetsScreen.svelte';
  import TimerScreen from './lib/TimerScreen.svelte';
  import HistoryScreen from './lib/HistoryScreen.svelte';
  import SkillsScreen from './lib/SkillsScreen.svelte';

  import { apiOfflineMessage } from './lib/queries';
  import OfflineBanner from './lib/components/OfflineBanner.svelte';
  import { activeScreenId, navigateTo, clearSelectedPreset } from './lib/stores';
  import { setupChecklistState } from './lib/checklistState';
  import { pluginInstallUrl } from './lib/constants';

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

  let checklistOpen = false;
  let lastChecklistSeen = 0;

  $: ActiveScreen = screens.find((screen) => screen.id === $activeScreenId)?.component ?? HomeScreen;
  $: activeScreenLabel = screens.find((screen) => screen.id === $activeScreenId)?.label ?? 'Home';
  $: checklistSnapshot = $setupChecklistState;
  $: checklistHasUpdates = checklistSnapshot.updatedAt > lastChecklistSeen;
  $: if ($activeScreenId !== 'timer') {
    clearSelectedPreset();
  }
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
    <div class="nav-buttons">
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
    </div>
    <div class="nav-checklist">
      <button
        type="button"
        class="nav-checklist-trigger"
        class:glow={checklistHasUpdates}
        aria-expanded={checklistOpen}
        aria-controls="nav-checklist-overlay"
        aria-label={checklistHasUpdates ? 'Checklist has new updates' : 'Setup checklist updates'}
        on:click={() => {
          const nextOpen = !checklistOpen;
          checklistOpen = nextOpen;
          if (nextOpen) {
            lastChecklistSeen = checklistSnapshot.updatedAt;
          }
        }}
      >
        <span aria-hidden="true">i</span>
      </button>
      {#if checklistOpen}
        <div
          id="nav-checklist-overlay"
          class="nav-checklist-overlay"
          role="dialog"
          aria-live="polite"
        >
          {#if checklistSnapshot.items.length > 0 && checklistHasUpdates}
            <ul class="checklist-list">
              {#each checklistSnapshot.items as item}
                <li class:item-ready={item.ready} class:item-missing={!item.ready}>
                  <div>
                    <span>{item.label}</span>
                    <small>{item.helper}</small>
                  </div>
                  <strong>{item.value}</strong>
                </li>
              {/each}
            </ul>
          {:else if checklistSnapshot.items.length > 0}
            <p class="checklist-note">No checklist changes since your last visit.</p>
          {:else}
            <p class="checklist-note">Loading checklist status…</p>
          {/if}
          <p class="checklist-last">
            <span>Last MMR log:</span>
            {#if checklistSnapshot.lastMmrMeta}
              <strong>{checklistSnapshot.lastMmrMeta}</strong>
            {:else}
              <strong>Not recorded yet</strong>
            {/if}
          </p>
          <p class="checklist-cache">{checklistSnapshot.cacheNote}</p>
          <div class="checklist-actions">
            <a class="button-link" href={pluginInstallUrl} target="_blank" rel="noreferrer">
              Plugin installation guide
            </a>
          </div>
        </div>
      {/if}
    </div>
  </nav>

  <main class="screen-shell">
    <svelte:component this={ActiveScreen} />
  </main>
</div>
