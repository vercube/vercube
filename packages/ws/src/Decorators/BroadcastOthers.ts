import { initializeMetadata, initializeMetadataMethod } from '@vercube/core';
import { BaseDecorator, createDecorator, InjectOptional } from '@vercube/di';
import { $WebsocketService } from '../Symbols/WebsocketSymbols';
import { type Peer } from 'crossws';
import { type WebsocketService } from '../Services/WebsocketService';

interface BroadcastOthersDecoratorOptions {
  event: string;
}

/**
 * A decorator class for broadcasting websocket messages to everyone
 * on the namespace (except the peer).
 *
 * This class extends the BaseDecorator and is used to emit the result of
 * your function as a websocket message to everyone on the namespace
 * (except the peer).
 *
 * @extends {BaseDecorator<BroadcastOthersDecoratorOptions>}
 */
class BroadcastOthersDecorator extends BaseDecorator<BroadcastOthersDecoratorOptions> {
  @InjectOptional($WebsocketService)
  private gWebsocketService: WebsocketService;

  public override created(): void {
    if (!this.gWebsocketService) {
      console.warn(
        'BroadcastOthersDecorator::WebsocketService is not registered',
      );
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

      this.gWebsocketService.broadcastOthers(peer, {
        event: this.options.event,
        data: result,
      });

      return result;
    };
  }
}

/**
 * A decorator function for broadcasting websocket messages to everyone on the namespace (except the peer).
 *
 * This function creates an instance of the BroadcastOthersDecorator class and emits the result of the decorated method
 * as a websocket message to everyone on the namespace (except the peer) under the specified event.
 *
 * @param {string} event - The event name for the broadcasted websocket message.
 * @returns {Function} - The decorator function.
 */
export function BroadcastOthers(event: string): Function {
  return createDecorator(BroadcastOthersDecorator, { event });
}
