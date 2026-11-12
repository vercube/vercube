import { Container, Inject, InjectOptional } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { StorageManager } from '@vercube/storage';
import { MemoryStorage } from '@vercube/storage/drivers/MemoryStorage';
import { KEY_PREFIX, STORAGE_WARNING_INTERVAL } from '../Common/Constants';
import { RateLimitError } from '../Errors/RateLimitError';
import { parseDuration } from '../Utils/Duration';
import type { RateLimitTypes } from '../Types/RateLimitTypes';
import type { RouteInfo } from '@vercube/core';

/**
 * Counts requests against their limits. One instance holds every counter's
 * settings and talks to the storage: the middleware is created once per route,
 * so it holds nothing of its own.
 *
 * Counters live in a `@vercube/storage` mount, so a Redis mount shares them
 * between every instance of the application. Keys look like
 * `ratelimit:<name>:<client>:<window>`, where `<window>` is the index of the
 * window since the epoch, and expire on their own once the window is over.
 */
export class RateLimitManager {
  /** Container the storage manager is looked up in */
  @Inject(Container)
  private gContainer!: Container;

  /** Logger instance */
  @InjectOptional(Logger)
  private gLogger!: Logger | null;

  /** Defaults from `vercube.config.ts` and the plugin options */
  private fDefaults: RateLimitTypes.Config = {};

  /** Mounts a memory storage is being mounted on, so concurrent requests mount it once */
  private fMounting: Map<string, Promise<void>> = new Map();

  /** When each failing mount was last warned about */
  private fStorageWarnings: Map<string, number> = new Map();

  /** Counters already warned about a request without a client identity */
  private fNoIdentityWarned: Set<string> = new Set();

  /** Mounts counters were written to, so `reset()` knows where to look */
  private fMounts: Set<string> = new Set();

  /** Whether `RateLimitPlugin` configured the manager */
  private fConfigured: boolean = false;

  /** Whether the missing plugin was already warned about */
  private fUnconfiguredWarned: boolean = false;

  /**
   * The defaults every limit starts from.
   * @returns {RateLimitTypes.Config} The configured defaults
   */
  public get defaults(): Readonly<RateLimitTypes.Config> {
    return this.fDefaults;
  }

  /**
   * Merges defaults over the current ones. Called by `RateLimitPlugin` with
   * the `rateLimit` section of the configuration.
   * @param {RateLimitTypes.Config} defaults - Defaults to merge
   * @returns {void}
   * @throws {RateLimitError} When a default is invalid
   */
  public configure(defaults: RateLimitTypes.Config): void {
    const merged = { ...this.fDefaults, ...defaults };

    // fail at startup, not on the first request
    validate(merged, 'rateLimit');

    this.fDefaults = merged;
    this.fConfigured = true;
  }

  /**
   * Applies the defaults to a route's declaration.
   * @param {RateLimitTypes.DeclaredOptions} declared - What `@RateLimit()` or the plugin stored
   * @param {RouteInfo} [route] - The route the limit runs on, none for unmatched requests
   * @returns {RateLimitTypes.ResolvedOptions} The limit to count against
   * @throws {RateLimitError} When neither the declaration nor the defaults set a limit and a window
   */
  public resolve(declared: RateLimitTypes.DeclaredOptions, route?: RouteInfo): RateLimitTypes.ResolvedOptions {
    this.warnIfUnconfigured();

    const defaults = this.fDefaults;
    const name = declared.name ?? counterName(declared.scope, route);
    const limit = declared.limit ?? defaults.limit;
    const windowMs = declared.windowMs ?? (defaults.window === undefined ? undefined : parseDuration(defaults.window, 'window'));

    if (limit === undefined || windowMs === undefined) {
      throw new RateLimitError(
        `Rate limit "${name}" needs a limit and a window, set them on @RateLimit() or in the rateLimit config`,
        'configure',
        { name },
      );
    }

    return {
      limit,
      windowMs,
      algorithm: declared.algorithm ?? defaults.algorithm ?? 'fixed',
      key: declared.key ?? defaults.key,
      storage: declared.storage ?? defaults.storage ?? 'default',
      onStorageError: declared.onStorageError ?? defaults.onStorageError ?? 'allow',
      headers: declared.headers ?? defaults.headers ?? true,
      name,
      trustProxy: defaults.trustProxy ?? false,
    };
  }

  /**
   * Counts one request of a client and tells whether it is within the limit.
   *
   * @param {RateLimitTypes.ResolvedOptions} options - The limit
   * @param {string} client - Who the request counts against
   * @param {number} [now] - Current time in epoch milliseconds
   * @returns {Promise<RateLimitTypes.Result>} The decision and what to tell the client
   * @throws {Error} When the storage fails, the caller decides what that means
   */
  public async consume(
    options: RateLimitTypes.ResolvedOptions,
    client: string,
    now: number = Date.now(),
  ): Promise<RateLimitTypes.Result> {
    const storage = await this.storage(options.storage);
    const { limit, windowMs, name } = options;
    const index = Math.floor(now / windowMs);
    const resetAt = (index + 1) * windowMs;
    const key = counterKey(name, client, index);

    this.fMounts.add(options.storage);

    if (options.algorithm === 'sliding') {
      // independent round trips, sent together; the previous window has to
      // outlive the current one to be weighed in, and is read straight from the
      // driver because the manager would open a span per request
      const [count, stored] = await Promise.all([
        storage.increment({ storage: options.storage, key, ttl: Math.ceil((2 * windowMs) / 1000) }),
        storage.getStorage(options.storage)?.getItem<number>(counterKey(name, client, index - 1)),
      ]);
      const previous = Number(stored ?? 0);
      const elapsed = (now - index * windowMs) / windowMs;
      const estimate = (Number.isFinite(previous) ? previous : 0) * (1 - elapsed) + count;

      if (estimate > limit) {
        // a rejected request gives its count back, so a client retrying over
        // the limit still gets `limit` requests per window through
        await storage.increment({ storage: options.storage, key, by: -1 });

        return { allowed: false, limit, remaining: 0, resetAt };
      }

      return { allowed: true, limit, remaining: Math.max(0, Math.floor(limit - estimate)), resetAt };
    }

    const count = await storage.increment({ storage: options.storage, key, ttl: Math.ceil(windowMs / 1000) });

    return { allowed: count <= limit, limit, remaining: Math.max(0, limit - count), resetAt };
  }

  /**
   * Forgets counted requests, so a client starts over. Never clears the
   * storage as a whole: the mount is usually shared with application data.
   *
   * Looks in the mounts this process counted in, the default mount, and the
   * ones passed in `storage`, so another instance or a fresh process can reset
   * counters in a shared Redis. Lists the mounts' keys, so keep it for tests
   * and tools.
   *
   * @param {string} [name] - Counter name, every counter when omitted
   * @param {string} [client] - Client key, every client of the counter when omitted
   * @param {object} [options] - Where to look
   * @param {string | string[]} [options.storage] - More mounts to look in
   * @returns {Promise<void>} Resolves once deleted
   */
  public async reset(name?: string, client?: string, options: { storage?: string | string[] } = {}): Promise<void> {
    const manager = this.storageManager();

    let prefix = `${KEY_PREFIX}:`;

    if (name !== undefined) {
      prefix += `${encodeURIComponent(name)}:`;
    }

    if (name !== undefined && client !== undefined) {
      prefix += `${encodeURIComponent(client)}:`;
    }

    const extra = options.storage === undefined ? [] : [options.storage].flat();
    const mounts = new Set([...this.fMounts, this.fDefaults.storage ?? 'default', ...extra]);

    for (const mount of mounts) {
      if (!manager.getStorage(mount)) {
        continue;
      }

      const keys = await manager.getKeys({ storage: mount });

      await Promise.all(keys.filter((key) => key.startsWith(prefix)).map((key) => manager.deleteItem({ storage: mount, key })));
    }
  }

  /**
   * Logs a failing storage, at most once per mount per minute, so an outage
   * does not write a line per request.
   * @param {RateLimitTypes.ResolvedOptions} options - The limit whose storage failed
   * @param {unknown} error - What the storage threw
   * @returns {void}
   */
  public reportStorageError(options: RateLimitTypes.ResolvedOptions, error: unknown): void {
    const now = Date.now();
    const last = this.fStorageWarnings.get(options.storage);

    if (last !== undefined && now - last < STORAGE_WARNING_INTERVAL) {
      return;
    }

    this.fStorageWarnings.set(options.storage, now);
    this.gLogger?.warn(
      'Vercube/RateLimitManager',
      `Storage "${options.storage}" failed to count a request for "${options.name}", ${
        options.onStorageError === 'deny' ? 'answering 503' : 'letting requests through'
      }`,
      error,
    );
  }

  /**
   * Logs once that `@RateLimit()` runs without `RateLimitPlugin`, which is what
   * applies the `rateLimit` config section: `trustProxy` and every other
   * default are then ignored.
   * @returns {void}
   */
  private warnIfUnconfigured(): void {
    if (this.fConfigured || this.fUnconfiguredWarned) {
      return;
    }

    this.fUnconfiguredWarned = true;
    this.gLogger?.warn(
      'Vercube/RateLimitManager',
      'RateLimitPlugin is not registered: the rateLimit config section, trustProxy included, is ignored. Add it to plugins in vercube.config.ts.',
    );
  }

  /**
   * Logs once per counter that a request had no client identity and was let through.
   * @param {string} name - The counter name
   * @returns {void}
   */
  public reportNoIdentity(name: string): void {
    if (this.fNoIdentityWarned.has(name)) {
      return;
    }

    this.fNoIdentityWarned.add(name);
    this.gLogger?.warn(
      'Vercube/RateLimitManager',
      `A request to "${name}" has no client address and was not limited. Set rateLimit.trustProxy behind a proxy, or a key function.`,
    );
  }

  /**
   * The storage manager, with the mount counters go to. A mount that does not
   * exist gets a memory storage, with a warning: counting per instance beats
   * failing every request.
   * @param {string} mount - Mount name
   * @returns {Promise<StorageManager>} The storage manager
   */
  private async storage(mount: string): Promise<StorageManager> {
    const manager = this.storageManager();

    if (manager.getStorage(mount)) {
      return manager;
    }

    // only an unmounted default gets memory, for development; a named mount that
    // is missing is a mistake (a typo, a forgotten mount) and fails like a storage that is down
    if (mount !== 'default') {
      throw new RateLimitError(`Storage "${mount}" is not mounted`, 'storage', { mount });
    }

    let mounting = this.fMounting.get(mount);

    if (!mounting) {
      this.gLogger?.warn(
        'Vercube/RateLimitManager',
        `Storage "${mount}" is not mounted, counting rate limits in memory: limits are per instance until a shared storage is mounted`,
      );

      mounting = manager.mount({ name: mount, storage: MemoryStorage }).finally(() => this.fMounting.delete(mount));
      this.fMounting.set(mount, mounting);
    }

    await mounting;

    return manager;
  }

  /**
   * The storage manager, bound on first use when the application has none.
   * @returns {StorageManager} The storage manager
   */
  private storageManager(): StorageManager {
    const existing = this.gContainer.getOptional(StorageManager);

    if (existing) {
      return existing;
    }

    this.gContainer.bind(StorageManager);
    this.gContainer.flushQueue();

    return this.gContainer.get(StorageManager);
  }
}

/**
 * Builds the storage key of one client's counter in one window. The name and
 * the client are encoded, so neither can forge another counter's key.
 *
 * @param {string} name - Counter name
 * @param {string} client - Client key
 * @param {number} index - Window index since the epoch
 * @returns {string} The key
 */
export function counterKey(name: string, client: string, index: number): string {
  return `${KEY_PREFIX}:${encodeURIComponent(name)}:${encodeURIComponent(client)}:${index}`;
}

/**
 * Checks a declaration or the defaults, so a typo fails at startup.
 *
 * @param {Partial<RateLimitTypes.Options> | RateLimitTypes.Config} options - What to check
 * @param {string} where - Where the options were written, for the message
 * @returns {number | undefined} The window in milliseconds, when one is set
 * @throws {RateLimitError} When an option is invalid
 */
export function validate(options: Partial<RateLimitTypes.Options> | RateLimitTypes.Config, where: string): number | undefined {
  const fail = (message: string): never => {
    throw new RateLimitError(`${where}: ${message}`, 'configure', { name: options.name });
  };

  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1)) {
    fail(`limit must be a positive integer, got ${JSON.stringify(options.limit)}`);
  }

  if (options.algorithm !== undefined && options.algorithm !== 'fixed' && options.algorithm !== 'sliding') {
    fail(`algorithm must be 'fixed' or 'sliding', got ${JSON.stringify(options.algorithm)}`);
  }

  if (options.onStorageError !== undefined && options.onStorageError !== 'allow' && options.onStorageError !== 'deny') {
    fail(`onStorageError must be 'allow' or 'deny', got ${JSON.stringify(options.onStorageError)}`);
  }

  if (options.key !== undefined && typeof options.key !== 'function') {
    fail('key must be a function');
  }

  if (options.name !== undefined && options.name === '') {
    fail('name must not be empty');
  }

  if (options.priority !== undefined && !Number.isFinite(options.priority)) {
    fail('priority must be a number');
  }

  const trustProxy = (options as RateLimitTypes.Config).trustProxy;

  if (trustProxy !== undefined && typeof trustProxy !== 'boolean' && !(Number.isInteger(trustProxy) && trustProxy >= 0)) {
    fail(`trustProxy must be a boolean or a number of proxies, got ${JSON.stringify(trustProxy)}`);
  }

  return options.window === undefined ? undefined : parseDuration(options.window, 'window');
}

/**
 * Names a counter after where its limit was declared and the route it runs on.
 *
 * @param {RateLimitTypes.Scope} scope - Where the limit was declared
 * @param {RouteInfo} [route] - The route, none for unmatched requests
 * @returns {string} `Controller.method`, `Controller` or `global`
 */
function counterName(scope: RateLimitTypes.Scope, route?: RouteInfo): string {
  if (!route || scope === 'global') {
    return 'global';
  }

  return scope === 'method' ? `${route.controller}.${route.handler}` : route.controller;
}
