import type { MaybePromise } from './CommonTypes';

/**
 * Types of the health check registry, `app.health`.
 */
export namespace HealthTypes {
  /**
   * Where the application is in its lifecycle, `app.state`.
   *
   * - `starting`: created, the `onStart` hooks have not finished yet
   * - `ready`: the `onStart` hooks have finished
   * - `draining`: `close()` has begun, requests are still served
   * - `closed`: `close()` has finished
   */
  export type AppState = 'starting' | 'ready' | 'draining' | 'closed';

  /**
   * Outcome of a single check.
   */
  export type CheckStatus = 'ok' | 'down';

  /**
   * Outcome of every check together.
   *
   * - `ok`: every check passed
   * - `degraded`: only non-critical checks failed, the application is still ready
   * - `down`: at least one critical check failed
   */
  export type Status = 'ok' | 'degraded' | 'down';

  /**
   * What a check function may resolve to. Nothing (or `{ status: 'ok' }`)
   * means healthy; `{ status: 'down' }` or a thrown error means unhealthy.
   */
  export type CheckOutcome = void | undefined | { status: CheckStatus; details?: unknown };

  /**
   * A check registered with `app.health.register()`.
   */
  export interface Check {
    /**
     * Unique name, such as `queue:bullmq` or `storage:uploads`. Registering a
     * name again replaces the earlier check.
     */
    name: string;

    /**
     * Whether a failure makes the application not ready. A non-critical check
     * is reported but only degrades the result.
     * @default true
     */
    critical?: boolean;

    /**
     * Milliseconds the check may take. Running longer counts as a failure.
     * Defaults to the registry timeout, `health.timeout` when the routes are on.
     */
    timeout?: number;

    /**
     * The check itself. Resolve for healthy; throw or resolve to
     * `{ status: 'down', details }` for unhealthy.
     */
    check: () => MaybePromise<CheckOutcome>;
  }

  /**
   * Result of a single check.
   */
  export interface CheckResult {
    /** Whether the check passed. */
    status: CheckStatus;

    /** Whether a failure of this check makes the application not ready. */
    critical: boolean;

    /** Milliseconds the check took. */
    duration: number;

    /** Why the check failed: the error message, or `Timed out after <n>ms`. */
    error?: string;

    /** Whatever the check returned as `details`. */
    details?: unknown;
  }

  /**
   * Result of running every registered check.
   */
  export interface Report {
    /** The aggregated status. */
    status: Status;

    /** One result per check, keyed by name. */
    checks: Record<string, CheckResult>;

    /** When the checks ran, in milliseconds since the epoch. */
    timestamp: number;
  }

  /**
   * How much of the readiness report a response shows.
   *
   * - `none`: only the overall status
   * - `summary`: the status of each check, by name
   * - `full`: also durations, error messages and details
   */
  export type DetailsLevel = 'none' | 'summary' | 'full';

  /**
   * The probe endpoints.
   */
  export type Endpoint = 'live' | 'ready' | 'startup';

  /**
   * The `health` option of `vercube.config.ts`.
   */
  export interface Options extends RegistryOptions {
    /**
     * Base path of the endpoints, giving `<path>/live`, `<path>/ready` and
     * `<path>/startup`.
     * @default '/_health'
     */
    path?: string;

    /**
     * Overrides each endpoint independently with a full path that ignores
     * `path`, or `false` to not register it.
     *
     * @example { live: '/livez', ready: '/internal/k8s/ready', startup: false }
     */
    endpoints?: Partial<Record<Endpoint, string | false>>;

    /**
     * Application checks registered at startup, next to the ones modules add.
     */
    checks?: Check[];

    /**
     * How much of the readiness report anonymous requests see. `full` exposes
     * error messages, so it needs `token`.
     * @default 'summary'
     */
    details?: DetailsLevel;

    /**
     * A request carrying `Authorization: Bearer <token>` always gets the full
     * report.
     */
    token?: string;

    /**
     * Record probe requests in telemetry traces and the devtools Requests
     * panel. Off, so frequent probes do not bury real traffic.
     * @default false
     */
    telemetry?: boolean;
  }

  /**
   * The `health` option with its defaults applied and validated.
   */
  export interface ResolvedOptions {
    /** The full path of each endpoint, `null` when it is not registered. */
    endpoints: Record<Endpoint, string | null>;

    /** Application checks. */
    checks: Check[];

    /** What anonymous requests see. */
    details: DetailsLevel;

    /** Token that unlocks the full report. */
    token: string | undefined;

    /** Default per-check timeout. */
    timeout: number | undefined;

    /** Milliseconds a report is reused. */
    cacheTtl: number | undefined;

    /** Whether probe requests are traced. */
    telemetry: boolean;
  }

  /**
   * The `health` option of a module plugin such as `QueuePlugin`: `false`
   * registers no check, an object tunes the checks it registers.
   * @default true
   */
  export type ModuleOption = boolean | { critical?: boolean; timeout?: number };

  /**
   * Settings of the registry.
   */
  export interface RegistryOptions {
    /**
     * Default per-check timeout in milliseconds.
     * @default 1000
     */
    timeout?: number;

    /**
     * Milliseconds a report is reused before the checks run again, so frequent
     * probes from many replicas do not hammer a database. `0` disables it.
     * @default 1000
     */
    cacheTtl?: number;
  }
}
