import { initializeContainer, Inject } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { RuntimeConfig } from '../Services/Config/RuntimeConfig';
import { HttpServer } from '../Services/HttpServer/HttpServer';
import { IntrospectionRegistry } from '../Services/Introspection/IntrospectionRegistry';
import { PluginsRegistry } from '../Services/Plugins/PluginsRegistry';
import { Router } from '../Services/Router/Router';
import { StaticRequestHandler } from '../Services/Router/StaticRequestHandler';
import { ShutdownRegistry } from '../Services/Shutdown/ShutdownRegistry';
import type { BasePlugin } from '../Services/Plugins/BasePlugin';
import type { ShutdownHook } from '../Services/Shutdown/ShutdownRegistry';
import type { ConfigTypes } from '../Types/ConfigTypes';
import type { VercubePlugin, VercubePluginEnv } from '../Types/Plugin';
import type { Container } from '@vercube/di';

/** Signals handled when `shutdown.handleSignals` is `true`. */
const DEFAULT_SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT'];

/** How long the HTTP server waits for requests in flight when no timeout is configured. */
const DEFAULT_SHUTDOWN_TIMEOUT = 25_000;

/**
 * Represents the main application class.
 */
export class App {
  @Inject(Router)
  private gRouter!: Router;

  @Inject(PluginsRegistry)
  private gPluginsRegistry!: PluginsRegistry;

  @Inject(HttpServer)
  private gHttpServer!: HttpServer;

  @Inject(StaticRequestHandler)
  private gStaticRequestHandler!: StaticRequestHandler;

  @Inject(RuntimeConfig)
  private gRuntimeConfig!: RuntimeConfig;

  @Inject(ShutdownRegistry)
  private gShutdownRegistry!: ShutdownRegistry;

  /** Holds the initialization status of the application */
  private fIsInitialized: boolean = false;

  /** Holds the dependency injection container */
  private fInternalContainer!: Container;

  /** Hold app config */
  private fConfig!: ConfigTypes.Config;

  /** The close in progress, so `close()` runs once */
  private fClosing: Promise<void> | null = null;

  /** Removes the process signal listeners, set while they are installed */
  private fSignalCleanup: (() => void) | null = null;

  /**
   * Gets the dependency injection container.
   *
   * @returns {Container} The dependency injection container.
   */
  public get container(): Container {
    return this.fInternalContainer;
  }

  /**
   * Sets the dependency injection container.
   *
   * @param {Container} container - The dependency injection container.
   */
  public set container(container: Container) {
    this.fInternalContainer = container;
  }

  /**
   * Gets the application config.
   * This method is used to get the application config without runtime config.
   * @returns {ConfigTypes.Config} The application config.
   */
  public get config(): ConfigTypes.Config {
    return {
      ...this.fConfig,
      runtime: undefined,
    };
  }

  /**
   * Initializes the application.
   *
   * @returns {Promise<void>} A promise that resolves when the application is initialized.
   */
  public async init(cfg: ConfigTypes.Config): Promise<void> {
    this.fConfig = cfg;

    // resolve plugins
    await this.resolvePlugins();

    await this.gHttpServer.initialize(this.fConfig);

    if (this.fConfig.server?.static) {
      this.gStaticRequestHandler.initialize(this.fConfig.server?.static);
    }

    if (this.fConfig.runtime) {
      this.gRuntimeConfig.runtimeConfig = this.fConfig.runtime;
    }

    this.gRouter.initialize();
  }

  /**
   * Add new plugin to the application.
   *
   * @param {typeof Plugin} plugin - The plugin to add.
   * @param {unknown} options - The options to pass to the plugin.
   */
  public addPlugin<T>(plugin: typeof BasePlugin<T>, options?: T): void {
    this.gPluginsRegistry.register(plugin, options);
  }

  /**
   * Starts the application and begins listening for incoming requests.
   *
   * @returns {Promise<void>} A promise that resolves when the application starts listening.
   * @throws {Error} If the application is already initialized.
   */
  public async listen(): Promise<void> {
    if (this.fIsInitialized) {
      throw new Error('App is already initialized');
    }

    // initialize container with all decorators
    initializeContainer(this.container);

    // `vercube inspect` runs the application's own entry file - that is the
    // only way to see the routes and bindings its setup actually produces -
    // and stops it right before it would bind a port.
    if (process.env.VERCUBE_INSPECT) {
      await this.printInspection(process.env.VERCUBE_INSPECT);
      return;
    }

    // listen for incoming requests
    await this.gHttpServer.listen();

    this.fIsInitialized = true;

    this.installSignals();
  }

  /**
   * Registers a callback run by {@link App.close}. Callbacks run one after
   * another, last registered first, once the HTTP server has stopped.
   *
   * @param {ShutdownHook} hook - The callback to run on close
   * @returns {() => void} Removes the callback again
   */
  public onClose(hook: ShutdownHook): () => void {
    return this.gShutdownRegistry.register(hook);
  }

  /**
   * Closes the application gracefully. The HTTP server stops accepting
   * connections and waits for the requests in flight, closing the connections
   * still open once `timeout` elapses. Then the callbacks registered with
   * {@link App.onClose} run, last registered first, so modules such as the
   * scheduler and the queue drain their work in one place. Last, the container
   * is disposed: every `@Destroy()` hook runs and the promises they return are
   * awaited.
   *
   * Safe to call more than once: later calls return the first close.
   *
   * @param {object} [options] - How long to wait
   * @param {number} [options.timeout] - Milliseconds the HTTP server waits for requests in flight, defaults to `shutdown.timeout`
   * @returns {Promise<void>} Resolves once everything is closed
   * @throws {AggregateError} When the server or a callback failed to close, after every callback has run
   */
  public close(options: { timeout?: number } = {}): Promise<void> {
    this.fClosing ??= this.shutdown(options.timeout ?? this.fConfig?.shutdown?.timeout ?? DEFAULT_SHUTDOWN_TIMEOUT);

    return this.fClosing;
  }

  /**
   * Handles an incoming HTTP request.
   * This method is an adapter for HttpServer.handleRequest method.
   *
   * @param {Request} request - The incoming HTTP request
   * @returns {Promise<Response>} The HTTP response
   */
  public async fetch(request: Request): Promise<Response> {
    return this.gHttpServer.handleRequest(request);
  }

  /**
   * Describes the application's structure: routes, configuration, container
   * bindings, plugins and whatever else registered an introspection provider.
   *
   * @param {string} [section] - Describe only this section when given.
   * @returns {Promise<unknown>} The described sections, keyed by id.
   */
  public async inspect(section?: string): Promise<unknown> {
    const registry = this.container.get(IntrospectionRegistry);

    if (section) {
      return registry.describe(section);
    }

    return registry.describeAll();
  }

  /**
   * Writes the inspection result to stdout for the CLI to read.
   *
   * @param {string} sections - `*` for everything, or a comma-separated list of section ids.
   * @returns {Promise<void>} Resolves once the JSON has been written.
   * @private
   */
  private async printInspection(sections: string): Promise<void> {
    const wanted = sections === '1' || sections === '*' ? undefined : sections.split(',').filter(Boolean);
    const registry = this.container.get(IntrospectionRegistry);

    const result = wanted
      ? Object.fromEntries(
          (await Promise.all(wanted.map(async (id) => [id, await registry.describe(id)] as const))).filter(
            ([, value]) => value !== undefined,
          ),
        )
      : await registry.describeAll();

    const json = `${JSON.stringify(result, null, 2)}\n`;
    const target = process.env.VERCUBE_INSPECT_OUT;

    // Written to a file when the CLI asks for one: the application is free to
    // log to stdout while it boots, and mixing that into the payload would make
    // `vercube inspect | jq` fail for reasons that have nothing to do with the
    // application. Without the variable it still prints, so running the entry
    // by hand works.
    if (target) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(target, json, 'utf8');

      return;
    }

    process.stdout.write(json);
  }

  /**
   * Stops the HTTP server, runs the shutdown hooks, then disposes the
   * container. A step that fails does not keep the next one from running.
   *
   * @param {number} timeout - Milliseconds the HTTP server waits for requests in flight
   * @returns {Promise<void>} Resolves once everything is closed
   * @private
   */
  private async shutdown(timeout: number): Promise<void> {
    const errors: unknown[] = [];

    try {
      await this.gHttpServer.close(timeout);
    } catch (error) {
      errors.push(error);
    }

    try {
      await this.gShutdownRegistry.run();
    } catch (error) {
      errors.push(...(error instanceof AggregateError ? error.errors : [error]));
    }

    try {
      await this.container.dispose();
    } catch (error) {
      errors.push(...(error instanceof AggregateError ? error.errors : [error]));
    }

    this.fSignalCleanup?.();
    this.fSignalCleanup = null;

    if (errors.length > 0) {
      throw new AggregateError(errors, 'Failed to close the application');
    }
  }

  /**
   * Installs the process signal listeners `shutdown.handleSignals` asks for:
   * Node and Bun through `process.on()`, Deno through `Deno.addSignalListener()`.
   *
   * The first signal closes the application and exits, with code 1 when
   * something failed to close. A second signal exits with code 1 right away.
   *
   * @returns {void}
   * @private
   */
  private installSignals(): void {
    const option = this.fConfig?.shutdown?.handleSignals;

    if (!option || this.fSignalCleanup) {
      return;
    }

    const signals = option === true ? DEFAULT_SHUTDOWN_SIGNALS : option;

    const runtime = globalThis as {
      process?: {
        on?: (signal: string, fn: () => void) => void;
        off?: (signal: string, fn: () => void) => void;
        exit?: (code: number) => void;
      };
      Deno?: {
        addSignalListener?: (signal: string, fn: () => void) => void;
        removeSignalListener?: (signal: string, fn: () => void) => void;
        exit?: (code: number) => void;
      };
    };

    const deno = typeof runtime.Deno?.addSignalListener === 'function' ? runtime.Deno : undefined;
    const process = runtime.process;
    // a signal listener replaces the runtime's default exit, so exiting is ours to do
    // oxlint-disable-next-line unicorn/no-process-exit
    const exit = (code: number): void => (deno ? deno.exit?.(code) : process?.exit?.(code));

    let received = false;

    const handler = (): void => {
      if (received) {
        exit(1);
        return;
      }

      received = true;

      this.close().then(
        () => exit(0),
        (error) => {
          this.container.getOptional(Logger)?.error('Vercube/App::Failed to close the application', error);
          exit(1);
        },
      );
    };

    if (deno) {
      for (const signal of signals) {
        deno.addSignalListener?.(signal, handler);
      }

      this.fSignalCleanup = () => {
        for (const signal of signals) {
          deno.removeSignalListener?.(signal, handler);
        }
      };

      return;
    }

    if (typeof process?.on === 'function') {
      for (const signal of signals) {
        process.on(signal, handler);
      }

      this.fSignalCleanup = () => {
        for (const signal of signals) {
          process.off?.(signal, handler);
        }
      };
    }
  }

  /**
   * Initializes registry plugins, then runs `setup` on each normalized config plugin in order.
   *
   * @returns Resolves when all plugin `setup` hooks have been awaited.
   */
  private async resolvePlugins(): Promise<void> {
    await this.gPluginsRegistry.init(this);

    const plugins = this.fConfig.plugins as VercubePlugin[] | undefined;
    if (!plugins?.length) {
      return;
    }

    const env: VercubePluginEnv = {
      cwd: typeof process === 'undefined' ? '.' : process.cwd(),
      dev: this.fConfig.dev,
      production: this.fConfig.production,
    };

    for (const plugin of plugins) {
      await plugin.setup?.(this, env);
    }
  }
}
