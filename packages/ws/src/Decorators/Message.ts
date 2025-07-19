import { initializeMetadata, initializeMetadataMethod, ValidationTypes } from '@vercube/core';
import { BaseDecorator, createDecorator, InjectOptional } from '@vercube/di';
import { WebsocketService } from '../Services/WebsocketService';
import { WebsocketServiceKey } from '../Utils/WebsocketServiceKey';

interface MessageDecoratorOptions {
  event: string;
  validationSchema?: ValidationTypes.Schema;
}

/**
 * A decorator class for listening to websocket messages under
 * a specific event.
 * 
 * This class extends the BaseDecorator and is used to listen
 * to websocket messages under a specific event.
 *
 * @extends {BaseDecorator<MessageDecoratorOptions>}
 */
class MessageDecorator extends BaseDecorator<MessageDecoratorOptions> {

  @InjectOptional(WebsocketServiceKey)
  private gWebsocketService: WebsocketService;

  public override created(): void {
    if (!this.gWebsocketService) {
      console.warn('BroadcastDecorator::WebsocketService is not registered');
      return;
    }

    const meta = initializeMetadata(this.prototype);
    const method = initializeMetadataMethod(this.prototype, this.propertyName);

    const namespace = meta?.__meta?.namespace as string;
    if (!namespace) {
      console.warn('MessageDecorator::Unable to find namespace. Did you use @Namespace()?');
      return;
    }

    method.meta = {
      ...method.meta,
      event: this.options.event,
    }

    const originalMethod = this.instance[this.propertyName].bind(this.instance);

    this.gWebsocketService.registerMessageHandler(
      namespace,
      this.options.event,
      {
        schema: this.options.validationSchema,
        fn: originalMethod
      }
    );
  }
}

export function Message(params: MessageDecoratorOptions): Function {
  return createDecorator(MessageDecorator, params);
}