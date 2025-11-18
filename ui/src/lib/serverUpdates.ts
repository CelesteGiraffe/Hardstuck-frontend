import { mmrLogQuery } from './queries';

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

export function onServerUpdate(listener: UpdateListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function parseUpdateMessage(rawData: string): ServerUpdateEvent {
  try {
    const parsed = JSON.parse(rawData);
    if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') {
      return {
        type: parsed.type,
        payload: parsed.payload ?? null,
        timestamp: parsed.timestamp ?? new Date().toISOString(),
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

if (typeof window !== 'undefined' && 'EventSource' in window) {
  const apiBase = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');
  const updatesUrl = `${apiBase}${EVENTS_PATH}`;
  const eventSource = new EventSource(updatesUrl);

  eventSource.addEventListener('update', (event: MessageEvent) => {
    const update = parseUpdateMessage(event.data);
    emitUpdate(update);
    if (update.type.startsWith('mmr-')) {
      void mmrLogQuery.refresh(undefined, { force: true });
    }
  });

  eventSource.addEventListener('error', () => {
    emitUpdate({ type: 'error', payload: null, timestamp: new Date().toISOString() });
  });
}
