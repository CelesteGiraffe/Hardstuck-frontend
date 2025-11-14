<script lang="ts">
  import { onMount } from 'svelte';
  import {
    healthCheck,
    getPresets,
    getSessions,
    getSkills,
    getSkillSummary,
    getMmrRecords,
    createSession,
  } from './api';
  import type { Preset, Skill, Session, SkillSummary, MmrRecord } from './api';
  import { navigateTo, selectedPreset } from './stores';

  let apiHealthy: boolean | null = null;

  let presets: Preset[] = [];
  let loadingPresets = false;
  let presetError: string | null = null;

  let skills: Skill[] = [];
  let skillsLoading = false;
  let skillsError: string | null = null;
  let quickSkillId: number | null = null;
  let quickMinutes = '10';
  let quickSubmitting = false;
  let quickSuccess: string | null = null;
  let quickError: string | null = null;

  let sessions: Session[] = [];
  let loadingSessions = false;
  let sessionError: string | null = null;
  let totalMinutesToday = 0;

  let skillSummary: SkillSummary[] = [];
  let summaryError: string | null = null;
  let topSkills: SkillSummary[] = [];

  let latestMmr: MmrRecord[] = [];
  let mmrError: string | null = null;

  onMount(async () => {
    apiHealthy = await healthCheck();
    await Promise.all([loadPresets(), loadSkills()]);
    await Promise.all([loadSessions(), loadSkillSummary(), loadLatestMmr()]);
  });

  async function loadPresets() {
    loadingPresets = true;
    presetError = null;

    try {
      presets = await getPresets();
    } catch (error) {
      console.error('Failed to load presets', error);
      presetError = 'Unable to load presets';
    } finally {
      loadingPresets = false;
    }
  }

  async function loadSkills() {
    skillsLoading = true;
    skillsError = null;

    try {
      skills = await getSkills();
      if (skills.length && quickSkillId === null) {
        quickSkillId = skills[0].id;
      }
    } catch (error) {
      console.error('Failed to load skills', error);
      skillsError = 'Unable to load skills';
    } finally {
      skillsLoading = false;
    }
  }

  async function loadSessions() {
    loadingSessions = true;
    sessionError = null;

    try {
      sessions = await getSessions();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(todayStart);
      todayEnd.setHours(23, 59, 59, 999);

      const totalSeconds = sessions.reduce((sum, session) => {
        const started = new Date(session.startedTime);
        if (started >= todayStart && started <= todayEnd) {
          const blocksSeconds = session.blocks.reduce((blockSum, block) => blockSum + Math.max(0, block.actualDuration), 0);
          return sum + blocksSeconds;
        }
        return sum;
      }, 0);

      totalMinutesToday = Math.round(totalSeconds / 60);
    } catch (error) {
      console.error('Failed to load sessions', error);
      sessionError = 'Unable to load sessions';
    } finally {
      loadingSessions = false;
    }
  }

  async function loadSkillSummary() {
    summaryError = null;

    const to = new Date();
    const from = new Date(to);
    from.setDate(to.getDate() - 7);

    try {
      skillSummary = await getSkillSummary({ from: from.toISOString(), to: to.toISOString() });
      topSkills = skillSummary.slice(0, 3);
    } catch (error) {
      console.error('Failed to load weekly summary', error);
      summaryError = 'Unable to load weekly summary';
    }
  }

  async function loadLatestMmr() {
    mmrError = null;

    try {
      const records = await getMmrRecords();
      const latest = new Map<string, MmrRecord>();

      for (const record of records) {
        const current = latest.get(record.playlist);
        if (!current || new Date(record.timestamp).getTime() > new Date(current.timestamp).getTime()) {
          latest.set(record.playlist, record);
        }
      }

      latestMmr = Array.from(latest.values()).sort((a, b) => a.playlist.localeCompare(b.playlist));
    } catch (error) {
      console.error('Failed to load MMR records', error);
      mmrError = 'Unable to load MMR data';
    }
  }

  function beginPreset(preset: Preset) {
    selectedPreset.set(preset);
    navigateTo('timer');
  }

  async function submitQuickTimer(event: Event) {
    event.preventDefault();
    quickError = null;
    quickSuccess = null;

    if (!quickSkillId) {
      quickError = 'Select a skill to track';
      return;
    }

    const minutes = Number(quickMinutes);
    if (Number.isNaN(minutes) || minutes <= 0) {
      quickError = 'Duration must be greater than 0';
      return;
    }

    quickSubmitting = true;

    try {
      await createSession({
        startedTime: new Date().toISOString(),
        finishedTime: new Date().toISOString(),
        source: 'quick',
        presetId: null,
        blocks: [
          {
            type: 'quick',
            skillIds: [quickSkillId],
            plannedDuration: minutes * 60,
            actualDuration: minutes * 60,
          },
        ],
      });

      const skillName = skills.find((skill) => skill.id === quickSkillId)?.name ?? 'skill';
      quickSuccess = `Logged ${minutes} min for ${skillName}`;
      quickMinutes = '10';

      await Promise.all([loadSessions(), loadSkillSummary()]);
    } catch (error) {
      quickError = error instanceof Error ? error.message : 'Unable to log quick block';
    } finally {
      quickSubmitting = false;
    }
  }
</script>

<section class="screen-content">
  <header class="home-header">
    <div>
      <h1>Home</h1>
      <p>Welcome to the Rocket League training journal.</p>
    </div>
    <p class="health-status">
      API status:
      {#if apiHealthy === null}
        <span class="badge pending">checking...</span>
      {:else if apiHealthy}
        <span class="badge healthy">online</span>
      {:else}
        <span class="badge offline">offline</span>
      {/if}
    </p>
  </header>

  <div class="dashboard-grid">
    <article class="dashboard-card">
      <h2>Total minutes today</h2>
      <p class="dashboard-value">{totalMinutesToday}</p>
      <p class="dashboard-subtitle">minutes trained</p>
      {#if loadingSessions}
        <p class="form-note">Loading sessions…</p>
      {:else if sessionError}
        <p class="form-error">{sessionError}</p>
      {/if}
    </article>

    <article class="dashboard-card">
      <h2>Top skills (7d)</h2>
      {#if summaryError}
        <p class="form-error">{summaryError}</p>
      {:else if topSkills.length === 0}
        <p class="form-note">No focused training yet.</p>
      {:else}
        <ul class="dashboard-list">
          {#each topSkills as skill}
            <li>
              <span>{skill.name}</span>
              <strong>{skill.minutes} min</strong>
            </li>
          {/each}
        </ul>
      {/if}
    </article>

    <article class="dashboard-card">
      <h2>Latest MMR</h2>
      {#if mmrError}
        <p class="form-error">{mmrError}</p>
      {:else if latestMmr.length === 0}
        <p class="form-note">Awaiting BakkesMod data.</p>
      {:else}
        <ul class="dashboard-list">
          {#each latestMmr as record}
            <li>
              <span>{record.playlist}</span>
              <strong>{record.mmr}</strong>
            </li>
          {/each}
        </ul>
      {/if}
    </article>
  </div>

  <section class="quick-timer">
    <div class="section-header">
      <h2>Quick timer</h2>
      <p>Log a single block tied to a skill.</p>
    </div>
    <form class="quick-form" on:submit|preventDefault={submitQuickTimer}>
      <label>
        Skill
        {#if skillsLoading}
          <select disabled>
            <option>Loading skills…</option>
          </select>
        {:else if skills.length === 0}
          <select disabled>
            <option>No skills yet</option>
          </select>
        {:else}
          <select value={quickSkillId ?? ''} on:change={(event) => (quickSkillId = Number((event.currentTarget as HTMLSelectElement).value))}>
            {#each skills as skill}
              <option value={skill.id}>{skill.name}</option>
            {/each}
          </select>
        {/if}
      </label>
      <label>
        Minutes
        <input
          type="number"
          min="1"
          step="1"
          value={quickMinutes}
          on:input={(event) => (quickMinutes = (event.currentTarget as HTMLInputElement).value)}
          disabled={quickSubmitting}
        />
      </label>
      <button type="submit" class="btn-primary" disabled={quickSubmitting || skillsLoading || skills.length === 0}>
        {quickSubmitting ? 'Logging…' : 'Log quick block'}
      </button>
    </form>
    {#if quickError}
      <p class="form-error quick-feedback">{quickError}</p>
    {:else if quickSuccess}
      <p class="form-success quick-feedback">{quickSuccess}</p>
    {/if}
  </section>

  <section class="preset-area">
    <div class="section-header">
      <div>
        <h2>Start preset</h2>
        <p>Run a structured session and collect blocks.</p>
      </div>
    </div>

    {#if loadingPresets}
      <p>Loading presets…</p>
    {:else if presetError}
      <p class="form-error">{presetError}</p>
    {:else if presets.length === 0}
      <p>No presets yet. Create one on the Presets screen to get started.</p>
    {:else}
      <div class="preset-grid">
        {#each presets as preset}
          <article class="preset-card">
            <div class="preset-info">
              <span class="preset-name">{preset.name}</span>
              <small class="preset-blocks">{preset.blocks.length} block{preset.blocks.length === 1 ? '' : 's'}</small>
            </div>
            <button type="button" on:click={() => beginPreset(preset)}>Start session</button>
          </article>
        {/each}
      </div>
    {/if}
  </section>
</section>

<style>
  .home-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .dashboard-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .dashboard-card {
    background: var(--card-background, #fff);
    border-radius: 14px;
    padding: 1rem 1.25rem;
    box-shadow: 0 12px 30px -20px rgba(0, 0, 0, 0.35);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .dashboard-value {
    font-size: 2.5rem;
    font-weight: 600;
    margin: 0;
  }

  .dashboard-subtitle {
    margin: 0;
    color: var(--muted-text, #7a7a7a);
  }

  .dashboard-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .dashboard-list li {
    display: flex;
    justify-content: space-between;
    font-size: 0.95rem;
  }

  .quick-timer {
    background: var(--card-background, #fff);
    border-radius: 14px;
    padding: 1.25rem;
    margin-bottom: 1.5rem;
    box-shadow: 0 12px 30px -20px rgba(0, 0, 0, 0.35);
  }

  .section-header h2 {
    margin: 0;
  }

  .section-header p {
    margin-top: 0.25rem;
    color: var(--muted-text, #7a7a7a);
  }

  .quick-form {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 0.85rem;
    margin-top: 1rem;
    align-items: flex-end;
  }

  .quick-form label {
    display: flex;
    flex-direction: column;
    font-size: 0.85rem;
    color: var(--muted-text, #7a7a7a);
  }

  .quick-form select,
  .quick-form input {
    margin-top: 0.35rem;
    padding: 0.45rem 0.6rem;
    border-radius: 8px;
    border: 1px solid var(--border-color, #dcdcdc);
    background: var(--input-background, #fff);
    font-size: 1rem;
  }

  .quick-form .btn-primary {
    padding: 0.65rem 1.25rem;
    border-radius: 10px;
    border: none;
    background: #4a7cff;
    color: #fff;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .quick-form .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .quick-feedback {
    margin-top: 0.65rem;
    font-size: 0.9rem;
  }

  .form-success {
    color: #1d4ed8;
  }

  .preset-area {
    margin-bottom: 2rem;
  }

  .preset-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1rem;
  }

  .preset-card {
    background: var(--card-background, #fff);
    border-radius: 14px;
    padding: 1rem;
    box-shadow: 0 10px 30px -20px rgba(0, 0, 0, 0.35);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 0.85rem;
  }

  .preset-info {
    display: flex;
    flex-direction: column;
  }

  .preset-name {
    font-size: 1.05rem;
    font-weight: 600;
  }

  .preset-blocks {
    color: var(--muted-text, #7a7a7a);
  }

  .preset-card button {
    border: none;
    border-radius: 10px;
    padding: 0.6rem;
    background: #111827;
    color: #fff;
    font-weight: 600;
    cursor: pointer;
  }

  .form-note {
    color: var(--muted-text, #7a7a7a);
    font-size: 0.9rem;
    margin: 0;
  }

  .form-error {
    color: #dc2626;
    font-size: 0.9rem;
    margin: 0;
  }
</style>