import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Container, initializeContainer } from '@vercube/di';
import { type App, type ConfigTypes, createApp } from '@vercube/core';
import { Namespace } from '../../src/Decorators/Namespace';
import { Message } from '../../src/Decorators/Message';
import { WebsocketService } from '../../src/Services/WebsocketService';
import { WebsocketServiceKey } from '../../src/Utils/WebsocketServiceKey';
import { Emit } from '../../src/Decorators/Emit';

vi.mock('srvx', () => ({
  serve: vi.fn().mockReturnValue({
    ready: vi.fn().mockResolvedValue(undefined),
  }),
}));

@Namespace('/bar')
class BroadcastTestService {
  @Message({ event: 'hello' })
  @Emit()
  public sayHello(data: any, peer: any) {
    return { greet: 'world' };
  }
}

describe('@Emit() decorator', () => {
  let container: Container;
  let websocketService: WebsocketService;
  let peer: any;
  let app: App;

  const config: ConfigTypes.Config = {
    logLevel: 'debug',
    server: {
      static: {
        dirs: ['./public'],
        maxAge: 3600,
        immutable: true,
        etag: true,
      },
    },
  };

  beforeEach(async () => {
    app = await createApp(config as any);
    container = app.container;
    container.bind(BroadcastTestService);
    container.bind(WebsocketServiceKey, WebsocketService);

    websocketService = container.get(WebsocketServiceKey);

    peer = {
      id: '123',
      namespace: '/foo',
      send: vi.fn()
    };

    initializeContainer(container);
  });
  it('broadcasts method return value to namespace', async () => {
    const spy = vi.spyOn(websocketService, 'emit');
    const peer = { send: vi.fn(), namespace: '/bar' } as any;
    const handler = websocketService['eventHandlers']['/bar']['hello'];

    const result = await handler.fn({}, peer);

    expect(result).toEqual({ greet: 'world' });
    expect(spy).toHaveBeenCalledWith(peer, { event: 'hello', data: { greet: 'world' } });
  });
});