import { BasePlugin, IntrospectionRegistry, MetadataResolver } from '@vercube/core';
import { Logger } from '@vercube/logger';
import { defu } from 'defu';
import { DEFAULT_SCHEMA_PATH, DEFAULT_SCHEMA_PLUGIN_OPTIONS } from '../Constants/SchemaDefaults';
import { SchemaController } from '../Controllers/SchameController';
import { SchemaRegistry } from '../Services/SchemaRegistry';
import { $SchemaPluginOptions } from '../Symbols/SchemaSymbols';
import type { SchemaPluginOptions, SchemaResolvedOptions } from '../Types/SchemaPluginOptions';
import type { App } from '@vercube/core';

/**
 * Schema Plugin for Vercube framework
 *
 * Provides OpenAPI/Swagger schema generation and validation capabilities:
 * - Automatic OpenAPI schema generation from Zod schemas
 * - Route-level schema validation via @Schema decorator
 * - Runtime schema access via the /_schema endpoint (`path`), off in production unless `enabled`
 * - Scalar API Reference UI at /_schema/docs (https://github.com/scalar/scalar)
 * - Optional access token (`token`) guarding both endpoints
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
    const resolved = this.resolveOptions(app, options);

    app.container.bindInstance($SchemaPluginOptions, resolved);
    app.container.bind(SchemaRegistry);

    if (resolved.enabled) {
      this.mount(app, resolved);
    }

    // Publish the generated document as an introspection section, so tooling
    // reads it the same way it reads routes or config instead of having to
    // know that this plugin mounts an HTTP endpoint.
    const registry = app.container.get(SchemaRegistry);

    // the document describes the application, not the endpoints serving it
    registry.exclude(SchemaController);

    app.container.getOptional(IntrospectionRegistry)?.register({
      id: 'openapi',
      title: 'OpenAPI',
      revision: () => registry.revision,
      describe: () => registry.generateSchema(),
    });
  }

  /**
   * Serves the document and the Scalar UI under the configured path.
   *
   * Global middlewares stay attached: an application-wide auth middleware is a
   * legitimate way to guard these endpoints.
   *
   * @param app - The application instance.
   * @param resolved - Resolved plugin options.
   */
  private mount(app: App, resolved: SchemaResolvedOptions): void {
    if (app.config.production === true && !resolved.token) {
      app.container
        .getOptional(Logger)
        ?.warn(
          `[SchemaPlugin] ${resolved.path}/ serves the full OpenAPI document in production without a token. ` +
            'It is public unless an application middleware guards it. Set `token`, or `enabled: false` to stop serving it.',
        );
    }

    // before the routes are registered, which reads the path once
    app.container.get(MetadataResolver).setControllerPath(SchemaController, resolved.path);
    app.container.bind(SchemaController);
  }

  /**
   * Merges user options with the defaults and resolves `enabled` and `path`.
   *
   * @param app - The application instance.
   * @param options - Plugin options.
   * @returns Resolved options.
   */
  private resolveOptions(app: App, options?: SchemaPluginOptions): SchemaResolvedOptions {
    const merged = defu(options ?? {}, DEFAULT_SCHEMA_PLUGIN_OPTIONS) as SchemaPluginOptions;

    // An empty or slash-only path would claim the root, so fall back to the default.
    const trimmed = (merged.path ?? '').replace(/^\/+|\/+$/g, '');

    return {
      ...merged,
      enabled: typeof merged.enabled === 'boolean' ? merged.enabled : app.config.production !== true,
      path: trimmed ? `/${trimmed}` : DEFAULT_SCHEMA_PATH,
    };
  }
}
