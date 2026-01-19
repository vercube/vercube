import { Container } from '@vercube/di';
import { BaseLogger, Logger } from '@vercube/logger';
import { ConsoleProvider } from '@vercube/logger/drivers/ConsoleProvider';
import type { ConfigTypes } from '../Types/ConfigTypes';
import { RuntimeConfig } from '../Services/Config/RuntimeConfig';
import { DefaultErrorHandlerProvider } from '../Services/ErrorHandler/DefaultErrorHandlerProvider';
import { ErrorHandlerProvider } from '../Services/ErrorHandler/ErrorHandlerProvider';
import { HooksService } from '../Services/Hooks/HooksService';
import { HttpServer } from '../Services/HttpServer/HttpServer';
import { MetadataResolver } from '../Services/Metadata/MetadataResolver';
import { GlobalMiddlewareRegistry } from '../Services/Middleware/GlobalMiddlewareRegistry';
import { PluginsRegistry } from '../Services/Plugins/PluginsRegistry';
import { RequestContext } from '../Services/Router/RequestContext';
import { RequestHandler } from '../Services/Router/RequestHandler';
import { Router } from '../Services/Router/Router';
import { StaticRequestHandler } from '../Services/Router/StaticRequestHandler';
import { StandardSchemaValidationProvider } from '../Services/Validation/StandardSchemaValidationProvider';
import { ValidationProvider } from '../Services/Validation/ValidationProvider';

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
    providers: [{ name: 'console', provider: ConsoleProvider }],
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
  container.bind(RequestHandler);
  container.bind(RuntimeConfig);
  container.bind(GlobalMiddlewareRegistry);
  container.bind(RequestContext);

  // bind validation providers
  // use StandardSchema as default
  container.bind(ValidationProvider, StandardSchemaValidationProvider);

  return container;
}
