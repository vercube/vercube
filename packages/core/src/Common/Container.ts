import { Container } from '@vercube/di';
import { BaseLogger, Logger } from '@vercube/logger';
import { ConsoleProvider } from '@vercube/logger/drivers/ConsoleProvider';
import { HooksService } from '../Services/Hooks/HooksService';
import { MetadataResolver } from '../Services/Metadata/MetadataResolver';
import { PluginsRegistry } from '../Services/Plugins/PluginsRegistry';
import { RequestHandler } from '../Services/Router/RequestHandler';
import { ValidationProvider } from '../Services/Validation/ValidationProvider';
import { StandardSchemaValidationProvider } from '../Services/Validation/StandardSchemaValidationProvider';
import { RuntimeConfig } from '../Services/Config/RuntimeConfig';
import { ConfigTypes } from '../Types/ConfigTypes';
import { ErrorHandlerProvider } from '../Services/ErrorHandler/ErrorHandlerProvider';
import { DefaultErrorHandlerProvider } from '../Services/ErrorHandler/DefaultErrorHandlerProvider';
import { HttpServer } from '../Services/HttpServer/HttpServer';
import { Router } from '../Services/Router/Router';
import { GlobalMiddlewareRegistry } from '../Services/Middleware/GlobalMiddlewareRegistry';
import { StaticRequestHandler } from '../Services/Router/StaticRequestHandler';
import { ServerPlugins } from '../Services/HttpServer/ServerPlugins';

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
      { name: 'console', provider: ConsoleProvider },
    ],
  });

  // bind default error provider
  container.bind(ErrorHandlerProvider, DefaultErrorHandlerProvider);
  container.bind(HttpServer);
  container.bind(StaticRequestHandler);
  container.bind(Router);

  // bind core services
  container.bind(HooksService);
  container.bind(MetadataResolver);
  container.bind(PluginsRegistry);
  container.bind(ServerPlugins);
  container.bind(RequestHandler);
  container.bind(RuntimeConfig);
  container.bind(GlobalMiddlewareRegistry);

  // bind validation providers
  // use StandardSchema as default
  container.bind(ValidationProvider, StandardSchemaValidationProvider);

  return container;
}
