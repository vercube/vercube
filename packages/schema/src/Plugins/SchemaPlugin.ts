import { BasePlugin } from '@vercube/core';
import { SchemaController } from '../Controllers/SchameController';
import { SchemaRegistry } from '../Services/SchemaRegistry';
import type { App } from '@vercube/core';

/**
 * Schema Plugin for Vercube framework
 *
 * Provides OpenAPI/Swagger schema generation and validation capabilities:
 * - Automatic OpenAPI schema generation from Zod schemas
 * - Route-level schema validation via @Schema decorator
 * - Runtime schema access via /_schema endpoint
 * - Seamless integration with request validation (@Body, @Query, etc)
 *
 * @example
 * ```ts
 * import { createApp } from '@vercube/core';
 * import { SchemaPlugin } from '@vercube/schema';
 *
 * const app = createApp({
 *   setup: async (app) => {
 *     app.addPlugin(SchemaPlugin);
 *   }
 * });
 * ```
 *
 * @see {@link https://vercube.dev} for full documentation
 */
export class SchemaPlugin<T = unknown> extends BasePlugin<T> {
  /**
   * The name of the plugin.
   * @override
   */
  public override name: string = 'SchemaPlugin';

  /**
   * Method to use the plugin with the given app.
   * @param {App} app - The application instance.
   * @returns {void | Promise<void>}
   * @override
   */
  public override use(app: App, options: T): void | Promise<void> {
    // bind required services to the app container
    app.container.bind(SchemaRegistry);

    // bind schema controller to the app container
    app.container.bind(SchemaController);
  }
}
