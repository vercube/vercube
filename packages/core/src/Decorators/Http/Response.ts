/* eslint-disable @typescript-eslint/no-empty-object-type */
import { BaseDecorator, createDecorator, Inject } from '@cube/di';
import { MetadataResolver } from '../../Services/Metadata/MetadataResolver';

/**
 * This class is responsible for managing response decorators.
 *
 * This class extends the BaseDecorator and is used to register response information
 * with the MetadataResolver. It ensures that the metadata for the property is created
 * and adds the response information to the metadata.
 *
 * @extends {BaseDecorator<{}>}
 */
class ResponseDecorator extends BaseDecorator<{}> {

  @Inject(MetadataResolver)
  private gMetadataResolver!: MetadataResolver;

  /**
   * Called when the decorator is created.
   *
   * This method checks if metadata for the property exists, creates it if it doesn't,
   * and then adds the response information to the metadata.
   */
  public override created(): void {

    // if metadata for property does not exist, create it
    if (!this.prototype.__metadata[this.propertyName]) {
      this.prototype.__metadata[this.propertyName] = this.gMetadataResolver.create();
    }

    // add response to metadata
    this.prototype.__metadata[this.propertyName].args.push({
      idx: this.propertyIndex,
      type: 'response',
    });

  }

}

/**
 * A factory function for creating a ResponseDecorator.
 *
 * This function returns a decorator function that can be used to annotate
 * a method parameter with response information.
 *
 * @return {Function} The decorator function.
 */
export function Response(): Function {
  return createDecorator(ResponseDecorator, {});
}