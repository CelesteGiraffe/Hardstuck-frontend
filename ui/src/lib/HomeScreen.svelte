<script lang="ts">
  import { healthCheck, createSession } from './api';
  import type {
    GoalProgress,
    Preset,
    Skill,
    Session,
    SkillSummary,
    MmrRecord,
    TrainingGoal,
  } from './api';
  import { launchPreset } from './stores';
  import { useSkills } from './useSkills';
  import { profileStore } from './profileStore';
  import {
    apiOfflineMessage,
    isApiOffline,
    mmrLogQuery,
    presetsQuery,
    sessionsQuery,
    weeklySkillSummaryQuery,
  } from './queries';
  import { pushChecklistSnapshot } from './checklistState';
  import { pluginInstallUrl } from './constants';
  import type { ChecklistItem } from './checklistState';
  import {
    formatGoalEtaLabel,
    formatGoalPercentLabel,
    getGoalCompletionPercent,
    getGoalRemainingMinutes,
  } from './formatters/goalProgress';

  let apiHealthy: boolean | null = null;
  let healthChecking = false;
  let healthError: string | null = null;

  const skillsStore = useSkills();
  let skillList: Skill[] = [];
  let skillsLoading = false;
  let skillsError: string | null = null;
  let quickSkillId: number | null = null;
  let quickMinutes = '10';
  let quickSubmitting = false;
  let quickSuccess: string | null = null;
  let quickError: string | null = null;

  let presets: Preset[] = [];
  let loadingPresets = false;
  let presetError: string | null = null;

  let sessions: Session[] = [];
  let loadingSessions = false;
  let sessionError: string | null = null;
  let totalMinutesToday = 0;

  let skillSummary: SkillSummary[] = [];
  let summaryError: string | null = null;
  let topSkills: SkillSummary[] = [];

  let latestMmr: MmrRecord[] = [];
  let mmrError: string | null = null;
  let lastMmrRecord: MmrRecord | null = null;
  let lastMmrMeta: string | null = null;
  let cacheNote = 'Fetching fresh stats…';

  const dailyGoalMinutes = 180;

  let topSkillFocus: SkillSummary | null = null;
  let minutesProgress = 0;
  let apiStatusLabel = 'Checking…';
  let apiStatusMessage: string | null = null;

  let checklistItems: ChecklistItem[] = [];

  const profileGoalsStore = profileStore.goals;
  const profileProgressStore = profileStore.progressMap;

  type GoalTrackEntry = {
    goal: TrainingGoal;
    progress: GoalProgress | null;
    percent: number | null;
    remainingMinutes: number | null;
    etaLabel: string | null;
  };

  let trackEntries: GoalTrackEntry[] = [];
  let visibleTrackEntries: GoalTrackEntry[] = [];

  $: skillList = $skillsStore.skills;
  $: skillsLoading = $skillsStore.loading;
  $: skillsError = $skillsStore.error;
  $: if (quickSkillId === null && skillList.length) {
    quickSkillId = skillList[0].id;
  }

  $: {
    const state = $presetsQuery;
    presets = state.data;
    loadingPresets = state.loading;
    presetError = state.error;
  }

  $: {
    const state = $sessionsQuery;
    sessions = state.data;
    loadingSessions = state.loading;
    sessionError = state.error;
    totalMinutesToday = calculateMinutesToday(sessions);
  }

  $: {
    const state = $weeklySkillSummaryQuery;
    skillSummary = state.data;
    summaryError = state.error;
    topSkills = skillSummary.slice(0, 3);
  }

  $: {
    const state = $mmrLogQuery;
    mmrError = state.error;
    const records = state.data;
    const latest = new Map<string, MmrRecord>();
    for (const record of records) {
      const current = latest.get(record.playlist);
      if (!current || new Date(record.timestamp).getTime() > new Date(current.timestamp).getTime()) {
        latest.set(record.playlist, record);
      }
    }

    latestMmr = Array.from(latest.values()).sort((a, b) => a.playlist.localeCompare(b.playlist));
    const chronologically = [...records].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    lastMmrRecord = chronologically[chronologically.length - 1] ?? null;
  }

  $: lastMmrMeta = lastMmrRecord
    ? `${formatTimestamp(lastMmrRecord.timestamp)} · ${describeMmrSource(lastMmrRecord.source)}`
    : null;

  $: cacheNote = $mmrLogQuery.lastUpdated
    ? `Last synced: ${formatTimestamp($mmrLogQuery.lastUpdated)}`
    : 'Fetching fresh stats…';

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
      value: `${latestMmr.length}`,
      helper: lastMmrRecord
        ? `Latest via ${describeMmrSource(lastMmrRecord.source)}`
        : 'Log a match manually or enable the plugin',
    },
  ];

  $: pushChecklistSnapshot({
    items: checklistItems,
    lastMmrMeta,
    cacheNote,
  });

  $: topSkillFocus = topSkills[0] ?? null;
  $: minutesProgress = Math.round(
    Math.min(100, (totalMinutesToday / dailyGoalMinutes) * 100)
  );
  $: apiStatusLabel = $isApiOffline
    ? 'Offline'
    : apiHealthy === null
    ? 'Checking…'
    : apiHealthy
    ? 'Online'
    : 'Unhealthy';
  $: apiStatusMessage =
    healthError ?? $apiOfflineMessage ?? (apiHealthy ? 'API is online' : 'Waiting for syncing');

  $: trackEntries = $profileGoalsStore.map((goal) => {
    const progress = $profileProgressStore[goal.id] ?? null;
    return {
      goal,
      progress,
      percent: getGoalCompletionPercent(goal, progress),
      remainingMinutes: getGoalRemainingMinutes(goal, progress),
      etaLabel: formatGoalEtaLabel(goal, progress),
    };
  });

  $: visibleTrackEntries = (() => {
    if (trackEntries.length === 0) {
      return [];
    }
    const active = trackEntries.filter((entry) => (entry.percent ?? 0) < 100);
    if (active.length) {
      return active.slice(0, 2);
    }
    return trackEntries.slice(0, 2);
  })();


  function calculateMinutesToday(currentSessions: Session[]) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setHours(23, 59, 59, 999);

    const totalSeconds = currentSessions.reduce((sum, session) => {
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

    return Math.round(totalSeconds / 60);
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
    launchPreset(preset);
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

      await Promise.all([sessionsQuery.refresh(), weeklySkillSummaryQuery.refresh()]);
    } catch (error) {
      quickError = error instanceof Error ? error.message : 'Unable to log quick block';
    } finally {
      quickSubmitting = false;
    }
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
</script>

<section class="screen-content home-shell">
  <div class="home-grid">
    <section class="home-card glass-card hero-summary">
      <div class="section-header">
        <p class="hero-accent">Rocket League training journal</p>
        <h1 class="glow-heading">Home</h1>
        <p>
          Track presets, log quick skills, and compare your minutes to ranked results, all with a neon
          dashboard that scales from mobile to desktop.
        </p>
      </div>
      <div class="stat-badges">
        <div class="stat-badge">
          <div class="stat-label">Minutes trained today</div>
          <div class="stat-value">{totalMinutesToday}</div>
          <div class="stat-progress">
            <span class="stat-progress-fill" style={`width: ${minutesProgress}%`}></span>
          </div>
          <small>{minutesProgress >= 100 ? 'Goal reached!' : `Goal: ${dailyGoalMinutes} min`}</small>
        </div>
        <div class="stat-badge">
          <div class="stat-label">Top skill focus</div>
          {#if topSkillFocus}
            <div class="stat-value">{topSkillFocus.name}</div>
            <p class="stat-subtext">{topSkillFocus.minutes} min · last 7 days</p>
          {:else}
            <div class="stat-value">No focus yet</div>
            <p class="stat-subtext">Log a block to spotlight a skill</p>
          {/if}
        </div>
      </div>
      <p class="cache-note">{cacheNote}</p>
      <div class="cta-row" role="region" aria-labelledby="api-health-heading">
        <div>
          <p id="api-health-heading" class="cta-title">API health</p>
          <p class="cta-copy">
            Status: <strong>{apiStatusLabel}</strong>
            {#if apiStatusMessage}
              · {apiStatusMessage}
            {/if}
          </p>
        </div>
        <button
          type="button"
          class="button-neon hero-health-button"
          on:click={refreshHealthStatus}
          disabled={healthChecking}
        >
          {healthChecking ? 'Checking…' : 'Retry API health'}
        </button>
      </div>
      <div class="cta-row" role="region" aria-labelledby="plugin-install-heading">
        <div>
          <p id="plugin-install-heading" class="cta-title">MMR plugin</p>
          <p class="cta-copy">Install BakkesMod to sync match data automatically.</p>
        </div>
        <a class="button-soft cta-link" href={pluginInstallUrl} target="_blank" rel="noreferrer">
          Install plugin
        </a>
      </div>
    </section>

    <section class="home-card glass-card track-progress">
      <div class="section-header">
        <h2>Track progress</h2>
        <p>See how your current goals are advancing without leaving the dashboard.</p>
      </div>
      {#if visibleTrackEntries.length > 0}
        <div class="track-list">
          {#each visibleTrackEntries as entry (entry.goal.id)}
            <article class="track-row">
              <header class="track-row-header">
                <div>
                  <p class="track-row-label">{entry.goal.label}</p>
                  <p class="track-row-meta">
                    {entry.progress?.actualMinutes ?? 0}m tracked · {entry.goal.periodDays}d window
                  </p>
                </div>
                <span class="track-row-percent">{formatGoalPercentLabel(entry.percent)}</span>
              </header>
              <div
                class="track-row-bar"
                role="progressbar"
                aria-valuenow={entry.percent ?? 0}
                aria-valuemin="0"
                aria-valuemax="100"
              >
                <span
                  class="track-row-fill"
                  style={`width: ${Math.min(100, Math.max(0, entry.percent ?? 0))}%`}
                ></span>
              </div>
              <div class="track-row-details">
                {#if entry.remainingMinutes !== null}
                  <span>{entry.remainingMinutes} min left</span>
                {/if}
                {#if entry.etaLabel}
                  <span>{entry.etaLabel}</span>
                {/if}
              </div>
            </article>
          {/each}
        </div>
      {:else}
        <p class="track-empty">Add goals on the Profile screen and log sessions to populate this update.</p>
      {/if}
    </section>

    <section class="home-card glass-card quick-timer">
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

    <section class="home-card glass-card readiness-checklist">
      <div class="section-header">
        <h2>Readiness checklist</h2>
        <p>Confirm the essentials before starting a fresh session.</p>
      </div>
      <ul class="readiness-list">
        {#each checklistItems as item}
          <li class:item-ready={item.ready} class:item-missing={!item.ready}>
            <div class="readiness-row">
              <strong>{item.label}</strong>
              <span>{item.value}</span>
            </div>
            <p>{item.helper}</p>
          </li>
        {/each}
      </ul>
    </section>

    <section class="home-card glass-card mmr-card">
      <div class="section-header">
        <h2>Recent MMR snapshots</h2>
        <p>Grab the latest data from the plugin or manual entries.</p>
      </div>
      {#if mmrError}
        <p class="form-error">{mmrError}</p>
      {:else if latestMmr.length === 0}
        <p class="form-error">Awaiting BakkesMod data.</p>
      {:else}
        <ul class="dashboard-list mmr-list">
          {#each latestMmr as record}
            <li>
              <span>{record.playlist}</span>
              <strong>{record.mmr}</strong>
            </li>
          {/each}
        </ul>
      {/if}
      {#if lastMmrMeta}
        <p class="meta-note">{lastMmrMeta}</p>
      {/if}
    </section>
  </div>

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
  .track-progress {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    background: var(--bg-panel-strong);
    border-radius: var(--card-radius);
    padding: 1.25rem;
  }

  .track-list {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  .track-row {
    border: 1px solid var(--border-soft);
    border-radius: var(--card-radius);
    padding: 0.9rem;
    background: rgba(255, 255, 255, 0.02);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .track-row-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
  }

  .track-row-label {
    margin: 0;
    font-weight: 600;
  }

  .track-row-meta {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .track-row-percent {
    font-size: 0.85rem;
    font-weight: 600;
    color: #22d3ee;
  }

  .track-row-bar {
    background: rgba(255, 255, 255, 0.1);
    height: 6px;
    border-radius: 999px;
    overflow: hidden;
  }

  .track-row-fill {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, #22d3ee, #6366f1);
    border-radius: inherit;
  }

  .track-row-details {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .track-empty {
    margin: 0;
    color: var(--text-muted);
  }

  @media (max-width: 640px) {
    .track-progress {
      padding: 1rem;
    }
  }
</style>
