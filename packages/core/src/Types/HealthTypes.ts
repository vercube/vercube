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
