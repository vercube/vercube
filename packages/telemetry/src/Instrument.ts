/**
 * The toolkit for writing an instrumented package.
 *
 * Everything a `@vercube/*` package needs to produce spans and metrics, so it
 * never has to depend on `@opentelemetry/api` itself. It is also the public
 * contract for an application's own instrumented libraries: nothing here
 * touches the HTTP layer, the plugin or the DI container, so importing it does
 * not drag the framework into a library that only wants to be traceable.
 *
 * ```ts
 * import { createInstrument, SpanKind, ValueType } from '@vercube/telemetry/instrument';
 *
 * const instrument = createInstrument('acme-billing');
 *
 * export function charge(amount: number): Promise<Receipt> {
 *   instrument.counter('acme.billing.charges', { valueType: ValueType.INT }).add(1);
 *
 *   return instrument.span('billing.charge', { kind: SpanKind.CLIENT }, () => gateway.charge(amount));
 * }
 * ```
 */
export { createInstrument } from './Instrument/Factory';
export type { Instrument } from './Instrument/Factory';

/**
 * Marks a span failed whatever the error looks like. `Instrument.span` applies
 * it for you; call it directly only when you own the span.
 */
export { errorMessage, errorType, recordFailure } from './Common/SpanUtils';

// The slice of the OpenTelemetry API an instrumented package actually needs, so
// one import covers the whole job. The full API is on `@vercube/telemetry/api`.
export { SpanKind, SpanStatusCode, ValueType } from '@opentelemetry/api';
export type {
  Attributes,
  Context,
  Counter,
  Exception,
  Histogram,
  Link,
  MetricOptions,
  Span,
  SpanContext,
  SpanOptions,
  UpDownCounter,
} from '@opentelemetry/api';
