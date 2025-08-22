import type { LoggerTypes } from '../Types/LoggerTypes';

/**
 * Abstract base class for implementing log provider.
 * Providers are responsible for processing and outputting log messages to various destinations.
 * Each appender can be initialized with custom options and handles message processing according to its implementation.
 *
 * @template T - The type of options used to initialize the appender
 */
export abstract class LoggerProvider<T = unknown> {
  /**
   * Initializes the appender with the provided options.
   * This method should be called before using the appender to process messages.
   *
   * @param options - Configuration options for the appender
   * @returns void or Promise<void> if initialization is asynchronous
   */
  public abstract initialize(options: T): void | Promise<void>;

  /**
   * Processes a log message according to the appender's implementation.
   * This method handles the actual logging logic specific to each appender type.
   *
   * @param message - The log message to process, containing level, tag, and other metadata
   * @returns void or Promise<void> if processing is asynchronous
   */
  public abstract processMessage(message: LoggerTypes.Message): void | Promise<void>;
}
