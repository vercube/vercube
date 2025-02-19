import { LoggerTypes } from '../Types/LoggerTypes';

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
   * @param level - The log level of the message
   * @param tag - The tag to categorize the log message
   * @param args - Additional parameters to be logged
   * @returns A value determined by the implementing class
   */
  public abstract debug(tag: string,...args: LoggerTypes.Arg[]): void;

  /**
   * Logs an informational message.
   * @param tag - The tag to categorize the log message
   * @param args - Additional parameters to be logged
   * @returns A value determined by the implementing class
   */
  public abstract info(tag: string,...args: LoggerTypes.Arg[]): void;

  /**
   * Logs a warning message.
   * @param tag - The tag to categorize the warning message
   * @param args - Additional parameters to be logged
   * @returns A value determined by the implementing class
   */
  public abstract warn(tag: string, ...args: LoggerTypes.Arg[]): void;

  /**
   * Logs an error message.
   * @param tag - The tag to categorize the error message
   * @param args - Additional parameters to be logged
   * @returns A value determined by the implementing class
   */
  public abstract error(tag: string, ...args: LoggerTypes.Arg[]): void;
}