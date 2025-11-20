import { mmrLogQuery, sessionsQuery, weeklySkillSummaryQuery, skillsQuery, presetsQuery } from './queries';
import { profileStore } from './profileStore';

type UpdateListener = (event: ServerUpdateEvent) => void;

export type ServerUpdateEvent = {
  type: string;
  payload?: Record<string, unknown> | null;
  timestamp: string;
};

const listeners = new Set<UpdateListener>();
const EVENTS_PATH = '/api/updates';

function emitUpdate(event: ServerUpdateEvent) {
  for (const listener of Array.from(listeners)) {
    listener(event);
  }
}

function refreshAllData() {
  void mmrLogQuery.refresh(undefined, { force: true });
  void sessionsQuery.refresh(undefined, { force: true });
  void weeklySkillSummaryQuery.refresh(undefined, { force: true });
  void skillsQuery.refresh(undefined, { force: true });
  void presetsQuery.refresh(undefined, { force: true });
  void profileStore.refresh({ force: true });
}

export function onServerUpdate(listener: UpdateListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function parseUpdateMessage(rawData: string): ServerUpdateEvent {
  try {
    const parsed = JSON.parse(rawData);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const { type, timestamp, ...rest } = parsed as Record<string, unknown>;
      const eventType = typeof type === 'string' ? type : 'update';
      const eventTimestamp = typeof timestamp === 'string' ? timestamp : new Date().toISOString();
      const payload = Object.keys(rest).length ? (rest as Record<string, unknown>) : null;
      return {
        type: eventType,
        payload,
        timestamp: eventTimestamp,
      };
    }
  } catch (error) {
    console.warn('Unable to parse server update payload', error);
  }

  return {
    type: 'update',
    payload: null,
    timestamp: new Date().toISOString(),
  };
}

export function handleServerUpdate(update: ServerUpdateEvent) {
  emitUpdate(update);
  refreshAllData();
}

if (typeof window !== 'undefined' && 'EventSource' in window) {
  const apiBase = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');
  const updatesUrl = `${apiBase}${EVENTS_PATH}`;
  const eventSource = new EventSource(updatesUrl);

  eventSource.addEventListener('update', (event: MessageEvent) => {
    const update = parseUpdateMessage(event.data);
    handleServerUpdate(update);
  });

  eventSource.addEventListener('error', () => {
    emitUpdate({ type: 'error', payload: null, timestamp: new Date().toISOString() });
  });
}
