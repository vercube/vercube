/* eslint-disable @typescript-eslint/no-empty-object-type */
import { BaseDecorator, createDecorator } from '@vercube/di';
import { MetadataTypes } from '../../Types/MetadataTypes';
import {
  initializeMetadata,
  initializeMetadataMethod,
} from '../../Utils/Utils';

/**
 * @class MultipartFormDataDecorator
 * @extends BaseDecorator<MultipartFormDataOptions>
 *
 * A decorator class that handles the metadata for HTTP request bodies.
 */
class MultipartFormDataDecorator extends BaseDecorator<
  {},
  MetadataTypes.Metadata
> {
  /**
   * @method created
   * This method is called when the decorator is created. It ensures that the metadata
   * for the property exists and adds the body argument to the metadata.
   */
  public override created(): void {
    initializeMetadata(this.prototype);
    const method = initializeMetadataMethod(this.prototype, this.propertyName);

    method.args.push({
      idx: this.propertyIndex,
      type: 'multipart-form-data',
    });
  }
}

/**
 * Decorator function that marks a parameter as multipart/form-data request body.
 * This decorator will automatically parse incoming multipart form data
 *
 * @decorator
 * @returns {Function} A decorator function that can be applied to method parameters
 *
 * @example
 * class UserController {
 *   uploadFile(@MultipartFormData() formData: MyData) {
 *     // Handle multipart form data
 *   }
 * }
 */

export function MultipartFormData(): Function {
  return createDecorator(MultipartFormDataDecorator, {});
}
