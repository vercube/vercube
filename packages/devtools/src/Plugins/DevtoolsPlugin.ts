import { BasePlugin, initializeMetadata, IntrospectionRegistry, skipGlobalMiddlewares } from '@vercube/core';
import { Logger } from '@vercube/logger';
import { TelemetryPlugin } from '@vercube/telemetry';
import { defu } from 'defu';
import { DEFAULT_DEVTOOLS_OPTIONS } from '../Constants/DevtoolsDefaults';
import { DevtoolsController } from '../Controllers/DevtoolsController';
import { AuditService } from '../Services/AuditService';
import { DevtoolsFrameBus } from '../Services/DevtoolsFrameBus';
import { OverviewCollector } from '../Services/OverviewCollector';
import { StorageIntrospection } from '../Services/StorageIntrospection';
import { $DevtoolsAppConfig, $DevtoolsOptions } from '../Symbols/DevtoolsSymbols';
import { DevtoolsTelemetry, ensureDevtoolsTelemetry, hasDevtoolsTelemetry } from '../Telemetry/DevtoolsTelemetry';
import type { DevtoolsTypes } from '../Types/DevtoolsTypes';
import type { App, ConfigTypes } from '@vercube/core';

/**
 * Self-hosted developer tools for Vercube, mounted at `/_devtools`.
 *
 * Devtools does not collect anything of its own. It registers an OpenTelemetry
 * span processor, a metric reader and a log drain, reads structural data from
 * core's introspection registry, and renders what arrives. Instrumenting a
 * package therefore makes it visible here without devtools knowing about it.
 *
 * Register it in `vercube.config.ts` rather than through `app.addPlugin()`:
 * the config phase is the only one early enough to see the container being
 * built, and to register a meter provider before any instrument is created.
 *
 * @example
 * ```ts
 * import { defineConfig } from '@vercube/core';
 * import { DevtoolsPlugin } from '@vercube/devtools';
 *
 * export default defineConfig({
 *   plugins: [DevtoolsPlugin],
 * });
 * ```
 */
export class DevtoolsPlugin extends BasePlugin<DevtoolsTypes.Options> {
  /**
   * The name of the plugin.
   * @override
   */
  public override name: string = 'DevtoolsPlugin';

  /**
   * Config phase: registers the metric reader and starts recording spans.
   *
   * The metric reader has to be in place before anything creates an instrument,
   * because the OpenTelemetry metrics API has no proxy meter and instruments
   * made before a provider exists stay no-ops forever.
   *
   * @param config - Merged application config
   * @param options - Plugin options
   * @override
   */
  public override configure(config: ConfigTypes.Config, options?: DevtoolsTypes.Options): void {
    if (!this.isEnabled(config, options)) {
      return;
    }

    ensureDevtoolsTelemetry(this.resolveOptions(config, options)).installMetrics();
  }

  /**
   * Runtime phase: binds the devtools services and mounts their routes.
   *
   * @param app - Running application
   * @param options - Plugin options
   * @override
   */
  public override async use(app: App, options?: DevtoolsTypes.Options): Promise<void> {
    const config = app.config;

    if (!this.isEnabled(config, options)) {
      return;
    }

    const resolved = this.resolveOptions(config, options);
    const logger = app.container.getOptional(Logger);

    // The inspector exposes traffic, logs and resolved config. Outside
    // development it only mounts behind an explicit token.
    if (config.production === true && !resolved.token) {
      logger?.error(
        '[DevtoolsPlugin] Not mounting: devtools in production require an access token. Set `token` in the plugin options.',
      );

      return;
    }

    // Devtools is useless without spans, so it turns telemetry on rather than
    // asking the application to remember to.
    await new TelemetryPlugin().use(app, {
      enabled: true,
      spans: { bodies: resolved.captureBodies ? { maxBytes: resolved.maxBodyBytes } : false },
    });

    // Registered through `app.addPlugin()` rather than the config, so the
    // config phase never ran. Traces and logs still work; metrics only do when
    // nothing has created an instrument yet.
    const fresh = !hasDevtoolsTelemetry();
    const telemetry = ensureDevtoolsTelemetry(resolved);

    if (fresh && !telemetry.installMetrics()) {
      logger?.warn(
        '[DevtoolsPlugin]',
        'Metrics are unavailable because a meter provider already exists. Register DevtoolsPlugin in vercube.config.ts to see them.',
      );
    }

    telemetry.install(logger);

    app.container.bindInstance($DevtoolsOptions, resolved);
    app.container.bindInstance($DevtoolsAppConfig, config);
    app.container.bindInstance(DevtoolsFrameBus, telemetry.bus);
    app.container.bindInstance(DevtoolsTelemetry, telemetry);
    app.container.bind(AuditService);
    app.container.bind(OverviewCollector);
    app.container.bind(StorageIntrospection);

    app.container.get(IntrospectionRegistry).register(app.container.get(StorageIntrospection));

    // Both have to happen before the decorators read the metadata: the mount
    // path is baked in at class-definition time, and the middleware chain is
    // assembled once when the routes are registered.
    initializeMetadata(DevtoolsController.prototype).__controller.path = resolved.path;
    skipGlobalMiddlewares(DevtoolsController.prototype);
    app.container.bind(DevtoolsController);

    app.container.get(OverviewCollector).setMode(config.dev ?? false, config.production ?? false);
  }

  /**
   * Decides whether devtools should run.
   *
   * Defaults to development only; production requires an explicit opt-in.
   *
   * @param config - Application config
   * @param options - Plugin options
   * @returns True when devtools should be active
   */
  private isEnabled(config: ConfigTypes.Config, options?: DevtoolsTypes.Options): boolean {
    if (typeof options?.enabled === 'boolean') {
      return options.enabled;
    }

    return config.dev === true && config.production !== true;
  }

  /**
   * Merges user options with the defaults.
   *
   * @param config - Application config
   * @param options - Plugin options
   * @returns Fully resolved options
   */
  private resolveOptions(config: ConfigTypes.Config, options?: DevtoolsTypes.Options): DevtoolsTypes.ResolvedOptions {
    const merged = defu(options ?? {}, DEFAULT_DEVTOOLS_OPTIONS) as DevtoolsTypes.ResolvedOptions;

    // An empty or slash-only mount would claim every route, so fall back to the default.
    const trimmed = merged.path.replace(/^\/+|\/+$/g, '');

    return {
      ...merged,
      enabled: this.isEnabled(config, options),
      path: trimmed ? `/${trimmed}` : DEFAULT_DEVTOOLS_OPTIONS.path,
    };
  }
}
