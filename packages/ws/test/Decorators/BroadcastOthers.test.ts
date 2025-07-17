import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Container, initializeContainer } from '@vercube/di';
import { MetadataResolver, ServerPlugins, StandardSchemaValidationProvider, ValidationProvider } from '@vercube/core';
import { Namespace } from '../../src/Decorators/Namespace';
import { Message } from '../../src/Decorators/Message';
import { WebsocketService } from '../../src/Services/WebsocketService';
import { WebsocketServiceKey } from '../../src/Utils/WebsocketServiceKey';
import { BroadcastOthers } from '../../src/Decorators/BroadcastOthers';

@Namespace('/bar')
class BroadcastTestService {
  @Message({ event: 'hello' })
  @BroadcastOthers()
  public sayHello(data: any, peer: any) {
    return { greet: 'world' };
  }
}

describe('@BroadcastOthers() decorator', () => {
  let container: Container;
  let websocketService: WebsocketService;

  beforeEach(() => {
    container = new Container();
    container.bind(MetadataResolver);
    container.bind(ServerPlugins);
    container.bind(BroadcastTestService);
    container.bind(WebsocketServiceKey, WebsocketService);
    container.bind(ValidationProvider, StandardSchemaValidationProvider);

    initializeContainer(container);
    websocketService = container.get(WebsocketServiceKey);
  });

  it('broadcasts method return value to namespace', async () => {
    const spy = vi.spyOn(websocketService, 'broadcastOthers');
    const peer = { send: vi.fn(), namespace: '/bar' } as any;
    const handler = websocketService['eventHandlers']['/bar']['hello'];

    const result = await handler.fn({}, peer);

    expect(result).toEqual({ greet: 'world' });
    expect(spy).toHaveBeenCalledWith(peer, { event: 'hello', data: { greet: 'world' } });
  });
});