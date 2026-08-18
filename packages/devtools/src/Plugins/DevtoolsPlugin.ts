import { BasePlugin, HttpServer, initializeMetadata } from '@vercube/core';
import { Logger } from '@vercube/logger';
import { defu } from 'defu';
import { DEFAULT_DEVTOOLS_OPTIONS } from '../Constants/DevtoolsDefaults';
import { DevtoolsController } from '../Controllers/DevtoolsController';
import { AuditService } from '../Services/AuditService';
import { installBootstrapProfiler } from '../Services/BootstrapProfiler';
import { ConfigCollector } from '../Services/ConfigCollector';
import { DevtoolsEventBus } from '../Services/DevtoolsEventBus';
import { GraphCollector } from '../Services/GraphCollector';
import { LogCollector } from '../Services/LogCollector';
import { OverviewCollector } from '../Services/OverviewCollector';
import { ProcessSampler } from '../Services/ProcessSampler';
import { RequestRecorder } from '../Services/RequestRecorder';
import { RouteCollector } from '../Services/RouteCollector';
import { StorageCollector } from '../Services/StorageCollector';
import { $DevtoolsAppConfig, $DevtoolsOptions } from '../Symbols/DevtoolsSymbols';
import type { DevtoolsTypes } from '../Types/DevtoolsTypes';
import type { App, ConfigTypes } from '@vercube/core';

/**
 * Self-hosted developer tools for Vercube.
 * Mounts an inspector at `/_devtools`. Register in `vercube.config.ts` so the
 * bootstrap profiler installs before the container is built.
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
   * Config phase. Installs the bootstrap profiler before the container exists.
   * @param config merged application config
   * @param options plugin options
   * @override
   */
  public override configure(config: ConfigTypes.Config, options?: DevtoolsTypes.Options): void {
    if (!this.isEnabled(config, options)) {
      return;
    }

    installBootstrapProfiler();
  }

  /**
   * Runtime phase. Binds the devtools services and mounts their routes.
   * @param app running application
   * @param options plugin options
   * @override
   */
  public override use(app: App, options?: DevtoolsTypes.Options): void {
    const config = app.config;

    if (!this.isEnabled(config, options)) {
      return;
    }

    const resolved = this.resolveOptions(config, options);

    // The inspector exposes traffic, logs and resolved config. Outside development
    // it only mounts behind an explicit token.
    if (config.production === true && !resolved.token) {
      app.container
        .get(Logger)
        .error(
          '[DevtoolsPlugin] Not mounting: devtools in production require an access token. Set `token` in the plugin options.',
        );

      return;
    }

    installBootstrapProfiler();

    app.container.bindInstance($DevtoolsOptions, resolved);
    app.container.bindInstance($DevtoolsAppConfig, config);
    app.container.bind(DevtoolsEventBus);
    app.container.bind(GraphCollector);
    app.container.bind(RouteCollector);
    app.container.bind(RequestRecorder);
    app.container.bind(AuditService);
    app.container.bind(OverviewCollector);
    app.container.bind(LogCollector);
    app.container.bind(ConfigCollector);
    app.container.bind(StorageCollector);
    app.container.bind(ProcessSampler);

    // Rewrite the controller base path before decorators read it.
    initializeMetadata(DevtoolsController.prototype).__controller.path = resolved.path;
    app.container.bind(DevtoolsController);

    app.container.get(OverviewCollector).setMode(config.dev ?? false, config.production ?? false);

    app.container.get(RequestRecorder).attach(app.container.get(HttpServer));
    app.container.get(LogCollector).attach(app.container.get(Logger));
  }

  /**
   * Decides whether devtools should run.
   * Defaults to development only; production requires an explicit opt-in.
   * @param config application config
   * @param options plugin options
   * @returns true when devtools should be active
   */
  private isEnabled(config: ConfigTypes.Config, options?: DevtoolsTypes.Options): boolean {
    if (typeof options?.enabled === 'boolean') {
      return options.enabled;
    }

    return config.dev === true && config.production !== true;
  }

  /**
   * Merges user options with the defaults.
   * @param config application config
   * @param options plugin options
   * @returns fully resolved options
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
