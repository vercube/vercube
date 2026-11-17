import { createApp, HttpServer, ShutdownRegistry } from '@vercube/core';
import { Logger } from '@vercube/logger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { $WebsocketService, MemoryWebsocketAdapter, MemoryWebsocketBus, WebsocketService } from '../../src';
import type { WebsocketTypes, WSPeer } from '../../src';
import type { App } from '@vercube/core';

vi.mock('srvx', () => ({
  serve: vi.fn().mockReturnValue({
    ready: vi.fn().mockResolvedValue(undefined),
  }),
}));

/**
 * A peer as crossws hands it to the hooks.
 */
function createPeer(id: string, namespace = '/room'): WSPeer {
  return { id, namespace, context: {}, send: vi.fn(), close: vi.fn() } as unknown as WSPeer;
}

/**
 * Boots an application instance with a websocket service.
 */
async function createService(options: WebsocketTypes.Options = {}): Promise<{ app: App; service: WebsocketService }> {
  const app = await createApp({ logLevel: 'error' } as any);
  app.container.bind($WebsocketService, WebsocketService);
  vi.spyOn(app.container.get(HttpServer), 'addPlugin').mockImplementation(() => {});

  const service = app.container.get<WebsocketService>($WebsocketService);
  service.registerNamespace('/room');
  service.initialize(options);

  return { app, service };
}

describe('rooms', () => {
  let service: WebsocketService;

  beforeEach(async () => {
    ({ service } = await createService());
  });

  it('publishes to the peers of a room only', async () => {
    const a = createPeer('a');
    const b = createPeer('b');
    const c = createPeer('c');
    service.join(a, 'r1');
    service.join(b, 'r1');
    service.join(c, 'r2');

    await service.publish('r1', { hello: 1 });

    expect(a.send).toHaveBeenCalledWith('{"hello":1}');
    expect(b.send).toHaveBeenCalledWith('{"hello":1}');
    expect(c.send).not.toHaveBeenCalled();
  });

  it('skips the except peer, by peer or by id', async () => {
    const a = createPeer('a');
    const b = createPeer('b');
    service.join(a, 'r');
    service.join(b, 'r');

    await service.publish('r', new Uint8Array([1]), { except: a });
    await service.publish('r', 'text', { except: 'b' });

    expect(a.send).toHaveBeenCalledTimes(1);
    expect(a.send).toHaveBeenCalledWith('text');
    expect(b.send).toHaveBeenCalledTimes(1);
    expect(b.send).toHaveBeenCalledWith(new Uint8Array([1]));
  });

  it('sends ArrayBuffers and typed arrays as bytes', async () => {
    const a = createPeer('a');
    service.join(a, 'r');

    await service.publish('r', new Uint8Array([7, 8]).buffer);
    await service.publish('r', new Uint16Array([1]));

    expect(a.send).toHaveBeenNthCalledWith(1, new Uint8Array([7, 8]));
    expect(a.send).toHaveBeenNthCalledWith(2, new Uint8Array([1, 0]));
  });

  it('leaves rooms, and every room on close', async () => {
    const peer = createPeer('a');
    await service.hooks.open!(peer);
    service.join(peer, 'r1');
    service.join(peer, 'r2');

    expect(service.getPeerRooms(peer)).toEqual(['r1', 'r2']);

    service.leave(peer, 'r1');
    expect(service.getRoomPeers('r1')).toEqual([]);

    await service.hooks.close!(peer, { code: 1000 });
    expect(service.getRoomPeers('r2')).toEqual([]);
    expect(service.getPeerRooms(peer)).toEqual([]);
  });

  it('keeps sending to the others when one peer fails', async () => {
    vi.spyOn((service as any).gLogger as Logger, 'warn').mockImplementation(() => {});
    const a = createPeer('a');
    const b = createPeer('b');
    vi.mocked(a.send).mockImplementation(() => {
      throw new Error('gone');
    });
    service.join(a, 'r');
    service.join(b, 'r');

    await service.publish('r', 'x');

    expect(b.send).toHaveBeenCalledWith('x');
  });

  it('scopes broadcast to the path of a parametric namespace', async () => {
    service.registerNamespace('/ws/boards/:boardId');
    const a = createPeer('a', '/ws/boards/1');
    const b = createPeer('b', '/ws/boards/1');
    const c = createPeer('c', '/ws/boards/2');
    for (const peer of [a, b, c]) await service.hooks.open!(peer);

    service.broadcast(a, 'hi');
    service.broadcastOthers(a, 'others');

    expect(a.send).toHaveBeenCalledWith('hi');
    expect(b.send).toHaveBeenCalledWith('hi');
    expect(b.send).toHaveBeenCalledWith('others');
    expect(a.send).not.toHaveBeenCalledWith('others');
    expect(c.send).not.toHaveBeenCalled();
  });
});

describe('rooms across instances', () => {
  const apps: App[] = [];

  afterEach(async () => {
    for (const app of apps.splice(0)) await app.close();
  });

  const two = async () => {
    const bus = new MemoryWebsocketBus();
    const first = await createService({ adapter: new MemoryWebsocketAdapter(bus) });
    const second = await createService({ adapter: new MemoryWebsocketAdapter(bus) });
    apps.push(first.app, second.app);
    return [first.service, second.service] as const;
  };

  it('fans a publish out to the peers of the other instance, without echo', async () => {
    const [one, two_] = await two();
    const local = createPeer('local');
    const remote = createPeer('remote');
    one.join(local, 'board:1');
    two_.join(remote, 'board:1');

    await one.publish('board:1', new Uint8Array([1, 2]), { except: local });

    expect(remote.send).toHaveBeenCalledTimes(1);
    expect(remote.send).toHaveBeenCalledWith(new Uint8Array([1, 2]));
    // neither the except peer nor an echo of the instance's own publish
    expect(local.send).not.toHaveBeenCalled();
  });

  it('hands remote messages to room listeners, which keep the room subscribed', async () => {
    const [one, two_] = await two();
    const listener = vi.fn();
    const stop = two_.onRemoteMessage('board:2', listener);
    const ownListener = vi.fn();
    one.onRemoteMessage('board:2', ownListener);

    await one.publish('board:2', 'update');
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith('update', 'board:2'));
    expect(ownListener).not.toHaveBeenCalled();

    stop();
    await one.publish('board:2', 'again');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('subscribes a room while it has a local peer or a listener', async () => {
    const adapter = { init: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn(), publish: vi.fn(), close: vi.fn() };
    const { app, service } = await createService({ adapter });
    apps.push(app);
    const peer = createPeer('a');

    service.join(peer, 'r');
    service.join(createPeer('b'), 'r');
    const stop = service.onRemoteMessage('r', vi.fn());
    service.leave(peer, 'r');
    stop();
    service.leave(service.getRoomPeers('r')[0], 'r');

    await vi.waitFor(() => expect(adapter.unsubscribe).toHaveBeenCalledTimes(1));
    expect(adapter.init).toHaveBeenCalledWith(service.instanceId, expect.any(Function));
    expect(adapter.subscribe).toHaveBeenCalledTimes(1);
    expect(adapter.subscribe).toHaveBeenCalledWith('r');
  });

  it('logs a failing adapter without failing publish', async () => {
    const adapter = {
      init: vi.fn(),
      subscribe: vi.fn().mockRejectedValue(new Error('sub')),
      unsubscribe: vi.fn(),
      publish: vi.fn().mockRejectedValue(new Error('down')),
      close: vi.fn(),
    };
    const { app, service } = await createService({ adapter });
    apps.push(app);
    const error = vi.spyOn(app.container.get(Logger), 'error').mockImplementation(() => {});
    const peer = createPeer('a');
    service.join(peer, 'r');

    await expect(service.publish('r', 'x')).resolves.toBeUndefined();

    expect(peer.send).toHaveBeenCalledWith('x');
    expect(error).toHaveBeenCalledWith('WebsocketService::publish', expect.stringContaining('down'));
    expect(error).toHaveBeenCalledWith('WebsocketService::syncSubscription', expect.stringContaining('sub'));
  });

  it('closes the peers and the adapter on app.close()', async () => {
    const adapter = { init: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn(), publish: vi.fn(), close: vi.fn() };
    const { app, service } = await createService({ adapter });
    const peer = createPeer('a');
    await service.hooks.open!(peer);

    expect(app.container.get(ShutdownRegistry).size).toBeGreaterThan(0);
    await app.close();

    expect(peer.close).toHaveBeenCalledWith(1001, 'Server shutting down');
    expect(adapter.close).toHaveBeenCalled();
  });
});
