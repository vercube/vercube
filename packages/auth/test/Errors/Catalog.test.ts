import { InternalServerError, UnauthorizedError } from '@vercube/core';
import { Container, getErrorGuidance, initializeContainer } from '@vercube/di';
import { describe, expect, it } from 'vitest';
import { AuthMiddleware } from '../../src/Middleware/AuthMiddleware';
import { AuthProvider } from '../../src/Services/AuthProvider';

/**
 * Runs a function and returns what it threw.
 *
 * @param run - The function expected to throw
 * @returns The thrown value
 */
async function thrownBy(run: () => unknown): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }

  throw new Error('Expected the call to throw');
}

/** A provider that answers with whatever the test gave it. */
class ScriptedProvider extends AuthProvider<unknown> {
  public static result: unknown = null;

  public validate(): never {
    return ScriptedProvider.result as never;
  }

  public getCurrentUser(): null {
    return null;
  }
}

function createMiddleware(bindProvider: boolean = true): AuthMiddleware {
  const container = new Container();

  container.bindInstance(Container, container);
  container.bind(AuthMiddleware);

  if (bindProvider) {
    container.bind(AuthProvider, ScriptedProvider);
  }

  initializeContainer(container);

  return container.get(AuthMiddleware);
}

const run = (middleware: AuthMiddleware): Promise<void> =>
  middleware.onRequest(new Request('http://localhost'), new Response(), { middlewareArgs: {} });

describe('AuthErrors', () => {
  it('describes a request the provider refused, with the message of the provider', async () => {
    ScriptedProvider.result = 'Token expired';

    const error = (await thrownBy(() => run(createMiddleware()))) as UnauthorizedError;

    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.name).toBe('UnauthorizedError');
    expect(error.status).toBe(401);
    expect(error.message).toBe('Token expired');
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_AUTH_UNAUTHORIZED');
    expect(getErrorGuidance(error)?.expose).toBeUndefined();
    expect(Object.keys(error)).not.toContain('code');
  });

  it('keeps the message of a refusal without a reason as it was', async () => {
    ScriptedProvider.result = { error: 42 };

    const error = (await thrownBy(() => run(createMiddleware()))) as UnauthorizedError;

    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.status).toBe(401);
    expect(error.message).toBe(new UnauthorizedError().message);
    expect(Object.hasOwn(error, 'message')).toBe(Object.hasOwn(new UnauthorizedError(), 'message'));
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_AUTH_UNAUTHORIZED');
  });

  it('describes a provider that is not bound', async () => {
    const error = (await thrownBy(() => run(createMiddleware(false)))) as InternalServerError;

    expect(error).toBeInstanceOf(InternalServerError);
    expect(error.status).toBe(500);
    expect(error.message).toBe('AuthMiddleware: auth provider "AuthProvider" is not registered in the container');
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_AUTH_PROVIDER_NOT_REGISTERED');
    expect(getErrorGuidance(error)?.fix).toContain('bind(AuthProvider');
  });

  it('describes a provider that answered with something else', async () => {
    ScriptedProvider.result = { ok: true };

    const error = (await thrownBy(() => run(createMiddleware()))) as InternalServerError;

    expect(error).toBeInstanceOf(InternalServerError);
    expect(error.status).toBe(500);
    expect(error.message).toBe(
      'AuthMiddleware: auth provider "ScriptedProvider" returned an invalid validate() result (object with keys: ok); expected null, a string, { user } or { error }',
    );
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_AUTH_PROVIDER_RESULT_INVALID');
  });
});
