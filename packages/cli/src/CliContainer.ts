import { Container } from '@vercube/di';
import { BaseLogger, Logger } from '@vercube/logger';
import { CommandRegistry } from './CommandRegistry';

/**
 * Creates and configures a dedicated DI container for the CLI.
 * Separate from the application runtime container.
 * Pre-configured with an evlog-backed Logger.
 *
 * @returns configured CLI container
 */
export function createCliContainer(): Container {
  const container = new Container({ context: 'cli' });

  container.bind(Logger, BaseLogger);
  container.get(Logger).configure({
    logLevel: 'info',
  });

  container.bind(CommandRegistry);

  container.flushQueue();

  return container;
}
