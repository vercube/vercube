import { BaseDecorator, createDecorator } from '@vercube/di';
import type { MetadataTypes } from '../../Types/MetadataTypes';
import { initializeMetadata, initializeMetadataMethod } from '../../Utils/Utils';

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
class SetHeaderDecorator extends BaseDecorator<SetHeaderDecoratorOptions, MetadataTypes.Metadata> {

  /**
   * Called when the decorator is created.
   * Adds a query parameter to the metadata.
   * @override
   */
  public override created(): void {
    initializeMetadata(this.prototype);
    const method = initializeMetadataMethod(this.prototype, this.propertyName);

    method.actions.push({
      handler: (req: Request, res: Response) => {
        res.headers.delete(this.options.key);
        res.headers.append(this.options.key, this.options.value);
        return res;
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