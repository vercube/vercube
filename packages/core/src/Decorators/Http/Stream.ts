import { BaseDecorator, createDecorator, InjectOptional } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { CoreErrors } from '../../Errors/Catalog';
import { createStream } from '../../Utils/Stream';
import { initializeMetadata, initializeMetadataMethod } from '../../Utils/Utils';
import type { MetadataTypes } from '../../Types/MetadataTypes';
import type { StreamOptions, StreamSource } from '../../Utils/Stream';

/**
 * Makes a handler answer with a stream: what it returns is sent chunk by
 * chunk as it is produced.
 *
 * @extends {BaseDecorator<StreamOptions>}
 */
class StreamDecorator extends BaseDecorator<StreamOptions, MetadataTypes.Metadata> {
  @InjectOptional(Logger)
  private gLogger?: Logger;

  /**
   * Called when the decorator is created. Wraps the handler on the controller
   * instance, so the route, whichever decorator registers it, calls the
   * wrapper.
   */
  public override created(): void {
    initializeMetadata(this.prototype);
    const method = initializeMetadataMethod(this.prototype, this.propertyName);

    const name = `${this.instance?.constructor?.name}::${this.propertyName}`;

    if (method.meta.sse) {
      throw CoreErrors.STREAM_SSE_COMBINED({ handler: name, decorator: 'Stream' });
    }

    // declarative marker, for tools such as the OpenAPI generator
    method.meta.stream = { type: this.options.type };

    const original = (this.prototype as unknown as Record<string, Function>)[this.propertyName];
    const options: StreamOptions = {
      type: this.options.type,
      serialize: this.options.serialize,
      onError: this.options.onError ?? ((error) => this.gLogger?.error(`${name}: stream failed`, error)),
    };

    // The wrapper lives on the instance, so the prototype method stays untouched
    // and the route handler picks the wrapper up through `instance[propertyName]`.
    this.instance[this.propertyName] = function streamHandler(this: unknown, ...args: unknown[]): unknown {
      const result = original.apply(this, args);

      if (result instanceof Promise) {
        return result.then((value: unknown) => toStream(value, options));
      }

      return toStream(result, options);
    };
  }
}

/**
 * Converts a handler result into a stream. A `Response` (an error, a redirect)
 * and `undefined` (nothing to send) are passed through unchanged.
 *
 * @param {unknown} value - The handler result
 * @param {StreamOptions} options - Stream options
 * @returns {unknown} The stream, or the value passed through
 */
function toStream(value: unknown, options: StreamOptions): unknown {
  return value instanceof Response || value === undefined ? value : createStream(value as StreamSource, options);
}

/**
 * Streams what the handler returns instead of buffering it.
 *
 * The handler returns an `AsyncIterable` (typically an async generator), an
 * `Iterable`, a Node `Readable` or a `ReadableStream`. Each chunk is sent as
 * soon as the client is ready for it: bytes as they are, strings as UTF-8,
 * anything else as one line of JSON (NDJSON), or whatever `serialize` makes of
 * it. Returning from the generator ends the response, and a client that
 * disconnects closes the generator, so its `finally` blocks run.
 *
 * An error thrown before the first chunk becomes a regular error response. One
 * thrown later cannot change the status any more: the stream is cut off and
 * the error is logged, or given to `onError`.
 *
 * A handler that returns a `ReadableStream` needs no decorator, the framework
 * streams it as it is. `@Stream()` adds the content type and the iterables.
 *
 * @example
 * ```ts
 * @Get('/export')
 * @Stream({ type: 'application/x-ndjson' })
 * public async *export(): AsyncGenerator<Order> {
 *   for await (const order of this.orders.cursor()) {
 *     yield order;
 *   }
 * }
 * ```
 *
 * @param {StreamOptions} [options] - Content type, serializer and error callback.
 * @returns {Function} - The decorator function.
 */
export function Stream<T = unknown>(options: StreamOptions<T> = {}): Function {
  return createDecorator(StreamDecorator, options as StreamOptions);
}
