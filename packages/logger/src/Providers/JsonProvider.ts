import type { LoggerProvider } from '../Common/LoggerProvider';
import type { LoggerTypes } from '../Types/LoggerTypes';

/**
 * A logger implementation that formats log messages as JSON.
 */
export class JSONProvider implements LoggerProvider {

  /**
   * Initializes the appender with the provided options.
   * This method should be called before using the appender to process messages.
   *
   */
  public initialize(): void {}

  /**
   * Prints a log message according to the specified format and level.
   * @param message - The log message object containing level, tag, and arguments
   * @protected
   */
  public processMessage(message: LoggerTypes.Message): void {
    console.log(JSON.stringify({ type: message?.type ?? 'application_log', ...message }));
  }

}