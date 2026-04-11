import type { LoggerTypes } from '../Types/LoggerTypes';

/**
 * Abstract base class for implementing logging services.
 * Provides a standard interface for logging at different levels.
 * Implementations can customize how logs are processed and stored.
 */
export abstract class Logger {
  /**
   * Configures the logger with the provided options.
   * This method should be called before using the logger to process logs.
   * @param options - Configuration options for the logger
   * @returns void or Promise<void> if configuration is asynchronous
   */
  public abstract configure(options: LoggerTypes.Options): void;

  /**
   * Logs a message at the specified log level.
   * @param args - Additional parameters to be logged
   * @returns A value determined by the implementing class
   */
  public abstract debug(...args: LoggerTypes.Arg[]): void;

  /**
   * Logs an informational message.
   * @param args - Additional parameters to be logged
   * @returns A value determined by the implementing class
   */
  public abstract info(...args: LoggerTypes.Arg[]): void;

  /**
   * Logs a warning message.
   * @param args - Additional parameters to be logged
   * @returns A value determined by the implementing class
   */
  public abstract warn(...args: LoggerTypes.Arg[]): void;

  /**
   * Logs an error message.
   * @param args - Additional parameters to be logged
   * @returns A value determined by the implementing class
   */
  public abstract error(...args: LoggerTypes.Arg[]): void;

  /**
   * Sets a key-value pair in the current request-scoped logging context.
   * Context is included in every log message emitted within the same async scope.
   *
   * @param key - The context key
   * @param value - The context value
   */
  public abstract setContext(key: string, value: unknown): void;

  /**
   * Returns all key-value pairs from the current request-scoped logging context.
   */
  public abstract getContext(): Record<string, unknown>;

  /**
   * Runs a function within a new logging context scope.
   * Context set via `setContext` inside `fn` is automatically cleaned up when `fn` completes.
   *
   * @param fn - The function to run within the context
   * @returns The result of the function
   */
  public abstract runInContext<T>(fn: () => Promise<T>): Promise<T>;
}
