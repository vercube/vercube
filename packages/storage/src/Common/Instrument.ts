import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Exception, Span } from '@opentelemetry/api';

/**
 * Instrumentation scope reported for storage spans.
 */
const SCOPE = '@vercube/storage';

/**
 * Traces storage operations.
 *
 * This depends on `@opentelemetry/api` and nothing else: it is the contract an
 * instrumented library is supposed to speak, it is a no-op until an application
 * registers a tracer provider, and it keeps `@vercube/storage` usable without
 * the rest of the framework.
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
  const tracer = trace.getTracer(SCOPE);
  const parent = context.active();
  const span = tracer.startSpan(name, { kind: SpanKind.CLIENT, attributes }, parent);

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
