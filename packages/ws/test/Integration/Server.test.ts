// oxlint-disable no-unused-vars
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { createApp } from '@vercube/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  Data,
  Message,
  Namespace,
  NamespaceParam,
  OnBinary,
  OnConnectionAttempt,
  OnOpen,
  Peer,
  PeerContext,
  WebsocketPlugin,
  $WebsocketService,
} from '../../src';
import type { WebsocketService, WSPeer } from '../../src';
import type { App } from '@vercube/core';
import type { Server } from 'node:http';

@Namespace('/ws/boards/:boardId')
class BoardGateway {
  public service!: WebsocketService;

  @OnConnectionAttempt()
  public connect(query: Record<string, string>): false | Record<string, unknown> {
    if (query.token === 'throw') {
      throw new Response('Bad token', { status: 401 });
    }

    if (query.token !== 'secret') {
      return false;
    }

    return { user: 'ada' };
  }

  @OnOpen()
  public open(@Peer() peer: WSPeer, @NamespaceParam('boardId') boardId: string): void {
    this.service.join(peer, `board:${boardId}`);
  }

  @OnBinary()
  public update(@Data() update: Uint8Array, @Peer() peer: WSPeer, @NamespaceParam('boardId') boardId: string): void {
    // echo back to the sender, and to everyone else in the board
    peer.send(update);
    void this.service.publish(`board:${boardId}`, update, { except: peer });
  }

  @Message({ event: 'whoami' })
  public whoami(
    @Data() _data: unknown,
    @Peer() peer: WSPeer,
    @PeerContext('user') user: string,
    @NamespaceParam('boardId') boardId: string,
  ) {
    peer.send({ event: 'whoami', data: { user, boardId } });
  }
}

/**
 * Asks the OS for a port nothing listens on.
 */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(typeof address === 'object' && address ? address.port : 0));
    });
  });
}

interface Client {
  ws: WebSocket;
  frames: (string | Uint8Array)[];
  next: () => Promise<string | Uint8Array>;
  closed: Promise<{ code: number; reason: string }>;
}

/**
 * Opens a websocket and resolves once it is open, or rejects when the server refuses it.
 */
function connect(url: string): Promise<Client> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';

    const frames: (string | Uint8Array)[] = [];
    const waiters: ((frame: string | Uint8Array) => void)[] = [];
    const closed = new Promise<{ code: number; reason: string }>((done) => {
      ws.addEventListener('close', (event) => done({ code: event.code, reason: event.reason }));
    });

    ws.addEventListener('message', (event) => {
      const frame = typeof event.data === 'string' ? event.data : new Uint8Array(event.data as ArrayBuffer);
      const waiter = waiters.shift();
      if (waiter) waiter(frame);
      else frames.push(frame);
    });

    ws.addEventListener('open', () =>
      resolve({
        ws,
        frames,
        closed,
        next: () => (frames.length > 0 ? Promise.resolve(frames.shift()!) : new Promise((done) => waiters.push(done))),
      }),
    );
    ws.addEventListener('error', () => reject(new Error('rejected')));
  });
}

type Start = (options?: { maxPayload?: number }) => Promise<{ url: string; service: WebsocketService }>;

const clients: WebSocket[] = [];
let app: App | null = null;
let nodeServer: Server | null = null;

afterEach(async () => {
  for (const ws of clients.splice(0)) ws.close();
  await app?.close().catch(() => {});
  app = null;
  await new Promise<void>((resolve) => (nodeServer ? nodeServer.close(() => resolve()) : resolve()));
  nodeServer = null;
});

/**
 * Boots an application with the gateway.
 */
async function boot(port: number, maxPayload?: number): Promise<WebsocketService> {
  app = await createApp({
    cfg: { requestLogging: false, logLevel: 'error', server: { host: '127.0.0.1', port, static: undefined } } as never,
    setup: async (instance) => {
      instance.addPlugin(WebsocketPlugin, { maxPayload });
      instance.container.bind(BoardGateway);
    },
  });

  const service = app.container.get<WebsocketService>($WebsocketService);
  app.container.get(BoardGateway).service = service;

  return service;
}

/** The srvx server of the application, through `crossws/server`'s plugin. */
const srvxPath: Start = async (options = {}) => {
  const port = await freePort();
  const service = await boot(port, options.maxPayload);
  await app!.listen();

  return { url: `ws://127.0.0.1:${port}`, service };
};

/** A plain Node server handing upgrades to `__vercube_ws_upgrade__`, like the Vite dev server. */
const nodeAdapterPath: Start = async (options = {}) => {
  const service = await boot(0, options.maxPayload);
  const upgrade = (globalThis as { __vercube_ws_upgrade__?: (...args: unknown[]) => Promise<void> }).__vercube_ws_upgrade__!;

  nodeServer = createServer((_req, res) => res.writeHead(404).end());
  nodeServer.on('upgrade', (req, socket, head) => void upgrade(req, socket, head));

  await new Promise<void>((resolve) => nodeServer!.listen(0, '127.0.0.1', () => resolve()));
  const address = nodeServer.address();

  return { url: `ws://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`, service };
};

describe.each([
  ['srvx plugin', srvxPath],
  ['node adapter (vite dev)', nodeAdapterPath],
])('websocket server through the %s', (_name, start) => {
  const open = async (url: string): Promise<Client> => {
    const client = await connect(url);
    clients.push(client.ws);
    return client;
  };

  it('rejects a connection the connection attempt handler refuses', async () => {
    const { url, service } = await start();

    await expect(connect(`${url}/ws/boards/1`)).rejects.toThrow('rejected');
    await expect(connect(`${url}/ws/boards/1?token=wrong`)).rejects.toThrow('rejected');
    await expect(connect(`${url}/ws/boards/1?token=throw`)).rejects.toThrow('rejected');
    await expect(connect(`${url}/ws/unknown?token=secret`)).rejects.toThrow('rejected');

    expect(service.getRoomPeers('board:1')).toHaveLength(0);
  });

  it('accepts a connection with the context and namespace params', async () => {
    const { url } = await start();
    const client = await open(`${url}/ws/boards/Board-1?token=secret`);

    client.ws.send(JSON.stringify({ event: 'whoami', data: null }));

    expect(JSON.parse((await client.next()) as string)).toEqual({ event: 'whoami', data: { user: 'ada', boardId: 'Board-1' } });
  });

  it('round-trips binary frames and publishes them to the room', async () => {
    const { url } = await start();
    const alice = await open(`${url}/ws/boards/7?token=secret`);
    const bob = await open(`${url}/ws/boards/7?token=secret`);
    const other = await open(`${url}/ws/boards/8?token=secret`);

    alice.ws.send(new Uint8Array([1, 2, 3, 250]));

    expect(await alice.next()).toEqual(new Uint8Array([1, 2, 3, 250]));
    expect(await bob.next()).toEqual(new Uint8Array([1, 2, 3, 250]));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(other.frames).toHaveLength(0);
  });

  it('closes a peer sending a frame over maxPayload', async () => {
    const { url } = await start({ maxPayload: 16 });
    const client = await open(`${url}/ws/boards/1?token=secret`);

    client.ws.send(new Uint8Array(64));

    expect((await client.closed).code).toBe(1009);
  });
});
