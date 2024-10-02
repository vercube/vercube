import { BaseDecorator, createDecorator, Inject } from '@cube/di';
import { MetadataResolver } from '../../Services/Metadata/MetadataResolver';
import type { MetadataTypes } from '../../Types/MetadataTypes';
import { HTTPRedirection } from "../../Types/HttpTypes";

/**
 * Options for the RedirectDecorator.
 * @typedef {Object} RedirectDecoratorOptions
 * @property {string} key - The header key.
 * @property {string} value - The header value.
 */
interface RedirectDecoratorOptions {
    location: string;
    code: HTTPRedirection;
}

class RedirectDecorator extends BaseDecorator<RedirectDecoratorOptions> {

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
                res.statusCode = this.options.code ?? 302;
                res.setHeader('Location', this.options.location);
            },
        });
    }

}

/**
 * Creates a Redirect decorator.
 * @param {string} location - The header key.
 * @param {number} code - The header value.
 * @returns {Function} The decorator function.
 */
export function Redirect(location: string, code: number = 302): Function {
    return createDecorator(RedirectDecorator, { location, code });
}