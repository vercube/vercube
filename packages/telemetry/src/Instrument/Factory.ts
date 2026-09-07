import { context, metrics, propagation, ROOT_CONTEXT, trace } from '@opentelemetry/api';
import { isPromiseLike, recordFailure } from '../Common/SpanUtils';
import type { Context, Counter, Histogram, MetricOptions, Span, SpanOptions, Tracer, UpDownCounter } from '@opentelemetry/api';

/**
 * The instrumentation toolkit an instrumented package works against.
 *
 * Every method is a no-op until the application registers a provider, which is
 * what lets a package produce telemetry unconditionally.
 */
export interface Instrument {
  /**
   * Runs `fn` in a new span parented on the active context.
   *
   * The result is returned unchanged, so wrapping synchronous code does not
   * make it asynchronous. A synchronous throw, a rejection and a plain return
   * all end the span.
   *
   * @param name - Span name
   * @param options - Span kind, attributes and links
   * @param fn - The work to trace
   * @returns Whatever `fn` returned
   */
  span<T>(name: string, options: SpanOptions, fn: (span: Span) => T): T;

  /**
   * Same as {@link Instrument.span}, parented on an explicit context.
   *
   * This is how a background job continues the trace of the request that
   * queued it: the parent comes from {@link Instrument.extract} rather than
   * from whatever happens to be active in the worker.
   *
   * @param name - Span name
   * @param options - Span kind, attributes and links
   * @param parent - Context the span is a child of
   * @param fn - The work to trace
   * @returns Whatever `fn` returned
   */
  spanFrom<T>(name: string, options: SpanOptions, parent: Context, fn: (span: Span) => T): T;

  /**
   * A monotonic counter, created on first use and memoized by name.
   *
   * @param name - Instrument name
   * @param options - Description, unit and value type
   * @returns The counter
   */
  counter(name: string, options?: MetricOptions): Counter;

  /**
   * A counter that can go down, created on first use and memoized by name.
   *
   * @param name - Instrument name
   * @param options - Description, unit and value type
   * @returns The counter
   */
  upDownCounter(name: string, options?: MetricOptions): UpDownCounter;

  /**
   * A histogram, created on first use and memoized by name.
   *
   * @param name - Instrument name
   * @param options - Description, unit and value type
   * @returns The histogram
   */
  histogram(name: string, options?: MetricOptions): Histogram;

  /** The span active on this async execution path, if any. */
  activeSpan(): Span | undefined;

  /**
   * Writes W3C trace context for the active span into a carrier.
   *
   * @param carrier - Header record to write into
   */
  inject(carrier: Record<string, string>): void;

  /**
   * Reads W3C trace context out of a carrier into a context usable as a parent.
   *
   * @param carrier - Header record the message arrived with
   * @returns A context carrying the remote parent
   */
  extract(carrier: Record<string, string> | undefined): Context;
}

/**
 * Builds the instrumentation toolkit for one instrumentation scope.
 *
 * A `@vercube/*` package calls this once at module level and uses the result
 * everywhere it produces telemetry:
 *
 * ```ts
 * import { createInstrument, SpanKind } from '@vercube/telemetry/instrument';
 *
 * const instrument = createInstrument('@vercube/storage');
 *
 * export function traceOperation<T>(name: string, attributes: Attributes, fn: () => Promise<T>): Promise<T> {
 *   return instrument.span(name, { kind: SpanKind.CLIENT, attributes }, fn);
 * }
 * ```
 *
 * Creating the toolkit creates nothing: the tracer is resolved lazily and the
 * instruments only on first use. That matters for metrics, because the
 * OpenTelemetry metrics API has no proxy meter and an instrument created before
 * a `MeterProvider` is registered stays a no-op for the life of the process.
 *
 * @param scope - Instrumentation scope, conventionally the package name
 * @returns The toolkit bound to that scope
 */
export function createInstrument(scope: string): Instrument {
  // Safe to memoize: `trace.getTracer` hands back a `ProxyTracer` that
  // delegates on every call, so a tracer taken before the provider exists
  // starts recording the moment one is registered. Meters have no such proxy,
  // which is why they are not cached the same way.
  let tracer: Tracer | undefined;

  const counters = new Map<string, Counter>();
  const upDownCounters = new Map<string, UpDownCounter>();
  const histograms = new Map<string, Histogram>();

  /**
   * Starts a span, runs the work inside it and ends it once the work settles.
   *
   * @param name - Span name
   * @param options - Span kind, attributes and links
   * @param parent - Context the span is a child of
   * @param fn - The work to trace
   * @returns Whatever the work returned
   */
  function run<T>(name: string, options: SpanOptions, parent: Context, fn: (span: Span) => T): T {
    tracer ??= trace.getTracer(scope);

    const span = tracer.startSpan(name, options, parent);

    return context.with(trace.setSpan(parent, span), () => {
      let result: T;

      // `fn` is not necessarily an async function, so a synchronous throw would
      // escape before `then` is attached and leave the span open forever.
      try {
        result = fn(span);
      } catch (error) {
        recordFailure(span, error);
        span.end();

        throw error;
      }

      if (!isPromiseLike(result)) {
        span.end();

        return result;
      }

      return (result as PromiseLike<unknown>).then(
        (value: unknown) => {
          span.end();

          return value;
        },
        (error: unknown) => {
          recordFailure(span, error);
          span.end();

          throw error;
        },
      ) as T;
    });
  }

  return {
    span: (name, options, fn) => run(name, options, context.active(), fn),

    spanFrom: (name, options, parent, fn) => run(name, options, parent, fn),

    counter(name, options) {
      let instrument = counters.get(name);

      if (!instrument) {
        instrument = metrics.getMeter(scope).createCounter(name, options);
        counters.set(name, instrument);
      }

      return instrument;
    },

    upDownCounter(name, options) {
      let instrument = upDownCounters.get(name);

      if (!instrument) {
        instrument = metrics.getMeter(scope).createUpDownCounter(name, options);
        upDownCounters.set(name, instrument);
      }

      return instrument;
    },

    histogram(name, options) {
      let instrument = histograms.get(name);

      if (!instrument) {
        instrument = metrics.getMeter(scope).createHistogram(name, options);
        histograms.set(name, instrument);
      }

      return instrument;
    },

    activeSpan: () => trace.getActiveSpan(),

    inject(carrier) {
      propagation.inject(context.active(), carrier);
    },

    extract: (carrier) => propagation.extract(ROOT_CONTEXT, carrier ?? {}),
  };
}
