import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Container, initializeContainer } from '@vercube/di';
import { BadRequestError, createApp, type ConfigTypes, type App } from '@vercube/core';
import { Message } from '../../src/Decorators/Message';
import { Emit } from '../../src/Decorators/Emit';
import { Namespace } from '../../src/Decorators/Namespace';
import { WebsocketService } from '../../src/Services/WebsocketService';
import { WebsocketServiceKey } from '../../src/Utils/WebsocketServiceKey';
import { z } from 'zod';
import { WebsocketTypes } from '../../src/Types/WebsocketTypes';

vi.mock('srvx', () => ({
  serve: vi.fn().mockReturnValue({
    ready: vi.fn().mockResolvedValue(undefined),
  }),
}));

@Namespace('/foo')
class TestService {
  @Message({ event: 'ping' })
  @Emit()
  public handlePing(data: any, peer: any) {
    return { pong: true };
  }

  @Message({
    event: 'validate',
    validationSchema: z.object({ foo: z.string() }),
  })
  @Emit()
  public validateMsg(data: any, peer: any) {
    return { ok: true };
  }
}

describe('@Message() decorator', () => {
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
    container.bind(TestService);
    container.bind(WebsocketServiceKey, WebsocketService);

    websocketService = container.get(WebsocketServiceKey);

    peer = {
      id: '123',
      namespace: '/foo',
      send: vi.fn()
    };

    initializeContainer(container);
  });

  it('registers message handler on websocket service', () => {
    const handler = websocketService['handlers'][WebsocketTypes.HandlerAction.MESSAGE]['/foo']['ping'];
    expect(handler).toBeDefined();
    expect(typeof handler.callback).toBe('function');
  });

  it('validates incoming message if schema is provided', async () => {
    const msg = {
      event: 'validate',
      data: { foo: 'bar' }
    };

    const message = {
      text: () => JSON.stringify(msg)
    };

    await websocketService['handleMessage'](peer, message as any);

    expect(peer.send).toHaveBeenCalledWith({ event: 'validate', data: { ok: true } });
  });

  it('throws BadRequestError on validation failure', async () => {
    const msg = {
      event: 'validate',
      data: {}
    };

    const message = {
      text: () => JSON.stringify(msg)
    };

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await websocketService['handleMessage'](peer, message as any);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[WS] Failed to process message:'),
      expect.any(BadRequestError)
    );

    errorSpy.mockRestore();
  });
});