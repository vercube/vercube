import { Container } from '@vercube/di';
import { BaseLogger, Logger } from '@vercube/logger';
import { SignaleProvider } from '@vercube/logger/providers';
import { HooksService } from '../Services/Hooks/HooksService';
import { MetadataResolver } from '../Services/Metadata/MetadataResolver';
import { RouterRegistry } from '../Services/Router/RouterRegistry';
import { PluginsRegistry } from '../Services/Plugins/PluginsRegistry';
import { RequestHandler } from '../Services/Router/RequestHandler';
import { ValidationProvider } from '../Services/Validation/ValidationProvider';
import { StandardSchemaValidationProvider } from '../Services/Validation/StandardSchemaValidationProvider';
import { RuntimeConfig } from '../Services/Config/RuntimeConfig';
import { ConfigTypes } from '../Types/ConfigTypes';

/**
 * Creates and configures a new dependency injection container for the application.
 *
 * @returns {Container} A configured dependency injection container.
 */
export function createContainer(config: ConfigTypes.Config): Container {

  const container = new Container();
  container.bindInstance(Container, container);

  // bind logger and default appender
  container.bind(Logger, BaseLogger);
  container.get(Logger).configure({
    logLevel: config.logLevel ?? 'debug',
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
  container.bind(RuntimeConfig);

  // bind validation providers
  // use StandardSchema as default
  container.bind(ValidationProvider, StandardSchemaValidationProvider);

  return container;
}
