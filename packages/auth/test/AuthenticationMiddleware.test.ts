import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Container } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { UnauthorizedError } from '@vercube/core';
import { AuthenticationMiddleware } from '../src/Middleware/AuthenticationMiddleware';
import { AuthenticationProvider } from '../src/Services/AuthenticationProvider';

class MockAuthenticationProvider extends AuthenticationProvider {
  constructor(private shouldSucceed: boolean = true) {
    super();
  }

  public async authenticate(): Promise<string | null> {
    return this.shouldSucceed ? null : 'Authentication failed';
  }
}

describe('AuthenticationMiddleware', () => {
  let container: Container;
  let middleware: AuthenticationMiddleware;
  let logger: Logger;

  beforeEach(() => {
    container = new Container();
    container.bindInstance(Container, container);
    container.bind(AuthenticationMiddleware);

    container.bindMock(Logger, {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    });

    middleware = container.get(AuthenticationMiddleware);
    logger = container.get(Logger);
  });

  it('should warn when no provider is registered', async () => {
    const consoleWarnSpy = vi.spyOn(logger, 'warn');
    await middleware.onRequest(new Request('http://localhost'), new Response(), {});

    expect(consoleWarnSpy).toHaveBeenCalledWith('AuthenticationMiddleware::AuthenticationProvider is not registered');
  });

  it('should succeed when authentication is successful', async () => {
    const provider = new MockAuthenticationProvider(true);
    container.bindInstance(AuthenticationProvider, provider);

    await expect(middleware.onRequest(new Request('http://localhost'), new Response(), {}))
      .resolves
      .not
      .toThrow();
  });

  it('should throw UnauthorizedError when authentication fails', async () => {
    const provider = new MockAuthenticationProvider(false);
    container.bindInstance(AuthenticationProvider, provider);

    await expect(middleware.onRequest(new Request('http://localhost'), new Response(), {}))
      .rejects
      .toThrow(UnauthorizedError);
  });

  it('should use custom provider from middleware args when specified', async () => {
    const customProvider = new MockAuthenticationProvider(false);
    container.bindInstance(AuthenticationProvider, customProvider);

    await expect(middleware.onRequest(
      new Request('http://localhost'),
      new Response(),
      { middlewareArgs: { provider: AuthenticationProvider } },
    ))
      .rejects
      .toThrow(UnauthorizedError);
  });
}); 