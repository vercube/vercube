import { BaseDecorator, createDecorator, Inject } from '@cube/di';
import { MetadataResolver } from '../../Services/Metadata/MetadataResolver';
import type { MetadataTypes } from '../../Types/MetadataTypes';
import { HTTPStatus } from '../../Types/HttpTypes';

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

class RedirectDecorator extends BaseDecorator<RedirectDecoratorOptions> {

    /**
     * Injected MetadataResolver instance.
     * @type {MetadataResolver}
     * @private
     */
    @Inject(MetadataResolver)
    private gMetadataResolver!: MetadataResolver;

    /**
     * Decorator responsible for redirecting to a specified URL.
     * Called when the decorator is created.
     * Sets the location header value and status code.
     * @override
     */

    public override created(): void {
        // if metadata for property does not exist, create it
        if (!this.prototype.__metadata[this.propertyName]) {
            this.prototype.__metadata[this.propertyName] = this.gMetadataResolver.create();
        }

        // Set status code and location header.
        this.prototype.__metadata[this.propertyName].actions.push({
            handler: (req: MetadataTypes.Request, res: MetadataTypes.Response) => {
                res.statusCode = this.options.code;
                res.setHeader('Location', this.options.location);
            },
        });
    }

}

/**
 * Creates a Redirect decorator.
 * @param {string} location - The location header value.
 * @param {number} code - The redirect status code.
 * @returns {Function} The decorator function.
 */
export function Redirect(location: string, code: HTTPStatus = 301): Function {
    return createDecorator(RedirectDecorator, { location, code });
}