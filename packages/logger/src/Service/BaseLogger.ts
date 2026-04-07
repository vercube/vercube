import { AsyncLocalStorage } from 'node:async_hooks';
import { Container, Inject } from '@vercube/di';
import { LoggerProvider } from '../Common/LoggerProvider';
import { isLogLevelEnabled } from '../Utils/Utils';
import type { Logger } from '../Common/Logger';
import type { LoggerTypes } from '../Types/LoggerTypes';

export class BaseLogger implements Logger {
  @Inject(Container)
  private gContainer!: Container;

  /**
   * Hold the active log levels for the logger.
   * Default: debug
   */
  private fLogLevel: LoggerTypes.Level = 'debug';

  /**
   * Hold providers
   */
  private fProviders: Map<string, LoggerProvider<any>> = new Map();

  /**
   * Hold providers level
   */
  private fProvidersLevel: Map<string, LoggerTypes.Level> = new Map();

  /**
   * Request-scoped context storage.
   */
  private fContextStorage = new AsyncLocalStorage<Map<string, unknown>>();

  /**
   * Configure logger
   * @param options
   */
  public configure(options: LoggerTypes.Options): void {
    this.fLogLevel = options?.logLevel ?? 'debug';

    if (!options?.providers?.length) {
      return;
    }

    // reset registerd providers
    this.fProviders.clear();

    // register providers from options
    for (const logger of options.providers) {
      try {
        // Resolve provider instance
        const provider = this.gContainer.resolve<LoggerProvider>(logger.provider);

        // Initialize provider
        provider.initialize(logger.options);

        // Save provider instance
        this.fProviders.set(logger.name, provider);

        // Set log level for provider. If not set, use global log level
        this.fProvidersLevel.set(logger.name, logger.logLevel ?? this.fLogLevel);
      } catch (error) {
        console.error(`Failed to initialize logger provider: ${logger.provider.name}`, error);
      }
    }
  }

  /**
   * Logs an informational message.
   * @param args - Additional parameters to be logged
   * @returns A value determined by the implementing class
   */
  public debug(...args: LoggerTypes.Arg[]): void {
    this.printMessage({ level: 'debug', args });
  }

  /**
   * Logs an informational message.
   * @param args - Additional parameters to be logged
   * @returns A value determined by the implementing class
   */
  public info(...args: LoggerTypes.Arg[]): void {
    this.printMessage({ level: 'info', args });
  }

  /**
   * Logs a warning message.
   * @param args - Additional parameters to be logged
   * @returns A value determined by the implementing class
   */
  public warn(...args: LoggerTypes.Arg[]): void {
    this.printMessage({ level: 'warn', args });
  }

  /**
   * Logs an error message.
   * @param args - Additional parameters to be logged
   * @returns A value determined by the implementing class
   */
  public error(...args: LoggerTypes.Arg[]): void {
    this.printMessage({ level: 'error', args });
  }

  /**
   * Sets a key-value pair in the current request-scoped logging context.
   */
  public setContext(key: string, value: unknown): void {
    const store = this.fContextStorage.getStore();
    if (store) {
      store.set(key, value);
    }
  }

  /**
   * Returns all key-value pairs from the current request-scoped logging context.
   */
  public getContext(): Record<string, unknown> {
    const store = this.fContextStorage.getStore();
    if (!store) {
      return {};
    }
    return Object.fromEntries(store);
  }

  /**
   * Runs a function within a new logging context scope.
   */
  public async runInContext<T>(fn: () => Promise<T>): Promise<T> {
    return this.fContextStorage.run(new Map(), fn);
  }

  /**
   * Prints a log message according to the specified format and level.
   * This is an abstract method that should be implemented by subclasses.
   * @param message - The log message object containing level, tag, and arguments
   * @throws {Error} When called directly on BaseLogger (must be implemented by subclass)
   * @protected
   */
  protected printMessage(message: LoggerTypes.Message): void {
    // attach request-scoped context if available
    const store = this.fContextStorage.getStore();
    if (store && store.size > 0) {
      message.context = Object.fromEntries(store);
    }

    // check if message level is enabled for any provider
    const providersToProcess = [...this.fProviders.entries()].filter(([name]) => {
      return isLogLevelEnabled(message.level, this.fProvidersLevel.get(name) ?? this.fLogLevel);
    });

    // process message through appenders
    for (const [, provider] of providersToProcess) {
      provider.processMessage(message);
    }
  }
}
