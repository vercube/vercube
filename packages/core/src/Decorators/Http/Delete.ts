import { BaseDecorator, createDecorator, Inject } from '@vercube/di';
import { MetadataResolver } from '../../Services/Metadata/MetadataResolver';
import { RequestHandler } from '../../Services/Router/RequestHandler';
import { MetadataTypes } from '../../Types/MetadataTypes';
import { initializeMetadata, initializeMetadataMethod } from '../../Utils/Utils';
import { Router } from '../../Services/Router/Router';

interface DeleteDecoratorOptions {
  path: string;
}

/**
 * A decorator class for handling HTTP DELETE requests.
 *
 * This class extends the BaseDecorator and is used to register DELETE routes
 * with the Router. It also resolves metadata for the route handler
 * using the MetadataResolver.
 *
 * @extends {BaseDecorator<DeleteDecoratorOptions>}
 */
class DeleteDecorator extends BaseDecorator<DeleteDecoratorOptions, MetadataTypes.Metadata> {

  @Inject(Router)
  private gRouter: Router;

  @Inject(RequestHandler)
  private gRequestHandler!: RequestHandler;

  @Inject(MetadataResolver)
  private gMetadataResolver!: MetadataResolver;

  /**
   * Called when the decorator is created.
   *
   * This method constructs the full path for the route, registers the route
   * with the Router, and sets up the event handler for the DELETE request.
   */
  public override created(): void {
    initializeMetadata(this.prototype);
    initializeMetadataMethod(this.prototype, this.propertyName);

    this.options.path = this.gMetadataResolver.resolveUrl({
      instance: this.instance,
      path: this.options.path,
      propertyName: this.propertyName,
    });

    this.gRouter.addRoute({
      path: this.options.path,
      method: 'DELETE',
      handler: this.gRequestHandler.prepareHandler({ instance: this.instance, propertyName: this.propertyName }),
    });

  }

}

/**
 * A factory function for creating a DeleteDecorator.
 *
 * This function returns a decorator function that can be used to annotate
 * a method with DELETE route information.
 *
 * @param {string} path - The path for the DELETE route.
 * @return {Function} The decorator function.
 */
export function Delete(path: string): Function {
  return createDecorator(DeleteDecorator, { path });
}