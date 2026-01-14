import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('DefaultConfig', () => {
  let originalNodeEnv: string | undefined;
  let originalSecret: string | undefined;

  beforeEach(() => {
    // Save original environment variables
    originalNodeEnv = process.env.NODE_ENV;
    originalSecret = process.env.SECRET;

    // Clear the module cache to ensure fresh imports
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original environment variables
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalSecret === undefined) {
      delete process.env.SECRET;
    } else {
      process.env.SECRET = originalSecret;
    }
  });

  describe('Session Secret Handling', () => {
    it('should use SECRET environment variable when provided in development', async () => {
      process.env.NODE_ENV = 'development';
      process.env.SECRET = 'my-dev-secret';

      const { defaultConfig } = await import('../../src/Config/DefaultConfig');

      expect(defaultConfig.runtime?.session?.secret).toBe('my-dev-secret');
    });

    it('should use SECRET environment variable when provided in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.SECRET = 'my-production-secret-at-least-32-characters-long';

      const { defaultConfig } = await import('../../src/Config/DefaultConfig');

      expect(defaultConfig.runtime?.session?.secret).toBe('my-production-secret-at-least-32-characters-long');
    });

    it('should generate random hash when SECRET is not provided in development', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.SECRET;

      const { defaultConfig } = await import('../../src/Config/DefaultConfig');

      expect(defaultConfig.runtime?.session?.secret).toBeDefined();
      expect(typeof defaultConfig.runtime?.session?.secret).toBe('string');
      expect(defaultConfig.runtime?.session?.secret?.length).toBeGreaterThan(0);
    });

    it('should throw error when SECRET is not provided in production', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.SECRET;

      await expect(async () => {
        await import('../../src/Config/DefaultConfig');
      }).rejects.toThrow(
        'SESSION SECRET ERROR: In production mode, you must set a strong SECRET environment variable. ' +
          'Using a dynamically generated secret is insecure and will cause session data to be lost on server restart. ' +
          'Please set the SECRET environment variable to a strong, randomly generated string (at least 32 characters). ' +
          'Example: SECRET=your-strong-random-secret-here-at-least-32-chars',
      );
    });

    it('should include helpful guidance in production error message', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.SECRET;

      try {
        await import('../../src/Config/DefaultConfig');
        throw new Error('Expected error to be thrown');
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        expect(errorMessage).toContain('SESSION SECRET ERROR');
        expect(errorMessage).toContain('production mode');
        expect(errorMessage).toContain('SECRET environment variable');
      }
    });

    it('should mention security implications in error message', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.SECRET;

      try {
        await import('../../src/Config/DefaultConfig');
        throw new Error('Expected error to be thrown');
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        expect(errorMessage).toContain('dynamically generated secret is insecure');
        expect(errorMessage).toContain('session data to be lost on server restart');
      }
    });

    it('should provide example in error message', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.SECRET;

      try {
        await import('../../src/Config/DefaultConfig');
        throw new Error('Expected error to be thrown');
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        expect(errorMessage).toContain('Example: SECRET=');
        expect(errorMessage).toContain('at least 32 characters');
      }
    });
  });

  describe('Session Configuration', () => {
    it('should have default session name', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.SECRET;

      const { defaultConfig } = await import('../../src/Config/DefaultConfig');

      expect(defaultConfig.runtime?.session?.name).toBe('vercube_session');
    });

    it('should have default session duration of 7 days', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.SECRET;

      const { defaultConfig } = await import('../../src/Config/DefaultConfig');

      expect(defaultConfig.runtime?.session?.duration).toBe(60 * 60 * 24 * 7);
    });
  });
});
