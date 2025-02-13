/* eslint-disable @typescript-eslint/no-empty-object-type */

import { BaseDecorator, createDecorator, Inject } from '@vercube/di';
import { MetadataResolver } from '../../Services/Metadata/MetadataResolver';
import { MetadataTypes } from '../../Types/MetadataTypes';

/**
 * This class is responsible for managing headers decorator.
 *
 * This class extends the BaseDecorator and is used to register headers parameters
 * with the MetadataResolver. It ensures that the metadata for the property is created
 * and adds the headers information to the metadata.
 *
 * @extends {BaseDecorator<{}>}
 */
class HeadersDecorator extends BaseDecorator<{}, MetadataTypes.Metadata> {

  @Inject(MetadataResolver)
  private gMetadataResolver!: MetadataResolver;

  /**
   * Called when the decorator is created.
   *
   * This method checks if metadata for the property exists, creates it if it doesn't,
   * and then adds the headers information to the metadata.
   */
  public override created(): void {
    if (!this.prototype.__metadata?.__methods) {
      this.prototype.__metadata.__methods = {};
    }

    // if metadata for property does not exist, create it
    if (!this.prototype.__metadata?.__methods?.[this.propertyName]) {
      this.prototype.__metadata.__methods[this.propertyName] = this.gMetadataResolver.create();
    }

    // add body to metadata
    this.prototype.__metadata.__methods[this.propertyName].args.push({
      idx: this.propertyIndex,
      type: 'headers',
    });

  }

}

/**
 * A factory function for creating a HeadersDecorator.
 *
 * This function returns a decorator function that can be used to annotate
 * a method parameter with headers information.
 *
 * @return {Function} The decorator function.
 */
export function Headers(): Function {
  return createDecorator(HeadersDecorator, {});
}
