import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Container, initializeContainer } from '@vercube/di';
import { BadRequestError, MetadataResolver, StandardSchemaValidationProvider, ValidationProvider } from '@vercube/core';
import { Message } from '../../src/Decorators/Message';
import { Broadcast } from '../../src/Decorators/Broadcast';
import { BroadcastOthers } from '../../src/Decorators/BroadcastOthers';
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

  @Message({ event: 'broadcast' })
  @Broadcast()
  public handleBroadcast(data: any, peer: any, broadcast: any) {
    return { everyone: true };
  }

  @Message({ event: 'broadcastOthers' })
  @BroadcastOthers()
  public handleOthers(data: any, peer: any, broadcast_others: any) {
    return { notMe: true };
  }

  @Message({
    event: 'validate',
    validationSchema: z.object({ foo: z.string() }),
  })
  @Emit()
  public validateMsg(data: any, peer: any) {
    return { ok: true };
  }

  @Message({ event: 'emit' })
  @Emit()
  public handleEmit(data: any, peer: any, emit: any) {
    return { echo: data };
  }
}

describe('@Message() decorator', () => {
  let container: Container;
  let websocketService: WebsocketService;

  beforeEach(() => {
    container = new Container();
    container.bind(MetadataResolver);
    container.bind(TestService);
    container.bind(WebsocketServiceKey, WebsocketService);
    container.bind(ValidationProvider, StandardSchemaValidationProvider);


    initializeContainer(container);
    websocketService = container.get(WebsocketServiceKey);
  });

  it('registers message handler on websocket service', () => {
    const handler = websocketService['eventHandlers']['/foo']['ping'];
    expect(typeof handler).toBe('function');
  });

  it('emits result to sender if method returns value', async () => {
    const peer = { send: vi.fn(), namespace: '/' } as any;
    const handler = websocketService['eventHandlers']['/foo']['ping'];

    await handler(peer, {});

    expect(peer.send).toHaveBeenCalledWith({ event: 'ping', data: { pong: true } });
  });

  it('validates incoming message if schema is provided', async () => {
    const peer = { send: vi.fn(), namespace: '/' } as any;
    const handler = websocketService['eventHandlers']['/foo']['validate'];

    await handler(peer, { foo: 'bar' });
    expect(peer.send).toHaveBeenCalledWith({ event: 'validate', data: { ok: true } });
  });

  it('throws BadRequestError on validation failure', async () => {
    const peer = { send: vi.fn(), namespace: '/' } as any;
    const handler = websocketService['eventHandlers']['/foo']['validate'];

    await expect(() => handler(peer, {})).rejects.toThrow(BadRequestError);
  });

  it('broadcasts to all when broadcast arg is used', async () => {
    const spy = vi.spyOn(websocketService, 'broadcast');
    const peer = { send: vi.fn(), namespace: '/' } as any;
    const handler = websocketService['eventHandlers']['/foo']['broadcast'];

    await handler(peer, {});
    expect(spy).toHaveBeenCalledWith(peer, { everyone: true });
  });

  it('broadcasts to others when broadcast_others arg is used', async () => {
    const spy = vi.spyOn(websocketService, 'broadcastOthers');
    const peer = { send: vi.fn(), namespace: '/' } as any;
    const handler = websocketService['eventHandlers']['/foo']['broadcastOthers'];

    await handler(peer, {});
    expect(spy).toHaveBeenCalledWith(peer, { notMe: true });
  });

  it('emits back if emit arg is present and not broadcast', async () => {
    const peer = { send: vi.fn(), namespace: '/' } as any;
    const handler = websocketService['eventHandlers']['/foo']['emit'];

    await handler(peer, { hello: 'world' });
    expect(peer.send).toHaveBeenCalledWith({ event: 'emit', data: { echo: { hello: 'world' } } });
  });
});