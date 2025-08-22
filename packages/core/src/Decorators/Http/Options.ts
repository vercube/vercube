import { BaseDecorator, Inject, createDecorator } from '@vercube/di';
import { MetadataResolver } from '../../Services/Metadata/MetadataResolver';
import { RequestHandler } from '../../Services/Router/RequestHandler';
import { Router } from '../../Services/Router/Router';
import { initializeMetadata, initializeMetadataMethod } from '../../Utils/Utils';

interface OptionsDecoratorOptions {
  path: string;
}

/**
 * A decorator class for handling HTTP OPTIONS requests.
 *
 * This class extends the BaseDecorator and is used to register OPTIONS routes
 * with the Router. It also resolves metadata for the route handler
 * using the MetadataResolver.
 *
 * @extends {BaseDecorator<OptionsDecoratorOptions>}
 */
class OptionsDecorator extends BaseDecorator<OptionsDecoratorOptions> {
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
   * with the Router, and sets up the event handler for the OPTIONS request.
   */
  public override created(): void {
    initializeMetadata(this.prototype);
    const method = initializeMetadataMethod(this.prototype, this.propertyName);
    method.method = 'OPTIONS';

    this.options.path = this.gMetadataResolver.resolveUrl({
      instance: this.instance,
      path: this.options.path,
      propertyName: this.propertyName,
    });

    this.gRouter.addRoute({
      path: this.options.path,
      method: 'OPTIONS',
      handler: this.gRequestHandler.prepareHandler({
        instance: this.instance,
        propertyName: this.propertyName,
      }),
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
