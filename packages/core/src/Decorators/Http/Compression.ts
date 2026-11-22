import { BaseDecorator, createDecorator } from '@vercube/di';
import { initializeMetadata, initializeMetadataMethod } from '../../Utils/Utils';
import type { MetadataTypes } from '../../Types/MetadataTypes';
import type { RouterTypes } from '../../Types/RouterTypes';

/**
 * Options of the `@Compression()` decorator.
 */
interface CompressionDecoratorOptions {
  /** False to opt the route out, or its own options. */
  value: RouterTypes.RouteCompression | false;
}

/**
 * Records what a route asks of response compression.
 *
 * @extends {BaseDecorator<CompressionDecoratorOptions>}
 */
class CompressionDecorator extends BaseDecorator<CompressionDecoratorOptions, MetadataTypes.Metadata> {
  /**
   * Called when the decorator is created. Leaves the choice in the route's
   * metadata, where the request handler reads it once, when the route is
   * registered.
   */
  public override created(): void {
    initializeMetadata(this.prototype);
    const method = initializeMetadataMethod(this.prototype, this.propertyName);
    const value = this.options.value;

    method.meta.compression = value === false ? false : { ...value };
  }
}

/**
 * Decides how the response of one route is compressed, where the
 * `compression` setting decides for the application.
 *
 * `@Compression(false)` sends the response of the route as it is, for a body
 * that must reach the client byte for byte or is not worth the CPU.
 * `@Compression({ streams: true })` compresses the stream a route answers
 * with, which is otherwise left alone.
 *
 * The decorator does not turn compression on: without `compression` in the
 * configuration nothing is compressed.
 *
 * @example
 * ```ts
 * @Get('/export')
 * @Stream({ type: 'application/x-ndjson' })
 * @Compression({ streams: true })
 * public async *export(): AsyncGenerator<Order> {
 *   yield* this.orders.cursor();
 * }
 *
 * @Get('/signed')
 * @Compression(false)
 * public signed(): string {
 *   return this.payload;
 * }
 * ```
 *
 * @param {RouterTypes.RouteCompression | false} [options] - False to opt out, or the route's options.
 * @returns {Function} - The decorator function.
 */
export function Compression(options: RouterTypes.RouteCompression | false = {}): Function {
  return createDecorator(CompressionDecorator, { value: options });
}
