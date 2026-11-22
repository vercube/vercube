import { HEALTH_ENDPOINTS, resolveHealthOptions } from '@vercube/core';
import { NitroErrors } from '../Errors/Catalog';
import type { HealthTypes } from '@vercube/core';

/** The `health` option of `vercubeNitro()`. */
export type NitroHealthOption = boolean | Omit<HealthTypes.Options, 'checks' | 'token'>;

/**
 * Validates the `health` option of `vercubeNitro()` and turns it into what the
 * runtime receives: every endpoint spelled out as a full path or `false`.
 *
 * Spelled out because the runtime also loads `vercube.config.ts` and merges
 * it in, and a merged `path` or endpoint would move a probe somewhere Nitro
 * does not route. Nitro's route table is built from this option alone.
 *
 * @param option - The plugin option
 * @returns The option for the runtime, `false` when health is off
 * @throws {Error} On an invalid option, a `token` (it would be baked into the build) or `checks` (functions do not survive the build)
 */
export function resolveNitroHealth(option: NitroHealthOption | undefined): false | HealthTypes.Options {
  if (!option) {
    return false;
  }

  const raw = (option === true ? {} : option) as HealthTypes.Options;

  if (raw.token !== undefined) {
    throw NitroErrors.HEALTH_TOKEN_IN_BUILD();
  }

  if (raw.checks !== undefined) {
    throw NitroErrors.HEALTH_CHECKS_IN_BUILD();
  }

  // `full` needs the token, which only exists at runtime; the runtime checks it
  const resolved = resolveHealthOptions({ health: { ...raw, details: raw.details === 'full' ? 'summary' : raw.details } })!;
  const { path: _path, endpoints: _endpoints, ...rest } = raw;

  return {
    ...rest,
    endpoints: Object.fromEntries(HEALTH_ENDPOINTS.map((endpoint) => [endpoint, resolved.endpoints[endpoint] ?? false])),
  };
}

/**
 * The probe paths Nitro has to route to the application.
 *
 * @param option - The plugin option
 * @returns The paths, empty when health is off
 */
export function nitroHealthPaths(option: NitroHealthOption | undefined): string[] {
  const health = resolveNitroHealth(option);

  return health
    ? HEALTH_ENDPOINTS.map((endpoint) => health.endpoints?.[endpoint]).filter((path) => typeof path === 'string')
    : [];
}
