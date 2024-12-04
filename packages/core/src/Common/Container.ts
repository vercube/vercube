import { Container } from '@vercube/di';
import { HooksService } from '../Services/Hooks/HooksService';
import { MetadataResolver } from '../Services/Metadata/MetadataResolver';
import { RouterRegistry } from '../Services/Router/RouterRegistry';
import { PluginsRegistry } from '../Services/Plugins/PluginsRegistry';
import { RequestHandler } from '../Services/Router/RequestHandler';

/**
 * Creates and configures a new dependency injection container for the application.
 *
 * @returns {Container} A configured dependency injection container.
 */
export function createContainer(): Container {

  const container = new Container();
  container.bindInstance(Container, container);

  // bind core services
  container.bind(HooksService);
  container.bind(MetadataResolver);
  container.bind(RouterRegistry);
  container.bind(PluginsRegistry);
  container.bind(RequestHandler);

  return container;
}