import { Appender } from '../Common/Appender';
import { LoggerTypes } from '../Types/LoggerTypes';
import { LOG_LEVEL_COLORS } from '../Utils/Utils';
 
/**
 * ConsoleAppender class for logging messages to the console.
 */
export class ConsoleAppender extends Appender {

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
    const date = (message.timestamp) ? new Date(message.timestamp) : new Date();

    console[message.level](
      '%s%s%s %s',
      LOG_LEVEL_COLORS[message.level](`[${date.toISOString().split('T')[1]?.replace('Z', '')}]`),
      LOG_LEVEL_COLORS[message.level](`[${message.level.toUpperCase().padEnd(5, ' ')}]`),
      LOG_LEVEL_COLORS[message.level](`[${message.tag}]`),
      ...message.args,
    );
  }

}