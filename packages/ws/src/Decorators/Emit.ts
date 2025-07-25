import { initializeMetadata, initializeMetadataMethod } from '@vercube/core';
import { BaseDecorator, createDecorator, InjectOptional } from '@vercube/di';
import { $WebsocketService } from '../Symbols/WebsocketSymbols';
import { type Peer } from 'crossws';
import { type WebsocketService } from '../Services/WebsocketService';

interface EmitDecoratorOptions {
  event: string;
}

/**
 * A decorator class for emitting websocket messages to the peer.
 *
 * This class extends the BaseDecorator and is used to emit the result of
 * your function as a websocket message to the peer.
 *
 * @extends {BaseDecorator<EmitDecoratorOptions>}
 */
class EmitDecorator extends BaseDecorator<EmitDecoratorOptions> {

  @InjectOptional($WebsocketService)
  private gWebsocketService: WebsocketService;

  public override created(): void {
    if (!this.gWebsocketService) {
      console.warn('EmitDecorator::WebsocketService is not registered');
      return;
    }

    initializeMetadata(this.prototype);
    initializeMetadataMethod(this.prototype, this.propertyName);

    const originalMethod = this.instance[this.propertyName];

    this.instance[this.propertyName] = async (incomingMessage: Record<string, unknown>, peer: Peer) => {
      const result = await originalMethod.call(this.instance, incomingMessage, peer);

      this.gWebsocketService.emit(
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

/**
 * A decorator function for emitting websocket messages to the peer.
 *
 * This function creates an instance of the EmitDecorator class and emits the result of the decorated method as a
 * websocket message to the peer under the specified event.
 *
 * @param {string} event - The event name for the emitted websocket message.
 * @returns {Function} - The decorator function.
 */
export function Emit(event: string): Function {
  return createDecorator(EmitDecorator, { event });
}