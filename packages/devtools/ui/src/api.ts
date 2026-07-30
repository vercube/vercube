import { ref, shallowRef } from 'vue';
import type { DevtoolsTypes } from '../../src/Types/DevtoolsTypes';
import type { Ref, ShallowRef } from 'vue';

export type Overview = DevtoolsTypes.Overview;
export type Graph = DevtoolsTypes.Graph;
export type ServiceNode = DevtoolsTypes.ServiceNode;
export type RouteInfo = DevtoolsTypes.RouteInfo;
export type RequestRecord = DevtoolsTypes.RequestRecord;
export type Payload = DevtoolsTypes.Payload;
export type LogEntry = DevtoolsTypes.LogEntry;
export type LogLevel = DevtoolsTypes.LogLevel;
export type ConfigView = DevtoolsTypes.ConfigView;
export type ConfigEntry = DevtoolsTypes.ConfigEntry;
export type StorageView = DevtoolsTypes.StorageView;
export type StorageValue = DevtoolsTypes.StorageValue;
export type MetricsSample = DevtoolsTypes.MetricsSample;
export type BootstrapProfile = DevtoolsTypes.BootstrapProfile;
export type BootstrapNode = DevtoolsTypes.BootstrapNode;
export type AuditReport = DevtoolsTypes.AuditReport;

export const base: string = globalThis.location.pathname.replace(/\/+$/, '') || '/_devtools';

const token: string | null = new URLSearchParams(globalThis.location.search).get('token');

export function apiUrl(path: string): string {
  const url = new URL(`${base}${path}`, globalThis.location.origin);

  if (token) {
    url.searchParams.set('token', token);
  }

  return url.toString();
}

/** Fetches a JSON payload from a devtools API path. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), { ...init, headers: { Accept: 'application/json', ...init?.headers } });

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

export interface StreamHandlers {
  onRequest: (record: RequestRecord) => void;
  onLog: (entry: LogEntry) => void;
  onMetrics: (sample: MetricsSample) => void;
  onStatus: (connected: boolean) => void;
}

export function openStream(handlers: StreamHandlers): () => void {
  const source = new EventSource(apiUrl('/api/stream'));

  source.addEventListener('hello', () => handlers.onStatus(true));
  source.addEventListener('open', () => handlers.onStatus(true));
  source.addEventListener('error', () => handlers.onStatus(false));

  /** Parses an SSE data frame; ignores malformed payloads. */
  const consume = <T>(event: Event, handle: (payload: T) => void): void => {
    try {
      handle(JSON.parse((event as MessageEvent<string>).data) as T);
    } catch {
      /* ignore malformed frames */
    }
  };

  source.addEventListener('request', (event) => consume<RequestRecord>(event, handlers.onRequest));
  source.addEventListener('log', (event) => consume<LogEntry>(event, handlers.onLog));
  source.addEventListener('metrics', (event) => consume<MetricsSample>(event, handlers.onMetrics));

  return () => source.close();
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
