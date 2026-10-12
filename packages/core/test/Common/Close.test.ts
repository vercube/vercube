import { createServer } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Controller, createApp, Get, ShutdownRegistry } from '../../src';
import type { App } from '../../src';

let release: (() => void) | null = null;

@Controller('/close')
class SlowController {
  @Get('/slow')
  public async slow(): Promise<string> {
    await new Promise<void>((resolve) => {
      release = resolve;
    });

    return 'done';
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

/**
 * Waits until the slow handler is entered.
 */
async function waitForHandler(): Promise<void> {
  await vi.waitFor(() => {
    if (!release) {
      throw new Error('handler not entered yet');
    }
  });
}

describe('App.close', () => {
  let app: App | null = null;

  const start = async (shutdown?: { handleSignals?: boolean | string[]; timeout?: number }): Promise<string> => {
    const port = await freePort();

    app = await createApp({
      cfg: { requestLogging: false, server: { host: '127.0.0.1', port, static: undefined }, shutdown },
      setup: (instance) => {
        instance.container.bind(SlowController);
      },
    });

    await app.listen();

    return `http://127.0.0.1:${port}`;
  };

  afterEach(async () => {
    release?.();
    release = null;

    await app?.close().catch(() => {});
    app = null;

    vi.restoreAllMocks();
  });

  it('should run the hooks last registered first', async () => {
    await start();

    const order: string[] = [];

    app!.onClose(() => {
      order.push('first');
    });
    app!.onClose(async () => {
      await Promise.resolve();
      order.push('second');
    });

    await app!.close();

    expect(order).toEqual(['second', 'first']);
  });

  it('should not run a hook that was removed', async () => {
    await start();

    const hook = vi.fn();
    const remove = app!.onClose(hook);

    remove();
    await app!.close();

    expect(hook).not.toHaveBeenCalled();
  });

  it('should let a request in flight finish before running the hooks', async () => {
    const url = await start();
    const events: string[] = [];

    app!.onClose(() => {
      events.push('hook');
    });

    const response = fetch(`${url}/close/slow`).then(async (res) => {
      events.push(`response ${await res.text()}`);
    });

    await waitForHandler();

    const closing = app!.close();

    release!();

    await Promise.all([closing, response]);

    expect(events).toEqual(['response "done"', 'hook']);
  });

  it('should stop accepting connections', async () => {
    const url = await start();

    await app!.close();

    await expect(fetch(`${url}/close/slow`)).rejects.toThrow();
  });

  it('should close the connections still open once the timeout elapses', async () => {
    const url = await start({ timeout: 50 });
    const hook = vi.fn();

    app!.onClose(hook);

    const response = fetch(`${url}/close/slow`);

    await waitForHandler();
    await app!.close();

    await expect(response).rejects.toThrow();
    expect(hook).toHaveBeenCalledOnce();
  });

  it('should close once however many times it is called', async () => {
    await start();

    const hook = vi.fn();

    app!.onClose(hook);

    const first = app!.close();

    expect(app!.close()).toBe(first);

    await first;

    expect(hook).toHaveBeenCalledOnce();
  });

  it('should run every hook and report every failure', async () => {
    await start();

    const hook = vi.fn();

    app!.onClose(hook);
    app!.onClose(() => {
      throw new Error('first');
    });
    app!.onClose(() => Promise.reject(new Error('second')));

    const error = await app!.close().catch((error_: unknown) => error_);

    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors.map((e: Error) => e.message)).toEqual(['second', 'first']);
    expect(hook).toHaveBeenCalledOnce();
  });

  it('should run the hooks of an application that never listened', async () => {
    app = await createApp({ cfg: { requestLogging: false, server: { static: undefined } } });

    const hook = vi.fn();

    app.onClose(hook);
    await app.close();

    expect(hook).toHaveBeenCalledOnce();
  });

  it('should expose the hooks through the container', async () => {
    await start();

    const hook = vi.fn();

    app!.container.get(ShutdownRegistry).register(hook);
    await app!.close();

    expect(hook).toHaveBeenCalledOnce();
  });

  describe('signals', () => {
    it('should not listen to signals by default', async () => {
      const before = process.listenerCount('SIGTERM');

      await start();

      expect(process.listenerCount('SIGTERM')).toBe(before);
    });

    it('should close and exit on a signal', async () => {
      const exit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

      await start({ handleSignals: ['SIGUSR2'] });

      const hook = vi.fn();

      app!.onClose(hook);
      process.emit('SIGUSR2');

      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
      expect(hook).toHaveBeenCalledOnce();
      expect(process.listenerCount('SIGUSR2')).toBe(0);
    });

    it('should exit with code 1 when something fails to close', async () => {
      const exit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

      await start({ handleSignals: ['SIGUSR2'] });

      app!.onClose(() => {
        throw new Error('boom');
      });
      process.emit('SIGUSR2');

      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
    });

    it('should exit right away on a second signal', async () => {
      const exit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

      await start({ handleSignals: ['SIGUSR2'] });

      app!.onClose(() => new Promise(() => {}));
      process.emit('SIGUSR2');
      process.emit('SIGUSR2');

      expect(exit).toHaveBeenCalledWith(1);
      expect(exit).not.toHaveBeenCalledWith(0);

      // the hook never settles, drop the listener the close would have removed
      process.removeAllListeners('SIGUSR2');
      app = null;
    });
  });
});
