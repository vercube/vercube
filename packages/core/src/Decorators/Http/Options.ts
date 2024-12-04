import { BaseDecorator, createDecorator, Inject } from '@vercube/di';
import { RouterRegistry } from '../../Services/Router/RouterRegistry';
import { MetadataResolver } from '../../Services/Metadata/MetadataResolver';
import { RequestHandler } from '../../Services/Router/RequestHandler';

interface OptionsDecoratorOptions {
  path: string;
}

/**
 * A decorator class for handling HTTP OPTIONS requests.
 *
 * This class extends the BaseDecorator and is used to register OPTIONS routes
 * with the RouterRegistry. It also resolves metadata for the route handler
 * using the MetadataResolver.
 *
 * @extends {BaseDecorator<OptionsDecoratorOptions>}
 */
class OptionsDecorator extends BaseDecorator<OptionsDecoratorOptions> {

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
   * with the RouterRegistry, and sets up the event handler for the OPTIONS request.
   */
  public override created(): void {
    this.options.path = this.gMetadataResolver.resolveUrl({
      instance: this.instance,
      path: this.options.path,
      propertyName: this.propertyName,
    });

    this.gRouterRegistry.registerRoute({
      path: this.options.path,
      method: 'options',
      handler: this.gRequestHandler.handleRequest({ instance: this.instance, propertyName: this.propertyName }),
    });

  }

}

/**
 * A factory function for creating an OptionsDecorator.
 *
 * This function returns a decorator function that can be used to annotate
 * a method with OPTIONS route information.
 *
 * @param {string} path - The path for the OPTIONS route.
 * @return {Function} The decorator function.
 */
export function Options(path: string): Function {
  return createDecorator(OptionsDecorator, { path });
}