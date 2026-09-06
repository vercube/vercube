import { trace } from '@opentelemetry/api';
import { enricherPlugin } from '@vercube/logger';
import type { Logger } from '@vercube/logger';
import type { DrainContext, EvlogPlugin } from '@vercube/logger';

/** Plugin name, used by evlog for de-duplication. */
export const TRACE_CORRELATION_PLUGIN = 'vercube:trace-correlation';

/** Plugin name of the OTLP log drain. */
export const OTLP_LOGS_PLUGIN = 'vercube:otlp-logs';

/**
 * Ids of the span active right now, shaped the way `evlog/otlp` expects.
 *
 * @returns The trace and span ids, or undefined outside a span
 */
function activeIds(): { traceId: string; spanId: string } | undefined {
  const spanContext = trace.getActiveSpan()?.spanContext();

  return spanContext ? { traceId: spanContext.traceId, spanId: spanContext.spanId } : undefined;
}

/**
 * The evlog plugin half of the correlation, covering request wide events.
 *
 * evlog also ships `createTraceContextEnricher()`, which reads the inbound
 * `traceparent` header. That is not enough: a request without one still has an
 * in-process trace, and an event emitted inside a nested span belongs to that
 * span rather than the request's. This reads whatever span is actually active.
 *
 * @returns The evlog plugin
 */
export function createTraceCorrelationPlugin(): EvlogPlugin {
  return enricherPlugin(TRACE_CORRELATION_PLUGIN, ({ event }) => {
    Object.assign(event, activeIds());
  });
}

/**
 * Makes every log line carry the ids of the span it was written under.
 *
 * Two mechanisms are needed because evlog runs `enrich` only for request wide
 * events - a plain `logger.info()` never passes through it - while a context
 * provider covers exactly the calls that `enrich` misses. Registering both is
 * what makes correlation hold for every log line rather than most of them.
 *
 * @param logger - The application logger
 * @returns A function that removes the correlation again
 */
export function installTraceCorrelation(logger: Logger): () => void {
  logger.addPlugin(createTraceCorrelationPlugin());

  return logger.addContextProvider(activeIds);
}

/**
 * Ships every log event to an OTLP collector, correlated with its trace.
 *
 * evlog's OTLP adapter already emits `traceId` / `spanId` on the log record,
 * and {@link installTraceCorrelation} is what fills them in, so logs and spans
 * land in the same backend already joined.
 *
 * Batching, retry and backoff come from evlog's drain pipeline rather than a
 * hand-rolled queue.
 *
 * @param logger - The application logger
 * @param options - Endpoint and batching settings
 * @returns Flushes anything still buffered; call it on shutdown
 */
export async function installOtlpLogs(
  logger: Logger,
  options: { endpoint?: string; headers?: Record<string, string> } = {},
): Promise<() => Promise<void>> {
  const { createDrainPipeline, createOTLPDrain } = await import('@vercube/logger/otlp');

  const pipeline = createDrainPipeline<DrainContext>({ batch: { size: 50, intervalMs: 5000 } });
  const drain = pipeline(createOTLPDrain(options.endpoint ? { endpoint: options.endpoint, headers: options.headers } : {}));

  logger.addDrain(OTLP_LOGS_PLUGIN, drain);

  return () => drain.flush();
}
