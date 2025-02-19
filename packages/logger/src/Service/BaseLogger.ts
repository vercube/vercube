import { Container, Inject } from '@vercube/di';
import type { LoggerTypes } from '../Types/LoggerTypes';
import { isLogLevelEnabled } from '../Utils/Utils';
import { Appender } from '../Common/Appender';
import type { Logger } from '../Common/Logger';

export class BaseLogger implements Logger {

  @Inject(Container)
  private gContainer: Container;

  /**
   * Hold the active log levels for the logger.
   * Default: debug
   */
  private fLogLevel: LoggerTypes.Level = 'debug';

  /**
   * Hold appenders
   */
  private fAppenders: Map<string, Appender<any>> = new Map();

  /**
   * Configure logger
   * @param options 
   */
  public configure(options: LoggerTypes.Options): void {
    this.fLogLevel = options?.logLevel ?? 'debug';

    if (!options?.appenders?.length) {
      return;
    }
    
    // reset registerd appenders
    this.fAppenders.clear();

    // register appenders from options
    for (const appender of options?.appenders ?? []) {
      this.fAppenders.set(appender.name, this.gContainer.resolve(appender.provider));

      // initialize appender
      this.fAppenders.get(appender.name)?.initialize(appender.options);
    }
  }

  /**
   * Logs an informational message.
   * @param tag - The tag to categorize the log message
   * @param args - Additional parameters to be logged
   * @returns A value determined by the implementing class
   */
  public debug(tag: string, ...args: LoggerTypes.Arg[]): void {
    this.printMessage({ level: 'debug', tag, args });
  }

  /**
   * Logs an informational message.
   * @param tag - The tag to categorize the log message
   * @param args - Additional parameters to be logged
   * @returns A value determined by the implementing class
   */
  public info(tag: string,...args: LoggerTypes.Arg[]): void {
    this.printMessage({ level: 'info', tag, args });
  }

  /**
   * Logs a warning message.
   * @param tag - The tag to categorize the log message
   * @param args - Additional parameters to be logged
   * @returns A value determined by the implementing class
   */
  public warn(tag: string,...args: LoggerTypes.Arg[]): void {
    this.printMessage({ level: 'warn', tag, args });
  }

  /**
   * Logs an error message.
   * @param tag - The tag to categorize the log message
   * @param args - Additional parameters to be logged
   * @returns A value determined by the implementing class
   */
  public error(tag: string,...args: LoggerTypes.Arg[]): void {
    this.printMessage({ level: 'error', tag, args });
  }

  /**
   * Prints a log message according to the specified format and level.
   * This is an abstract method that should be implemented by subclasses.
   * @param message - The log message object containing level, tag, and arguments
   * @throws {Error} When called directly on BaseLogger (must be implemented by subclass)
   * @protected
   */
  protected printMessage(message: LoggerTypes.Message): void {
    if (!isLogLevelEnabled(message.level, this.fLogLevel)) {
      return;
    }

    // process message through appenders
    for (const appender of this.fAppenders.values()) {
      appender.processMessage(message);
    }
  }

}