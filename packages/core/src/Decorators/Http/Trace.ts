import { BaseDecorator, createDecorator, Inject } from '@cube/di';
import { RouterRegistry } from '../../Services/Router/RouterRegistry';
import { MetadataResolver } from '../../Services/Metadata/MetadataResolver';
import { RequestHandler } from '../../Services/Router/RequestHandler';

interface TraceDecoratorOptions {
  path: string;
}

/**
 * A decorator class for handling HTTP TRACE requests.
 *
 * This class extends the BaseDecorator and is used to register TRACE routes
 * with the RouterRegistry. It also resolves metadata for the route handler
 * using the MetadataResolver.
 *
 * @extends {BaseDecorator<TraceDecoratorOptions>}
 */
class TraceDecorator extends BaseDecorator<TraceDecoratorOptions> {

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
   * with the RouterRegistry, and sets up the event handler for the TRACE request.
   */
  public override created(): void {
    this.options.path = this.gMetadataResolver.resolveUrl(this.instance, this.options.path);

    this.gRouterRegistry.registerRoute({
      path: this.options.path,
      method: 'trace',
      handler: this.gRequestHandler.handleRequest({ instance: this.instance, propertyName: this.propertyName }),
    });
  }

}

/**
 * A factory function for creating a TraceDecorator.
 *
 * This function returns a decorator function that can be used to annotate
 * a method with TRACE route information.
 *
 * @param {string} path - The path for the TRACE route.
 * @return {Function} The decorator function.
 */
export function Trace(path: string): Function {
  return createDecorator(TraceDecorator, { path });
}