<script lang="ts">
  import { onMount } from 'svelte';
  import { profileStore } from './profileStore';
  import { useSkills } from './useSkills';
  import { mmrLogQuery } from './queries';
  import GoalProgressCard from './components/GoalProgressCard.svelte';
  import {
    rankablePlaylists,
    loadRankThresholds,
    findRankForPlaylist,
  } from './rankThresholds';
  import type {
    GoalProgress,
    MmrRecord,
    Skill,
    TrainingGoal,
    TrainingGoalPayload,
  } from './api';
  import type { PlaylistOption, PlaylistRankingTable, RankRange } from './rankThresholds';

  const settingsStore = profileStore.settings;
  const goalsStore = profileStore.goals;
  const progressStore = profileStore.progressMap;
  const skills = useSkills();
  const playlistOptions: PlaylistOption[] = rankablePlaylists;
  let selectedPlaylistKey: PlaylistOption['csvKey'] = playlistOptions[0]?.csvKey ?? '1v1';
  let manualPlaylistSelection = false;
  let initialSelectionApplied = false;
  let latestRecord: MmrRecord | null = null;
  let playlistRecords: MmrRecord[] = [];
  let rankThresholds: PlaylistRankingTable | null = null;
  let rankInfo: RankRange | null = null;
  let rankImageSrc = '/ranks/norank.png';
  let rankLoadError: string | null = null;

  type SettingsDraft = {
    name: string;
    avatarUrl: string;
    timezone: string;
    defaultWeeklyTargetMinutes: string;
  };

  const blankSettings: SettingsDraft = {
    name: '',
    avatarUrl: '',
    timezone: '',
    defaultWeeklyTargetMinutes: '0',
  };

  let settingsDraft: SettingsDraft = { ...blankSettings };
  let lastSettingsSnapshot = '';
  let settingsError: string | null = null;
  let settingsMessage: string | null = null;
  let isSavingSettings = false;

  $: if ($settingsStore) {
    const snapshot = JSON.stringify($settingsStore);
    if (snapshot !== lastSettingsSnapshot) {
      settingsDraft = {
        name: $settingsStore.name,
        avatarUrl: $settingsStore.avatarUrl,
        timezone: $settingsStore.timezone,
        defaultWeeklyTargetMinutes: String($settingsStore.defaultWeeklyTargetMinutes ?? 0),
      };
      lastSettingsSnapshot = snapshot;
    }
  }

  async function handleSettingsSubmit() {
    settingsError = null;
    settingsMessage = null;

    const name = settingsDraft.name.trim();
    if (!name) {
      settingsError = 'Please provide a display name.';
      return;
    }

    const timezone = settingsDraft.timezone.trim();
    if (!timezone) {
      settingsError = 'Timezone is required.';
      return;
    }

    const minutes = Number(settingsDraft.defaultWeeklyTargetMinutes);
    if (!Number.isFinite(minutes) || minutes < 0) {
      settingsError = 'Default minutes must be a non-negative number.';
      return;
    }

    isSavingSettings = true;
    try {
      await profileStore.updateSettings({
        name,
        avatarUrl: settingsDraft.avatarUrl.trim(),
        timezone,
        defaultWeeklyTargetMinutes: Math.floor(minutes),
      });
      settingsMessage = 'Settings saved.';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save settings';
      settingsError = message;
    } finally {
      isSavingSettings = false;
    }
  }

  type GoalFormState = {
    id?: number;
    label: string;
    goalType: 'global' | 'skill';
    skillId: string;
    targetMinutes: string;
    targetSessions: string;
    periodDays: string;
    notes: string;
  };

  const emptyGoalForm = (): GoalFormState => ({
    label: '',
    goalType: 'global',
    skillId: '',
    targetMinutes: '',
    targetSessions: '',
    periodDays: '7',
    notes: '',
  });

  let goalForm: GoalFormState = emptyGoalForm();
  let goalFormError: string | null = null;
  let goalActionError: string | null = null;
  let showGoalForm = false;
  let isSavingGoal = false;

  function openGoalForm(goal?: TrainingGoal) {
    goalFormError = null;
    goalActionError = null;
    goalForm = goal
      ? {
          id: goal.id,
          label: goal.label,
          goalType: goal.goalType,
          skillId: goal.skillId ? String(goal.skillId) : '',
          targetMinutes: goal.targetMinutes?.toString() ?? '',
          targetSessions: goal.targetSessions?.toString() ?? '',
          periodDays: String(goal.periodDays),
          notes: goal.notes ?? '',
        }
      : emptyGoalForm();
    showGoalForm = true;
  }

  async function closeGoalForm() {
    goalFormError = null;
    showGoalForm = false;
    goalForm = emptyGoalForm();
  }

  function handleGoalTypeChange(event: Event) {
    const select = event.currentTarget as HTMLSelectElement;
    const value = select.value as GoalFormState['goalType'];
    goalForm = {
      ...goalForm,
      goalType: value,
      skillId: value === 'skill' ? goalForm.skillId : '',
    };
  }

  function handleSkillChange(event: Event) {
    const select = event.currentTarget as HTMLSelectElement;
    goalForm = { ...goalForm, skillId: select.value };
  }

  async function handleGoalSubmit() {
    goalFormError = null;
    goalActionError = null;

    if (!goalForm.label.trim()) {
      goalFormError = 'Label is required for a goal.';
      return;
    }

    const periodDays = Number(goalForm.periodDays);
    if (!Number.isInteger(periodDays) || periodDays <= 0) {
      goalFormError = 'Period days must be a positive integer.';
      return;
    }

    if (goalForm.goalType === 'skill' && !goalForm.skillId) {
      goalFormError = 'Pick a skill for skill goals.';
      return;
    }

    const payload: TrainingGoalPayload = {
      id: goalForm.id,
      label: goalForm.label.trim(),
      goalType: goalForm.goalType,
      skillId: goalForm.goalType === 'skill' ? Number(goalForm.skillId) : null,
      targetMinutes: goalForm.targetMinutes ? Number(goalForm.targetMinutes) : null,
      targetSessions: goalForm.targetSessions ? Number(goalForm.targetSessions) : null,
      periodDays,
      notes: goalForm.notes.trim() || null,
    };

    isSavingGoal = true;
    try {
      await profileStore.saveGoal(payload);
      closeGoalForm();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save goal';
      goalFormError = message;
    } finally {
      isSavingGoal = false;
    }
  }

  async function removeGoal(goalId: number) {
    goalActionError = null;
    try {
      await profileStore.deleteGoal(goalId);
    } catch (error) {
      goalActionError = error instanceof Error ? error.message : 'Unable to delete goal';
    }
  }

  let skillList: Skill[] = [];
  $: skillList = $skills.skills;

  let groupedGoals = { global: [] as TrainingGoal[], skill: [] as TrainingGoal[] };
  $: groupedGoals = {
    global: $goalsStore.filter((goal) => goal.goalType === 'global'),
    skill: $goalsStore.filter((goal) => goal.goalType === 'skill'),
  };

  let progressSnapshot: Record<number, GoalProgress> = {};
  $: progressSnapshot = $progressStore;

  onMount(() => {
    loadRankThresholds()
      .then((table) => {
        rankThresholds = table;
      })
      .catch((error) => {
        rankLoadError = error instanceof Error ? error.message : 'Unable to load rank data';
      });
  });

  $: selectedPlaylist =
    playlistOptions.find((option) => option.csvKey === selectedPlaylistKey) ?? playlistOptions[0];
  $: {
    const filtered = $mmrLogQuery.data.filter((record) => record.playlist === selectedPlaylist.canonical);
    playlistRecords = filtered;
    latestRecord = filtered[filtered.length - 1] ?? null;
  }
  $: if (!manualPlaylistSelection && !initialSelectionApplied && $mmrLogQuery.data.length > 0) {
    const latestFromLog = $mmrLogQuery.data[$mmrLogQuery.data.length - 1];
    const matching = playlistOptions.find((option) => option.canonical === latestFromLog.playlist);
    if (matching) {
      selectedPlaylistKey = matching.csvKey;
    }
    initialSelectionApplied = true;
  }
  $: rankInfo =
    latestRecord && rankThresholds
      ? findRankForPlaylist(latestRecord.mmr, selectedPlaylist.csvKey, rankThresholds)
      : null;
  $: rankImageSrc = rankInfo ? `/ranks/${rankInfo.imageName}.png` : '/ranks/norank.png';

  function getSkillName(skillId: number | null) {
    if (!skillId) {
      return null;
    }
    const match = skillList.find((skill) => skill.id === skillId);
    return match?.name ?? `Skill #${skillId}`;
  }

  function handlePlaylistChange(event: Event) {
    const select = event.currentTarget as HTMLSelectElement;
    const value = select.value as PlaylistOption['csvKey'];
    selectedPlaylistKey = value;
    manualPlaylistSelection = true;
  }
</script>

<main class="screen-content profile-screen">
  <section class="glass-card profile-rank-card">
    <div class="profile-section-header">
      <div>
        <h2>Rank overview</h2>
        <p>Pick a playlist to highlight in your profile.</p>
      </div>
      <label class="rank-select" for="profile-playlist-select">
        <span>Playlist</span>
        <select
          id="profile-playlist-select"
          bind:value={selectedPlaylistKey}
          on:change={handlePlaylistChange}
        >
          {#each playlistOptions as option}
            <option value={option.csvKey}>{option.label}</option>
          {/each}
        </select>
      </label>
    </div>
    <div class="rank-summary">
      <div class="rank-image">
        <img
          src={rankImageSrc}
          alt={`Rank badge for ${rankInfo?.rankName ?? 'Unranked'}`}
          loading="lazy"
        />
      </div>
      <div class="rank-details">
        {#if latestRecord}
          <p class="rank-label">{rankInfo?.rankName ?? 'Unranked'}</p>
          <p class="rank-mmr">MMR: {latestRecord.mmr.toLocaleString()}</p>
          {#if rankInfo}
            <p class="rank-range">
              Range: {rankInfo.min.toLocaleString()} – {rankInfo.max.toLocaleString()}
            </p>
          {/if}
        {:else}
          <p class="rank-label">No MMR logs for this playlist yet.</p>
          <p class="muted-note">Log a session with the plugin to capture your rating.</p>
        {/if}
        {#if rankLoadError}
          <p class="form-feedback error" role="status">{rankLoadError}</p>
        {:else if !rankThresholds && latestRecord}
          <p class="muted-note">Loading rank data…</p>
        {/if}
      </div>
    </div>
  </section>
  <section class="glass-card profile-settings-card">
    <div class="profile-section-header">
      <div>
        <h2>Profile settings</h2>
        <p>Update your avatar, timezone, and weekly target minutes.</p>
      </div>
      <button type="button" class="ghost-button" on:click={() => profileStore.refresh()}>
        Refresh data
      </button>
    </div>
    <form class="profile-settings-form" on:submit|preventDefault={handleSettingsSubmit}>
      <label>
        <span>Display name</span>
        <input type="text" bind:value={settingsDraft.name} placeholder="Your training alias" />
      </label>
      <label>
        <span>Avatar URL</span>
        <input type="url" bind:value={settingsDraft.avatarUrl} placeholder="https://" />
      </label>
      <label>
        <span>Timezone</span>
        <input type="text" bind:value={settingsDraft.timezone} placeholder="America/New_York" />
      </label>
      <label>
        <span>Weekly target (minutes)</span>
        <input
          type="number"
          min="0"
          bind:value={settingsDraft.defaultWeeklyTargetMinutes}
          placeholder="0"
        />
      </label>
      <div class="form-actions">
        <button type="submit" class="primary-button" disabled={isSavingSettings}>
          {isSavingSettings ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </form>
    {#if settingsError}
      <p class="form-feedback error" role="alert" aria-live="assertive">{settingsError}</p>
    {:else if settingsMessage}
      <p class="form-feedback success" role="status">{settingsMessage}</p>
    {/if}
  </section>

  <section class="glass-card goal-section">
    <div class="profile-section-header">
      <div>
        <h2>Training goals</h2>
        <p>Track minutes and sessions for your priorities.</p>
      </div>
      <button type="button" class="primary-button" on:click={() => openGoalForm()}>
        Add goal
      </button>
    </div>
    {#if goalActionError}
      <p class="form-feedback error">{goalActionError}</p>
    {/if}
    {#if $goalsStore.length === 0}
      <p class="muted-note">Create a goal to start tracking.</p>
    {/if}
    {#each Object.entries(groupedGoals) as [type, list]}
      {#if list.length > 0}
        <div class="goal-group">
          <h3>{type === 'skill' ? 'Skill goals' : 'Global goals'}</h3>
          <div class="goal-grid">
            {#each list as goal}
              <GoalProgressCard
                {goal}
                progress={progressSnapshot[goal.id] ?? null}
                skillName={getSkillName(goal.skillId)}
                onEdit={() => openGoalForm(goal)}
                onDelete={() => removeGoal(goal.id)}
              />
            {/each}
          </div>
        </div>
      {/if}
    {/each}
  </section>

  {#if showGoalForm}
    <section class="glass-card goal-form">
      <div class="profile-section-header">
        <div>
          <h2>{goalForm.id ? 'Edit goal' : 'Create goal'}</h2>
          <p>Define the window, targets, and notes.</p>
        </div>
        <button type="button" class="ghost-button" on:click={closeGoalForm}>
          Close
        </button>
      </div>
      <form class="goal-form-grid" on:submit|preventDefault={handleGoalSubmit}>
        <label>
          <span>Label</span>
          <input type="text" bind:value={goalForm.label} placeholder="End-of-week review" />
        </label>
        <label for="goal-type">
          <span>Type</span>
          <select id="goal-type" value={goalForm.goalType} on:change={handleGoalTypeChange}>
            <option value="global">Global</option>
            <option value="skill">Skill</option>
          </select>
        </label>
        {#if goalForm.goalType === 'skill'}
          <label for="goal-skill">
            <span>Skill</span>
            <select id="goal-skill" value={goalForm.skillId} on:change={handleSkillChange}>
              <option value="">Select a skill</option>
              {#each skillList as skill}
                <option value={skill.id}>{skill.name}</option>
              {/each}
            </select>
          </label>
        {/if}
        <label>
          <span>Target minutes</span>
          <input type="number" min="0" bind:value={goalForm.targetMinutes} placeholder="0" />
        </label>
        <label>
          <span>Target sessions</span>
          <input type="number" min="0" bind:value={goalForm.targetSessions} placeholder="0" />
        </label>
        <label>
          <span>Period (days)</span>
          <input type="number" min="1" bind:value={goalForm.periodDays} placeholder="7" />
        </label>
        <label class="full-width">
          <span>Notes</span>
          <textarea rows="3" bind:value={goalForm.notes} placeholder="Add context or reminders"></textarea>
        </label>
        <div class="form-actions">
          <button type="button" class="ghost-button" on:click={closeGoalForm}>Cancel</button>
          <button type="submit" class="primary-button" disabled={isSavingGoal}>
            {isSavingGoal ? 'Saving…' : goalForm.id ? 'Update goal' : 'Save goal'}
          </button>
        </div>
      </form>
      {#if goalFormError}
        <p class="form-feedback error">{goalFormError}</p>
      {/if}
    </section>
  {/if}
</main>

<style>
  .profile-screen {
    display: flex;
    flex-direction: column;
    gap: clamp(1rem, 1.5vw, 1.75rem);
    width: min(1200px, 100%);
  }

  .profile-section-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }

  .profile-section-header h2 {
    margin: 0;
  }

  .profile-settings-form,
  .goal-form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 1rem;
    margin-top: 1rem;
  }

  .goal-section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .goal-group h3 {
    margin: 0;
  }

  .goal-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 1rem;
  }

  .profile-settings-form label,
  .goal-form-grid label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.85rem;
  }

  .full-width {
    grid-column: 1 / -1;
  }

  input,
  select,
  textarea {
    border-radius: 12px;
    border: 1px solid var(--border-soft);
    background: var(--input-background);
    color: inherit;
    padding: 0.6rem 0.9rem;
    font-size: 0.9rem;
    font-family: inherit;
  }

  textarea {
    resize: vertical;
  }

  .form-actions {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    justify-content: flex-end;
    grid-column: 1 / -1;
  }

  .primary-button,
  .ghost-button {
    border: 1px solid transparent;
    border-radius: 999px;
    padding: 0.45rem 1.25rem;
    font-weight: 600;
    cursor: pointer;
    background: var(--accent-strong);
    color: #fff;
    transition: transform 0.2s ease;
  }

  .ghost-button {
    background: transparent;
    border-color: rgba(255, 255, 255, 0.4);
  }

  .primary-button:hover,
  .ghost-button:hover {
    transform: translateY(-1px);
  }

  .form-feedback {
    margin: 0;
    padding-top: 0.2rem;
    font-size: 0.85rem;
  }

  .form-feedback.error {
    color: rgba(248, 113, 113, 0.9);
  }

  .form-feedback.success {
    color: rgba(34, 197, 94, 0.85);
  }

  .muted-note {
    color: var(--text-muted);
    margin: 0;
  }

  @media (max-width: 640px) {
    .profile-section-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .form-actions {
      justify-content: flex-start;
    }
  }

  .profile-rank-card {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .rank-select {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.85rem;
  }

  .rank-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: center;
  }

  .rank-select select {
    min-width: 200px;
  }

  .rank-image {
    width: 128px;
    height: 128px;
    border-radius: 18px;
    border: 1px solid var(--border-soft);
    background: rgba(255, 255, 255, 0.04);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.65rem;
  }

  .rank-image img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .rank-details {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .rank-label {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }

  .rank-mmr,
  .rank-range {
    margin: 0;
    color: var(--muted-text);
    font-size: 0.9rem;
  }

  @media (max-width: 640px) {
    .rank-summary {
      flex-direction: column;
      align-items: flex-start;
    }

    .rank-select select {
      width: 100%;
    }
  }
</style>
