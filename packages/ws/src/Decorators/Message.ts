import { initializeMetadata, initializeMetadataMethod, ValidationTypes } from '@vercube/core';
import { BaseDecorator, createDecorator, InjectOptional } from '@vercube/di';
import { WebsocketTypes } from '../Types/WebsocketTypes';
import { $WebsocketService } from '../Symbols/WebsocketSymbols';
import { type WebsocketService } from '../Services/WebsocketService';

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

  @InjectOptional($WebsocketService)
  private gWebsocketService: WebsocketService;

  public override created(): void {
    if (!this.gWebsocketService) {
      console.warn('MessageDecorator::WebsocketService is not registered');
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

    this.gWebsocketService.registerHandler(
      WebsocketTypes.HandlerAction.MESSAGE,
      namespace,
      {
        callback: originalMethod,
        event: this.options.event,
        schema: this.options.validationSchema,
      }
    );
  }
}

/**
 * A decorator function for listening to websocket messages under a specific event.
 *
 * This function creates an instance of the MessageDecorator class and registers a handler for websocket messages under
 * the specified event and optional validation schema.
 *
 * @param {MessageDecoratorOptions} params - The options for the message handler, including event and optional validation schema.
 * @returns {Function} - The decorator function.
 */
export function Message(params: MessageDecoratorOptions): Function {
  return createDecorator(MessageDecorator, params);
}