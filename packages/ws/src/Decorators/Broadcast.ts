import { initializeMetadata, initializeMetadataMethod } from '@vercube/core';
import { BaseDecorator, createDecorator, InjectOptional } from '@vercube/di';
import { type Peer } from 'crossws';
import { WebsocketService } from '../Services/WebsocketService';
import { WebsocketServiceKey } from '../Utils/WebsocketServiceKey';

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

  @InjectOptional(WebsocketServiceKey)
  private gWebsocketService: WebsocketService;

  public override created(): void {
    if (!this.gWebsocketService) {
      console.warn('BroadcastDecorator::WebsocketService is not registered');
      return;
    }

    initializeMetadata(this.prototype);
    initializeMetadataMethod(this.prototype, this.propertyName);

    const originalMethod = this.instance[this.propertyName];

    this.instance[this.propertyName] = async (incomingMessage: Record<string, unknown>, peer: Peer) => {
      const result = await originalMethod.call(this.instance, incomingMessage, peer);

      this.gWebsocketService.broadcast(
        peer,
        {
          event: this.options.event,
          data: result
        }
      );

      return result;
    }
  }

}

export function Broadcast(event: string): Function {
  return createDecorator(BroadcastDecorator, { event });
}