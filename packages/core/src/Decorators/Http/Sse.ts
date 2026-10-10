import { BaseDecorator, createDecorator, Inject, InjectOptional } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { MetadataResolver } from '../../Services/Metadata/MetadataResolver';
import { RequestHandler } from '../../Services/Router/RequestHandler';
import { Router } from '../../Services/Router/Router';
import { createSseResponse } from '../../Utils/Sse';
import { initializeMetadata, initializeMetadataMethod } from '../../Utils/Utils';
import type { SseOptions, SseSource } from '../../Utils/Sse';

interface SseDecoratorOptions extends SseOptions {
  path: string;
}

/**
 * A decorator class for Server-Sent Events endpoints.
 *
 * Registers a GET route and wraps the handler so that the iterable it returns
 * is streamed to the client as `text/event-stream`.
 *
 * @extends {BaseDecorator<SseDecoratorOptions>}
 */
class SseDecorator extends BaseDecorator<SseDecoratorOptions> {
  @Inject(Router)
  private gRouter!: Router;

  @Inject(RequestHandler)
  private gRequestHandler!: RequestHandler;

  @Inject(MetadataResolver)
  private gMetadataResolver!: MetadataResolver;

  @InjectOptional(Logger)
  private gLogger?: Logger;

  /**
   * Called when the decorator is created.
   *
   * Wraps the handler on the controller instance and registers the GET route.
   */
  public override created(): void {
    initializeMetadata(this.prototype);
    const method = initializeMetadataMethod(this.prototype, this.propertyName);
    method.method = 'GET';

    const original = (this.prototype as Record<string, Function>)[this.propertyName];
    const name = `${this.instance?.constructor?.name}::${this.propertyName}`;
    const options: SseOptions = {
      heartbeat: this.options.heartbeat,
      onError: (error) => this.gLogger?.error(`${name}: SSE stream failed`, error),
    };

    // The wrapper lives on the instance, so the prototype method stays untouched
    // and the route handler picks the wrapper up through `instance[propertyName]`.
    this.instance[this.propertyName] = function sseHandler(this: unknown, ...args: unknown[]): unknown {
      const result = original.apply(this, args);

      if (result instanceof Promise) {
        return result.then((value: unknown) => toSseResponse(value, options));
      }

      return toSseResponse(result, options);
    };

    const path = this.gMetadataResolver.resolveUrl({
      instance: this.instance,
      path: this.options.path,
      propertyName: this.propertyName,
    });

    this.gRouter.addRoute({
      path,
      method: 'GET',
      handler: this.gRequestHandler.prepareHandler({
        instance: this.instance,
        propertyName: this.propertyName,
      }),
    });
  }
}

/**
 * Converts a handler result into an SSE response. A `Response` returned by the
 * handler (e.g. an error) is passed through unchanged.
 *
 * @param {unknown} value - The handler result
 * @param {SseOptions} options - Stream options
 * @returns {Response | Promise<Response>} The response
 */
function toSseResponse(value: unknown, options: SseOptions): Response | Promise<Response> {
  return value instanceof Response ? value : createSseResponse(value as SseSource, options);
}

/**
 * A decorator for Server-Sent Events endpoints.
 *
 * The decorated method returns an `AsyncIterable` (typically an async generator)
 * or `Iterable` of messages. Each yielded value is sent as one event; returning
 * from the generator closes the stream, and a client disconnect calls the
 * generator's `return()`, so `finally` blocks can release resources.
 *
 * Errors thrown before the first event become a regular error response; errors
 * thrown later close the stream and are logged.
 *
 * @example
 * ```ts
 * @Sse('/ticks', { heartbeat: 15_000 })
 * public async *ticks(): AsyncGenerator<SseMessage> {
 *   for (let i = 0; i < 10; i++) {
 *     yield { event: 'tick', id: i, data: { i } };
 *     await new Promise((resolve) => setTimeout(resolve, 1000));
 *   }
 * }
 * ```
 *
 * @param {string} path - The path for the SSE route.
 * @param {SseOptions} [options] - Stream options.
 * @returns {Function} - The decorator function.
 */
export function Sse(path: string, options: SseOptions = {}): Function {
  return createDecorator(SseDecorator, { path, ...options });
}
