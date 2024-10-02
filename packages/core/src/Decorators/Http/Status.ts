import { BaseDecorator, createDecorator, Inject } from '@cube/di';
import type { MetadataTypes } from '../../Types/MetadataTypes';
import { HTTPStatus } from '../../Types/HttpTypes';
import { MetadataResolver } from '../../Services/Metadata/MetadataResolver';

/**
 * Options for the StatusDecorator.
 * @typedef {Object} StatusDecoratorOptions
 * @property {HTTPStatus} code - The status value.
 */
interface StatusDecoratorOptions {
  code: HTTPStatus
}

/**
 * A decorator that sets a status on the response.
 * @extends {BaseDecorator<StatusDecoratorOptions>}
 */
class StatusDecorator extends BaseDecorator<StatusDecoratorOptions> {

  @Inject(MetadataResolver)
  private gMetadataResolver!: MetadataResolver;

  /**
   * Called when the decorator is created.
   * Sets a status on the response
   * @override
   */
  public override created(): void {
    // if metadata for property does not exist, create it
    if (!this.prototype.__metadata[this.propertyName]) {
      this.prototype.__metadata[this.propertyName] = this.gMetadataResolver.create();
    }

    this.prototype.__metadata[this.propertyName].actions.push({
      handler: (req: MetadataTypes.Request, res: MetadataTypes.Response) => {
        res.statusCode = this.options.code;
      },
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