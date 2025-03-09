import { BaseDecorator, createDecorator } from '@vercube/di';
import type { MetadataTypes } from '../../Types/MetadataTypes';
import type { ValidationTypes } from '../../Types/ValidationTypes';
import { ValidationMiddleware } from '../../Middleware/ValidationMiddleware';
import { initializeMetadata, initializeMetadataMethod } from '../../Utils/Utils';

interface QueryParamsDecoratorOptions {
  validationSchema?: ValidationTypes.Schema;
}

/**
 * This class is responsible for managing query parameters decorators.
 *
 * This class extends the BaseDecorator and is used to register query parameters information
 * with the MetadataResolver. It ensures that the metadata for the property is created
 * and adds the query parameters information to the metadata.
 *
 * @extends {BaseDecorator<QueryDecoratorOptions>}
 */
class QueryParamsDecorator extends BaseDecorator<QueryParamsDecoratorOptions, MetadataTypes.Metadata> {

  /**
   * Called when the decorator is created.
   *
   * This method checks if metadata for the property exists, creates it if it doesn't,
   * and then adds the query parameters information to the metadata.
   */
  public override created(): void {
    const meta = initializeMetadata(this.prototype);
    const method = initializeMetadataMethod(this.prototype, this.propertyName);

    // add body to metadata
    method.args.push({
      idx: this.propertyIndex,
      type: 'query-params',
      data: {},
      validate: this.options?.validationSchema ? true : false,
      validationSchema: this.options?.validationSchema,
    });

    // add query parameter to metadata
    meta.__middlewares.unshift({
      target: this.propertyName,
      priority: -1,
      args: {},
      middleware: ValidationMiddleware,
    });

  }

}

/**
 * A factory function for creating a QueryParamsDecorator.
 *
 * This function returns a decorator function that can be used to annotate
 * a method parameter with query parameter information.
 *
 * @param {QueryParamsDecoratorOptions} options - The options for the decorator.
 * @return {Function} The decorator function.
 */
export function QueryParams(options: QueryParamsDecoratorOptions): Function {
  return createDecorator(QueryParamsDecorator, options);
}