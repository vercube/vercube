import { PluginsRegistry } from '@vercube/core';
import { StorageManager } from '@vercube/storage';
import { MemoryStorage } from '@vercube/storage/drivers/MemoryStorage';
import { RateLimitPlugin } from '../Plugins/RateLimitPlugin';
import { RateLimitManager } from '../Services/RateLimitManager';
import type { RateLimitTypes } from '../Types/RateLimitTypes';
import type { TestingTypes } from '@vercube/testing';

/** Options of {@link withRateLimit}. */
export interface WithRateLimitOptions extends RateLimitTypes.Config {
  /**
   * Who a test request counts against when it has no address. Requests made
   * with `app.get()` and friends never have one, so without this they would
   * not be limited at all. Routes with their own `key` keep it.
   * @default 'test-client'
   */
  client?: string;
}

/** The extension {@link withRateLimit} returns. */
export interface RateLimitExtension extends TestingTypes.Extension {
  /** The rate limit manager of the app under test, once it has booted. */
  readonly manager: RateLimitManager;

  /**
   * Forgets counted requests, so the next test starts over.
   *
   * @param name - Counter name, every counter when omitted
   * @param client - Client key, every client when omitted
   * @returns Resolves once forgotten
   */
  reset(name?: string, client?: string): Promise<void>;
}

/**
 * Sets rate limits up for `createTestApp()` from `@vercube/testing`: registers
 * `RateLimitPlugin` (or adds its settings to the one the test registered),
 * counts in a memory storage unless the test mounted the limits' storage
 * itself, and gives test requests without an address a client to count against.
 * A `key` from the options or the app's `rateLimit` config is kept.
 *
 * @param options - `rateLimit` settings for the test, plus the default client
 * @returns The extension
 *
 * @example
 * ```ts
 * const limits = withRateLimit();
 * const app = await createTestApp({ controllers: [AuthController], extensions: [limits] });
 *
 * afterEach(() => limits.reset());
 *
 * it('locks out after five attempts', async () => {
 *   for (let i = 0; i < 5; i++) await app.post('/auth/login').expect(200);
 *   await app.post('/auth/login').expect(429);
 * });
 * ```
 */
export function withRateLimit(options: WithRateLimitOptions = {}): RateLimitExtension {
  const { client = 'test-client', ...config } = options;
  let manager: RateLimitManager | null = null;
  let registered = false;

  const current = (): RateLimitManager => {
    if (!manager) {
      throw new Error('withRateLimit() is not set up yet: pass it to createTestApp({ extensions }) first.');
    }

    return manager;
  };

  return {
    name: 'withRateLimit',
    get manager() {
      return current();
    },
    setup: (app) => {
      if (!app.container.getOptional(StorageManager)) {
        app.container.bind(StorageManager);
      }

      registered = app.container.get(PluginsRegistry).plugins.some((plugin) => plugin instanceof RateLimitPlugin);

      if (!registered) {
        app.addPlugin(RateLimitPlugin, config);
        return;
      }

      // registering it again would replace the test's own plugin options
      if (config.limit !== undefined && config.window !== undefined) {
        throw new Error(
          'withRateLimit(): RateLimitPlugin is already registered, set the app-wide limit on it rather than on withRateLimit().',
        );
      }
    },
    beforeInitialize: (app) => {
      // the plugin has applied the app's config by now, so a key the app or the
      // test configured is known and wins; the fallback only gives address-less
      // test requests someone to count against
      const limits = app.container.get(RateLimitManager);
      const key: RateLimitTypes.Options['key'] = config.key ?? limits.defaults.key ?? (({ ip }) => ip ?? client);

      limits.configure(registered ? { ...config, key } : { key });
    },
    ready: async (testApp) => {
      manager = testApp.resolve(RateLimitManager);

      const storage = testApp.resolve(StorageManager);
      const mount = manager.defaults.storage ?? 'default';

      if (!storage.getStorage(mount)) {
        await storage.mount({ name: mount, storage: MemoryStorage });
      }
    },
    teardown: () => {
      manager = null;
    },
    reset: (name, clientKey) => current().reset(name, clientKey),
  };
}
