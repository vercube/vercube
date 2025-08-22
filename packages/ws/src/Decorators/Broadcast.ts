import { initializeMetadata, initializeMetadataMethod } from '@vercube/core';
import { BaseDecorator, createDecorator, InjectOptional } from '@vercube/di';
import { $WebsocketService } from '../Symbols/WebsocketSymbols';
import { type Peer } from 'crossws';
import { type WebsocketService } from '../Services/WebsocketService';

interface BroadcastDecoratorOptions {
  event: string;
}

/**
 * A decorator class for broadcasting websocket messages to everyone
 * on the namespace (including the peer).
 *
 * This class extends the BaseDecorator and is used to emit the result of
 * your function as a websocket message to everyone on the namespace.
 *
 * @extends {BaseDecorator<BroadcastDecoratorOptions>}
 */
class BroadcastDecorator extends BaseDecorator<BroadcastDecoratorOptions> {
  @InjectOptional($WebsocketService)
  private gWebsocketService: WebsocketService;

  public override created(): void {
    if (!this.gWebsocketService) {
      console.warn('BroadcastDecorator::WebsocketService is not registered');
      return;
    }

    initializeMetadata(this.prototype);
    initializeMetadataMethod(this.prototype, this.propertyName);

    const originalMethod = this.instance[this.propertyName];

    this.instance[this.propertyName] = async (
      incomingMessage: Record<string, unknown>,
      peer: Peer,
    ) => {
      const result = await originalMethod.call(
        this.instance,
        incomingMessage,
        peer,
      );

      this.gWebsocketService.broadcast(peer, {
        event: this.options.event,
        data: result,
      });

      return result;
    };
  }
}

/**
 * A decorator function for broadcasting websocket messages to everyone on the namespace (including the peer).
 *
 * This function creates an instance of the BroadcastDecorator class and emits the result of the decorated method as a
 * websocket message to everyone on the namespace under the specified event.
 *
 * @param {string} event - The event name for the broadcasted websocket message.
 * @returns {Function} - The decorator function.
 */
export function Broadcast(event: string): Function {
  return createDecorator(BroadcastDecorator, { event });
}
