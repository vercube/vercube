import { BaseDecorator, createDecorator } from '@vercube/di';
import type { MetadataTypes } from '../../Types/MetadataTypes';
import { HTTPStatus } from '../../Types/HttpTypes';
import {
  initializeMetadata,
  initializeMetadataMethod,
} from '../../Utils/Utils';

/**
 * Options for the StatusDecorator.
 * @typedef {Object} StatusDecoratorOptions
 * @property {HTTPStatus} code - The status value.
 */
interface StatusDecoratorOptions {
  code: HTTPStatus;
}

/**
 * A decorator that sets a status on the response.
 * @extends {BaseDecorator<StatusDecoratorOptions>}
 */
class StatusDecorator extends BaseDecorator<
  StatusDecoratorOptions,
  MetadataTypes.Metadata
> {
  /**
   * Called when the decorator is created.
   * Sets a status on the response
   * @override
   */
  public override created(): void {
    initializeMetadata(this.prototype);
    const method = initializeMetadataMethod(this.prototype, this.propertyName);

    method.actions.push({
      handler: () => ({
        status: this.options.code,
      }),
    });
  }
}

/**
 * Creates a Status decorator.
 * @param {number} code - The status value.
 * @returns {Function} The decorator function.
 */
export function Status(code: HTTPStatus): Function {
  return createDecorator(StatusDecorator, { code });
}
