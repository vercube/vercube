import { createInstrument, ValueType } from '@vercube/telemetry/instrument';

/**
 * Counts rate limit decisions. A no-op until a meter provider is installed.
 *
 * Only the counter name is recorded, never the client key: keys are addresses
 * and user ids, which have no place in a metric and would blow up its cardinality.
 */
const instrument = createInstrument('@vercube/ratelimit');

/** Attribute carrying the counter name. */
export const RATE_LIMIT_NAME = 'vercube.ratelimit.name';

/**
 * Counts one request answered with 429.
 *
 * @param name - The counter name
 */
export function countLimited(name: string): void {
  instrument
    .counter('vercube.ratelimit.limited', {
      description: 'Requests rejected because the client was over its limit.',
      unit: '{request}',
      valueType: ValueType.INT,
    })
    .add(1, { [RATE_LIMIT_NAME]: name });
}

/**
 * Counts one request the storage failed to count.
 *
 * @param name - The counter name
 */
export function countError(name: string): void {
  instrument
    .counter('vercube.ratelimit.errors', {
      description: 'Requests the storage failed to count, let through or answered with 503.',
      unit: '{request}',
      valueType: ValueType.INT,
    })
    .add(1, { [RATE_LIMIT_NAME]: name });
}
