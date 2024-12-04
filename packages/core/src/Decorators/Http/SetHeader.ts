import { BaseDecorator, createDecorator, Inject } from '@vercube/di';
import { MetadataResolver } from '../../Services/Metadata/MetadataResolver';
import type { MetadataTypes } from '../../Types/MetadataTypes';

/**
 * Options for the SetHeaderDecorator.
 * @typedef {Object} SetHeaderDecoratorOptions
 * @property {string} key - The header key.
 * @property {string} value - The header value.
 */
interface SetHeaderDecoratorOptions {
  key: string;
  value: string;
}

/**
 * A decorator that sets a header on the response.
 * @extends {BaseDecorator<SetHeaderDecoratorOptions>}
 */
class SetHeaderDecorator extends BaseDecorator<SetHeaderDecoratorOptions> {

  /**
   * Injected MetadataResolver instance.
   * @type {MetadataResolver}
   * @private
   */
  @Inject(MetadataResolver)
  private gMetadataResolver!: MetadataResolver;

  /**
   * Called when the decorator is created.
   * Adds a query parameter to the metadata.
   * @override
   */
  public override created(): void {
    // if metadata for property does not exist, create it
    if (!this.prototype.__metadata[this.propertyName]) {
      this.prototype.__metadata[this.propertyName] = this.gMetadataResolver.create();
    }

    // add query parameter to metadata
    this.prototype.__metadata[this.propertyName].actions.push({
      handler: (req: MetadataTypes.Request, res: MetadataTypes.Response) => {
        res.setHeader(this.options.key, this.options.value);
      },
    });
  }

}

/**
 * Creates a SetHeader decorator.
 * @param {string} key - The header key.
 * @param {string} value - The header value.
 * @returns {Function} The decorator function.
 */
export function SetHeader(key: string, value: string): Function {
  return createDecorator(SetHeaderDecorator, { key, value });
}