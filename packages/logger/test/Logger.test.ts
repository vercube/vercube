import { describe, it, expect, beforeEach } from 'vitest';
import { Container } from '@vercube/di';
import { MockLogger } from './MockLogger';
import { Logger, type LoggerTypes } from '../src';

describe('Logger', () => {
  let container: Container;
  let logger: MockLogger;

  beforeEach(() => {
    container = new Container();
    container.bind(Logger, MockLogger);

    logger = container.get(Logger);
  });

  it('should be instantiable', () => {
    expect(logger).toBeInstanceOf(MockLogger);
  });

  it('should have all required methods', () => {
    expect(typeof logger.configure).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('should accept configuration options', () => {
    const options: LoggerTypes.Options = {
      logLevel: 'info',
      providers: [],
    };
    expect(() => logger.configure(options)).not.toThrow();
  });

  it('should accept arguments for all log levels', () => {
    const testArgs = ['test message', { data: 'test' }];
    expect(() => logger.debug(...testArgs)).not.toThrow();
    expect(() => logger.info(...testArgs)).not.toThrow();
    expect(() => logger.warn(...testArgs)).not.toThrow();
    expect(() => logger.error(...testArgs)).not.toThrow();
  });
}); 