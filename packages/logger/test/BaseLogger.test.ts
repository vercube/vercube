import { Container } from '@vercube/di';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseLogger, Logger } from '../src';
import { ConsoleProvider } from '../src/Drivers/ConsoleProvider';
import { JSONProvider } from '../src/Drivers/JsonProvider';
import type { LoggerTypes } from '../src';

describe('BaseLogger', () => {
  let logger: Logger;
  let container: Container;

  beforeEach(() => {
    container = new Container();
    container.bindInstance(Container, container);

    // bind logger
    container.bind(Logger, BaseLogger);
    container.bind(ConsoleProvider);
    container.bind(JSONProvider);

    logger = container.get(Logger);
  });

  it('should configure with default options', () => {
    logger.configure({});
    // @ts-ignore - accessing private property for testing
    expect(logger.fLogLevel).toBe('debug');
    // @ts-ignore - accessing private property for testing
    expect(logger.fProviders.size).toBe(0);
  });

  it('should configure with custom log level', () => {
    logger.configure({ logLevel: 'info' });
    // @ts-ignore - accessing private property for testing
    expect(logger.fLogLevel).toBe('info');
  });

  it('should configure with providers', () => {
    const options: LoggerTypes.Options = {
      logLevel: 'info',
      providers: [
        {
          name: 'console',
          provider: ConsoleProvider,
          logLevel: 'debug',
        },
        {
          name: 'json',
          provider: JSONProvider,
          logLevel: 'info',
        },
      ],
    };
    logger.configure(options);
    // @ts-ignore - accessing private property for testing
    expect(logger.fProviders.size).toBe(2);
    // @ts-ignore - accessing private property for testing
    expect(logger.fProvidersLevel.get('console')).toBe('debug');
    // @ts-ignore - accessing private property for testing
    expect(logger.fProvidersLevel.get('json')).toBe('info');
  });

  it('should handle provider initialization errors', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const options: LoggerTypes.Options = {
      providers: [
        {
          name: 'invalid',
          provider: class InvalidProvider {},
        },
      ],
    };
    logger.configure(options);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('should log messages through configured providers', () => {
    const consoleSpy = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    vi.spyOn(console, 'debug').mockImplementation(consoleSpy.debug);
    vi.spyOn(console, 'info').mockImplementation(consoleSpy.info);
    vi.spyOn(console, 'warn').mockImplementation(consoleSpy.warn);
    vi.spyOn(console, 'error').mockImplementation(consoleSpy.error);

    logger.configure({
      providers: [
        {
          name: 'console',
          provider: ConsoleProvider,
          logLevel: 'debug',
        },
      ],
    });

    logger.debug('debug message');
    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');

    expect(consoleSpy.debug).toHaveBeenCalled();
    expect(consoleSpy.info).toHaveBeenCalled();
    expect(consoleSpy.warn).toHaveBeenCalled();
    expect(consoleSpy.error).toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('should respect provider log levels', () => {
    const consoleSpy = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    vi.spyOn(console, 'debug').mockImplementation(consoleSpy.debug);
    vi.spyOn(console, 'info').mockImplementation(consoleSpy.info);
    vi.spyOn(console, 'warn').mockImplementation(consoleSpy.warn);
    vi.spyOn(console, 'error').mockImplementation(consoleSpy.error);

    logger.configure({
      providers: [
        {
          name: 'console',
          provider: ConsoleProvider,
          logLevel: 'info',
        },
      ],
    });

    logger.debug('debug message');
    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');

    expect(consoleSpy.debug).not.toHaveBeenCalled();
    expect(consoleSpy.info).toHaveBeenCalled();
    expect(consoleSpy.warn).toHaveBeenCalled();
    expect(consoleSpy.error).toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('should handle multiple providers with different log levels', () => {
    const consoleSpy = vi.fn();
    const jsonSpy = vi.fn();
    vi.spyOn(console, 'debug').mockImplementation(consoleSpy);
    vi.spyOn(console, 'log').mockImplementation(jsonSpy);

    logger.configure({
      providers: [
        {
          name: 'console',
          provider: ConsoleProvider,
          logLevel: 'debug',
        },
        {
          name: 'json',
          provider: JSONProvider,
          logLevel: 'error',
        },
      ],
    });

    logger.debug('test message');
    expect(consoleSpy).toHaveBeenCalled();
    expect(jsonSpy).not.toHaveBeenCalled();

    logger.error('error message');
    expect(jsonSpy).toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('should handle provider options', () => {
    const options: LoggerTypes.Options = {
      providers: [
        {
          name: 'console',
          provider: ConsoleProvider,
          options: {
            logLevel: 'debug',
          },
        },
      ],
    };
    expect(() => logger.configure(options)).not.toThrow();
  });

  it('should handle reconfiguration', () => {
    logger.configure({
      providers: [
        {
          name: 'console',
          provider: ConsoleProvider,
        },
      ],
    });

    // @ts-ignore - accessing private property for testing
    const initialSize = logger.fProviders.size;

    logger.configure({
      providers: [
        {
          name: 'json',
          provider: JSONProvider,
        },
      ],
    });

    // @ts-ignore - accessing private property for testing
    expect(logger.fProviders.size).toBe(1);
    expect(initialSize).toBe(1);
  });

  it('should handle messages with additional properties', () => {
    const consoleSpy = vi.fn();
    vi.spyOn(console, 'info').mockImplementation(consoleSpy);

    logger.configure({
      providers: [
        {
          name: 'console',
          provider: ConsoleProvider,
        },
      ],
    });

    const timestamp = Date.now();
    const pid = process.pid;
    const tag = 'test-tag';
    const type = 'application_log';

    logger.info('test message', { timestamp, pid, tag, type });
    expect(consoleSpy).toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('should handle undefined provider options', () => {
    const options: LoggerTypes.Options = {
      providers: [
        {
          name: 'console',
          provider: ConsoleProvider,
          options: undefined,
        },
      ],
    };
    expect(() => logger.configure(options)).not.toThrow();
  });

  it('should handle undefined providers array', () => {
    const options: LoggerTypes.Options = {
      logLevel: 'info',
      providers: undefined,
    };
    expect(() => logger.configure(options)).not.toThrow();
  });

  it('should handle empty providers array', () => {
    const options: LoggerTypes.Options = {
      logLevel: 'info',
      providers: [],
    };
    expect(() => logger.configure(options)).not.toThrow();
  });

  it('should handle async provider initialization', async () => {
    class AsyncProvider extends ConsoleProvider {
      public async initialize(): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    container.bind(AsyncProvider);
    const options: LoggerTypes.Options = {
      providers: [
        {
          name: 'async',
          provider: AsyncProvider,
        },
      ],
    };
    expect(() => logger.configure(options)).not.toThrow();
  });

  it('should handle provider initialization with options', () => {
    class OptionsProvider extends ConsoleProvider {
      public initialize(options?: { logLevel?: LoggerTypes.Level }): void {
        expect(options?.logLevel).toBe('debug');
      }
    }

    container.bind(OptionsProvider);
    const options: LoggerTypes.Options = {
      providers: [
        {
          name: 'options',
          provider: OptionsProvider,
          options: { logLevel: 'debug' },
        },
      ],
    };
    expect(() => logger.configure(options)).not.toThrow();
  });

  it('should handle provider without logLevel using global logLevel', () => {
    const consoleSpy = vi.fn();
    vi.spyOn(console, 'debug').mockImplementation(consoleSpy);

    logger.configure({
      logLevel: 'debug',
      providers: [
        {
          name: 'console',
          provider: ConsoleProvider,
        },
      ],
    });

    logger.debug('test message');
    expect(consoleSpy).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('should handle provider without logLevel and no global logLevel', () => {
    const consoleSpy = vi.fn();
    vi.spyOn(console, 'debug').mockImplementation(consoleSpy);

    logger.configure({
      providers: [
        {
          name: 'console',
          provider: ConsoleProvider,
        },
      ],
    });

    logger.debug('test message');
    expect(consoleSpy).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('should handle provider with undefined logLevel', () => {
    const consoleSpy = vi.fn();
    vi.spyOn(console, 'debug').mockImplementation(consoleSpy);

    logger.configure({
      logLevel: 'info',
      providers: [
        {
          name: 'console',
          provider: ConsoleProvider,
          logLevel: undefined,
        },
      ],
    });

    logger.debug('test message');
    expect(consoleSpy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  describe('setContext / getContext / runInContext', () => {
    it('should return empty context outside runInContext', () => {
      expect(logger.getContext()).toEqual({});
    });

    it('should silently no-op setContext outside runInContext', () => {
      expect(() => logger.setContext('key', 'value')).not.toThrow();
      expect(logger.getContext()).toEqual({});
    });

    it('should store and retrieve context inside runInContext', async () => {
      await logger.runInContext(async () => {
        logger.setContext('userId', 42);
        logger.setContext('action', 'login');
        expect(logger.getContext()).toEqual({ userId: 42, action: 'login' });
      });
    });

    it('should clean up context after runInContext completes', async () => {
      await logger.runInContext(async () => {
        logger.setContext('userId', 42);
      });
      expect(logger.getContext()).toEqual({});
    });

    it('should include context in messages sent to providers', async () => {
      const processMessageSpy = vi.fn();
      class SpyProvider {
        public initialize(): void {}
        public processMessage(msg: LoggerTypes.Message): void {
          processMessageSpy(msg);
        }
      }
      container.bind(SpyProvider);

      logger.configure({
        providers: [{ name: 'spy', provider: SpyProvider }],
      });

      await logger.runInContext(async () => {
        logger.setContext('requestId', 'abc-123');
        logger.info('hello');
      });

      expect(processMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          args: ['hello'],
          context: { requestId: 'abc-123' },
        }),
      );
    });

    it('should not include context in messages outside runInContext', () => {
      const processMessageSpy = vi.fn();
      class SpyProvider {
        public initialize(): void {}
        public processMessage(msg: LoggerTypes.Message): void {
          processMessageSpy(msg);
        }
      }
      container.bind(SpyProvider);

      logger.configure({
        providers: [{ name: 'spy', provider: SpyProvider }],
      });

      logger.info('no context');

      expect(processMessageSpy).toHaveBeenCalledWith(expect.objectContaining({ level: 'info', args: ['no context'] }));
      expect(processMessageSpy.mock.calls[0][0].context).toBeUndefined();
    });

    it('should isolate context between concurrent runInContext calls', async () => {
      const contexts: Record<string, unknown>[] = [];

      const processMessageSpy = vi.fn((msg: LoggerTypes.Message) => {
        if (msg.context) contexts.push(msg.context);
      });
      class SpyProvider {
        public initialize(): void {}
        public processMessage(msg: LoggerTypes.Message): void {
          processMessageSpy(msg);
        }
      }
      container.bind(SpyProvider);

      logger.configure({
        providers: [{ name: 'spy', provider: SpyProvider }],
      });

      await Promise.all([
        logger.runInContext(async () => {
          logger.setContext('req', 'A');
          await new Promise((r) => setTimeout(r, 10));
          logger.info('from A');
        }),
        logger.runInContext(async () => {
          logger.setContext('req', 'B');
          logger.info('from B');
        }),
      ]);

      expect(contexts).toContainEqual({ req: 'A' });
      expect(contexts).toContainEqual({ req: 'B' });
    });
  });
});
