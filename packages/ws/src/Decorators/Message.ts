import { BadRequestError, initializeMetadata, initializeMetadataMethod, MetadataResolver, ValidationProvider, ValidationTypes } from '@vercube/core';
import { BaseDecorator, createDecorator, Inject, InjectOptional } from '@vercube/di';
import { WebsocketService } from '../Services/WebsocketService';
import { WebsocketServiceKey } from '../Utils/WebsocketServiceKey';

interface MessageDecoratorOptions {
  event: string;
  validationSchema?: ValidationTypes.Schema;
}

class MessageDecorator extends BaseDecorator<MessageDecoratorOptions> {

  @Inject(MetadataResolver)
  private gMetadataResolver!: MetadataResolver;

  @Inject(WebsocketServiceKey)
  private gWebsocketService!: WebsocketService;

  @InjectOptional(ValidationProvider)
  private gValidationProvider: ValidationProvider | null;

  public override created(): void {
    initializeMetadata(this.prototype);
    const method = initializeMetadataMethod(this.prototype, this.propertyName);

    const namespace = this.gMetadataResolver.resolveNamespace({
      instance: this.instance
    });

    const shouldBroadcast = method.args.find(e => e.type === 'broadcast');
    const shouldBroadcastOthers = method.args.find(e => e.type === 'broadcast_others');
    const shouldEmit = method.args.find(e => e.type === 'emit') && !shouldBroadcast;

    this.gWebsocketService.registerMessageHandler(
      namespace,
      this.options.event,
      async (peer, data) => {
        if (this.options.validationSchema) {
          if (!this.gValidationProvider) {
            console.warn('ValidationMiddleware::ValidationProvider is not registered');
            return;
          }

          const result = await this.gValidationProvider.validate(this.options.validationSchema!, data);

          if (result.issues?.length) {
            throw new BadRequestError(`Websocket message validation error`, result.issues);
          }
        }

        const method = this.instance[this.propertyName];
        const result = await method.call(this.instance, data, peer);

        if (result !== undefined) {
          if (shouldEmit) {
            peer.send({
              event: this.options.event,
              data: result
            });
          }

          if (shouldBroadcast) {
            this.gWebsocketService.broadcast(peer, result);
          }

          if (shouldBroadcastOthers) {
            this.gWebsocketService.broadcastOthers(peer, result);
          }
        }
      }
    );
  }

}

export function Message(params: MessageDecoratorOptions): Function {
  return createDecorator(MessageDecorator, params);
}