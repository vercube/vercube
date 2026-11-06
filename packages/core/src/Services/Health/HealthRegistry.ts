import type { HealthTypes } from '../../Types/HealthTypes';

/**
 * A second key the registry is bound under. Modules that stay independent of
 * `@vercube/core` at runtime, such as `@vercube/storage`, inject it by this
 * string instead of importing the class.
 */
export const HEALTH_REGISTRY_KEY = 'vercube:health';

/** Default per-check timeout in milliseconds. */
export const DEFAULT_HEALTH_TIMEOUT = 1000;

/** Default milliseconds a report is reused. */
export const DEFAULT_HEALTH_CACHE_TTL = 1000;

/** A registered check with its defaults applied. */
interface Entry {
  name: string;
  critical: boolean;
  timeout: number | undefined;
  check: HealthTypes.Check['check'];
}

/**
 * Holds the health checks of the application, `app.health`.
 *
 * Modules register a check for each backend they depend on (a broker, a
 * store, a database), and the readiness route runs them. Registering is cheap
 * and runs nothing: checks only run when something asks for a report.
 *
 * Checks run in parallel, each bounded by its own timeout. A report is reused
 * for `cacheTtl` milliseconds, and concurrent callers share the run in
 * progress, so many replicas probing every few seconds still cost one round
 * trip per backend per interval.
 */
export class HealthRegistry {
  /** Registered checks by name, in registration order. */
  private readonly fChecks: Map<string, Entry> = new Map();

  /** Default per-check timeout. */
  private fTimeout: number = DEFAULT_HEALTH_TIMEOUT;

  /** Milliseconds a report is reused. */
  private fCacheTtl: number = DEFAULT_HEALTH_CACHE_TTL;

  /** The last report and when it expires. */
  private fCached: { report: HealthTypes.Report; expires: number } | null = null;

  /** The run in progress, shared by concurrent callers. */
  private fRunning: Promise<HealthTypes.Report> | null = null;

  /**
   * Applies the registry settings. Drops the cached report.
   *
   * @param {HealthTypes.RegistryOptions} options - Timeout and cache settings
   * @returns {void}
   */
  public configure(options: HealthTypes.RegistryOptions): void {
    if (options.timeout !== undefined) {
      this.fTimeout = assertMilliseconds('health.timeout', options.timeout);
    }

    if (options.cacheTtl !== undefined) {
      this.fCacheTtl = assertMilliseconds('health.cacheTtl', options.cacheTtl);
    }

    this.invalidate();
  }

  /**
   * Registers a check. A check registered under a name that is taken
   * replaces the earlier one.
   *
   * @param {HealthTypes.Check} check - The check
   * @returns {() => void} Removes the check again
   * @throws {TypeError} When the name is empty or the check is not a function
   */
  public register(check: HealthTypes.Check): () => void {
    if (typeof check?.name !== 'string' || check.name.trim() === '') {
      throw new TypeError('A health check needs a name');
    }

    if (typeof check.check !== 'function') {
      throw new TypeError(`The health check "${check.name}" needs a check function`);
    }

    const entry: Entry = {
      name: check.name,
      critical: check.critical !== false,
      timeout: check.timeout === undefined ? undefined : assertMilliseconds(`timeout of "${check.name}"`, check.timeout),
      check: check.check,
    };

    this.fChecks.set(entry.name, entry);
    this.invalidate();

    return () => {
      // only the registration this function belongs to, not a replacement
      if (this.fChecks.get(entry.name) === entry) {
        this.fChecks.delete(entry.name);
        this.invalidate();
      }
    };
  }

  /**
   * Removes the check registered under a name.
   *
   * @param {string} name - The check name
   * @returns {boolean} Whether a check was removed
   */
  public unregister(name: string): boolean {
    const removed = this.fChecks.delete(name);

    if (removed) {
      this.invalidate();
    }

    return removed;
  }

  /**
   * Whether a check is registered under a name.
   *
   * @param {string} name - The check name
   * @returns {boolean} True when registered
   */
  public has(name: string): boolean {
    return this.fChecks.has(name);
  }

  /**
   * Names of the registered checks, in registration order.
   */
  public get names(): string[] {
    return [...this.fChecks.keys()];
  }

  /**
   * The number of registered checks.
   */
  public get size(): number {
    return this.fChecks.size;
  }

  /**
   * The last report, while it is still fresh.
   */
  public get cached(): HealthTypes.Report | null {
    return this.fCached && this.fCached.expires > Date.now() ? this.fCached.report : null;
  }

  /**
   * Runs every check, or returns the cached report while it is fresh.
   *
   * Never throws: a check that throws, rejects or times out is reported as
   * `down`.
   *
   * @param {object} [options] - Run options
   * @param {boolean} [options.fresh] - Ignore the cached report
   * @returns {Promise<HealthTypes.Report>} The report
   */
  public check(options: { fresh?: boolean } = {}): Promise<HealthTypes.Report> {
    if (!options.fresh) {
      const cached = this.cached;

      if (cached) {
        return Promise.resolve(cached);
      }

      if (this.fRunning) {
        return this.fRunning;
      }
    }

    const running = this.runAll().then((report) => {
      // Only the latest run writes the cache: an older one finishing after a
      // `fresh` run must not replace its report, and a run the checks changed
      // under (`invalidate()` forgot it) must not be cached at all.
      if (this.fRunning !== running) {
        return report;
      }

      this.fRunning = null;

      // from when the run finished, or a check slower than the TTL (a hung
      // backend timing out) would store a report that is already stale
      if (this.fCacheTtl > 0) {
        this.fCached = { report, expires: Date.now() + this.fCacheTtl };
      }

      return report;
    });

    this.fRunning = running;

    return running;
  }

  /**
   * Drops the cached report and forgets the run in progress.
   *
   * @returns {void}
   */
  public invalidate(): void {
    this.fCached = null;
    this.fRunning = null;
  }

  /**
   * Runs every check in parallel and aggregates the results.
   *
   * @returns {Promise<HealthTypes.Report>} The report
   * @private
   */
  private async runAll(): Promise<HealthTypes.Report> {
    const timestamp = Date.now();
    const entries = [...this.fChecks.values()];
    const results = await Promise.all(entries.map((entry) => this.runOne(entry)));
    const checks: Record<string, HealthTypes.CheckResult> = {};

    let status: HealthTypes.Status = 'ok';

    for (const [index, entry] of entries.entries()) {
      const result = results[index];

      checks[entry.name] = result;

      if (result.status === 'down' && result.critical) {
        status = 'down';
      } else if (result.status === 'down' && status === 'ok') {
        status = 'degraded';
      }
    }

    return { status, checks, timestamp };
  }

  /**
   * Runs one check, bounded by its timeout.
   *
   * @param {Entry} entry - The check
   * @returns {Promise<HealthTypes.CheckResult>} Its result
   * @private
   */
  private async runOne(entry: Entry): Promise<HealthTypes.CheckResult> {
    const timeout = entry.timeout ?? this.fTimeout;
    const started = performance.now();
    const elapsed = (): number => Math.round((performance.now() - started) * 100) / 100;

    let timer: ReturnType<typeof setTimeout> | undefined;

    const expired = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), timeout);
    });

    try {
      // a synchronous throw is a failure too, hence the async wrapper
      const outcome = await Promise.race([(async () => entry.check())(), expired]);

      if (outcome === TIMED_OUT) {
        return { status: 'down', critical: entry.critical, duration: elapsed(), error: `Timed out after ${timeout}ms` };
      }

      const status = outcome && typeof outcome === 'object' && outcome.status === 'down' ? 'down' : 'ok';
      const details = outcome && typeof outcome === 'object' ? outcome.details : undefined;

      return {
        status,
        critical: entry.critical,
        duration: elapsed(),
        ...(details === undefined ? {} : { details }),
      };
    } catch (error) {
      return { status: 'down', critical: entry.critical, duration: elapsed(), error: describeError(error) };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Marks a check that ran out of time. */
const TIMED_OUT: unique symbol = Symbol('timed out');

/**
 * Reads a readable message out of whatever a check threw.
 *
 * @param {unknown} error - The thrown value
 * @returns {string} The message
 */
function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name;
  }

  return typeof error === 'string' ? error : 'Check failed';
}

/**
 * Validates a millisecond setting.
 *
 * @param {string} label - What the setting is, for the error message
 * @param {number} value - The value
 * @returns {number} The value
 * @throws {TypeError} When the value is not a finite number of at least zero
 */
function assertMilliseconds(label: string, value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be a number of milliseconds of at least 0, got ${String(value)}`);
  }

  return value;
}
