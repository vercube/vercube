import { defu } from 'defu';
import { resolveHealthOptions, resolveHealthPaths } from '../../Utils/Health';
import type { ConfigTypes } from '../../Types/ConfigTypes';
import type { TelemetryTypes } from '../../Types/TelemetryTypes';

/**
 * Options contributed by packages that need telemetry configured a certain way.
 *
 * A plugin cannot express this through its `configure()` return value: those
 * are merged with `defu`, which keeps the existing value, so the shorthand
 * `telemetry: true` swallows an object patch whole. Contributions are merged
 * here instead, after the shorthand has been normalized, and still lose every
 * conflict with what the application configured.
 *
 * Module-level because the plugin config phase runs before any container
 * exists.
 */
const contributions: TelemetryTypes.Options[] = [];

/**
 * Contributes telemetry options on behalf of a package.
 *
 * @param options - The options to merge in
 * @returns A function that withdraws them again
 */
export function contributeTelemetryOptions(options: TelemetryTypes.Options): () => void {
  contributions.push(options);

  return () => {
    const index = contributions.indexOf(options);

    if (index !== -1) {
      contributions.splice(index, 1);
    }
  };
}

/**
 * Drops every contribution. Used between tests.
 */
export function clearTelemetryContributions(): void {
  contributions.length = 0;
}

/**
 * Normalizes the `telemetry` config field into a full options object.
 *
 * Both core (which needs to know whether to bind the request context) and
 * `@vercube/telemetry` (which needs every option) go through this, so the two
 * can never disagree about whether telemetry is on.
 *
 * Telemetry defaults to on in development and off in production: tracing every
 * request costs real throughput, and a production deployment should opt in
 * together with an exporter.
 *
 * @param config - The application configuration
 * @returns The resolved telemetry options
 */
export function resolveTelemetryOptions(
  config: ConfigTypes.Config,
): Required<Pick<TelemetryTypes.Options, 'enabled'>> & TelemetryTypes.Options {
  const raw = config.telemetry;
  const defaultEnabled = config.production !== true;

  const base =
    raw === undefined || typeof raw === 'boolean'
      ? { enabled: raw ?? defaultEnabled }
      : { ...raw, enabled: raw.enabled ?? defaultEnabled };

  // Kubernetes probes every few seconds on every replica: traced, they would
  // bury real traffic in traces and the devtools Requests panel.
  const probes = healthExclusions(config);
  const extra = probes ? [...contributions, { excludeExact: probes }] : contributions;

  if (extra.length === 0) {
    return base;
  }

  // `defu` gives the first argument priority and concatenates arrays, so the
  // application keeps every value it set and contributed `exclude` entries are
  // added to its own rather than replacing them.
  return defu(base, ...extra) as ReturnType<typeof resolveTelemetryOptions>;
}

/**
 * Whether telemetry is enabled for the given configuration.
 *
 * @param config - The application configuration
 * @returns True when telemetry should be active
 */
export function isTelemetryEnabled(config: ConfigTypes.Config): boolean {
  return resolveTelemetryOptions(config).enabled;
}

/**
 * The probe paths to leave out of telemetry, unless `health.telemetry` asks
 * for them. An invalid `health` option excludes nothing here: it fails the
 * boot where the routes are mounted, with a better message.
 *
 * @param config - The application configuration
 * @returns The paths, or null when there is nothing to exclude
 */
function healthExclusions(config: ConfigTypes.Config): string[] | null {
  try {
    if (resolveHealthOptions(config)?.telemetry !== false) {
      return null;
    }

    return resolveHealthPaths(config);
  } catch {
    return null;
  }
}
