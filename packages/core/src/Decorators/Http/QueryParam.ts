import { BaseDecorator, createDecorator } from '@vercube/di';
import type { MetadataTypes } from '../../Types/MetadataTypes';
import type { ValidationTypes } from '../../Types/ValidationTypes';
import { ValidationMiddleware } from '../../Middleware/ValidationMiddleware';
import { initializeMetadata, initializeMetadataMethod } from '../../Utils/Utils';

interface QueryParamDecoratorOptions {
  name: string;
  validationSchema?: ValidationTypes.Schema;
}

/**
 * This class is responsible for managing query parameter decorators.
 *
 * This class extends the BaseDecorator and is used to register query parameter information
 * with the MetadataResolver. It ensures that the metadata for the property is created
 * and adds the query parameter information to the metadata.
 *
 * @extends {BaseDecorator<QueryDecoratorOptions>}
 */
class QueryParamDecorator extends BaseDecorator<QueryParamDecoratorOptions, MetadataTypes.Metadata> {

  /**
   * Called when the decorator is created.
   *
   * This method checks if metadata for the property exists, creates it if it doesn't,
   * and then adds the query parameter information to the metadata.
   */
  public override created(): void {
    const meta = initializeMetadata(this.prototype);
    const method = initializeMetadataMethod(this.prototype, this.propertyName);

    method.args.push({
      idx: this.propertyIndex,
      type: 'query-param',
      data: {
        name: this.options.name,
      },
      validate: this.options?.validationSchema ? true : false,
      validationSchema: this.options?.validationSchema,
    });

    meta.__middlewares.unshift({
      target: this.propertyName,
      priority: -1,
      args: {},
      middleware: ValidationMiddleware,
    });

  }

}

/**
 * A factory function for creating a QueryDecorator.
 *
 * This function returns a decorator function that can be used to annotate
 * a method parameter with query parameter information.
 *
 * @param {QueryParamDecoratorOptions} options - The options for the decorator.
 * @return {Function} The decorator function.
 */
export function QueryParam(options: QueryParamDecoratorOptions): Function {
  return createDecorator(QueryParamDecorator, options);
}