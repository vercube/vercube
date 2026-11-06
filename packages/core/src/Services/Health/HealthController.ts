import { Inject } from '@vercube/di';
import { timingSafeEqualString } from '../../Utils/Health';
import { AppLifecycle } from '../Lifecycle/AppLifecycle';
import { HealthRegistry } from './HealthRegistry';
import type { HealthTypes } from '../../Types/HealthTypes';

/** Headers of every probe response: JSON, never cached by a proxy. */
const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

/**
 * Answers the probe endpoints of the `health` option.
 *
 * Not a decorated controller: each endpoint path is configurable on its own,
 * so `HealthRoutes` registers the handlers under the resolved paths directly.
 */
export class HealthController {
  @Inject(AppLifecycle)
  private readonly gLifecycle!: AppLifecycle;

  @Inject(HealthRegistry)
  private readonly gRegistry!: HealthRegistry;

  /** The resolved `health` option. */
  private fOptions: HealthTypes.ResolvedOptions | null = null;

  /**
   * Sets the resolved `health` option.
   *
   * @param {HealthTypes.ResolvedOptions} options - The resolved option
   * @returns {void}
   */
  public configure(options: HealthTypes.ResolvedOptions): void {
    this.fOptions = options;
  }

  /**
   * Liveness: the process is up and serving. Checks nothing, so a backend
   * outage never makes Kubernetes restart a healthy process.
   *
   * @returns {Response} Always 200
   */
  public live(): Response {
    return respond(200, { status: 'ok' });
  }

  /**
   * Startup: the `onStart` hooks have finished.
   *
   * @returns {Response} 200 once started, 503 before
   */
  public startup(): Response {
    return this.gLifecycle.state === 'starting' ? respond(503, { status: 'starting' }) : respond(200, { status: 'ok' });
  }

  /**
   * Readiness: started, not draining, and every critical check passes.
   * The checks only run once the application is ready, so a starting or
   * draining instance does not reach out to its backends.
   *
   * @param {string | null} authorization - The `Authorization` header
   * @returns {Promise<Response>} 200 when ready, 503 otherwise
   */
  public async ready(authorization: string | null): Promise<Response> {
    const state = this.gLifecycle.state;

    if (state !== 'ready') {
      return respond(503, { status: state === 'starting' ? 'starting' : 'draining' });
    }

    const report = await this.gRegistry.check();

    // a close that began while the checks ran wins
    if (!this.gLifecycle.ready) {
      return respond(503, { status: 'draining' });
    }

    return respond(report.status === 'down' ? 503 : 200, present(report, this.level(authorization)));
  }

  /**
   * How much of the report this request may see.
   *
   * @param {string | null} authorization - The `Authorization` header
   * @returns {HealthTypes.DetailsLevel} The level
   * @private
   */
  private level(authorization: string | null): HealthTypes.DetailsLevel {
    const options = this.fOptions;
    const token = options?.token;

    if (token && typeof authorization === 'string') {
      const match = /^bearer\s+(.+)$/i.exec(authorization.trim());

      if (match && timingSafeEqualString(match[1], token)) {
        return 'full';
      }
    }

    // `full` without the token is what `summary` is: names and status
    const level = options?.details ?? 'summary';

    return level === 'full' ? 'summary' : level;
  }
}

/**
 * Shapes a report for a details level.
 *
 * @param {HealthTypes.Report} report - The report
 * @param {HealthTypes.DetailsLevel} level - How much to show
 * @returns {object} The response body
 */
function present(report: HealthTypes.Report, level: HealthTypes.DetailsLevel): object {
  if (level === 'none') {
    return { status: report.status };
  }

  if (level === 'summary') {
    return {
      status: report.status,
      checks: Object.fromEntries(Object.entries(report.checks).map(([name, result]) => [name, { status: result.status }])),
    };
  }

  return { status: report.status, timestamp: new Date(report.timestamp).toISOString(), checks: report.checks };
}

/**
 * Builds a probe response.
 *
 * @param {number} status - The HTTP status
 * @param {object} body - The JSON body
 * @returns {Response} The response
 */
function respond(status: number, body: object): Response {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}
