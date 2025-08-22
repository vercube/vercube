import { describe, it, expect, vi } from 'vitest';
import { Container, initializeContainer } from '@vercube/di';
import { UnauthorizedError } from '@vercube/core';
import { Logger } from '@vercube/logger';
import { AuthMiddleware } from '../src/Middleware/AuthMiddleware';
import { AuthProvider } from '../src/Services/AuthProvider';
import { MockAuthProvider } from './Mock/TestClass.mock';
import { ErrorAuthProvider } from './Mock/Middleware.mock';

describe('[auth] AuthMiddleware', () => {
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
    await testMiddleware.onRequest(
      new Request('http://localhost'),
      new Response(),
      { middlewareArgs: {} },
    );

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
      expect((error as UnauthorizedError).message).toBe(
        'Authentication failed',
      );
    }
  });

  it('should log a warning when no auth provider is registered', async () => {
    // Create a new container without an AuthProvider
    const testContainer = new Container();
    testContainer.bind(AuthMiddleware);
    testContainer.bindMock(Logger, mockLogger);
    initializeContainer(testContainer);

    const testMiddleware = testContainer.get(AuthMiddleware);

    // Call the middleware with a mock request
    await testMiddleware.onRequest({} as Request, {} as Response, {
      middlewareArgs: {},
    });

    // Should log a warning
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'AuthMiddleware::AuthProvider is not registered',
    );
  });
});
