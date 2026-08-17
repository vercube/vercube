import { Container } from '@vercube/di';
import { BaseLogger, Logger } from '@vercube/logger';
import { EvlogMiddleware } from '../Middleware/EvlogMiddleware';
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
import type { ConfigTypes } from '../Types/ConfigTypes';
import type { LoggerTypes } from '@vercube/logger';

/**
 * Tells whether request wide events would actually be emitted at the
 * configured log level.
 *
 * @param {LoggerTypes.Level | undefined} logLevel - Configured minimum log level.
 * @returns {boolean} True when `info` events are still emitted.
 */
function isRequestLoggingAudible(logLevel: LoggerTypes.Level | undefined): boolean {
  return logLevel === undefined || logLevel === 'debug' || logLevel === 'info';
}

/**
 * Creates and configures a new dependency injection container for the application.
 *
 * @returns {Container} A configured dependency injection container.
 */
export function createContainer(config: ConfigTypes.Config): Container {
  const container = new Container();
  container.bindInstance(Container, container);

  // bind evlog-backed logger
  container.bind(Logger, BaseLogger);
  container.get(Logger).configure({
    logLevel: config.logLevel ?? 'debug',
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

  // bind validation providers
  // use StandardSchema as default
  container.bind(ValidationProvider, StandardSchemaValidationProvider);

  // Register the evlog request middleware for per-request wide events (opt-out).
  // The events are emitted at `info`, so a stricter log level would produce
  // nothing while still paying the full per-request cost of the middleware.
  const requestLogging = config.requestLogging !== false && isRequestLoggingAudible(config.logLevel);

  // The request context wraps every request in an AsyncLocalStorage frame, so
  // it is only bound when it can actually be observed. Leaving it unbound makes
  // the request handler skip the frame entirely.
  if (config.requestContext !== false || requestLogging) {
    container.bind(RequestContext);
  }

  if (requestLogging) {
    container.get(GlobalMiddlewareRegistry).registerGlobalMiddleware(EvlogMiddleware);
  }

  return container;
}
