import { BasePlugin, GlobalMiddlewareRegistry } from '@vercube/core';
import { DEFAULT_PRIORITY, RATE_LIMIT_SLOT } from '../Common/Constants';
import { RateLimitMiddleware } from '../Middleware/RateLimitMiddleware';
import { RateLimitManager, validate } from '../Services/RateLimitManager';
import type { RateLimitTypes } from '../Types/RateLimitTypes';
import type { App } from '@vercube/core';

/**
 * Applies the `rateLimit` section of `vercube.config.ts`: its fields become
 * the defaults of every `@RateLimit()`, and with both `limit` and `window` it
 * limits every route that does not set its own limit, unmatched requests included.
 *
 * Options passed to the plugin are merged over the config section.
 *
 * @example
 * ```ts
 * export default defineConfig({
 *   rateLimit: { limit: 300, window: '1m', storage: 'redis', trustProxy: 1 },
 *   plugins: [RateLimitPlugin],
 * });
 * ```
 */
export class RateLimitPlugin extends BasePlugin<RateLimitTypes.Config> {
  /** @inheritdoc */
  public override name: string = 'RateLimitPlugin';

  /**
   * Configures the manager and registers the app-wide limit, if any. Runs
   * before the controllers are built, which is when routes collect their
   * middlewares.
   *
   * @param {App} app - The application
   * @param {RateLimitTypes.Config} [options] - Options overriding the config section
   * @returns {void}
   * @throws {RateLimitError} When an option is invalid
   */
  public override use(app: App, options?: RateLimitTypes.Config): void {
    const config: RateLimitTypes.Config = { ...app.config.rateLimit, ...options };
    const container = app.container;

    if (!container.getOptional(RateLimitManager)) {
      container.bind(RateLimitManager);
    }

    container.get(RateLimitManager).configure(config);

    if (config.limit === undefined || config.window === undefined) {
      return;
    }

    const windowMs = validate(config, 'rateLimit');
    const { window: _window, priority, trustProxy: _trustProxy, ...rest } = config;

    container.get(GlobalMiddlewareRegistry).registerGlobalMiddleware(RateLimitMiddleware, {
      slot: RATE_LIMIT_SLOT,
      priority: priority ?? DEFAULT_PRIORITY,
      args: { ...rest, scope: 'global', windowMs } satisfies RateLimitTypes.DeclaredOptions,
    });
  }
}
