import { initializeMetadata, initializeMetadataMethod } from '@vercube/core';
import { BaseDecorator, createDecorator, InjectOptional } from '@vercube/di';
import { $WebsocketService } from '../Symbols/WebsocketSymbols';
import { WebsocketTypes } from '../Types/WebsocketTypes';
import { type WebsocketService } from '../Services/WebsocketService';

/**
 * A decorator class for handling websocket connection attempts.
 *
 * This class extends the BaseDecorator and is used to handle a
 * websocket connection attempt to a namespace.
 *
 * If your function throws, or returns false, the connection
 * will not be accepted.
 *
 * The decorated function will receive the following parameters:
 *
 * @param {Record<string, unknown>} params - The connection query parameters.
 * @param {Request} request - The original HTTP request.
 *
 * @extends {BaseDecorator}
 */
class OnConnectionAttemptDecorator extends BaseDecorator {
  @InjectOptional($WebsocketService)
  private gWebsocketService: WebsocketService;

  public override created(): void {
    if (!this.gWebsocketService) {
      console.warn('OnConnectionAttemptDecorator::WebsocketService is not registered');
      return;
    }

    const meta = initializeMetadata(this.prototype);
    initializeMetadataMethod(this.prototype, this.propertyName);

    const namespace = meta?.__meta?.namespace as string;
    if (!namespace) {
      console.warn('OnConnectionAttemptDecorator::Unable to find namespace. Did you use @Namespace()?');
      return;
    }

    const originalMethod = this.instance[this.propertyName].bind(this.instance);

    this.gWebsocketService.registerHandler(WebsocketTypes.HandlerAction.CONNECTION, namespace, {
      callback: originalMethod,
    });
  }
}

/**
 * A decorator function for handling websocket connection attempts to a namespace.
 *
 * This function creates an instance of the OnConnectionAttemptDecorator class and registers a handler for websocket
 * connection attempts under the namespace. If the decorated function throws or returns false, the connection will not
 * be accepted.
 *
 * The decorated function will receive the following parameters:
 *   - params: {Record<string, unknown>} The connection query parameters.
 *   - request: {Request} The original HTTP request.
 *
 * @returns {Function} - The decorator function.
 */
export function OnConnectionAttempt(): Function {
  return createDecorator(OnConnectionAttemptDecorator, undefined);
}
