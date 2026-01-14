import { createApp, HttpServer } from '@vercube/core';
import { Container, initializeContainer } from '@vercube/di';
import { defineHooks } from 'crossws';
import { type ServerPlugin } from 'srvx';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { $WebsocketService, WebsocketService, WebsocketTypes } from '../../src';
import type { App, ConfigTypes } from '@vercube/core';
import type { Message, Peer } from 'crossws';

// oxlint-disable no-unused-vars

vi.mock('srvx', () => ({
  serve: vi.fn().mockReturnValue({
    ready: vi.fn().mockResolvedValue(undefined),
  }),
}));

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
  let container: Container;
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
    vi.clearAllMocks();

    app = await createApp(config as any);
    container = app.container;
    container.bind($WebsocketService, WebsocketService);

    service = container.get($WebsocketService);
    const httpServer = container.get(HttpServer);
    vi.spyOn(httpServer, 'addPlugin');

    peer = {
      id: '123',
      namespace: '/foo',
      send: vi.fn(),
    };

    initializeContainer(container);
  });

  it('registers namespaces correctly', () => {
    service.registerNamespace('/test');
    expect(service['fNamespaces']['/test']).toEqual([]);
  });

  it('registers message handlers and namespaces', () => {
    const handler = { callback: vi.fn() };
    service.registerHandler(WebsocketTypes.HandlerAction.MESSAGE, '/chat', {
      callback: handler.callback,
      event: 'message',
    });
    expect(service['fHandlers'][WebsocketTypes.HandlerAction.MESSAGE]['/chat']['message']).toStrictEqual({
      callback: handler.callback,
      event: 'message',
    });
    expect(service['fNamespaces']['/chat']).toEqual([]);
  });

  it('handles messages by calling correct handler', async () => {
    const handler = { callback: vi.fn() };
    const peer = createMockPeer('123', '/room');
    const message = createMockMessage({
      event: 'say',
      data: { text: 'hello' },
    });

    service.registerHandler(WebsocketTypes.HandlerAction.MESSAGE, '/room', {
      callback: handler.callback,
      event: 'say',
    });
    await service['handleMessage'](peer, message);

    expect(handler.callback).toHaveBeenCalledWith({ text: 'hello' }, peer);
  });

  it('logs warning if no handler found', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const peer = createMockPeer('321', '/nohandler');
    const message = createMockMessage({ event: 'ghost', data: {} });

    service.registerNamespace('/nohandler');
    await service['handleMessage'](peer, message);

    expect(warn).toHaveBeenCalled();
  });

  it('broadcasts messages to all peers in a namespace', () => {
    const peer1 = createMockPeer('1', '/global');
    const peer2 = createMockPeer('2', '/global');
    service['fNamespaces']['/global'] = [peer1, peer2];

    service.broadcast(peer1, { msg: 'yo' });

    expect(peer1.send).toHaveBeenCalledWith({ msg: 'yo' });
    expect(peer2.send).toHaveBeenCalledWith({ msg: 'yo' });
  });

  it('broadcasts to others except sender', () => {
    const peer1 = createMockPeer('1', '/room');
    const peer2 = createMockPeer('2', '/room');
    const peer3 = createMockPeer('3', '/room');
    service['fNamespaces']['/room'] = [peer1, peer2, peer3];

    service.broadcastOthers(peer1, 'Hello');

    expect(peer1.send).not.toHaveBeenCalled();
    expect(peer2.send).toHaveBeenCalledWith('Hello');
    expect(peer3.send).toHaveBeenCalledWith('Hello');
  });

  it('initializes and rejects unknown namespace', async () => {
    service.registerNamespace('/chat');
    service.initialize();

    const pluginSpy = vi.mocked(container.get(HttpServer).addPlugin);
    const serverPlugin = pluginSpy.mock.calls[0][0] as MockedServerPlugin;
    const hooks = serverPlugin.__hooks;
    const response = await hooks?.upgrade?.(new Request('http://localhost/unknown'));

    expect((response as Response).status).toBe(403);
  });

  it('allows known namespace on upgrade', async () => {
    service.registerNamespace('/chat');
    service.initialize();

    const pluginSpy = vi.mocked(container.get(HttpServer).addPlugin);
    const serverPlugin = pluginSpy.mock.calls[0][0] as MockedServerPlugin;
    const hooks = serverPlugin.__hooks;
    const result = await hooks?.upgrade?.(new Request('http://localhost/chat'));

    expect(result).toMatchObject({ namespace: '/chat' });
  });

  it('adds peer on open', async () => {
    const peer = createMockPeer('123', '/lobby');
    service.registerNamespace('/lobby');
    service.initialize();

    const pluginSpy = vi.mocked(container.get(HttpServer).addPlugin);
    const serverPlugin = pluginSpy.mock.calls[0][0] as MockedServerPlugin;
    const hooks = serverPlugin.__hooks;
    await hooks?.open?.(peer);

    expect(service['fNamespaces']['/lobby']).toContain(peer);
  });

  it('removes peer on close', async () => {
    const peer = createMockPeer('999', '/room');
    service['fNamespaces']['/room'] = [peer];
    service.initialize();

    const pluginSpy = vi.mocked(container.get(HttpServer).addPlugin);
    const serverPlugin = pluginSpy.mock.calls[0][0] as MockedServerPlugin;
    const hooks = serverPlugin.__hooks;
    await hooks?.close?.(peer, { code: 1000 });

    expect(service['fNamespaces']['/room']).toEqual([]);
  });

  it('logs errors on error hook', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const peer = createMockPeer('error', '/err');
    const err = new Error('Boom');

    service.initialize();
    const pluginSpy = vi.mocked(container.get(HttpServer).addPlugin);
    const serverPlugin = pluginSpy.mock.calls[0][0] as MockedServerPlugin;
    const hooks = serverPlugin.__hooks;

    await hooks?.error?.(peer, err as any);

    expect(errorLog).toHaveBeenCalled();
  });

  describe('prototype pollution protection', () => {
    it('should filter out __proto__ from WebSocket message data', async () => {
      const handler = { callback: vi.fn() };
      const peer = createMockPeer('123', '/secure');
      const maliciousMessage = createMockMessage({
        event: 'update',
        data: {
          name: 'John',
          __proto__: { isAdmin: true },
        },
      });

      service.registerHandler(WebsocketTypes.HandlerAction.MESSAGE, '/secure', {
        callback: handler.callback,
        event: 'update',
      });
      await service['handleMessage'](peer, maliciousMessage);

      expect(handler.callback).toHaveBeenCalled();
      const callData = handler.callback.mock.calls[0][0];
      expect(callData.name).toBe('John');
      expect(callData.__proto__).toBeUndefined();
      expect(({} as any).isAdmin).toBeUndefined();
    });

    it('should filter out constructor from WebSocket message data', async () => {
      const handler = { callback: vi.fn() };
      const peer = createMockPeer('456', '/secure');
      const maliciousMessage = createMockMessage({
        event: 'update',
        data: {
          name: 'John',
          constructor: { prototype: { polluted: true } },
        },
      });

      service.registerHandler(WebsocketTypes.HandlerAction.MESSAGE, '/secure', {
        callback: handler.callback,
        event: 'update',
      });
      await service['handleMessage'](peer, maliciousMessage);

      expect(handler.callback).toHaveBeenCalled();
      const callData = handler.callback.mock.calls[0][0];
      expect(callData.name).toBe('John');
      expect(callData.constructor).toBeUndefined();
    });

    it('should sanitize URL parameters on upgrade', async () => {
      service.registerNamespace('/secure');
      service.initialize();

      const pluginSpy = vi.mocked(container.get(HttpServer).addPlugin);
      const serverPlugin = pluginSpy.mock.calls[0][0] as MockedServerPlugin;
      const hooks = serverPlugin.__hooks;

      // Create a connection handler to verify sanitized parameters
      const connectionHandler = { callback: vi.fn().mockResolvedValue(true) };
      service.registerHandler(WebsocketTypes.HandlerAction.CONNECTION, '/secure', {
        callback: connectionHandler.callback,
      });

      // Attempt to pass malicious URL parameters
      const maliciousUrl = 'http://localhost/secure?name=John&__proto__=polluted&constructor=bad';
      const result = await hooks?.upgrade?.(new Request(maliciousUrl));

      expect(connectionHandler.callback).toHaveBeenCalled();
      const params = connectionHandler.callback.mock.calls[0][0];
      expect(params.name).toBe('John');
      expect(params.__proto__).toBeUndefined();
      expect(params.constructor).toBeUndefined();
      expect(({} as any).polluted).toBeUndefined();
    });

    it('should not pollute Object.prototype via WebSocket messages', async () => {
      const handler = { callback: vi.fn() };
      const peer = createMockPeer('789', '/secure');
      const maliciousMessage = createMockMessage({
        event: 'attack',
        data: {
          __proto__: { wsPoiluted: true },
        },
      });

      service.registerHandler(WebsocketTypes.HandlerAction.MESSAGE, '/secure', {
        callback: handler.callback,
        event: 'attack',
      });
      await service['handleMessage'](peer, maliciousMessage);

      expect((Object.prototype as any).wsPoiluted).toBeUndefined();
      const newObj = {};
      expect((newObj as any).wsPoiluted).toBeUndefined();
    });
  });
});
