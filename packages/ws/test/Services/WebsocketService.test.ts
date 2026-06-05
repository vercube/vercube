import { createApp, HttpServer, ValidationProvider } from '@vercube/core';
import { Container, initializeContainer } from '@vercube/di';
import { Logger } from '@vercube/logger';
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

const handleUpgrade = vi.hoisted(() => vi.fn());
vi.mock('crossws/adapters/node', () => ({
  default: vi.fn(() => ({ handleUpgrade })),
}));

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

function getHooks(service: WebsocketService, httpServer: HttpServer): ReturnType<typeof defineHooks> {
  const pluginSpy = vi.mocked(httpServer.addPlugin);
  return (pluginSpy.mock.calls.at(-1)![0] as MockedServerPlugin).__hooks;
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

  it('warns when registering a message handler without an event name', () => {
    const warn = vi.spyOn(container.get(Logger), 'warn').mockImplementation(() => {});

    service.registerHandler(WebsocketTypes.HandlerAction.MESSAGE, '/chat', { callback: vi.fn() });

    expect(warn).toHaveBeenCalledWith(
      'WebsocketService::registerHandler',
      expect.stringContaining('Cannot register message handler without an event name'),
    );
    expect(service['fHandlers'][WebsocketTypes.HandlerAction.MESSAGE]['/chat']).toBeUndefined();
  });

  it('registers connection handlers', () => {
    const handler = { callback: vi.fn() };
    service.registerHandler(WebsocketTypes.HandlerAction.CONNECTION, '/lobby', handler);

    expect(service['fHandlers'][WebsocketTypes.HandlerAction.CONNECTION]['/lobby']).toBe(handler);
    expect(service['fNamespaces']['/lobby']).toEqual([]);
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
    const warn = vi.spyOn(container.get(Logger), 'warn').mockImplementation(() => {});
    const peer = createMockPeer('321', '/nohandler');
    const message = createMockMessage({ event: 'ghost', data: {} });

    service.registerNamespace('/nohandler');
    await service['handleMessage'](peer, message);

    expect(warn).toHaveBeenCalled();
  });

  it('emits a message to a single peer', () => {
    const target = createMockPeer('1', '/room');
    service.emit(target, { ok: true });
    expect(target.send).toHaveBeenCalledWith({ ok: true });
  });

  it('broadcasts messages to all peers in a namespace', () => {
    const peer1 = createMockPeer('1', '/global');
    const peer2 = createMockPeer('2', '/global');
    service['fNamespaces']['/global'] = [peer1, peer2];

    service.broadcast(peer1, { msg: 'yo' });

    expect(peer1.send).toHaveBeenCalledWith({ msg: 'yo' });
    expect(peer2.send).toHaveBeenCalledWith({ msg: 'yo' });
  });

  it('no-ops broadcast helpers when the namespace is missing or empty', () => {
    const peer = createMockPeer('1');
    (peer as { namespace?: string }).namespace = undefined;

    service.broadcast(peer, 'x');
    service.broadcastOthers(peer, 'x');
    expect(peer.send).not.toHaveBeenCalled();

    const solo = createMockPeer('2', '/empty');
    service.broadcast(solo, 'x');
    service.broadcastOthers(solo, 'x');
    expect(solo.send).not.toHaveBeenCalled();
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

  it('exposes a global Node upgrade handler for Vite dev', async () => {
    service.initialize();

    const upgrade = (globalThis as { __vercube_ws_upgrade__?: (req: unknown, socket: unknown, head: unknown) => Promise<void> })
      .__vercube_ws_upgrade__;
    expect(upgrade).toBeTypeOf('function');

    const req = {};
    const socket = {};
    const head = Buffer.from('');
    await upgrade!(req, socket, head);

    expect(handleUpgrade).toHaveBeenCalledWith(req, socket, head);
  });

  it('allows known namespace on upgrade', async () => {
    service.registerNamespace('/chat');
    service.initialize();

    const hooks = getHooks(service, container.get(HttpServer));
    const result = await hooks?.upgrade?.(new Request('http://localhost/chat'));

    expect(result).toMatchObject({ namespace: '/chat' });
  });

  it('rejects upgrade when the connection handler returns false', async () => {
    service.registerNamespace('/chat');
    service.registerHandler(WebsocketTypes.HandlerAction.CONNECTION, '/chat', {
      callback: vi.fn().mockResolvedValue(false),
    });
    service.initialize();

    const hooks = getHooks(service, container.get(HttpServer));
    const response = await hooks?.upgrade?.(new Request('http://localhost/chat'));

    expect((response as Response).status).toBe(403);
    expect(await (response as Response).text()).toBe('Unauthorized');
  });

  it('rejects upgrade when the connection handler throws', async () => {
    service.registerNamespace('/chat');
    service.registerHandler(WebsocketTypes.HandlerAction.CONNECTION, '/chat', {
      callback: vi.fn().mockRejectedValue(new Error('not allowed')),
    });
    service.initialize();

    const hooks = getHooks(service, container.get(HttpServer));
    const response = await hooks?.upgrade?.(new Request('http://localhost/chat'));

    expect((response as Response).status).toBe(403);
    expect(await (response as Response).text()).toBe('not allowed');
  });

  it('rejects upgrade with a generic message for non-Error throws', async () => {
    service.registerNamespace('/chat');
    service.registerHandler(WebsocketTypes.HandlerAction.CONNECTION, '/chat', {
      callback: vi.fn().mockRejectedValue('denied'),
    });
    service.initialize();

    const hooks = getHooks(service, container.get(HttpServer));
    const response = await hooks?.upgrade?.(new Request('http://localhost/chat'));

    expect((response as Response).status).toBe(403);
    expect(await (response as Response).text()).toBe('Unknown error');
  });

  it('routes incoming messages through the message hook', async () => {
    const handler = { callback: vi.fn() };
    service.registerHandler(WebsocketTypes.HandlerAction.MESSAGE, '/room', {
      callback: handler.callback,
      event: 'ping',
    });
    service.initialize();

    const peer = createMockPeer('1', '/room');
    const hooks = getHooks(service, container.get(HttpServer));
    await hooks?.message?.(peer, createMockMessage({ event: 'ping', data: { n: 1 } }));

    expect(handler.callback).toHaveBeenCalledWith({ n: 1 }, peer);
  });

  it('ignores open and close hooks for unregistered namespaces', async () => {
    service.initialize();
    const hooks = getHooks(service, container.get(HttpServer));
    const peer = createMockPeer('1', '/ghost');

    await hooks?.open?.(peer);
    expect(service['fNamespaces']['/ghost']).toBeUndefined();

    await hooks?.close?.(peer, { code: 1000 });
    expect(service['fNamespaces']['/ghost']).toBeUndefined();
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

  it('warns when schema validation is configured but ValidationProvider is missing', async () => {
    const warn = vi.spyOn(container.get(Logger), 'warn').mockImplementation(() => {});
    Object.defineProperty(service, 'gValidationProvider', { value: null });

    service.registerHandler(WebsocketTypes.HandlerAction.MESSAGE, '/room', {
      callback: vi.fn(),
      event: 'create',
      schema: { '~standard': { version: 1, vendor: 'test', validate: () => ({ issues: [] }) } } as any,
    });

    await service['handleMessage'](createMockPeer('1', '/room'), createMockMessage({ event: 'create', data: {} }));

    expect(warn).toHaveBeenCalledWith('WebsocketService::handleMessage', 'ValidationProvider is not registered');
  });

  it('validates message data when a schema is configured', async () => {
    const validate = vi.spyOn(container.get(ValidationProvider), 'validate').mockResolvedValue({ issues: [] });
    const handler = { callback: vi.fn() };

    service.registerHandler(WebsocketTypes.HandlerAction.MESSAGE, '/room', {
      callback: handler.callback,
      event: 'create',
      schema: { '~standard': { version: 1, vendor: 'test', validate: () => ({ issues: [] }) } } as any,
    });

    const peer = createMockPeer('1', '/room');
    const payload = { name: 'Ada' };
    await service['handleMessage'](peer, createMockMessage({ event: 'create', data: payload }));

    expect(validate).toHaveBeenCalledWith(expect.anything(), payload);
    expect(handler.callback).toHaveBeenCalledWith(payload, peer);
  });

  it('logs validation and handler failures from handleMessage', async () => {
    const errorLog = vi.spyOn(container.get(Logger), 'error').mockImplementation(() => {});
    vi.spyOn(container.get(ValidationProvider), 'validate').mockResolvedValue({
      issues: [{ message: 'invalid field' }],
    });

    service.registerHandler(WebsocketTypes.HandlerAction.MESSAGE, '/room', {
      callback: vi.fn(),
      event: 'create',
      schema: {
        '~standard': { version: 1, vendor: 'test', validate: () => ({ issues: [{ message: 'invalid field' }] }) },
      } as any,
    });

    await service['handleMessage'](createMockPeer('1', '/room'), createMockMessage({ event: 'create', data: {} }));
    expect(errorLog).toHaveBeenCalledWith(
      'WebsocketService::handleMessage',
      expect.stringContaining('Websocket message validation error'),
    );

    errorLog.mockClear();
    vi.spyOn(container.get(ValidationProvider), 'validate').mockResolvedValue({ issues: [] });
    service.registerHandler(WebsocketTypes.HandlerAction.MESSAGE, '/room', {
      callback: vi.fn().mockRejectedValue(new Error('handler blew up')),
      event: 'boom',
    });

    await service['handleMessage'](createMockPeer('2', '/room'), createMockMessage({ event: 'boom', data: {} }));
    expect(errorLog).toHaveBeenCalledWith('WebsocketService::handleMessage', expect.stringContaining('handler blew up'));
  });

  it('logs errors on error hook', async () => {
    const errorLog = vi.spyOn(container.get(Logger), 'error').mockImplementation(() => {});
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
      // Verify no prototype pollution occurred
      expect(({} as any).isAdmin).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(callData, '__proto__')).toBe(false);
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
      expect(Object.prototype.hasOwnProperty.call(callData, 'constructor')).toBe(false);
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
      // Verify dangerous properties were filtered out
      expect(Object.prototype.hasOwnProperty.call(params, '__proto__')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(params, 'constructor')).toBe(false);
      expect(({} as any).polluted).toBeUndefined();
    });

    it('should not pollute Object.prototype via WebSocket messages', async () => {
      const handler = { callback: vi.fn() };
      const peer = createMockPeer('789', '/secure');
      const maliciousMessage = createMockMessage({
        event: 'attack',
        data: {
          __proto__: { wsPolluted: true },
        },
      });

      service.registerHandler(WebsocketTypes.HandlerAction.MESSAGE, '/secure', {
        callback: handler.callback,
        event: 'attack',
      });
      await service['handleMessage'](peer, maliciousMessage);

      expect((Object.prototype as any).wsPolluted).toBeUndefined();
      const newObj = {};
      expect((newObj as any).wsPolluted).toBeUndefined();
    });
  });
});
