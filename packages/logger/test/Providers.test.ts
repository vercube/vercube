import { Container } from '@vercube/di';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoggerTypes } from '../src/Types/LoggerTypes';
import { ConsoleProvider } from '../src/Drivers/ConsoleProvider';
import { JSONProvider } from '../src/Drivers/JsonProvider';

describe('Providers', () => {
  describe('ConsoleProvider', () => {
    let provider: ConsoleProvider;
    let container: Container;
    const consoleSpy = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    beforeEach(() => {
      container = new Container();
      provider = container.resolve(ConsoleProvider);

      vi.spyOn(console, 'debug').mockImplementation(consoleSpy.debug);
      vi.spyOn(console, 'info').mockImplementation(consoleSpy.info);
      vi.spyOn(console, 'warn').mockImplementation(consoleSpy.warn);
      vi.spyOn(console, 'error').mockImplementation(consoleSpy.error);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should initialize without options', () => {
      expect(() => provider.initialize()).not.toThrow();
    });

    it('should process debug message', () => {
      const message: LoggerTypes.Message = {
        level: 'debug',
        args: ['test message'],
      };
      provider.processMessage(message);
      expect(consoleSpy.debug).toHaveBeenCalled();
    });

    it('should process info message with tag', () => {
      const message: LoggerTypes.Message = {
        level: 'info',
        args: ['test message'],
        tag: 'test-tag',
      };
      provider.processMessage(message);
      expect(consoleSpy.info).toHaveBeenCalled();
    });

    it('should process warn message with timestamp', () => {
      const timestamp = Date.now();
      const message: LoggerTypes.Message = {
        level: 'warn',
        args: ['test message'],
        timestamp,
      };
      provider.processMessage(message);
      expect(consoleSpy.warn).toHaveBeenCalled();
    });

    it('should process error message with all properties', () => {
      const message: LoggerTypes.Message = {
        level: 'error',
        args: ['test message'],
        tag: 'test-tag',
        pid: 12_345,
        type: 'application_log',
        timestamp: Date.now(),
      };
      provider.processMessage(message);
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });

  describe('JSONProvider', () => {
    let provider: JSONProvider;
    const consoleSpy = {
      log: vi.fn(),
    };

    beforeEach(() => {
      provider = new JSONProvider();
      vi.spyOn(console, 'log').mockImplementation(consoleSpy.log);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should initialize without options', () => {
      expect(() => provider.initialize()).not.toThrow();
    });

    it('should process message with default type', () => {
      const message: LoggerTypes.Message = {
        level: 'info',
        args: ['test message'],
      };
      provider.processMessage(message);
      expect(consoleSpy.log).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'application_log',
          level: 'info',
          args: ['test message'],
        }),
      );
    });

    it('should process message with custom type', () => {
      const message: LoggerTypes.Message = {
        level: 'info',
        args: ['test message'],
        type: 'access_log',
      };
      provider.processMessage(message);
      expect(consoleSpy.log).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'access_log',
          level: 'info',
          args: ['test message'],
        }),
      );
    });

    it('should process message with all properties', () => {
      const timestamp = Date.now();
      const message: LoggerTypes.Message = {
        level: 'info',
        args: ['test message'],
        tag: 'test-tag',
        pid: 12_345,
        type: 'application_log',
        timestamp,
      };
      provider.processMessage(message);
      expect(consoleSpy.log).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'application_log',
          level: 'info',
          args: ['test message'],
          tag: 'test-tag',
          pid: 12_345,
          timestamp,
        }),
      );
    });
  });
});
