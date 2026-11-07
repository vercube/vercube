import { InternalServerError, UnauthorizedError } from '@vercube/core';
import { Container, initializeContainer } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { describe, expect, it, vi } from 'vitest';
import { AuthMiddleware } from '../src/Middleware/AuthMiddleware';
import { AuthProvider } from '../src/Services/AuthProvider';
import { ErrorAuthProvider } from './Mock/Middleware.mock';
import { MockAuthProvider } from './Mock/TestClass.mock';

describe('[auth] AuthMiddleware', () => {
  it('should be marked as an authentication requirement for the OpenAPI generator', () => {
    expect((AuthMiddleware as unknown as Record<symbol, unknown>)[Symbol.for('vercube.auth.middleware')]).toBe(true);
  });

  // Create a mock logger
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger;

  it('should use the default auth provider when no custom provider is specified', async () => {
    // Create a new container with the default AuthProvider
    const testContainer = new Container();
    testContainer.bind(AuthMiddleware);
    testContainer.bindMock(Logger, mockLogger);
    testContainer.bind(AuthProvider, MockAuthProvider);

    initializeContainer(testContainer);

    const testMiddleware = testContainer.get(AuthMiddleware);

    // Call the middleware with a mock request
    await testMiddleware.onRequest(new Request('http://localhost'), new Response(), { middlewareArgs: {} });

    // No error should be thrown
    expect(true).toBe(true);
  });

  it('should use a custom auth provider when specified', async () => {
    // Create a new container with a custom AuthProvider
    const testContainer = new Container();
    testContainer.bind(AuthMiddleware);
    testContainer.bind(ErrorAuthProvider);
    testContainer.bindMock(Logger, mockLogger);
    initializeContainer(testContainer);

    const testMiddleware = testContainer.get(AuthMiddleware);

    // Call the middleware with a mock request and custom provider
    try {
      await testMiddleware.onRequest({} as Request, {} as Response, {
        middlewareArgs: {
          provider: ErrorAuthProvider as unknown as typeof AuthProvider,
        },
      });

      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      // Should throw an UnauthorizedError
      expect(error).toBeInstanceOf(UnauthorizedError);
      expect((error as UnauthorizedError).message).toBe('Authentication failed');
    }
  });

  it('should throw InternalServerError when no auth provider is registered', async () => {
    // Create a new container without an AuthProvider
    const testContainer = new Container();
    testContainer.bind(AuthMiddleware);
    testContainer.bindMock(Logger, mockLogger);
    initializeContainer(testContainer);

    const testMiddleware = testContainer.get(AuthMiddleware);

    await expect(
      testMiddleware.onRequest({} as Request, {} as Response, {
        middlewareArgs: {},
      }),
    ).rejects.toBeInstanceOf(InternalServerError);
  });

  it('should throw InternalServerError when the custom provider is not registered', async () => {
    // The default provider is bound, the requested one is not
    const testContainer = new Container();
    testContainer.bind(AuthMiddleware);
    testContainer.bindMock(Logger, mockLogger);
    testContainer.bind(AuthProvider, MockAuthProvider);
    initializeContainer(testContainer);

    const testMiddleware = testContainer.get(AuthMiddleware);

    await expect(
      testMiddleware.onRequest({} as Request, {} as Response, {
        middlewareArgs: {
          provider: ErrorAuthProvider as unknown as typeof AuthProvider,
        },
      }),
    ).rejects.toThrow('auth provider "ErrorAuthProvider" is not registered');
  });

  describe('validate() result', () => {
    /**
     * Runs the middleware against a provider whose validate() returns `value`.
     */
    function run(value: unknown, isAsync = false): Promise<void> {
      class ResultProvider extends AuthProvider {
        public validate(): any {
          return isAsync ? Promise.resolve(value) : value;
        }

        public getCurrentUser(): null {
          return null;
        }
      }

      const testContainer = new Container();
      testContainer.bind(AuthMiddleware);
      testContainer.bindMock(Logger, mockLogger);
      testContainer.bind(AuthProvider, ResultProvider);
      initializeContainer(testContainer);

      return testContainer.get(AuthMiddleware).onRequest(new Request('http://localhost'), new Response(), { middlewareArgs: {} });
    }

    it('should allow a legacy null', async () => {
      await expect(run(null)).resolves.toBeUndefined();
    });

    it('should allow { user }', async () => {
      await expect(run({ user: { id: 1 } })).resolves.toBeUndefined();
    });

    it('should allow { user } even when the user itself is falsy', async () => {
      await expect(run({ user: null })).resolves.toBeUndefined();
    });

    it('should deny a string with UnauthorizedError', async () => {
      await expect(run('nope')).rejects.toThrow(UnauthorizedError);
      await expect(run('nope')).rejects.toThrow('nope');
    });

    it('should deny an empty string with UnauthorizedError', async () => {
      await expect(run('')).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('should deny { error } with UnauthorizedError', async () => {
      await expect(run({ error: 'bad token' })).rejects.toThrow('bad token');
      await expect(run({ error: 'bad token' })).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it.each([
      ['false', false, 'boolean'],
      ['undefined', undefined, 'undefined'],
      ['0', 0, 'number'],
      ['true', true, 'boolean'],
      ['{}', {}, 'empty object'],
      ['{ ok: false }', { ok: false }, 'object with keys: ok'],
      ['{ authenticated: false }', { authenticated: false }, 'object with keys: authenticated'],
      ['an array', [], 'array'],
    ])('should fail closed on %s', async (_label, value, type) => {
      for (const isAsync of [false, true]) {
        const promise = run(value, isAsync);
        await expect(promise).rejects.toBeInstanceOf(InternalServerError);
        await expect(promise).rejects.toThrow(`auth provider "ResultProvider" returned an invalid validate() result (${type})`);
      }
    });

    it('should not accept an inherited user property', async () => {
      await expect(run(Object.create({ user: { id: 1 } }))).rejects.toBeInstanceOf(InternalServerError);
    });
  });
});
