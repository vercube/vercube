import type { Context, Meter, Span, SpanOptions, Tracer } from '@opentelemetry/api';

/**
 * Dependency-injection token and public API for telemetry.
 *
 * Injected the same way as `Logger`:
 *
 * ```ts
 * class InvoiceService {
 *   @Inject(Telemetry)
 *   private gTelemetry!: Telemetry;
 *
 *   public async refund(id: string) {
 *     return this.gTelemetry.span('invoice.refund', (span) => {
 *       span.setAttribute('invoice.id', id);
 *       return this.doRefund(id);
 *     });
 *   }
 * }
 * ```
 *
 * The token is only bound when telemetry is enabled, so inject it with
 * `@InjectOptional` from code that must also run without it.
 */
export abstract class Telemetry {
  /** Tracer for the application's own spans. */
  public abstract get tracer(): Tracer;

  /** Meter for the application's own instruments. */
  public abstract get meter(): Meter;

  /**
   * Runs `fn` inside a new span that ends when the work settles.
   *
   * The return value is passed through unchanged, so wrapping synchronous code
   * does not make it asynchronous.
   *
   * @param name - Span name
   * @param fn - The work to trace
   * @param options - Span kind, attributes and links
   * @returns Whatever `fn` returned
   */
  public abstract span<T>(name: string, fn: (span: Span) => T, options?: SpanOptions): T;

  /** The span currently active on this async execution path, if any. */
  public abstract activeSpan(): Span | undefined;

  /** Trace id of the active span, in lowercase hex. */
  public abstract get traceId(): string | undefined;

  /** Span id of the active span, in lowercase hex. */
  public abstract get spanId(): string | undefined;

  /**
   * Writes W3C trace context headers for the active span into a carrier, so a
   * downstream service continues the same trace.
   *
   * @param carrier - `Headers` or a plain header record to write into
   */
  public abstract inject(carrier: Headers | Record<string, string>): void;

  /**
   * Reads W3C trace context headers into a context usable as a span parent.
   *
   * @param headers - Incoming headers
   * @returns A context carrying the remote parent
   */
  public abstract extract(headers: Headers | Record<string, string>): Context;

  /**
   * Registers work to run on {@link Telemetry.flush}.
   *
   * @param flush - Flushes whatever the caller has buffered
   */
  public abstract onFlush(flush: () => Promise<void>): void;

  /**
   * Pushes out everything buffered by batching drains and exporters.
   *
   * Call it before a process that may be frozen or killed goes away - a
   * serverless invocation, a graceful shutdown - or telemetry produced at the
   * very end of its life never leaves.
   */
  public abstract flush(): Promise<void>;
}
