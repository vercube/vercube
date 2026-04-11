import { GlobalMiddlewareRegistry } from '@vercube/core';
import { BasePlugin } from '@vercube/core';
import { Logger } from '@vercube/logger';
import { EvlogProvider } from '../Drivers/EvlogProvider';
import { EvlogMiddleware } from '../Middleware/EvlogMiddleware';
import type { EvlogProviderOptions } from '../Drivers/EvlogProvider';
import type { EvlogTypes } from '../Types/EvlogTypes';
import type { App } from '@vercube/core';

/**
 * Plugin that integrates evlog into vercube.
 *
 * When registered, it:
 * 1. Reconfigures the Logger to use EvlogProvider (replacing ConsoleProvider)
 * 2. Registers the EvlogMiddleware as a global middleware for request-scoped wide-event logging
 *
 * @example
 * ```ts
 * import { defineConfig } from '@vercube/core';
 * import { EvlogPlugin } from '@vercube/evlog';
 *
 * export default defineConfig({
 *   plugins: [
 *     [EvlogPlugin, {
 *       exclude: ['/health'],
 *       provider: { pretty: true },
 *       drain: async (ctx) => {
 *         await fetch('https://api.axiom.co/v1/datasets/logs/ingest', {
 *           method: 'POST',
 *           body: JSON.stringify([ctx.event]),
 *         });
 *       },
 *     }],
 *   ],
 * });
 * ```
 */
export class EvlogPlugin extends BasePlugin<EvlogTypes.PluginOptions> {
  public name = 'evlog';

  public override setup(app: App, options?: EvlogTypes.PluginOptions): void {
    // Reconfigure the logger to use evlog provider
    const logger = app.container.get(Logger);
    logger.configure({
      logLevel: app.config.logLevel ?? 'debug',
      providers: [
        {
          name: 'evlog',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          provider: EvlogProvider as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          options: options?.provider as any,
        },
      ],
    });

    // Register the evlog middleware as a global middleware for request logging
    const middlewareRegistry = app.container.get(GlobalMiddlewareRegistry);
    middlewareRegistry.registerGlobalMiddleware(EvlogMiddleware, {
      target: '__global__',
      priority: options?.priority ?? 0,
      args: options,
    });
  }
}
