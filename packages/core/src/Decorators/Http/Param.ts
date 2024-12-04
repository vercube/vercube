import { BaseDecorator, createDecorator, Inject } from '@vercube/di';
import { MetadataResolver } from '../../Services/Metadata/MetadataResolver';

interface ParamDecoratorOptions {
  // name of the route parameter
  name: string;
  // @see https://h3.unjs.io/utils/request#getrouterparamevent-name-opts-decode
  opts: {
    decode?: boolean;
  };
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
class ParamDecorator extends BaseDecorator<ParamDecoratorOptions> {

  @Inject(MetadataResolver)
  private gMetadataResolver!: MetadataResolver;

  /**
   * Called when the decorator is created.
   *
   * This method checks if metadata for the property exists, creates it if it doesn't,
   * and then adds the parameter information to the metadata.
   */
  public override created(): void {

    // if metadata for property does not exist, create it
    if (!this.prototype.__metadata[this.propertyName]) {
      this.prototype.__metadata[this.propertyName] = this.gMetadataResolver.create();
    }

    // add parameter to metadata
    this.prototype.__metadata[this.propertyName].args.push({
      idx: this.propertyIndex,
      type: 'param',
      data: {
        name: this.options.name,
        decode: this.options?.opts?.decode ?? false,
      },
    });

  }

}

/**
 * A factory function for creating a ParamDecorator.
 *
 * This function returns a decorator function that can be used to annotate
 * a method parameter with parameter information.
 *
 * @param {string} name - The name of the parameter.
 * @param {Object} [opts] - Optional settings for the parameter.
 * @param {boolean} [opts.decode=false] - Whether to decode the parameter.
 * @return {Function} The decorator function.
 */
export function Param(name: string, opts?: ParamDecoratorOptions['opts']): Function {
  return createDecorator(ParamDecorator, { name, opts });
}