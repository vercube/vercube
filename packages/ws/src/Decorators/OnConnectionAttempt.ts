import { initializeMetadata, initializeMetadataMethod } from '@vercube/core';
import { BaseDecorator, createDecorator, InjectOptional } from '@vercube/di';
import { WebsocketService } from '../Services/WebsocketService';
import { WebsocketServiceKey } from '../Utils/WebsocketServiceKey';
import { WebsocketTypes } from '../Types/WebsocketTypes';

/**
 * A decorator class for handling websocket connection attemps.
 *
 * This class extends the BaseDecorator and is used to handle a
 * websocket connection attempt to a namespace.
 * 
 * If your function throws, or returns false, the connection
 * will not be accepted.
 * 
 * Adds connection parameters to the function.
 *
 * @extends {BaseDecorator}
 */
class OnConnectionAttemptDecorator extends BaseDecorator {

  @InjectOptional(WebsocketServiceKey)
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

    this.gWebsocketService.registerHandler(
      WebsocketTypes.HandlerAction.CONNECTION,
      namespace,
      {
        callback: originalMethod,
      }
    );
  }
}

export function OnConnectionAttempt(): Function {
  return createDecorator(OnConnectionAttemptDecorator, undefined);
}