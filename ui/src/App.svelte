<script lang="ts">
  import { onMount } from 'svelte';
  import HomeScreen from './lib/HomeScreen.svelte';
  import PresetsScreen from './lib/PresetsScreen.svelte';
  import TimerScreen from './lib/TimerScreen.svelte';
  import HistoryScreen from './lib/HistoryScreen.svelte';
  import SkillsScreen from './lib/SkillsScreen.svelte';
  import ProfileScreen from './lib/ProfileScreen.svelte';

  import type { MmrRecord } from './lib/api';
  import { apiOfflineMessage, mmrLogQuery } from './lib/queries';
  import OfflineBanner from './lib/components/OfflineBanner.svelte';
  import { activeScreenId, navigateTo, clearSelectedPreset } from './lib/stores';
  import { setupChecklistState } from './lib/checklistState';
  import { pluginInstallUrl } from './lib/constants';
  import { profileStore } from './lib/profileStore';
  import { profilePlaylistStore } from './lib/profilePlaylistStore';
  import { formatPlaylistDisplay } from './lib/playlistDisplay';
  import {
    rankablePlaylists,
    loadRankThresholds,
    findRankForPlaylist,
  } from './lib/rankThresholds';
  import type { PlaylistOption, PlaylistRankingTable, RankRange } from './lib/rankThresholds';

  type Screen = {
    id: 'home' | 'presetRunner' | 'skills' | 'presets' | 'history' | 'profile';
    label: string;
    component: typeof HomeScreen;
  };

  const screens: Screen[] = [
    { id: 'home', label: 'Home', component: HomeScreen },
    { id: 'presetRunner', label: 'Preset Runner', component: TimerScreen },
    { id: 'skills', label: 'Skills', component: SkillsScreen },
    { id: 'presets', label: 'Presets', component: PresetsScreen },
    { id: 'history', label: 'History', component: HistoryScreen },
    { id: 'profile', label: 'Profile', component: ProfileScreen },
  ];

  const projectTitle = 'RL Trainer 2';

  let checklistOpen = false;
  let lastChecklistSeen = 0;

  $: ActiveScreen = screens.find((screen) => screen.id === $activeScreenId)?.component ?? HomeScreen;
  $: activeScreenLabel = screens.find((screen) => screen.id === $activeScreenId)?.label ?? 'Home';
  $: checklistSnapshot = $setupChecklistState;
  $: checklistHasUpdates = checklistSnapshot.updatedAt > lastChecklistSeen;
  $: if ($activeScreenId !== 'presetRunner') {
    clearSelectedPreset();
  }

  const profileSettingsStore = profileStore.settings;
  let profileDisplayName = 'Trainer';
  let profileAvatarUrl = '/default.png';
  const defaultPlaylistOption: PlaylistOption =
    rankablePlaylists[0] ?? { label: 'Ranked 1v1', canonical: 'Ranked 1v1', csvKey: '1v1' };
  let rankThresholds: PlaylistRankingTable | null = null;
  let rankInfo: RankRange | null = null;
  let selectedPlaylistCanonical = defaultPlaylistOption.canonical;
  let selectedPlaylistOption = defaultPlaylistOption;
  let lastSelectedRecord: MmrRecord | null = null;
  let rankLabel = 'Rank pending';
  let rankImageSrc = '/ranks/norank.png';

  const AUDIO_STORAGE_KEY = 'timer-audio-cues';
  let audioEnabled = true;

  onMount(() => {
    loadRankThresholds().then((table) => {
      rankThresholds = table;
    });
    loadAudioPreference();
  });

  function loadAudioPreference() {
    if (typeof localStorage === 'undefined') return;
    const stored = localStorage.getItem(AUDIO_STORAGE_KEY);
    audioEnabled = stored === null ? true : stored === 'true';
  }

  function setAudioPreference(value: boolean) {
    audioEnabled = value;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(AUDIO_STORAGE_KEY, String(value));
    }
  }

  $: profileDisplayName = $profileSettingsStore.name?.trim() || 'Trainer';
  $: profileAvatarUrl = $profileSettingsStore.avatarUrl?.trim() || '/default.png';
  $: selectedPlaylistCanonical = $profilePlaylistStore ?? defaultPlaylistOption.canonical;
  $: selectedPlaylistOption =
    rankablePlaylists.find((option) => option.canonical === selectedPlaylistCanonical) ??
    defaultPlaylistOption;
  $: {
    const filtered = $mmrLogQuery.data.filter((record) => record.playlist === selectedPlaylistOption.canonical);
    lastSelectedRecord = filtered[filtered.length - 1] ?? null;
  }
  $: rankInfo =
    lastSelectedRecord && rankThresholds
      ? findRankForPlaylist(lastSelectedRecord.mmr, selectedPlaylistOption.csvKey, rankThresholds)
      : null;
  $: rankImageSrc = rankInfo ? `/ranks/${rankInfo.imageName}.png` : '/ranks/norank.png';
  $: formattedPlaylist = formatPlaylistDisplay(selectedPlaylistOption.canonical);
  $: rankLabel = lastSelectedRecord
    ? rankInfo
      ? `${formattedPlaylist} · ${lastSelectedRecord.mmr ?? '—'} MMR`
      : `${formattedPlaylist} · Unranked`
    : `${formattedPlaylist} · Rank pending`;
</script>

<div class="app-shell">
  <header class="app-header">
    <div class="header-top">
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
      <div class="header-profile">
        <div class="profile-meta">
          <p class="profile-name">Hey {profileDisplayName}</p>
          <div class="rank-row">
            <img class="rank-icon" src={rankImageSrc} alt={`Rank badge: ${rankLabel}`} loading="lazy" />
            <span>{rankLabel}</span>
          </div>
        </div>
        <a
          class="profile-link"
          href="/profile"
          aria-label="Go to profile"
          on:click|preventDefault={() => navigateTo('profile')}
        >
          <img class="profile-avatar" src={profileAvatarUrl} alt={`Avatar for ${profileDisplayName}`} loading="lazy" />
        </a>
      </div>
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
            <button
              type="button"
              class="icon-button"
              on:click={() => setAudioPreference(!audioEnabled)}
              aria-label={audioEnabled ? 'Mute audio cues' : 'Unmute audio cues'}
            >
              <i class="fas {audioEnabled ? 'fa-volume-up' : 'fa-volume-mute'}" aria-hidden="true"></i>
              <span class="sr-only">{audioEnabled ? 'Mute' : 'Unmute'} audio cues</span>
            </button>
          </div>
        </div>
      {/if}
    </div>
  </nav>

  <main class="screen-shell">
    {#if $activeScreenId === 'presetRunner'}
      <TimerScreen {audioEnabled} />
    {:else}
      <svelte:component this={ActiveScreen} />
    {/if}
  </main>
</div>

<style>
  .header-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    width: 100%;
  }

  .header-heading {
    flex: 1;
  }

  .header-profile {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    border-radius: var(--card-radius);
    background: rgba(255, 255, 255, 0.03);
  }

  .profile-link {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    display: inline-flex;
    overflow: hidden;
  }

  .profile-avatar {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
  }

  .profile-meta {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    flex: 1;
  }

  .profile-name {
    margin: 0;
    font-size: 0.8rem;
  }

  .rank-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .rank-icon {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    object-fit: cover;
  }

  @media (max-width: 720px) {
    .header-top {
      flex-direction: column;
      align-items: flex-start;
    }

    .header-profile {
      width: 100%;
      justify-content: flex-start;
    }
  }
</style>
