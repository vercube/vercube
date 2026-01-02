import { Controller } from '@vercube/core';
import { Inject } from '@vercube/di';
import { $WebsocketService, Emit, Message, Namespace } from '@vercube/ws';
import type { WebsocketService, WSPeer } from '@vercube/ws';

/**
 * Foo controller.
 * This is a sample controller that demonstrates how to create a controller using the @vercube/core package.
 */
@Namespace('/foo')
@Controller('/api/foo')
export default class FooController {
  @Inject($WebsocketService)
  private gWebsocketService: WebsocketService;

  @Message({ event: 'message' })
  @Emit('message')
  public async onMessage(incomingMessage: unknown, peer: WSPeer): Promise<Record<string, string>> {
    // broadcast the message to all peers in the namespace
    this.gWebsocketService.broadcast(peer, {
      event: 'message',
      data: { foo: 'bar' },
    });

    return { foo: 'bar' };
  }

  @Message({ event: 'foo' })
  @Emit('testing')
  public async onAction(message: unknown): Promise<Record<string, unknown>> {
    return { foo: 'bar', message };
  }
}
