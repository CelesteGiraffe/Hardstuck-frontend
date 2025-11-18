<script lang="ts">
  import { onMount } from 'svelte';
  import { createMmrLog, deleteMmrRecord, deleteMmrRecords, updateMmrRecord } from './api';
  import type { Session, SessionBlock, SkillSummary, MmrRecord } from './api';
  import { useSkills } from './useSkills';
  import html2canvas from 'html2canvas';
  import {
    mmrLogQuery,
    presetsQuery,
    sessionsQuery,
    weeklySkillSummaryQuery,
  } from './queries';

  let sessions: Session[] = [];
  let selectedSession: Session | null = null;
  let loadingSessions = true;
  let sessionError: string | null = null;
  let skillMap: Record<number, string> = {};
  let presetMap: Record<number, string> = {};
  const skillsStore = useSkills();
  $: skillMap = Object.fromEntries($skillsStore.skills.map((skill) => [skill.id, skill.name]));
  $: presetMap = Object.fromEntries($presetsQuery.data.map((preset) => [preset.id, preset.name]));

  $: {
    const state = $sessionsQuery;
    sessions = state.data
      .slice()
      .sort((a, b) => new Date(b.startedTime).getTime() - new Date(a.startedTime).getTime());
    loadingSessions = state.loading;
    sessionError = state.error;
  }

  let summary: SkillSummary[] = [];
  let summaryLoading = true;
  let summaryError: string | null = null;

  $: {
    const state = $weeklySkillSummaryQuery;
    summary = state.data;
    summaryLoading = state.loading;
    summaryError = state.error;
  }

  const MMR_WINDOW_DAYS = 30;
  const CHART_VIEW_WIDTH = 640;
  const CHART_VIEW_HEIGHT = 220;
  const CHART_PADDING = 32;
  const CHART_INNER_WIDTH = CHART_VIEW_WIDTH - CHART_PADDING * 2;
  const CHART_INNER_HEIGHT = CHART_VIEW_HEIGHT - CHART_PADDING * 2;
  const COMPARISON_CHART_WIDTH = 260;
  const COMPARISON_CHART_HEIGHT = 140;
  const COMPARISON_PADDING = 24;
  const STALE_THRESHOLD_MS = 48 * 60 * 60 * 1000;

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
  let latestPluginRecord: MmrRecord | null = null;
  let dataStale = false;
  let exportMessage: string | null = null;
  let exportError: string | null = null;
  let exportLoading = false;
  let deleteFilterLoading = false;
  let deletingIds: number[] = [];
  
  let editingMmrId: number | null = null;
  let editModel: { timestamp: string; mmr: string | number; gamesPlayedDiff: string | number; source: string } = {
    timestamp: '',
    mmr: '',
    gamesPlayedDiff: '',
    source: '',
  };
  let savingEdit = false;
  let editError: string | null = null;

  function toDateTimeLocal(iso?: string) {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const min = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  }

  function fromDateTimeLocal(value: string) {
    // Treat as local and convert to ISO UTC string
    if (!value) return new Date().toISOString();
    const d = new Date(value);
    return d.toISOString();
  }

  function startEdit(rec: MmrRecord) {
    editingMmrId = rec.id;
    editModel = {
      timestamp: toDateTimeLocal(rec.timestamp),
      mmr: String(rec.mmr),
      gamesPlayedDiff: String(rec.gamesPlayedDiff),
      source: rec.source ?? '',
    };
    editError = null;
  }

  function cancelEdit() {
    editingMmrId = null;
    editError = null;
  }

  async function saveEdit(rec: MmrRecord) {
    if (!editingMmrId) return;
    editError = null;
    const timestampIso = fromDateTimeLocal(String(editModel.timestamp));
    const mmrVal = Number(editModel.mmr);
    const gamesVal = Number(editModel.gamesPlayedDiff);

    if (!timestampIso) {
      editError = 'timestamp is required';
      return;
    }

    if (Number.isNaN(mmrVal) || Number.isNaN(gamesVal)) {
      editError = 'MMR and games must be numbers';
      return;
    }

    savingEdit = true;
    try {
      await updateMmrRecord(editingMmrId, {
        timestamp: timestampIso,
        playlist: rec.playlist,
        mmr: mmrVal,
        gamesPlayedDiff: gamesVal,
        source: editModel.source,
      });

      const filters = buildMmrFilters();
      await mmrLogQuery.refresh({ from: filters.from, to: filters.to });
      editingMmrId = null;
    } catch (err) {
      editError = err instanceof Error ? err.message : 'Unable to save changes';
    } finally {
      savingEdit = false;
    }
  }

  function arraysEqual(a: string[], b: string[]) {
    if (a.length !== b.length) {
      return false;
    }
    return a.every((value, index) => b[index] === value);
  }

  $: {
    const state = $mmrLogQuery;
    mmrLoading = state.loading;
    mmrError = state.error;
    const records = state.data;
    const uniquePlaylists = Array.from(new Set(records.map((record) => record.playlist))).sort();

    if (!arraysEqual(playlists, uniquePlaylists)) {
      playlists = uniquePlaylists;
    }

    if (!selectedPlaylists.length && uniquePlaylists.length) {
      selectedPlaylists = [...uniquePlaylists];
    } else if (selectedPlaylists.length) {
      const preserved = selectedPlaylists.filter((playlist) => uniquePlaylists.includes(playlist));
      if (!arraysEqual(preserved, selectedPlaylists)) {
        selectedPlaylists = preserved.length ? preserved : [...uniquePlaylists];
      }
    }

    if (!selectedPlaylist || !uniquePlaylists.includes(selectedPlaylist)) {
      selectedPlaylist = uniquePlaylists.length ? uniquePlaylists[0] : null;
    }

    const grouped: Record<string, MmrRecord[]> = {};
    for (const record of records) {
      if (selectedPlaylists.length && !selectedPlaylists.includes(record.playlist)) {
        continue;
      }
      grouped[record.playlist] = grouped[record.playlist] ?? [];
      grouped[record.playlist].push(record);
    }

    for (const playlist of Object.keys(grouped)) {
      grouped[playlist].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }

    mmrSeriesByPlaylist = grouped;
    mmrRecords = selectedPlaylist ? grouped[selectedPlaylist] ?? [] : [];
  }

  onMount(() => {
    void refreshHistoryData();
  });

  async function refreshHistoryData() {
    const { from, to } = buildRangeIso();
    await Promise.all([
      sessionsQuery.refresh({ start: from, end: to }),
      weeklySkillSummaryQuery.refresh(),
      mmrLogQuery.refresh({ from, to }),
    ]);
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
      const filters = buildMmrFilters();
      await mmrLogQuery.refresh({ from: filters.from, to: filters.to });
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

  function escapeCsvValue(value: string | number | null | undefined) {
    const text = value === null || value === undefined ? '' : String(value);
    if (/"|,|\n/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function buildHistoryCsv() {
    const rows: string[][] = [];
    rows.push([
      'Session Date',
      'Duration (min)',
      'Source',
      'Preset',
      'Skills',
      'Notes',
    ]);
    sessions.forEach((session) => {
      const blockForSkills =
        session.blocks[0] ??
        ({
          id: 0,
          sessionId: session.id,
          type: '',
          skillIds: [],
          plannedDuration: 0,
          actualDuration: 0,
          notes: null,
        } as SessionBlock);
      rows.push([
        session.startedTime,
        String(totalDurationMinutes(session)),
        session.source,
        getPresetName(session),
        getBlockSkills(blockForSkills),
        session.notes ?? '',
      ]);
    });

    rows.push([]);
    rows.push(['MMR Playlist', 'Timestamp', 'MMR', 'Games Played Diff', 'Source']);
    const mmrRecordsForCsv = Object.values(mmrSeriesByPlaylist).flat().sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    mmrRecordsForCsv.forEach((record) => {
      rows.push([
        record.playlist,
        record.timestamp,
        String(record.mmr),
        String(record.gamesPlayedDiff),
        record.source,
      ]);
    });

    return rows.map((row) => row.map((value) => escapeCsvValue(value)).join(',')).join('\n');
  }

  async function copyTextToClipboard(text: string) {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }

  async function copyHistoryCsv() {
    exportMessage = null;
    exportError = null;
    exportLoading = true;
    try {
      const csv = buildHistoryCsv();
      await copyTextToClipboard(csv);
      exportMessage = 'History CSV copied to clipboard';
    } catch (err) {
      exportError = err instanceof Error ? err.message : 'Unable to copy CSV';
    } finally {
      exportLoading = false;
    }
  }

  async function downloadHistoryScreenshot() {
    exportMessage = null;
    exportError = null;
    exportLoading = true;
    try {
      const target = document.querySelector('.history-mmr');
      if (!target) {
        throw new Error('History card not found');
      }
      const canvas = await html2canvas(target as HTMLElement, { backgroundColor: null });
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `rocket-league-history-${new Date().toISOString()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      exportMessage = 'Screenshot downloaded';
    } catch (err) {
      exportError = err instanceof Error ? err.message : 'Unable to capture screenshot';
    } finally {
      exportLoading = false;
    }
  }

  function isDeleting(id: number) {
    return deletingIds.includes(id);
  }

  async function handleDeleteMmr(id: number) {
    if (!window.confirm('Delete this MMR record? This cannot be undone.')) {
      return;
    }

    deletingIds = [...deletingIds, id];
    try {
      await deleteMmrRecord(id);
      const filters = buildMmrFilters();
      await mmrLogQuery.refresh({ from: filters.from, to: filters.to });
    } catch (err) {
      // show a simple alert - keep UX minimal for now
      alert(err instanceof Error ? err.message : 'Unable to delete MMR record');
    } finally {
      deletingIds = deletingIds.filter((x) => x !== id);
    }
  }

  async function handleDeleteFiltered() {
    if (!window.confirm('Delete all MMR records matching the current playlist/date filters? This cannot be undone.')) {
      return;
    }

    deleteFilterLoading = true;
    exportMessage = null;
    exportError = null;
    try {
      const { from, to } = buildMmrFilters();
      const playlistValue = playlists.length && selectedPlaylist ? selectedPlaylist : '';
      const result = await deleteMmrRecords({ playlist: playlistValue || undefined, from, to });
      if (result && typeof result.deleted === 'number') {
        exportMessage = `Deleted ${result.deleted} records`;
      } else {
        exportMessage = 'Deleted matching records';
      }

      const filters = buildMmrFilters();
      await mmrLogQuery.refresh({ from: filters.from, to: filters.to });
    } catch (err) {
      exportError = err instanceof Error ? err.message : 'Unable to delete records';
    } finally {
      deleteFilterLoading = false;
    }
  }

  function buildChartMetrics(
    records: MmrRecord[],
    viewWidth: number,
    viewHeight: number,
    padding = CHART_PADDING
  ) {
    const points = records
      .map((record) => ({
        ...record,
        timestampValue: new Date(record.timestamp).getTime(),
      }))
      .sort((a, b) => a.timestampValue - b.timestampValue);

    if (!points.length) {
      return {
        points,
        coordinates: [],
        polyline: '',
        minValue: 0,
        maxValue: 0,
        startLabel: '',
        endLabel: '',
      };
    }

    const minTime = points[0].timestampValue;
    const maxTime = points[points.length - 1].timestampValue;
    const minValue = Math.min(...points.map((point) => point.mmr));
    const maxValue = Math.max(...points.map((point) => point.mmr));
    const timeRange = maxTime === minTime ? 1 : maxTime - minTime;
    const valueRange = maxValue === minValue ? 1 : maxValue - minValue;
    const innerWidth = viewWidth - padding * 2;
    const innerHeight = viewHeight - padding * 2;

    const coordinates = points.map((point) => {
      const x = padding + ((point.timestampValue - minTime) / timeRange) * innerWidth;
      const y =
        viewHeight -
        padding -
        ((point.mmr - minValue) / valueRange) * innerHeight;
      return { x, y, mmr: point.mmr, timestamp: point.timestamp };
    });

    const polyline = coordinates.map((coord) => `${coord.x.toFixed(2)},${coord.y.toFixed(2)}`).join(' ');

    return {
      points,
      coordinates,
      polyline,
      minValue,
      maxValue,
      startLabel: points[0].timestamp,
      endLabel: points[points.length - 1].timestamp,
    };
  }

  $: mmrChartMetrics = buildChartMetrics(mmrRecords, CHART_VIEW_WIDTH, CHART_VIEW_HEIGHT);
  $: chartCoordinates = mmrChartMetrics.coordinates;
  $: chartPolyline = mmrChartMetrics.polyline;
  $: chartStartLabel = mmrChartMetrics.startLabel;
  $: chartEndLabel = mmrChartMetrics.endLabel;
  $: mmrChartMinValue = mmrChartMetrics.minValue;
  $: mmrChartMaxValue = mmrChartMetrics.maxValue;
  $: comparisonSeries = selectedPlaylists.map((playlist) => {
    const seriesRecords = mmrSeriesByPlaylist[playlist] ?? [];
    const metrics = buildChartMetrics(seriesRecords, COMPARISON_CHART_WIDTH, COMPARISON_CHART_HEIGHT, COMPARISON_PADDING);
    const latestPoint = metrics.points[metrics.points.length - 1];
    return {
      playlist,
      metrics,
      latestPoint,
    };
  });
  $: latestPluginRecord = Object.values(mmrSeriesByPlaylist)
    .flat()
    .reduce<MmrRecord | null>((latest, record) => {
      if (!latest) {
        return record;
      }
      return new Date(record.timestamp).getTime() > new Date(latest.timestamp).getTime() ? record : latest;
    }, null);
  $: dataStale = !latestPluginRecord ||
    Date.now() - new Date(latestPluginRecord.timestamp).getTime() > STALE_THRESHOLD_MS;

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

    <div class="mmr-status">
      <p>
        Latest plugin submission:
        {#if latestPluginRecord}
          {formatDate(latestPluginRecord.timestamp)}
        {:else}
          — not yet received
        {/if}
      </p>
      {#if latestPluginRecord}
        <span class={`badge ${dataStale ? 'warning' : 'success'}`}>
          {dataStale ? 'No logs in 48h' : 'Receiving plugin data'}
        </span>
      {:else}
        <span class="badge offline">Awaiting plugin</span>
      {/if}
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

    <div class="history-export">
      <button type="button" class="btn-tertiary" on:click={copyHistoryCsv} disabled={exportLoading}>
        Copy history CSV
      </button>
      <button type="button" class="btn-tertiary" on:click={downloadHistoryScreenshot} disabled={exportLoading}>
        Download screenshot
      </button>
      <button type="button" class="btn-danger" on:click={handleDeleteFiltered} disabled={deleteFilterLoading}>
        {deleteFilterLoading ? 'Deleting…' : 'Delete selected data'}
      </button>
      {#if exportMessage}
        <p class="export-feedback success">{exportMessage}</p>
      {/if}
      {#if exportError}
        <p class="export-feedback offline">{exportError}</p>
      {/if}
    </div>

    {#if comparisonSeries.length}
      <div class="playlist-comparison">
        <h3>Playlist comparison</h3>
        <div class="comparison-grid">
          {#each comparisonSeries as series}
            <div class="comparison-card">
              <div class="comparison-card-header">
                <strong>{series.playlist}</strong>
                {#if series.latestPoint}
                  <span class="comparison-latest">{series.latestPoint.mmr} MMR</span>
                {/if}
              </div>
              {#if series.metrics.coordinates.length}
                <svg
                  viewBox={`0 0 ${COMPARISON_CHART_WIDTH} ${COMPARISON_CHART_HEIGHT}`}
                  role="img"
                  aria-label={`MMR small multiple for ${series.playlist}`}
                  class="comparison-chart"
                >
                  <polyline class="mmr-chart-line" points={series.metrics.polyline} />
                  {#each series.metrics.coordinates as coord}
                    <circle class="mmr-chart-point" cx={coord.x} cy={coord.y} r="2.5" />
                  {/each}
                </svg>
                <div class="comparison-meta">
                  <span>{series.metrics.minValue} — {series.metrics.maxValue} MMR</span>
                  <span>
                    {formatChartDate(series.metrics.startLabel)} — {formatChartDate(series.metrics.endLabel)}
                  </span>
                </div>
              {:else}
                <p class="comparison-empty">No records in this range.</p>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}

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

      {#if mmrRecords.length}
        <div class="mmr-records">
          <h3>MMR records for {selectedPlaylist}</h3>
          <table class="mmr-record-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>MMR</th>
                <th>Games</th>
                <th>Source</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each mmrRecords as rec}
                <tr>
                  <td>
                    {#if editingMmrId === rec.id}
                      <input type="datetime-local" bind:value={editModel.timestamp} />
                    {:else}
                      {formatDate(rec.timestamp)}
                    {/if}
                  </td>
                  <td>
                    {#if editingMmrId === rec.id}
                      <input type="number" step="1" bind:value={editModel.mmr} />
                    {:else}
                      {rec.mmr}
                    {/if}
                  </td>
                  <td>
                    {#if editingMmrId === rec.id}
                      <input type="number" step="1" bind:value={editModel.gamesPlayedDiff} />
                    {:else}
                      {rec.gamesPlayedDiff}
                    {/if}
                  </td>
                  <td>
                    {#if editingMmrId === rec.id}
                      <input type="text" bind:value={editModel.source} />
                    {:else}
                      {rec.source}
                    {/if}
                  </td>
                  <td>
                    {#if editingMmrId === rec.id}
                      <button type="button" class="btn-primary" on:click={() => saveEdit(rec)} disabled={savingEdit}>
                        {savingEdit ? 'Saving…' : 'Save'}
                      </button>
                      <button type="button" class="btn-tertiary" on:click={cancelEdit} disabled={savingEdit}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        class="btn-danger"
                        disabled={isDeleting(rec.id)}
                        on:click={() => handleDeleteMmr(rec.id)}
                      >
                        {isDeleting(rec.id) ? 'Deleting…' : 'Delete'}
                      </button>
                      {#if editError}
                        <div class="badge offline">{editError}</div>
                      {/if}
                    {:else}
                      <button type="button" class="btn-tertiary" on:click={() => startEdit(rec)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        class="btn-danger"
                        disabled={isDeleting(rec.id)}
                        on:click={() => handleDeleteMmr(rec.id)}
                      >
                        {isDeleting(rec.id) ? 'Deleting…' : 'Delete'}
                      </button>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    {/if}
  </div>

  {#if loadingSessions}
    <p>Loading sessions…</p>
  {:else if sessionError}
    <p class="badge offline">{sessionError}</p>
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

  .history-export {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
    font-size: 0.85rem;
  }

  .btn-tertiary {
    border-radius: 8px;
    padding: 0.45rem 1rem;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.25);
    color: #fff;
    cursor: pointer;
    transition: all 0.2s;
    font-weight: 500;
  }

  .btn-tertiary:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.35);
  }

  .btn-tertiary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-danger {
    border-radius: 8px;
    padding: 0.45rem 1rem;
    background: #dc2626;
    border: 1px solid #991b1b;
    color: #fff;
    cursor: pointer;
    transition: all 0.2s;
    font-weight: 500;
  }

  .btn-danger:hover:not(:disabled) {
    background: #b91c1c;
    border-color: #7f1d1d;
  }

  .btn-danger:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .export-feedback {
    margin: 0;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
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

  .mmr-status {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1rem;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .mmr-status .badge {
    font-size: 0.75rem;
    padding: 0.2rem 0.75rem;
  }

  .badge.warning {
    background: #fff4d6;
    border-color: rgba(15, 23, 42, 0.2);
    color: #4d3b00;
  }

  .playlist-comparison {
    margin-bottom: 1rem;
  }

  .playlist-comparison h3 {
    margin: 0 0 0.75rem;
    font-size: 0.85rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.8);
    font-weight: 600;
  }

  .comparison-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.75rem;
  }

  .comparison-card {
    background: rgba(15, 23, 42, 0.8);
    border-radius: 12px;
    padding: 0.85rem;
    box-shadow: var(--history-card-shadow);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .comparison-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.85rem;
    margin-bottom: 0.4rem;
    color: rgba(255, 255, 255, 0.9);
  }

  .comparison-latest {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.85);
  }

  .comparison-chart {
    width: 100%;
    height: auto;
    margin-bottom: 0.35rem;
  }

  .comparison-meta {
    display: flex;
    justify-content: space-between;
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .comparison-empty {
    margin: 0;
    padding: 0.75rem 0;
    font-size: 0.75rem;
    text-align: center;
    color: rgba(255, 255, 255, 0.7);
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

  .mmr-records {
    margin-top: 1.5rem;
  }

  .mmr-records h3 {
    margin: 0 0 0.75rem 0;
    font-size: 0.9rem;
    font-weight: 600;
    color: #fff;
  }

  .mmr-record-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  .mmr-record-table thead {
    background: rgba(255, 255, 255, 0.05);
    border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  }

  .mmr-record-table th {
    padding: 0.65rem 0.75rem;
    text-align: left;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .mmr-record-table td {
    padding: 0.65rem 0.75rem;
    color: rgba(255, 255, 255, 0.85);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .mmr-record-table tbody tr:hover {
    background: rgba(255, 255, 255, 0.02);
  }

  .mmr-record-table td:last-child {
    text-align: right;
  }

  .mmr-record-table .btn-danger {
    padding: 0.35rem 0.75rem;
    font-size: 0.75rem;
  }</style>