import { BaseDecorator, createDecorator, Inject } from '@cube/di';
import { MetadataResolver } from '../../Services/Metadata/MetadataResolver';

interface HeaderDecoratorOptions {
  name: string;
}

/**
 * A decorator class for handling HTTP header parameters.
 *
 * This class extends the BaseDecorator and is used to register header parameters
 * with the MetadataResolver. It ensures that the metadata for the property is created
 * and adds the header information to the metadata.
 *
 * @extends {BaseDecorator<HeaderDecoratorOptions>}
 */
class HeaderDecorator extends BaseDecorator<HeaderDecoratorOptions> {

  @Inject(MetadataResolver)
  private gMetadataResolver!: MetadataResolver;

  /**
   * Called when the decorator is created.
   *
   * This method checks if metadata for the property exists, creates it if it doesn't,
   * and then adds the header information to the metadata.
   */
  public override created(): void {

    // if metadata for property does not exist, create it
    if (!this.prototype.__metadata[this.propertyName]) {
      this.prototype.__metadata[this.propertyName] = this.gMetadataResolver.create();
    }

    // add body to metadata
    this.prototype.__metadata[this.propertyName].args.push({
      idx: this.propertyIndex,
      type: 'header',
      data: {
        name: this.options.name,
      },
    });

  }

}

/**
 * A decorator function for handling HTTP header parameters.
 *
 * This function creates a HeaderDecorator with the specified name and registers it.
 * It is used to annotate a parameter in a method to indicate that it should be
 * populated with the value of a specific HTTP header.
 *
 * @param {string} name - The name of the HTTP header to bind to the parameter.
 * @returns {Function} - A decorator function that registers the HeaderDecorator.
 */
export function Header(name: string): Function {
  return createDecorator(HeaderDecorator, { name });
}
