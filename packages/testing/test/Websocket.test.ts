import { Inject } from '@vercube/di';
// oxlint-disable no-unused-vars
import {
  Data,
  Message,
  Namespace,
  NamespaceParam,
  OnBinary,
  OnClose,
  OnConnectionAttempt,
  OnOpen,
  Peer,
  PeerContext,
  WebsocketService,
  $WebsocketService,
} from '@vercube/ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, TestingError } from '../src';
import { connectWebsocket, testWebsocket } from '../src/Websocket';
import type { TestApp } from '../src';
import type { WSPeer } from '@vercube/ws';

const closed: unknown[] = [];

@Namespace('/ws/boards/:boardId')
class BoardGateway {
  @Inject($WebsocketService)
  private readonly gWs!: WebsocketService;

  @OnConnectionAttempt()
  public connect(query: Record<string, string>) {
    if (query.token === 'expired') throw new Response('Token expired', { status: 401 });
    return query.token === 'secret' ? { user: 'ada' } : false;
  }

  @OnOpen()
  public open(@Peer() peer: WSPeer, @NamespaceParam('boardId') boardId: string) {
    this.gWs.join(peer, `board:${boardId}`);
  }

  @OnBinary()
  public update(@Data() update: Uint8Array, @Peer() peer: WSPeer, @NamespaceParam('boardId') boardId: string) {
    void this.gWs.publish(`board:${boardId}`, update, { except: peer });
  }

  @Message({ event: 'whoami' })
  public whoami(@Data() _data: unknown, @Peer() peer: WSPeer, @PeerContext('user') user: string) {
    peer.send({ event: 'me', data: { user } });
  }

  @Message({ event: 'kick' })
  public kick(@Data() _data: unknown, @Peer() peer: WSPeer) {
    peer.close(4000, 'kicked');
  }

  @OnClose()
  public close(@Data() details: unknown) {
    closed.push(details);
  }
}

describe('connectWebsocket', () => {
  let app: TestApp;

  afterEach(async () => {
    await app?.close();
  });

  beforeEach(() => {
    closed.length = 0;
  });

  const boot = async () => {
    app = await createTestApp({ providers: [BoardGateway], extensions: [testWebsocket()] });
    app.container.get(BoardGateway);
  };

  it('runs the connection attempt and rejects like a server would', async () => {
    await boot();

    await expect(connectWebsocket(app, '/ws/boards/1')).rejects.toThrow(/rejected with 403/);
    await expect(connectWebsocket(app, '/nope')).rejects.toThrow(TestingError);

    const error = await connectWebsocket(app, '/ws/boards/1', { query: { token: 'expired' } }).catch((error_) => error_);
    expect(error.response).toMatchObject({ status: 401, body: 'Token expired' });
  });

  it('exchanges JSON events with the context of the peer', async () => {
    await boot();
    const ws = await connectWebsocket(app, '/ws/boards/1', { query: { token: 'secret' } });

    await ws.emit('whoami');

    expect(await ws.nextEvent('me')).toEqual({ user: 'ada' });
  });

  it('sends binary frames to the other peers of the room', async () => {
    await boot();
    const alice = await connectWebsocket(app, '/ws/boards/7', { query: { token: 'secret' } });
    const bob = await connectWebsocket(app, '/ws/boards/7', { query: { token: 'secret' } });
    const carol = await connectWebsocket(app, '/ws/boards/8', { query: { token: 'secret' } });

    await alice.send(new Uint8Array([1, 2, 3]));

    expect(await bob.next()).toEqual(new Uint8Array([1, 2, 3]));
    expect(alice.frames).toEqual([]);
    expect(carol.frames).toEqual([]);
    await expect(carol.next(10)).rejects.toThrow('No websocket frame arrived within 10ms');
  });

  it('runs the close hook on either side', async () => {
    await boot();
    const ws = await connectWebsocket(app, '/ws/boards/1', { query: { token: 'secret' } });
    await ws.emit('kick');

    await expect.poll(() => ws.closed).toEqual({ code: 4000, reason: 'kicked' });
    await expect(ws.send('x')).rejects.toThrow('closed');

    const other = await connectWebsocket(app, '/ws/boards/1', { query: { token: 'secret' } });
    await other.close();

    expect(closed).toEqual([
      { code: 4000, reason: 'kicked' },
      { code: 1000, reason: '' },
    ]);
    expect(app.resolve<WebsocketService>($WebsocketService).getRoomPeers('board:1')).toEqual([]);
  });

  it('accepts a container as the target', async () => {
    await boot();
    const ws = await connectWebsocket(app.container, '/ws/boards/1', { query: { token: 'secret' } });

    expect(ws.peer.namespace).toBe('/ws/boards/1');
    expect(ws.peer.context).toEqual({ user: 'ada' });
  });
});
