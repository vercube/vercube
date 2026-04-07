import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EvlogProvider } from '../src/Drivers/EvlogProvider';
import type { LoggerTypes } from '@vercube/logger';

vi.mock('evlog', () => ({
  initLogger: vi.fn(),
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('EvlogProvider', () => {
  let provider: EvlogProvider;

  beforeEach(async () => {
    vi.clearAllMocks();
    provider = new EvlogProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialize', () => {
    it('should call initLogger without options', async () => {
      const { initLogger } = await import('evlog');
      provider.initialize();
      expect(initLogger).toHaveBeenCalledOnce();
    });

    it('should pass options to initLogger', async () => {
      const { initLogger } = await import('evlog');
      provider.initialize({ pretty: true, silent: true, enabled: false });
      expect(initLogger).toHaveBeenCalledWith(expect.objectContaining({ pretty: true, silent: true, enabled: false }));
    });
  });

  describe('processMessage', () => {
    it('should auto-initialize if not initialized', async () => {
      const { initLogger, log } = await import('evlog');
      const message: LoggerTypes.Message = { level: 'info', args: ['hello'] };
      provider.processMessage(message);
      expect(initLogger).toHaveBeenCalledOnce();
      expect(log.info).toHaveBeenCalled();
    });

    it('should not re-initialize after explicit initialize()', async () => {
      const { initLogger, log } = await import('evlog');
      provider.initialize();
      const message: LoggerTypes.Message = { level: 'debug', args: ['msg'] };
      provider.processMessage(message);
      expect(initLogger).toHaveBeenCalledOnce();
      expect(log.debug).toHaveBeenCalled();
    });

    it('should call log[level](tag, message) when tag + string arg', async () => {
      const { log } = await import('evlog');
      provider.initialize();
      const message: LoggerTypes.Message = { level: 'info', args: ['hello'], tag: 'my-tag' };
      provider.processMessage(message);
      expect(log.info).toHaveBeenCalledWith('my-tag', 'hello');
    });

    it('should call log[level](event) for single object arg', async () => {
      const { log } = await import('evlog');
      provider.initialize();
      const event = { userId: 123, action: 'login' };
      const message: LoggerTypes.Message = { level: 'warn', args: [event] };
      provider.processMessage(message);
      expect(log.warn).toHaveBeenCalledWith(event);
    });

    it('should call log[level](tag, message) for two string args', async () => {
      const { log } = await import('evlog');
      provider.initialize();
      const message: LoggerTypes.Message = { level: 'error', args: ['my-tag', 'something failed'] };
      provider.processMessage(message);
      expect(log.error).toHaveBeenCalledWith('my-tag', 'something failed');
    });

    it('should build event object for Error args', async () => {
      const { log } = await import('evlog');
      provider.initialize();
      const err = new Error('boom');
      const message: LoggerTypes.Message = { level: 'error', args: [err] };
      provider.processMessage(message);
      expect(log.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ message: 'boom', name: 'Error' }) }),
      );
    });

    it('should merge multiple object args into event', async () => {
      const { log } = await import('evlog');
      provider.initialize();
      const message: LoggerTypes.Message = { level: 'info', args: [{ a: 1 }, { b: 2 }] };
      provider.processMessage(message);
      expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ a: 1, b: 2 }));
    });

    it('should use two-string shorthand for two string args without tag', async () => {
      // args=['foo', 'bar'] hits the log[level](tag, msg) branch
      const { log } = await import('evlog');
      provider.initialize();
      const message: LoggerTypes.Message = { level: 'debug', args: ['foo', 'bar'] };
      provider.processMessage(message);
      expect(log.debug).toHaveBeenCalledWith('foo', 'bar');
    });

    it('should build event object for mixed primitive args (fallback path)', async () => {
      const { log } = await import('evlog');
      provider.initialize();
      // three args falls through to the fallback path
      const message: LoggerTypes.Message = { level: 'debug', args: ['foo', 'bar', 42] };
      provider.processMessage(message);
      expect(log.debug).toHaveBeenCalledWith(expect.objectContaining({ message: 'foo bar 42' }));
    });

    it('should use tag+message shorthand when tag is set and first arg is a string', async () => {
      // tag + string arg hits the log[level](tag, message) branch
      const { log } = await import('evlog');
      provider.initialize();
      const message: LoggerTypes.Message = { level: 'info', args: ['some text'], tag: 'svc' };
      provider.processMessage(message);
      expect(log.info).toHaveBeenCalledWith('svc', 'some text');
    });

    it('should include pid, type and timestamp in fallback event', async () => {
      const { log } = await import('evlog');
      provider.initialize();
      const ts = Date.now();
      const message: LoggerTypes.Message = {
        level: 'info',
        // no tag → fallback path; multiple mixed args → fallback
        args: ['some text', 42],
        pid: 999,
        type: 'access_log',
        timestamp: ts,
      };
      provider.processMessage(message);
      expect(log.info).toHaveBeenCalledWith(
        expect.objectContaining({
          pid: 999,
          type: 'access_log',
          timestamp: new Date(ts).toISOString(),
          message: 'some text 42',
        }),
      );
    });
  });
});
