import { Container } from '@vercube/di';
import { BaseLogger, Logger } from '@vercube/logger';
import { ConsoleProvider } from '@vercube/logger/drivers/ConsoleProvider';

/**
 * Creates and configures a dedicated DI container for the CLI.
 * Separate from the application runtime container.
 * Pre-configured with a Logger bound to ConsoleProvider.
 *
 * @returns configured CLI container
 */
export function createCliContainer(): Container {
  const container = new Container({ context: 'cli' });

  container.bind(Logger, BaseLogger);
  container.get(Logger).configure({
    logLevel: 'info',
    providers: [{ name: 'console', provider: ConsoleProvider }],
  });

  container.flushQueue();

  return container;
}
