import { BaseDecorator, createDecorator } from '@vercube/di';
import { ValidationMiddleware } from '../../Middleware/ValidationMiddleware';
import { MetadataTypes } from '../../Types/MetadataTypes';
import { ValidationTypes } from '../../Types/ValidationTypes';
import { initializeMetadata, initializeMetadataMethod } from '../../Utils/Utils';

interface BodyDecoratorOptions {
  validationSchema?: ValidationTypes.Schema;
}

/**
 * @class BodyDecorator
 * @extends BaseDecorator<BodyDecoratorOptions>
 *
 * A decorator class that handles the metadata for HTTP request bodies.
 */
class BodyDecorator extends BaseDecorator<BodyDecoratorOptions, MetadataTypes.Metadata> {
  /**
   * @method created
   * This method is called when the decorator is created. It ensures that the metadata
   * for the property exists and adds the body argument to the metadata.
   */
  public override created(): void {
    const meta = initializeMetadata(this.prototype);
    const method = initializeMetadataMethod(this.prototype, this.propertyName);

    method.args.push({
      idx: this.propertyIndex,
      type: 'body',
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
 * @function Body
 * @returns {Function} A decorator function that registers the BodyDecorator.
 *
 * This function creates and returns a decorator that can be used to annotate
 * a parameter in a method to indicate that it should be populated with the
 * body of an HTTP request. The decorator uses the BodyDecorator class to
 * handle the metadata associated with the parameter.
 */
export function Body(options?: BodyDecoratorOptions): Function {
  return createDecorator(BodyDecorator, options);
}
