import { BaseDecorator, createDecorator, Inject } from '@cube/di';

/**
 * Options for the StatusDecorator.
 * @typedef {Object} StatusDecoratorOptions
 * @property {number} status - The status value.
 */
interface StatusDecoratorOptions {
    status: number
}

/**
 * A decorator that sets a status on the response.
 * @extends {BaseDecorator<StatusDecoratorOptions>}
 */
class StatusDecorator extends BaseDecorator<StatusDecoratorOptions> {

    /**
     * Called when the decorator is created.
     * Sets a status on the response
     * @override
     */
    public override created(): void {
        console.log(this.prototype);
    }

}

/**
 * Creates a Status decorator.
 * @param {number} status - The status value.
 * @returns {Function} The decorator function.
 */
export function Status(status: number): Function {
    return createDecorator(StatusDecorator, { status });
}