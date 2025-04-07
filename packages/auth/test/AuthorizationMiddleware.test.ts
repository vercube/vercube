import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Container } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { ForbiddenError } from '@vercube/core';
import { AuthorizationMiddleware } from '../src/Middleware/AuthorizationMiddleware';
import { AuthorizationProvider } from '../src/Services/AuthorizationProvider';

interface TestParams {
  role: string;
}

class MockAuthorizationProvider extends AuthorizationProvider<TestParams> {
  constructor(private shouldSucceed: boolean = true) {
    super();
  }

  public async authorize(): Promise<string | null> {
    return this.shouldSucceed ? null : 'Authorization failed';
  }
}

describe('AuthorizationMiddleware', () => {
  let container: Container;
  let middleware: AuthorizationMiddleware<TestParams>;
  let logger: Logger;

  beforeEach(() => {
    container = new Container();
    container.bindInstance(Container, container);
    container.bind(AuthorizationMiddleware);

    container.bindMock(Logger, {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    });

    middleware = container.get(AuthorizationMiddleware);
    logger = container.get(Logger);
  });

  it('should warn when no provider is registered', async () => {
    const consoleWarnSpy = vi.spyOn(logger, 'warn');
    await middleware.onRequest(
      new Request('http://localhost'),
      new Response(),
      { middlewareArgs: { options: {}, params: { role: 'admin' } } },
    );

    expect(consoleWarnSpy).toHaveBeenCalledWith('AuthorizationMiddleware::AuthorizationProvider is not registered');
  });

  it('should succeed when authorization is successful', async () => {
    const provider = new MockAuthorizationProvider(true);
    container.bindInstance(AuthorizationProvider, provider);

    await expect(middleware.onRequest(
      new Request('http://localhost'),
      new Response(),
      { middlewareArgs: { options: {}, params: { role: 'admin' } } },
    ))
      .resolves
      .not
      .toThrow();
  });

  it('should throw ForbiddenError when authorization fails', async () => {
    const provider = new MockAuthorizationProvider(false);
    container.bindInstance(AuthorizationProvider, provider);

    await expect(middleware.onRequest(
      new Request('http://localhost'),
      new Response(),
      { middlewareArgs: { options: {}, params: { role: 'admin' } } },
    ))
      .rejects
      .toThrow(ForbiddenError);
  });

  it('should use custom provider from middleware args when specified', async () => {
    const customProvider = new MockAuthorizationProvider(false);
    container.bindInstance(AuthorizationProvider, customProvider);

    await expect(middleware.onRequest(
      new Request('http://localhost'),
      new Response(),
      {
        middlewareArgs: {
          options: { provider: AuthorizationProvider },
          params: { role: 'admin' },
        },
      },
    ))
      .rejects
      .toThrow(ForbiddenError);
  });
}); 