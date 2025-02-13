 
import { BaseDecorator, createDecorator, Inject } from '@vercube/di';
import { MetadataResolver } from '../../Services/Metadata/MetadataResolver';
import { MetadataTypes } from '../../Types/MetadataTypes';
import { ValidationMiddleware } from '../../Middleware/ValidationMiddleware';
import { ValidationTypes } from '../../Types/ValidationTypes';

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

  @Inject(MetadataResolver)
  private gMetadataResolver!: MetadataResolver;

  /**
   * @method created
   * This method is called when the decorator is created. It ensures that the metadata
   * for the property exists and adds the body argument to the metadata.
   */
  public override created(): void {
    if (!this.prototype.__metadata?.__methods) {
      this.prototype.__metadata.__methods = {};
    }

    // if metadata for property does not exist, create it
    if (!this.prototype.__metadata.__methods[this.propertyName]) {
      this.prototype.__metadata.__methods[this.propertyName] = this.gMetadataResolver.create();
    }

    // add body to metadata
    this.prototype.__metadata.__methods[this.propertyName].args.push({
      idx: this.propertyIndex,
      type: 'body',
      validate: this.options?.validationSchema ? true : false,
      validationSchema: this.options?.validationSchema,
    });

    // add query parameter to metadata
    this.prototype.__metadata.__middlewares.unshift({
      target: this.propertyName,
      type: 'before',
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
