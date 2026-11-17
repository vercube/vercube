// oxlint-disable no-unused-vars
import { createApp, HttpServer } from '@vercube/core';
import { Container, initializeContainer } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  $WebsocketService,
  Data,
  Emit,
  Message,
  Namespace,
  NamespaceParam,
  OnBinary,
  OnClose,
  OnConnectionAttempt,
  OnError,
  OnOpen,
  Peer,
  PeerContext,
  WebsocketService,
} from '../../src';
import type { WSPeer } from '../../src';
import type { App } from '@vercube/core';

vi.mock('srvx', () => ({
  serve: vi.fn().mockReturnValue({
    ready: vi.fn().mockResolvedValue(undefined),
  }),
}));

const calls: unknown[][] = [];

@Namespace('/ws/boards/:boardId')
class BoardGateway {
  @OnConnectionAttempt()
  public connect(query: Record<string, string>, _request: Request, params: Record<string, string>) {
    calls.push(['connect', query, params]);
    return query.token ? { user: { id: query.token }, role: 'editor' } : false;
  }

  @OnOpen()
  public async open(peer: WSPeer) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    calls.push(['open', peer.id]);
  }

  @OnClose()
  public close(@Data() details: unknown, @NamespaceParam('boardId') boardId: string) {
    calls.push(['close', details, boardId]);
  }

  @OnError()
  public error(peer: WSPeer, error: Error) {
    calls.push(['error', peer.id, error.message]);
  }

  @OnBinary()
  public binary(@Data() data: Uint8Array, @NamespaceParam('boardId') boardId: string, @PeerContext() context: unknown) {
    calls.push(['binary', [...data], boardId, context]);
  }

  @Message({ event: 'rename' })
  @Emit('renamed')
  public rename(@Data() data: { name: string }, @Peer() peer: WSPeer, @PeerContext('role') role: string) {
    calls.push(['rename', data, peer.id, role]);
    return { name: data.name, role };
  }

  @Message({ event: 'legacy' })
  public legacy(data: unknown, peer: WSPeer) {
    calls.push(['legacy', data, peer.id]);
  }
}

/**
 * A peer as crossws hands it to the hooks.
 */
function createPeer(id: string, namespace: string, context: Record<string, unknown> = {}): WSPeer {
  return { id, namespace, context, send: vi.fn(), close: vi.fn() } as unknown as WSPeer;
}

/**
 * A text or binary message as crossws hands it to the hooks.
 */
function createMessage(raw: string | Uint8Array) {
  return {
    rawData: raw,
    text: () => (typeof raw === 'string' ? raw : new TextDecoder().decode(raw)),
    uint8Array: () => (typeof raw === 'string' ? new TextEncoder().encode(raw) : raw),
  } as any;
}

describe('lifecycle, binary and parameter decorators', () => {
  let app: App;
  let container: Container;
  let service: WebsocketService;

  beforeEach(async () => {
    calls.length = 0;
    app = await createApp({ logLevel: 'error' } as any);
    container = app.container;
    container.bind($WebsocketService, WebsocketService);
    container.bind(BoardGateway);
    service = container.get($WebsocketService);
    vi.spyOn(container.get(HttpServer), 'addPlugin').mockImplementation(() => {});
    initializeContainer(container);
    container.get(BoardGateway);
    service.initialize();
  });

  it('stores what the connection attempt returned as the peer context, and passes the namespace params', async () => {
    const result = await service.hooks.upgrade!(new Request('http://localhost/ws/boards/B1?token=u1'));

    expect(result).toEqual({ namespace: '/ws/boards/B1', headers: {}, context: { user: { id: 'u1' }, role: 'editor' } });
    expect(calls[0]).toEqual(['connect', { token: 'u1' }, { boardId: 'B1' }]);
  });

  it('still rejects with false', async () => {
    const result = await service.hooks.upgrade!(new Request('http://localhost/ws/boards/B1'));

    expect((result as Response).status).toBe(403);
  });

  it('runs open before any message of the peer, and close with the details', async () => {
    const peer = createPeer('p1', '/ws/boards/B1', { role: 'editor' });

    const opened = service.hooks.open!(peer);
    const handled = service.hooks.message!(peer, createMessage(JSON.stringify({ event: 'legacy', data: 1 })));
    await Promise.all([opened, handled]);

    expect(calls.map((c) => c[0])).toEqual(['open', 'legacy']);

    await service.hooks.close!(peer, { code: 1000, reason: 'bye' });
    expect(calls.at(-1)).toEqual(['close', { code: 1000, reason: 'bye' }, 'B1']);
  });

  it('routes binary frames to @OnBinary with the namespace params and context', async () => {
    const peer = createPeer('p1', '/ws/boards/B2', { role: 'viewer' });
    await service.hooks.open!(peer);

    await service.hooks.message!(peer, createMessage(new Uint8Array([1, 2, 3])));

    expect(calls.at(-1)).toEqual(['binary', [1, 2, 3], 'B2', { role: 'viewer' }]);
  });

  it('resolves parameter decorators under @Emit, which still sees the peer', async () => {
    const peer = createPeer('p1', '/ws/boards/B3', { role: 'editor' });
    await service.hooks.open!(peer);

    await service.hooks.message!(peer, createMessage(JSON.stringify({ event: 'rename', data: { name: 'Plan' } })));

    expect(calls.at(-1)).toEqual(['rename', { name: 'Plan' }, 'p1', 'editor']);
    expect(peer.send).toHaveBeenCalledWith({ event: 'renamed', data: { name: 'Plan', role: 'editor' } });
  });

  it('keeps the (data, peer) call for handlers without parameter decorators', async () => {
    const peer = createPeer('p9', '/ws/boards/B3');
    await service.hooks.open!(peer);
    await service.hooks.message!(peer, createMessage(JSON.stringify({ event: 'legacy', data: { a: 1 } })));

    expect(calls.at(-1)).toEqual(['legacy', { a: 1 }, 'p9']);
  });

  it('runs the error handler after logging', async () => {
    vi.spyOn(container.get(Logger), 'error').mockImplementation(() => {});
    const peer = createPeer('p1', '/ws/boards/B1');

    await service.hooks.error!(peer, new Error('broken') as any);

    expect(calls.at(-1)).toEqual(['error', 'p1', 'broken']);
  });

  it('logs a failing lifecycle handler instead of throwing', async () => {
    const error = vi.spyOn(container.get(Logger), 'error').mockImplementation(() => {});
    vi.spyOn(container.get(BoardGateway), 'open').mockRejectedValue(new Error('db down'));
    const peer = createPeer('p1', '/ws/boards/B1');

    await expect(service.hooks.open!(peer)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith('WebsocketService::runLifecycle', expect.stringContaining('db down'));
  });

  it('sends binary handler failures to the peer as an error frame', async () => {
    vi.spyOn(container.get(Logger), 'error').mockImplementation(() => {});
    vi.spyOn(container.get(BoardGateway), 'binary').mockImplementation(() => {
      throw new Error('bad update');
    });
    const peer = createPeer('p1', '/ws/boards/B1');
    await service.hooks.open!(peer);

    await service.hooks.message!(peer, createMessage(new Uint8Array([9])));

    expect(peer.send).toHaveBeenCalledWith({
      event: 'error',
      data: { event: undefined, status: 500, message: 'Failed to process message' },
    });
  });

  it('exposes the params and the context of a peer', async () => {
    const peer = createPeer('p1', '/ws/boards/XYZ', { user: 'u' });
    await service.hooks.open!(peer);

    expect(service.getParams(peer)).toEqual({ boardId: 'XYZ' });
    expect(service.getContext(peer)).toEqual({ user: 'u' });
    expect(service.getParams(createPeer('p2', '/ws/boards/Q'))).toEqual({ boardId: 'Q' });
  });
});
