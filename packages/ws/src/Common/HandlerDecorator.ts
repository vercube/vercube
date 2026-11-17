import { initializeMetadata, initializeMetadataMethod } from '@vercube/core';
import { BaseDecorator, InjectOptional } from '@vercube/di';
import { type WebsocketService } from '../Services/WebsocketService';
import { $WebsocketService } from '../Symbols/WebsocketSymbols';
import { setHandlerAction } from '../Utils/HandlerArgs';
import type { WebsocketTypes } from '../Types/WebsocketTypes';

/**
 * Options of a {@link HandlerDecorator}.
 */
export interface HandlerDecoratorOptions {
  /** What the method handles. */
  action: WebsocketTypes.HandlerAction;
  /** Name of the decorator, for warnings. */
  name: string;
}

/**
 * A decorator class registering a method as the handler of a namespace for
 * one action (`@OnOpen()`, `@OnClose()`, `@OnError()`, `@OnBinary()`).
 *
 * The method is looked up when the action happens rather than now, so
 * decorators that wrap it still apply when written above this one.
 *
 * @extends {BaseDecorator<HandlerDecoratorOptions>}
 */
export class HandlerDecorator extends BaseDecorator<HandlerDecoratorOptions> {
  @InjectOptional($WebsocketService)
  private gWebsocketService!: WebsocketService;

  public override created(): void {
    if (!this.gWebsocketService) {
      console.warn(`${this.options.name}::WebsocketService is not registered`);
      return;
    }

    const meta = initializeMetadata(this.prototype);
    initializeMetadataMethod(this.prototype, this.propertyName);

    const namespace = meta?.__meta?.namespace as string;
    if (!namespace) {
      console.warn(`${this.options.name}::Unable to find namespace. Did you use @Namespace()?`);
      return;
    }

    setHandlerAction(this.prototype, this.propertyName, this.options.action);

    const instance = this.instance;
    const propertyName = this.propertyName;

    this.gWebsocketService.registerHandler(this.options.action, namespace, {
      callback: (...args: unknown[]) => instance[propertyName](...args),
    });
  }
}
