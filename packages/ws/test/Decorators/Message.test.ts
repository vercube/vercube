// oxlint-disable no-unused-vars
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Container, initializeContainer } from '@vercube/di';
import { createApp, type ConfigTypes, type App } from '@vercube/core';
import { Message } from '../../src/Decorators/Message';
import { Namespace } from '../../src/Decorators/Namespace';
import { WebsocketService } from '../../src/Services/WebsocketService';
import { $WebsocketService } from '../../src/Symbols/WebsocketSymbols';
import { z } from 'zod';
import { WebsocketTypes } from '../../src/Types/WebsocketTypes';

vi.mock('srvx', () => ({
  serve: vi.fn().mockReturnValue({
    ready: vi.fn().mockResolvedValue(undefined),
  }),
}));

const schema = z.object({ foo: z.string() });

@Namespace('/foo')
class TestService {
  @Message({ event: 'ping' })
  public handlePing(data: any, peer: any) {
    return { pong: true };
  }

  @Message({
    event: 'validate',
    validationSchema: schema,
  })
  public validateMsg(data: any, peer: any) {
    return { ok: true };
  }
}

describe('@Message() decorator', () => {
  let container: Container;
  let websocketService: WebsocketService;
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
    container.bind($WebsocketService, WebsocketService);

    websocketService = container.get($WebsocketService);

    initializeContainer(container);
  });

  it('should register both message handlers under the correct namespace and events', () => {
    const handlers = websocketService['fHandlers'][WebsocketTypes.HandlerAction.MESSAGE];

    expect(handlers['/foo']).toBeDefined();

    const pingHandler = handlers['/foo']['ping'];
    expect(pingHandler).toBeDefined();
    expect(typeof pingHandler.callback).toBe('function');
    expect(pingHandler.event).toBe('ping');
    expect(pingHandler.schema).toBeUndefined();

    const validateHandler = handlers['/foo']['validate'];
    expect(validateHandler).toBeDefined();
    expect(typeof validateHandler.callback).toBe('function');
    expect(validateHandler.event).toBe('validate');
    expect(validateHandler.schema).toBe(schema);
  });
});
