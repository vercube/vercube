import { BaseDecorator, createDecorator, Inject } from '@vercube/di';
import { RouterRegistry } from '../../Services/Router/RouterRegistry';
import { MetadataResolver } from '../../Services/Metadata/MetadataResolver';
import { RequestHandler } from '../../Services/Router/RequestHandler';

interface GetDecoratorOptions {
  path: string;
}

/**
 * A decorator class for handling HTTP GET requests.
 *
 * This class extends the BaseDecorator and is used to register GET routes
 * with the RouterRegistry. It also resolves metadata for the route handler
 * using the MetadataResolver.
 *
 * @extends {BaseDecorator<GetDecoratorOptions>}
 */
class GetDecorator extends BaseDecorator<GetDecoratorOptions> {

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
   * with the RouterRegistry, and sets up the event handler for the GET request.
   */
  public override created(): void {
    this.options.path = this.gMetadataResolver.resolveUrl({
      instance: this.instance,
      path: this.options.path,
      propertyName: this.propertyName,
    });

    this.gRouterRegistry.registerRoute({
      path: this.options.path,
      method: 'get',
      handler: this.gRequestHandler.handleRequest({ instance: this.instance, propertyName: this.propertyName }),
    });

  }

}

/**
 * A decorator function for handling HTTP GET requests.
 *
 * This function creates an instance of the GetDecorator class and registers
 * the GET route with the specified path.
 *
 * @param {string} path - The path for the GET route.
 * @returns {Function} - The decorator function.
 */
export function Get(path: string): Function {
  return createDecorator(GetDecorator, { path });
}
