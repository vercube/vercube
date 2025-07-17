import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Container, initializeContainer } from '@vercube/di';
import {
  MetadataResolver,
  ServerPlugins,
  StandardSchemaValidationProvider,
  ValidationProvider,
  BadRequestError
} from '@vercube/core';
import { Message } from '../../src/Decorators/Message';
import { Emit } from '../../src/Decorators/Emit';
import { Namespace } from '../../src/Decorators/Namespace';
import { WebsocketService } from '../../src/Services/WebsocketService';
import { WebsocketServiceKey } from '../../src/Utils/WebsocketServiceKey';
import { z } from 'zod';

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

  beforeEach(() => {
    container = new Container();
    container.bind(MetadataResolver);
    container.bind(TestService);
    container.bind(ServerPlugins);
    container.bind(WebsocketServiceKey, WebsocketService);
    container.bind(ValidationProvider, StandardSchemaValidationProvider);

    initializeContainer(container);
    websocketService = container.get(WebsocketServiceKey);

    peer = {
      id: '123',
      namespace: '/foo',
      send: vi.fn()
    };
  });

  it('registers message handler on websocket service', () => {
    const handler = websocketService['eventHandlers']['/foo']['ping'];
    expect(handler).toBeDefined();
    expect(typeof handler.fn).toBe('function');
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
      data: {} // invalid: missing "foo"
    };

    const message = {
      text: () => JSON.stringify(msg)
    };

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await websocketService['handleMessage'](peer, message as any);

    // Even though we throw internally, we catch inside handleMessage and log it
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[WS] Failed to process message:'),
      expect.any(BadRequestError)
    );

    errorSpy.mockRestore();
  });
});