<script lang="ts">
  import { onMount } from 'svelte';
  import {
    getSessions,
    getPresets,
    getSkillSummary,
    getMmrRecords,
    createMmrLog,
  } from './api';
  import type { Session, SessionBlock, SkillSummary, MmrRecord } from './api';
  import { useSkills } from './useSkills';

  let sessions: Session[] = [];
  let selectedSession: Session | null = null;
  let loading = true;
  let error: string | null = null;
  let skillMap: Record<number, string> = {};
  let presetMap: Record<number, string> = {};
  const skillsStore = useSkills();
  $: skillMap = Object.fromEntries($skillsStore.skills.map((skill) => [skill.id, skill.name]));
  let summary: SkillSummary[] = [];
  let summaryLoading = true;
  let summaryError: string | null = null;

  const MMR_WINDOW_DAYS = 30;
  const CHART_VIEW_WIDTH = 640;
  const CHART_VIEW_HEIGHT = 220;
  const CHART_PADDING = 32;
  const CHART_INNER_WIDTH = CHART_VIEW_WIDTH - CHART_PADDING * 2;
  const CHART_INNER_HEIGHT = CHART_VIEW_HEIGHT - CHART_PADDING * 2;

  const HISTORY_WINDOW_DAYS = 30;

  function formatInputDate(date: Date) {
    return date.toISOString().split('T')[0];
  }

  function toIsoFilterDate(value?: string, endOfDay = false) {
    if (!value) {
      return undefined;
    }

    const time = endOfDay ? '23:59:59.999Z' : '00:00:00.000Z';
    return new Date(`${value}T${time}`).toISOString();
  }

  function buildRangeIso() {
    const from = toIsoFilterDate(startDate);
    const to = toIsoFilterDate(endDate, true);
    return { from, to };
  }

  function buildSessionFilters() {
    const { from, to } = buildRangeIso();
    return { start: from, end: to };
  }

  function buildMmrFilters() {
    return buildRangeIso();
  }

  const today = new Date();
  const defaultStart = new Date(today);
  defaultStart.setDate(today.getDate() - HISTORY_WINDOW_DAYS);
  let startDate = formatInputDate(defaultStart);
  let endDate = formatInputDate(today);

  let mmrRecords: MmrRecord[] = [];
  let mmrLoading = true;
  let mmrError: string | null = null;
  let playlists: string[] = [];
  let selectedPlaylist: string | null = null;
  let selectedPlaylists: string[] = [];
  let mmrSeriesByPlaylist: Record<string, MmrRecord[]> = {};
  let manualMmrValue = '';
  let manualGamesDiff = '1';
  let manualSubmitting = false;
  let manualError: string | null = null;
  let manualSuccess: string | null = null;
  let manualPlaylistValue = '';

  onMount(() => {
    loadSummary();
    void refreshHistoryData();
  });

  async function loadSessions() {
    loading = true;
    error = null;

    try {
      const [sessionData, presets] = await Promise.all([getSessions(buildSessionFilters()), getPresets()]);
      sessions = sessionData.sort((a, b) => new Date(b.startedTime).getTime() - new Date(a.startedTime).getTime());
      presetMap = Object.fromEntries(presets.map((preset) => [preset.id, preset.name]));
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unable to load sessions';
    } finally {
      loading = false;
    }
  }

  async function loadSummary() {
    summaryLoading = true;
    summaryError = null;
    const to = new Date();
    const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

    try {
      summary = await getSkillSummary({ from: from.toISOString(), to: to.toISOString() });
    } catch (err) {
      summaryError = err instanceof Error ? err.message : 'Unable to load summary';
    } finally {
      summaryLoading = false;
    }
  }

  async function refreshHistoryData() {
    await loadSessions();
    await loadMmrPlaylists();
    await loadMmrSeries();
  }

  async function loadMmrPlaylists() {
    mmrError = null;

    try {
      const records = await getMmrRecords(buildMmrFilters());
      const uniquePlaylists = Array.from(new Set(records.map((record) => record.playlist))).sort();
      playlists = uniquePlaylists;
      const preservedSelection = selectedPlaylists.filter((playlist) => playlists.includes(playlist));
      selectedPlaylists = preservedSelection.length ? preservedSelection : [...playlists];
      if (!selectedPlaylist || !playlists.includes(selectedPlaylist)) {
        selectedPlaylist = playlists.length ? playlists[0] : null;
      }
    } catch (err) {
      mmrError = err instanceof Error ? err.message : 'Unable to load playlist data';
      mmrLoading = false;
    }
  }

  async function loadMmrSeries() {
    if (!selectedPlaylists.length) {
      mmrRecords = [];
      mmrSeriesByPlaylist = {};
      mmrLoading = false;
      return;
    }

    mmrLoading = true;
    mmrError = null;
    const filters = buildMmrFilters();

    try {
      const requests = selectedPlaylists.map((playlist) =>
        getMmrRecords({ playlist, from: filters.from, to: filters.to })
      );
      const responses = await Promise.all(requests);
      const series: Record<string, MmrRecord[]> = {};
      responses.forEach((records, index) => {
        series[selectedPlaylists[index]] = records;
      });
      mmrSeriesByPlaylist = series;
      const displayPlaylist =
        selectedPlaylists.find((playlist) => playlist === selectedPlaylist) ?? selectedPlaylists[0];
      if (displayPlaylist) {
        selectedPlaylist = displayPlaylist;
        mmrRecords = mmrSeriesByPlaylist[displayPlaylist] ?? [];
      } else {
        mmrRecords = [];
        selectedPlaylist = null;
      }
    } catch (err) {
      mmrError = err instanceof Error ? err.message : 'Unable to load MMR records';
    } finally {
      mmrLoading = false;
    }
  }

  async function submitManualMmr(event: Event) {
    event.preventDefault();
    const playlistValue = playlists.length && selectedPlaylist ? selectedPlaylist : manualPlaylistValue.trim();
    if (!playlistValue) {
      manualError = 'Playlist is required';
      return;
    }

    const mmrValue = Number(manualMmrValue);
    const gamesDiffValue = Number(manualGamesDiff);

    if (Number.isNaN(mmrValue) || Number.isNaN(gamesDiffValue)) {
      manualError = 'MMR and games difference must be numbers';
      return;
    }

    manualSubmitting = true;
    manualError = null;
    manualSuccess = null;

    try {
      await createMmrLog({
        timestamp: new Date().toISOString(),
        playlist: playlistValue,
        mmr: mmrValue,
        gamesPlayedDiff: gamesDiffValue,
        source: 'manual',
      });
      manualSuccess = `MMR logged for ${playlistValue}`;
      manualMmrValue = '';
      manualGamesDiff = '1';
      manualPlaylistValue = '';
  await loadMmrPlaylists();
      await loadMmrSeries();
    } catch (err) {
      manualError = err instanceof Error ? err.message : 'Unable to log MMR';
    } finally {
      manualSubmitting = false;
    }
  }

  function handlePlaylistChange(event: Event) {
    selectedPlaylist = (event.currentTarget as HTMLSelectElement).value;
    manualError = null;
    manualSuccess = null;
    loadMmrSeries();
  }

  function handleDateFilterChange() {
    if (startDate && endDate && startDate > endDate) {
      const temp = startDate;
      startDate = endDate;
      endDate = temp;
    }

    void refreshHistoryData();
  }

  function handlePlaylistFiltersChange() {
    if (!selectedPlaylists.length && playlists.length) {
      selectedPlaylists = [...playlists];
    }
    void loadMmrSeries();
  }

  function formatDate(value: string) {
    return new Date(value).toLocaleString();
  }

  function formatChartDate(value?: string) {
    if (!value) {
      return '';
    }

    return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function totalDurationMinutes(session: Session) {
    const totalSeconds = session.blocks.reduce((sum, block) => sum + Math.max(0, block.actualDuration), 0);
    return Math.round(totalSeconds / 60);
  }

  $: chartMaxMinutes = summary.length ? Math.max(...summary.map((item) => item.minutes)) : 0;

  function toggleSession(session: Session) {
    selectedSession = selectedSession?.id === session.id ? null : session;
  }

  function getPresetName(session: Session) {
    if (!session.presetId) {
      return 'manual';
    }

    return presetMap[session.presetId] ?? `Preset #${session.presetId}`;
  }

  function getBlockSkills(block: SessionBlock) {
    return block.skillIds.map((id) => skillMap[id] ?? `Skill #${id}`).join(', ');
  }

  $: mmrChartPoints = mmrRecords
    .map((record) => ({
      ...record,
      timestampValue: new Date(record.timestamp).getTime(),
    }))
    .sort((a, b) => a.timestampValue - b.timestampValue);

  $: mmrChartMinTime = mmrChartPoints[0]?.timestampValue ?? 0;
  $: mmrChartMaxTime = mmrChartPoints[mmrChartPoints.length - 1]?.timestampValue ?? 0;
  $: mmrChartMinValue = mmrChartPoints.length
    ? Math.min(...mmrChartPoints.map((point) => point.mmr))
    : 0;
  $: mmrChartMaxValue = mmrChartPoints.length
    ? Math.max(...mmrChartPoints.map((point) => point.mmr))
    : 0;
  $: chartTimeRange = mmrChartMaxTime === mmrChartMinTime ? 1 : mmrChartMaxTime - mmrChartMinTime;
  $: chartValueRange = mmrChartMaxValue === mmrChartMinValue ? 1 : mmrChartMaxValue - mmrChartMinValue;
  $: chartCoordinates = mmrChartPoints.map((point) => {
    const x = CHART_PADDING + ((point.timestampValue - mmrChartMinTime) / chartTimeRange) * CHART_INNER_WIDTH;
    const y =
      CHART_VIEW_HEIGHT -
      CHART_PADDING -
      ((point.mmr - mmrChartMinValue) / chartValueRange) * CHART_INNER_HEIGHT;
    return { x, y, mmr: point.mmr, timestamp: point.timestamp };
  });
  $: chartPolyline = chartCoordinates.map((coord) => `${coord.x.toFixed(2)},${coord.y.toFixed(2)}`).join(' ');
  $: chartStartLabel = chartCoordinates.length ? chartCoordinates[0].timestamp : '';
  $: chartEndLabel = chartCoordinates.length ? chartCoordinates[chartCoordinates.length - 1].timestamp : '';
</script>

<section class="screen-content">
  <h1>History</h1>
  <p>Review your completed training sessions.</p>

  <div class="history-summary">
    <h2>Training per skill (last 7 days)</h2>

    {#if summaryLoading}
      <p>Loading summary…</p>
    {:else if summaryError}
      <p class="badge offline">{summaryError}</p>
    {:else if summary.length === 0}
      <p>No activity recorded yet.</p>
    {:else}
      <div class="summary-chart">
        {#each summary as item}
          <div class="chart-bar">
            <div
              class="chart-bar-value"
              style={`height: ${chartMaxMinutes ? (item.minutes / chartMaxMinutes) * 160 : 0}px`}
            >
              <span>{item.minutes}m</span>
            </div>
            <div class="chart-bar-label">{item.name}</div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <div class="history-mmr">
    <div class="history-mmr-header">
      <div>
        <h2>MMR trend</h2>
        <p>Weight over time for a single playlist.</p>
      </div>
    </div>

    <div class="history-mmr-filters">
      <label>
        From
        <input
          type="date"
          bind:value={startDate}
          max={endDate}
          on:change={handleDateFilterChange}
        />
      </label>
      <label>
        To
        <input
          type="date"
          bind:value={endDate}
          min={startDate}
          on:change={handleDateFilterChange}
        />
      </label>
      <label>
        Playlists
        <select
          multiple
          size={Math.min(playlists.length, 6) || 3}
          bind:value={selectedPlaylists}
          on:change={handlePlaylistFiltersChange}
        >
          {#each playlists as playlist}
            <option value={playlist}>{playlist}</option>
          {/each}
        </select>
      </label>
    </div>

    <form class="manual-mmr-form" on:submit|preventDefault={submitManualMmr}>
      <div class="manual-mmr-fields">
        {#if playlists.length}
          <label>
            Playlist
            <select value={selectedPlaylist ?? ''} on:change={handlePlaylistChange} disabled={manualSubmitting}>
              {#each playlists as playlist}
                <option value={playlist}>{playlist}</option>
              {/each}
            </select>
          </label>
        {:else}
          <label>
            Playlist
            <input
              placeholder="e.g. Standard"
              type="text"
              bind:value={manualPlaylistValue}
              disabled={manualSubmitting}
            />
          </label>
        {/if}
        <label>
          MMR
          <input
            type="number"
            placeholder="2125"
            step="1"
            bind:value={manualMmrValue}
            disabled={manualSubmitting}
          />
        </label>
        <label>
          Games played diff
          <input
            type="number"
            placeholder="1"
            step="1"
            bind:value={manualGamesDiff}
            disabled={manualSubmitting}
          />
        </label>
      </div>
      <button type="submit" class="btn-primary" disabled={manualSubmitting}>
        {manualSubmitting ? 'Logging…' : 'Log MMR'}
      </button>
      {#if manualError}
        <p class="badge offline manual-feedback">{manualError}</p>
      {:else if manualSuccess}
        <p class="badge success manual-feedback">{manualSuccess}</p>
      {/if}
    </form>

    {#if mmrLoading}
      <p>Loading MMR data…</p>
    {:else if mmrError}
      <p class="badge offline">{mmrError}</p>
    {:else if playlists.length === 0}
      <p>No playlist records yet. Play a ranked match so the plugin can capture data.</p>
    {:else if !selectedPlaylist}
      <p>Select a playlist to view a trend.</p>
    {:else if mmrRecords.length === 0}
      <p>No MMR data for {selectedPlaylist} in the last {MMR_WINDOW_DAYS} days.</p>
    {:else}
      <div class="mmr-chart-wrapper">
        <div class="mmr-chart-heading">
          <p class="label">Weight over the last {MMR_WINDOW_DAYS} days</p>
          <strong>{selectedPlaylist}</strong>
        </div>
        <svg
          class="mmr-chart-plot"
          viewBox={`0 0 ${CHART_VIEW_WIDTH} ${CHART_VIEW_HEIGHT}`}
          role="img"
          aria-label="MMR over time"
        >
          <polyline class="mmr-chart-line" points={chartPolyline} />
          {#each chartCoordinates as coord}
            <circle class="mmr-chart-point" cx={coord.x} cy={coord.y} r="3" />
          {/each}
        </svg>
        <div class="mmr-chart-meta">
          <span>{formatChartDate(chartStartLabel)}</span>
          <span>{formatChartDate(chartEndLabel)}</span>
        </div>
        <div class="mmr-chart-scale">
          <span>{mmrChartMaxValue} MMR</span>
          <span>{mmrChartMinValue} MMR</span>
        </div>
      </div>
    {/if}
  </div>

  {#if loading}
    <p>Loading sessions…</p>
  {:else if error}
    <p class="badge offline">{error}</p>
  {:else if sessions.length === 0}
    <p>No sessions recorded yet. Start a preset on the Home screen!</p>
  {:else}
    <div class="history-grid">
      {#each sessions as session}
        <button
          class={`history-card ${selectedSession?.id === session.id ? 'expanded' : ''}`}
          type="button"
          on:click={() => toggleSession(session)}
          aria-expanded={selectedSession?.id === session.id}
        >
          <div class="history-card-header">
            <span>{formatDate(session.startedTime)}</span>
            <span>{totalDurationMinutes(session)} min</span>
          </div>
          <p class="history-card-meta">
            {session.source} • {getPresetName(session)}
          </p>
        </button>
      {/each}
    </div>

    {#if selectedSession}
      <div class="session-detail">
        <h2>Session details</h2>
        <p>
          <strong>Started:</strong> {formatDate(selectedSession.startedTime)}
        </p>
        {#if selectedSession.finishedTime}
          <p>
            <strong>Finished:</strong> {formatDate(selectedSession.finishedTime)}
          </p>
        {/if}
        <p>
          <strong>Source:</strong> {selectedSession.source} • {getPresetName(selectedSession)}
        </p>
        <ul class="session-blocks">
          {#each selectedSession.blocks as block, index}
            <li>
              <div class="block-top">
                <strong>
                  Block {index + 1}: {block.type}
                </strong>
                <span>{block.actualDuration}s actual • {block.plannedDuration}s planned</span>
              </div>
              <p class="block-skills">Skills: {getBlockSkills(block)}</p>
              {#if block.notes}
                <p class="block-notes">Notes: {block.notes}</p>
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {/if}
</section>

<style>
  .history-summary {
    background: var(--card-background, rgba(15, 23, 42, 0.95));
    border-radius: 16px;
    padding: 1.25rem;
    margin-bottom: 1.5rem;
    box-shadow: var(--history-card-shadow);
    color: #fff;
  }

  .summary-chart {
    display: flex;
    gap: 0.75rem;
    align-items: flex-end;
    min-height: 180px;
  }

  .chart-bar {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }

  .chart-bar-value {
    width: 100%;
    background: linear-gradient(180deg, #8dd9ff, #4a7cff);
    border-radius: 999px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    font-size: 0.75rem;
    color: #fff;
    font-weight: 600;
  }

  .chart-bar-value span {
    padding-bottom: 0.25rem;
  }

  .chart-bar-label {
    font-size: 0.75rem;
    text-align: center;
    color: rgba(255, 255, 255, 0.65);
    max-width: 60px;
    word-break: break-word;
  }

  .manual-mmr-form {
    margin-bottom: 1.25rem;
    border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.2));
    padding-bottom: 1rem;
  }

  .manual-mmr-fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .manual-mmr-fields label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.8);
  }

  .manual-mmr-fields input,
  .manual-mmr-fields select {
    padding: 0.45rem 0.75rem;
    border-radius: 6px;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.2));
    background: var(--input-background, rgba(15, 23, 42, 0.9));
    font-size: 0.95rem;
    color: #fff;
  }

  .manual-mmr-form .btn-primary {
    border: none;
    border-radius: 8px;
    padding: 0.65rem 1.25rem;
    background: #4a7cff;
    color: #fff;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .manual-mmr-form .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .manual-feedback {
    margin-top: 0.5rem;
    font-size: 0.85rem;
  }

  .badge.success {
    background: #e0f2ff;
    color: #0f172a;
    border-color: rgba(15, 23, 42, 0.2);
  }

  .history-mmr {
    background: var(--card-background, rgba(15, 23, 42, 0.95));
    border-radius: 16px;
    padding: 1.25rem;
    margin-bottom: 1.5rem;
    box-shadow: var(--history-card-shadow);
    color: #fff;
  }

  .history-mmr-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .history-mmr-filters {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    margin-bottom: 1rem;
  }

  .history-mmr-filters label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.8);
  }

  .history-mmr-filters input,
  .history-mmr-filters select {
    padding: 0.45rem 0.75rem;
    border-radius: 6px;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.2));
    background: var(--input-background, rgba(15, 23, 42, 0.9));
    color: #fff;
    font-size: 0.9rem;
  }

  .history-mmr-filters select {
    min-height: 96px;
  }

  .history-mmr h2 {
    margin: 0;
  }

  .history-mmr p {
    margin: 0.25rem 0 0;
    color: rgba(255, 255, 255, 0.65);
    font-size: 0.9rem;
  }

  .mmr-chart-wrapper {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .mmr-chart-heading {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .mmr-chart-heading .label {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin: 0;
  }

  .mmr-chart-plot {
    width: 100%;
    height: auto;
  }

  .mmr-chart-line {
    fill: none;
    stroke: #4a7cff;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .mmr-chart-point {
    fill: #4a7cff;
    stroke: #fff;
    stroke-width: 1;
  }

  .mmr-chart-meta,
  .mmr-chart-scale {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    color: var(--muted-text, #7a7a7a);
  }
</style>