import { EventEmitter } from 'node:events';
import { createApp, HttpServer } from '@vercube/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { $WebsocketService, WebsocketService } from '../../src';
import { decodeAdapterMessage, encodeAdapterMessage, RedisWebsocketAdapter } from '../../src/Adapters/RedisAdapter';
import type { WebsocketTypes, WSPeer } from '../../src';
import type { App } from '@vercube/core';
import type { Redis } from 'ioredis';

describe('Redis adapter envelope', () => {
  it('round-trips text and binary payloads', () => {
    const text = { room: 'board:1', instanceId: 'i-1', data: 'héllo' };
    const binary = { room: 'board:1', instanceId: 'i-2', data: new Uint8Array([0, 1, 255]) };

    expect(decodeAdapterMessage('board:1', encodeAdapterMessage(text))).toEqual(text);
    expect(decodeAdapterMessage('board:1', encodeAdapterMessage(binary))).toEqual(binary);
  });

  it('ignores payloads it did not write', () => {
    expect(decodeAdapterMessage('r', Buffer.from([1]))).toBeNull();
    expect(decodeAdapterMessage('r', Buffer.from([9, 0, 0]))).toBeNull();
    expect(decodeAdapterMessage('r', Buffer.from([0, 0, 50, 1]))).toBeNull();
    expect(decodeAdapterMessage('r', Buffer.concat([Buffer.from([0, 0, 3]), Buffer.from('{x}')]))).toBeNull();
    expect(decodeAdapterMessage('r', Buffer.concat([Buffer.from([0, 0, 2]), Buffer.from('{}')]))).toBeNull();
  });
});

describe('RedisWebsocketAdapter with a given client', () => {
  /** A client recording what the adapter asks of it. */
  const fakeClient = () => {
    // ioredis clients are Node EventEmitters
    // oxlint-disable-next-line unicorn/prefer-event-target
    const subscriber = Object.assign(new EventEmitter(), {
      subscribe: vi.fn().mockResolvedValue(1),
      unsubscribe: vi.fn().mockResolvedValue(0),
      quit: vi.fn().mockResolvedValue('OK'),
      disconnect: vi.fn(),
    });
    const client = { duplicate: vi.fn(() => subscriber), publish: vi.fn().mockResolvedValue(1), quit: vi.fn() };
    return { client, subscriber };
  };

  it('subscribes per room on a duplicate and never closes the given client', async () => {
    const { client, subscriber } = fakeClient();
    const adapter = new RedisWebsocketAdapter({ client: client as unknown as Redis, prefix: 'app' });
    const received: WebsocketTypes.AdapterMessage[] = [];

    adapter.init('me', (message) => received.push(message));
    await adapter.subscribe('board:1');
    await adapter.publish({ room: 'board:1', instanceId: 'me', data: 'x' });

    expect(subscriber.subscribe).toHaveBeenCalledWith('app:room:board:1');
    expect(client.publish).toHaveBeenCalledWith('app:room:board:1', expect.any(Buffer));

    subscriber.emit(
      'messageBuffer',
      Buffer.from('app:room:board:1'),
      encodeAdapterMessage({ room: '', instanceId: 'other', data: 'y' }),
    );
    subscriber.emit('messageBuffer', Buffer.from('elsewhere'), encodeAdapterMessage({ room: '', instanceId: 'o', data: 'z' }));
    subscriber.emit('messageBuffer', Buffer.from('app:room:board:1'), Buffer.from('garbage'));
    expect(received).toEqual([{ room: 'board:1', instanceId: 'other', data: 'y' }]);

    await adapter.unsubscribe('board:1');
    expect(subscriber.unsubscribe).toHaveBeenCalledWith('app:room:board:1');

    await adapter.close();
    expect(subscriber.quit).toHaveBeenCalled();
    expect(client.quit).not.toHaveBeenCalled();
  });

  it('throws when used before init', async () => {
    const adapter = new RedisWebsocketAdapter();

    await expect(adapter.publish({ room: 'r', instanceId: 'i', data: 'x' })).rejects.toThrow('not initialized');
    await expect(adapter.subscribe('r')).rejects.toThrow('not initialized');
  });
});

/**
 * Runs against a real Redis when `REDIS_URL` is set, for example:
 * `docker run --rm -p 6379:6379 redis:7-alpine` and `REDIS_URL=redis://127.0.0.1:6379 pnpm test`.
 */
const url = process.env.REDIS_URL;

describe.skipIf(!url)('RedisWebsocketAdapter against Redis', () => {
  const apps: App[] = [];

  afterEach(async () => {
    for (const app of apps.splice(0)) await app.close();
  });

  const instance = async (prefix: string): Promise<WebsocketService> => {
    const app = await createApp({ logLevel: 'error' } as any);
    apps.push(app);
    app.container.bind($WebsocketService, WebsocketService);
    vi.spyOn(app.container.get(HttpServer), 'addPlugin').mockImplementation(() => {});
    const service = app.container.get<WebsocketService>($WebsocketService);
    service.initialize({ adapter: new RedisWebsocketAdapter({ url, prefix }) });
    return service;
  };

  it('fans room publishes out across instances, without echo', async () => {
    const prefix = `vercube:ws:test:${crypto.randomUUID()}`;
    const one = await instance(prefix);
    const two = await instance(prefix);
    const peerOne = { id: '1', send: vi.fn() } as unknown as WSPeer;
    const peerTwo = { id: '2', send: vi.fn() } as unknown as WSPeer;
    const listener = vi.fn();

    one.join(peerOne, 'board:1');
    two.join(peerTwo, 'board:1');
    two.onRemoteMessage('board:1', listener);
    // let both subscriptions reach Redis
    await (one as any).fAdapterReady;
    await (two as any).fAdapterReady;

    await one.publish('board:1', new Uint8Array([4, 2]), { except: peerOne });
    await one.publish('board:1', { op: 'rename' });

    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));
    expect(peerTwo.send).toHaveBeenNthCalledWith(1, new Uint8Array([4, 2]));
    expect(peerTwo.send).toHaveBeenNthCalledWith(2, '{"op":"rename"}');
    expect(listener).toHaveBeenNthCalledWith(1, new Uint8Array([4, 2]), 'board:1');

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(peerOne.send).toHaveBeenCalledTimes(1);
    expect(peerOne.send).toHaveBeenCalledWith('{"op":"rename"}');
  });
});
