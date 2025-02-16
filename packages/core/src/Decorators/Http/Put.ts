import { BaseDecorator, createDecorator, Inject } from '@vercube/di';
import { RouterRegistry } from '../../Services/Router/RouterRegistry';
import { MetadataResolver } from '../../Services/Metadata/MetadataResolver';
import { RequestHandler } from '../../Services/Router/RequestHandler';
import { initializeMetadata, initializeMetadataMethod } from '../../Utils/Utils';

interface PutDecoratorOptions {
  path: string;
}

/**
 * A decorator class for handling HTTP PUT requests.
 *
 * This class extends the BaseDecorator and is used to register PUT routes
 * with the RouterRegistry. It also resolves metadata for the route handler
 * using the MetadataResolver.
 *
 * @extends {BaseDecorator<PutDecoratorOptions>}
 */
class PutDecorator extends BaseDecorator<PutDecoratorOptions> {

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
   * with the RouterRegistry, and sets up the event handler for the PUT request.
   */
  public override created(): void {
    initializeMetadata(this.prototype);
    initializeMetadataMethod(this.prototype, this.propertyName);

    this.options.path = this.gMetadataResolver.resolveUrl({
      instance: this.instance,
      path: this.options.path,
      propertyName: this.propertyName,
    });

    this.gRouterRegistry.registerRoute({
      path: this.options.path,
      method: 'put',
      handler: this.gRequestHandler.handleRequest({ instance: this.instance, propertyName: this.propertyName }),
    });

  }

}

/**
 * A factory function for creating a PutDecorator.
 *
 * This function returns a decorator function that can be used to annotate
 * a method with PUT route information.
 *
 * @param {string} path - The path for the PUT route.
 * @return {Function} The decorator function.
 */
export function Put(path: string): Function {
  return createDecorator(PutDecorator, { path });
}