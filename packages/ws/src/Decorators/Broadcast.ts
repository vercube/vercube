import { initializeMetadata, initializeMetadataMethod } from '@vercube/core';
import { BaseDecorator, createDecorator, InjectOptional } from '@vercube/di';
import { type Peer } from 'crossws';
import { WebsocketService } from '../Services/WebsocketService';
import { WebsocketServiceKey } from '../Utils/WebsocketServiceKey';

/**
 * A decorator class for broadcasting websocket messages to everyone 
 * on the namespace (including the peer).
 * 
 * This class extends the BaseDecorator and is used to emit the result of
 * your function as a websocket message to everyone on the namespace.
 * Needs to be used along with the @Message() decorator.
 *
 * @extends {BaseDecorator}
 */
class BroadcastDecorator extends BaseDecorator {

  @InjectOptional(WebsocketServiceKey)
  private gWebsocketService: WebsocketService;

  public override created(): void {
    if (!this.gWebsocketService) {
      console.warn('BroadcastDecorator::WebsocketService is not registered');
      return;
    }

    initializeMetadata(this.prototype);
    const method = initializeMetadataMethod(this.prototype, this.propertyName);

    const originalMethod = this.instance[this.propertyName];

    this.instance[this.propertyName] = async (incomingMessage: Record<string, unknown>, peer: Peer) => {
      const result = await originalMethod.call(this.instance, incomingMessage, peer);
      const event = method?.meta?.event as string;

      if (!event) {
        console.warn('BroadcastDecorator::@Message() event not found for @Broadcast()');
        return;
      }

      this.gWebsocketService.broadcast(peer, { event, data: result });

      return result;
    }
  }

}

export function Broadcast(): Function {
  return createDecorator(BroadcastDecorator, undefined);
}