import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type Peer, type Message, type defineHooks } from 'crossws';
import { WebsocketService } from '../../src/Services/WebsocketService';
import { type ServerPlugin } from 'srvx';

interface MockedServerPlugin extends ServerPlugin {
  __hooks: ReturnType<typeof defineHooks>;
}

vi.mock('crossws/server', () => ({
  plugin: vi.fn((hooks) => ({ __hooks: hooks })),
}));

vi.mock('crossws', async () => {
  const actual = await vi.importActual<typeof import('crossws')>('crossws');
  return {
    ...actual,
    defineHooks: vi.fn(actual.defineHooks),
  };
});

function createMockPeer(id: string, namespace = '/test'): Peer {
  return {
    id,
    namespace,
    send: vi.fn(),
  } as unknown as Peer;
}

function createMockMessage(data: any): Message {
  return {
    text: () => JSON.stringify(data),
  } as unknown as Message;
}

describe('WebsocketService', () => {
  let service: WebsocketService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new WebsocketService();
  });

  it('registers namespaces correctly', () => {
    service.registerNamespace('/test');
    expect(service['namespaces']['/test']).toEqual([]);
  });

  it('registers message handlers and namespaces', () => {
    const handler = vi.fn();
    service.registerMessageHandler('/chat', 'message', handler);
    expect(service['eventHandlers']['/chat']['message']).toBe(handler);
    expect(service['namespaces']['/chat']).toEqual([]);
  });

  it('handles messages by calling correct handler', async () => {
    const handler = vi.fn();
    const peer = createMockPeer('123', '/room');
    const message = createMockMessage({ event: 'say', data: { text: 'hello' } });

    service.registerMessageHandler('/room', 'say', handler);
    await service['handleMessage'](peer, message);

    expect(handler).toHaveBeenCalledWith(peer, { text: 'hello' });
  });

  it('logs warning if no handler found', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const peer = createMockPeer('321', '/nohandler');
    const message = createMockMessage({ event: 'ghost', data: {} });

    service.registerNamespace('/nohandler');
    await service['handleMessage'](peer, message);

    expect(warn).toHaveBeenCalledWith('[WS] No handler for event "ghost" in namespace "/nohandler"');
  });

  it('broadcasts messages to all peers in a namespace', () => {
    const peer1 = createMockPeer('1', '/global');
    const peer2 = createMockPeer('2', '/global');
    service['namespaces']['/global'] = [peer1, peer2];

    service.broadcast(peer1, { msg: 'yo' });

    expect(peer1.send).toHaveBeenCalledWith({ msg: 'yo' });
    expect(peer2.send).toHaveBeenCalledWith({ msg: 'yo' });
  });

  it('broadcasts to others except sender', () => {
    const peer1 = createMockPeer('1', '/room');
    const peer2 = createMockPeer('2', '/room');
    const peer3 = createMockPeer('3', '/room');
    service['namespaces']['/room'] = [peer1, peer2, peer3];

    service.broadcastOthers(peer1, 'Hello');

    expect(peer1.send).not.toHaveBeenCalled();
    expect(peer2.send).toHaveBeenCalledWith('Hello');
    expect(peer3.send).toHaveBeenCalledWith('Hello');
  });

  it('initializes and rejects unknown namespace', async () => {
    const service = new WebsocketService();
    service.registerNamespace('/chat');
    service.initialize();

    const hooks = (service.serverPlugin as MockedServerPlugin).__hooks;
    const response = await hooks?.upgrade?.(new Request('http://localhost/unknown'));

    expect((response as Response).status).toBe(403);
  });

  it('allows known namespace on upgrade', async () => {
    const service = new WebsocketService();
    service.registerNamespace('/chat');
    service.initialize();

    const hooks = (service.serverPlugin as MockedServerPlugin).__hooks;
    const result = await hooks?.upgrade?.(new Request('http://localhost/chat'));

    expect(result).toMatchObject({ namespace: '/chat' });
  });

  it('adds peer on open', async () => {
    const peer = createMockPeer('123', '/lobby');
    service.registerNamespace('/lobby');
    service.initialize();

    const hooks = (service.serverPlugin as MockedServerPlugin).__hooks;
    await hooks?.open?.(peer);

    expect(service['namespaces']['/lobby']).toContain(peer);
  });

  it('removes peer on close', async () => {
    const peer = createMockPeer('999', '/room');
    service['namespaces']['/room'] = [peer];
    service.initialize();

    const hooks = (service.serverPlugin as MockedServerPlugin).__hooks;
    await hooks?.close?.(peer, { code: 1000 });

    expect(service['namespaces']['/room']).toEqual([]);
  });

  it('logs errors on error hook', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const peer = createMockPeer('error', '/err');
    const err = new Error('Boom');

    service.initialize();
    const hooks = (service.serverPlugin as MockedServerPlugin).__hooks;

    await hooks?.error?.(peer, err as any);

    expect(errorLog).toHaveBeenCalledWith('[WS] Error', peer, err);
  });
});