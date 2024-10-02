import { BaseDecorator, createDecorator, Inject } from '@cube/di';
import { RouterRegistry } from '../../Services/Router/RouterRegistry';
import { MetadataResolver } from '../../Services/Metadata/MetadataResolver';
import { RequestHandler } from '../../Services/Router/RequestHandler';

interface HeadDecoratorOptions {
  path: string;
}

/**
 * A decorator class for handling HTTP HEAD requests.
 *
 * This class extends the BaseDecorator and is used to register HEAD routes
 * with the RouterRegistry. It also resolves metadata for the route handler
 * using the MetadataResolver.
 *
 * @extends {BaseDecorator<HeadDecoratorOptions>}
 */
class HeadDecorator extends BaseDecorator<HeadDecoratorOptions> {

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
   * with the RouterRegistry, and sets up the event handler for the HEAD request.
   */
  public override created(): void {
    this.options.path = this.gMetadataResolver.resolveUrl({
      instance: this.instance,
      path: this.options.path,
      propertyName: this.propertyName,
    });

    this.gRouterRegistry.registerRoute({
      path: this.options.path,
      method: 'head',
      handler: this.gRequestHandler.handleRequest({ instance: this.instance, propertyName: this.propertyName }),
    });

  }

}

/**
 * A factory function for creating a HeadDecorator.
 *
 * This function returns a decorator function that can be used to annotate
 * a method with HEAD route information.
 *
 * @param {string} path - The path for the HEAD route.
 * @return {Function} The decorator function.
 */
export function Head(path: string): Function {
  return createDecorator(HeadDecorator, { path });
}