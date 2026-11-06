import { createServer } from 'node:net';
import { Inject } from '@vercube/di';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppLifecycle, Controller, createApp, Get, HEALTH_REGISTRY_KEY, HealthRegistry } from '../../src';
import type { App, ConfigTypes } from '../../src';

@Controller('/probe')
class ProbeController {
  @Inject(AppLifecycle)
  private readonly gLifecycle!: AppLifecycle;

  @Get('/ready')
  public ready(): Response {
    return new Response(this.gLifecycle.state, { status: this.gLifecycle.ready ? 200 : 503 });
  }
}

/**
 * Asks the OS for a port nothing listens on.
 */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(typeof address === 'object' && address ? address.port : 0));
    });
  });
}

describe('App lifecycle', () => {
  let app: App | null = null;

  const boot = async (shutdown?: ConfigTypes.ShutdownOptions, port?: number): Promise<App> => {
    app = await createApp({
      cfg: { requestLogging: false, server: { host: '127.0.0.1', port, static: undefined }, shutdown },
      configFile: false,
      setup: (instance) => {
        instance.container.bind(ProbeController);
      },
    });

    return app;
  };

  afterEach(async () => {
    await app?.close({ drainDelay: 0 }).catch(() => {});
    app = null;
    vi.useRealTimers();
  });

  it('should be starting until the start hooks have finished', async () => {
    const instance = await boot();
    const gate = Promise.withResolvers<void>();

    instance.onStart(() => gate.promise);

    expect(instance.state).toBe('starting');

    const started = instance.start();

    expect(instance.state).toBe('starting');
    expect((await instance.fetch(new Request('http://localhost/probe/ready'))).status).toBe(503);

    gate.resolve();
    await started;

    expect(instance.state).toBe('ready');
    expect((await instance.fetch(new Request('http://localhost/probe/ready'))).status).toBe(200);
  });

  it('should stay starting when a start hook fails', async () => {
    const instance = await boot();

    instance.onStart(() => {
      throw new Error('store unreachable');
    });

    await expect(instance.start()).rejects.toThrow('store unreachable');
    expect(instance.state).toBe('starting');
  });

  it('should be draining as soon as close() is called and closed once it finished', async () => {
    const instance = await boot();

    await instance.start();

    const closing = instance.close();

    expect(instance.state).toBe('draining');

    await closing;

    expect(instance.state).toBe('closed');
  });

  it('should be closed even when something failed to close', async () => {
    const instance = await boot();

    instance.onClose(() => {
      throw new Error('broker');
    });

    await expect(instance.close()).rejects.toThrow(AggregateError);
    expect(instance.state).toBe('closed');
  });

  it('should go straight to draining when closed before it started', async () => {
    const instance = await boot();
    const gate = Promise.withResolvers<void>();

    instance.onStart(() => gate.promise);

    const states: string[] = [];

    instance.container.get(AppLifecycle).onChange((state) => states.push(state));

    const started = instance.start();
    const closing = instance.close();

    expect(instance.state).toBe('draining');

    gate.resolve();
    await Promise.all([started, closing]);

    // a start finishing late does not make a closing application ready again
    expect(states).toEqual(['draining', 'closed']);
  });

  it('should keep serving during the drain delay and only then close the server', async () => {
    const port = await freePort();
    const instance = await boot({ drainDelay: 300 }, port);
    const url = `http://127.0.0.1:${port}/probe/ready`;
    const hook = vi.fn();

    await instance.listen();
    instance.onClose(hook);

    expect((await fetch(url)).status).toBe(200);

    const closing = instance.close();

    // still accepting connections, but no longer ready
    const draining = await fetch(url);

    expect(draining.status).toBe(503);
    expect(await draining.text()).toBe('draining');
    expect(hook).not.toHaveBeenCalled();

    await closing;

    expect(hook).toHaveBeenCalledOnce();
    await expect(fetch(url)).rejects.toThrow();
  });

  it('should take the drain delay from close() over the config', async () => {
    const port = await freePort();
    const instance = await boot({ drainDelay: 60_000 }, port);

    await instance.listen();

    const started = Date.now();

    await instance.close({ drainDelay: 0 });

    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('should not wait for the drain delay when the server never listened', async () => {
    const instance = await boot({ drainDelay: 60_000 });

    await instance.start();

    const started = Date.now();

    await instance.close();

    expect(Date.now() - started).toBeLessThan(5000);
    expect(instance.state).toBe('closed');
  });

  it('should drain once however many times close() is called', async () => {
    const port = await freePort();
    const instance = await boot({ drainDelay: 50 }, port);
    const hook = vi.fn();

    await instance.listen();
    instance.onClose(hook);

    const first = instance.close();

    expect(instance.close()).toBe(first);
    expect(instance.close({ drainDelay: 0 })).toBe(first);

    await first;

    expect(hook).toHaveBeenCalledOnce();
  });

  it('should tell listeners about every state change', async () => {
    const instance = await boot();
    const changes: string[] = [];

    instance.container.get(AppLifecycle).onChange((state, previous) => changes.push(`${previous}->${state}`));

    await instance.start();
    await instance.close();

    expect(changes).toEqual(['starting->ready', 'ready->draining', 'draining->closed']);
  });

  it('should expose the health registry on the app and in the container', async () => {
    const instance = await boot();

    expect(instance.health).toBe(instance.container.get(HealthRegistry));
    // modules that do not import core at runtime inject it by this key
    expect(instance.container.get(HEALTH_REGISTRY_KEY)).toBe(instance.health);
  });
});

describe('AppLifecycle', () => {
  it('should never move back to an earlier state', () => {
    const lifecycle = new AppLifecycle();

    expect(lifecycle.advance('draining')).toBe(true);
    expect(lifecycle.advance('ready')).toBe(false);
    expect(lifecycle.advance('draining')).toBe(false);
    expect(lifecycle.state).toBe('draining');
  });

  it('should keep going when a listener throws', () => {
    const lifecycle = new AppLifecycle();
    const second = vi.fn();

    lifecycle.onChange(() => {
      throw new Error('listener');
    });
    lifecycle.onChange(second);

    lifecycle.advance('ready');

    expect(second).toHaveBeenCalledWith('ready', 'starting');
  });
});
