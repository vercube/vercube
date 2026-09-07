import { createInstrument, SpanKind } from '@vercube/telemetry/instrument';

/**
 * Traces storage operations.
 *
 * The toolkit comes from `@vercube/telemetry/instrument`, which is the only
 * place in the framework that speaks to OpenTelemetry directly. It is a no-op
 * until an application registers a tracer provider, so this costs nothing in a
 * process that is not collecting telemetry.
 */
const instrument = createInstrument('@vercube/storage');

/**
 * Traces one storage operation.
 *
 * @param name - Operation name, e.g. `storage.getItem`
 * @param attributes - Attributes describing the operation
 * @param fn - The work to trace
 * @returns Whatever `fn` returned
 */
export function traceOperation<T>(
  name: string,
  attributes: Record<string, string | number | boolean | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  return instrument.span(name, { kind: SpanKind.CLIENT, attributes }, fn);
}
