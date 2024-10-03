/* eslint-disable @typescript-eslint/no-empty-object-type */
import { BaseDecorator, Container, createDecorator, Inject } from '@cube/di';
import { MetadataResolver } from '../../Services/Metadata/MetadataResolver';
import type { BaseMiddleware } from '../../Services/Middleware/BaseMiddleware';
import type { MetadataTypes } from '../../Types/MetadataTypes';

interface MiddlewareDecoratorParams extends Omit<MetadataTypes.Middleware, 'middleware'> {
}

interface MiddlewareDecoratorOptions extends Omit<MetadataTypes.Middleware, 'middleware'> {
  middleware: typeof BaseMiddleware;
}

/**
 * MiddlewareDecorator class that extends BaseDecorator.
 */
class MiddlewareDecorator extends BaseDecorator<MiddlewareDecoratorOptions> {

  @Inject(Container)
  private gContainer!: Container;

  @Inject(MetadataResolver)
  private gMetadataResolver!: MetadataResolver;

  /**
   * Called when the decorator is created.
   * Initializes metadata for the property and adds the middleware.
   */
  public override created(): void {

    // if metadata for property does not exist, create it
    if (!this.prototype.__metadata[this.propertyName]) {
      this.prototype.__metadata[this.propertyName] = this.gMetadataResolver.create();
    }

    // we need to unshift here because decorators are applied in reverse order
    this.prototype.__metadata[this.propertyName].middlewares.unshift({
      type: this.options.type ?? 'before',
      priority: this.options.priority ?? 999, // default priority is 999 to ensure it runs last
      middleware: this.gContainer.resolve(this.options.middleware),
    });

  }

}

/**
 * Middleware decorator factory function.
 *
 * @param {typeof BaseMiddleware} middleware - The middleware class to be used.
 * @param {MiddlewareDecoratorParams} [opts] - Optional parameters for the middleware decorator.
 * @returns {Function} - The decorator function.
 */
export function Middleware(middleware: typeof BaseMiddleware, opts?: MiddlewareDecoratorParams): Function {
  return createDecorator(MiddlewareDecorator, { middleware, ...opts });
}
