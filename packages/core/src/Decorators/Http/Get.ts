import { BaseDecorator, Inject, createDecorator } from '@vercube/di';
import { MetadataResolver } from '../../Services/Metadata/MetadataResolver';
import { RequestHandler } from '../../Services/Router/RequestHandler';
import { Router } from '../../Services/Router/Router';
import { initializeMetadata, initializeMetadataMethod } from '../../Utils/Utils';

interface GetDecoratorOptions {
  path: string;
}

/**
 * A decorator class for handling HTTP GET requests.
 *
 * This class extends the BaseDecorator and is used to register GET routes
 * with the Router. It also resolves metadata for the route handler
 * using the MetadataResolver.
 *
 * @extends {BaseDecorator<GetDecoratorOptions>}
 */
class GetDecorator extends BaseDecorator<GetDecoratorOptions> {
  @Inject(Router)
  private gRouter!: Router;

  @Inject(RequestHandler)
  private gRequestHandler!: RequestHandler;

  @Inject(MetadataResolver)
  private gMetadataResolver!: MetadataResolver;

  /**
   * Called when the decorator is created.
   *
   * This method constructs the full path for the route, registers the route
   * with the Router, and sets up the event handler for the GET request.
   */
  public override created(): void {
    initializeMetadata(this.prototype);
    const method = initializeMetadataMethod(this.prototype, this.propertyName);
    method.method = 'GET';

    this.options.path = this.gMetadataResolver.resolveUrl({
      instance: this.instance,
      path: this.options.path,
      propertyName: this.propertyName,
    });

    this.gRouter.addRoute({
      path: this.options.path,
      method: 'GET',
      handler: this.gRequestHandler.prepareHandler({
        instance: this.instance,
        propertyName: this.propertyName,
      }),
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
