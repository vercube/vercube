import { BaseDecorator, Inject, createDecorator } from '@vercube/di';
import { MetadataResolver } from '../../Services/Metadata/MetadataResolver';
import { RequestHandler } from '../../Services/Router/RequestHandler';
import { Router } from '../../Services/Router/Router';
import { initializeMetadata, initializeMetadataMethod } from '../../Utils/Utils';

interface PatchDecoratorOptions {
  path: string;
}

/**
 * A decorator class for handling HTTP PATCH requests.
 *
 * This class extends the BaseDecorator and is used to register PATCH routes
 * with the Router. It also resolves metadata for the route handler
 * using the MetadataResolver.
 *
 * @extends {BaseDecorator<PatchDecoratorOptions>}
 */
class PatchDecorator extends BaseDecorator<PatchDecoratorOptions> {
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
   * with the Router, and sets up the event handler for the PATCH request.
   */
  public override created(): void {
    initializeMetadata(this.prototype);
    const method = initializeMetadataMethod(this.prototype, this.propertyName);
    method.method = 'PATCH';

    this.options.path = this.gMetadataResolver.resolveUrl({
      instance: this.instance,
      path: this.options.path,
      propertyName: this.propertyName,
    });

    this.gRouter.addRoute({
      path: this.options.path,
      method: 'PATCH',
      handler: this.gRequestHandler.prepareHandler({
        instance: this.instance,
        propertyName: this.propertyName,
      }),
    });
  }
}

/**
 * A factory function for creating a PatchDecorator.
 *
 * This function returns a decorator function that can be used to annotate
 * a method with PATCH route information.
 *
 * @param {string} path - The path for the PATCH route.
 * @return {Function} The decorator function.
 */
export function Patch(path: string): Function {
  return createDecorator(PatchDecorator, { path });
}
