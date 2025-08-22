import { describe, it, beforeEach, expect, vi } from 'vitest';
import { Container, initializeContainer } from '@vercube/di';
import { createApp, type App, type ConfigTypes } from '@vercube/core';
import { WebsocketService } from '../../src/Services/WebsocketService';
import { $WebsocketService } from '../../src/Symbols/WebsocketSymbols';
import { WebsocketTypes } from '../../src/Types/WebsocketTypes';
import { Namespace } from '../../src/Decorators/Namespace';
import { OnConnectionAttempt } from '../../src/Decorators/OnConnectionAttempt';

vi.mock('srvx', () => ({
  serve: vi.fn().mockReturnValue({
    ready: vi.fn().mockResolvedValue(undefined),
  }),
}));

@Namespace('/auth')
class TestConnectionService {
  @OnConnectionAttempt()
  public async handleConnect(peer: any) {
    if (!peer.token) return false;
    return true;
  }
}

describe('@OnConnectionAttempt() decorator', () => {
  let app: App;
  let container: Container;
  let websocketService: WebsocketService;

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

    container.bind(TestConnectionService);
    container.bind($WebsocketService, WebsocketService);

    websocketService = container.get($WebsocketService);

    initializeContainer(container);
  });

  it('registers connection handler on WebsocketService', async () => {
    const handler = websocketService['fHandlers'][WebsocketTypes.HandlerAction.CONNECTION]['/auth'];

    expect(handler).toBeDefined();
    expect(typeof handler.callback).toBe('function');

    // Simulate an allowed connection
    const peer = { token: '123' };
    const result = await handler.callback(peer);
    expect(result).toBe(true);

    // Simulate a denied connection
    const badPeer = {};
    const denied = await handler.callback(badPeer);
    expect(denied).toBe(false);
  });
});
