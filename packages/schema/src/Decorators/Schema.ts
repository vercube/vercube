import { BaseDecorator, createDecorator, Inject } from '@vercube/di';
import { SchemaRegistry } from '../Services/SchemaRegistry';
import type { SchemaRouteOptions } from '../Utils/RouteConfig';

// oxlint-disable-next-line no-empty-object-type
interface SchemaDecoratorOptions extends SchemaRouteOptions {}

/**
 * A decorator class for handling OpenAPI schema registration for routes.
 *
 * It only records which method is documented. The route config is built when
 * the document is generated, because the route decorator (`@Get`, `@Post`, ...)
 * may run after this one and fill the method metadata only then.
 *
 * @extends {BaseDecorator<SchemaDecoratorOptions>}
 */
class SchemaDecorator extends BaseDecorator<SchemaDecoratorOptions> {
  @Inject(SchemaRegistry)
  private readonly gSchemaRegistry!: SchemaRegistry;

  public override created(): void {
    this.gSchemaRegistry.add({
      prototype: this.prototype,
      propertyName: this.propertyName,
      options: this.options,
    });
  }
}

/**
 * A decorator function for registering OpenAPI schema metadata for a route.
 *
 * This function creates an instance of the SchemaDecorator class and registers
 * the schema with the specified options.
 *
 * @param {SchemaDecoratorOptions} params - The schema options for the route.
 * @returns {Function} - The decorator function.
 */
export function Schema(params: SchemaDecoratorOptions): Function {
  return createDecorator(SchemaDecorator, params);
}
