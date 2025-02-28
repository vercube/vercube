import { Container } from '@vercube/di';
import { BaseLogger, Logger } from '@vercube/logger';
import { SignaleProvider } from '@vercube/logger';
import { HooksService } from '../Services/Hooks/HooksService';
import { MetadataResolver } from '../Services/Metadata/MetadataResolver';
import { RouterRegistry } from '../Services/Router/RouterRegistry';
import { PluginsRegistry } from '../Services/Plugins/PluginsRegistry';
import { RequestHandler } from '../Services/Router/RequestHandler';
import { ValidationProvider } from '../Services/Validation/ValidationProvider';
import { StandardSchemaValidationProvider } from '../Services/Validation/StandardSchemaValidationProvider';

/**
 * Creates and configures a new dependency injection container for the application.
 *
 * @returns {Container} A configured dependency injection container.
 */
export function createContainer(): Container {

  const container = new Container();
  container.bindInstance(Container, container);

  // bind logger and default appender
  container.bind(Logger, BaseLogger);
  container.get(Logger).configure({
    providers: [
      { name: 'console', provider: SignaleProvider },
    ],
  });

  // bind core services
  container.bind(HooksService);
  container.bind(MetadataResolver);
  container.bind(RouterRegistry);
  container.bind(PluginsRegistry);
  container.bind(RequestHandler);

  // bind validation providers
  // use StandardSchema as default
  container.bind(ValidationProvider, StandardSchemaValidationProvider);

  return container;
}
