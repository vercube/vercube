import type { ConfigTypes } from '../../Types/ConfigTypes';
import type { TelemetryTypes } from '../../Types/TelemetryTypes';

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

  if (raw === undefined || typeof raw === 'boolean') {
    return { enabled: raw ?? defaultEnabled };
  }

  return { ...raw, enabled: raw.enabled ?? defaultEnabled };
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
