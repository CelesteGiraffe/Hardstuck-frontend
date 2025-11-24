<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import {
    createMmrLog,
    deleteMmrRecord,
    deleteMmrRecords,
    deleteAllMmrRecords,
    exportHistoryCsv,
    importHistoryCsv,
    updateMmrRecord,
    deleteSession,
  } from './api';
  import type { Session, SessionBlock, SkillSummary, MmrRecord } from './api';
  import { useSkills } from './useSkills';
  import html2canvas from 'html2canvas';
  import Chart from 'chart.js/auto';
  import {
    mmrLogQuery,
    presetsQuery,
    sessionsQuery,
    weeklySkillSummaryQuery,
  } from './queries';
  import { formatPlaylistDisplay } from './playlistDisplay';
  import { onServerUpdate } from './serverUpdates';

  let sessions: Session[] = [];
  let expandedSessionIds: Set<number> = new Set();
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
  const CANONICAL_PLAYLISTS = [
    'Ranked 1v1',
    'Ranked 2v2',
    'Ranked 3v3',
    'Ranked 4v4',
    'Casual',
    'Rumble',
    'Hoops',
    'Dropshot',
    'Snow Day',
    'Tournament',
    'Other',
  ];
  let manualSelectedPlaylist: string = '';
  let latestPluginRecord: MmrRecord | null = null;
  let dataStale = false;
  let exportMessage: string | null = null;
  let exportError: string | null = null;
  let exportLoading = false;
  let importCsvText = '';
  let importStatusMessage: string | null = null;
  let importErrors: string[] = [];
  let importingCsv = false;
  let importFileName = '';
  let isImportDialogOpen = false;
  let deleteFilterLoading = false;
  let deleteAllLoading = false;
  let deletingIds: number[] = [];
  let deletingSessionIds: number[] = [];
  let sessionDeleteError: string | null = null;
  
  let editingMmrId: number | null = null;
  let editModel: { timestamp: string; mmr: string | number; gamesPlayedDiff: string | number; source: string } = {
    timestamp: '',
    mmr: '',
    gamesPlayedDiff: '',
    source: '',
  };
  let savingEdit = false;
  let editError: string | null = null;
  let skillChart: Chart | null = null;
  let skillChartCanvas: HTMLCanvasElement | null = null;
  let comparisonCharts: Record<string, Chart | null> = {};
  let comparisonEntries: {
    playlist: string;
    id: string;
    records: MmrRecord[];
    metrics: ReturnType<typeof buildChartMetrics>;
  }[] = [];

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
    const normalizedPlaylists = records.map((record) => formatPlaylistDisplay(record.playlist));
    const uniquePlaylists = Array.from(new Set(normalizedPlaylists)).sort();

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
      const playlistKey = formatPlaylistDisplay(record.playlist);
      if (selectedPlaylists.length && !selectedPlaylists.includes(playlistKey)) {
        continue;
      }
      grouped[playlistKey] = grouped[playlistKey] ?? [];
      grouped[playlistKey].push(record);
    }

    for (const playlist of Object.keys(grouped)) {
      grouped[playlist].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }

    mmrSeriesByPlaylist = grouped;
    mmrRecords = selectedPlaylist ? grouped[selectedPlaylist] ?? [] : [];
  }

  onMount(() => {
    const unsubscribe = onServerUpdate((event) => {
      if (event?.type === 'mmr-log' || event?.type === 'session') {
        void refreshHistoryData();
      }
    });
    void refreshHistoryData();
    return () => {
      unsubscribe();
    };
  });

  onDestroy(() => {
    if (skillChart) {
      skillChart.destroy();
      skillChart = null;
    }
    Object.values(comparisonCharts).forEach((chart) => chart?.destroy());
    comparisonCharts = {};
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
    // Prefer the manual dropdown value (canonical list). If 'Other' is chosen, use free-text.
    const playlistValue = manualSelectedPlaylist
      ? (manualSelectedPlaylist === 'Other' ? manualPlaylistValue.trim() : manualSelectedPlaylist)
      : manualPlaylistValue.trim();
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
      manualSelectedPlaylist = '';
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
        formatPlaylistDisplay(record.playlist),
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
      const target = document.querySelector('.history-chart-card');
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

  async function downloadHistoryCsvFile() {
    exportMessage = null;
    exportError = null;
    exportLoading = true;
    try {
      const { from, to } = buildRangeIso();
      const csv = await exportHistoryCsv({ from, to });
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `rocket-league-history-${new Date().toISOString()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      exportMessage = 'History CSV downloaded';
    } catch (err) {
      exportError = err instanceof Error ? err.message : 'Unable to download CSV';
    } finally {
      exportLoading = false;
    }
  }

  async function handleImportFile(event: Event) {
    const files = (event.currentTarget as HTMLInputElement).files;
    if (!files?.length) {
      importFileName = '';
      return;
    }

    importFileName = files[0].name;
    importCsvText = await files[0].text();
  }

  async function submitImportCsv() {
    if (!importCsvText.trim()) {
      importStatusMessage = 'Paste or drop CSV data before importing';
      return;
    }

    importingCsv = true;
    importStatusMessage = null;
    importErrors = [];
    try {
      const result = await importHistoryCsv(importCsvText);
      const messages = [`Imported ${result.imported} rows`];
      if (result.skipped) {
        messages.push(`skipped ${result.skipped}`);
      }
      importStatusMessage = messages.join(', ');
      importErrors = result.errors ?? [];
      await refreshHistoryData();
    } catch (err) {
      importErrors = [err instanceof Error ? err.message : 'Unable to import CSV'];
    } finally {
      importingCsv = false;
    }
  }

  function openImportDialog() {
    importStatusMessage = null;
    importErrors = [];
    isImportDialogOpen = true;
  }

  function closeImportDialog() {
    isImportDialogOpen = false;
  }

  function isDeleting(id: number) {
    return deletingIds.includes(id);
  }

  function isDeletingSession(id: number) {
    return deletingSessionIds.includes(id);
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

  async function handleDeleteAll() {
    if (!window.confirm('Delete all MMR records? This cannot be undone.')) {
      return;
    }

    deleteAllLoading = true;
    exportMessage = null;
    exportError = null;
    try {
      const result = await deleteAllMmrRecords();
      if (result && typeof result.deleted === 'number') {
        exportMessage = `Deleted ${result.deleted} records`;
      } else {
        exportMessage = 'Deleted all records';
      }

      const filters = buildMmrFilters();
      await mmrLogQuery.refresh({ from: filters.from, to: filters.to });
    } catch (err) {
      exportError = err instanceof Error ? err.message : 'Unable to delete records';
    } finally {
      deleteAllLoading = false;
    }
  }

  async function handleDeleteSession(sessionId: number) {
    if (!window.confirm('Delete this session? This cannot be undone.')) {
      return;
    }

    deletingSessionIds = [...deletingSessionIds, sessionId];
    sessionDeleteError = null;
    try {
      await deleteSession(sessionId);
      if (expandedSessionIds.has(sessionId)) {
        const next = new Set(expandedSessionIds);
        next.delete(sessionId);
        expandedSessionIds = next;
      }
      await refreshHistoryData();
    } catch (err) {
      sessionDeleteError = err instanceof Error ? err.message : 'Unable to delete session';
    } finally {
      deletingSessionIds = deletingSessionIds.filter((id) => id !== sessionId);
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
  function toDomId(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'comparison';
  }

  $: comparisonEntries = selectedPlaylists.map((playlist) => {
    const records = mmrSeriesByPlaylist[playlist] ?? [];
    return {
      playlist,
      id: `comparison-${toDomId(playlist)}`,
      records,
      metrics: buildChartMetrics(records, COMPARISON_CHART_WIDTH, COMPARISON_CHART_HEIGHT, COMPARISON_PADDING),
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

  function isSessionExpanded(sessionId: number) {
    return expandedSessionIds.has(sessionId);
  }

  function toggleSession(sessionId: number) {
    const next = new Set(expandedSessionIds);
    if (next.has(sessionId)) {
      next.delete(sessionId);
    } else {
      next.add(sessionId);
    }
    expandedSessionIds = next;
    sessionDeleteError = null;
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

  function destroySkillChart() {
    if (skillChart) {
      skillChart.destroy();
      skillChart = null;
    }
  }

  function destroyComparisonChart(id: string) {
    const chart = comparisonCharts[id];
    if (chart) {
      chart.destroy();
      delete comparisonCharts[id];
    }
  }

  function destroyAllComparisonCharts() {
    Object.keys(comparisonCharts).forEach((key) => destroyComparisonChart(key));
  }

  async function renderSkillChart() {
    if (!skillChartCanvas || summary.length === 0) {
      destroySkillChart();
      return;
    }

    await tick();
    const labels = summary.map((item) => item.name);
    const data = summary.map((item) => item.minutes);

    if (skillChart) {
      skillChart.data.labels = labels;
      skillChart.data.datasets[0].data = data;
      skillChart.update();
      return;
    }

    skillChart = new Chart(skillChartCanvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Minutes',
            data,
            backgroundColor: 'rgba(74, 124, 255, 0.7)',
            borderRadius: 12,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => `${ctx.formattedValue} minutes` } },
        },
        scales: {
          x: {
            ticks: { color: '#e5e7eb', font: { size: 11 } },
            grid: { display: false },
          },
          y: {
            ticks: { color: '#9ca3af' },
            grid: { color: 'rgba(255,255,255,0.08)' },
            beginAtZero: true,
          },
        },
      },
    });
  }

  async function renderComparisonCharts() {
    if (!comparisonEntries.length) {
      destroyAllComparisonCharts();
      return;
    }

    await tick();
    const activeIds = new Set(comparisonEntries.map((entry) => entry.id));
    Object.keys(comparisonCharts).forEach((id) => {
      if (!activeIds.has(id)) {
        destroyComparisonChart(id);
      }
    });

    comparisonEntries.forEach((entry) => {
      const canvas = document.getElementById(entry.id) as HTMLCanvasElement | null;
      if (!canvas) {
        return;
      }

      if (!entry.records.length) {
        destroyComparisonChart(entry.id);
        return;
      }

      const labels = entry.records.map((record) => formatChartDate(record.timestamp));
      const data = entry.records.map((record) => record.mmr);
      const baseColor = '#4ade80';

      if (comparisonCharts[entry.id]) {
        const chart = comparisonCharts[entry.id]!;
        chart.data.labels = labels;
        chart.data.datasets[0].data = data;
        chart.update();
        return;
      }

      comparisonCharts[entry.id] = new Chart(canvas, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: entry.playlist,
              data,
              borderColor: baseColor,
              backgroundColor: 'rgba(74, 222, 128, 0.15)',
              fill: true,
              tension: 0.35,
              pointRadius: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.formattedValue} MMR`,
              },
            },
          },
          scales: {
            x: {
              ticks: { color: '#9ca3af', maxRotation: 0 },
              grid: { display: false },
            },
            y: {
              ticks: { color: '#9ca3af' },
              grid: { color: 'rgba(255,255,255,0.08)' },
              beginAtZero: false,
            },
          },
        },
      });
    });
  }

  $: if (skillChartCanvas && summary.length && !summaryLoading) {
    void renderSkillChart();
  } else if (!summary.length) {
    destroySkillChart();
  }

  $: if (comparisonEntries.length) {
    void renderComparisonCharts();
  } else {
    destroyAllComparisonCharts();
  }

</script>

<section class="screen-content">
  <h1>History</h1>
  <p>Review your completed training sessions.</p>

  <div class="history-dashboard">
    {#if comparisonEntries.length}
      <div class="history-panel history-comparison span-6">
        <div class="panel-heading">
          <h2>Playlist comparison</h2>
          <p>Small multiples let you scan shifts across queues.</p>
        </div>

        <div class="history-export">
          <button type="button" class="btn-tertiary" on:click={copyHistoryCsv} disabled={exportLoading}>
            Copy history CSV
          </button>
          <button type="button" class="btn-tertiary" on:click={downloadHistoryCsvFile} disabled={exportLoading}>
            Download history CSV
          </button>
          <button type="button" class="btn-tertiary" on:click={openImportDialog} disabled={importingCsv}>
            {importingCsv ? 'Importing…' : 'Import history CSV'}
          </button>
          <button type="button" class="btn-tertiary" on:click={downloadHistoryScreenshot} disabled={exportLoading}>
            Download screenshot
          </button>
          <button type="button" class="btn-danger" on:click={handleDeleteFiltered} disabled={deleteFilterLoading}>
            {deleteFilterLoading ? 'Deleting…' : 'Delete selected data'}
          </button>
          <button type="button" class="btn-danger" on:click={handleDeleteAll} disabled={deleteAllLoading}>
            {deleteAllLoading ? 'Deleting…' : 'Delete all history'}
          </button>
        </div>
        {#if exportMessage}
          <p class="export-feedback success">{exportMessage}</p>
        {/if}
        {#if exportError}
          <p class="export-feedback offline">{exportError}</p>
        {/if}

        <div class="comparison-grid">
          {#each comparisonEntries as entry}
            <div class="comparison-card">
              <div class="comparison-card-header">
                <strong>{entry.playlist}</strong>
                {#if entry.records.length}
                  <span class="comparison-latest">{entry.records[entry.records.length - 1].mmr} MMR</span>
                {/if}
              </div>
              {#if entry.records.length}
                <div class="comparison-chart-container">
                  <canvas
                    id={entry.id}
                    width={COMPARISON_CHART_WIDTH}
                    height={COMPARISON_CHART_HEIGHT}
                    aria-label={`MMR small multiple for ${entry.playlist}`}
                  ></canvas>
                </div>
                <div class="comparison-meta">
                  <span>{entry.metrics.minValue} — {entry.metrics.maxValue} MMR</span>
                  <span>
                    {formatChartDate(entry.metrics.startLabel)} — {formatChartDate(entry.metrics.endLabel)}
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

    <div class="history-panel training-overview training-cluster span-6">
      <div class="panel-heading">
        <h2>Training focus</h2>
        <p>Quickly compare skill time and browse recent sessions.</p>
      </div>

      <div class="dashboard-subcard training-summary-card">
        <div class="panel-heading subheading">
          <h3>Training per skill (last 7 days)</h3>
          <p>See where you invested practice time this week.</p>
        </div>

        {#if summaryLoading}
          <p>Loading summary…</p>
        {:else if summaryError}
          <p class="badge offline">{summaryError}</p>
        {:else if summary.length === 0}
          <p>No activity recorded yet.</p>
        {:else}
          <div class="summary-chart">
            <canvas
              bind:this={skillChartCanvas}
              aria-label="Minutes practiced per skill over the last 7 days"
            ></canvas>
          </div>
        {/if}

        <div class="training-sessions">
          <div class="training-sessions-heading">
            <h3>Recent sessions</h3>
            <p>Tap a card to see block notes without leaving the dashboard.</p>
          </div>

          {#if loadingSessions}
            <p>Loading sessions…</p>
          {:else if sessionError}
            <p class="badge offline">{sessionError}</p>
          {:else if sessions.length === 0}
            <p>No sessions recorded yet. Start a preset on the Home screen!</p>
          {:else}
            <div class="history-grid compact">
              {#each sessions as session}
                <article class={`history-card ${isSessionExpanded(session.id) ? 'expanded' : ''}`}>
                  <button
                    class="history-card-toggle"
                    type="button"
                    on:click={() => toggleSession(session.id)}
                    aria-expanded={isSessionExpanded(session.id)}
                  >
                    <div class="history-card-header">
                      <div>
                        <span class="history-card-date">{formatDate(session.startedTime)}</span>
                        <p class="history-card-meta">
                          {session.source} • {getPresetName(session)}
                        </p>
                      </div>
                      <strong>{totalDurationMinutes(session)} min</strong>
                    </div>
                  </button>

                  {#if isSessionExpanded(session.id)}
                    <div class="history-card-body">
                      <div class="history-card-meta-grid">
                        <div>
                          <p class="meta-label">Started</p>
                          <p class="meta-value">{formatDate(session.startedTime)}</p>
                        </div>
                        {#if session.finishedTime}
                          <div>
                            <p class="meta-label">Finished</p>
                            <p class="meta-value">{formatDate(session.finishedTime)}</p>
                          </div>
                        {/if}
                        <div>
                          <p class="meta-label">Preset</p>
                          <p class="meta-value">{getPresetName(session)}</p>
                        </div>
                      </div>

                      {#if session.notes}
                        <div class="reflection-block">
                          <h4>Session notes</h4>
                          <p class="reflection-notes">{session.notes}</p>
                        </div>
                      {/if}

                      <div class="reflections-content">
                        {#if session.blocks.length}
                          {#each session.blocks as block, index}
                            <div class="reflection-block">
                              <div class="reflection-block-header">
                                <h4>Block {index + 1}: {block.type}</h4>
                                <span>{Math.round(block.actualDuration / 60)}m • planned {Math.round(block.plannedDuration / 60)}m</span>
                              </div>
                              <p class="reflection-skills">Skills: {getBlockSkills(block)}</p>
                              {#if block.notes}
                                <p class="reflection-notes">{block.notes}</p>
                              {:else}
                                <p class="no-reflections">No reflection recorded.</p>
                              {/if}
                            </div>
                          {/each}
                        {:else}
                          <p class="no-reflections">No blocks recorded.</p>
                        {/if}
                      </div>

                      <div class="history-card-actions">
                        <button
                          type="button"
                          class="btn-danger"
                          disabled={isDeletingSession(session.id)}
                          on:click={() => handleDeleteSession(session.id)}
                        >
                          {isDeletingSession(session.id) ? 'Deleting…' : 'Delete session'}
                        </button>
                      </div>
                      {#if sessionDeleteError && isSessionExpanded(session.id)}
                        <p class="badge offline history-card-error">{sessionDeleteError}</p>
                      {/if}
                    </div>
                  {/if}
                </article>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>

    <div class="history-panel history-chart-card mmr-cluster span-12">
      <div class="panel-heading">
        <h2>MMR insight</h2>
        <p>Filters, manual logs, and charts stay together for fast review.</p>
      </div>

      <div class="mmr-overview-grid">
        <div class="dashboard-subcard mmr-filter-card">
          <div class="panel-heading subheading">
            <h3>Filters</h3>
            <p>Choose the time window and playlists.</p>
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
        </div>

        <div class="dashboard-subcard manual-entry-card">
          <div class="panel-heading subheading">
            <h3>Manual MMR entry</h3>
            <p>Capture a reading without leaving the dashboard.</p>
          </div>

          <form class="manual-mmr-form" on:submit|preventDefault={submitManualMmr}>
            <div class="manual-mmr-fields">
              <label>
                Playlist
                <select bind:value={manualSelectedPlaylist} disabled={manualSubmitting}>
                  <option value=''>-- select --</option>
                  {#each CANONICAL_PLAYLISTS as cp}
                    <option value={cp}>{cp}</option>
                  {/each}
                </select>
              </label>

              {#if manualSelectedPlaylist === 'Other'}
                <label>
                  Playlist (other)
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
        </div>

        <div class="dashboard-subcard mmr-chart-stack">
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
                <div class="mmr-record-table-wrapper">
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
              </div>
            {/if}
          {/if}
        </div>
      </div>
    </div>
  </div>

  {#if isImportDialogOpen}
    <div class="import-dialog-backdrop" role="dialog" aria-modal="true">
      <div class="import-dialog">
        <header>
          <h3>Import history CSV</h3>
          <button type="button" class="close" on:click={closeImportDialog} aria-label="Close import dialog">
            ×
          </button>
        </header>
        <p>Paste rows from the exported CSV or upload a file to seed MMR entries. The API reports how many were imported.</p>
        <label class="import-file-label">
          Choose CSV file
          <input type="file" accept=".csv,text/csv" on:change={handleImportFile} />
        </label>
        {#if importFileName}
          <p class="file-meta">Loaded: {importFileName}</p>
        {/if}
        <textarea
          rows="5"
          placeholder="MMR Playlist,Timestamp,MMR,Games Played Diff,Source"
          bind:value={importCsvText}
        ></textarea>
        <div class="dialog-actions">
          <button type="button" class="btn-primary" on:click={submitImportCsv} disabled={!importCsvText.trim() || importingCsv}>
            {importingCsv ? 'Importing…' : 'Import CSV'}
          </button>
          <button type="button" class="btn-tertiary" on:click={closeImportDialog} disabled={importingCsv}>
            Close
          </button>
        </div>
        {#if importStatusMessage}
          <p class="import-feedback success">{importStatusMessage}</p>
        {/if}
        {#if importErrors.length}
          <div class="import-feedback offline">
            <p>Issues found:</p>
            <ul>
              {#each importErrors as error}
                <li>{error}</li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>
    </div>
  {/if}

</section>

<style>
  .history-dashboard {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 1.25rem;
    margin-bottom: 2rem;
  }

  .history-panel {
    background: var(--card-background, rgba(15, 23, 42, 0.95));
    border-radius: 16px;
    padding: 1.25rem;
    box-shadow: var(--history-card-shadow);
    color: #fff;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    grid-column: span 12;
  }

  .history-panel[class*='span-'] {
    grid-column: span 12;
  }

  @media (min-width: 1100px) {
    .history-panel.span-4 {
      grid-column: span 4;
    }

    .history-panel.span-5 {
      grid-column: span 5;
    }

    .history-panel.span-6 {
      grid-column: span 6;
    }

    .history-panel.span-7 {
      grid-column: span 7;
    }

    .history-panel.span-8 {
      grid-column: span 8;
    }
  }

  .panel-heading {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .panel-heading h2 {
    margin: 0;
  }

  .panel-heading p {
    margin: 0;
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.9rem;
  }

  .dashboard-subcard {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .training-summary-card {
    gap: 1.25rem;
  }

  .panel-heading.subheading h3 {
    margin: 0;
  }

  .panel-heading.subheading p {
    font-size: 0.85rem;
  }

  .history-summary {
    gap: 1rem;
  }

  .summary-chart {
    min-height: 220px;
  }

  .summary-chart canvas {
    width: 100%;
    height: 220px;
  }

  .training-sessions {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    margin-top: 1rem;
    padding-top: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .training-sessions-heading {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .training-sessions-heading h3 {
    margin: 0;
  }

  .manual-mmr-form {
    margin: 0;
    border: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
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
    margin-bottom: 0;
    font-size: 0.85rem;
  }

  .mmr-overview-grid {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .import-dialog-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 40;
  }

  .import-dialog {
    background: var(--card-background, rgba(15, 23, 42, 0.95));
    border-radius: 16px;
    padding: 1.25rem;
    width: min(420px, 100%);
    box-shadow: var(--history-card-shadow);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .import-dialog header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .import-dialog textarea {
    width: 100%;
    min-height: 120px;
    resize: vertical;
    border-radius: 8px;
    padding: 0.75rem;
    background: var(--input-background, rgba(15, 23, 42, 0.9));
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.2));
    color: #fff;
    font-family: inherit;
  }

  .import-dialog .file-meta {
    margin: 0;
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .import-file-label {
    display: flex;
    flex-direction: column;
    font-size: 0.85rem;
    gap: 0.25rem;
    color: rgba(255, 255, 255, 0.8);
  }

  .import-file-label input[type='file'] {
    cursor: pointer;
    color: #fff;
  }

  .dialog-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .import-dialog button.close {
    border: none;
    background: transparent;
    color: #fff;
    font-size: 1.1rem;
    cursor: pointer;
  }

  .import-dialog .import-feedback ul {
    margin: 0.25rem 0 0;
    padding-left: 1rem;
  }

  .import-feedback {
    margin: 0;
    font-size: 0.75rem;
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
    margin-bottom: 0.5rem;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.7);
  }

  @media (max-width: 640px) {
    .mmr-status {
      flex-direction: column;
      align-items: flex-start;
    }
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

  .comparison-chart-container {
    height: 150px;
    margin-bottom: 0.35rem;
  }

  .comparison-chart-container canvas {
    width: 100%;
    height: 150px;
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

  .history-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 1rem;
  }

  .history-grid.compact {
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 0.75rem;
  }

  .history-card {
    background: rgba(15, 23, 42, 0.9);
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    overflow: hidden;
    box-shadow: var(--history-card-shadow);
  }

  .history-card-toggle {
    width: 100%;
    background: transparent;
    border: none;
    color: inherit;
    padding: 1rem 1.25rem;
    text-align: left;
    cursor: pointer;
  }

  .history-grid.compact .history-card-toggle {
    padding: 0.75rem 1rem;
  }

  .history-card-toggle:focus-visible {
    outline: 2px solid rgba(74, 124, 255, 0.7);
  }

  .history-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .history-card-date {
    display: block;
    font-weight: 600;
    color: #fff;
  }

  .history-card-meta {
    margin: 0.15rem 0 0;
    color: rgba(255, 255, 255, 0.65);
    font-size: 0.85rem;
  }

  .history-grid.compact .history-card-meta {
    font-size: 0.8rem;
  }

  .history-card strong {
    font-size: 1.1rem;
  }

  .history-grid.compact .history-card strong {
    font-size: 1rem;
  }

  .history-card-body {
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    padding: 0 1.25rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    background: rgba(15, 23, 42, 0.95);
  }

  .history-grid.compact .history-card-body {
    padding: 0 1rem 1rem;
  }

  .history-card-meta-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 0.5rem;
  }

  .meta-label {
    margin: 0;
    text-transform: uppercase;
    font-size: 0.65rem;
    letter-spacing: 0.15em;
    color: rgba(255, 255, 255, 0.55);
  }

  .meta-value {
    margin: 0.15rem 0 0;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.9);
  }

  .reflections-content {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .reflection-block {
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 0.75rem;
    background: rgba(8, 13, 23, 0.9);
  }

  .reflection-block-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
  }

  .reflection-block h4 {
    margin: 0;
    font-size: 0.9rem;
  }

  .reflection-skills {
    margin: 0.35rem 0;
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .reflection-notes {
    margin: 0;
    white-space: pre-wrap;
    line-height: 1.4;
  }

  .no-reflections {
    margin: 0.25rem 0 0;
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.6);
    font-style: italic;
  }

  .history-card-actions {
    display: flex;
    justify-content: flex-end;
  }

  .history-card-error {
    margin: 0;
    margin-top: 0.5rem;
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

  .mmr-record-table-wrapper {
    overflow-x: auto;
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