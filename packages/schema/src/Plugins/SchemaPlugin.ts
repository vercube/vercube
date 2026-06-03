import { BasePlugin } from '@vercube/core';
import { defu } from 'defu';
import { DEFAULT_SCHEMA_PLUGIN_OPTIONS } from '../Constants/SchemaDefaults';
import { SchemaController } from '../Controllers/SchameController';
import { SchemaRegistry } from '../Services/SchemaRegistry';
import { $SchemaPluginOptions } from '../Symbols/SchemaSymbols';
import type { SchemaPluginOptions } from '../Types/SchemaPluginOptions';
import type { App } from '@vercube/core';

/**
 * Schema Plugin for Vercube framework
 *
 * Provides OpenAPI/Swagger schema generation and validation capabilities:
 * - Automatic OpenAPI schema generation from Zod schemas
 * - Route-level schema validation via @Schema decorator
 * - Runtime schema access via /_schema endpoint
 * - Scalar API Reference UI at /_schema/docs (https://github.com/scalar/scalar)
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
export class SchemaPlugin extends BasePlugin<SchemaPluginOptions> {
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
  public override use(app: App, options?: SchemaPluginOptions): void | Promise<void> {
    const mergedOptions = defu(options ?? {}, DEFAULT_SCHEMA_PLUGIN_OPTIONS) as SchemaPluginOptions;

    app.container.bindInstance($SchemaPluginOptions, mergedOptions);
    app.container.bind(SchemaRegistry);
    app.container.bind(SchemaController);
  }
}
