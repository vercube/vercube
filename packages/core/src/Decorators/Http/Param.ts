import { BaseDecorator, createDecorator, Inject } from '@vercube/di';
import { ValidationMiddleware } from '../../Middleware/ValidationMiddleware';
import { MetadataResolver } from '../../Services/Metadata/MetadataResolver';
import { addMetadataMiddleware, initializeMetadata, initializeMetadataMethod, setMetadataArg } from '../../Utils/Utils';
import type { MetadataTypes } from '../../Types/MetadataTypes';
import type { ValidationTypes } from '../../Types/ValidationTypes';

interface ParamDecoratorOptions {
  // name of the route parameter
  name: string;
  validationSchema?: ValidationTypes.Schema;
}

/**
 * This class is responsible for managing parameter decorators.
 *
 * This class extends the BaseDecorator and is used to register parameter information
 * with the MetadataResolver. It ensures that the metadata for the property is created
 * and adds the parameter information to the metadata.
 *
 * @extends {BaseDecorator<ParamDecoratorOptions>}
 */
class ParamDecorator extends BaseDecorator<ParamDecoratorOptions, MetadataTypes.Metadata> {
  @Inject(MetadataResolver)
  private gMetadataResolver!: MetadataResolver;

  /**
   * Called when the decorator is created.
   *
   * This method checks if metadata for the property exists, creates it if it doesn't,
   * and then adds the parameter information to the metadata.
   */
  public override created(): void {
    const meta = initializeMetadata(this.prototype);
    const method = initializeMetadataMethod(this.prototype, this.propertyName);

    // add parameter to metadata
    setMetadataArg(method, {
      idx: this.propertyIndex,
      type: 'param',
      data: {
        name: this.options.name,
      },
      validate: this.options.validationSchema ? true : false,
      validationSchema: this.options.validationSchema,
    });

    // the validation middleware only has work to do when a schema was given
    if (this.options.validationSchema) {
      addMetadataMiddleware(
        meta,
        {
          target: this.propertyName,
          priority: -1,
          args: {},
          middleware: ValidationMiddleware,
        },
        'first',
      );
    }
  }
}

/**
 * A factory function for creating a ParamDecorator.
 *
 * This function returns a decorator function that can be used to annotate
 * a method parameter with parameter information.
 *
 * Pass an options object to validate the parameter. The parsed value (after
 * coercion and transforms) is what the handler receives:
 *
 * ```ts
 * @Get('/:id')
 * getUser(@Param({ name: 'id', validationSchema: z.coerce.number().int() }) id: number) {}
 * ```
 *
 * @param {string | ParamDecoratorOptions} nameOrOptions - The name of the route parameter, or options with `name` and `validationSchema`.
 * @return {Function} The decorator function.
 */
export function Param(nameOrOptions: string | ParamDecoratorOptions): Function {
  return createDecorator(ParamDecorator, typeof nameOrOptions === 'string' ? { name: nameOrOptions } : nameOrOptions);
}
