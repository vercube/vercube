import { BaseDecorator, createDecorator, Inject } from '@vercube/di';
import type { DeepPartial, MetadataTypes } from '@vercube/core';
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { SchemaRegistry } from '../Services/SchemaRegistry';
import { SchemaBodyResolver } from '../Resolvers/SchemaBodyResolver';
import { SchemaQueryParamsResolver } from '../Resolvers/SchemaQueryParamsResolver';

// oxlint-disable-next-line no-empty-object-type
interface SchemaDecoratorOptions extends Omit<RouteConfig, 'method' | 'path'> {}

/**
 * A decorator class for handling OpenAPI schema registration for routes.
 *
 * This class extends BaseDecorator and is used to register route schemas
 * with the SchemaRegistry. It also applies schema resolvers for responses,
 * body, and query parameters.
 *
 * @extends {BaseDecorator<SchemaDecoratorOptions>}
 */
class SchemaDecorator extends BaseDecorator<SchemaDecoratorOptions> {
  @Inject(SchemaRegistry)
  private readonly gSchemaRegistry: SchemaRegistry;

  public override async created(): Promise<void> {
    // move to the end of the event loop
    await new Promise((resolve) => setTimeout(resolve, 0));

    // get method metadata object
    const _methodMeta = this.prototype.__metadata.__methods[
      this.propertyName
    ] as MetadataTypes.Method;

    const _schema: DeepPartial<RouteConfig> = {
      method: _methodMeta.method!.toLowerCase() as any,
      path: _methodMeta.url!,
      ...(this.options as any),
    };

    // Use resolvers
    SchemaBodyResolver(_methodMeta, _schema);
    SchemaQueryParamsResolver(_methodMeta, _schema);

    // register schema
    this.gSchemaRegistry.register(_schema as RouteConfig);
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
