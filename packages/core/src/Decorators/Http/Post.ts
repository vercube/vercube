import { BaseDecorator, createDecorator, Inject } from '@vercube/di';
import { MetadataResolver } from '../../Services/Metadata/MetadataResolver';
import { RequestHandler } from '../../Services/Router/RequestHandler';
import { Router } from '../../Services/Router/Router';
import { initializeMetadata, initializeMetadataMethod } from '../../Utils/Utils';

interface PostDecoratorOptions {
  path: string;
}

/**
 * A decorator class for handling HTTP POST requests.
 *
 * This class extends the BaseDecorator and is used to register POST routes
 * with the Router. It also resolves metadata for the route handler
 * using the MetadataResolver.
 *
 * @extends {BaseDecorator<PostDecoratorOptions>}
 */
class PostDecorator extends BaseDecorator<PostDecoratorOptions> {
  @Inject(Router)
  private gRouter!: Router;

  @Inject(MetadataResolver)
  private gMetadataResolver!: MetadataResolver;

  @Inject(RequestHandler)
  private gRequestHandler!: RequestHandler;

  /**
   * Called when the decorator is created.
   *
   * This method constructs the full path for the route, registers the route
   * with the Router, and sets up the event handler for the POST request.
   */
  public override created(): void {
    initializeMetadata(this.prototype);
    const method = initializeMetadataMethod(this.prototype, this.propertyName);
    method.method = 'POST';

    this.options.path = this.gMetadataResolver.resolveUrl({
      instance: this.instance,
      path: this.options.path,
      propertyName: this.propertyName,
    });

    this.gRouter.addRoute({
      path: this.options.path,
      method: 'POST',
      handler: this.gRequestHandler.prepareHandler({
        instance: this.instance,
        propertyName: this.propertyName,
      }),
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
