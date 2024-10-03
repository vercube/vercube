import { defineEventHandler } from 'h3';
import { BaseDecorator, createDecorator, Inject } from '@cube/di';
import { RouterRegistry } from '../../Services/Router/RouterRegistry';
import { MetadataResolver } from '../../Services/Metadata/MetadataResolver';

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

  /**
   * Called when the decorator is created.
   *
   * This method constructs the full path for the route, registers the route
   * with the RouterRegistry, and sets up the event handler for the POST request.
   */
  public override created(): void {
    this.options.path = this.gMetadataResolver.resolveUrl({
      instance: this.instance,
      path: this.options.path,
      propertyName: this.propertyName,
    });

    this.gRouterRegistry.registerRoute({
      path: this.options.path,
      method: 'post',
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