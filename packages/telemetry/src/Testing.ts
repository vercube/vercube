import { trace } from '@opentelemetry/api';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';

/**
 * A tracer provider that keeps finished spans in memory.
 */
export interface TestTelemetry {
  /** The registered provider. */
  provider: BasicTracerProvider;

  /** The exporter holding the finished spans. */
  exporter: InMemorySpanExporter;

  /** Finished spans, oldest first. */
  spans(): ReadableSpan[];

  /** Finds a finished span by name. */
  span(name: string): ReadableSpan | undefined;

  /** Clears the collected spans. */
  reset(): void;

  /** Unregisters the provider and releases its resources. */
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

  trace.setGlobalTracerProvider(provider);

  return {
    provider,
    exporter,
    spans: () => exporter.getFinishedSpans(),
    span: (name: string) => exporter.getFinishedSpans().find((span) => span.name === name),
    reset: () => exporter.reset(),
    shutdown: async () => {
      trace.disable();
      await provider.shutdown();
    },
  };
}
