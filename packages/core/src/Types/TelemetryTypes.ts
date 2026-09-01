/**
 * Type definitions for the telemetry seam.
 *
 * Core deliberately does not depend on OpenTelemetry. It only declares the
 * smallest contract an instrumentation package can implement - `@vercube/telemetry`
 * provides the OpenTelemetry-backed implementation - and calls it exclusively
 * through {@link TelemetryRegistry}, which stays empty until something installs
 * itself. With nothing installed every instrumentation point is a single
 * `null` check.
 */
export namespace TelemetryTypes {
  /**
   * Everything a server span needs about the request it wraps.
   *
   * The route-derived fields are precomputed once at registration time (see
   * `Router.addRoute` and `RequestHandler.prepareHandler`), so producing this
   * object per request is a plain property copy.
   */
  export interface ServerSpanContext {
    /** The incoming request. */
    request: Request;

    /** Span name: `${method} ${routeTemplate}` for matched traffic, the bare method otherwise. */
    name: string;

    /** Route template such as `/users/:id`. Absent when no route matched. */
    route?: string;

    /** Controller class name. Absent when no route matched. */
    controller?: string;

    /** Handler method name. Absent when no route matched. */
    handler?: string;
  }

  /**
   * The contract core calls into. Implemented by `@vercube/telemetry`.
   */
  export interface Hooks {
    /**
     * Wraps a request in a server span and runs `fn` inside its context.
     *
     * Implementations **must** return `fn`'s result unchanged when it is a plain
     * `Response`: a route with no middlewares produces its response
     * synchronously, and turning that into a promise costs a microtask on every
     * request.
     *
     * @param context - Request and route metadata for the span
     * @param fn - The wrapped work
     * @returns Whatever `fn` returned
     */
    server(context: ServerSpanContext, fn: () => Response | Promise<Response>): Response | Promise<Response>;

    /**
     * Records an exception on the currently active span, if there is one.
     *
     * @param error - The thrown value
     */
    recordError(error: unknown): void;

    /**
     * Trace id of the currently active span, in lowercase hex.
     *
     * Lets core correlate things it already identifies - the per-request wide
     * event, for one - with the trace, without knowing anything about
     * OpenTelemetry.
     *
     * @returns The active trace id, or undefined outside a span
     */
    traceId(): string | undefined;
  }

  /**
   * Sampling strategy for server spans.
   *
   * - `always` / `never` - record everything or nothing
   * - `parent` - follow the incoming `traceparent`, sample when it is absent
   * - `{ ratio }` - deterministic head sampling on the trace id
   */
  export type Sampler = 'always' | 'never' | 'parent' | { ratio: number };

  /**
   * Which parts of the framework produce their own spans.
   */
  export interface SpanOptions {
    /**
     * One span per middleware, in addition to the server span.
     *
     * Off by default: a route with five global middlewares produces eleven
     * spans instead of one, which is rarely what you want outside debugging.
     *
     * @default false
     */
    middleware?: boolean;

    /**
     * A dedicated span around the route handler, nested in the server span.
     *
     * @default true
     */
    handler?: boolean;

    /**
     * Spans for dependency-injection container construction, which turns
     * application bootstrap into a regular trace.
     *
     * @default true in development, false in production
     */
    di?: boolean;
  }

  /**
   * Telemetry configuration, as accepted by `vercube.config.ts`.
   */
  export interface Options {
    /**
     * Master switch.
     *
     * @default true in development, false in production
     */
    enabled?: boolean;

    /**
     * Value of the `service.name` resource attribute.
     *
     * @default the `name` field of the application's package.json
     */
    serviceName?: string;

    /**
     * Value of the `service.version` resource attribute.
     */
    serviceVersion?: string;

    /**
     * Head sampling strategy.
     *
     * @default 'parent'
     */
    sampler?: Sampler;

    /**
     * Which parts of the framework produce spans.
     */
    spans?: SpanOptions;

    /**
     * Read `traceparent` / `tracestate` from incoming requests and expose an
     * injector for outgoing ones (W3C Trace Context).
     *
     * @default true
     */
    propagation?: boolean;

    /**
     * Emit metrics (request duration histogram, process gauges).
     *
     * @default true when telemetry is enabled
     */
    metrics?: boolean;

    /**
     * Ship log events to the OTLP endpoint alongside traces.
     *
     * Off by default: exporting logs is a separate cost and a separate
     * retention decision from tracing, and turning it on by surprise can
     * multiply a collector's bill.
     *
     * Requires an endpoint, from {@link Options.endpoint} or
     * `OTEL_EXPORTER_OTLP_ENDPOINT`.
     *
     * @default false
     */
    logs?: boolean;

    /**
     * OTLP/HTTP endpoint used for log export, e.g. `http://localhost:4318`.
     *
     * Traces are exported by the OpenTelemetry SDK and are configured
     * separately, through `@vercube/telemetry/sdk` or the standard
     * environment variables.
     *
     * @default process.env.OTEL_EXPORTER_OTLP_ENDPOINT
     */
    endpoint?: string;
  }
}
