import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { initLogger, drainPlugin } = vi.hoisted(() => ({
  initLogger: vi.fn(),
  drainPlugin: vi.fn((name: string, drain: unknown) => ({ name, drain })),
}));

vi.mock('evlog', () => ({ log: {}, initLogger, drainPlugin }));

const { BaseLogger } = await import('../src/Service/BaseLogger');

/**
 * The options of the last `initLogger` call.
 *
 * @returns The options
 */
function lastConfig(): { silent?: boolean; pretty?: boolean; plugins: { name: string; drain: Function }[] } {
  return initLogger.mock.calls.at(-1)![0];
}

describe('BaseLogger output buffering', () => {
  let logger: InstanceType<typeof BaseLogger>;
  let stdout: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    logger = new BaseLogger();
  });

  afterEach(() => {
    logger.bufferOutput(false);
    vi.restoreAllMocks();
  });

  it('leaves the output to evlog until buffering is asked for', () => {
    logger.configure({ pretty: false });

    expect(lastConfig().silent).toBeUndefined();
    expect(lastConfig().plugins).toEqual([]);
  });

  it('takes over structured output once buffering is on', async () => {
    logger.configure({ pretty: false, plugins: [{ name: 'mine' }] });
    logger.bufferOutput();

    const config = lastConfig();

    expect(config.silent).toBe(true);
    // last, so every other plugin has seen the event
    expect(config.plugins.map((plugin) => plugin.name)).toEqual(['mine', 'vercube:buffered-output']);

    config.plugins[1].drain({ event: { level: 'info', message: 'hello' } });
    config.plugins[1].drain({ event: { level: 'info', message: 'again' } });

    expect(stdout).not.toHaveBeenCalled();

    await new Promise((done) => setImmediate(done));

    expect(stdout).toHaveBeenCalledTimes(1);
    expect(stdout).toHaveBeenCalledWith('{"level":"info","message":"hello"}\n{"level":"info","message":"again"}\n');
  });

  it('writes what it holds on flush', () => {
    logger.configure({ pretty: false });
    logger.bufferOutput();

    lastConfig().plugins[0].drain({ event: { level: 'info', message: 'held' } });
    logger.flush();

    expect(stdout).toHaveBeenCalledWith('{"level":"info","message":"held"}\n');
  });

  it('keeps buffering when the logger is configured again or gets a plugin', () => {
    logger.configure({ pretty: false });
    logger.bufferOutput();
    logger.configure({ pretty: false, logLevel: 'warn' });
    logger.addPlugin({ name: 'late' });

    expect(lastConfig().silent).toBe(true);
    expect(lastConfig().plugins.map((plugin) => plugin.name)).toEqual(['late', 'vercube:buffered-output']);
  });

  it.each([
    ['pretty output', { pretty: true }],
    ['silent output', { pretty: false, silent: true }],
    ['unstringified output', { pretty: false, stringify: false }],
    ['a disabled logger', { pretty: false, enabled: false }],
    ['buffered: false', { pretty: false, buffered: false }],
  ])('does not take over %s', (_name, options) => {
    logger.configure(options);
    logger.bufferOutput();

    expect(lastConfig().plugins).toEqual([]);
    expect(lastConfig()).not.toHaveProperty('buffered');
  });

  it('follows NODE_ENV like evlog does when pretty is not set', () => {
    const before = process.env.NODE_ENV;

    try {
      process.env.NODE_ENV = 'production';
      logger.configure({});
      logger.bufferOutput();
      expect(lastConfig().silent).toBe(true);

      process.env.NODE_ENV = 'development';
      logger.configure({});
      expect(lastConfig().plugins).toEqual([]);
    } finally {
      process.env.NODE_ENV = before;
    }
  });

  it('goes back to one write per event when buffering is switched off', () => {
    logger.configure({ pretty: false });
    logger.bufferOutput();
    lastConfig().plugins[0].drain({ event: { level: 'info', message: 'held' } });

    logger.bufferOutput(false);

    expect(stdout).toHaveBeenCalledWith('{"level":"info","message":"held"}\n');
    expect(lastConfig().silent).toBeUndefined();
    expect(lastConfig().plugins).toEqual([]);
  });
});
