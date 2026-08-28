/**
 * Public type surface of `@vercube/devtools`.
 */
export namespace DevtoolsTypes {
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

  /** Classification of a container entry for the DI graph. */
  export type ServiceRole = 'controller' | 'middleware' | 'plugin' | 'framework' | 'service' | 'value';

  /** How a service was bound into the container. */
  export type ServiceKind = 'singleton' | 'transient' | 'instance';

  /** A single `@Inject`/`@InjectOptional` edge, as seen from the owning service. */
  export interface Dependency {
    /** Stable id of the dependency target. */
    id: string;
    /** Display name of the dependency target. */
    name: string;
    /** Property the dependency is injected into. */
    property: string;
    /** Whether the dependency was declared with `@InjectOptional`. */
    optional: boolean;
    /** Whether the dependency is actually bound in the container. */
    bound: boolean;
  }

  /** A node of the dependency injection graph. */
  export interface ServiceNode {
    id: string;
    name: string;
    kind: ServiceKind;
    role: ServiceRole;
    /** Implementation class name when it differs from the binding key. */
    implementation: string | null;
    /** Whether a singleton instance already exists. */
    instantiated: boolean;
    /** True when the key is an `Identity()` symbol. */
    symbol: boolean;
    /** Outgoing dependency edges. */
    dependencies: Dependency[];
    /** Number of other services depending on this one. */
    dependents: number;
    /** Controller base path, when the node is a controller. */
    basePath?: string;
    /** Bootstrap cost, present when the service was constructed while profiling. */
    timing?: BootstrapTiming;
  }

  /** A directed edge of the dependency injection graph. */
  export interface GraphEdge {
    from: string;
    to: string;
    property: string;
    optional: boolean;
  }

  /** The full dependency injection graph. */
  export interface Graph {
    nodes: ServiceNode[];
    edges: GraphEdge[];
    /** Dependency cycles, each expressed as the list of node ids forming the loop. */
    cycles: string[][];
    /** Number of services that were never instantiated. */
    unusedCount: number;
  }

  /** Construction cost of a single service during bootstrap. */
  export interface BootstrapTiming {
    /** Wall time including every nested dependency construction. */
    totalMs: number;
    /** Wall time excluding nested dependency construction. */
    selfMs: number;
  }

  /** A node of the bootstrap call tree. */
  export interface BootstrapNode extends BootstrapTiming {
    id: string;
    name: string;
    kind: ServiceKind;
    /** Offset from the first recorded construction, in milliseconds. */
    offsetMs: number;
    children: BootstrapNode[];
  }

  /** Aggregated bootstrap profile. */
  export interface BootstrapProfile {
    /** Whether the profiler was installed early enough to observe bootstrap. */
    available: boolean;
    /** Total wall time spanned by all recorded constructions. */
    totalMs: number;
    /** Number of instances constructed. */
    count: number;
    /** Call tree reconstructed from nested construction intervals. */
    tree: BootstrapNode[];
    /** Flat list ordered by self time descending. */
    hotspots: (BootstrapTiming & { id: string; name: string })[];
  }

  /** A handler argument as declared by parameter decorators. */
  export interface RouteArg {
    idx: number;
    type: string;
    name?: string;
    validated: boolean;
  }

  /** A middleware attached to a route. */
  export interface RouteMiddleware {
    name: string;
    phase: 'before' | 'after';
    priority: number;
    global: boolean;
  }

  /** A single registered route. */
  export interface RouteInfo {
    id: string;
    method: string;
    path: string;
    controller: string;
    handler: string;
    args: RouteArg[];
    middlewares: RouteMiddleware[];
    /** Number of `@Status`/`@Redirect`/`@SetHeader` style actions bound to the route. */
    actions: number;
    /** True for routes owned by the devtools themselves. */
    internal: boolean;
  }

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

  /** One configuration value, flattened to a dotted path. */
  export interface ConfigEntry {
    path: string;
    /** Value rendered as text. */
    value: string;
    /** True when the value was redacted. */
    redacted?: boolean;
  }

  /** Resolved application configuration. */
  export interface ConfigView {
    /** Merged `vercube.config.ts`. */
    app: ConfigEntry[];
    /** Runtime config section. */
    runtime: ConfigEntry[];
  }

  /** One mounted storage. */
  export interface StorageMount {
    name: string;
    /** Class name of the driver. */
    driver: string;
    /** Key count, or null when unavailable. */
    size: number | null;
    keys: string[];
    /** True when more keys exist than were listed. */
    truncated: boolean;
    /** Set when reading the mount failed. */
    error?: string;
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

  /** Storage and cache inspection result. */
  export interface StorageView {
    /** False when `@vercube/storage` is not in use. */
    available: boolean;
    mounts: StorageMount[];
    cache: {
      /** False when `@vercube/cache` is not in use. */
      available: boolean;
      /** Configured cache defaults, flattened. */
      defaults: ConfigEntry[];
      /** Storage mount the cache writes through, when declared. */
      mount: string | null;
    };
  }

  /** One mounted queue transport. */
  export interface QueueMount {
    /** Name the strategy is mounted under. */
    name: string;
    /** Transport it talks to, for example `bullmq`. */
    transport: string;
    /** Class name of the strategy. */
    driver: string;
    /** Whether it is connected, idle, closed or broken. */
    status: string;
    /** What the transport supports on its own. */
    capabilities: Record<string, boolean>;
    /** Set when the strategy failed. */
    error?: string;
  }

  /** One registered job handler. */
  export interface QueueHandler {
    strategy: string;
    queue: string;
    job: string;
    /** Handler, in the `Class.method` form. */
    source: string;
    /** Attempts applied when the job carries none. */
    attempts: number;
    /** Handler time limit in milliseconds, when one is set. */
    timeout?: number;
    /** Whether the payload is validated before the handler runs. */
    validated: boolean;
    /** Whether the queue is currently being consumed. */
    running: boolean;
  }

  /** Counters the transport itself reports for a queue. */
  export type QueueTransportStats = Record<string, number | undefined>;

  /** Counters the queue module keeps per queue. */
  export interface QueueMetrics {
    strategy: string;
    queue: string;
    published: number;
    processed: number;
    failed: number;
    retried: number;
    unhandled: number;
    active: number;
    lastError?: string;
  }

  /** A message sitting on a queue, read without consuming it. */
  export interface QueueMessage {
    /** Id of the message. */
    id: string;
    /** Name of the job. */
    job: string;
    /** Where it is sitting: waiting, active, delayed or failed. */
    state: string;
    /** Attempt it is on, when the transport tracks that. */
    attempt?: number;
    /** Payload preview, with credentials withheld. */
    payload?: string;
    /** Transport headers, with credentials withheld. */
    headers?: Record<string, string>;
    /** Epoch milliseconds it becomes available at, for a delayed message. */
    availableAt?: number;
    /** Why it failed, for a message kept in a failed set. */
    error?: QueueFailure;
  }

  /** What a queue holds right now, as read on demand. */
  export interface QueueMessages {
    /** Queue that was read. */
    queue: string;
    /** Strategy it was read through. */
    strategy: string;
    /** Whether the transport can be read at all. */
    peekable: boolean;
    /** The messages found. */
    messages: QueueMessage[];
    /** Set when the read failed. */
    error?: string;
  }

  /** A queue, with everything known about it. */
  export interface QueueLine extends QueueMetrics {
    /** Job names handled on this queue. */
    jobs: string[];
    /** Whether a consumer is running for it. */
    running: boolean;
    /** What the transport reports, when it reports anything. */
    stats: QueueTransportStats | null;

    /** Whether the transport can show what the queue holds. */
    peekable: boolean;
  }

  /** What went wrong on a failed attempt. */
  export interface QueueFailure {
    /** Error class name. */
    name: string;
    /** Message the error carried. */
    message: string;
    /** Stack trace, capped by the queue module. */
    stack?: string;
    /** Queue operation that failed, for errors the queue module raised. */
    operation?: string;
    /** Whether running the job again could have helped. */
    retryable?: boolean;
  }

  /** A processed job. */
  export interface QueueJob {
    /** Epoch milliseconds the attempt finished at. */
    at: number;
    strategy: string;
    queue: string;
    job: string;
    id: string;
    attempt: number;
    /** How the attempt ended. */
    status: string;
    /** Handler duration in milliseconds. */
    duration: number;
    /** What went wrong, for anything other than a completed job. */
    error?: QueueFailure;
    /** Payload preview of a failed attempt, with credentials withheld. */
    payload?: string;
    /** Transport headers of a failed attempt, with credentials withheld. */
    headers?: Record<string, string>;
    /** Handler that ran, in the `Class.method` form. */
    source?: string;
  }

  /** What the queue manager exposes about itself. */
  export interface QueueSnapshot {
    started: boolean;
    strategies: QueueMount[];
    consumers: QueueHandler[];
    metrics: QueueMetrics[];
    events: QueueJob[];
  }

  /** A batch of processed jobs pushed over the stream. */
  export interface QueueBatch {
    /** Jobs that finished since the last batch, newest first. */
    events: QueueJob[];
    /** Per-queue counters as they stand after the batch. */
    metrics: QueueMetrics[];
    /** Jobs left out because the batch was capped. */
    dropped: number;
  }

  /** Queue inspection result. */
  export interface QueueView {
    /** False when `@vercube/queue` is not in use. */
    available: boolean;
    /** Whether consumers have been started. */
    started: boolean;
    mounts: QueueMount[];
    handlers: QueueHandler[];
    queues: QueueLine[];
    /** Recently processed jobs, newest first. */
    events: QueueJob[];
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

  /** Events pushed over the devtools SSE stream. */
  export type StreamEvent =
    | { type: 'hello'; payload: { path: string } }
    | { type: 'request'; payload: RequestRecord }
    | { type: 'log'; payload: LogEntry }
    | { type: 'metrics'; payload: MetricsSample }
    | { type: 'queue'; payload: QueueBatch }
    | { type: 'ping'; payload: { at: number } };
}
