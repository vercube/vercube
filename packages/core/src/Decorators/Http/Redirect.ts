import { BaseDecorator, createDecorator } from '@vercube/di';
import { HTTPStatus } from '../../Types/HttpTypes';
import { initializeMetadata, initializeMetadataMethod } from '../../Utils/Utils';
import type { MetadataTypes } from '../../Types/MetadataTypes';

/**
 * Options for the RedirectDecorator.
 * @typedef {Object} RedirectDecoratorOptions
 * @property {string} location - The location header value.
 * @property {string} code - The redirect status code.
 */
interface RedirectDecoratorOptions {
  location: string;
  code: HTTPStatus;
}

class RedirectDecorator extends BaseDecorator<RedirectDecoratorOptions, MetadataTypes.Metadata> {
  /**
   * Decorator responsible for redirecting to a specified URL.
   * Called when the decorator is created.
   * Sets the location header value and status code.
   * @override
   */
  public override created(): void {
    initializeMetadata(this.prototype);
    const method = initializeMetadataMethod(this.prototype, this.propertyName);

    // A ResponseInit rather than a Response, so the status and `Location` are
    // merged into the response built so far and headers set by middlewares and
    // `@SetHeader` survive.
    method.actions.push({
      handler: () => ({
        status: this.options.code,
        headers: { Location: this.options.location },
      }),
    });
  }
}

/**
 * Creates a Redirect decorator.
 * @param {string} location - The location header value.
 * @param {number} [code=301] - The status code.
 * @returns {Function} The decorator function.
 */
export function Redirect(location: string, code: HTTPStatus = 301): Function {
  return createDecorator(RedirectDecorator, { location, code });
}
