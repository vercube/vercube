import { context, SpanKind, trace } from '@opentelemetry/api';
import { getRequestPathname, getRequestSearch } from '@vercube/core';
import {
  ERROR_TYPE,
  HTTP_REQUEST_METHOD,
  HTTP_RESPONSE_STATUS_CODE,
  HTTP_ROUTE,
  SERVER_ADDRESS,
  SERVER_PORT,
  URL_PATH,
  URL_QUERY,
  URL_SCHEME,
  USER_AGENT_ORIGINAL,
  VERCUBE_CONTROLLER,
  VERCUBE_HANDLER,
} from '../Common/Attributes';
import { errorType, failSpan, runInSpan } from '../Common/SpanUtils';
import type { Telemetry } from '../Common/Telemetry';
import type { Attributes, Histogram } from '@opentelemetry/api';
import type { TelemetryTypes } from '@vercube/core';

/**
 * Bucket boundaries for `http.server.request.duration`, in seconds.
 * Taken from the OpenTelemetry HTTP semantic conventions.
 */
const DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10];

/** Milliseconds per second, for converting the monotonic clock. */
const MS_PER_SECOND = 1000;

/**
 * The implementation core calls into.
 *
 * Turns every request into a `SERVER` span parented on the incoming
 * `traceparent`, and records the standard request duration histogram.
 */
export class CoreTelemetryHooks implements TelemetryTypes.Hooks {
  /** The telemetry facade used for tracing and propagation. */
  private readonly fTelemetry: Telemetry;

  /** Whether to read `traceparent` from incoming requests. */
  private readonly fPropagation: boolean;

  /** Whether to record the request duration histogram. */
  private readonly fMetrics: boolean;

  /** Lazily created duration histogram. */
  private fDuration: Histogram | undefined;

  /**
   * @param telemetry - The telemetry facade
   * @param options - Resolved telemetry options
   */
  constructor(telemetry: Telemetry, options: TelemetryTypes.Options) {
    this.fTelemetry = telemetry;
    this.fPropagation = options.propagation !== false;
    this.fMetrics = options.metrics !== false;
  }

  /** @inheritdoc */
  public server(
    spanContext: TelemetryTypes.ServerSpanContext,
    fn: () => Response | Promise<Response>,
  ): Response | Promise<Response> {
    const parent = this.fPropagation ? this.fTelemetry.extract(spanContext.request.headers) : context.active();
    const attributes = toAttributes(spanContext);
    const startedAt = this.fMetrics ? performance.now() : 0;

    return runInSpan(
      this.fTelemetry.tracer,
      spanContext.name,
      { kind: SpanKind.SERVER, attributes },
      parent,
      fn,
      this.fMetrics ? (_span, value, error) => this.recordDuration(attributes, startedAt, value, error) : undefined,
    );
  }

  /** @inheritdoc */
  public recordError(error: unknown): void {
    const span = trace.getActiveSpan();

    if (span) {
      failSpan(span, error);
    }
  }

  /** @inheritdoc */
  public traceId(): string | undefined {
    return trace.getActiveSpan()?.spanContext().traceId;
  }

  /**
   * Records one observation of `http.server.request.duration`.
   *
   * @param attributes - The span attributes to derive metric attributes from
   * @param startedAt - `performance.now()` taken when the request started
   * @param value - The value the request produced, normally a `Response`
   * @param error - The thrown value, when the request failed
   */
  private recordDuration(attributes: Attributes, startedAt: number, value: unknown, error: unknown): void {
    this.fDuration ??= this.fTelemetry.meter.createHistogram('http.server.request.duration', {
      description: 'Duration of HTTP server requests.',
      unit: 's',
      advice: { explicitBucketBoundaries: DURATION_BUCKETS },
    });

    // Metric attributes are deliberately a narrow subset of the span's: path
    // and query are unbounded, and putting them on a metric produces one time
    // series per URL.
    const metricAttributes: Attributes = {
      [HTTP_REQUEST_METHOD]: attributes[HTTP_REQUEST_METHOD],
      [URL_SCHEME]: attributes[URL_SCHEME],
    };

    if (attributes[HTTP_ROUTE] !== undefined) {
      metricAttributes[HTTP_ROUTE] = attributes[HTTP_ROUTE];
    }

    if (value instanceof Response) {
      metricAttributes[HTTP_RESPONSE_STATUS_CODE] = value.status;
    } else if (error !== undefined) {
      metricAttributes[ERROR_TYPE] = errorType(error);
    }

    this.fDuration.record((performance.now() - startedAt) / MS_PER_SECOND, metricAttributes);
  }
}

/**
 * Builds the span attributes for a request.
 *
 * @param spanContext - Request and route metadata
 * @returns The span attributes
 */
function toAttributes(spanContext: TelemetryTypes.ServerSpanContext): Attributes {
  const { request } = spanContext;
  const attributes: Attributes = {
    [HTTP_REQUEST_METHOD]: request.method,
    [URL_PATH]: getRequestPathname(request),
    [URL_SCHEME]: request.url.startsWith('https') ? 'https' : 'http',
  };

  const query = getRequestSearch(request);

  if (query.length > 1) {
    attributes[URL_QUERY] = query.slice(1);
  }

  const host = request.headers.get('host');

  if (host) {
    const separator = host.lastIndexOf(':');

    if (separator === -1) {
      attributes[SERVER_ADDRESS] = host;
    } else {
      attributes[SERVER_ADDRESS] = host.slice(0, separator);
      attributes[SERVER_PORT] = Number(host.slice(separator + 1)) || undefined;
    }
  }

  const userAgent = request.headers.get('user-agent');

  if (userAgent) {
    attributes[USER_AGENT_ORIGINAL] = userAgent;
  }

  if (spanContext.route !== undefined) {
    attributes[HTTP_ROUTE] = spanContext.route;
  }

  if (spanContext.controller !== undefined) {
    attributes[VERCUBE_CONTROLLER] = spanContext.controller;
  }

  if (spanContext.handler !== undefined) {
    attributes[VERCUBE_HANDLER] = spanContext.handler;
  }

  return attributes;
}
