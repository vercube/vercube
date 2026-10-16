/* eslint-disable @typescript-eslint/no-empty-object-type */
import { BaseDecorator, createDecorator } from '@vercube/di';
import { initializeMetadata, initializeMetadataMethod, setMetadataArg } from '../../Utils/Utils';
import type { MetadataTypes } from '../../Types/MetadataTypes';

/**
 * @class MultipartFormDataDecorator
 * @extends BaseDecorator<MultipartFormDataOptions>
 *
 * A decorator class that handles the metadata for HTTP request bodies.
 */
class MultipartFormDataDecorator extends BaseDecorator<{}, MetadataTypes.Metadata> {
  /**
   * @method created
   * This method is called when the decorator is created. It ensures that the metadata
   * for the property exists and adds the body argument to the metadata.
   */
  public override created(): void {
    initializeMetadata(this.prototype);
    const method = initializeMetadataMethod(this.prototype, this.propertyName);

    setMetadataArg(method, {
      idx: this.propertyIndex,
      type: 'multipart-form-data',
    });
  }
}

/**
 * Decorator function that marks a parameter as multipart/form-data request body.
 * The body is parsed into an object of its fields: text fields are strings,
 * uploads are `File`s and a repeated field becomes an array. A request with
 * another content type is rejected with 415, a body over `server.bodyLimit`
 * with 413.
 *
 * @decorator
 * @returns {Function} A decorator function that can be applied to method parameters
 *
 * @example
 * class UserController {
 *   uploadFile(@MultipartFormData() form: { title: string; file: File }) {
 *     // Handle multipart form data
 *   }
 * }
 */

export function MultipartFormData(): Function {
  return createDecorator(MultipartFormDataDecorator, {});
}
