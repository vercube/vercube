import { initLogger, log } from 'evlog';
import { Logger } from '../Common/Logger';
import type { LoggerTypes } from '../Types/LoggerTypes';

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
   * Configures the underlying evlog logger.
   * @param options - Configuration options
   */
  public configure(options: LoggerTypes.Options): void {
    const { logLevel, ...config } = options ?? {};

    initLogger({
      ...config,
      minLevel: logLevel ?? config.minLevel,
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
    return child;
  }

  /**
   * Emits the accumulated context as a single wide event, then resets it.
   * @param overrides - Additional fields merged into the emitted event
   */
  public emit(overrides: LoggerTypes.Context = {}): void {
    const event = { ...this.fContext, ...overrides };

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
    const hasContext = Object.keys(this.fContext).length > 0;

    // Fast path: native tagged log with no accumulated context for the prettiest output.
    if (!hasContext && args.length === 2 && typeof args[0] === 'string' && typeof args[1] === 'string') {
      log[level](args[0], args[1]);
      return;
    }

    const event: Record<string, unknown> = { ...this.fContext };
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
