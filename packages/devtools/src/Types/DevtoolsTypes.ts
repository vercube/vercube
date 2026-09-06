/**
 * Public type surface of `@vercube/devtools`.
 */
export namespace DevtoolsTypes {
  /*
   * Structural shapes - the container graph, the route table, the flattened
   * config - are no longer declared here. They belong to the packages that
   * produce them and reach devtools through core's introspection registry
   * (`IntrospectionTypes`, `Describe`). What remains are the view models the
   * UI assembles from OpenTelemetry signals, plus devtools' own options.
   */

  /**
   * Options accepted by the devtools plugin.
   */
  export interface Options {
    /**
     * Master switch. When omitted, enabled only when `config.dev === true`.
     */
    enabled?: boolean;

    /**
     * Base path the UI and API are mounted under.
     * @default '/_devtools'
     */
    path?: string;

    /**
     * Shared secret required as `?token=` or `x-devtools-token`.
     * @default null
     */
    token?: string | null;

    /**
     * Size of the in-memory request ring buffer.
     * @default 250
     */
    maxRequests?: number;

    /**
     * Record per-request timelines (middleware and handler spans).
     * @default true
     */
    trackRequests?: boolean;

    /**
     * Capture request/response headers. Sensitive headers are always redacted.
     * @default true
     */
    captureHeaders?: boolean;

    /**
     * Extra header names (lowercase) to redact.
     * @default []
     */
    redactHeaders?: string[];

    /**
     * Capture request and response bodies for the inspector.
     * Bodies are cloned, capped at `maxBodyBytes`, and never block the response.
     * @default true
     */
    captureBodies?: boolean;

    /**
     * Largest body kept per message, in bytes.
     * @default 65536
     */
    maxBodyBytes?: number;

    /**
     * Capture lines written through the `Logger` service.
     * @default true
     */
    captureLogs?: boolean;

    /**
     * Size of the in-memory log ring buffer.
     * @default 500
     */
    maxLogs?: number;
  }

  /** Fully resolved options, with every default applied. */
  export type ResolvedOptions = Required<Omit<Options, 'token'>> & { token: string | null };

  /** A timed segment of the request lifecycle. */
  export interface Span {
    name: string;
    kind: 'middleware:before' | 'middleware:after' | 'handler';
    /** Offset from the start of the request, in milliseconds. */
    offsetMs: number;
    durationMs: number;
  }

  /** Why a body is not available for inspection. */
  export type PayloadOmission = 'empty' | 'binary' | 'too-large' | 'streaming' | 'unreadable';

  /**
   * A captured request or response body preview.
   */
  export interface Payload {
    /** Declared content type, when the message declared one. */
    contentType: string | null;
    /** Size of the whole body in bytes, even when `text` was truncated. */
    size: number;
    /** Decoded text, absent whenever `omitted` is set. */
    text?: string;
    /** True when `text` stops short of `size`. */
    truncated: boolean;
    /** Set when there is nothing to show, explaining why. */
    omitted?: PayloadOmission;
  }

  export interface RequestRecord {
    id: string;
    method: string;
    path: string;
    query: Record<string, string>;
    status: number;
    durationMs: number;
    /** Unix epoch milliseconds. */
    startedAt: number;
    controller?: string;
    handler?: string;
    matched: boolean;
    error?: { name: string; message: string; stack?: string };
    spans: Span[];
    requestHeaders: Record<string, string>;
    responseHeaders: Record<string, string>;
    /** Present only while `captureBodies` is on. */
    requestBody?: Payload;
    responseBody?: Payload;
  }

  /**
   * One process metrics sample. Null fields mean the counter is unavailable.
   */
  export interface MetricsSample {
    /** Unix epoch milliseconds. */
    at: number;

    /** CPU usage since the previous sample, in percent of one core. */
    cpu: { total: number; user: number; system: number } | null;

    memory: {
      heapUsed: number;
      heapTotal: number;
      /** V8 heap size limit. */
      heapLimit: number | null;
      rss: number;
      external: number;
      arrayBuffers: number;
    };

    /** Event loop delay and utilisation. */
    loop: { meanMs: number; p99Ms: number; utilization: number } | null;

    /** Active handles/requests keeping the process alive, by kind. */
    resources: { total: number; kinds: Record<string, number> } | null;
  }

  /**
   * A previewed storage value, fetched on demand.
   */
  export interface StorageValue {
    mount: string;
    key: string;
    /** Runtime type label. */
    type: string;
    /** Pretty-printed JSON preview. */
    text?: string;
    /** Size of the serialised value in bytes. */
    size: number;
    /** True when `text` was truncated. */
    truncated: boolean;
    /** Set when the key is missing or the read failed. */
    error?: string;
  }

  /** Severity of a captured log line, matching the logger's own levels. */
  export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

  /** A single line captured from the application logger. */
  export interface LogEntry {
    id: string;
    level: LogLevel;
    /** String arguments of the call, joined. */
    message: string;
    /** Non-string arguments: structured fields and error details. */
    context?: Record<string, unknown>;
    /** Unix epoch milliseconds. */
    at: number;
    /** Id of the in-flight request, when the line was emitted inside one. */
    requestId?: string;
  }

  /** Severity of an audit finding. */
  export type AuditSeverity = 'error' | 'warning' | 'info';

  /** A single audit finding. */
  export interface AuditIssue {
    /** Stable identifier of the rule that produced the finding. */
    rule: string;
    severity: AuditSeverity;
    title: string;
    detail: string;
    /** Related service / route names. */
    targets: string[];
  }

  /** Result of running every audit rule. */
  export interface AuditReport {
    issues: AuditIssue[];
    score: number;
    counts: Record<AuditSeverity, number>;
  }

  /** High level application snapshot shown on the overview screen. */
  export interface Overview {
    name: string;
    version: string | null;
    runtime: { name: string; version: string };
    dev: boolean;
    production: boolean;
    /** Process uptime in seconds. */
    uptime: number;
    memory: { heapUsed: number; heapTotal: number; rss: number } | null;
    counts: {
      services: number;
      controllers: number;
      middlewares: number;
      plugins: number;
      routes: number;
      cycles: number;
      issues: number;
    };
    /** Audit score out of 100. */
    score: number;
    plugins: { name: string }[];
    globalMiddlewares: string[];
    bootstrapMs: number;
    requests: { total: number; errors: number; averageMs: number; p95Ms: number };
  }
}
