import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { HTTP_REQUEST_METHOD, HTTP_RESPONSE_STATUS_CODE, HTTP_ROUTE, URL_PATH, VERCUBE_DI_KEY } from '@vercube/telemetry';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';

/** Aggregate view of recorded HTTP traffic. */
export interface RequestStats {
  total: number;
  errors: number;
  averageMs: number;
  p95Ms: number;
}

/** One service's share of bootstrap time. */
export interface BootstrapHotspot {
  name: string;
  /** Wall time including nested constructions. */
  totalMs: number;
  /** Wall time excluding nested constructions. */
  selfMs: number;
}

/**
 * Derives the aggregates devtools shows from the raw span buffer.
 *
 * Everything here used to be maintained incrementally by bespoke collectors -
 * a request recorder keeping its own stats, a bootstrap profiler keeping its
 * own tree. Deriving them from spans instead means there is one source of
 * truth, and it is the same one an external tracing backend would see.
 */

/**
 * Server spans, newest first.
 *
 * @param spans - The span buffer
 * @returns The HTTP server spans
 */
export function serverSpans(spans: readonly ReadableSpan[]): ReadableSpan[] {
  return spans.filter((span) => span.kind === SpanKind.SERVER);
}

/**
 * Spans describing container construction.
 *
 * @param spans - The span buffer
 * @returns The construction spans
 */
export function bootstrapSpans(spans: readonly ReadableSpan[]): ReadableSpan[] {
  return spans.filter((span) => typeof span.attributes[VERCUBE_DI_KEY] === 'string');
}

/**
 * Duration of a span in milliseconds.
 *
 * @param span - The span
 * @returns The duration
 */
export function durationMs(span: ReadableSpan): number {
  return span.duration[0] * 1000 + span.duration[1] / 1e6;
}

/**
 * The route a server span served, falling back to its path.
 *
 * @param span - The span
 * @returns A human-readable endpoint label
 */
export function endpoint(span: ReadableSpan): string {
  const method = span.attributes[HTTP_REQUEST_METHOD] ?? '';
  const route = span.attributes[HTTP_ROUTE] ?? span.attributes[URL_PATH] ?? '';

  return `${String(method)} ${String(route)}`.trim();
}

/**
 * HTTP status recorded on a span.
 *
 * @param span - The span
 * @returns The status code, or 0 when none was recorded
 */
export function statusOf(span: ReadableSpan): number {
  const status = span.attributes[HTTP_RESPONSE_STATUS_CODE];

  if (typeof status === 'number') {
    return status;
  }

  // A span that failed before producing a response still counts as a 5xx.
  return span.status.code === SpanStatusCode.ERROR ? 500 : 0;
}

/**
 * Aggregates recorded traffic.
 *
 * @param spans - The span buffer
 * @returns Totals, error count and latency percentiles
 */
export function requestStats(spans: readonly ReadableSpan[]): RequestStats {
  const requests = serverSpans(spans);

  if (requests.length === 0) {
    return { total: 0, errors: 0, averageMs: 0, p95Ms: 0 };
  }

  const durations = requests.map((span) => durationMs(span)).sort((a, b) => a - b);
  const total = durations.reduce((sum, value) => sum + value, 0);
  const index = Math.min(durations.length - 1, Math.floor(durations.length * 0.95));

  return {
    total: requests.length,
    errors: requests.filter((span) => statusOf(span) >= 500).length,
    averageMs: round(total / durations.length),
    p95Ms: round(durations[index]),
  };
}

/**
 * Ranks services by the time spent in their own construction.
 *
 * Self time is total time minus the time spent constructing dependencies, which
 * is what tells "this service is slow" apart from "this service pulls in a slow
 * dependency". Parent links come from the spans themselves, so no separate tree
 * has to be maintained.
 *
 * @param spans - The span buffer
 * @returns Hotspots ordered by self time, slowest first
 */
export function bootstrapHotspots(spans: readonly ReadableSpan[]): BootstrapHotspot[] {
  const constructions = bootstrapSpans(spans);
  const childTime = new Map<string, number>();

  for (const span of constructions) {
    const parent = span.parentSpanContext?.spanId;

    if (parent) {
      childTime.set(parent, (childTime.get(parent) ?? 0) + durationMs(span));
    }
  }

  return constructions
    .map((span) => {
      const total = durationMs(span);

      return {
        name: String(span.attributes[VERCUBE_DI_KEY]),
        totalMs: round(total),
        selfMs: round(Math.max(0, total - (childTime.get(span.spanContext().spanId) ?? 0))),
      };
    })
    .sort((a, b) => b.selfMs - a.selfMs);
}

/**
 * Total wall time spent building the container.
 *
 * @param spans - The span buffer
 * @returns The bootstrap duration, or 0 when it was not recorded
 */
export function bootstrapTotalMs(spans: readonly ReadableSpan[]): number {
  const root = spans.find((span) => span.name === 'vercube.bootstrap');

  return root ? round(durationMs(root)) : 0;
}

/**
 * Rounds a millisecond value for transport.
 *
 * @param value - The raw value
 * @returns The value rounded to three decimals
 */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
