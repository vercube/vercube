import { ref, shallowRef } from 'vue';
import { decodeLogs, decodeMetrics, decodeSpans, toRequestRecords } from './otlp';
import type { DevtoolsProtocol } from '../../src/Protocol/Frames';
import type { StorageDescription } from '../../src/Services/StorageIntrospection';
import type { DevtoolsTypes } from '../../src/Types/DevtoolsTypes';
import type { IntrospectionTypes } from '@vercube/core';
import type { Describe } from '@vercube/di';
import type { Ref, ShallowRef } from 'vue';

export type Overview = DevtoolsTypes.Overview;
export type RequestRecord = DevtoolsTypes.RequestRecord;
export type Payload = DevtoolsTypes.Payload;
export type LogEntry = DevtoolsTypes.LogEntry;
export type LogLevel = DevtoolsTypes.LogLevel;
export type MetricsSample = DevtoolsTypes.MetricsSample;
export type AuditReport = DevtoolsTypes.AuditReport;
export type StorageValue = DevtoolsTypes.StorageValue;

// Structural data comes from core's introspection registry, so its shapes are
// owned by the packages that produce them rather than by devtools.
export type Graph = Describe.ContainerDescription;
export type ServiceNode = Describe.ServiceNode;
export type RouteInfo = IntrospectionTypes.RouteDescription;
export type ConfigView = IntrospectionTypes.ConfigDescription;
export type ConfigEntry = IntrospectionTypes.ConfigEntry;
export type StorageView = StorageDescription;

export const base: string = globalThis.location.pathname.replace(/\/+$/, '') || '/_devtools';

/** Cookie the server reads once the token has left the URL. */
const TOKEN_COOKIE = 'vercube_devtools_token';

/**
 * Moves a `?token=` bootstrap parameter into a cookie and drops it from the URL,
 * so the secret is not repeated on every API request, `Referer` or history entry.
 * The cookie is what authenticates later fetches, `EventSource` and downloads.
 * @returns the active token, when this instance is protected
 */
function adoptToken(): string | null {
  const params = new URLSearchParams(globalThis.location.search);
  const fromQuery = params.get('token');

  if (!fromQuery) {
    return null;
  }

  // The Cookie Store API is not available everywhere the inspector runs.
  /* oxlint-disable-next-line unicorn/no-document-cookie */
  document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(fromQuery)}; path=${base}; SameSite=Strict`;
  params.delete('token');

  const query = params.size > 0 ? `?${params}` : '';
  globalThis.history.replaceState(null, '', `${globalThis.location.pathname}${query}${globalThis.location.hash}`);

  return fromQuery;
}

const token: string | null = adoptToken();

export function apiUrl(path: string): string {
  return new URL(`${base}${path}`, globalThis.location.origin).toString();
}

/** Fetches a JSON payload from a devtools API path. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: { Accept: 'application/json', ...(token ? { 'x-devtools-token': token } : {}), ...init?.headers },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(detail || `${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

export interface Resource<T> {
  data: ShallowRef<T | null>;
  error: Ref<string | null>;
  loading: Ref<boolean>;
  reload: () => Promise<void>;
}

export function useResource<T>(path: string): Resource<T> {
  const data = shallowRef<T | null>(null);
  const message = ref<string | null>(null);
  const loading = ref(false);

  const reload = async (): Promise<void> => {
    loading.value = true;
    message.value = null;

    try {
      data.value = await api<T>(path);
    } catch (error) {
      message.value = error instanceof Error ? error.message : String(error);
    } finally {
      loading.value = false;
    }
  };

  return { data, error: message, loading, reload };
}

/**
 * Reactive wrapper around any async loader, with the same shape as
 * {@link useResource}.
 *
 * @param load - Produces the data
 * @returns The resource
 */
export function useLoader<T>(load: () => Promise<T>): Resource<T> {
  const data = shallowRef<T | null>(null);
  const message = ref<string | null>(null);
  const loading = ref(false);

  const reload = async (): Promise<void> => {
    loading.value = true;
    message.value = null;

    try {
      data.value = await load();
    } catch (error) {
      message.value = error instanceof Error ? error.message : String(error);
    } finally {
      loading.value = false;
    }
  };

  return { data, error: message, loading, reload };
}

/**
 * Fetches one introspection section.
 *
 * @param id - Section id
 * @returns The section data
 */
export async function introspect<T>(id: string): Promise<T> {
  const section = await api<{ data: T }>(`/api/introspect/${id}`);
  return section.data;
}

/**
 * Reactive wrapper around an introspection section.
 *
 * @param id - Section id
 * @returns The resource
 */
export function useIntrospection<T>(id: string): Resource<T> {
  return useLoader<T>(() => introspect<T>(id));
}

/**
 * Reads a buffered signal and decodes it.
 *
 * @param kind - `traces`, `logs` or `metrics`
 * @returns The raw OTLP payload
 */
export function signals(kind: 'traces' | 'logs' | 'metrics'): Promise<unknown> {
  return api<unknown>(`/api/signals/${kind}`);
}

/**
 * Empties a signal buffer.
 *
 * @param kind - `traces`, `logs` or `metrics`
 * @returns Resolves once the buffer is empty
 */
export async function clearSignals(kind: 'traces' | 'logs' | 'metrics'): Promise<void> {
  await api(`/api/signals/${kind}/clear`);
}

export interface StreamHandlers {
  onRequests: (records: RequestRecord[]) => void;
  onLogs: (entries: LogEntry[]) => void;
  onMetrics: (samples: MetricsSample[]) => void;
  onInvalidate: (id: string, revision: number) => void;
  onStatus: (connected: boolean) => void;
}

/**
 * Opens the devtools stream and routes every frame to a handler.
 *
 * One connection carries every channel, so a panel that wants a new signal
 * subscribes to a channel rather than opening a second stream.
 *
 * @param handlers - Per-channel callbacks
 * @returns A function that closes the stream
 */
export function openStream(handlers: StreamHandlers): () => void {
  const source = new EventSource(apiUrl('/api/stream'));

  source.addEventListener('open', () => handlers.onStatus(true));
  source.addEventListener('error', () => handlers.onStatus(false));

  source.addEventListener('frame', (event) => {
    let frame: DevtoolsProtocol.Frame;

    try {
      frame = JSON.parse((event as MessageEvent<string>).data) as DevtoolsProtocol.Frame;
    } catch {
      return;
    }

    switch (frame.ch) {
      case 'trace': {
        handlers.onRequests(toRequestRecords(decodeSpans(frame.data)));
        break;
      }
      case 'log': {
        handlers.onLogs(decodeLogs(frame.data));
        break;
      }
      case 'metric': {
        handlers.onMetrics(decodeMetrics(frame.data));
        break;
      }
      case 'introspect': {
        const payload = frame.data as DevtoolsProtocol.InvalidatePayload;
        handlers.onInvalidate(payload.id, payload.revision);
        break;
      }
      case 'control': {
        if ((frame.data as DevtoolsProtocol.ControlPayload).type === 'hello') {
          handlers.onStatus(true);
        }
        break;
      }
    }
  });

  return () => source.close();
}

/**
 * Loads the buffered request traces.
 *
 * @returns The decoded records, newest first
 */
export async function loadRequests(): Promise<RequestRecord[]> {
  return toRequestRecords(decodeSpans(await signals('traces')));
}

/**
 * Loads the buffered log events.
 *
 * @returns The decoded entries
 */
export async function loadLogs(): Promise<LogEntry[]> {
  return decodeLogs(await signals('logs')).reverse();
}

/**
 * Loads the collected metric samples.
 *
 * @returns The decoded samples, oldest first
 */
export async function loadMetrics(): Promise<MetricsSample[]> {
  return decodeMetrics(await signals('metrics'));
}

export function formatMs(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }

  if (ms >= 10) {
    return `${Math.round(ms)}ms`;
  }

  if (ms >= 1) {
    return `${ms.toFixed(1)}ms`;
  }

  return `${ms.toFixed(2)}ms`;
}

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }

  return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function formatUptime(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m ${Math.round(seconds % 60)}s`;
  }

  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/** CSS class for an HTTP status in a table cell. */
export function statusClass(status: number): string {
  if (status >= 500) {
    return 'err';
  }
  if (status >= 400) {
    return 'warn';
  }
  if (status >= 200 && status < 300) {
    return 'ok';
  }
  return '';
}

/** CSS class for an HTTP status chip. */
export function statusTone(status: number): string {
  if (status >= 500) {
    return 'red';
  }
  if (status >= 400) {
    return 'amber';
  }
  if (status >= 200 && status < 300) {
    return 'green';
  }
  return '';
}
