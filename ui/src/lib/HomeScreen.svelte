<script lang="ts">
  import { onMount } from 'svelte';
  import {
    healthCheck,
    getPresets,
    getSessions,
    getSkillSummary,
    getMmrRecords,
    createSession,
  } from './api';
  import { readCache, writeCache } from './homeCache';
  import type { DashboardCacheKey } from './homeCache';
  import type { Preset, Skill, Session, SkillSummary, MmrRecord } from './api';
  import { navigateTo, selectedPreset } from './stores';
  import { useSkills } from './useSkills';

  let apiHealthy: boolean | null = null;

  let presets: Preset[] = [];
  let loadingPresets = false;
  let presetError: string | null = null;

  const skillsStore = useSkills();
  let skillList: Skill[] = [];
  let skillsLoading = false;
  let skillsError: string | null = null;
  let quickSkillId: number | null = null;

  $: skillList = $skillsStore.skills;
  $: skillsLoading = $skillsStore.loading;
  $: skillsError = $skillsStore.error;
  $: if (quickSkillId === null && skillList.length) {
    quickSkillId = skillList[0].id;
  }
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
  let mmrRecords: MmrRecord[] = [];
  let lastMmrRecord: MmrRecord | null = null;
  let lastMmrMeta: string | null = null;
  let healthError: string | null = null;
  let healthChecking = false;
  const pluginInstallUrl = 'https://github.com/CelesteGiraffe/RL-Trainer-2#3-bakkesmod-plugin-c';
  type ChecklistItem = {
    label: string;
    ready: boolean;
    value: string;
    helper: string;
  };
  let cacheTimestamps: Record<DashboardCacheKey, string | null> = {
    presets: null,
    skillSummary: null,
    minutesToday: null,
    latestMmr: null,
  };
  let cacheNote = 'Fetching fresh stats…';

  $: checklistItems = [
    {
      label: 'Skills tracked',
      ready: skillList.length > 0,
      value: `${skillList.length}`,
      helper: skillList.length
        ? 'Connect skills to your quick timer or presets'
        : 'Create a skill to start your training log',
    },
    {
      label: 'Presets ready',
      ready: presets.length > 0,
      value: `${presets.length}`,
      helper: presets.length
        ? `${presets.length} preset${presets.length === 1 ? '' : 's'} are waiting`
        : 'Build a preset from the Presets screen',
    },
    {
      label: 'MMR logs',
      ready: Boolean(lastMmrRecord),
      value: `${mmrRecords.length}`,
      helper: lastMmrRecord
        ? `Latest via ${describeMmrSource(lastMmrRecord.source)}`
        : 'Log a match manually or enable the plugin',
    },
  ];

  $: lastMmrMeta = lastMmrRecord
    ? `${formatTimestamp(lastMmrRecord.timestamp)} · ${describeMmrSource(lastMmrRecord.source)}`
    : null;

  $: cacheNote = cacheTimestamps.latestMmr
    ? `Last cached: ${formatTimestamp(cacheTimestamps.latestMmr)}`
    : 'Fetching fresh stats…';

  onMount(async () => {
    skillsStore.ensureLoaded();
    await Promise.all([
      refreshHealthStatus(),
      loadPresets(),
      loadSessions(),
      loadSkillSummary(),
      loadLatestMmr(),
    ]);
  });

  async function loadPresets() {
    loadingPresets = true;
    presetError = null;
    const cacheKey: DashboardCacheKey = 'presets';

    const cached = readCache<Preset[]>(cacheKey);
    if (cached) {
      presets = cached.data;
      cacheTimestamps = { ...cacheTimestamps, [cacheKey]: cached.timestamp };
    }

    try {
      const fresh = await getPresets();
      presets = fresh;
      cacheTimestamps = { ...cacheTimestamps, [cacheKey]: new Date().toISOString() };
      writeCache(cacheKey, fresh);
    } catch (error) {
      console.error('Failed to load presets', error);
      presetError = 'Unable to load presets';
    } finally {
      loadingPresets = false;
    }
  }

  async function loadSessions() {
    loadingSessions = true;
    sessionError = null;
    const cacheKey: DashboardCacheKey = 'minutesToday';
    const cached = readCache<number>(cacheKey);
    if (cached) {
      totalMinutesToday = cached.data;
      cacheTimestamps = { ...cacheTimestamps, [cacheKey]: cached.timestamp };
    }

    try {
      sessions = await getSessions();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(todayStart);
      todayEnd.setHours(23, 59, 59, 999);

      const totalSeconds = sessions.reduce((sum, session) => {
        const started = new Date(session.startedTime);
        if (started >= todayStart && started <= todayEnd) {
          const blocksSeconds = session.blocks.reduce(
            (blockSum, block) => blockSum + Math.max(0, block.actualDuration),
            0
          );
          return sum + blocksSeconds;
        }
        return sum;
      }, 0);

      totalMinutesToday = Math.round(totalSeconds / 60);
      cacheTimestamps = { ...cacheTimestamps, [cacheKey]: new Date().toISOString() };
      writeCache(cacheKey, totalMinutesToday);
    } catch (error) {
      console.error('Failed to load sessions', error);
      sessionError = 'Unable to load sessions';
    } finally {
      loadingSessions = false;
    }
  }

  async function loadSkillSummary() {
    summaryError = null;
    const cacheKey: DashboardCacheKey = 'skillSummary';
    const to = new Date();
    const from = new Date(to);
    from.setDate(to.getDate() - 7);

    const cached = readCache<SkillSummary[]>(cacheKey);
    if (cached) {
      skillSummary = cached.data;
      topSkills = skillSummary.slice(0, 3);
      cacheTimestamps = { ...cacheTimestamps, [cacheKey]: cached.timestamp };
    }

    try {
      skillSummary = await getSkillSummary({ from: from.toISOString(), to: to.toISOString() });
      topSkills = skillSummary.slice(0, 3);
      cacheTimestamps = { ...cacheTimestamps, [cacheKey]: new Date().toISOString() };
      writeCache(cacheKey, skillSummary);
    } catch (error) {
      console.error('Failed to load weekly summary', error);
      summaryError = 'Unable to load weekly summary';
    }
  }

  async function loadLatestMmr() {
    mmrError = null;
    const cacheKey: DashboardCacheKey = 'latestMmr';
    const cached = readCache<MmrRecord[]>(cacheKey);
    if (cached) {
      applyMmrRecords(cached.data);
      cacheTimestamps = { ...cacheTimestamps, [cacheKey]: cached.timestamp };
    }

    try {
      const records = await getMmrRecords();
      applyMmrRecords(records);
      cacheTimestamps = { ...cacheTimestamps, [cacheKey]: new Date().toISOString() };
      writeCache(cacheKey, records);
    } catch (error) {
      console.error('Failed to load MMR records', error);
      mmrError = 'Unable to load MMR data';
    }
  }

  function applyMmrRecords(records: MmrRecord[] = []) {
    mmrRecords = records;
    const latest = new Map<string, MmrRecord>();
    for (const record of mmrRecords) {
      const current = latest.get(record.playlist);
      if (!current || new Date(record.timestamp).getTime() > new Date(current.timestamp).getTime()) {
        latest.set(record.playlist, record);
      }
    }

    latestMmr = Array.from(latest.values()).sort((a, b) => a.playlist.localeCompare(b.playlist));
    const chronologically = [...mmrRecords].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    lastMmrRecord = chronologically[chronologically.length - 1] ?? null;
  }

  async function refreshHealthStatus() {
    healthChecking = true;
    try {
      const healthy = await healthCheck();
      apiHealthy = healthy;
      healthError = healthy ? null : 'API reported unhealthy';
    } catch (error) {
      apiHealthy = false;
      healthError = error instanceof Error ? error.message : 'Unable to reach API';
    } finally {
      healthChecking = false;
    }
  }

  function describeMmrSource(source: string | null | undefined) {
    if (!source) {
      return 'Unknown source';
    }
    if (source.toLowerCase() === 'manual') {
      return 'Manual entry';
    }
    return `Plugin (${source})`;
  }

  function formatTimestamp(value?: string | null) {
    if (!value) {
      return 'n/a';
    }
    return new Date(value).toLocaleString();
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

  const skillName = skillList.find((skill) => skill.id === quickSkillId)?.name ?? 'skill';
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

<section class="screen-content home-shell">
  <div class="glass-card home-hero">
    <div>
      <p class="hero-accent">Rocket League training journal</p>
      <h1 class="glow-heading">Home</h1>
      <p>
        Track presets, log quick skills, and compare your minutes to ranked results, all with a neon
        dashboard that scales from mobile to desktop.
      </p>
    </div>
    <div class="home-hero-meta">
      <div class="status-badge">
        API status:
        {#if apiHealthy === null}
          checking...
        {:else if apiHealthy}
          online
        {:else}
          offline
        {/if}
      </div>
      <div class="hero-health">
        {#if healthError}
          <p class="form-error hero-health-error">{healthError}</p>
        {/if}
        <button
          type="button"
          class="button-neon hero-health-button"
          on:click={refreshHealthStatus}
          disabled={healthChecking}
        >
          {healthChecking ? 'Checking…' : 'Retry API health'}
        </button>
      </div>
      <span class="hero-chip">Boost ready · presets synced</span>
    </div>
  </div>

  <div class="dashboard-grid">
    <article class="dashboard-card">
      <h3>Minutes today</h3>
      <p class="dashboard-value">{totalMinutesToday}</p>
      <p class="dashboard-subtitle">Minutes logged so far</p>
      {#if loadingSessions}
        <p class="form-error">Loading sessions…</p>
      {:else if sessionError}
        <p class="form-error">{sessionError}</p>
      {/if}
    </article>

    <article class="dashboard-card">
      <h3>Top skills (7d)</h3>
      {#if summaryError}
        <p class="form-error">{summaryError}</p>
      {:else if topSkills.length === 0}
        <p class="form-error">No focused training yet.</p>
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
      <h3>Latest MMR</h3>
      {#if mmrError}
        <p class="form-error">{mmrError}</p>
      {:else if latestMmr.length === 0}
        <p class="form-error">Awaiting BakkesMod data.</p>
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
    <article class="dashboard-card checklist-card">
      <div class="checklist-header">
        <h3>Setup checklist</h3>
        <p>See what’s left before your training stack is complete.</p>
      </div>
      <ul class="checklist-list">
        {#each checklistItems as item}
          <li class:item-ready={item.ready} class:item-missing={!item.ready}>
            <div>
              <span>{item.label}</span>
              <small>{item.helper}</small>
            </div>
            <strong>{item.value}</strong>
          </li>
        {/each}
      </ul>
      <p class="checklist-last">
        <span>Last MMR log:</span>
        {#if lastMmrMeta}
          <strong>{lastMmrMeta}</strong>
        {:else}
          <strong>Not recorded yet</strong>
        {/if}
      </p>
      <p class="checklist-cache">{cacheNote}</p>
      <div class="checklist-actions">
        <a class="button-link" href={pluginInstallUrl} target="_blank" rel="noreferrer">
          Plugin installation guide
        </a>
      </div>
    </article>
  </div>

  <section class="glass-card quick-timer">
    <div class="section-header">
      <h2>Quick timer</h2>
      <p>Log a single block tied to a skill and keep momentum without leaving the dashboard.</p>
    </div>
    <form class="quick-timer-form" on:submit|preventDefault={submitQuickTimer}>
      <label>
        Skill
        {#if skillsLoading}
          <select disabled>
            <option>Loading skills…</option>
          </select>
        {:else if skillList.length === 0}
          <select disabled>
            <option>No skills yet</option>
          </select>
        {:else}
          <select
            value={quickSkillId ?? ''}
            on:change={(event) => (quickSkillId = Number((event.currentTarget as HTMLSelectElement).value))}
          >
            {#each skillList as skill}
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
      <button
        type="submit"
        class="button-neon"
        disabled={quickSubmitting || skillsLoading || skillList.length === 0}
      >
        {quickSubmitting ? 'Logging…' : 'Log quick block'}
      </button>
    </form>
    {#if skillsError}
      <p class="form-error quick-feedback">{skillsError}</p>
    {/if}
    {#if quickError}
      <p class="form-error quick-feedback">{quickError}</p>
    {:else if quickSuccess}
      <p class="form-success quick-feedback">{quickSuccess}</p>
    {/if}
  </section>

  <section class="preset-area glass-card">
    <div class="section-header">
      <h2>Start preset</h2>
      <p>Run a structured session with glowing blocks that keep you on track.</p>
    </div>

    {#if loadingPresets}
      <p class="form-error">Loading presets…</p>
    {:else if presetError}
      <p class="form-error">{presetError}</p>
    {:else if presets.length === 0}
      <p class="form-error">No presets yet. Create one on the Presets screen to get started.</p>
    {:else}
      <div class="preset-grid">
        {#each presets as preset}
          <article class="preset-card">
            <div>
              <span class="preset-name">{preset.name}</span>
              <small class="preset-blocks">{preset.blocks.length} block{preset.blocks.length === 1 ? '' : 's'}</small>
            </div>
            <button type="button" on:click={() => beginPreset(preset)}>Launch preset</button>
          </article>
        {/each}
      </div>
    {/if}
  </section>
</section>

<style>
  .home-shell {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .home-hero {
    background: linear-gradient(135deg, rgba(249, 115, 211, 0.2), rgba(99, 102, 241, 0.35));
    border: 0;
  }

  .section-header p {
    color: var(--text-muted);
    margin-top: 0.35rem;
  }

  .preset-name {
    display: block;
    font-weight: 600;
    font-size: 1.1rem;
  }

  .preset-blocks {
    font-size: 0.9rem;
    color: var(--text-muted);
  }

  .hero-chip {
    font-size: 0.85rem;
  }

  .status-badge {
    font-size: 0.85rem;
  }

  .quick-timer p {
    color: var(--text-muted);
  }

  .preset-area > p {
    margin-top: 0.75rem;
  }

  .hero-health {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .hero-health-error {
    margin: 0;
    font-size: 0.85rem;
  }

  .hero-health-button {
    font-size: 0.8rem;
    padding: 0.35rem 0.85rem;
  }

  .checklist-card {
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(15, 23, 42, 0.9));
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  .checklist-header p {
    margin: 0.25rem 0 0;
    font-size: 0.9rem;
    color: var(--text-muted);
  }

  .checklist-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .checklist-list li {
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding-bottom: 0.6rem;
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
  }

  .checklist-list li:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .checklist-list small {
    display: block;
    margin-top: 0.3rem;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .checklist-list strong {
    font-size: 1.1rem;
  }

  .checklist-list li.item-ready strong {
    color: var(--accent-strong);
  }

  .checklist-list li.item-missing strong {
    color: rgba(248, 113, 113, 0.9);
  }

  .checklist-last {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .checklist-cache {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  .checklist-actions {
    margin-top: 0.35rem;
  }

  .button-link {
    color: #fff;
    text-decoration: underline;
    font-weight: 600;
  }
</style>
