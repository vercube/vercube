import { context, SpanKind, trace } from '@opentelemetry/api';
import { getRequestPathname, getRequestSearch } from '@vercube/core';
import { bootstrapRecorder } from '../Bootstrap/BootstrapSpans';
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
import {
  addBodyEvent,
  captureRequestBody,
  captureResponseBody,
  DEFAULT_MAX_BODY_BYTES,
  REQUEST_BODY_EVENT,
  RESPONSE_BODY_EVENT,
} from '../Common/BodyCapture';
import { addHeadersEvent, REQUEST_HEADERS_EVENT, RESPONSE_HEADERS_EVENT } from '../Common/HeaderCapture';
import { errorType, failSpan, runInSpan } from '../Common/SpanUtils';
import type { BodyPreview } from '../Common/BodyCapture';
import type { Telemetry } from '../Common/Telemetry';
import type { Attributes, Histogram, Span } from '@opentelemetry/api';
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

  /** Cap on captured body bytes, or 0 when body capture is off. */
  private readonly fBodyBytes: number;

  /** Whether buffered bootstrap constructions still have to be replayed. */
  private fBootstrapPending: boolean;

  /** Path prefixes that produce no telemetry. */
  private readonly fExclude: string[];

  /** Extra header names to withhold, or null when headers are not captured. */
  private readonly fRedactHeaders: ReadonlySet<string> | null;

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
    this.fBodyBytes = resolveBodyBytes(options.spans?.bodies);
    this.fBootstrapPending = options.spans?.di !== false;
    this.fExclude = options.exclude ?? [];
    this.fRedactHeaders = resolveHeaderRedaction(options.spans?.headers);
  }

  /** @inheritdoc */
  public server(
    spanContext: TelemetryTypes.ServerSpanContext,
    fn: () => Response | Promise<Response>,
  ): Response | Promise<Response> {
    if (this.fExclude.length > 0 && this.isExcluded(getRequestPathname(spanContext.request))) {
      return fn();
    }

    if (this.fBootstrapPending) {
      // Bootstrap is over as soon as the first request arrives; replaying it
      // here is also the first moment a tracer provider is guaranteed to exist.
      this.fBootstrapPending = false;
      bootstrapRecorder.emit(this.fTelemetry.tracer);
    }

    const parent = this.fPropagation ? this.fTelemetry.extract(spanContext.request.headers) : context.active();
    const attributes = toAttributes(spanContext);
    const startedAt = this.fMetrics ? performance.now() : 0;

    // The clone has to be taken before the handler consumes the stream.
    const requestBody = this.fBodyBytes > 0 ? captureRequestBody(spanContext.request, this.fBodyBytes) : undefined;

    const redact = this.fRedactHeaders;

    return runInSpan(
      this.fTelemetry.tracer,
      spanContext.name,
      { kind: SpanKind.SERVER, attributes },
      parent,
      (span) => {
        if (redact) {
          addHeadersEvent(span, REQUEST_HEADERS_EVENT, spanContext.request.headers, redact);
        }

        return fn();
      },
      this.fMetrics || this.fBodyBytes > 0 || redact !== null
        ? (span, value, error) => {
            if (this.fMetrics) {
              this.recordDuration(attributes, startedAt, value, error);
            }

            if (redact && value instanceof Response) {
              addHeadersEvent(span, RESPONSE_HEADERS_EVENT, value.headers, redact);
            }

            return this.fBodyBytes > 0 ? this.attachBodies(span, requestBody, value) : undefined;
          }
        : undefined,
    );
  }

  /**
   * Attaches the captured request and response bodies to the span.
   *
   * The response clone is taken here rather than later: once the runtime starts
   * writing the response there is nothing left to tee.
   *
   * @param span - The server span
   * @param requestBody - The pending request body capture, if any
   * @param value - The value the request produced
   * @returns A promise that settles once both bodies have been read
   */
  private attachBodies(span: Span, requestBody: Promise<BodyPreview> | undefined, value: unknown): Promise<void> | undefined {
    const responseBody = value instanceof Response ? captureResponseBody(value, this.fBodyBytes) : undefined;

    if (!requestBody && !responseBody) {
      return undefined;
    }

    return Promise.all([requestBody, responseBody]).then(([request, response]) => {
      if (request) {
        addBodyEvent(span, REQUEST_BODY_EVENT, request);
      }

      if (response) {
        addBodyEvent(span, RESPONSE_BODY_EVENT, response);
      }
    });
  }

  /** @inheritdoc */
  public recordError(error: unknown): void {
    const span = trace.getActiveSpan();

    if (span) {
      failSpan(span, error);
    }
  }

  /**
   * Whether a path is excluded from telemetry.
   *
   * @param path - Request pathname
   * @returns True when nothing should be recorded
   */
  private isExcluded(path: string): boolean {
    return this.fExclude.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  }

  /** @inheritdoc */
  public flush(): Promise<void> {
    return this.fTelemetry.flush();
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

/**
 * Resolves the body capture cap from the option.
 *
 * @param bodies - The `spans.bodies` option
 * @returns The cap in bytes, or 0 when capture is off
 */
function resolveBodyBytes(bodies: boolean | { maxBytes?: number } | undefined): number {
  if (!bodies) {
    return 0;
  }

  return bodies === true ? DEFAULT_MAX_BODY_BYTES : (bodies.maxBytes ?? DEFAULT_MAX_BODY_BYTES);
}

/**
 * Resolves the header capture setting.
 *
 * @param headers - The `spans.headers` option
 * @returns Extra names to withhold, or null when headers are not captured
 */
function resolveHeaderRedaction(headers: boolean | { redact?: string[] } | undefined): ReadonlySet<string> | null {
  if (!headers) {
    return null;
  }

  return new Set((headers === true ? [] : (headers.redact ?? [])).map((name) => name.toLowerCase()));
}
