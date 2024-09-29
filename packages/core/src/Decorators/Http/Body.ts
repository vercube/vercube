/* eslint-disable @typescript-eslint/no-empty-object-type */
import { BaseDecorator, createDecorator, Inject } from '@cube/di';
import { MetadataResolver } from '../../Services/Metadata/MetadataResolver';

/**
 * @class BodyDecorator
 * @extends BaseDecorator<BodyDecoratorOptions>
 *
 * A decorator class that handles the metadata for HTTP request bodies.
 */
class BodyDecorator extends BaseDecorator<{}> {

  @Inject(MetadataResolver)
  private gMetadataResolver!: MetadataResolver;

  /**
   * @method created
   * This method is called when the decorator is created. It ensures that the metadata
   * for the property exists and adds the body argument to the metadata.
   */
  public override created(): void {

    // if metadata for property does not exist, create it
    if (!this.prototype.__metadata[this.propertyName]) {
      this.prototype.__metadata[this.propertyName] = this.gMetadataResolver.create();
    }

    // add body to metadata
    this.prototype.__metadata[this.propertyName].args.push({
      idx: this.propertyIndex,
      type: 'body',
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
export function Body(): Function {
  return createDecorator(BodyDecorator, {});
}
