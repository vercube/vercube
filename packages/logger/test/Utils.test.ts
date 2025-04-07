import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isLogLevelEnabled, colors, LOG_LEVEL_COLORS } from '../src/Utils/Utils';

describe('Logger Utils', () => {
  describe('isLogLevelEnabled', () => {
    it('should allow debug when current level is debug', () => {
      expect(isLogLevelEnabled('debug', 'debug')).toBe(true);
    });

    it('should allow info when current level is debug', () => {
      expect(isLogLevelEnabled('info', 'debug')).toBe(true);
    });

    it('should allow warn when current level is debug', () => {
      expect(isLogLevelEnabled('warn', 'debug')).toBe(true);
    });

    it('should allow error when current level is debug', () => {
      expect(isLogLevelEnabled('error', 'debug')).toBe(true);
    });

    it('should not allow debug when current level is info', () => {
      expect(isLogLevelEnabled('debug', 'info')).toBe(false);
    });

    it('should allow info when current level is info', () => {
      expect(isLogLevelEnabled('info', 'info')).toBe(true);
    });

    it('should allow warn when current level is info', () => {
      expect(isLogLevelEnabled('warn', 'info')).toBe(true);
    });

    it('should allow error when current level is info', () => {
      expect(isLogLevelEnabled('error', 'info')).toBe(true);
    });
  });

  describe('colors', () => {
    const originalEnv = process.env.NO_COLOR;

    beforeEach(() => {
      delete process.env.NO_COLOR;
    });

    afterEach(() => {
      process.env.NO_COLOR = originalEnv;
    });

    it('should apply colors when NO_COLOR is not set', () => {
      expect(colors.bold('test')).toBe('\u001B[1mtest\u001B[0m');
      expect(colors.green('test')).toBe('\u001B[32mtest\u001B[39m');
      expect(colors.yellow('test')).toBe('\u001B[33mtest\u001B[39m');
      expect(colors.red('test')).toBe('\u001B[31mtest\u001B[39m');
      expect(colors.magentaBright('test')).toBe('\u001B[95mtest\u001B[39m');
      expect(colors.cyanBright('test')).toBe('\u001B[96mtest\u001B[39m');
    });

    it('should not apply colors when NO_COLOR is set', () => {
      process.env.NO_COLOR = '1';
      expect(colors.bold('test')).toBe('test');
      expect(colors.green('test')).toBe('test');
      expect(colors.yellow('test')).toBe('test');
      expect(colors.red('test')).toBe('test');
      expect(colors.magentaBright('test')).toBe('test');
      expect(colors.cyanBright('test')).toBe('test');
    });
  });

  describe('LOG_LEVEL_COLORS', () => {
    it('should have correct color functions for each log level', () => {
      expect(LOG_LEVEL_COLORS.debug).toBeDefined();
      expect(LOG_LEVEL_COLORS.info).toBeDefined();
      expect(LOG_LEVEL_COLORS.warn).toBeDefined();
      expect(LOG_LEVEL_COLORS.error).toBeDefined();
    });
  });
}); 