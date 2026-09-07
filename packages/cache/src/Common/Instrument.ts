import { createInstrument, SpanKind, ValueType } from '@vercube/telemetry/instrument';

/**
 * Traces and counts cache activity.
 *
 * The toolkit comes from `@vercube/telemetry/instrument`, which is the only
 * place in the framework that speaks to OpenTelemetry directly, and it creates
 * no instrument until one is actually used.
 */
const instrument = createInstrument('@vercube/cache');

/** Attribute marking whether a lookup was served from the cache. */
export const CACHE_HIT = 'vercube.cache.hit';

/** Attribute carrying the cached function's name. */
export const CACHE_NAME = 'vercube.cache.name';

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
  instrument
    .counter('vercube.cache.lookups', {
      description: 'Calls to a cached function.',
      unit: '{lookup}',
      valueType: ValueType.INT,
    })
    .add(1, { [CACHE_NAME]: name });
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
  instrument
    .counter('vercube.cache.misses', {
      description: 'Cached function calls that had to resolve the value.',
      unit: '{miss}',
      valueType: ValueType.INT,
    })
    .add(1, { [CACHE_NAME]: name });

  instrument.activeSpan()?.setAttribute(CACHE_HIT, false);
}

/**
 * Traces one cache lookup.
 *
 * @param name - The cached function's name
 * @param fn - The lookup
 * @returns Whatever the lookup returned
 */
export function traceLookup<T>(name: string, fn: () => Promise<T>): Promise<T> {
  return instrument.span(`cache.${name}`, { kind: SpanKind.CLIENT, attributes: { [CACHE_NAME]: name, [CACHE_HIT]: true } }, fn);
}
