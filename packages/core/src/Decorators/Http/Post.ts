import { BaseDecorator, createDecorator, Inject } from '@vercube/di';
import { RouterRegistry } from '../../Services/Router/RouterRegistry';
import { MetadataResolver } from '../../Services/Metadata/MetadataResolver';
import { RequestHandler } from '../../Services/Router/RequestHandler';
import { initializeMetadata, initializeMetadataMethod } from '../../Utils/Utils';

interface PostDecoratorOptions {
  path: string;
}

/**
 * A decorator class for handling HTTP POST requests.
 *
 * This class extends the BaseDecorator and is used to register POST routes
 * with the RouterRegistry. It also resolves metadata for the route handler
 * using the MetadataResolver.
 *
 * @extends {BaseDecorator<PostDecoratorOptions>}
 */
class PostDecorator extends BaseDecorator<PostDecoratorOptions> {

  @Inject(RouterRegistry)
  private gRouterRegistry!: RouterRegistry;

  @Inject(MetadataResolver)
  private gMetadataResolver!: MetadataResolver;

  @Inject(RequestHandler)
  private gRequestHandler!: RequestHandler;

  /**
   * Called when the decorator is created.
   *
   * This method constructs the full path for the route, registers the route
   * with the RouterRegistry, and sets up the event handler for the POST request.
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
      method: 'post',
      handler: this.gRequestHandler.handleRequest({ instance: this.instance, propertyName: this.propertyName }),
    });

  }

}

/**
 * A factory function for creating a PostDecorator.
 *
 * This function returns a decorator function that can be used to annotate
 * a method with POST route information.
 *
 * @param {string} path - The path for the POST route.
 * @return {Function} The decorator function.
 */
export function Post(path: string): Function {
  return createDecorator(PostDecorator, { path });
}