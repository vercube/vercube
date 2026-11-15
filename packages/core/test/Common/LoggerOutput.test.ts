import { Logger } from '@vercube/logger';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src';
import { createContainer } from '../../src/Common/Container';
import type { App } from '../../src';

/**
 * Replaces the logger of an application with one that records what the server asks of it.
 *
 * @param {App} app - The application
 * @returns The recording logger
 */
function spyLogger(app: App): { bufferOutput: ReturnType<typeof vi.fn>; flush: ReturnType<typeof vi.fn> } {
  const logger = { bufferOutput: vi.fn(), flush: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

  app.container.bindMock(Logger, logger);

  return logger;
}

describe('logger output', () => {
  let app: App | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('is buffered once the server listens, and flushed when it closes', async () => {
    app = await createApp({
      cfg: { requestLogging: false, server: { host: '127.0.0.1', port: 0 }, c12: { dotenv: false } } as never,
    });

    const logger = spyLogger(app);

    expect(logger.bufferOutput).not.toHaveBeenCalled();

    await app.listen();

    expect(logger.bufferOutput).toHaveBeenCalledTimes(1);
    expect(logger.flush).not.toHaveBeenCalled();

    await app.close();
    app = undefined;

    expect(logger.flush).toHaveBeenCalled();
  });

  it('is left alone for an application driven through fetch()', async () => {
    app = await createApp({ cfg: { requestLogging: false, c12: { dotenv: false } } as never });

    const logger = spyLogger(app);

    await app.fetch(new Request('http://localhost/nope'));

    expect(logger.bufferOutput).not.toHaveBeenCalled();
  });

  it.each([
    [{ production: true, dev: true }, false],
    [{ production: false, dev: true }, true],
    [{ dev: false }, false],
    [{}, undefined],
  ])('takes pretty-printing from the application mode: %j', (mode, pretty) => {
    const container = createContainer({ requestLogging: false, ...mode } as never);
    const options = (container.get(Logger) as unknown as { fOptions: { pretty?: boolean } }).fOptions;

    expect(options.pretty).toBe(pretty);
  });
});
