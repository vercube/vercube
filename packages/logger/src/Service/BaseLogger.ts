import { drainPlugin, enricherPlugin, initLogger, log } from 'evlog';
import { Logger } from '../Common/Logger';
import type { LoggerTypes } from '../Types/LoggerTypes';
import type { EvlogPlugin } from 'evlog';

/**
 * Default {@link Logger} implementation backed by evlog (https://evlog.dev).
 *
 * `debug` / `info` / `warn` / `error` forward to evlog's simple `log` API
 * (fire-and-forget, one event per call). Structured context registered via
 * {@link BaseLogger.set} or {@link BaseLogger.child} is merged into every
 * emitted event, providing wide-event style logging without a request
 * lifecycle. For request-scoped wide events use the evlog toolkit
 * (`@vercube/logger/toolkit`) together with the framework's request middleware.
 */
export class BaseLogger extends Logger {
  /**
   * Accumulated structured context merged into every emitted event.
   */
  private fContext: LoggerTypes.Context = {};

  /**
   * The last configuration applied, replayed whenever a plugin is added.
   */
  private fOptions: LoggerTypes.Options = {};

  /**
   * Plugins registered through {@link BaseLogger.addPlugin}, kept apart from
   * the ones the application passed to {@link BaseLogger.configure} so that
   * reconfiguring never drops them.
   */
  private readonly fPlugins: EvlogPlugin[] = [];

  /**
   * Providers consulted for every emitted event. Shared by reference with
   * child loggers, so registering one after `child()` still reaches them.
   */
  private fContextProviders: LoggerTypes.ContextProvider[] = [];

  /**
   * Configures the underlying evlog logger.
   * @param options - Configuration options
   */
  public configure(options: LoggerTypes.Options): void {
    this.fOptions = options ?? {};
    this.apply();
  }

  /**
   * Registers an evlog plugin, keeping the current configuration intact.
   *
   * Registering the same name twice replaces the previous registration, which
   * makes attaching a plugin idempotent across hot reloads.
   *
   * @param plugin - The evlog plugin to register
   */
  public addPlugin(plugin: EvlogPlugin): void {
    const existing = this.fPlugins.findIndex((registered) => registered.name === plugin.name);

    if (existing === -1) {
      this.fPlugins.push(plugin);
    } else {
      this.fPlugins[existing] = plugin;
    }

    this.apply();
  }

  /**
   * Registers a drain: a callback receiving every emitted event.
   *
   * @param name - Stable plugin name
   * @param drain - The drain callback
   */
  public addDrain(name: string, drain: NonNullable<EvlogPlugin['drain']>): void {
    this.addPlugin(drainPlugin(name, drain));
  }

  /**
   * Registers an enricher: a callback that may mutate an event before it drains.
   *
   * @param name - Stable plugin name
   * @param enrich - The enricher callback
   */
  public addEnricher(name: string, enrich: NonNullable<EvlogPlugin['enrich']>): void {
    this.addPlugin(enricherPlugin(name, enrich));
  }

  /**
   * Registers a provider consulted for every event this logger emits.
   *
   * @param provider - Called per event
   * @returns A function that unregisters the provider
   */
  public addContextProvider(provider: LoggerTypes.ContextProvider): () => void {
    this.fContextProviders.push(provider);

    return () => {
      const index = this.fContextProviders.indexOf(provider);

      if (index !== -1) {
        this.fContextProviders.splice(index, 1);
      }
    };
  }

  /**
   * Collects the fields every registered provider contributes.
   *
   * @returns The merged provided context, or null when nothing was contributed
   * @private
   */
  private providedContext(): LoggerTypes.Context | null {
    if (this.fContextProviders.length === 0) {
      return null;
    }

    let merged: LoggerTypes.Context | null = null;

    for (const provider of this.fContextProviders) {
      const context = provider();

      if (context) {
        merged = merged === null ? { ...context } : Object.assign(merged, context);
      }
    }

    return merged;
  }

  /**
   * Pushes the stored configuration and every registered plugin into evlog.
   *
   * @private
   */
  private apply(): void {
    const { logLevel, plugins, ...config } = this.fOptions;

    initLogger({
      ...config,
      minLevel: logLevel ?? config.minLevel,
      plugins: plugins ? [...plugins, ...this.fPlugins] : this.fPlugins,
    });
  }

  /**
   * Logs a debug message.
   * @param args - Values to log
   */
  public debug(...args: LoggerTypes.Arg[]): void {
    this.dispatch('debug', args);
  }

  /**
   * Logs an informational message.
   * @param args - Values to log
   */
  public info(...args: LoggerTypes.Arg[]): void {
    this.dispatch('info', args);
  }

  /**
   * Logs a warning message.
   * @param args - Values to log
   */
  public warn(...args: LoggerTypes.Arg[]): void {
    this.dispatch('warn', args);
  }

  /**
   * Logs an error message.
   * @param args - Values to log
   */
  public error(...args: LoggerTypes.Arg[]): void {
    this.dispatch('error', args);
  }

  /**
   * Merges structured context into every subsequent event.
   * @param context - Structured fields to attach
   */
  public set(context: LoggerTypes.Context): void {
    Object.assign(this.fContext, context);
  }

  /**
   * Returns a shallow copy of the accumulated context.
   */
  public getContext(): LoggerTypes.Context {
    return { ...this.fContext };
  }

  /**
   * Creates a derived logger inheriting this logger's context plus extra context.
   * @param context - Extra context for the child logger
   */
  public child(context: LoggerTypes.Context): Logger {
    const child = new BaseLogger();
    child.fContext = { ...this.fContext, ...context };
    child.fContextProviders = this.fContextProviders;
    return child;
  }

  /**
   * Emits the accumulated context as a single wide event, then resets it.
   * @param overrides - Additional fields merged into the emitted event
   */
  public emit(overrides: LoggerTypes.Context = {}): void {
    const event = { ...this.providedContext(), ...this.fContext, ...overrides };

    if (Object.keys(event).length === 0) {
      return;
    }

    log.info(event);
    this.fContext = {};
  }

  /**
   * Translates the framework's variadic logging calls into evlog events.
   *
   * Supported call shapes (mirroring the previous @vercube/logger behaviour):
   * - `('tag', 'message')`         → tagged log
   * - `('message')`                → message-only event
   * - `(error)` / `('tag', error)` → structured error event
   * - `('tag', { ...fields })`     → wide event with extra fields
   * - any mix of strings, objects and errors
   *
   * @param level - The severity level
   * @param args - The raw arguments passed to the log method
   */
  private dispatch(level: LoggerTypes.Level, args: LoggerTypes.Arg[]): void {
    const provided = this.providedContext();
    const hasContext = provided !== null || Object.keys(this.fContext).length > 0;

    // Fast path: native tagged log with no accumulated context for the prettiest output.
    if (!hasContext && args.length === 2 && typeof args[0] === 'string' && typeof args[1] === 'string') {
      log[level](args[0], args[1]);
      return;
    }

    const event: Record<string, unknown> = { ...provided, ...this.fContext };
    const messageParts: string[] = [];
    let tag: string | undefined;

    for (const arg of args) {
      if (arg instanceof Error) {
        event.error = { name: arg.name, message: arg.message, stack: arg.stack };
      } else if (arg !== null && typeof arg === 'object') {
        Object.assign(event, arg as Record<string, unknown>);
      } else if (typeof arg === 'string' && tag === undefined) {
        tag = arg;
      } else {
        messageParts.push(String(arg));
      }
    }

    if (tag !== undefined && messageParts.length === 0) {
      // A lone leading string is treated as the message.
      event.message = tag;
    } else {
      if (tag !== undefined) {
        event.tag = tag;
      }
      if (messageParts.length > 0) {
        event.message = messageParts.join(' ');
      }
    }

    log[level](event);
  }
}
