import { metrics, trace } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { ResourceMetrics } from '@opentelemetry/sdk-metrics';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';

/**
 * A tracer provider that keeps finished spans in memory.
 */
export interface TestTelemetry {
  /** The registered provider. */
  provider: BasicTracerProvider;

  /** The registered meter provider. */
  meterProvider: MeterProvider;

  /** The exporter holding the finished spans. */
  exporter: InMemorySpanExporter;

  /** Finished spans, oldest first. */
  spans(): ReadableSpan[];

  /** Finds a finished span by name. */
  span(name: string): ReadableSpan | undefined;

  /** Clears the collected spans. */
  reset(): void;

  /**
   * Waits for spans whose end was deferred - body capture defers it - to be
   * exported, then flushes the provider.
   */
  settle(): Promise<void>;

  /**
   * Collects the registered instruments and returns what they reported.
   *
   * @returns The collected metrics, newest batch last
   */
  collect(): Promise<ResourceMetrics[]>;

  /** Unregisters the providers and releases their resources. */
  shutdown(): Promise<void>;
}

/**
 * Registers an in-memory tracer provider as the global one.
 *
 * Spans are exported synchronously when they end - `SimpleSpanProcessor`, not
 * `BatchSpanProcessor` - so a test can assert on them immediately after the
 * traced call returns.
 *
 * ```ts
 * const telemetry = createTestTelemetry();
 * afterEach(() => telemetry.reset());
 * afterAll(() => telemetry.shutdown());
 *
 * await app.fetch(new Request('http://localhost/users/1'));
 * expect(telemetry.span('GET /users/:id')).toBeDefined();
 * ```
 *
 * @returns Handle to the registered provider and its collected spans
 */
export function createTestTelemetry(): TestTelemetry {
  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });

  const metricExporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  // A very long interval, because collection is driven explicitly by `collect()`
  // rather than by a timer that would fire in the middle of an assertion.
  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 2_147_483_647,
  });
  const meterProvider = new MeterProvider({ readers: [metricReader] });

  trace.setGlobalTracerProvider(provider);
  metrics.setGlobalMeterProvider(meterProvider);

  return {
    provider,
    meterProvider,
    exporter,
    spans: () => exporter.getFinishedSpans(),
    span: (name: string) => exporter.getFinishedSpans().find((span) => span.name === name),
    reset: () => exporter.reset(),
    settle: async () => {
      // Body capture reads a cloned stream before ending the span, so the span
      // is not exported yet when the response has already been returned.
      await new Promise((resolve) => setImmediate(resolve));
      await provider.forceFlush();
    },
    collect: async () => {
      await metricReader.forceFlush();
      return metricExporter.getMetrics();
    },
    shutdown: async () => {
      trace.disable();
      metrics.disable();
      await Promise.all([provider.shutdown(), meterProvider.shutdown()]);
    },
  };
}
