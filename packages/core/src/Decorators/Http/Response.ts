/* eslint-disable @typescript-eslint/no-empty-object-type */
import { BaseDecorator, createDecorator } from '@vercube/di';
import { initializeMetadata, initializeMetadataMethod } from '../../Utils/Utils';
import type { MetadataTypes } from '../../Types/MetadataTypes';

/**
 * This class is responsible for managing response decorators.
 *
 * This class extends the BaseDecorator and is used to register response information
 * with the MetadataResolver. It ensures that the metadata for the property is created
 * and adds the response information to the metadata.
 *
 * @extends {BaseDecorator<{}>}
 */
class ResponseDecorator extends BaseDecorator<{}, MetadataTypes.Metadata> {
  /**
   * Called when the decorator is created.
   *
   * This method checks if metadata for the property exists, creates it if it doesn't,
   * and then adds the response information to the metadata.
   */
  public override created(): void {
    initializeMetadata(this.prototype);
    const method = initializeMetadataMethod(this.prototype, this.propertyName);

    method.args.push({
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
