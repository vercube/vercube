import { LoggerProvider } from '../Common/LoggerProvider';
import signale, { type Signale } from 'signale';
import { LoggerTypes } from '@vercube/logger';

/**
 * SignaleProvider class for logging messages using Signale.
 */
export class SignaleProvider  extends LoggerProvider {

  private readonly logger: Signale;

  constructor() {
    super();
    this.logger = new signale.Signale({
      scope: 'Vercube',
    });
  }

  /**
   * Initializes the appender with the provided options.
   * This method should be called before using the appender to process messages.
   */
  public initialize(): void {}

  public processMessage(message: LoggerTypes.Message): void {
    if (message.args.length === 2) {
      const logger = this.logger.scope(message.args[0]);
      logger[message.level](message.args[1]);
      return;
    }

    this.logger[message.level](...message.args);

  }
}
