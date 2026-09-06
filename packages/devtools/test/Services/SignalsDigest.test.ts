import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { describe, expect, it } from 'vitest';
import {
  bootstrapHotspots,
  bootstrapTotalMs,
  durationMs,
  endpoint,
  requestStats,
  serverSpans,
  statusOf,
} from '../../src/Services/SignalsDigest';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';

/**
 * Builds a span shaped enough for the digest helpers.
 *
 * @param overrides - Fields to set
 * @returns The span
 */
function span(overrides: Partial<ReadableSpan> & { seconds?: number } = {}): ReadableSpan {
  const { seconds = 0.01, ...rest } = overrides;

  return {
    name: 'GET /demo',
    kind: SpanKind.SERVER,
    attributes: {},
    status: { code: SpanStatusCode.UNSET },
    duration: [Math.floor(seconds), Math.round((seconds % 1) * 1e9)],
    spanContext: () => ({ spanId: 'a', traceId: 't', traceFlags: 1 }),
    ...rest,
  } as unknown as ReadableSpan;
}

describe('SignalsDigest', () => {
  it('separates server spans from the rest', () => {
    const spans = [span(), span({ kind: SpanKind.INTERNAL })];

    expect(serverSpans(spans)).toHaveLength(1);
  });

  it('converts a duration to milliseconds', () => {
    expect(durationMs(span({ seconds: 0.25 }))).toBeCloseTo(250, 0);
  });

  it('labels an endpoint by route, falling back to the path', () => {
    expect(endpoint(span({ attributes: { 'http.request.method': 'GET', 'http.route': '/users/:id' } }))).toBe('GET /users/:id');
    expect(endpoint(span({ attributes: { 'http.request.method': 'GET', 'url.path': '/users/1' } }))).toBe('GET /users/1');
  });

  it('prefers the recorded status over the span status', () => {
    expect(statusOf(span({ attributes: { 'http.response.status_code': 404 } }))).toBe(404);
  });

  it('treats a failed span with no status as a server error', () => {
    expect(statusOf(span({ status: { code: SpanStatusCode.ERROR } }))).toBe(500);
  });

  it('reports nothing recorded as zero', () => {
    expect(statusOf(span())).toBe(0);
    expect(requestStats([])).toEqual({ total: 0, errors: 0, averageMs: 0, p95Ms: 0 });
  });

  it('aggregates traffic and counts only server errors', () => {
    const stats = requestStats([
      span({ seconds: 0.01, attributes: { 'http.response.status_code': 200 } }),
      span({ seconds: 0.03, attributes: { 'http.response.status_code': 404 } }),
      span({ seconds: 0.05, attributes: { 'http.response.status_code': 500 } }),
    ]);

    expect(stats.total).toBe(3);
    // A 404 describes the request, not a fault of the server.
    expect(stats.errors).toBe(1);
    expect(stats.averageMs).toBeCloseTo(30, 0);
    expect(stats.p95Ms).toBeCloseTo(50, 0);
  });

  it('ranks bootstrap by self time, not total', () => {
    const parent = span({
      kind: SpanKind.INTERNAL,
      seconds: 0.1,
      attributes: { 'vercube.di.key': 'Outer' },
      spanContext: () => ({ spanId: 'outer', traceId: 't', traceFlags: 1 }),
    } as never);

    const child = span({
      kind: SpanKind.INTERNAL,
      seconds: 0.09,
      attributes: { 'vercube.di.key': 'Inner' },
      spanContext: () => ({ spanId: 'inner', traceId: 't', traceFlags: 1 }),
      parentSpanContext: { spanId: 'outer', traceId: 't', traceFlags: 1 },
    } as never);

    const [first] = bootstrapHotspots([parent, child]);

    // Outer spent 100ms in total but 90ms of it building Inner, so Inner is
    // what is actually slow.
    expect(first.name).toBe('Inner');
    expect(first.selfMs).toBeCloseTo(90, 0);
  });

  it('reports the bootstrap total, or zero when it was not recorded', () => {
    expect(bootstrapTotalMs([span({ name: 'vercube.bootstrap', seconds: 0.2 })])).toBeCloseTo(200, 0);
    expect(bootstrapTotalMs([span()])).toBe(0);
  });
});
