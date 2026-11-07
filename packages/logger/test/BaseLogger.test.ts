import { beforeEach, describe, expect, it, vi } from 'vitest';

const { log, initLogger } = vi.hoisted(() => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  initLogger: vi.fn(),
}));

vi.mock('evlog', () => ({ log, initLogger }));

const { BaseLogger } = await import('../src/Service/BaseLogger');

describe('BaseLogger', () => {
  let logger: InstanceType<typeof BaseLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = new BaseLogger();
  });

  describe('configure', () => {
    it('maps logLevel to evlog minLevel and passes options through', () => {
      logger.configure({ logLevel: 'warn', pretty: true, silent: true });
      expect(initLogger).toHaveBeenCalledWith(expect.objectContaining({ minLevel: 'warn', pretty: true, silent: true }));
    });

    it('prefers logLevel over minLevel', () => {
      logger.configure({ logLevel: 'error', minLevel: 'debug' });
      expect(initLogger).toHaveBeenCalledWith(expect.objectContaining({ minLevel: 'error' }));
    });

    it('works with empty options', () => {
      expect(() => logger.configure({})).not.toThrow();
      expect(initLogger).toHaveBeenCalledTimes(1);
    });
  });

  describe('log methods', () => {
    it('forwards (tag, message) using the native tagged form', () => {
      logger.info('Auth', 'logged in');
      expect(log.info).toHaveBeenCalledWith('Auth', 'logged in');
    });

    it('treats a lone string as a message event', () => {
      logger.warn('something happened');
      expect(log.warn).toHaveBeenCalledWith({ message: 'something happened' });
    });

    it('captures Error objects under the error field', () => {
      logger.error(new Error('boom'));
      const arg = log.error.mock.calls[0][0];
      expect(arg.error).toMatchObject({ name: 'Error', message: 'boom' });
      expect(arg.error.stack).toBeDefined();
    });

    it('keeps every Error argument, cause and custom fields', () => {
      const wrapped = Object.assign(new Error('publish failed', { cause: new Error('connection refused') }), {
        operation: 'publish',
      });
      logger.error('Failed to schedule retry', wrapped, new Error('original'));
      const arg = log.error.mock.calls[0][0];
      expect(arg.error).toMatchObject({
        message: 'publish failed',
        operation: 'publish',
        cause: { message: 'connection refused' },
      });
      expect(arg.errors.map((e: { message: string }) => e.message)).toEqual(['publish failed', 'original']);
    });

    it('does not set errors for a single Error and survives cause cycles', () => {
      const a = new Error('a');
      const b = new Error('b', { cause: a });
      (a as { cause?: unknown }).cause = b;
      logger.error(a);
      const arg = log.error.mock.calls[0][0];
      expect(arg.errors).toBeUndefined();
      expect(arg.error.cause.cause).toEqual({ name: 'Error', message: 'a' });
    });

    it('keeps non-Error causes and caps cause depth', () => {
      logger.error(new Error('x', { cause: 'plain' }));
      expect(log.error.mock.calls[0][0].error.cause).toBe('plain');

      let deep: Error = new Error('e0');
      for (let i = 1; i < 10; i++) deep = new Error(`e${i}`, { cause: deep });
      logger.error(deep);
      let node = log.error.mock.calls[1][0].error;
      let levels = 0;
      while (node.cause) {
        node = node.cause;
        levels++;
      }
      expect(levels).toBe(5);
      expect(node.stack).toBeUndefined();
    });

    it('merges a tag with an Error', () => {
      logger.error('Storage::init', new Error('disk'));
      const arg = log.error.mock.calls[0][0];
      expect(arg.message).toBe('Storage::init');
      expect(arg.error.message).toBe('disk');
    });

    it('merges object fields into the event', () => {
      logger.info('Ctx', { userId: 1 });
      expect(log.info.mock.calls[0][0]).toMatchObject({ message: 'Ctx', userId: 1 });
    });

    it('keeps tag and message separate when both are present alongside fields', () => {
      logger.error('WS::init', 'failed', { code: 1 });
      expect(log.error.mock.calls[0][0]).toMatchObject({ tag: 'WS::init', message: 'failed', code: 1 });
    });

    it('routes each level to the matching evlog method', () => {
      logger.debug('a', 'b');
      logger.info('c', 'd');
      logger.warn('e', 'f');
      logger.error('g', 'h');
      expect(log.debug).toHaveBeenCalledOnce();
      expect(log.info).toHaveBeenCalledOnce();
      expect(log.warn).toHaveBeenCalledOnce();
      expect(log.error).toHaveBeenCalledOnce();
    });
  });

  describe('wide-event context', () => {
    it('set/getContext accumulate context', () => {
      logger.set({ a: 1 });
      logger.set({ b: 2 });
      expect(logger.getContext()).toEqual({ a: 1, b: 2 });
    });

    it('getContext returns a copy (not a live reference)', () => {
      logger.set({ a: 1 });
      const ctx = logger.getContext();
      ctx.a = 999;
      expect(logger.getContext()).toEqual({ a: 1 });
    });

    it('merges accumulated context into every event', () => {
      logger.set({ requestId: 'x' });
      logger.info('hello');
      expect(log.info.mock.calls[0][0]).toMatchObject({ requestId: 'x', message: 'hello' });
    });

    it('child inherits parent context plus extra context', () => {
      logger.set({ a: 1 });
      const child = logger.child({ b: 2 });
      expect(child.getContext()).toEqual({ a: 1, b: 2 });
    });

    it('child context is isolated from the parent', () => {
      logger.set({ a: 1 });
      const child = logger.child({ b: 2 });
      child.set({ c: 3 });
      expect(logger.getContext()).toEqual({ a: 1 });
    });

    it('emit flushes accumulated context and resets it', () => {
      logger.set({ a: 1 });
      logger.emit({ done: true });
      expect(log.info).toHaveBeenCalledWith({ a: 1, done: true });
      expect(logger.getContext()).toEqual({});
    });

    it('emit is a no-op when there is nothing to emit', () => {
      logger.emit();
      expect(log.info).not.toHaveBeenCalled();
    });
  });
});
