import { initializeMetadata, initializeMetadataMethod } from '@vercube/core';
import { BaseDecorator, createDecorator, InjectOptional } from '@vercube/di';
import { type Peer } from 'crossws';
import { WebsocketService } from '../Services/WebsocketService';
import { WebsocketServiceKey } from '../Utils/WebsocketServiceKey';

/**
 * A decorator class for broadcasting websocket messages to everyone 
 * on the namespace (except the peer).
 * 
 * This class extends the BaseDecorator and is used to emit the result of
 * your function as a websocket message to everyone on the namespace
 * (except the peer).
 * Needs to be used along with the @Message() decorator.
 *
 * @extends {BaseDecorator}
 */
class BroadcastOthersDecorator extends BaseDecorator {

  @InjectOptional(WebsocketServiceKey)
  private gWebsocketService: WebsocketService;

  public override created(): void {
    if (!this.gWebsocketService) {
      console.warn('BroadcastOthersDecorator::WebsocketService is not registered');
      return;
    }

    initializeMetadata(this.prototype);
    const method = initializeMetadataMethod(this.prototype, this.propertyName);

    const originalMethod = this.instance[this.propertyName];

    this.instance[this.propertyName] = async (incomingMessage: Record<string, unknown>, peer: Peer) => {
      const result = await originalMethod.call(this.instance, incomingMessage, peer);
      const event = method?.metadata?.event as string;

      if (!event) {
        console.warn('BroadcastOthersDecorator::@Message() event not found for @BroadcastOthers()');
        return;
      }

      this.gWebsocketService.broadcastOthers(peer, { event, data: result });

      return result;
    }
  }

}

export function BroadcastOthers(): Function {
  return createDecorator(BroadcastOthersDecorator, undefined);
}