import { defineEventHandler } from 'h3';
import { BaseDecorator, createDecorator, Inject } from '@cube/di';
import { RouterRegistry } from '../../Services/Router/RouterRegistry';
import { MetadataResolver } from '../../Services/Metadata/MetadataResolver';

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

  @Inject(MetadataResolver)
  private gMetadataResolver!: MetadataResolver;

  /**
   * Called when the decorator is created.
   *
   * This method constructs the full path for the route, registers the route
   * with the RouterRegistry, and sets up the event handler for the TRACE request.
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
      method: 'trace',
      handler: defineEventHandler((event) => {
        const metadata = this.gMetadataResolver.resolve(event, this.prototype.__metadata[this.propertyName]);
        return this.instance[this.propertyName].call(this.instance, ...metadata.args);
      }),
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