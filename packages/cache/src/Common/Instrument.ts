import { context, metrics, SpanKind, SpanStatusCode, trace, ValueType } from '@opentelemetry/api';
import type { Counter, Exception, Span } from '@opentelemetry/api';

/** Instrumentation scope reported for cache signals. */
const SCOPE = '@vercube/cache';

/** Attribute marking whether a lookup was served from the cache. */
export const CACHE_HIT = 'vercube.cache.hit';

/** Attribute carrying the cached function's name. */
export const CACHE_NAME = 'vercube.cache.name';

/** Lazily created counters, so no instrument exists until the cache is used. */
let lookups: Counter | undefined;
let misses: Counter | undefined;

/**
 * Counts one cache lookup.
 *
 * Hits are not counted directly: a hit is the absence of a resolve, and
 * deriving it from `lookups - misses` avoids having to decide, at the moment a
 * value comes back, whether the engine actually consulted the origin. Two
 * monotonic counters also survive being scraped at any interval, which a
 * hit/miss ratio computed in-process does not.
 *
 * @param name - The cached function's name
 */
export function countLookup(name: string): void {
  lookups ??= metrics.getMeter(SCOPE).createCounter('vercube.cache.lookups', {
    description: 'Calls to a cached function.',
    unit: '{lookup}',
    valueType: ValueType.INT,
  });

  lookups.add(1, { [CACHE_NAME]: name });
}

/**
 * Counts one cache miss and marks the active span as a miss.
 *
 * Called from inside the cached function itself, so it runs in the span opened
 * for that lookup and needs no per-call bookkeeping of its own.
 *
 * @param name - The cached function's name
 */
export function countMiss(name: string): void {
  misses ??= metrics.getMeter(SCOPE).createCounter('vercube.cache.misses', {
    description: 'Cached function calls that had to resolve the value.',
    unit: '{miss}',
    valueType: ValueType.INT,
  });

  misses.add(1, { [CACHE_NAME]: name });
  trace.getActiveSpan()?.setAttribute(CACHE_HIT, false);
}

/**
 * Traces one cache lookup.
 *
 * @param name - The cached function's name
 * @param fn - The lookup
 * @returns Whatever the lookup returned
 */
export function traceLookup<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const tracer = trace.getTracer(SCOPE);
  const parent = context.active();
  const span = tracer.startSpan(
    `cache.${name}`,
    { kind: SpanKind.CLIENT, attributes: { [CACHE_NAME]: name, [CACHE_HIT]: true } },
    parent,
  );

  return context.with(trace.setSpan(parent, span), () =>
    fn().then(
      (value) => {
        span.end();
        return value;
      },
      (error: unknown) => {
        fail(span, error);
        span.end();
        throw error;
      },
    ),
  );
}

/**
 * Records a failure on a span.
 *
 * @param span - The span to update
 * @param error - The thrown value
 */
function fail(span: Span, error: unknown): void {
  span.recordException(error as Exception);
  span.setAttribute('error.type', error instanceof Error ? error.name : typeof error);
  span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
}
