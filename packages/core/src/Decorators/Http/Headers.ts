/* eslint-disable @typescript-eslint/no-empty-object-type */

import { BaseDecorator, createDecorator } from '@vercube/di';
import { MetadataTypes } from '../../Types/MetadataTypes';
import { initializeMetadata, initializeMetadataMethod } from '../../Utils/Utils';

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
  /**
   * Called when the decorator is created.
   *
   * This method checks if metadata for the property exists, creates it if it doesn't,
   * and then adds the headers information to the metadata.
   */
  public override created(): void {
    initializeMetadata(this.prototype);
    const method = initializeMetadataMethod(this.prototype, this.propertyName);

    method.args.push({
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
