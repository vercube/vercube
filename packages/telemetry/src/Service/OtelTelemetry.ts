import { context, metrics, ROOT_CONTEXT, trace } from '@opentelemetry/api';
import { INSTRUMENTATION_SCOPE } from '../Common/Attributes';
import { headersGetter, headersSetter, W3CTraceContextPropagator } from '../Common/Propagation';
import { runInSpan } from '../Common/SpanUtils';
import { Telemetry } from '../Common/Telemetry';
import type { Context, Meter, Span, SpanOptions, TextMapPropagator, Tracer } from '@opentelemetry/api';

/**
 * {@link Telemetry} implemented on the OpenTelemetry API.
 *
 * Everything here goes through `@opentelemetry/api`, never an SDK. With no
 * `TracerProvider` registered the API returns non-recording spans, so an
 * application that installs the plugin but no exporter pays almost nothing and
 * still propagates trace context correctly.
 */
export class OtelTelemetry extends Telemetry {
  /** Scope name reported for spans created through this instance. */
  private readonly fScope: string;

  /** Propagator used by {@link OtelTelemetry.inject} and {@link OtelTelemetry.extract}. */
  private readonly fPropagator: TextMapPropagator;

  /** Callbacks run by {@link OtelTelemetry.flush}. */
  private readonly fFlushers: (() => Promise<void>)[] = [];

  /**
   * @param scope - Instrumentation scope name
   * @param propagator - Trace context propagator
   */
  constructor(scope: string = INSTRUMENTATION_SCOPE, propagator: TextMapPropagator = new W3CTraceContextPropagator()) {
    super();
    this.fScope = scope;
    this.fPropagator = propagator;
  }

  /** @inheritdoc */
  public get tracer(): Tracer {
    // Resolved per call rather than cached: the API hands back a proxy tracer
    // that starts delegating as soon as a provider is registered, and caching
    // one taken before registration would be fine, but caching one taken from a
    // provider that is later replaced would not.
    return trace.getTracer(this.fScope);
  }

  /** @inheritdoc */
  public get meter(): Meter {
    return metrics.getMeter(this.fScope);
  }

  /** @inheritdoc */
  public span<T>(name: string, fn: (span: Span) => T, options: SpanOptions = {}): T {
    return runInSpan(this.tracer, name, options, context.active(), fn);
  }

  /** @inheritdoc */
  public activeSpan(): Span | undefined {
    return trace.getActiveSpan();
  }

  /** @inheritdoc */
  public get traceId(): string | undefined {
    return this.activeSpan()?.spanContext().traceId;
  }

  /** @inheritdoc */
  public get spanId(): string | undefined {
    return this.activeSpan()?.spanContext().spanId;
  }

  /** @inheritdoc */
  public inject(carrier: Headers | Record<string, string>): void {
    this.fPropagator.inject(context.active(), carrier, headersSetter);
  }

  /** @inheritdoc */
  public extract(headers: Headers | Record<string, string>): Context {
    return this.fPropagator.extract(ROOT_CONTEXT, headers, headersGetter);
  }

  /** @inheritdoc */
  public onFlush(flush: () => Promise<void>): void {
    this.fFlushers.push(flush);
  }

  /** @inheritdoc */
  public async flush(): Promise<void> {
    // Settled rather than all: one exporter failing must not stop the others
    // from getting their data out.
    await Promise.allSettled(this.fFlushers.map((flush) => flush()));
  }
}
