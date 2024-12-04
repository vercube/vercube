import { BaseDecorator, createDecorator, Inject } from '@vercube/di';
import { RouterRegistry } from '../../Services/Router/RouterRegistry';
import { MetadataResolver } from '../../Services/Metadata/MetadataResolver';
import { RequestHandler } from '../../Services/Router/RequestHandler';

interface ConnectDecoratorOptions {
  path: string;
}

/**
 * A decorator class for handling HTTP CONNECT requests.
 *
 * This class extends the BaseDecorator and is used to register CONNECT routes
 * with the RouterRegistry. It also resolves metadata for the route handler
 * using the MetadataResolver.
 *
 * @extends {BaseDecorator<ConnectDecoratorOptions>}
 */
class ConnectDecorator extends BaseDecorator<ConnectDecoratorOptions> {

  @Inject(RouterRegistry)
  private gRouterRegistry!: RouterRegistry;

  @Inject(RequestHandler)
  private gRequestHandler!: RequestHandler;

  @Inject(MetadataResolver)
  private gMetadataResolver!: MetadataResolver;

  /**
   * Called when the decorator is created.
   *
   * This method constructs the full path for the route, registers the route
   * with the RouterRegistry, and sets up the event handler for the CONNECT request.
   */
  public override created(): void {
    this.options.path = this.gMetadataResolver.resolveUrl({
      instance: this.instance,
      path: this.options.path,
      propertyName: this.propertyName,
    });

    this.gRouterRegistry.registerRoute({
      path: this.options.path,
      method: 'connect',
      handler: this.gRequestHandler.handleRequest({ instance: this.instance, propertyName: this.propertyName }),
    });

  }

}

/**
 * A factory function for creating a ConnectDecorator.
 *
 * This function returns a decorator function that can be used to annotate
 * a method with CONNECT route information.
 *
 * @param {string} path - The path for the CONNECT route.
 * @return {Function} The decorator function.
 */
export function Connect(path: string): Function {
  return createDecorator(ConnectDecorator, { path });
}