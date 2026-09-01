import { Container } from '@vercube/di';
import { BaseLogger, Logger } from '@vercube/logger';
import { EvlogMiddleware } from '../Middleware/EvlogMiddleware';
import { RuntimeConfig } from '../Services/Config/RuntimeConfig';
import { DefaultErrorHandlerProvider } from '../Services/ErrorHandler/DefaultErrorHandlerProvider';
import { ErrorHandlerProvider } from '../Services/ErrorHandler/ErrorHandlerProvider';
import { HooksService } from '../Services/Hooks/HooksService';
import { HttpServer } from '../Services/HttpServer/HttpServer';
import { IntrospectionRegistry } from '../Services/Introspection/IntrospectionRegistry';
import { ConfigProvider } from '../Services/Introspection/Providers/ConfigProvider';
import { ContainerProvider } from '../Services/Introspection/Providers/ContainerProvider';
import { DiscoveryProvider } from '../Services/Introspection/Providers/DiscoveryProvider';
import { PluginsProvider } from '../Services/Introspection/Providers/PluginsProvider';
import { RoutesProvider } from '../Services/Introspection/Providers/RoutesProvider';
import { MetadataResolver } from '../Services/Metadata/MetadataResolver';
import { GlobalMiddlewareRegistry } from '../Services/Middleware/GlobalMiddlewareRegistry';
import { PluginsRegistry } from '../Services/Plugins/PluginsRegistry';
import { RequestContext } from '../Services/Router/RequestContext';
import { RequestHandler } from '../Services/Router/RequestHandler';
import { Router } from '../Services/Router/Router';
import { StaticRequestHandler } from '../Services/Router/StaticRequestHandler';
import { TelemetryRegistry } from '../Services/Telemetry/TelemetryRegistry';
import { StandardSchemaValidationProvider } from '../Services/Validation/StandardSchemaValidationProvider';
import { ValidationProvider } from '../Services/Validation/ValidationProvider';
import type { ConfigTypes } from '../Types/ConfigTypes';

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

  // Always bound, always empty until `@vercube/telemetry` installs itself.
  // Core reads it once per service and short-circuits on `hooks === null`.
  container.bind(TelemetryRegistry);

  // Structural introspection: routes, config, container and plugins. Cheap to
  // register (nothing is described until something asks) and it gives every
  // consumer - devtools, the CLI, an audit - one API instead of four.
  container.bind(IntrospectionRegistry);
  container.bind(RoutesProvider);
  container.bind(ConfigProvider);
  container.bind(ContainerProvider);
  container.bind(PluginsProvider);

  const introspection = container.get(IntrospectionRegistry);
  introspection.register(container.get(RoutesProvider));
  introspection.register(container.get(ContainerProvider));
  introspection.register(container.get(PluginsProvider));

  const configProvider = container.get(ConfigProvider);
  configProvider.setConfig(config);
  introspection.register(configProvider);

  // Only present when the project was built by @vercube/vite or scanned by
  // @vercube/scan; describes to null otherwise.
  introspection.register(new DiscoveryProvider(config.build?.root));

  // bind validation providers
  // use StandardSchema as default
  container.bind(ValidationProvider, StandardSchemaValidationProvider);

  // Register the evlog request middleware for per-request wide events (opt-out).
  // `logLevel` deliberately plays no part here: evlog applies its `minLevel`
  // only to the simple `log.*` API, so request wide events are still emitted at
  // `warn` or `error`. Use `requestLogging: false` (or evlog sampling) to opt out.
  const requestLogging = config.requestLogging !== false;

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
