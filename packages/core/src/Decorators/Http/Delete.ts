import { defineEventHandler } from 'h3';
import { BaseDecorator, createDecorator, Inject } from '@cube/di';
import { RouterRegistry } from '../../Services/Router/RouterRegistry';
import { MetadataResolver } from '../../Services/Metadata/MetadataResolver';

interface DeleteDecoratorOptions {
  path: string;
}

/**
 * A decorator class for handling HTTP DELETE requests.
 *
 * This class extends the BaseDecorator and is used to register DELETE routes
 * with the RouterRegistry. It also resolves metadata for the route handler
 * using the MetadataResolver.
 *
 * @extends {BaseDecorator<DeleteDecoratorOptions>}
 */
class DeleteDecorator extends BaseDecorator<DeleteDecoratorOptions> {

  @Inject(RouterRegistry)
  private gRouterRegistry!: RouterRegistry;

  @Inject(MetadataResolver)
  private gMetadataResolver!: MetadataResolver;

  /**
   * Called when the decorator is created.
   *
   * This method constructs the full path for the route, registers the route
   * with the RouterRegistry, and sets up the event handler for the DELETE request.
   */
  public override created(): void {
    let baseRotue = this.instance.__metadata.controller.path ?? '';

    if (baseRotue.endsWith('/')) {
      baseRotue = baseRotue.slice(0, -1);
    }

    if (this.options.path.startsWith('/')) {
      this.options.path = this.options.path.slice(1);
    }

    this.options.path = `${baseRotue}/${this.options.path}`;

    this.gRouterRegistry.registerRoute({
      path: this.options.path,
      method: 'delete',
      // TODO: move handler to separate file and import in every HTTP Method decorator
      handler: defineEventHandler((event) => {
        const metadata = this.gMetadataResolver.resolve(event, this.prototype.__metadata[this.propertyName]);

        for (const action of metadata.actions) {
          action.handler(event.node.req, event.node.res);
        }

        return this.instance[this.propertyName].call(this.instance, ...metadata.args ?? []);
      }),
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