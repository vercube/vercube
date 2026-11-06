import type { ConfigTypes } from '../Types/ConfigTypes';
import type { HealthTypes } from '../Types/HealthTypes';

/** Base path of the probe endpoints when `health.path` is not set. */
export const DEFAULT_HEALTH_PATH = '/_health';

/** `shutdown.drainDelay` when `health` is on and the option is not set. */
export const DEFAULT_HEALTH_DRAIN_DELAY = 5000;

/** The probe endpoints, in the order they are registered. */
export const HEALTH_ENDPOINTS: readonly HealthTypes.Endpoint[] = ['live', 'ready', 'startup'];

/** The levels `health.details` accepts. */
const DETAILS_LEVELS: readonly HealthTypes.DetailsLevel[] = ['none', 'summary', 'full'];

/**
 * Whether the `health` option turns the probe endpoints on.
 *
 * @param {ConfigTypes.Config | undefined} config - The application configuration
 * @returns {boolean} True when the endpoints are on
 */
export function isHealthEnabled(config: ConfigTypes.Config | undefined): boolean {
  const health = config?.health;

  return health === true || (typeof health === 'object' && health !== null);
}

/**
 * Applies the defaults of the `health` option and validates it, so a typo
 * fails the boot instead of a probe silently answering 404.
 *
 * An endpoint override is a full path that ignores `path`; `false` leaves the
 * endpoint out. Paths lose a trailing slash, as the router ignores it.
 *
 * @param {ConfigTypes.Config | undefined} config - The application configuration
 * @returns {HealthTypes.ResolvedOptions | null} The resolved options, `null` when health is off
 * @throws {Error} On an empty or malformed path, two endpoints on one path, or `details: 'full'` without a token
 */
export function resolveHealthOptions(config: ConfigTypes.Config | undefined): HealthTypes.ResolvedOptions | null {
  if (!isHealthEnabled(config)) {
    return null;
  }

  const options: HealthTypes.Options = config?.health === true ? {} : (config?.health as HealthTypes.Options);
  const base = normalizeHealthPath('health.path', options.path ?? DEFAULT_HEALTH_PATH);
  const endpoints = {} as Record<HealthTypes.Endpoint, string | null>;
  const seen = new Map<string, HealthTypes.Endpoint>();

  for (const endpoint of HEALTH_ENDPOINTS) {
    const override = options.endpoints?.[endpoint];

    if (override === false) {
      endpoints[endpoint] = null;
      continue;
    }

    const path =
      override === undefined
        ? `${base === '/' ? '' : base}/${endpoint}`
        : normalizeHealthPath(`health.endpoints.${endpoint}`, override);

    const taken = seen.get(path);

    if (taken) {
      throw new Error(`health: the ${taken} and ${endpoint} endpoints are both set to ${path}, give each its own path`);
    }

    seen.set(path, endpoint);
    endpoints[endpoint] = path;
  }

  const details = options.details ?? 'summary';

  if (!DETAILS_LEVELS.includes(details)) {
    throw new Error(`health.details must be one of ${DETAILS_LEVELS.join(', ')}, got ${String(details)}`);
  }

  if (options.token !== undefined && (typeof options.token !== 'string' || options.token === '')) {
    throw new Error('health.token must be a non-empty string');
  }

  if (details === 'full' && !options.token) {
    throw new Error(
      "health.details 'full' exposes check errors to anyone who can reach the endpoint. Set health.token, requests carrying it get the full report.",
    );
  }

  return {
    endpoints,
    checks: options.checks ?? [],
    details,
    token: options.token,
    timeout: options.timeout,
    cacheTtl: options.cacheTtl,
    telemetry: options.telemetry === true,
  };
}

/**
 * The probe paths the `health` option registers, for whoever has to treat
 * them specially: telemetry leaves them out, an integration such as Nitro
 * routes them to the application.
 *
 * @param {ConfigTypes.Config | undefined} config - The application configuration
 * @returns {string[]} The registered paths, empty when health is off
 */
export function resolveHealthPaths(config: ConfigTypes.Config | undefined): string[] {
  const resolved = resolveHealthOptions(config);

  return resolved ? HEALTH_ENDPOINTS.map((endpoint) => resolved.endpoints[endpoint]).filter((path) => path !== null) : [];
}

/**
 * Set by `vercube dev` on the worker it forks. The worker is restarted with
 * SIGTERM on every change and killed a second later, so it must not drain.
 */
export const DEV_SERVER_ENV = 'VERCUBE_DEV_SERVER';

/**
 * The graceful shutdown settings with the defaults `health` brings applied:
 * a drain delay of 5000 ms and signal handling, unless set explicitly. The
 * `vercube dev` worker gets no default drain delay, nothing balances traffic
 * to it and a reload would wait for it.
 *
 * @param {ConfigTypes.Config | undefined} config - The application configuration
 * @param {Record<string, string | undefined>} [env] - Environment to read, `process.env` by default
 * @returns {{ drainDelay: number; handleSignals: boolean | string[] }} The settings
 */
export function resolveShutdownDefaults(
  config: ConfigTypes.Config | undefined,
  env: Record<string, string | undefined> = globalThis.process?.env ?? {},
): {
  drainDelay: number;
  handleSignals: boolean | string[];
} {
  const health = isHealthEnabled(config);
  const devServer = !!env[DEV_SERVER_ENV];

  return {
    drainDelay: config?.shutdown?.drainDelay ?? (health && !devServer ? DEFAULT_HEALTH_DRAIN_DELAY : 0),
    handleSignals: config?.shutdown?.handleSignals ?? health,
  };
}

/**
 * Compares two strings in time that depends only on their lengths, so a token
 * cannot be guessed one character at a time.
 *
 * @param {string} a - The received value
 * @param {string} b - The expected value
 * @returns {boolean} True when equal
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  let diff = a.length ^ b.length;

  for (let index = 0; index < b.length; index++) {
    diff |= (a.codePointAt(index % Math.max(a.length, 1)) ?? 0) ^ (b.codePointAt(index) ?? 0);
  }

  return diff === 0;
}

/**
 * Validates and normalizes a probe path.
 *
 * @param {string} label - The option, for the error message
 * @param {unknown} path - The path
 * @returns {string} The path without a trailing slash
 * @throws {Error} When the path is empty, relative, or has parameters, a query or whitespace
 */
function normalizeHealthPath(label: string, path: unknown): string {
  if (typeof path !== 'string' || path.trim() === '') {
    throw new Error(`${label} must be a non-empty path such as /_health, got ${JSON.stringify(path)}`);
  }

  if (!path.startsWith('/')) {
    throw new Error(`${label} must start with a slash, got ${path}`);
  }

  if (/[\s#*:?]/.test(path)) {
    throw new Error(`${label} must be a plain path without parameters, wildcards, a query or whitespace, got ${path}`);
  }

  return path.length > 1 ? path.replace(/\/+$/, '') || '/' : path;
}
