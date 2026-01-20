import { LoggerProvider } from '../Common/LoggerProvider';
import { LOG_LEVEL_COLORS } from '../Utils/Utils';
import type { LoggerTypes } from '../Types/LoggerTypes';

/**
 * ConsoleProvider class for logging messages to the console.
 */
export class ConsoleProvider extends LoggerProvider {
  /**
   * Initializes the appender with the provided options.
   * This method should be called before using the appender to process messages.
   */
  public initialize(): void {}

  /**
   * Prints a log message according to the specified format and level.
   * @param message - The log message object containing level, tag, and arguments
   * @protected
   */
  public processMessage(message: LoggerTypes.Message): void {
    const date = message.timestamp ? new Date(message.timestamp) : new Date();

    console[message.level](
      `%s%s${message?.tag ? '%s' : ''} %s`,
      LOG_LEVEL_COLORS[message.level](`[${date.toISOString().split('T')[1]?.replace('Z', '')}]`),
      LOG_LEVEL_COLORS[message.level](`[${message.level.toUpperCase().padEnd(5, ' ')}]`),
      message?.tag ? LOG_LEVEL_COLORS[message.level](`[${message.tag}]`) : '',
      ...message.args,
    );
  }
}
