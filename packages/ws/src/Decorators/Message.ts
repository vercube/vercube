import { initializeMetadata, initializeMetadataMethod, MetadataResolver } from '@vercube/core';
import { BaseDecorator, Container, createDecorator, Inject } from '@vercube/di';
import { WebsocketService } from 'packages/ws/src/Services/WebsocketService';

interface MessageDecoratorOptions {
  event: string;
}

class MessageDecorator extends BaseDecorator<MessageDecoratorOptions> {

  @Inject(MetadataResolver)
  private gMetadataResolver!: MetadataResolver;

  @Inject(Container)
  private gContainer!: Container;

  public override created(): void {
    initializeMetadata(this.prototype);
    initializeMetadataMethod(this.prototype, this.propertyName);

    const namespace = this.gMetadataResolver.resolveNamespace({
      instance: this.instance
    });

    const websocketService = this.gContainer.get<WebsocketService>(Symbol.for('WebsocketService'));

    websocketService.registerMessageHandler(
      namespace,
      this.options.event,
      async (peer, data) => {
        const method = this.instance[this.propertyName];
        await method.call(this.instance, data, peer);
      }
    );
  }

}

export function Message(event: string): Function {
  return createDecorator(MessageDecorator, { event });
}