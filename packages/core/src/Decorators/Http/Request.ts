/* eslint-disable @typescript-eslint/no-empty-object-type */
import { BaseDecorator, createDecorator } from '@vercube/di';
import type { MetadataTypes } from '../../Types/MetadataTypes';
import { initializeMetadata, initializeMetadataMethod } from '../../Utils/Utils';

/**
 * This class is responsible for managing request decorators.
 *
 * This class extends the BaseDecorator and is used to register request information
 * with the MetadataResolver. It ensures that the metadata for the property is created
 * and adds the request information to the metadata.
 *
 * @extends {BaseDecorator<{}>}
 */
class RequestDecorator extends BaseDecorator<{}, MetadataTypes.Metadata> {
  /**
   * Called when the decorator is created.
   *
   * This method checks if metadata for the property exists, creates it if it doesn't,
   * and then adds the request information to the metadata.
   */
  public override created(): void {
    initializeMetadata(this.prototype);
    const method = initializeMetadataMethod(this.prototype, this.propertyName);

    method.args.push({
      idx: this.propertyIndex,
      type: 'request',
    });
  }
}

/**
 * A factory function for creating a RequestDecorator.
 *
 * This function returns a decorator function that can be used to annotate
 * a method parameter with request information.
 *
 * @return {Function} The decorator function.
 */
export function Request(): Function {
  return createDecorator(RequestDecorator, {});
}
