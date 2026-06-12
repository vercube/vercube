import type { LoggerTypes } from '../Types/LoggerTypes';

/**
 * Abstract base class for the Vercube logger.
 *
 * Defines the dependency-injection contract used across the framework. The
 * default implementation ({@link BaseLogger}) is backed by evlog
 * (https://evlog.dev) and forwards calls to evlog's logging API.
 */
export abstract class Logger {
  /**
   * Configures the underlying logger.
   * Maps to evlog's `initLogger` under the hood.
   *
   * @param options - Configuration options for the logger
   */
  public abstract configure(options: LoggerTypes.Options): void;

  /**
   * Logs a debug message.
   * @param args - Values to log (strings, objects, errors)
   */
  public abstract debug(...args: LoggerTypes.Arg[]): void;

  /**
   * Logs an informational message.
   * @param args - Values to log (strings, objects, errors)
   */
  public abstract info(...args: LoggerTypes.Arg[]): void;

  /**
   * Logs a warning message.
   * @param args - Values to log (strings, objects, errors)
   */
  public abstract warn(...args: LoggerTypes.Arg[]): void;

  /**
   * Logs an error message.
   * @param args - Values to log (strings, objects, errors)
   */
  public abstract error(...args: LoggerTypes.Arg[]): void;

  /**
   * Merges structured context into every subsequent event emitted by this logger.
   * Enables wide-event style logging without a request lifecycle.
   *
   * @param context - Structured fields to attach
   */
  public abstract set(context: LoggerTypes.Context): void;

  /**
   * Returns a shallow copy of the context accumulated on this logger.
   */
  public abstract getContext(): LoggerTypes.Context;

  /**
   * Creates a derived logger inheriting this logger's context, merged with
   * the provided additional context.
   *
   * @param context - Extra context for the child logger
   */
  public abstract child(context: LoggerTypes.Context): Logger;

  /**
   * Emits the accumulated context as a single consolidated wide event, then
   * resets it.
   *
   * @param overrides - Additional fields merged into the emitted event
   */
  public abstract emit(overrides?: LoggerTypes.Context): void;
}
